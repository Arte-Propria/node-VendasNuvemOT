/**
 * Migração: orders_shop.shipping_cost_owner (+ backfill do dump legado)
 * ---------------------------------------------------------------------------
 * Contexto: a aba Estatísticas precisa de duas métricas que o `filterOrders` legado
 * calculava direto sobre pedidos_<loja>:
 *   totalNovosClientes              = Σ shipping_cost_owner (pagos, storefront 'Loja Fisica')
 *   totalRecorrentesClientesChatbot = Σ shipping_cost_owner (pagos, storefront 'Loja')
 * O campo só existe no dump: orders_shop guarda apenas `shipping_cost`, mapeado de
 * `shipping_cost_customer` — que nos pedidos MANUAIS é sempre 0. Nos pedidos manuais o
 * popup "Cadastrar pedido" reaproveita shipping_cost_owner para o total de vendas de
 * clientes; nos pedidos de ecommerce ele é o frete pago pela loja.
 *
 * Este script:
 *   1) cria a coluna `shipping_cost_owner` (idempotente, ADD COLUMN IF NOT EXISTS);
 *   2) faz o backfill a partir de pedidos_outlet / pedidos_artepropria (mesmo banco).
 *
 * TIPO: double precision, igual a orders_shop.shipping_cost (e não numeric, do dump).
 * O driver pg devolve `numeric` como STRING — a soma no front viraria concatenação
 * silenciosa. O valor já entra no pipeline como double (shippingCost/toNumber), e a
 * precisão de float8 é folgada para reais com 2 casas nesta ordem de grandeza.
 *
 * JOIN: a MESMA dupla convenção de order_id de migrateLojaFisicaOrders.js —
 *   `offset da loja + token` (loja física com token real: convenção canônica do pipeline)
 *   e `number` (chatbot/histórico, cujo token é o placeholder). As duas igualdades entram
 * em UNION ALL: um OR na condição de JOIN força nested loop sobre o CTE (milhões de
 * varreduras do tuplestore); duas igualdades deixam o planner usar hash join em cada ramo,
 * e o DISTINCT ON escolhe um casamento por pedido, preferindo o `number`. O cast do token
 * vai dentro de um CASE (e não guardado por AND) porque `token` é varchar e pedidos de
 * ecommerce guardam ali um hash: com AND o planner avalia o cast antes do regex e estoura.
 * O ramo do token é restrito a storefront de loja física — um token numérico por acaso num
 * pedido de ecommerce poderia casar com o order_id sintético de OUTRO pedido.
 *
 * USO:
 *   node src/db/migrateShippingCostOwner.js                             # DRY-RUN (só cria a coluna)
 *   node src/db/migrateShippingCostOwner.js --store=artepropria --apply # APLICA
 *   node src/db/migrateShippingCostOwner.js --store=all --apply
 *   node src/db/migrateShippingCostOwner.js --apply --overwrite         # reconcilia divergências
 *
 * SEGURANÇA:
 *   - A coluna é criada sempre (ADD COLUMN IF NOT EXISTS não altera dados existentes) —
 *     as próprias queries do dry-run a referenciam.
 *   - O backfill só roda com --apply, em UMA transação (BEGIN/COMMIT), com ROLLBACK a
 *     qualquer erro.
 *   - Idempotente: por padrão só preenche onde shipping_cost_owner IS NULL, nunca
 *     sobrescreve o que o pipeline gravou. --overwrite troca o critério para
 *     IS DISTINCT FROM (use só para reconciliar contra o dump).
 *   - A fonte (pedidos_<loja>) nunca é alterada. Nenhuma outra coluna é escrita.
 */
import { pool } from "./db.js"
import {
	storeMapping,
	LOJA_FISICA_ORDER_ID_OFFSET,
	TOKEN_PLACEHOLDER
} from "./dataBaseQueryList.js"

const DUMP_TABLES = { outlet: "pedidos_outlet", artepropria: "pedidos_artepropria" }

const arg = (name, fallback = null) => {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
	return hit ? hit.slice(name.length + 3) : fallback
}

