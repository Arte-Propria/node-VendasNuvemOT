import {
	fetchRequest,
	filterBdByDateRange,
	processOrderFromTiny,
	processOrderFromNuvemshop,
	syncNuvemshopOrders,
	chamarAdsWebhooksPeriodo
} from "../services/segmentacaoServices.js"
import {
	dataBase,
	dataBaseDb,
	fetchMetaAdsByDate,
	fetchGoogleAdsByDate
} from "../db/dataBaseQueryList.js"
import { upsertAds } from "../db/upsert.js"
import { query } from "../db/db.js"

// Allowlist de tabelas consultáveis: querySelect é interpolado direto no SQL
// (`SELECT * FROM ${querySelect}`), então só aceitamos os nomes físicos conhecidos
// (defesa contra injeção / tabela inválida). Mesmo conjunto usado em upsert.js.
const ALLOWED_QUERY_TABLES = new Set(Object.values(dataBase))

// Dump por loja — fonte legada da tela de Cupons (mesma tabela lida por /db/orders e por
// dailySalesRecalc). Nomes fixos, nunca vindos do input (sem risco de injeção).
const DUMP_TABLES = { outlet: "pedidos_outlet", artepropria: "pedidos_artepropria" }
const NUMERIC_TO_STORE_NAME = { 3889735: "outlet", 1146504: "artepropria" }
// created_at é wall-clock UTC (timestamp sem fuso) → dia-calendário de São Paulo (SEM corte
// 03:00), idêntico ao BRT_DATE_EXPR de dailySalesRecalc.js. Casa com o filtro local (BRT) que
// a tela legada aplicava via isOrderOnDate.
const COUPON_BRT_DATE_EXPR =
	"(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date"

// ---------------------------------------------------------------------------
// PUSHDOWN DO FILTRO DE DATA
//
// Antes, getDbQuery baixava a tabela INTEIRA da loja e o período era aplicado
// depois, em JS, por filterBdByDateRange. Medido: um mês do outlet transferia
// 26.256 linhas / ~32 MB para devolver ~320 pedidos.
//
// Regra de ouro: quem DEFINE o resultado continua sendo filterBdByDateRange.
// O SQL abaixo só PRÉ-FILTRA — e de propósito com 1 dia de folga em cada extremo.
//
// Motivo da folga: o filtro JS é sensível ao fuso do PROCESSO Node. O driver `pg`
// materializa `timestamp without time zone` como Date em hora LOCAL, e
// toLocalDateBR converte esse instante para America/Sao_Paulo — então o dia
// calculado muda conforme o TZ. Comprovado por scripts/checkBrtParity.js: sob
// TZ=UTC (o da Render) o predicado SQL bate em 30.307 das 30.309 linhas; sob
// TZ=America/Sao_Paulo, 4.018 divergem.
//
// Com a folga de ±1 dia o conjunto entregue ao JS é sempre um SUPERCONJUNTO do
// que ele manteria, qualquer que seja o TZ — logo a saída final é idêntica à de
// antes por construção, sem depender do ambiente. Custo: ~2 dias extras num
// período de 31 (≈ +6% de linhas).
const DATE_PAD_DAYS = 1

// Espelho SQL do `dateFieldMap` de filterBdByDateRange (segmentacaoServices.js).
// MANTENHA OS DOIS EM SINCRONIA: uma tabela nova precisa entrar nos dois mapas.
//   kind "date"      → coluna DATE, comparada por dia-calendário
//   kind "timestamp" → coluna TIMESTAMP, comparada por instante (limite superior
//                      é meia-noite EXCLUSIVA, que reproduz o <= 23:59:59.999 do JS)
//   kind "brt"       → TIMESTAMP gravado em UTC convertido para o dia-calendário
//                      de São Paulo. Única tabela que hoje passa por toLocalDateBR.
const DATE_FILTER = {
	[dataBase.ads]: { kind: "date", expr: "date_ads" },
	[dataBase.clients]: { kind: "timestamp", expr: "dt_criacao_cli" },
	[dataBase.coupon]: { kind: "date", expr: "date_coupon" },
	[dataBase.daily_sales]: { kind: "date", expr: "date_sales" },
	[dataBase.orders_shop]: {
		kind: "brt",
		expr: "((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date"
	},
	[dataBase.product]: { kind: "date", expr: "dt_att_categoria" }
}

// Só empurra para o SQL datas que EXISTEM de fato. "2026-13-45" casa com o regex
// mas estoura no `::date` do Postgres (500), enquanto o parseDate do JS hoje a
// normaliza em silêncio e devolve 200. Nesses casos não geramos predicado algum
// e deixamos o JS decidir, exatamente como antes.
const isRealIsoDate = (s) => {
	if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
	const [y, m, d] = s.split("-").map(Number)
	const dt = new Date(Date.UTC(y, m - 1, d))
	return (
		dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
	)
}

