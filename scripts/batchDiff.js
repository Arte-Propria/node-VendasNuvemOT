// ============================================================================
// Paridade dos endpoints em LOTE contra os unitários, no MESMO servidor.
//
// Compara:
//   POST /db/products/batch  ×  GET /db/product/:sku
//   POST /db/clients/batch   ×  GET /db/clients/:id
//
// A amostra de clientes é enviesada de propósito para os casos difíceis: TODOS
// os cpf_cnpj_cli duplicados (onde o desempate importa) + ids que aparecem de
// verdade em orders_shop + seriais puros.
//
// Uso (com o servidor novo no ar):
//   TZ=UTC node scripts/batchDiff.js
//   BATCH_BASE=http://localhost:3000 node scripts/batchDiff.js
//
// É SOMENTE LEITURA.
// ============================================================================
import { query, pool } from "../src/db/db.js"

const BASE = process.env.BATCH_BASE || "http://localhost:3000"
const CHUNK = 150

const chunk = (arr, n) => {
	const out = []
	for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
	return out
}

const postBatch = async (path, body) => {
	const r = await fetch(`${BASE}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	})
	if (!r.ok) throw new Error(`${path} respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`)
	return r.json()
}

const getSingle = async (path) => {
	const r = await fetch(`${BASE}${path}`)
	if (r.status === 404) return null
	if (!r.ok) throw new Error(`${path} respondeu ${r.status}`)
	const data = await r.json()
	// getClientById/getProductBySku podem devolver { error } com 200/400.
	if (data && typeof data === "object" && data.error) return null
	return data
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

async function comparar(nome, itens, batchPath, batchKey, singlePath) {
	let checados = 0
	let divergentes = 0

	for (const slice of chunk(itens, CHUNK)) {
		const lote = await postBatch(batchPath, { [batchKey]: slice })
		for (const item of slice) {
			const unitario = await getSingle(singlePath(item))
			checados++
			if (!eq(lote[String(item)], unitario)) {
				divergentes++
				if (divergentes <= 10) {
					console.log(`  ✗ ${nome} "${item}"`)
					console.log(`     lote    : ${JSON.stringify(lote[String(item)])?.slice(0, 180)}`)
					console.log(`     unitário: ${JSON.stringify(unitario)?.slice(0, 180)}`)
				}
			}
		}
		process.stdout.write(`\r  ${nome}: ${checados}/${itens.length} checados, ${divergentes} divergentes   `)
	}
	console.log(`\n  → ${nome}: ${divergentes} divergentes de ${checados}`)
	return divergentes
}

async function main() {
	// ---- Produtos: amostra do catálogo + SKUs inexistentes (devem dar null) ----
	const { rows: prodRows } = await query(
		`SELECT cod_categoria FROM categorias ORDER BY ctid LIMIT 1200`
	)
	const skus = prodRows.map((r) => r.cod_categoria)
	// Casos de borda: caixa baixa, com espaço, inexistente, e o SKU com vírgula.
	const { rows: virgula } = await query(
		`SELECT cod_categoria FROM categorias WHERE cod_categoria LIKE '%,%' LIMIT 5`
	)
	skus.push(
		...virgula.map((r) => r.cod_categoria),
		String(prodRows[0]?.cod_categoria || "").toLowerCase(),
		` ${prodRows[1]?.cod_categoria} `,
		"SKU-QUE-NAO-EXISTE-123"
	)

	// ---- Clientes: TODOS os CPFs duplicados + ids reais de orders_shop + seriais ----
	const { rows: dupRows } = await query(`
		SELECT cpf_cnpj_cli FROM clientes
		WHERE cpf_cnpj_cli IS NOT NULL
		GROUP BY cpf_cnpj_cli HAVING count(*) > 1
	`)
	const { rows: usados } = await query(`
		SELECT DISTINCT id_cli FROM orders_shop WHERE id_cli IS NOT NULL LIMIT 1500
	`)
	const { rows: seriais } = await query(`SELECT id_cli FROM clientes ORDER BY ctid LIMIT 800`)
	const ids = [
		...new Set([
			...dupRows.map((r) => r.cpf_cnpj_cli),
			...usados.map((r) => String(r.id_cli)),
			...seriais.map((r) => String(r.id_cli)),
			"00012345678", // zero à esquerda → NÃO é serial
			"999999999999", // não existe
			"0"
		])
	]

	console.log(`Produtos: ${skus.length} SKUs | Clientes: ${ids.length} ids (${dupRows.length} CPFs duplicados)`)

	const dp = await comparar("produtos", skus, "/db/products/batch", "skus", (s) =>
		`/db/product/${encodeURIComponent(s)}`
	)
	const dc = await comparar("clientes", ids, "/db/clients/batch", "ids", (i) =>
		`/db/clients/${encodeURIComponent(i)}`
	)

	console.log(`\nTotal divergentes: produtos=${dp}, clientes=${dc}`)
	process.exitCode = dp === 0 && dc === 0 ? 0 : 1
}

main()
	.catch((err) => {
		console.error("❌ Falha no diff de lote:", err)
		process.exitCode = 1
	})
	.finally(async () => {
		await pool.end()
	})
