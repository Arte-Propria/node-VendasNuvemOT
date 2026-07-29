/**
 * Importa para orders_shop os pedidos MANUAIS (loja física / chatbot) que ficaram
 * presos apenas no dump legado `pedidos_<loja>`.
 * ---------------------------------------------------------------------------
 * Causa do gap: até a correção do createOrderController, o payload do popup
 * "Cadastrar pedido" chegava em mapNuvemshopToDelivery sem number/id/order_id e com
 * `token = "999999"` (o TOKEN_PLACEHOLDER). O order_id saía `undefined`, o upsert em
 * orders_shop lançava e o pedido sobrevivia só no dump.
 *
 * Diferença para migrateImportMissingOrders.js: aquele faz INSERT direto em
 * orders_shop com `id_cli = customer->>'identification'` (o CPF cru). Aqui passamos
 * pelo MESMO pipeline dos webhooks (processOrderFromNuvemshop), então o cliente é
 * resolvido pelo mapaLojas (LOJA FÍSICA - CHATBOT etc.) e clientes/categorias/coupon
 * também são atualizados.
 *
 * As datas são enviadas como ISO do instante lido pelo pg (o driver interpreta o
 * timestamp sem fuso do dump no fuso local do processo, BRT). Assim tanto o
 * dia-calendário SP quanto o dia de negócio (corte 03:00) resolvem para o dia real do
 * pedido — o helper toISOString do pipeline só aceita string, não Date.
 *
 * USO:
 *   node src/db/importManualOrdersFromDump.js --store=artepropria \
 *        --start=2026-07-25 --end=2026-07-25              # DRY-RUN
 *   node src/db/importManualOrdersFromDump.js --store=artepropria \
 *        --start=2026-07-25 --end=2026-07-25 --apply      # APLICA
 *
 * SEGURANÇA: dry-run padrão; só considera pedidos AUSENTES de orders_shop (idempotente);
 * a fonte (pedidos_<loja>) nunca é alterada. Com --apply, recalcula daily_sales do
 * período a partir do dump.
 */
import { pool } from "./db.js"
import { processOrderFromNuvemshop } from "../services/segmentacaoServices.js"
import { recalcAllDailySales } from "../services/dailySalesRecalc.js"
import { storeMapping } from "./dataBaseQueryList.js"

const DUMP_TABLES = { outlet: "pedidos_outlet", artepropria: "pedidos_artepropria" }

const arg = (name, fallback = null) => {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
	return hit ? hit.slice(name.length + 3) : fallback
}

const APPLY = process.argv.includes("--apply")
const STORE = arg("store", "artepropria")
const START = arg("start")
const END = arg("end")
// Por padrão só pedidos do chatbot; --owner-note=% importa qualquer pedido manual
const OWNER_NOTE_LIKE = arg("owner-note", "Chatbot%")

// Dia-calendário de São Paulo, mesmo critério do dailySalesRecalc e do filtro da tela.
const BRT_DATE_EXPR = "(p.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date"

// Offset do order_id sintético de loja física, por loja (espelha LOJA_FISICA_ORDER_ID_OFFSET).
const LOJA_FISICA_OFFSET = { artepropria: 3_000_000_000_000, outlet: 4_000_000_000_000 }

// O pedido pode já estar em orders_shop sob DUAS convenções de order_id:
//   - `number` do dump (chatbot e histórico, cujo token é o placeholder "999999");
//   - `offset + token` (loja física com token real — a convenção canônica do pipeline).
// Reconhecer só a primeira faria este script reimportar como "ausente" todo pedido migrado.
//
// O cast do token vai dentro de um CASE (e não guardado por AND) porque `token` é varchar e
// pedidos de ecommerce guardam ali um hash: com AND o planner avalia o cast antes do regex e
// estoura. CASE garante a ordem; token não-numérico vira NULL e a comparação fica falsa.
const SELECT_MISSING = (table) => `
  SELECT p.*
  FROM ${table} p
  WHERE p.number IS NOT NULL
    AND p.owner_note LIKE $1
    AND ($2::date IS NULL OR ${BRT_DATE_EXPR} >= $2::date)
    AND ($3::date IS NULL OR ${BRT_DATE_EXPR} <= $3::date)
    AND NOT EXISTS (
      SELECT 1 FROM orders_shop os
      WHERE os.store::text = $4
        AND (
          os.order_id = p.number::numeric
          OR os.order_id = $5::numeric + (
            CASE WHEN p.token ~ '^[0-9]{1,15}$' AND p.token <> '999999'
                 THEN p.token::numeric END
          )
        )
    )
  ORDER BY p.created_at, p.number
`