/** Devolve as cláusulas de data da tabela e ANEXA os parâmetros em `params`. */
const buildDateClauses = (table, startDate, endDate, params) => {
	const cfg = DATE_FILTER[table]
	// Tabela sem campo de data mapeado → sem predicado, igual a hoje
	// (filterBdByDateRange loga o aviso e devolve tudo).
	if (!cfg) return []

	// Período INVERTIDO (start > end): não empurra nada para o SQL.
	//
	// filterBdByDateRange lança "Data inicial não pode ser maior que data final"
	// → o catch de getDbQuery devolve 500. Mas essa validação está DEPOIS do
	// early-return de lista vazia (`if (queryData.length === 0) return []`), então
	// um pré-filtro que corta tudo faria o 500 virar 200 [] — regressão silenciosa
	// pega pelo scripts/parityDiff.js. Deixando o conjunto completo chegar ao JS,
	// o erro continua sendo lançado exatamente como antes.
	if (
		isRealIsoDate(startDate) &&
		isRealIsoDate(endDate) &&
		startDate > endDate // ISO YYYY-MM-DD ordena lexicograficamente = cronologicamente
	) {
		return []
	}

	const clauses = []
	if (isRealIsoDate(startDate)) {
		params.push(startDate)
		clauses.push(`${cfg.expr} >= ($${params.length}::date - ${DATE_PAD_DAYS})`)
	}
	if (isRealIsoDate(endDate)) {
		params.push(endDate)
		// +1 do padding e +1 da meia-noite exclusiva do dia seguinte.
		clauses.push(`${cfg.expr} < ($${params.length}::date + ${DATE_PAD_DAYS + 1})`)
	}
	return clauses
}

// Colunas exatamente no conjunto que cada dataBaseDb.<t>.transform consome.
// Nota honesta: hoje isso NÃO reduz payload — todo transform usa 100% das colunas
// da sua tabela (só `coupon.id_coupon` sobra, e esse caminho nem é alcançado,
// porque getCouponUsageFromDump intercepta antes). A lista existe para congelar o
// contrato: um ALTER TABLE ... ADD COLUMN futuro não entra sozinho na resposta.
// A ordem das chaves no JSON é ditada pelo transform, não por este SELECT.
const SELECT_COLUMNS = {
	[dataBase.orders_shop]:
		"order_id, id_cli, store, total, subtotal, payment_status, coupons, " +
		"coupon_discount, products, products_detail, shipping_option, created_at, " +
		"paid_at, updated_at, active, storefront, shipping_status, gateway_link, " +
		"payment_method, url_tracking, markers_order_tiny, fiscal_note, " +
		"estimated_delivery, shipping_cost, shipping_cost_owner, order_tracking_link",
	[dataBase.ads]:
		"id_ads, date_ads, plataform, funding_ecom, funding_store, funding_general, " +
		"funding_chatbot, funding_insta, funding_mirror, funding_painting, active, " +
		"store, funding_all, total_visits, users_by_device, carts, begin_checkout, impressions",
	[dataBase.clients]:
		"id_cli, cpf_cnpj_cli, nome_cli, email_cli, fone_cli, tipo_cli, bairro_cli, " +
		"cidade_cli, numero_cli, uf_cli, cep_cli, endereco_cli, dt_criacao_cli, " +
		"ativo, dt_att_ativo, origem_cli",
	[dataBase.daily_sales]:
		"id_sales, date_sales, total_orders, total_paid_orders, total_money, " +
		"total_paid_money, aov, id_ads, store, id_orders, id_coupons, active, " +
		"dt_att_active, created_at, updated_at",
	[dataBase.product]:
		"cod_categoria, nome_categoria, desc_categoria, grp_categoria, ativo, " +
		"dim_categoria, cor_categoria, tipo_categoria, dt_att_ativo, dt_att_categoria, " +
		"img_categoria, custo_categoria, tempo_prod_categoria, preco",
	[dataBase.coupon]:
		"date_coupon, name, quantity, total_money, total_discount, order_ids, store"
}

