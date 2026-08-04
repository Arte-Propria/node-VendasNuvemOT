// ============================================================================
// Diff de paridade do /db/query: versão ANTIGA vs NOVA, contra o MESMO banco.
//
// Compara o SHA-256 do corpo das respostas. As duas instâncias precisam rodar
// SIMULTANEAMENTE (para eliminar "o webhook escreveu entre uma chamada e outra")
// e com o MESMO TZ — use TZ=UTC, que é o da Render:
//
//   git worktree add c:/tmp/parity-base <sha-antes>
//   cp .env c:/tmp/parity-base/.env
//   cd c:/tmp/parity-base            && TZ=UTC PORT=3001 node src/server.js
//   cd c:/xampp/htdocs/node-VendasNuvemOT && TZ=UTC PORT=3000 node src/server.js
//   node scripts/parityDiff.js
//
// Quando os hashes divergem, o script distingue CONJUNTO diferente de ORDEM
// diferente — o segundo é o sinal de que o ORDER BY ctid é necessário.
// É SOMENTE LEITURA (só faz GET).
// ============================================================================
import { createHash } from "node:crypto"

const OLD = process.env.PARITY_OLD || "http://localhost:3001"
const NEW = process.env.PARITY_NEW || "http://localhost:3000"

const sha = (s) => createHash("sha256").update(s).digest("hex")

// Chave primária por tabela, usada só para diagnosticar a diferença.
const PK = {
	orders_shop: "order_id",
	ads: "id_ads",
	daily_sales: "id_sales",
	coupon: "name",
	clientes: "id_cli",
	categorias: "cod_categoria"
}

// Períodos HISTÓRICOS (endDate no passado) para que o dado esteja congelado.
const PERIODOS = [
	["2026-07-15", "2026-07-15"], // 1 dia
	["2026-07-01", "2026-07-31"], // 1 mês
	["2026-01-01", "2026-07-31"], // 7 meses
	["2023-11-01", "2026-07-31"], // base inteira
	["2019-01-01", "2019-01-31"], // período VAZIO
	["2026-07-31", "2026-07-01"], // INVERTIDO → deve dar 500 nos dois
	["2026-01-31", "2026-02-01"], // virada de mês
	["2026-07-16", "2026-07-16"] // dia com pedido de madrugada (borda BRT)
]

const CASES = []
for (const table of ["orders_shop", "ads", "daily_sales", "coupon"]) {
	for (const store of ["outlet", "artepropria", "3889735", "1146504"]) {
		for (const [s, e] of PERIODOS) CASES.push({ table, store, s, e })
	}
}
// Casos de borda: tabelas que não aceitam store (400), store não resolvível
// (200 []), tabela inválida (400) e data sintaticamente válida mas inexistente.
CASES.push({ table: "clientes", store: "outlet", s: "2026-07-01", e: "2026-07-31" })
CASES.push({ table: "categorias", store: "outlet", s: "2026-07-01", e: "2026-07-31" })
CASES.push({ table: "ads", store: "999999", s: "2026-07-01", e: "2026-07-31" })
CASES.push({ table: "naoexiste", store: "outlet", s: "2026-07-01", e: "2026-07-31" })
CASES.push({ table: "orders_shop", store: "outlet", s: "2026-13-45", e: "2026-07-31" })
CASES.push({ table: "orders_shop", store: "outlet", s: "2026-02-29", e: "2026-07-31" })

let fail = 0
for (const c of CASES) {
	const path = `/db/query/${c.table}/${encodeURIComponent(c.store)}/${c.s}/${c.e}`
	const [a, b] = await Promise.all([fetch(OLD + path), fetch(NEW + path)])
	// .text() já vem descomprimido — o gzip do lado novo é transparente aqui.
	const [ta, tb] = await Promise.all([a.text(), b.text()])

	if (a.status === b.status && sha(ta) === sha(tb)) {
		console.log(`✅ ${path}  (${a.status}, ${ta.length} B)`)
		continue
	}

	fail++
	console.log(`\n❌ ${path}`)
	console.log(`   status ${a.status} → ${b.status} | bytes ${ta.length} → ${tb.length}`)
	try {
		const [ja, jb] = [JSON.parse(ta), JSON.parse(tb)]
		if (Array.isArray(ja) && Array.isArray(jb)) {
			const pk = PK[c.table]
			const ka = new Set(ja.map((r) => r[pk]))
			const kb = new Set(jb.map((r) => r[pk]))
			const soAntigo = [...ka].filter((k) => !kb.has(k))
			const soNovo = [...kb].filter((k) => !ka.has(k))
			console.log(`   linhas: ${ja.length} → ${jb.length}`)
			console.log(`   só no ANTIGO (${soAntigo.length}):`, soAntigo.slice(0, 10))
			console.log(`   só no NOVO   (${soNovo.length}):`, soNovo.slice(0, 10))
			if (soAntigo.length === 0 && soNovo.length === 0) {
				const i = ja.findIndex((r, k) => JSON.stringify(r) !== JSON.stringify(jb[k]))
				console.log(`   ⚠️  mesmo CONJUNTO, ORDEM divergente a partir do índice ${i}`)
				console.log(`      antigo[${i}].${pk} = ${ja[i]?.[pk]} | novo[${i}].${pk} = ${jb[i]?.[pk]}`)
			}
		} else {
			console.log("   antigo:", ta.slice(0, 200))
			console.log("   novo  :", tb.slice(0, 200))
		}
	} catch {
		console.log("   antigo:", ta.slice(0, 200))
		console.log("   novo  :", tb.slice(0, 200))
	}
}

console.log(`\n${CASES.length - fail}/${CASES.length} respostas idênticas`)
process.exit(fail === 0 ? 0 : 1)
