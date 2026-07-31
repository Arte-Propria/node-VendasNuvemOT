// ============================================================================
// Motor ÚNICO de agregação de daily_sales.
//
// Todo caminho que grava daily_sales passa por aqui: o webhook (via upsertDailySales),
// a criação/exclusão de pedido manual e o backfill em lote. Ter um só motor é o que
// impede a classe de bug de jul/2026, em que dois escritores com definições de dia
// diferentes se sobrescreviam e apagavam pedidos de loja física do Dashboard.
//
// FONTE PRIMÁRIA: o dump por loja (pedidos_outlet / pedidos_artepropria), que guarda a data
// real do pedido na Nuvemshop. NÃO usar orders_shop sozinho como fonte: os números de pedido
// colidem entre lojas (a Nuvemshop numera por loja) e order_id é chave única lá — são 1492
// colisões históricas confirmadas, que misturariam/perderiam pedidos entre as lojas.
//
// FONTE COMPLEMENTAR: pedidos que só existem em orders_shop. `POST /webhook/db/nuvemshop`,
// `syncNuvemshopOrders` e o fluxo Tiny gravam orders_shop SEM passar pelo dump — um motor
// dump-only os perderia. O anti-join abaixo os recupera sem risco de dupla contagem.
//
// DIA: dia-calendário BRT (00:00–23:59 em São Paulo), a mesma regra que o legado imprimia
// (`isOrderOnDate`) e que a listagem de pedidos/Estatísticas já usam. NÃO existe mais o
// "dia de negócio" com corte às 03:00: pedidos de loja física têm created_at 03:00 UTC
// (= 00:00 BRT) e o corte os lançava sistematicamente no dia anterior.
//
// Regras aplicadas (paridade com o Dashboard/legado `filterOrders`), E = pedidos com method ≠ 'other':
//   - total_money  = Σ total de E (Geral valor; inclui cancelado/estornado);
//   - total_orders = contagem de E com status≠'cancelled' e payment_status≠'voided' (Geral qtd);
//   - total_paid_* = E com status≠'cancelled' e payment_status='paid' (Pago);
//   - id_orders    = todos os pedidos do dia (membership; inclui parcerias).
//
// Idempotente: UPSERT por (date_sales, store), preservando id_sales das linhas existentes.
// ============================================================================
import { query } from "../db/db.js"
import { dataBase, storeMapping, LOJA_FISICA_ORDER_ID_OFFSET } from "../db/dataBaseQueryList.js"
import { toNumber } from "../tools/helpers.js"

const TABLES = { outlet: "pedidos_outlet", artepropria: "pedidos_artepropria" }
// O dump grava timestamp sem fuso (wall-clock UTC). Converte para a data local de São Paulo.
const BRT_DATE_EXPR = "(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date"

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100
const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))

/**
 * Agrupa por dia-calendário BRT os pedidos da loja: o dump UNIÃO os pedidos que existem
 * apenas em orders_shop (chegam por `POST /webhook/db/nuvemshop`, `syncNuvemshopOrders` ou
 * pelo fluxo Tiny, que não passam pelo dump).
 *
 * O anti-join usa as DUAS convenções de order_id de loja física: `number` (chatbot e histórico
 * com token placeholder) e `token + offset da loja`. Subtrai o offset — nunca `% 1e12`, que só
 * acerta enquanto o token cabe em 1e12 e o popup "Cadastrar pedido" gera ~1,8e15.
 */
async function fetchDayGroups(table, storeNum, startDate, endDate) {
	const sql = `
		WITH dump AS (
			SELECT ${BRT_DATE_EXPR} AS brt_date, number::numeric AS id_order, total::numeric AS total,
			       payment_status::text AS payment_status, status::text AS status, coupon, payment_details,
			       -- CASE obrigatório: o planner avalia o cast antes do regex, e token guarda hash
			       -- alfanumérico nos pedidos de ecommerce ("invalid input syntax for numeric").
			       CASE WHEN token ~ '^[0-9]{1,15}$' AND token <> '999999' THEN token::numeric END AS tok
			FROM ${table}
			WHERE created_at IS NOT NULL
		),
		orfaos AS (
			SELECT (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS brt_date,
			       o.order_id AS id_order, o.total::numeric AS total,
			       o.payment_status::text AS payment_status,
			       -- orders_shop não tem coluna status: active=0 é o equivalente de status='cancelled'
			       CASE WHEN o.active = 1 THEN NULL ELSE 'cancelled' END::text AS status,
			       NULL::jsonb AS coupon,
			       jsonb_build_object('method', o.payment_method) AS payment_details
			FROM ${dataBase.orders_shop} o
			WHERE o.store::text = $3::text
			  AND o.created_at IS NOT NULL
			  AND NOT EXISTS (
			      SELECT 1 FROM dump d
			      -- pedidos correspondentes compartilham created_at; ±1 dia cobre a borda do fuso
			      -- e evita varrer o dump inteiro quando há filtro de período
			      WHERE ($1::date IS NULL OR d.brt_date >= $1::date - 1)
			        AND ($2::date IS NULL OR d.brt_date <= $2::date + 1)
			        AND (d.id_order = o.order_id OR d.tok = o.order_id - $4::numeric)
			  )
		)
		SELECT brt_date, id_order, total, payment_status, status, coupon, payment_details FROM (
			SELECT brt_date, id_order, total, payment_status, status, coupon, payment_details FROM dump
			UNION ALL
			SELECT brt_date, id_order, total, payment_status, status, coupon, payment_details FROM orfaos
		) t
		WHERE ($1::date IS NULL OR brt_date >= $1::date)
		  AND ($2::date IS NULL OR brt_date <= $2::date)
		ORDER BY brt_date, id_order`
	const offset = LOJA_FISICA_ORDER_ID_OFFSET[storeNum] || 0
	const rows = (await query(sql, [startDate, endDate, String(storeNum), offset])).rows
	const groups = new Map()
	for (const r of rows) {
		const day = isoDate(r.brt_date)
		if (!groups.has(day)) groups.set(day, [])
		groups.get(day).push(r)
	}
	return groups
}