// Recalcula o uso de cupons a partir do dump pedidos_<loja>, reproduzindo EXATAMENTE a lógica
// da tela legada de Cupons: filtra pelos mesmos critérios do filterOrders (exclui cancelled,
// payment_status='voided' e payment_details.method='other' — estes últimos são os cupons
// DRAFT-ORDER-* de pedidos manuais) e, por pedido sobrevivente, soma 1 uso e o order.total por
// código de cupom. Garante paridade com o legado sem depender da tabela `coupon` (que é escrita
// por webhook sem esses filtros). Agrega também os order_id dos pedidos sobreviventes, que a
// tela de Estatísticas usa para mapear cada cupom aos seus pedidos em orders_shop.
const getCouponUsageFromDump = async (store, startDate, endDate) => {
	let name = store
	if (/^\d+$/.test(String(store))) name = NUMERIC_TO_STORE_NAME[Number(store)] || null
	const table = DUMP_TABLES[name]
	if (!table) return [] // loja desconhecida → sem resultados

	const sql = `
		SELECT
			c->>'code'                       AS name,
			COUNT(*)::int                    AS quantity,
			ROUND(SUM(o.total)::numeric, 2)  AS total_money,
			MAX(c->>'type')                  AS discount_type,
			MAX((c->>'value')::numeric)      AS discount_value,
			COALESCE(
				jsonb_agg(DISTINCT o.order_id) FILTER (WHERE o.order_id IS NOT NULL),
				'[]'::jsonb
			)                                AS order_ids
		FROM ${table} o
		CROSS JOIN LATERAL jsonb_array_elements(
			CASE WHEN jsonb_typeof(o.coupon) = 'array' THEN o.coupon ELSE '[]'::jsonb END
		) AS c
		WHERE o.created_at IS NOT NULL
			AND (o.payment_details->>'method') IS DISTINCT FROM 'other'
			AND o.status         IS DISTINCT FROM 'cancelled'
			AND o.payment_status IS DISTINCT FROM 'voided'
			AND ($1::date IS NULL OR ${COUPON_BRT_DATE_EXPR} >= $1::date)
			AND ($2::date IS NULL OR ${COUPON_BRT_DATE_EXPR} <= $2::date)
		GROUP BY c->>'code'
		ORDER BY quantity DESC`

	const { rows } = await query(sql, [startDate || null, endDate || null])

	// Shape compatível com o CouponRow que o front já consome. total_discount recebe o VALOR
	// do cupom (mesma fonte que o legado usava na coluna Desconto); discount_type habilita o
	// render type-aware (percentage → "N%" vs absolute → "R$ x,xx") no front.
	// order_ids vem do MESMO conjunto de pedidos que gera quantity/total_money (já sem
	// cancelled/voided/method='other'), então a contagem casa com a coluna "Usado" da tela de
	// Cupons. É o que permite ao DataSectionCart (Estatísticas) resolver cada id em orders_shop
	// — o dump e orders_shop compartilham a mesma identidade order_id.
	return rows.map((r) => ({
		date_coupon: null,
		name: r.name,
		quantity: Number(r.quantity) || 0,
		total_money: Number(r.total_money) || 0,
		total_discount: Number(r.discount_value) || 0,
		discount_type: r.discount_type || null,
		order_ids: Array.isArray(r.order_ids) ? r.order_ids : [],
		store: name
	}))
}

export const getDbQuery = async (req, res) => {
	try {
		const { querySelect, startDate, endDate, store } = req.params

		// Valida a tabela ANTES de qualquer interpolação no SQL.
		if (!ALLOWED_QUERY_TABLES.has(querySelect)) {
			return res.status(400).json({
				error: `Tabela inválida: '${querySelect}'. Permitidas: ${[...ALLOWED_QUERY_TABLES].join(", ")}`
			})
		}

		// Cupons: paridade EXATA com a tela legada. Em vez de ler a tabela `coupon` (escrita por
		// pedido no webhook, sem filtro de status), recalcula o uso a partir do dump pedidos_<loja>
		// aplicando os mesmos filtros do filterOrders legado — o que exclui os cupons DRAFT-ORDER-*
		// (pedidos manuais com payment_method='other') e alinha Usado/Faturamento ao legado.
		// O retorno inclui order_ids (mesmo conjunto filtrado) para a tela de Estatísticas.
		if (querySelect === "coupon") {
			const data = await getCouponUsageFromDump(store, startDate, endDate)
			return res.status(200).json(data)
		}

		// A coluna `store` tem REPRESENTAÇÃO diferente por tabela:
		//  - orders_shop / daily_sales → código numérico (ex.: 3889735)
		//  - ads / coupon              → nome amigável ("outlet"/"artepropria")
		// Por isso o valor do filtro precisa ser convertido para o formato da tabela-alvo.
		const STORE_TO_NUMERIC = { outlet: 3889735, artepropria: 1146504 }
		const NUMERIC_TO_NAME = { 3889735: "outlet", 1146504: "artepropria" }
		const storeColumnType = {
			orders_shop: "numeric",
			daily_sales: "numeric",
			ads: "name",
			coupon: "name"
		}

		// Normaliza a entrada; string vazia / só espaços conta como ausência de filtro.
		const storeParam = store !== undefined ? String(store).trim() : undefined
		const hasStoreFilter = storeParam !== undefined && storeParam !== ""

		// Validação: store só é suportado nas tabelas que possuem a coluna mapeada
		if (hasStoreFilter && !storeColumnType[querySelect]) {
			return res.status(400).json({
				error: `Filtro 'store' não suportado para a tabela '${querySelect}'. Tabelas permitidas: ${Object.keys(storeColumnType).join(", ")}`
			})
		}

		// Resolve o valor de store na representação correta para a tabela-alvo,
		// aceitando tanto o nome amigável quanto o código numérico na entrada.
		let storeValue
		if (hasStoreFilter) {
			let name = null
			let numeric = null
			if (storeParam === "outlet" || storeParam === "artepropria") {
				name = storeParam
				numeric = STORE_TO_NUMERIC[storeParam]
			} else if (/^\d+$/.test(storeParam)) {
				// Apenas dígitos: trata como código numérico (evita coerções frouxas
				// de isNaN, ex.: "0x10", "1e3" ou espaços virando número).
				numeric = Number(storeParam)
				name = NUMERIC_TO_NAME[numeric] || null
			} else {
				name = storeParam // nome desconhecido: usa como veio
			}
			storeValue = storeColumnType[querySelect] === "name" ? name : numeric

			// Filtro pedido mas não resolvível para a representação desta tabela
			// (ex.: ads/coupon com um código numérico sem nome conhecido) → sem resultados.
			if (storeValue === null || storeValue === undefined) {
				return res.status(200).json([])
			}
		}

		// Monta a consulta SQL: filtro de loja + PRÉ-filtro de data (com folga).
		const params = []
		const where = []

		if (storeValue !== undefined) {
			params.push(storeValue)
			where.push(`store = $${params.length}`)
		}
		where.push(...buildDateClauses(querySelect, startDate, endDate, params))

		// ORDER BY ctid preserva a ordem FÍSICA que o Seq Scan produzia antes do
		// índice. Sem isso um Index Scan reordenaria o array e a resposta, embora
		// com o mesmo conjunto de linhas, teria bytes diferentes. Custo: um Sort de
		// algumas centenas de linhas.
		const sql =
			`SELECT ${SELECT_COLUMNS[querySelect] ?? "*"} FROM ${querySelect}` +
			(where.length ? ` WHERE ${where.join(" AND ")}` : "") +
			" ORDER BY ctid"

		const result = await query(sql, params)
		const queryData = await fetchRequest(result, querySelect)
		// PERMANECE: é ele quem define o contrato de saída (inclusive os erros de
		// validação, como startDate > endDate → 500). Agora opera sobre centenas de
		// linhas em vez de dezenas de milhares.
		const filterDataByDate = await filterBdByDateRange(queryData, querySelect, {
			startDate,
			endDate
		})

		return res.status(200).json(filterDataByDate)
	} catch (err) {
		console.error("Erro ao buscar database:", err)
		return res.status(500).json({ error: "Erro ao buscar pedidos" })
	}
}

