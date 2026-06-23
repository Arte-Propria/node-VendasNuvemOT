/**
 * Migração: corrige categorias.custo_categoria zerado
 * ---------------------------------------------------
 * Contexto: alguns produtos do catálogo (categorias) ficaram com
 * custo_categoria=0 — o custo real (Nuvemshop) foi sobrescrito por 0 (origens
 * sem custo, ex.: Tiny). O custo REAL existe nas linhas de produto dos pedidos
 * legados (pedidos_outlet/pedidos_artepropria, coluna JSONB `products` com
 * objetos {sku, cost, price, ...}). Este script preenche o custo a partir daí.
 *
 * USO:
 *   node src/db/migrateProductCost.js           # DRY-RUN (somente leitura)
 *   node src/db/migrateProductCost.js --apply     # APLICA em transação
 *
 * SEGURANÇA:
 *   - Dry-run é o padrão; nada muda sem --apply.
 *   - --apply roda BEGIN/COMMIT em conexão dedicada (rollback em erro).
 *   - Idempotente: só preenche onde custo_categoria está 0/null E há custo>0.
 *   - Junção por SKU em CAIXA ALTA (cod_categoria é uppercase; sku do pedido
 *     pode ter caixa baixa, ex.: dimensão "70x160").
 *   - Usa o custo MAIS RECENTE por SKU (DISTINCT ON ... ORDER BY created_at DESC).
 */
import { pool } from "./db.js"

const APPLY = process.argv.includes("--apply")

// CTE: custo real (mais recente) por SKU, vindo das linhas dos pedidos legados.
const COSTS_CTE = `
  WITH costs AS (
    SELECT DISTINCT ON (sku_up) sku_up, cost
    FROM (
      SELECT UPPER(p->>'sku') AS sku_up, (p->>'cost')::numeric AS cost, o.created_at
      FROM pedidos_outlet o, LATERAL jsonb_array_elements(o.products::jsonb) AS p
      WHERE jsonb_typeof(o.products::jsonb) = 'array'
        AND (p->>'sku') IS NOT NULL
        AND (p->>'cost') ~ '^[0-9]+(\\.[0-9]+)?$'
        AND (p->>'cost')::numeric > 0
      UNION ALL
      SELECT UPPER(p->>'sku'), (p->>'cost')::numeric, o.created_at
      FROM pedidos_artepropria o, LATERAL jsonb_array_elements(o.products::jsonb) AS p
      WHERE jsonb_typeof(o.products::jsonb) = 'array'
        AND (p->>'sku') IS NOT NULL
        AND (p->>'cost') ~ '^[0-9]+(\\.[0-9]+)?$'
        AND (p->>'cost')::numeric > 0
    ) s
    ORDER BY sku_up, created_at DESC
  )
`

const countSql = `
  ${COSTS_CTE}
  SELECT COUNT(*)::int AS n
  FROM categorias c
  JOIN costs ON c.cod_categoria = costs.sku_up
  WHERE COALESCE(c.custo_categoria, 0) = 0 AND costs.cost > 0
`

const sampleSql = `
  ${COSTS_CTE}
  SELECT c.cod_categoria, c.nome_categoria, c.custo_categoria AS atual, costs.cost AS real
  FROM categorias c
  JOIN costs ON c.cod_categoria = costs.sku_up
  WHERE COALESCE(c.custo_categoria, 0) = 0 AND costs.cost > 0
  ORDER BY costs.cost DESC
  LIMIT 8
`

const updateSql = `
  ${COSTS_CTE}
  UPDATE categorias c
  SET custo_categoria = costs.cost
  FROM costs
  WHERE c.cod_categoria = costs.sku_up
    AND COALESCE(c.custo_categoria, 0) = 0
    AND costs.cost > 0
`

async function main() {
	const client = await pool.connect()
	console.log(`\n=== Migração categorias.custo_categoria — modo: ${APPLY ? "APLICAR" : "DRY-RUN (somente leitura)"} ===\n`)
	try {
		const { rows } = await client.query(countSql)
		const n = rows[0].n
		console.log(`Produtos com custo zerado a preencher: ${n}`)

		if (n > 0) {
			const sample = await client.query(sampleSql)
			sample.rows.forEach((r) =>
				console.log(`    ${r.cod_categoria}  (${r.nome_categoria})  atual=${r.atual}  ->  real=${r.real}`)
			)
		}

		if (!APPLY) {
			console.log("\nDRY-RUN: nada foi alterado. Rode com --apply para aplicar.\n")
			return
		}
		if (n === 0) {
			console.log("\nNada a aplicar.\n")
			return
		}

		console.log("\nAplicando em transação...")
		await client.query("BEGIN")
		const res = await client.query(updateSql)
		await client.query("COMMIT")
		console.log(`\n✅ COMMIT. custo_categoria preenchido em ${res.rowCount} produto(s).\n`)
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
