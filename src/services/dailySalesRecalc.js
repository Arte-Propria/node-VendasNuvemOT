// ============================================================================
// Recálculo em lote de daily_sales (corretivo).
//
// FONTE: o dump por loja (pedidos_outlet / pedidos_artepropria), que guarda a data real
// do pedido na Nuvemshop. ATENÇÃO: NÃO usar orders_shop como fonte de agregação — os números
// de pedido (order_id) colidem entre lojas (a Nuvemshop numera por loja) e orders_shop tem
// order_id como chave única, então um mesmo número mistura/perde pedidos entre lojas.
//
// Regras aplicadas:
//   - Dia de negócio em horário local do Brasil (BRT, UTC-3, DST-aware);
//   - "Bruto / Pago":
//       BRUTO (total_orders/total_money/id_orders) = TODOS os pedidos (inclui cancelado/pendente);
//       PAGO  (total_paid_orders/total_paid_money) = pagos E não cancelados.
//
// Idempotente: UPSERT por (date_sales, store), preservando id_sales das linhas existentes.
// ============================================================================
import { query } from "../db/db.js"
import { dataBase, storeMapping } from "../db/dataBaseQueryList.js"
import { toNumber } from "../tools/helpers.js"

const TABLES = { outlet: "pedidos_outlet", artepropria: "pedidos_artepropria" }
// O dump grava timestamp sem fuso (wall-clock UTC). Converte para a data local de São Paulo.
const BRT_DATE_EXPR = "(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date"

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100
const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))

async function fetchDumpGroups(table, startDate, endDate) {
	const sql = `
		SELECT brt_date, number, total, payment_status, status, coupon FROM (
			SELECT ${BRT_DATE_EXPR} AS brt_date, number, total, payment_status, status, coupon
			FROM ${table}
			WHERE created_at IS NOT NULL
		) t
		WHERE ($1::date IS NULL OR brt_date >= $1::date)
		  AND ($2::date IS NULL OR brt_date <= $2::date)
		ORDER BY brt_date, number`
	const rows = (await query(sql, [startDate, endDate])).rows
	const groups = new Map()
	for (const r of rows) {
		const day = isoDate(r.brt_date)
		if (!groups.has(day)) groups.set(day, [])
		groups.get(day).push(r)
	}
	return groups
}

// Agrega um dia segundo a regra Bruto/Pago.
function computeRow(orders) {
	let totalMoney = 0, paidMoney = 0, paidOrders = 0
	const idOrders = []
	const couponCodes = new Set()
	for (const o of orders) {
		const t = toNumber(o.total)
		totalMoney += t                 // bruto: todos os pedidos
		idOrders.push(Number(o.number))
		if (o.payment_status === "paid" && o.status !== "cancelled") { paidMoney += t; paidOrders++ }
		if (o.status !== "cancelled") { // cupom de cancelado é revertido
			const cps = Array.isArray(o.coupon) ? o.coupon : []
			for (const c of cps) if (c?.code) couponCodes.add(c.code)
		}
	}
	return {
		total_orders: orders.length,
		total_paid_orders: paidOrders,
		total_money: round2(totalMoney),
		total_paid_money: round2(paidMoney),
		aov: round2(orders.length ? totalMoney / orders.length : 0),
		id_orders: idOrders,
		couponCodes: [...couponCodes]
	}
}

async function resolveCouponIds(codes, day) {
	const ids = []
	for (const code of codes) {
		let res = await query(`SELECT id_coupon FROM ${dataBase.coupon} WHERE name = $1 AND date_coupon = $2`, [code, day])
		if (!res.rows.length) {
			res = await query(`SELECT id_coupon FROM ${dataBase.coupon} WHERE name = $1 ORDER BY date_coupon DESC LIMIT 1`, [code])
		}
		if (res.rows.length) ids.push(res.rows[0].id_coupon)
	}
	return ids
}

async function adsIdsFor(day, storeName) {
	const res = await query(`SELECT id_ads FROM ${dataBase.ads} WHERE date_ads = $1 AND store = $2`, [day, storeName])
	return res.rows.map((r) => r.id_ads)
}

