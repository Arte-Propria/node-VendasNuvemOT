/**
 * Backfill dos pedidos de LOJA FÍSICA / CHATBOT já gravados em orders_shop.
 * ---------------------------------------------------------------------------
 * Três defeitos herdados dos caminhos de escrita anteriores, todos corrigidos aqui a partir
 * do dump legado (pedidos_<loja>), que é a fonte de verdade:
 *
 *  1) id_cli errado ou não-serial
 *     - A rota /order/:store resolvia o cliente pelo E-MAIL. Como toda filial física chega
 *       com o mesmo e-mail genérico, todas caíam no cliente mais antigo com aquele e-mail
 *       (um registro legado de CPF 99999999999 chamado "TURIASSU") — e a tela mostrava
 *       TURIASSU para pedidos de GABRIEL, MOEMA e ANALIA.
 *     - migrateImportMissingOrders.js gravou `id_cli` como o CPF cru do pedido, em vez do
 *       id serial de `clientes`; hoje só resolve na tela graças a um fallback por CPF.
 *     Aqui o id_cli passa a ser sempre a FK serial: filial → cliente do CPF da filial;
 *     chatbot → cliente do operador (por e-mail), a mesma semântica de resolveClientByEmail.
 *
 *  2) products_detail sem `quantity`
 *     A coluna Produtos da tela legada imprimia `products[0].quantity`, que na loja física é
 *     a QUANTIDADE DE CLIENTES do dia. O mapper não copiava esse campo, então a tela nova
 *     mostrava o SKU placeholder ("PRODUTO") no lugar do número.
 *
 *  3) order_id fora da convenção
 *     Pedidos de loja física não têm `number` na Nuvemshop — o identificador real é o `token`
 *     (o número do PDV, que é o que a tela legada imprime). O pipeline já gera
 *     `token + offset da loja`, mas a rota /order/:store injetava o `number` do dump e ele
 *     vencia a precedência, deixando o mesmo tipo de pedido com duas convenções.
 *     Aqui as linhas com token REAL passam a `offset + token`; as de token placeholder
 *     ("999999" — chatbot e histórico) ficam no `number`, que é o que o legado já imprimia
 *     via owner_note.
 *
 * USO:
 *   node src/db/migrateLojaFisicaOrders.js --store=artepropria           # DRY-RUN
 *   node src/db/migrateLojaFisicaOrders.js --store=artepropria --apply   # APLICA
 *   node src/db/migrateLojaFisicaOrders.js --store=artepropria --apply --skip-order-id
 *
 * SEGURANÇA: dry-run padrão; --apply roda tudo em UMA transação (BEGIN/COMMIT) e aborta com
 * ROLLBACK a qualquer erro. A fonte (pedidos_<loja>) nunca é alterada. Idempotente: rodar de
 * novo não encontra nada para corrigir. O passo 3 revalida colisões de PK antes de escrever
 * e aborta se encontrar qualquer uma.
 */
import { pool } from "./db.js"
import {
	storeMapping,
	LOJA_FISICA_ORDER_ID_OFFSET,
	LOJA_FISICA_CPF_MAP,
	TOKEN_PLACEHOLDER,
	CPF_PLACEHOLDER
} from "./dataBaseQueryList.js"

const DUMP_TABLES = { outlet: "pedidos_outlet", artepropria: "pedidos_artepropria" }

const arg = (name, fallback = null) => {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
	return hit ? hit.slice(name.length + 3) : fallback
}

const APPLY = process.argv.includes("--apply")
const SKIP_ORDER_ID = process.argv.includes("--skip-order-id")
const STORE = arg("store", "artepropria")

// Filiais FÍSICAS = tudo no mapa menos o CHATBOT, que não é filial e resolve por e-mail do
// operador. Gerado do mesmo objeto que o pipeline usa, para não haver duas listas divergindo.
const FILIAIS = Object.entries(LOJA_FISICA_CPF_MAP).filter(([nome]) => nome !== "CHATBOT")
const FILIAL_CASE = FILIAIS.map(([nome, cpf]) => `WHEN '${nome}' THEN '${cpf}'`).join(" ")
const FILIAL_CPF_LIST = FILIAIS.map(([, cpf]) => `'${cpf}'`).join(", ")

