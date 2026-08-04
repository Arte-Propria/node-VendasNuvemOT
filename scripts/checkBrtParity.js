// ============================================================================
// Prova de equivalência entre o filtro de data em JS e o predicado SQL.
//
// O filtro atual (`filterBdByDateRange`) converte orders_shop.created_at para o
// dia-calendário de São Paulo com `toLocalDateBR`. O pushdown para SQL usa
// `((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date`.
//
// Este script compara os dois nas 30 mil linhas de orders_shop e falha (exit 1)
// se houver qualquer divergência. É SOMENTE LEITURA.
//
// Uso:
//   node scripts/checkBrtParity.js
//
// Observação importante: `toLocalDateBR` depende do fuso do PROCESSO Node, pois
// o driver `pg` materializa `timestamp without time zone` como Date em hora
// LOCAL. Se este script acusar divergências, NÃO ajuste o TZ para "corrigir" —
// isso mudaria a saída atual da API. O padding de ±1 dia do pushdown já cobre
// esse caso; a divergência aqui só indica que o padding é indispensável.
// ============================================================================
import { query, pool } from "../src/db/db.js"
import { toLocalDateBR } from "../src/tools/helpers.js"

// Colunas `date` voltam do driver como Date à meia-noite LOCAL. Usar
// toISOString() aqui deslocaria o dia; por isso a formatação é manual.
const localYmd = (d) =>
	`${String(d.getFullYear()).padStart(4, "0")}-` +
	`${String(d.getMonth() + 1).padStart(2, "0")}-` +
	`${String(d.getDate()).padStart(2, "0")}`

async function main() {
	console.log(
		"[TZ] process.env.TZ:",
		process.env.TZ ?? "(não definido)",
		"| resolvido:",
		Intl.DateTimeFormat().resolvedOptions().timeZone
	)

	const { rows } = await query(`
		SELECT order_id,
		       created_at,
		       ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date AS sql_brt
		FROM orders_shop
		WHERE created_at IS NOT NULL
	`)

	let divergentes = 0
	for (const r of rows) {
		const js = toLocalDateBR(r.created_at) // o que o filtro de hoje calcula
		const sql = localYmd(r.sql_brt) // o que o predicado novo calcula
		if (js !== sql) {
			divergentes++
			if (divergentes <= 20) {
				console.log(`  ✗ ${r.order_id} | created_at=${r.created_at.toISOString()} | js=${js} | sql=${sql}`)
			}
		}
	}

	if (divergentes > 20) {
		console.log(`  … (+${divergentes - 20} divergências não listadas)`)
	}
	console.log(`\nDivergentes: ${divergentes} de ${rows.length}`)
	process.exitCode = divergentes === 0 ? 0 : 1
}

main()
	.catch((err) => {
		console.error("❌ Falha na checagem:", err)
		process.exitCode = 1
	})
	.finally(async () => {
		await pool.end()
	})
