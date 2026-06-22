/**
 * Migração: corrige orders_shop.created_at
 * -----------------------------------------
 * Contexto: o backfill histórico gravou orders_shop.created_at = data de SYNC
 * (e re-syncs reescreviam a data), em vez da data REAL do pedido. As tabelas
 * legadas `pedidos_outlet` / `pedidos_artepropria` (mesmo banco) guardam o
 * created_at real da Nuvemshop por order_id. Este script copia a data real
 * para orders_shop onde houver divergência.
 *
 * USO:
 *   node src/db/migrateOrdersCreatedAt.js           # DRY-RUN (somente leitura: conta e mostra amostra)
 *   node src/db/migrateOrdersCreatedAt.js --apply    # APLICA dentro de uma transação (tudo-ou-nada)
 *
 * SEGURANÇA:
 *   - Dry-run é o padrão; nada é alterado sem --apply.
 *   - --apply roda em BEGIN/COMMIT numa conexão dedicada (rollback em erro).
 *   - Idempotente: só toca linhas onde created_at DIFERE do legado.
 *   - Junção por order_id como TEXTO (tipos podem diferir entre tabelas).
 *   - Lojas e nomes de tabela são CONSTANTES fixas (sem injeção).
 */
import { pool } from "./db.js"

const STORES = [
	{ name: "outlet", storeId: 3889735, legacyTable: "pedidos_outlet" },
	{ name: "artepropria", storeId: 1146504, legacyTable: "pedidos_artepropria" }
]

const APPLY = process.argv.includes("--apply")

const countSql = (legacyTable, storeId) => `
  SELECT COUNT(*)::int AS n
  FROM orders_shop os
  JOIN ${legacyTable} p ON os.order_id::text = p.order_id::text
  WHERE os.store::text = '${storeId}'
    AND os.created_at IS DISTINCT FROM p.created_at
`

const sampleSql = (legacyTable, storeId) => `
  SELECT os.order_id,
         os.created_at AS created_atual,
         p.created_at  AS created_real
  FROM orders_shop os
  JOIN ${legacyTable} p ON os.order_id::text = p.order_id::text
  WHERE os.store::text = '${storeId}'
    AND os.created_at IS DISTINCT FROM p.created_at
  ORDER BY p.created_at
  LIMIT 5
`

const updateSql = (legacyTable, storeId) => `
  UPDATE orders_shop os
  SET created_at = p.created_at
  FROM ${legacyTable} p
  WHERE os.order_id::text = p.order_id::text
    AND os.store::text = '${storeId}'
    AND os.created_at IS DISTINCT FROM p.created_at
`

async function main() {
	const client = await pool.connect()
	console.log(`\n=== Migração orders_shop.created_at — modo: ${APPLY ? "APLICAR" : "DRY-RUN (somente leitura)"} ===\n`)
	try {
		// 1) Relatório (sempre — somente leitura)
		let totalToFix = 0
		for (const { name, storeId, legacyTable } of STORES) {
			const { rows } = await client.query(countSql(legacyTable, storeId))
			const n = rows[0].n
			totalToFix += n
			console.log(`[${name}] linhas a corrigir: ${n}`)
			if (n > 0) {
				const sample = await client.query(sampleSql(legacyTable, storeId))
				sample.rows.forEach((r) =>
					console.log(`    order_id=${r.order_id}  atual=${String(r.created_atual).slice(0, 10)}  ->  real=${String(r.created_real).slice(0, 10)}`)
				)
			}
		}
		console.log(`\nTOTAL a corrigir: ${totalToFix}`)

		if (!APPLY) {
			console.log("\nDRY-RUN: nada foi alterado. Rode com --apply para aplicar.\n")
			return
		}

		if (totalToFix === 0) {
			console.log("\nNada a aplicar (já está consistente).\n")
			return
		}

		// 2) Aplicar em transação (tudo-ou-nada)
		console.log("\nAplicando em transação...")
		await client.query("BEGIN")
		let totalUpdated = 0
		for (const { name, storeId, legacyTable } of STORES) {
			const res = await client.query(updateSql(legacyTable, storeId))
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
