// ============================================================================
// Runner one-off do recálculo corretivo de daily_sales.
//
// Reconstrói daily_sales a partir do dump pedidos_<loja> aplicando as regras do
// Dashboard/legado (ver src/services/dailySalesRecalc.js). Idempotente por
// (date_sales, store).
//
// Uso (dry-run por padrão — NÃO grava):
//   node scripts/runDailySalesRecalc.js
//   node scripts/runDailySalesRecalc.js --start=2025-01-01 --end=2025-12-31
//   node scripts/runDailySalesRecalc.js --store=outlet
//
// Para GRAVAR na base, adicione --apply:
//   node scripts/runDailySalesRecalc.js --apply
//
// (dotenv é carregado por src/db/db.js; garanta o .env com as credenciais e
//  POSTGRESQL_SCHEMA antes de rodar.)
// ============================================================================
import { recalcAllDailySales } from "../src/services/dailySalesRecalc.js"
import { pool } from "../src/db/db.js"

function parseArgs(argv) {
	const opts = { apply: false, stores: ["outlet", "artepropria"], startDate: null, endDate: null }
	for (const arg of argv.slice(2)) {
		if (arg === "--apply") opts.apply = true
		else if (arg.startsWith("--store=")) opts.stores = [arg.slice("--store=".length)]
		else if (arg.startsWith("--start=")) opts.startDate = arg.slice("--start=".length)
		else if (arg.startsWith("--end=")) opts.endDate = arg.slice("--end=".length)
		else console.warn(`⚠️  argumento ignorado: ${arg}`)
	}
	return opts
}

async function main() {
	const opts = parseArgs(process.argv)
	console.log(
		`▶️  Recálculo daily_sales — modo: ${opts.apply ? "APPLY (grava)" : "DRY-RUN"} | ` +
		`lojas: ${opts.stores.join(", ")} | período: ${opts.startDate || "início"} → ${opts.endDate || "fim"}`
	)

	let changedShown = 0
	const totals = await recalcAllDailySales({
		...opts,
		onProgress: (ev) => {
			if (ev.type === "store") {
				console.log(`🏬 ${ev.store} (${ev.storeNum}): ${ev.days} dias`)
			} else if (ev.type === "day" && ev.changed && changedShown < 50) {
				changedShown++
				const p = ev.prev
				const c = ev.computed
				const before = p
					? `orders=${p.total_orders} money=${toFixed(p.total_money)} paid=${toFixed(p.total_paid_money)}`
					: "(inexistente)"
				console.log(
					`  ~ ${ev.day} ${ev.store}: ${before} → ` +
					`orders=${c.total_orders} money=${toFixed(c.total_money)} paid=${toFixed(c.total_paid_money)}`
				)
			} else if (ev.type === "warn") {
				console.warn(`⚠️  ${ev.message}`)
			}
		}
	})

	if (totals.daysChanged > changedShown) {
		console.log(`  … (+${totals.daysChanged - changedShown} dias alterados não listados)`)
	}
	console.log(
		`✅ Concluído: ${totals.daysEvaluated} dias avaliados, ${totals.daysChanged} alterados, ` +
		`${totals.inserts} inseridos, ${totals.updates} atualizados.`
	)
	if (!opts.apply && totals.daysChanged > 0) {
		console.log("ℹ️  Dry-run: nada foi gravado. Rode novamente com --apply para aplicar.")
	}
}

const toFixed = (x) => Number(x).toFixed(2)

main()
	.catch((err) => {
		console.error("❌ Falha no recálculo:", err)
		process.exitCode = 1
	})
	.finally(async () => {
		await pool.end()
	})