const APPLY = process.argv.includes("--apply")
const OVERWRITE = process.argv.includes("--overwrite")
const STORE = arg("store", "artepropria")

const addColumnSql = `
  ALTER TABLE orders_shop
  ADD COLUMN IF NOT EXISTS shipping_cost_owner double precision
`

// Critério de idempotência. Padrão: só preenche buraco (nunca sobrescreve o pipeline).
const CRITERIO = OVERWRITE
	? "valor_atual IS DISTINCT FROM valor"
	: "valor_atual IS NULL"

// Para cada pedido da loja em orders_shop, a linha correspondente do dump e o
// shipping_cost_owner que ele deveria ter.
// $1 = offset da loja, $2 = store numérico (texto).
const PARES_CTE = (dumpTable) => `
  WITH dump AS MATERIALIZED (
    SELECT
      p.number,
      p.shipping_cost_owner::double precision AS valor,
      CASE
        WHEN p.storefront IN ('Loja', 'Loja Fisica')
         AND p.token ~ '^[0-9]{1,15}$'
         AND p.token <> '${TOKEN_PLACEHOLDER}'
        THEN p.token::numeric
      END AS token_num
    FROM ${dumpTable} p
    WHERE p.shipping_cost_owner IS NOT NULL
  ),
  alvo AS MATERIALIZED (
    SELECT os.order_id, os.storefront, os.payment_status, os.created_at,
           os.shipping_cost_owner AS valor_atual
    FROM orders_shop os
    WHERE os.store::text = $2
  ),
  pares_raw AS (
    SELECT 1 AS prioridade, a.order_id, a.storefront, a.payment_status, a.created_at,
           a.valor_atual, d.valor
    FROM alvo a JOIN dump d ON a.order_id = d.number::numeric
    UNION ALL
    SELECT 0 AS prioridade, a.order_id, a.storefront, a.payment_status, a.created_at,
           a.valor_atual, d.valor
    FROM alvo a JOIN dump d ON a.order_id = $1::numeric + d.token_num
  ),
  pares AS (
    SELECT DISTINCT ON (order_id)
      order_id, storefront, payment_status, created_at, valor_atual, valor
    FROM pares_raw
    ORDER BY order_id, prioridade DESC
  ),
  corrigir AS (
    SELECT * FROM pares WHERE ${CRITERIO}
  )
`

const params = (offset, storeNum) => [String(offset), String(storeNum)]