// O pipeline (toISOString) só aceita string; o pg devolve Date para timestamp sem fuso.
const toIso = (value) =>
	value instanceof Date ? value.toISOString() : value || null

// Reconstrói o payload no formato Nuvemshop a partir da linha do dump. As colunas do
// dump são espelho 1:1 dos campos do pedido, então o mapeamento é direto — só o
// `number` precisa ser garantido (é ele que vira orders_shop.order_id).
const toNuvemPayload = (row) => ({
	number: Number(row.number),
	id: row.id ?? null,
	token: row.token ?? null,
	store_id: row.store_id,
	created_at: toIso(row.created_at),
	paid_at: toIso(row.paid_at),
	updated_at: toIso(row.updated_at),
	status: row.status,
	payment_status: row.payment_status,
	payment_details: row.payment_details,
	customer: row.customer,
	products: row.products,
	coupon: row.coupon,
	discount_coupon: row.discount_coupon,
	total: row.total,
	subtotal: row.subtotal,
	storefront: row.storefront,
	owner_note: row.owner_note,
	note: row.note,
	billing_name: row.billing_name,
	billing_business_name: row.billing_business_name,
	billing_city: row.billing_city,
	billing_province: row.billing_province,
	billing_locality: row.billing_locality,
	billing_number: row.billing_number,
	billing_address: row.billing_address,
	billing_zipcode: row.billing_zipcode,
	contact_name: row.contact_name,
	contact_email: row.contact_email,
	contact_phone: row.contact_phone,
	contact_identification: row.contact_identification,
	shipping_option: row.shipping_option,
	shipping_status: row.shipping_status,
	shipping_cost_customer: row.shipping_cost_customer,
	shipping_cost_owner: row.shipping_cost_owner,
	shipping_max_days: row.shipping_max_days,
	shipping_min_days: row.shipping_min_days,
	shipping_tracking_url: row.shipping_tracking_url,
	gateway_link: row.gateway_link
})

async function main() {
	const table = DUMP_TABLES[STORE]
	const storeNum = storeMapping.nameToNumeric[STORE]
	if (!table || !storeNum) {
		console.error(`Loja desconhecida: ${STORE}. Use outlet ou artepropria.`)
		process.exitCode = 1
		return
	}

	console.log(
		`\n=== Importar pedidos manuais do dump → orders_shop — modo: ${APPLY ? "APLICAR" : "DRY-RUN (somente leitura)"} ===`
	)
	console.log(
		`loja=${STORE} (${storeNum})  owner_note LIKE '${OWNER_NOTE_LIKE}'  período=${START || "início"} .. ${END || "fim"}\n`
	)

	try {
		const { rows } = await pool.query(SELECT_MISSING(table), [
			OWNER_NOTE_LIKE, START, END, String(storeNum),
			String(LOJA_FISICA_OFFSET[STORE] ?? 0)
		])

		console.log(`Pedidos ausentes em orders_shop: ${rows.length}`)
		rows.forEach((r) =>
			console.log(
				`    number=${r.number} created_at=${r.created_at?.toISOString?.() ?? r.created_at} ` +
				`total=${r.total} owner_note=${r.owner_note}`
			)
		)

		if (!APPLY) {
			console.log("\nDRY-RUN: nada foi alterado. Rode com --apply para aplicar.\n")
			return
		}

		let ok = 0
		const failures = []
		for (const row of rows) {
			try {
				await processOrderFromNuvemshop(toNuvemPayload(row))
				ok++
			} catch (err) {
				failures.push({ number: row.number, message: err.message })
				console.error(`    ❌ number=${row.number}: ${err.message}`)
			}
		}
		console.log(`\n✅ Importados: ${ok}/${rows.length}`)
		if (failures.length) console.log(`❌ Falhas: ${failures.length}`)

		if (ok > 0) {
			// daily_sales é recalculado do dump (dia-calendário SP), a mesma fonte que o
			// Dashboard lê — o upsert incremental do pipeline usa o dia de negócio (corte 03:00).
			const totals = await recalcAllDailySales({
				stores: [STORE], startDate: START, endDate: END, apply: true
			})
			console.log(
				`daily_sales recalculado: ${totals.daysEvaluated} dia(s) avaliado(s), ` +
				`${totals.daysChanged} alterado(s), ${totals.inserts} insert(s), ${totals.updates} update(s)`
			)
		}
		console.log("\nConcluído.\n")
	} catch (err) {
		console.error("\n❌ ERRO:", err.message, "\n")
		process.exitCode = 1
	} finally {
		await pool.end()
	}
}

main()