// Buscar cupom por ID
export const getCouponById = async (req, res) => {
	try {
		const { id } = req.params
		if (!id) {
			return res.status(400).json({ error: "ID do cupom é obrigatório" })
		}

		let sql = `SELECT * FROM ${dataBase.coupon} WHERE id_coupon = $1`
		const params = [id]

		const result = await query(sql, params)
		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Cupom não encontrado" })
		}
		// Transformar usando dataBaseDb.coupon.transform se necessário, mas já está no formato da tabela.
		return res.status(200).json(result.rows[0])
	} catch (err) {
		console.error("Erro ao buscar cupom:", err)
		return res.status(500).json({ error: "Erro ao buscar cupom" })
	}
}

// Buscar cliente por ID (cpf_cnpj_cli ou id_cli)
export const getClientById = async (req, res) => {
	try {
		const { id } = req.params
		if (!id) {
			return res.status(400).json({ error: "ID do cliente é obrigatório" })
		}

		// Tentar buscar por id_cli ou cpf_cnpj_cli
		const isNumeric = /^\d+$/.test(id)
		let sql, params
		if (isNumeric) {
			sql = `SELECT * FROM ${dataBase.clients} WHERE id_cli = $1`
			params = [id]
		} else {
			sql = `SELECT * FROM ${dataBase.clients} WHERE cpf_cnpj_cli = $1`
			params = [id]
		}

		const result = await query(sql, params)
		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Cliente não encontrado" })
		}
		return res.status(200).json(result.rows[0])
	} catch (err) {
		console.error("Erro ao buscar cliente:", err)
		return res.status(500).json({ error: "Erro ao buscar cliente" })
	}
}

// Buscar produto por SKU (cod_categoria)
export const getProductBySku = async (req, res) => {
	try {
		const { sku } = req.params
		if (!sku) {
			return res.status(400).json({ error: "SKU do produto é obrigatório" })
		}

		const cod = sku.toUpperCase().trim()
		let sql = `SELECT * FROM ${dataBase.product} WHERE cod_categoria = $1`
		const params = [cod]

		const result = await query(sql, params)
		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Produto não encontrado" })
		}
		return res.status(200).json(result.rows[0])
	} catch (err) {
		console.error("Erro ao buscar produto:", err)
		return res.status(500).json({ error: "Erro ao buscar produto" })
	}
}

// Desfaz até 3 níveis de codificação JSON em string e garante array.
// orders_shop.products chega como JSON string (às vezes duplamente codificada),
// mesma situação tratada por parseJsonbFields no front (src/api/db.ts).
const parseProductsField = (value) => {
	let v = value
	let guard = 0
	while (typeof v === "string" && guard < 3) {
		try {
			v = JSON.parse(v)
		} catch {
			return []
		}
		guard += 1
	}
	return Array.isArray(v) ? v : []
}