// Extrai o método de pagamento do jsonb payment_details (parceria = 'other').
function paymentMethodOf(o) {
	const pd = o.payment_details
	if (!pd) return null
	if (typeof pd === "string") {
		try { return JSON.parse(pd)?.method ?? null } catch { return null }
	}
	return pd.method ?? null
}

// Agrega um dia com paridade ao Dashboard/legado `filterOrders`.
// E = pedidos onde payment_method ≠ 'other' (parcerias fora de todos os totais numéricos):
//   total_money  = Σ total de E                                     (Geral valor; inclui cancelado/estornado)
//   total_orders = contagem de E com status≠'cancelled' e payment_status≠'voided'  (Geral qtd)
//   total_paid_* = E com status≠'cancelled' e payment_status='paid' (Pago)
// id_orders mantém todos os identificadores do dia (membership completa): o `number` do dump
// e, para os pedidos que só existem em orders_shop, o próprio `order_id`.
function computeRow(orders) {
	let totalMoney = 0, totalOrders = 0, paidMoney = 0, paidOrders = 0
	const idOrders = []
	const couponCodes = new Set()
	for (const o of orders) {
		idOrders.push(Number(o.id_order)) // membership completa (inclui parcerias)
		if (paymentMethodOf(o) === "other") continue // parcerias fora dos totais
		const t = toNumber(o.total)
		totalMoney += t                 // Geral valor: E (inclui cancelado/estornado)
		if (o.status !== "cancelled" && o.payment_status !== "voided") {
			totalOrders++               // Geral qtd: E, não cancelado e não estornado
			if (o.payment_status === "paid") { paidMoney += t; paidOrders++ }
		}
		if (o.status !== "cancelled") { // cupom de cancelado é revertido
			const cps = Array.isArray(o.coupon) ? o.coupon : []
			for (const c of cps) if (c?.code) couponCodes.add(c.code)
		}
	}
	return {
		total_orders: totalOrders,
		total_paid_orders: paidOrders,
		total_money: round2(totalMoney),
		total_paid_money: round2(paidMoney),
		aov: round2(totalOrders ? totalMoney / totalOrders : 0),
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
	// Não há índice único em (date_sales, store): dias com linha duplicada existem na base
	// e o Dashboard soma todas as linhas do período, contando o dia em dobro. Mantemos a
	// mais antiga (menor id_sales) e descartamos as demais.
	const existing = (await query(
		`SELECT id_sales FROM ${dataBase.daily_sales}
		 WHERE date_sales = $1 AND store = $2 ORDER BY id_sales`, [day, storeNum]
	)).rows

	if (existing.length) {
		if (existing.length > 1) {
			await query(
				`DELETE FROM ${dataBase.daily_sales} WHERE id_sales = ANY($1)`,
				[existing.slice(1).map((r) => r.id_sales)]
			)
		}
		await query(`
			UPDATE ${dataBase.daily_sales} SET
				total_orders=$1, total_paid_orders=$2, total_money=$3, total_paid_money=$4,
				aov=$5, id_orders=$6, id_coupons=$7, id_ads=$8, active=1, updated_at=$9
			WHERE id_sales=$10`,
		[c.total_orders, c.total_paid_orders, c.total_money, c.total_paid_money, c.aov,
			JSON.stringify(c.id_orders), JSON.stringify(idCoupons), JSON.stringify(idAds),
			now, existing[0].id_sales])
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
 * Recalcula daily_sales (regra Bruto/Pago, dia-calendário BRT) a partir do dump pedidos_<store>
 * unido aos pedidos que só existem em orders_shop. É o motor único: o webhook chega aqui via
 * upsertDailySales, e criação/exclusão de pedido manual e backfill chamam esta função direto.
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
		const groups = await fetchDayGroups(table, storeNum, startDate, endDate)
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
