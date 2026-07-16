/**
 * Migração: preenche orders_shop.products_detail a partir dos pedidos legados
 * ---------------------------------------------------------------------------
 * Contexto: a aba Produtos foi migrada para ler orders_shop, mas essa tabela só
 * guardava `products` como array de SKUs — perdendo product_id, preço histórico
 * e variant_values que a tela legada usava. A coluna aditiva `products_detail`
 * (jsonb) restaura esses campos por linha, permitindo reproduzir a agregação
 * legada (agrupar por product_id, faturamento pelo preço da linha, variações por
 * variant_values) sobre a base nova.
 *
 * Os dados ricos existem nas linhas dos pedidos legados
 * (pedidos_outlet/pedidos_artepropria, coluna JSONB `products`). O join correto
 * é pedidos_*.number = orders_shop.order_id (o order_id da orders_shop é o
 * NÚMERO do pedido Nuvemshop; ver mapNuvemshopToDelivery). Comparação por ::text
 * porque order_id (orders_shop) é string/bigint e number é integer.
 *
 * USO:
 *   node src/db/migrateOrdersProductsDetail.js            # DRY-RUN (somente leitura)
 *   node src/db/migrateOrdersProductsDetail.js --apply    # APLICA em transação
 *
 * SEGURANÇA:
 *   - Dry-run é o padrão; nada muda sem --apply.
 *   - --apply roda BEGIN/COMMIT em conexão dedicada (rollback em erro).
 *   - Idempotente: só preenche onde products_detail IS NULL (não sobrescreve o
 *     detalhe rico já gravado pelo webhook Nuvemshop).
 *   - Aditivo: `products` (array de SKUs) permanece intacto.
 */
import { pool } from "./db.js"

const APPLY = process.argv.includes("--apply")

const STORES = [
	{ name: "outlet", table: "pedidos_outlet", num: 3889735 },
	{ name: "artepropria", table: "pedidos_artepropria", num: 1146504 }
]

// Subquery: para cada pedido legado, agrega as linhas de `products` no formato
// products_detail { product_id, sku(UPPER), name, price(number), image(src), variant_values }.
const detailSub = (table) => `
  SELECT p.number AS num,
         jsonb_agg(
           jsonb_build_object(
             'product_id', elem->'product_id',
             'sku', UPPER(elem->>'sku'),
             'name', elem->>'name',
             'price', COALESCE(NULLIF(elem->>'price','')::numeric, 0),
             'image', elem#>>'{image,src}',
             'variant_values', COALESCE(elem->'variant_values', '[]'::jsonb)
           )
         ) AS detail
  FROM ${table} p,
       LATERAL jsonb_array_elements(p.products) elem
  WHERE jsonb_typeof(p.products) = 'array'
    AND p.number IS NOT NULL
  GROUP BY p.number
`

const countSql = (s) => `
  SELECT COUNT(*)::int AS n
  FROM orders_shop os
  JOIN ( ${detailSub(s.table)} ) sub ON sub.num::text = os.order_id::text
  WHERE os.store = '${s.num}' AND os.products_detail IS NULL
`

const updateSql = (s) => `
  UPDATE orders_shop os
  SET products_detail = sub.detail
  FROM ( ${detailSub(s.table)} ) sub
  WHERE sub.num::text = os.order_id::text
    AND os.store = '${s.num}'
    AND os.products_detail IS NULL
`

const sampleSql = (s) => `
  SELECT os.order_id, jsonb_array_length(sub.detail) AS linhas, sub.detail->0 AS item0
  FROM orders_shop os
  JOIN ( ${detailSub(s.table)} ) sub ON sub.num::text = os.order_id::text
  WHERE os.store = '${s.num}' AND os.products_detail IS NULL
  LIMIT 2
`

async function main() {
	const client = await pool.connect()
	console.log(
		`\n=== Backfill orders_shop.products_detail — modo: ${APPLY ? "APLICAR" : "DRY-RUN (somente leitura)"} ===\n`
	)
	try {
		// Garante a coluna (idempotente) — orders_shop não é criada pelo repo.
		await client.query(
			"ALTER TABLE orders_shop ADD COLUMN IF NOT EXISTS products_detail jsonb"
		)

		for (const s of STORES) {
			const { rows } = await client.query(countSql(s))
			const n = rows[0].n
			console.log(`[${s.name}] pedidos a preencher (products_detail NULL com match legado): ${n}`)

			if (n > 0) {
				const sample = await client.query(sampleSql(s))
				sample.rows.forEach((r) =>
					console.log(
						`    order_id=${r.order_id} linhas=${r.linhas} item0=${JSON.stringify(r.item0)}`
					)
				)
			}

			if (APPLY && n > 0) {
				await client.query("BEGIN")
				const res = await client.query(updateSql(s))
				await client.query("COMMIT")
				console.log(`    ✅ COMMIT [${s.name}]: ${res.rowCount} pedido(s) preenchido(s).`)
			}
		}

		if (!APPLY) {
			console.log("\nDRY-RUN: nada foi alterado. Rode com --apply para aplicar.\n")
		} else {
			console.log("\nConcluído.\n")
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