// Extrai o "número" curto do SKU para exibição, replicando exatamente a lógica
// da tela LEGADA de Produtos (por loja). Ex.: outlet Quadro "OT|109-..." → "109";
// espelho "OTE50-..." → "OTE50"; artepropria "AP1394-..." → "1394". Envolvido em
// try/catch: no legado uma linha malformada quebraria o forEach inteiro; aqui só
// cai no fallback (trecho antes do 1º "-").
const legacySkuNumber = (sku, cleanedName, storeName) => {
	try {
		if (!sku) return "Slim"
		let skuNumber = sku.split("-")[0]
		if (storeName === "outlet") {
			if (cleanedName.includes("Quadro")) {
				skuNumber = sku.split("-")[0].split("OT")[1].split("|")[1]
			}
		} else if (storeName === "artepropria") {
			skuNumber = sku.split("-")[0].split("AP")[1]
		}
		return skuNumber ?? sku.split("-")[0]
	} catch {
		return sku ? sku.split("-")[0] : "Slim"
	}
}

// Vendas históricas por produto (all-time), por loja — reproduz a agregação da
// tela LEGADA de Produtos sobre a base nova (orders_shop enriquecida).
// GET /db/product-sales/:store → { products: [...], variations: [...] }
//
// Regras (idênticas ao legado, ref.: git b2ed549 src/components/Products/index.jsx):
//   - Fonte por linha: orders_shop.products_detail { product_id, sku, name, price,
//     image, variant_values } (preenchido pelo webhook Nuvemshop e pelo backfill).
//     Fallback para products (só SKUs) quando o detalhe não existe.
//   - SEM filtro de status: conta TODOS os pedidos (paid/voided/refunded/pending),
//     como o legado, que lia pedidos_* inteiro. SEM filtro de data (histórico).
//   - Agrupa por product_id; sales += 1 por linha; revenue += price (histórico da
//     linha); pula placeholder de Loja Física (nome contém "produto").
//   - Variações: variant_values.join(", ") — contagem por combinação.
export const getProductSales = async (req, res) => {
	try {
		const { store } = req.params

		// orders_shop.store é TEXT com o código numérico; resolve nome amigável p/ o legacySkuNumber.
		const STORE_TO_NUMERIC = { outlet: 3889735, artepropria: 1146504 }
		const NUMERIC_TO_NAME = { 3889735: "outlet", 1146504: "artepropria" }
		const storeParam = store !== undefined ? String(store).trim() : ""
		let storeValue
		if (storeParam === "outlet" || storeParam === "artepropria") {
			storeValue = STORE_TO_NUMERIC[storeParam]
		} else if (/^\d+$/.test(storeParam)) {
			storeValue = Number(storeParam)
		} else {
			// Loja não resolvível → sem resultados.
			return res.status(200).json({ products: [], variations: [] })
		}
		const storeName = NUMERIC_TO_NAME[storeValue] || null

		// store é TEXT em orders_shop → compara como texto.
		const sql =
			"SELECT products, products_detail FROM orders_shop WHERE store = $1"
		const result = await query(sql, [String(storeValue)])

		const salesMap = new Map() // product_id (ou sku no fallback) -> agregado
		const variationMap = new Map() // combinação de variação -> { id, name, sales }

		const addVariation = (entry, label) => {
			if (!label) return
			entry.variantCount[label] = (entry.variantCount[label] || 0) + 1
			const v = variationMap.get(label) || { id: label, name: label, sales: 0 }
			v.sales += 1
			variationMap.set(label, v)
		}

		for (const row of result.rows) {
			const detail = Array.isArray(row.products_detail)
				? row.products_detail
				: parseProductsField(row.products_detail)

			if (detail.length > 0) {
				// ---- Caminho rico (legado fiel) ----
				for (const line of detail) {
					const rawName = line?.name || ""
					const cleanedName = rawName.replace(/\(.*?\)/g, "").trim()
					if (cleanedName.toLowerCase().includes("produto")) continue // placeholder Loja Física

					// Agrupa por product_id; sem product_id (ex.: Tiny), cai no sku para não colapsar tudo.
					const key =
						line?.product_id != null ? String(line.product_id) : `sku:${line?.sku}`
					let entry = salesMap.get(key)
					if (!entry) {
						entry = {
							id: line?.product_id != null ? line.product_id : line?.sku,
							sku: line?.sku || null,
							skuNumber: legacySkuNumber(line?.sku, cleanedName, storeName),
							name: cleanedName,
							image: line?.image || null,
							sales: 0,
							revenue: 0,
							variantCount: {}
						}
						salesMap.set(key, entry)
					}
					entry.sales += 1
					entry.revenue += parseFloat(line?.price || 0) || 0
					if (!entry.image && line?.image) entry.image = line.image

					const label = Array.isArray(line?.variant_values)
						? line.variant_values.join(", ")
						: ""
					addVariation(entry, label)
				}
			} else {
				// ---- Fallback (só SKUs): sem product_id/preço/variação ----
				const skus = parseProductsField(row.products)
				for (const sku of skus) {
					if (String(sku).toLowerCase().includes("produto")) continue
					const key = `sku:${sku}`
					let entry = salesMap.get(key)
					if (!entry) {
						entry = {
							id: sku,
							sku,
							skuNumber: legacySkuNumber(sku, "", storeName),
							name: sku,
							image: null,
							sales: 0,
							revenue: 0,
							variantCount: {}
						}
						salesMap.set(key, entry)
					}
					entry.sales += 1
				}
			}
		}

		// Variação mais vendida por produto (para o rótulo por linha), como no novo layout.
		const products = [...salesMap.values()].map((p) => {
			const top = Object.entries(p.variantCount).sort((a, b) => b[1] - a[1])[0]
			return { ...p, variations: top ? top[0] : "" }
		})
		const variations = [...variationMap.values()].sort((a, b) => b.sales - a.sales)

		return res.status(200).json({ products, variations })
	} catch (err) {
		console.error("Erro ao buscar vendas por produto:", err)
		return res.status(500).json({ error: "Erro ao buscar vendas por produto" })
	}
}