// Para cada pedido de loja física em orders_shop, a linha correspondente do dump e o
// id_cli que ele DEVERIA ter. DISTINCT ON protege contra um eventual duplo casamento.
// $1 = offset da loja, $2 = store numérico (texto), $3 = CPF placeholder.
//
// O dump vem num CTE MATERIALIZED porque `token` é varchar e a maioria dos pedidos de
// ecommerce guarda ali um hash alfanumérico: um `token::numeric` solto na condição de JOIN
// é avaliado pelo planner em linhas que o regex ainda não filtrou, e estoura o cast. O CASE
// garante a ordem de avaliação, e MATERIALIZED impede o planner de reinliná-lo.
const PARES_CTE = (dumpTable) => `
  WITH dump AS MATERIALIZED (
    SELECT
      p.number,
      p.token,
      p.billing_business_name,
      p.billing_name,
      p.contact_email,
      p.customer,
      p.products,
      CASE
        WHEN p.token ~ '^[0-9]{1,15}$' AND p.token <> '${TOKEN_PLACEHOLDER}'
        THEN p.token::numeric
      END AS token_num
    FROM ${dumpTable} p
    WHERE p.storefront IN ('Loja', 'Loja Fisica')
  ),
  lf AS MATERIALIZED (
    SELECT os.order_id, os.id_cli AS id_cli_atual, os.storefront, os.products_detail
    FROM orders_shop os
    WHERE os.store::text = $2
      AND os.storefront IN ('Loja', 'Loja Fisica')
  ),
  -- Um OR na condição de JOIN força nested loop sobre o CTE (milhões de varreduras do
  -- tuplestore). Duas igualdades em UNION ALL deixam o planner usar hash join em cada
  -- ramo; o DISTINCT ON logo abaixo escolhe um casamento por pedido.
  pares_raw AS (
    SELECT 1 AS prioridade, lf.*, p.token, p.token_num, p.number,
           p.billing_business_name, p.billing_name, p.contact_email, p.customer, p.products
    FROM lf JOIN dump p ON lf.order_id = p.number::numeric
    UNION ALL
    SELECT 0 AS prioridade, lf.*, p.token, p.token_num, p.number,
           p.billing_business_name, p.billing_name, p.contact_email, p.customer, p.products
    FROM lf JOIN dump p ON lf.order_id = $1::numeric + p.token_num
  ),
  pares AS (
    SELECT DISTINCT ON (order_id)
      order_id,
      id_cli_atual,
      storefront,
      products_detail,
      token,
      token_num,
      number,
      UPPER(TRIM(COALESCE(billing_business_name, '')))  AS filial,
      billing_name,
      COALESCE(contact_email, customer->>'email')       AS email,
      CASE
        WHEN products->0->>'quantity' ~ '^[0-9]{1,9}$'
        THEN (products->0->>'quantity')::numeric
      END                                               AS qtd_clientes
    FROM pares_raw
    ORDER BY order_id, prioridade DESC
  ),
  alvo AS (
    SELECT
      pr.*,
      CASE pr.filial ${FILIAL_CASE} ELSE NULL END AS cpf_filial
    FROM pares pr
  ),
  -- Cliente da FILIAL física: o do CPF fictício da filial ("LOJA FÍSICA - <FILIAL>").
  cli_filial AS (
    SELECT c.cpf_cnpj_cli, MIN(c.id_cli) AS id_cli
    FROM clientes c
    WHERE c.cpf_cnpj_cli IN (${FILIAL_CPF_LIST})
    GROUP BY 1
  ),
  -- Cliente do CHATBOT: o do OPERADOR, pelo e-mail — mesma regra do resolveClientByEmail
  -- (MIN(id_cli) = o mais antigo; o CPF placeholder é excluído para não voltar ao
  -- registro legado "TURIASSU"). Resolvido em UM acesso a clientes, não por linha.
  emails AS (
    SELECT DISTINCT lower(email) AS email
    FROM alvo
    WHERE cpf_filial IS NULL AND billing_name = 'Cliente Loja Física' AND email IS NOT NULL
  ),
  cli_email AS (
    SELECT lower(c.email_cli) AS email, MIN(c.id_cli) AS id_cli
    FROM clientes c
    JOIN emails e ON lower(c.email_cli) = e.email
    WHERE c.cpf_cnpj_cli IS NULL OR c.cpf_cnpj_cli <> $3
    GROUP BY 1
  ),
  resolvido AS (
    SELECT
      a.*,
      COALESCE(cf.id_cli, ce.id_cli)::text AS id_cli_novo,
      -- Nome que a tela DEVE mostrar para este pedido.
      'LOJA FÍSICA - ' || COALESCE(
        NULLIF(a.filial, ''),
        CASE WHEN a.billing_name = 'Cliente Loja Física' THEN 'CHATBOT' END
      ) AS nome_esperado,
      -- Cliente para o qual o id_cli atual aponta HOJE (NULL quando o valor não é um
      -- id serial de clientes — caso das linhas que guardam o CPF cru).
      cat.nome_cli AS nome_atual
    FROM alvo a
    LEFT JOIN cli_filial cf ON cf.cpf_cnpj_cli = a.cpf_filial
    LEFT JOIN cli_email ce
      ON a.cpf_filial IS NULL
     AND a.billing_name = 'Cliente Loja Física'
     AND ce.email = lower(a.email)
    LEFT JOIN clientes cat ON cat.id_cli::text = a.id_cli_atual
  ),
  -- Só corrigimos o que está REALMENTE errado na tela: id_cli que não é uma FK serial
  -- (guarda o CPF cru) ou que aponta para um cliente de nome diferente do esperado.
  -- Sem esse filtro, pedidos de chatbot seriam remanejados entre dois clientes
  -- "LOJA FÍSICA - CHATBOT" equivalentes, sem mudar nada na tela.
  corrigir AS (
    SELECT r.*
    FROM resolvido r
    WHERE r.id_cli_novo IS NOT NULL
      AND r.id_cli_novo IS DISTINCT FROM r.id_cli_atual
      AND (r.nome_atual IS NULL OR r.nome_atual IS DISTINCT FROM r.nome_esperado)
  )
`