async function upsertRow(day, storeNum, c, idCoupons, idAds, now) {
	const exists = (await query(
		`SELECT id_sales FROM ${dataBase.daily_sales} WHERE date_sales = $1 AND store = $2`, [day, storeNum]
	)).rows[0]

	if (exists) {
		await query(`
			UPDATE ${dataBase.daily_sales} SET
				total_orders=$1, total_paid_orders=$2, total_money=$3, total_paid_money=$4,
				aov=$5, id_orders=$6, id_coupons=$7, id_ads=$8, active=1, updated_at=$9
			WHERE date_sales=$10 AND store=$11`,
		[c.total_orders, c.total_paid_orders, c.total_money, c.total_paid_money, c.aov,
			JSON.stringify(c.id_orders), JSON.stringify(idCoupons), JSON.stringify(idAds),
			now, day, storeNum])
		return "UPDATE"
	}
	await query(`
		INSERT INTO ${dataBase.daily_sales}
			(date_sales, store, total_orders, total_paid_orders, total_money, total_paid_money,
			 aov, id_orders, id_coupons, id_ads, active, dt_att_active, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11,$12,$12)`,
	[day, storeNum, c.total_orders, c.total_paid_orders, c.total_money, c.total_paid_money,
		c.aov, JSON.stringify(c.id_orders), JSON.stringify(idCoupons), JSON.stringify(idAds),
		now.slice(0, 10), now])
	return "INSERT"
}

/**
 * Recalcula daily_sales (regra Bruto/Pago, dia BRT) a partir do dump pedidos_<store>.
 * @param {Object} [options]
 * @param {string[]} [options.stores=["outlet","artepropria"]]
 * @param {string|null} [options.startDate=null] - filtro BRT inicial 'YYYY-MM-DD' (inclusive)
 * @param {string|null} [options.endDate=null]   - filtro BRT final 'YYYY-MM-DD' (inclusive)
 * @param {boolean} [options.apply=false] - false = dry-run; true = grava
 * @param {(ev:Object)=>void} [options.onProgress]
 * @returns {Promise<{daysEvaluated:number, daysChanged:number, inserts:number, updates:number}>}
 */
export async function recalcAllDailySales(options = {}) {
	const {
		stores = ["outlet", "artepropria"],
		startDate = null,
		endDate = null,
		apply = false,
		onProgress = null
	} = options

	const now = new Date().toISOString()
	const totals = { daysEvaluated: 0, daysChanged: 0, inserts: 0, updates: 0 }

	for (const store of stores) {
		const table = TABLES[store]
		const storeNum = storeMapping.nameToNumeric[store]
		if (!table || !storeNum) {
			if (onProgress) onProgress({ type: "warn", message: `Loja desconhecida: ${store}` })
			continue
		}
		const groups = await fetchDumpGroups(table, startDate, endDate)
		if (onProgress) onProgress({ type: "store", store, storeNum, days: groups.size })

		for (const [day, orders] of [...groups.entries()].sort()) {
			totals.daysEvaluated++
			const c = computeRow(orders)
			// resolução de cupom/ads só é necessária ao gravar (economiza queries no dry-run)
			const idCoupons = apply ? await resolveCouponIds(c.couponCodes, day) : []
			const idAds = apply ? await adsIdsFor(day, store) : []

			const prev = (await query(
				`SELECT total_orders, total_money, total_paid_money FROM ${dataBase.daily_sales} WHERE date_sales=$1 AND store=$2`,
				[day, storeNum]
			)).rows[0]
			const changed = !prev
				|| toNumber(prev.total_money) !== c.total_money
				|| toNumber(prev.total_paid_money) !== c.total_paid_money
				|| prev.total_orders !== c.total_orders
			if (changed) totals.daysChanged++

			if (apply) {
				const op = await upsertRow(day, storeNum, c, idCoupons, idAds, now)
				if (op === "INSERT") totals.inserts++
				else totals.updates++
			}
			if (onProgress) onProgress({ type: "day", store, day, changed, prev, computed: c, applied: apply })
		}
	}
	return totals
}