/**
 * Endpoint genérico de busca por ID:  GET /db/:table/:id
 * Mapeia cada tabela lógica para o nome físico, sua chave primária e o transform.
 */
const ID_TABLE_MAP = {
	orders_shop: {
		table: dataBase.orders_shop,
		pk: "order_id",
		transform: dataBaseDb.orders_shop?.transform
	},
	clients: {
		table: dataBase.clients,
		pk: "id_cli",
		transform: dataBaseDb.clients?.transform
	},
	product: {
		table: dataBase.product,
		pk: "cod_categoria",
		transform: dataBaseDb.product?.transform
	},
	coupon: {
		table: dataBase.coupon,
		pk: "id_coupon",
		transform: dataBaseDb.coupon?.transform
	},
	ads: {
		table: dataBase.ads,
		pk: "id_ads",
		transform: dataBaseDb.ads?.transform
	},
	daily_sales: {
		table: dataBase.daily_sales,
		pk: "id_sales",
		transform: dataBaseDb.daily_sales?.transform
	}
}

export const getItemById = async (req, res) => {
	const { table, id } = req.params
	try {
		const config = ID_TABLE_MAP[table]
		if (!config) {
			return res.status(400).json({
				error: `Tabela inválida. Permitidas: ${Object.keys(ID_TABLE_MAP).join(", ")}`
			})
		}

		// clients: id_cli é um SERIAL (int4). Porém orders_shop.id_cli às vezes guarda
		// o CPF/CNPJ (fallback do map quando o cliente não tem id serial resolvido).
		// Resolvemos então por id_cli (apenas quando o valor cabe em int4) E, em
		// fallback, por cpf_cnpj_cli (texto — preserva zeros à esquerda e evita o
		// "integer out of range" que um CPF de 11 dígitos causaria em id_cli).
		// Alinha com o spec: "por id_cli (se numérico) ou cpf_cnpj_cli (se textual)".
		if (table === "clients") {
			const raw = String(id).trim()
			const onlyDigits = /^\d+$/.test(raw)
			// Serial plausível: cabe em int4 e não tem zero à esquerda (CPF/CNPJ podem ter).
			const looksSerial =
        onlyDigits &&
        raw.length <= 9 &&
        !raw.startsWith("0") &&
        Number(raw) <= 2147483647

			let result = null
			if (looksSerial) {
				result = await query(`SELECT * FROM ${config.table} WHERE id_cli = $1`,
					[Number(raw)])
			}
			// CPF/CNPJ (ou serial sem correspondência) → busca por cpf_cnpj_cli (texto).
			if (!result || result.rows.length === 0) {
				result = await query(`SELECT * FROM ${config.table} WHERE cpf_cnpj_cli = $1`,
					[raw])
			}
			if (result.rows.length === 0) {
				return res.status(404).json({ error: "Registro não encontrado" })
			}
			const data = config.transform
				? config.transform(result.rows[0])
				: result.rows[0]
			return res.status(200).json(data)
		}

		// product usa SKU em maiúsculas como chave; demais usam o valor cru
		const idValue =
      config.pk === "cod_categoria" ? String(id).toUpperCase().trim() : id

		const sql = `SELECT * FROM ${config.table} WHERE ${config.pk} = $1`
		const result = await query(sql, [idValue])
		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Registro não encontrado" })
		}

		const data = config.transform
			? config.transform(result.rows[0])
			: result.rows[0]
		return res.status(200).json(data)
	} catch (err) {
		console.error(`Erro ao buscar ${table} por ID:`, err)
		return res.status(500).json({ error: "Erro interno" })
	}
}

