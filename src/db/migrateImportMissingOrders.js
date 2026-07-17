/**
 * Migração: importa p/ orders_shop os pedidos que existem no legado
 * (pedidos_outlet/pedidos_artepropria) mas faltam em orders_shop, zerando o gap
 * da aba Produtos (especialmente o outlet).
 * ---------------------------------------------------------------------------
 * Causa-raiz do gap: `orders_shop.order_id` é PK GLOBAL, mas o `number` da
 * Nuvemshop só é único POR LOJA. ~1.478 números são compartilhados entre as
 * duas lojas; para cada um só um pedido cabe (a artepropria ocupou a maioria),
 * então a versão outlet ficou de fora.
 *
 * Solução (decisão do usuário): order_id SINTÉTICO contido. O pedido faltante é
 * inserido com:
 *   - order_id = number            (quando o número está livre), OU
 *   - order_id = number + OFFSET   (quando colide com um order_id já existente),
 *     OFFSET por loja (outlet 1e12, artepropria 2e12) p/ evitar colisão entre si.
 * `order_id` é numeric (sem overflow) e < 2^53 (seguro no front). Loja correta e
 * `products_detail` rico são preservados → a agregação de Produtos passa a
 * contá-los. Reversível: DELETE FROM orders_shop WHERE order_id >= 1e12.
 *
 * NÃO recalcula daily_sales (fora de escopo). Dashboard/Statistics somam
 * orders_shop client-side por loja+data, então passam a incluir esses pedidos
 * históricos nas suas datas reais.
 *
 * USO:
 *   node src/db/migrateImportMissingOrders.js            # DRY-RUN (somente leitura)
 *   node src/db/migrateImportMissingOrders.js --apply    # APLICA em transação
 *
 * SEGURANÇA: dry-run padrão; --apply em BEGIN/COMMIT; idempotente via
 * ON CONFLICT (order_id) DO NOTHING. Fonte (pedidos_*) preservada.
 */
import { pool } from "./db.js"

const APPLY = process.argv.includes("--apply")

const STORES = [
	{ name: "outlet", table: "pedidos_outlet", num: 3889735, offset: 1000000000000 },
	{ name: "artepropria", table: "pedidos_artepropria", num: 1146504, offset: 2000000000000 }
]

// Pedidos do legado ausentes em orders_shop (por loja), só com products em array.
const whereMissing = (s) => `
  FROM ${s.table} p
  WHERE p.number IS NOT NULL
    AND jsonb_typeof(p.products) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM orders_shop os
      WHERE os.store = '${s.num}' AND os.order_id = p.number::numeric
    )
`

// Lista de colunas e o SELECT que monta cada linha de orders_shop a partir de p.
const COLS =
	"order_id, id_cli, store, total, subtotal, payment_status, coupons, " +
	"coupon_discount, products, products_detail, shipping_status, created_at, " +
	"paid_at, updated_at, active, gateway_link, payment_method, storefront"

const selectRow = (s) => `
  SELECT
    CASE
      WHEN EXISTS (SELECT 1 FROM orders_shop o2 WHERE o2.order_id = p.number::numeric)
      THEN p.number::numeric + ${s.offset}
      ELSE p.number::numeric
    END AS order_id,
    p.customer->>'identification' AS id_cli,
    '${s.num}' AS store,
    p.total, p.subtotal, p.payment_status,
    COALESCE(
      CASE WHEN jsonb_typeof(p.coupon) = 'array'
        THEN (SELECT jsonb_agg(c->>'code')
              FROM jsonb_array_elements(p.coupon) c
              WHERE c->>'code' IS NOT NULL)::text
        ELSE NULL END, '[]') AS coupons,
    p.discount_coupon AS coupon_discount,
    (SELECT jsonb_agg(UPPER(elem->>'sku'))
       FROM jsonb_array_elements(p.products) elem
      WHERE elem->>'sku' IS NOT NULL) AS products,
    (SELECT jsonb_agg(jsonb_build_object(
        'product_id', elem->'product_id',
        'sku', UPPER(elem->>'sku'),
        'name', elem->>'name',
        'price', COALESCE(NULLIF(elem->>'price','')::numeric, 0),
        'image', elem#>>'{image,src}',
        'variant_values', COALESCE(elem->'variant_values', '[]'::jsonb)
      ))
       FROM jsonb_array_elements(p.products) elem) AS products_detail,
    p.shipping_status,
    p.created_at,
    p.paid_at,
    COALESCE(p.updated_at, p.created_at) AS updated_at,
    CASE WHEN p.status = 'cancelled' THEN 0 ELSE 1 END AS active,
    p.gateway_link,
    p.payment_details->>'method' AS payment_method,
    p.storefront
  ${whereMissing(s)}
`

const countSql = (s) => `SELECT COUNT(*)::int AS n ${whereMissing(s)}`
const sampleSql = (s) => `
  SELECT order_id, store, active, payment_status, payment_method, created_at,
         jsonb_array_length(products_detail) AS linhas, products_detail->0 AS item0
  FROM ( ${selectRow(s)} ) r
  LIMIT 2
`
const insertSql = (s) =>
	`INSERT INTO orders_shop (${COLS}) ${selectRow(s)} ON CONFLICT (order_id) DO NOTHING`

async function main() {
	const client = await pool.connect()
	console.log(
		`\n=== Importar pedidos faltantes → orders_shop — modo: ${APPLY ? "APLICAR" : "DRY-RUN (somente leitura)"} ===\n`
	)
	try {
		for (const s of STORES) {
			const { rows } = await client.query(countSql(s))
			const n = rows[0].n
			console.log(`[${s.name}] pedidos faltantes a importar: ${n} (offset colisão = ${s.offset})`)

			if (n > 0) {
				const sample = await client.query(sampleSql(s))
				sample.rows.forEach((r) =>
					console.log(
						`    order_id=${r.order_id} store=${r.store} ${r.payment_status}/${r.payment_method} ` +
						`active=${r.active} linhas=${r.linhas} item0=${JSON.stringify(r.item0)}`
					)
				)
			}

			if (APPLY && n > 0) {
				await client.query("BEGIN")
				const res = await client.query(insertSql(s))
				await client.query("COMMIT")
				console.log(`    ✅ COMMIT [${s.name}]: ${res.rowCount} pedido(s) importado(s).`)
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
