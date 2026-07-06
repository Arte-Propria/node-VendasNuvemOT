/**
 * Migração: orders_shop.order_tracking_link
 * -----------------------------------------
 * Contexto: passamos a persistir o link da página de acompanhamento/sucesso do
 * pedido da Nuvemshop (`/checkout/v3/success/{id}/{token}`), montado com o domínio
 * correto de cada loja. Este script:
 *   1) cria a coluna `order_tracking_link` (idempotente, ADD COLUMN IF NOT EXISTS);
 *   2) faz o backfill dos pedidos já existentes a partir das tabelas legadas
 *      `pedidos_outlet` / `pedidos_artepropria` (mesmo banco), que guardam por
 *      pedido o `id` interno e o `token` da Nuvemshop.
 *
 * USO:
 *   node src/db/migrateOrderTrackingLink.js            # DRY-RUN (só a coluna é criada; backfill é apenas relatado)
 *   node src/db/migrateOrderTrackingLink.js --apply    # APLICA o backfill dentro de uma transação (tudo-ou-nada)
 *
 * SEGURANÇA:
 *   - A coluna é criada sempre (ADD COLUMN IF NOT EXISTS não altera dados existentes).
 *   - O backfill só roda com --apply, em BEGIN/COMMIT (rollback em erro).
 *   - Idempotente: só preenche linhas onde order_tracking_link ainda é NULL e há id+token.
 *   - Junção por order_id como TEXTO (tipos podem diferir entre tabelas).
 *   - Lojas, tabelas legadas e domínios são CONSTANTES fixas (sem injeção).
 */
import { pool } from "./db.js"

const STORES = [
	{
		name: "outlet",
		storeId: 3889735,
		legacyTable: "pedidos_outlet",
		baseUrl: "https://www.outletdosquadros.com.br"
	},
	{
		name: "artepropria",
		storeId: 1146504,
		legacyTable: "pedidos_artepropria",
		baseUrl: "https://www.artepropria.com.br"
	}
]

const APPLY = process.argv.includes("--apply")

const addColumnSql = `
  ALTER TABLE orders_shop
  ADD COLUMN IF NOT EXISTS order_tracking_link TEXT
`

const countSql = (legacyTable, storeId) => `
  SELECT COUNT(*)::int AS n
  FROM orders_shop os
  JOIN ${legacyTable} p ON os.order_id::text = p.order_id::text
  WHERE os.store::text = '${storeId}'
    AND os.order_tracking_link IS NULL
    AND p.id IS NOT NULL
    AND p.token IS NOT NULL
`

const sampleSql = (legacyTable, storeId, baseUrl) => `
  SELECT os.order_id,
         '${baseUrl}/checkout/v3/success/' || p.id || '/' || p.token AS link
  FROM orders_shop os
  JOIN ${legacyTable} p ON os.order_id::text = p.order_id::text
  WHERE os.store::text = '${storeId}'
    AND os.order_tracking_link IS NULL
    AND p.id IS NOT NULL
    AND p.token IS NOT NULL
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 5
`

const updateSql = (legacyTable, storeId, baseUrl) => `
  UPDATE orders_shop os
  SET order_tracking_link =
        '${baseUrl}/checkout/v3/success/' || p.id || '/' || p.token
  FROM ${legacyTable} p
  WHERE os.order_id::text = p.order_id::text
    AND os.store::text = '${storeId}'
    AND os.order_tracking_link IS NULL
    AND p.id IS NOT NULL
    AND p.token IS NOT NULL
`

async function main() {
	const client = await pool.connect()
	console.log(`\n=== Migração orders_shop.order_tracking_link — modo: ${APPLY ? "APLICAR" : "DRY-RUN (só cria a coluna)"} ===\n`)
	try {
		// 0) Cria a coluna (idempotente; não altera dados existentes)
		await client.query(addColumnSql)
		console.log("Coluna order_tracking_link garantida (ADD COLUMN IF NOT EXISTS).\n")

		// 1) Relatório do backfill (sempre — somente leitura)
		let totalToFill = 0
		for (const { name, storeId, legacyTable, baseUrl } of STORES) {
			const { rows } = await client.query(countSql(legacyTable, storeId))
			const n = rows[0].n
			totalToFill += n
			console.log(`[${name}] linhas a preencher: ${n}`)
			if (n > 0) {
				const sample = await client.query(sampleSql(legacyTable, storeId, baseUrl))
				sample.rows.forEach((r) =>
					console.log(`    order_id=${r.order_id}  ->  ${r.link}`)
				)
			}
		}
		console.log(`\nTOTAL a preencher: ${totalToFill}`)

		if (!APPLY) {
			console.log("\nDRY-RUN: coluna criada; backfill NÃO aplicado. Rode com --apply para preencher.\n")
			return
		}

		if (totalToFill === 0) {
			console.log("\nNada a preencher (já está consistente).\n")
			return
		}

		// 2) Aplicar backfill em transação (tudo-ou-nada)
		console.log("\nAplicando backfill em transação...")
		await client.query("BEGIN")
		let totalUpdated = 0
		for (const { name, storeId, legacyTable, baseUrl } of STORES) {
			const res = await client.query(updateSql(legacyTable, storeId, baseUrl))
			console.log(`[${name}] atualizadas: ${res.rowCount}`)
			totalUpdated += res.rowCount
		}
		await client.query("COMMIT")
		console.log(`\n✅ COMMIT. Total atualizado: ${totalUpdated}\n`)
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
