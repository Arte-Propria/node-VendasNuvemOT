/**
 * Migração: congela o custo da venda em orders_shop.products_detail[].cost
 * ------------------------------------------------------------------------
 * Contexto: o card "Custo de Produto" (Estatísticas → DataSectionCosts) somava,
 * no legado, o campo `cost` de CADA LINHA do pedido — um snapshot gravado pela
 * Nuvemshop no momento da venda e persistido verbatim em
 * pedidos_<loja>.products (jsonb).
 *
 * Na migração para orders_shop esse campo foi perdido: `products` guarda só os
 * SKUs e `products_detail` copiava `price` mas não `cost`. O front passou a
 * resolver o custo pelo CATÁLOGO ATUAL (categorias.custo_categoria), o que
 * inflava o card em ~4,7% no outlet (2026: R$ 410.501 contra R$ 391.938 do
 * legado), por dois motivos:
 *   1) linhas com `cost: null` no dump — o legado somava 0, o catálogo soma cheio;
 *   2) reprecificação retroativa — upsertProduct sobrescreve custo_categoria a
 *      cada webhook e migrateProductCost.js achatou o catálogo para o custo mais
 *      recente por SKU.
 *
 * Este script preenche `cost` linha a linha em products_detail a partir do dump.
 *
 * ESTRATÉGIA
 *   - Join pedidos_<loja>.number = orders_shop.order_id (mesma chave de
 *     migrateOrdersProductsDetail.js; comparação por ::text porque order_id é
 *     bigint/string e number é integer).
 *   - Merge POSICIONAL (WITH ORDINALITY nos dois lados): products_detail foi
 *     construído a partir do mesmo array, na mesma ordem. Verificado no banco:
 *     30.489 linhas pareadas, 1 única divergência de SKU.
 *   - Guard de SKU: a linha só recebe `cost` quando o SKU da mesma posição bate
 *     nos dois lados. Divergências ficam sem a chave e são reportadas.
 *   - `cost` ausente/null vira 0 — reprodução literal do legado
 *     (`product.cost ? parseFloat(product.cost) : 0`).
 *   - ADITIVO: usa `val || jsonb_build_object('cost', ...)`, preservando todas as
 *     chaves já presentes (inclusive o `quantity` da loja física gravado por
 *     migrateLojaFisicaOrders.js).
 *
 * PEDIDOS SEM PAR NO DUMP (Loja Física/Chatbot e importações antigas) não são
 * tocados: ficam sem a chave `cost` e o front lê 0 — que é exatamente o valor que
 * o legado imprimia para eles (o payload manual nunca teve `cost`).
 *
 * USO:
 *   node src/db/migrateProductsDetailCost.js            # DRY-RUN (somente leitura)
 *   node src/db/migrateProductsDetailCost.js --apply    # APLICA em transação
 *
 * SEGURANÇA:
 *   - Dry-run é o padrão; nada muda sem --apply.
 *   - --apply roda BEGIN/COMMIT em conexão dedicada (rollback em erro).
 *   - Idempotente: só processa pedidos cujo products_detail ainda não tem `cost`
 *     em nenhuma linha.
 *   - `products` (array de SKUs) permanece intacto.
 */
import { pool } from "./db.js"

const APPLY = process.argv.includes("--apply")

const STORES = [
	{ name: "outlet", table: "pedidos_outlet", num: 3889735 },
	{ name: "artepropria", table: "pedidos_artepropria", num: 1146504 }
]

// Pedidos da loja com products_detail utilizável e ainda SEM `cost` em qualquer
// linha (idempotência: uma segunda execução não reprocessa nada).
const alvoCte = (s) => `
  alvo AS (
    SELECT os.order_id, os.products_detail
    FROM orders_shop os
    WHERE os.store = '${s.num}'
      AND os.products_detail IS NOT NULL
      AND jsonb_typeof(os.products_detail) = 'array'
      AND jsonb_array_length(os.products_detail) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(os.products_detail) e
        WHERE e ? 'cost'
      )
  )
`

// Linhas do dump legado, com posição e custo já normalizado (null/'' -> 0).
const dumpCte = (s) => `
  dump AS (
    SELECT p.number::text AS oid,
           e.ord,
           UPPER(e.val->>'sku') AS sku,
           COALESCE(NULLIF(e.val->>'cost','')::numeric, 0) AS cost
    FROM ${s.table} p,
         LATERAL jsonb_array_elements(p.products) WITH ORDINALITY e(val, ord)
    WHERE jsonb_typeof(p.products) = 'array'
      AND p.number IS NOT NULL
  )
`

// Pareamento posicional alvo x dump, uma linha por item de products_detail.
const linhasCte = `
  linhas AS (
    SELECT a.order_id,
           e.ord,
           e.val,
           d.cost,
           (d.cost IS NOT NULL AND d.sku IS NOT DISTINCT FROM (e.val->>'sku')) AS casou
    FROM alvo a
    CROSS JOIN LATERAL jsonb_array_elements(a.products_detail) WITH ORDINALITY e(val, ord)
    LEFT JOIN dump d ON d.oid = a.order_id::text AND d.ord = e.ord
  )
`