// ---------------------------------------------------------------------------
// ENDPOINTS EM LOTE
//
// O frontend resolvia catálogo e clientes um a um: GET /db/product/:sku por SKU
// (até ~900 num mês da artepropria) e GET /db/clients/:id por pedido. Cada um
// desses cai em getItemById, e o de clientes chega a fazer DUAS queries
// sequenciais. Estes dois handlers resolvem tudo numa chamada.
//
// São POST, e não GET, por dois motivos: existe cod_categoria com vírgula na
// base (um separador em querystring quebraria) e 200 SKUs estouram o limite
// prático de URL depois do encodeURIComponent.
//
// Paridade: cada um reproduz exatamente a resolução do getItemById unitário —
// mesma normalização de chave, mesmo transform e `null` onde o unitário daria
// 404. Verificado por scripts/batchDiff.js.
const MAX_BATCH = 200

// Serial plausível: mesma regra do getItemById para `clients` (cabe em int4 e
// não tem zero à esquerda, que CPF/CNPJ podem ter).
const looksSerialId = (raw) =>
	/^\d+$/.test(raw) && raw.length <= 9 && !raw.startsWith("0") && Number(raw) <= 2147483647

/**
 * POST /db/products/batch   body: { skus: string[] }
 * → { "<sku pedido>": ProductRow | null, ... }
 */
export const getProductsBatch = async (req, res) => {
	try {
		const requested = Array.isArray(req.body?.skus) ? req.body.skus : null
		if (!requested) {
			return res.status(400).json({ error: "Body deve conter { skus: string[] }" })
		}
		if (requested.length === 0) return res.status(200).json({})
		if (requested.length > MAX_BATCH) {
			return res.status(400).json({ error: `Máximo de ${MAX_BATCH} SKUs por chamada` })
		}

		// Mesma normalização do getItemById: String(id).toUpperCase().trim()
		const norm = (s) => String(s).toUpperCase().trim()
		const keys = [...new Set(requested.map(norm))].filter(Boolean)

		const { rows } = keys.length
			? await query(
				`SELECT ${SELECT_COLUMNS[dataBase.product]} FROM ${dataBase.product}
				 WHERE cod_categoria = ANY($1::text[])`,
				[keys]
			)
			: { rows: [] }

		// cod_categoria tem índice único → no máximo 1 linha por chave.
		const byCod = new Map(rows.map((r) => [norm(r.cod_categoria), r]))

		const out = {}
		for (const sku of requested) {
			const row = byCod.get(norm(sku))
			out[String(sku)] = row ? dataBaseDb.product.transform(row) : null
		}
		return res.status(200).json(out)
	} catch (err) {
		console.error("Erro no lote de produtos:", err)
		return res.status(500).json({ error: "Erro interno" })
	}
}

/**
 * POST /db/clients/batch   body: { ids: (string|number)[] }
 * → { "<id pedido>": ClientRow | null, ... }
 *
 * Espelha getItemById(table="clients"): tenta id_cli quando o valor parece
 * serial e cai para cpf_cnpj_cli quando não parece OU quando o id_cli não achou
 * nada. Na base, 88% dos orders_shop.id_cli NÃO parecem serial, então o caminho
 * do CPF é o dominante.
 *
 * Desempate de CPF duplicado (1.523 CPFs se repetem em `clientes`): a query
 * unitária faz Index Scan e o controller pega rows[0] — ou seja, a escolha é a
 * ORDEM DO ÍNDICE, que não corresponde a ctid nem a id_cli e não é reproduzível
 * por nenhum ORDER BY (verificado: o índice devolve (7558,44), (7558,35),
 * (7558,36) nessa ordem). Por isso os CPFs com mais de uma linha são resolvidos
 * com a MESMA query unitária, um a um. São raros — num período típico, zero ou
 * poucos — então o custo é desprezível e a paridade fica exata por construção.
 */
export const getClientsBatch = async (req, res) => {
	try {
		const requested = Array.isArray(req.body?.ids) ? req.body.ids : null
		if (!requested) {
			return res.status(400).json({ error: "Body deve conter { ids: (string|number)[] }" })
		}
		if (requested.length === 0) return res.status(200).json({})
		if (requested.length > MAX_BATCH) {
			return res.status(400).json({ error: `Máximo de ${MAX_BATCH} ids por chamada` })
		}

		const raws = [...new Set(requested.map((i) => String(i).trim()))]
		const serials = raws.filter(looksSerialId).map(Number)
		const cols = SELECT_COLUMNS[dataBase.clients]

		const [serialRes, cpfRes] = await Promise.all([
			serials.length
				? query(`SELECT ${cols} FROM ${dataBase.clients} WHERE id_cli = ANY($1::int[])`, [
					serials
				])
				: Promise.resolve({ rows: [] }),
			// TODOS os raws entram aqui: os não-seriais vão direto e os seriais
			// precisam do fallback caso id_cli não encontre nada.
			raws.length
				? query(
					`SELECT ${cols} FROM ${dataBase.clients}
					 WHERE cpf_cnpj_cli = ANY($1::text[])`,
					[raws]
				)
				: Promise.resolve({ rows: [] })
		])

		const bySerial = new Map(serialRes.rows.map((r) => [String(r.id_cli), r]))

		// Agrupa por CPF para detectar os duplicados.
		const byCpf = new Map()
		const duplicados = new Set()
		for (const r of cpfRes.rows) {
			const k = String(r.cpf_cnpj_cli)
			if (byCpf.has(k)) duplicados.add(k)
			else byCpf.set(k, r)
		}

		// CPF duplicado → refaz a query unitária para herdar a ordem do índice.
		if (duplicados.size > 0) {
			const escolhidos = await Promise.all(
				[...duplicados].map((cpf) =>
					query(`SELECT ${cols} FROM ${dataBase.clients} WHERE cpf_cnpj_cli = $1`, [cpf])
				)
			)
			;[...duplicados].forEach((cpf, i) => {
				const row = escolhidos[i].rows[0]
				if (row) byCpf.set(cpf, row)
			})
		}

		const out = {}
		for (const id of requested) {
			const raw = String(id).trim()
			const row = (looksSerialId(raw) ? bySerial.get(raw) : undefined) ?? byCpf.get(raw)
			out[String(id)] = row ? dataBaseDb.clients.transform(row) : null
		}
		return res.status(200).json(out)
	} catch (err) {
		console.error("Erro no lote de clientes:", err)
		return res.status(500).json({ error: "Erro interno" })
	}
}