const params = (offset, storeNum) => [String(offset), String(storeNum), CPF_PLACEHOLDER]

async function main() {
	const dumpTable = DUMP_TABLES[STORE]
	const storeNum = storeMapping.nameToNumeric[STORE]
	const offset = LOJA_FISICA_ORDER_ID_OFFSET[storeNum]
	if (!dumpTable || !storeNum || !offset) {
		console.error(`Loja desconhecida: ${STORE}. Use outlet ou artepropria.`)
		process.exitCode = 1
		return
	}

	const client = await pool.connect()
	console.log(
		`\n=== Backfill pedidos loja física → orders_shop — modo: ${APPLY ? "APLICAR" : "DRY-RUN (somente leitura)"} ===`
	)
	console.log(`loja=${STORE} (${storeNum})  offset=${offset}  dump=${dumpTable}\n`)

	try {
		if (APPLY) await client.query("BEGIN")

		// ------------------------------------------------------------------ diagnóstico
		const cobertura = await client.query(
			`${PARES_CTE(dumpTable)}
			 SELECT
			   (SELECT COUNT(*) FROM orders_shop
			     WHERE store::text = $2 AND storefront IN ('Loja','Loja Fisica'))::int AS total,
			   (SELECT COUNT(*) FROM resolvido)::int                                    AS casados,
			   (SELECT COUNT(*) FROM resolvido WHERE id_cli_novo IS NULL)::int          AS sem_cliente_alvo`,
			params(offset, storeNum)
		)
		const { total, casados, sem_cliente_alvo } = cobertura.rows[0]
		console.log(`Pedidos de loja física na base nova: ${total}`)
		console.log(`  com correspondência no dump:       ${casados}`)
		console.log(`  órfãos (sem linha no dump):        ${total - casados}  → ignorados`)
		console.log(`  sem cliente-alvo resolvível:       ${sem_cliente_alvo}  → ignorados\n`)

		// ------------------------------------------------------------------ passo 1: id_cli
		const idCliSql = `${PARES_CTE(dumpTable)}
		  SELECT order_id, id_cli_atual, id_cli_novo, nome_atual, nome_esperado, storefront
		  FROM corrigir
		  ORDER BY order_id`
		const idCli = await client.query(idCliSql, params(offset, storeNum))
		console.log(`[1/3] id_cli a corrigir: ${idCli.rowCount}`)
		idCli.rows.slice(0, 20).forEach((r) =>
			console.log(
				`    order_id=${r.order_id} ${r.storefront}: id_cli ${r.id_cli_atual} → ${r.id_cli_novo} ` +
				`("${r.nome_atual ?? "sem cliente"}" → "${r.nome_esperado}")`
			)
		)
		if (idCli.rowCount > 20) console.log(`    … e mais ${idCli.rowCount - 20} linha(s)`)

		if (APPLY && idCli.rowCount > 0) {
			const res = await client.query(
				`${PARES_CTE(dumpTable)}
				 UPDATE orders_shop os
				    SET id_cli = r.id_cli_novo
				   FROM corrigir r
				  WHERE os.order_id = r.order_id`,
				params(offset, storeNum)
			)
			console.log(`    ✅ ${res.rowCount} linha(s) atualizada(s).`)
		}

		// -------------------------------------------------------- passo 2: quantity no detail
		// jsonb_set na posição 0: a loja física tem exatamente uma linha de produto
		// (o placeholder), que é onde o legado guarda a quantidade de clientes.
		const qtdSql = `${PARES_CTE(dumpTable)}
		  SELECT order_id, qtd_clientes,
		         (products_detail->0->>'quantity') AS qtd_atual
		  FROM resolvido
		  WHERE qtd_clientes IS NOT NULL
		    AND jsonb_typeof(products_detail) = 'array'
		    AND jsonb_array_length(products_detail) > 0
		    AND (products_detail->0->>'quantity') IS DISTINCT FROM qtd_clientes::text
		  ORDER BY order_id`
		const qtd = await client.query(qtdSql, params(offset, storeNum))
		console.log(`\n[2/3] products_detail[0].quantity a preencher: ${qtd.rowCount}`)
		qtd.rows.slice(0, 5).forEach((r) =>
			console.log(`    order_id=${r.order_id}: quantity ${r.qtd_atual ?? "—"} → ${r.qtd_clientes}`)
		)
		if (qtd.rowCount > 5) console.log(`    … e mais ${qtd.rowCount - 5} linha(s)`)

		if (APPLY && qtd.rowCount > 0) {
			const res = await client.query(
				`${PARES_CTE(dumpTable)}
				 UPDATE orders_shop os
				    SET products_detail = jsonb_set(
				          os.products_detail, '{0,quantity}', to_jsonb(r.qtd_clientes), true)
				   FROM resolvido r
				  WHERE os.order_id = r.order_id
				    AND r.qtd_clientes IS NOT NULL
				    AND jsonb_typeof(os.products_detail) = 'array'
				    AND jsonb_array_length(os.products_detail) > 0
				    AND (os.products_detail->0->>'quantity') IS DISTINCT FROM r.qtd_clientes::text`,
				params(offset, storeNum)
			)
			console.log(`    ✅ ${res.rowCount} linha(s) atualizada(s).`)
		}

		// ------------------------------------------------------------------ passo 3: order_id
		if (SKIP_ORDER_ID) {
			console.log("\n[3/3] order_id: pulado (--skip-order-id).")
		} else {
			// Só linhas com token REAL. Token placeholder não identifica pedido: 1.5k pedidos
			// distintos compartilham "999999" e todos colapsariam na mesma PK.
			const novoIdSql = `${PARES_CTE(dumpTable)}
			  SELECT order_id, token, ($1::numeric + token_num) AS order_id_novo
			  FROM resolvido
			  WHERE token_num IS NOT NULL
			    AND order_id IS DISTINCT FROM ($1::numeric + token_num)`
			const novos = await client.query(novoIdSql, params(offset, storeNum))
			console.log(`\n[3/3] order_id a migrar para offset+token: ${novos.rowCount}`)

			// Guardas: o novo id não pode repetir entre si nem colidir com PK já existente.
			const duplicados = new Map()
			novos.rows.forEach((r) => {
				const k = String(r.order_id_novo)
				duplicados.set(k, (duplicados.get(k) ?? 0) + 1)
			})
			const repetidos = [...duplicados.entries()].filter(([, n]) => n > 1)

			// Colisão com PK já existente: o novo id não pode pertencer a outro pedido.
			const colisao = await client.query(
				`${PARES_CTE(dumpTable)}
				 SELECT r.order_id, ($1::numeric + r.token_num) AS order_id_novo
				   FROM resolvido r
				  WHERE r.token_num IS NOT NULL
				    AND r.order_id IS DISTINCT FROM ($1::numeric + r.token_num)
				    AND EXISTS (
				      SELECT 1 FROM orders_shop x
				       WHERE x.order_id = $1::numeric + r.token_num
				    )`,
				params(offset, storeNum)
			)

			if (repetidos.length > 0 || colisao.rowCount > 0) {
				console.error(
					`\n❌ ABORTADO: ${repetidos.length} novo(s) order_id repetido(s) entre si e ` +
					`${colisao.rowCount} colidindo com linha existente. Nada foi alterado.`
				)
				repetidos.slice(0, 10).forEach(([id, n]) => console.error(`    ${id} × ${n}`))
				colisao.rows.slice(0, 10).forEach((r) =>
					console.error(`    ${r.order_id} → ${r.order_id_novo} (já existe)`)
				)
				throw new Error("colisão de order_id")
			}
			console.log("    colisões: 0 (entre si e com linhas existentes)")
			novos.rows.slice(0, 5).forEach((r) =>
				console.log(`    order_id ${r.order_id} → ${r.order_id_novo} (token ${r.token})`)
			)
			if (novos.rowCount > 5) console.log(`    … e mais ${novos.rowCount - 5} linha(s)`)

			if (APPLY && novos.rowCount > 0) {
				const res = await client.query(
					`${PARES_CTE(dumpTable)}
					 UPDATE orders_shop os
					    SET order_id = $1::numeric + r.token_num
					   FROM resolvido r
					  WHERE os.order_id = r.order_id
					    AND r.token_num IS NOT NULL
					    AND os.order_id IS DISTINCT FROM ($1::numeric + r.token_num)`,
					params(offset, storeNum)
				)
				console.log(`    ✅ ${res.rowCount} linha(s) atualizada(s).`)
			}
		}

		if (APPLY) {
			await client.query("COMMIT")
			console.log("\n✅ COMMIT. Concluído.\n")
		} else {
			console.log("\nDRY-RUN: nada foi alterado. Rode com --apply para aplicar.\n")
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