// Diagnóstico do dry-run: o que seria alterado e o que ficaria de fora.
const statsSql = (s) => `
  WITH ${alvoCte(s)}, ${dumpCte(s)}, ${linhasCte}
  SELECT
    COUNT(DISTINCT order_id)::int AS pedidos_alvo,
    COUNT(DISTINCT order_id) FILTER (WHERE casou)::int AS pedidos_a_atualizar,
    COUNT(DISTINCT order_id) FILTER (WHERE cost IS NULL)::int AS pedidos_com_linha_sem_par,
    COUNT(*)::int AS linhas,
    COUNT(*) FILTER (WHERE casou)::int AS linhas_com_custo,
    COUNT(*) FILTER (WHERE cost IS NULL)::int AS linhas_sem_par_no_dump,
    COUNT(*) FILTER (WHERE cost IS NOT NULL AND NOT casou)::int AS linhas_sku_divergente,
    ROUND(COALESCE(SUM(cost) FILTER (WHERE casou), 0), 2) AS custo_total_a_gravar
  FROM linhas
`

const sampleSql = (s) => `
  WITH ${alvoCte(s)}, ${dumpCte(s)}, ${linhasCte}
  SELECT order_id,
         COUNT(*)::int AS linhas,
         ROUND(SUM(COALESCE(cost, 0)), 2) AS custo_pedido,
         (array_agg(val ORDER BY ord))[1] AS item0
  FROM linhas
  GROUP BY order_id
  HAVING COUNT(*) FILTER (WHERE casou) > 0
  ORDER BY order_id DESC
  LIMIT 3
`

// Reconstrói products_detail preservando as chaves existentes e acrescentando
// `cost` só nas linhas que casaram por posição E por SKU.
const updateSql = (s) => `
  WITH ${alvoCte(s)}, ${dumpCte(s)}, ${linhasCte},
  merged AS (
    SELECT order_id,
           jsonb_agg(
             CASE WHEN casou
                  THEN val || jsonb_build_object('cost', cost)
                  ELSE val END
             ORDER BY ord
           ) AS detail
    FROM linhas
    GROUP BY order_id
    HAVING COUNT(*) FILTER (WHERE casou) > 0
  )
  UPDATE orders_shop os
  SET products_detail = m.detail
  FROM merged m
  WHERE os.order_id::text = m.order_id::text
    AND os.store = '${s.num}'
`

// Pedidos da loja que nunca receberão custo (sem par no dump), por ano — não é
// erro: Loja Física/Chatbot legitimamente somavam R$ 0,00 no legado.
const semParSql = (s) => `
  WITH ${dumpCte(s)}
  SELECT EXTRACT(YEAR FROM os.created_at)::int AS ano,
         COALESCE(os.storefront, '(null)') AS storefront,
         COUNT(*)::int AS pedidos
  FROM orders_shop os
  WHERE os.store = '${s.num}'
    AND os.active = 1
    AND COALESCE(os.payment_status, '') <> 'voided'
    AND COALESCE(os.payment_method, '') <> 'other'
    AND NOT EXISTS (SELECT 1 FROM dump d WHERE d.oid = os.order_id::text)
  GROUP BY 1, 2
  ORDER BY 1 DESC, 3 DESC
`

async function main() {
	const client = await pool.connect()
	console.log(
		`\n=== Backfill orders_shop.products_detail[].cost — modo: ${APPLY ? "APLICAR" : "DRY-RUN (somente leitura)"} ===\n`
	)
	try {
		for (const s of STORES) {
			const { rows } = await client.query(statsSql(s))
			const st = rows[0]
			console.log(`[${s.name}]`)
			console.log(`    pedidos sem 'cost' em products_detail : ${st.pedidos_alvo}`)
			console.log(`    pedidos que serão atualizados         : ${st.pedidos_a_atualizar}`)
			console.log(`    linhas totais / com custo             : ${st.linhas} / ${st.linhas_com_custo}`)
			console.log(`    linhas sem par no dump (ficam em 0)   : ${st.linhas_sem_par_no_dump}`)
			console.log(`    linhas com SKU divergente (ignoradas) : ${st.linhas_sku_divergente}`)
			console.log(`    custo total a gravar                  : R$ ${st.custo_total_a_gravar}`)

			if (st.pedidos_a_atualizar > 0) {
				const sample = await client.query(sampleSql(s))
				sample.rows.forEach((r) =>
					console.log(
						`      amostra order_id=${r.order_id} linhas=${r.linhas} custo=R$ ${r.custo_pedido} item0=${JSON.stringify(r.item0)}`
					)
				)
			}

			const semPar = await client.query(semParSql(s))
			if (semPar.rows.length) {
				console.log("    pedidos ativos SEM par no dump (custo permanece 0):")
				semPar.rows.forEach((r) =>
					console.log(`      ${r.ano} | ${r.storefront} | ${r.pedidos} pedido(s)`)
				)
			}

			if (APPLY && st.pedidos_a_atualizar > 0) {
				await client.query("BEGIN")
				const res = await client.query(updateSql(s))
				await client.query("COMMIT")
				console.log(`    ✅ COMMIT [${s.name}]: ${res.rowCount} pedido(s) atualizado(s).`)
			}
			console.log("")
		}

		if (!APPLY) {
			console.log("DRY-RUN: nada foi alterado. Rode com --apply para aplicar.\n")
		} else {
			console.log("Concluído.\n")
		}
	} catch (err) {
		try {
			await client.query("ROLLBACK")
		} catch (rollbackErr) {
			console.error("Falha no ROLLBACK:", rollbackErr.message)
		}
		console.error("\n❌ ERRO — ROLLBACK aplicado:", err.message, "\n")
		process.exitCode = 1
	} finally {
		client.release()
		await pool.end()
	}
}

main()