async function main() {
	const nomes = STORE === "all" ? Object.keys(DUMP_TABLES) : [STORE]
	const lojas = []
	for (const nome of nomes) {
		const dumpTable = DUMP_TABLES[nome]
		const storeNum = storeMapping.nameToNumeric[nome]
		const offset = LOJA_FISICA_ORDER_ID_OFFSET[storeNum]
		if (!dumpTable || !storeNum || !offset) {
			console.error(`Loja desconhecida: ${nome}. Use outlet, artepropria ou all.`)
			process.exitCode = 1
			return
		}
		lojas.push({ nome, dumpTable, storeNum, offset })
	}

	const client = await pool.connect()
	console.log(
		`\n=== Migração orders_shop.shipping_cost_owner — modo: ${APPLY ? "APLICAR" : "DRY-RUN (só cria a coluna)"} ===`
	)
	console.log(`lojas=${lojas.map((l) => l.nome).join(", ")}  critério=${CRITERIO}\n`)

	try {
		// O pool aplica statement_timeout de 2min (padrão Supabase); o backfill varre o
		// dump inteiro e precisa de folga. Vale só para esta sessão.
		await client.query("SET statement_timeout = '600s'")

		// 0) Coluna (idempotente; não altera dados existentes). Criada mesmo em dry-run
		//    porque as queries de relatório abaixo já a referenciam.
		await client.query(addColumnSql)
		console.log(
			"Coluna shipping_cost_owner garantida (ADD COLUMN IF NOT EXISTS, double precision).\n"
		)

		if (APPLY) await client.query("BEGIN")

		let totalAGravar = 0
		for (const { nome, dumpTable, storeNum, offset } of lojas) {
			console.log(`--- [${nome}] store=${storeNum} offset=${offset} dump=${dumpTable}`)

			// ------------------------------------------------------------ diagnóstico
			const cobertura = await client.query(
				`${PARES_CTE(dumpTable)}
				 SELECT
				   (SELECT COUNT(*) FROM alvo)::int                                  AS total,
				   (SELECT COUNT(*) FROM pares)::int                                 AS casados,
				   (SELECT COUNT(*) FROM pares WHERE valor_atual IS NOT NULL)::int   AS ja_preenchidos,
				   (SELECT COUNT(*) FROM corrigir)::int                              AS a_gravar,
				   (SELECT ROUND(SUM(valor)::numeric, 2) FROM corrigir)              AS soma_a_gravar`,
				params(offset, storeNum)
			)
			const { total, casados, ja_preenchidos, a_gravar, soma_a_gravar } = cobertura.rows[0]
			console.log(`  pedidos da loja em orders_shop:      ${total}`)
			console.log(`    com shipping_cost_owner no dump:   ${casados}`)
			console.log(`    órfãos (sem linha no dump):        ${total - casados}  → ignorados`)
			console.log(`    já preenchidos em orders_shop:     ${ja_preenchidos}`)
			console.log(`    a gravar:                          ${a_gravar}  (Σ ${soma_a_gravar ?? 0})`)
			totalAGravar += a_gravar

			// ------------------------------------------------- quebra por storefront
			// É esta quebra que a aba Estatísticas soma: 'Loja Fisica' → totalNovosClientes,
			// 'Loja' → totalRecorrentesClientesChatbot.
			if (a_gravar > 0) {
				const porStorefront = await client.query(
					`${PARES_CTE(dumpTable)}
					 SELECT COALESCE(storefront, '(sem storefront)') AS storefront,
					        COUNT(*)::int                            AS n,
					        ROUND(SUM(valor)::numeric, 2)            AS soma
					 FROM corrigir
					 GROUP BY 1
					 ORDER BY soma DESC NULLS LAST`,
					params(offset, storeNum)
				)
				porStorefront.rows.forEach((r) =>
					console.log(
						`      ${r.storefront.padEnd(20)} ${String(r.n).padStart(6)} pedido(s)  Σ ${r.soma}`
					)
				)

				const amostra = await client.query(
					`${PARES_CTE(dumpTable)}
					 SELECT order_id, storefront, payment_status, created_at, valor_atual, valor
					 FROM corrigir
					 WHERE valor <> 0
					 ORDER BY valor DESC
					 LIMIT 5`,
					params(offset, storeNum)
				)
				amostra.rows.forEach((r) =>
					console.log(
						`      order_id=${r.order_id} ${r.storefront}/${r.payment_status} ` +
							`${String(r.created_at).slice(0, 10)}: ${r.valor_atual ?? "—"} → ${r.valor}`
					)
				)
			}

			// ------------------------------------------------------------------ update
			if (APPLY && a_gravar > 0) {
				const res = await client.query(
					`${PARES_CTE(dumpTable)}
					 UPDATE orders_shop os
					    SET shipping_cost_owner = c.valor
					   FROM corrigir c
					  WHERE os.order_id = c.order_id
					    AND os.store::text = $2`,
					params(offset, storeNum)
				)
				console.log(`  ✅ ${res.rowCount} linha(s) atualizada(s).`)
			}
			console.log("")
		}

		console.log(`TOTAL a gravar: ${totalAGravar}`)

		if (APPLY) {
			await client.query("COMMIT")
			console.log("\n✅ COMMIT. Concluído.\n")
		} else {
			console.log(
				"\nDRY-RUN: coluna criada; backfill NÃO aplicado. Rode com --apply para preencher.\n"
			)
		}
	} catch (err) {
		try {
			await client.query("ROLLBACK")
		} catch {
			// conexão pode já estar inválida; o release abaixo descarta o client
		}
		console.error("\n❌ ERRO — ROLLBACK aplicado:", err.message, "\n")
		process.exitCode = 1
	} finally {
		client.release()
		await pool.end()
	}
}

main()