export const postDbQueryNuvemshop = async (req, res) => {
	try {
		const nuvemData = req.body
		console.log("Recebido pedido Nuvemshop ID:", nuvemData?.id)

		if (!nuvemData) {
			throw new Error("Corpo da requisição vazio")
		}

		await processOrderFromNuvemshop(nuvemData)

		res
			.status(200)
			.json({ message: "Pedido processado com sucesso (simulação Nuvemshop)" })
	} catch (error) {
		// Q6: não engolir o erro — registra e responde com status apropriado
		console.error("Erro ao processar pedido Nuvemshop:", error)
		return res.status(500).json({ error: error.message })
	}
}

export const postDbQueryTiny = async (req, res) => {
	try {
		const tinyData = req.body
		//console.log("Recebido pedido Tiny ID:", tinyData?.retorno.pedido.id)

		if (!tinyData) {
			throw new Error("Corpo da requisição vazio")
		}
		console.log("Debug TinyData:", tinyData)

		await processOrderFromTiny(tinyData)

		res
			.status(200)
			.json({ message: "Pedido processado com sucesso (simulação Tiny)" })
	} catch (error) {
		console.error("Erro ao processar pedido Tiny:", error)
		res.status(500).send("Erro interno")
	}
}

export const postDbQueryAds = async (req, res) => {
	try {
		const { ads, store, date } = req.params

		// Validação da data (formato YYYY-MM-DD)
		if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return res
				.status(400)
				.json({ error: "Data inválida. Use formato YYYY-MM-DD" })
		}

		let delivery

		if (ads == "meta") {
			delivery = await fetchMetaAdsByDate(store, date)
		} else if (ads == "google") {
			delivery = await fetchGoogleAdsByDate(store, date)
		}

		if (!delivery) {
			return res.status(404).json({
				message: "Nenhum dado encontrado para a data e loja informados"
			})
		}

		await upsertAds(delivery)

		res.status(200).json({
			message: `${ads} webhook processed`,
			data: delivery
		})
	} catch (error) {
		console.error("Erro no Google webhook:", error)
		res.status(500).json({ error: error.message })
	}
}

export const syncOrders = async (req, res) => {
	try {
		const { store } = req.params // 'outlet' ou 'artepropria'
		// Validação básica
		if (store !== "outlet" && store !== "artepropria") {
			return res
				.status(400)
				.json({ error: "Loja inválida. Use \"outlet\" ou \"artepropria\"." })
		}

		const options = {
			delayMs: req.query.delay ? parseInt(req.query.delay, 10) : 100,
			skipExisting: req.query.skipExisting !== "false"
		}

		const result = await syncNuvemshopOrders(store, options)
		res.status(200).json(result)
	} catch (error) {
		console.error("Erro na sincronização:", error)
		res.status(500).json({ error: error.message })
	}
}

export const postDbQueryPeriod = async (req, res) => {
	try {
		const { startDate, endDate } = req.params

		// Validação básica das datas
		if (!startDate || !endDate) {
			return res
				.status(400)
				.json({ error: "startDate e endDate são obrigatórios" })
		}
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
		) {
			return res
				.status(400)
				.json({ error: "Formato de data inválido. Use YYYY-MM-DD" })
		}

		// Executa a sincronização (pode demorar, por isso é melhor executar em background)
		// Se você quiser executar em background e retornar imediatamente, use setImmediate ou fila.
		// Aqui vamos aguardar a conclusão (pode timeout para períodos grandes)
		const result = await chamarAdsWebhooksPeriodo(startDate, endDate)

		return res.status(200).json({
			message: "Processamento concluído com sucesso",
			...result
		})
	} catch (error) {
		console.error("Erro na sincronização por período:", error)
		return res.status(500).json({ error: error.message })
	}
}
