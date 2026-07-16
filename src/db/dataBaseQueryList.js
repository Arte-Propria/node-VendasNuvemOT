import {
	classifyProductCategory,
	determinarGrupo,
	cleanCpfCnpj,
	cleanPhone,
	toNumber,
	toISOString,
	extractOrderNumber,
	toIntBool,
	extractDimensions,
	extractColor,
	extractFinishType,
	calculateEstimatedDeliveryDate,
	shippingCost,
	toBusinessDateBR
} from "../tools/helpers.js"
import {
	fetchLinkNote,
	fetchNoteOrderTiny,
	fetchOrderTiny
} from "../services/orderTinyServices.js"
import { logWebhookDB } from "../utils/logger.js"
import { fetchAnalytics } from "../services/analyticsServices.js"
import { fetchDataADSMeta } from "../services/dataADSMetaServices.js"
import { query } from "../db/db.js"

export const dataBase = {
	ads: "ads",
	clients: "clientes",
	coupon: "coupon",
	daily_sales: "daily_sales",
	orders_shop: "orders_shop",
	product: "categorias"
}

export const dataBaseDb = {
	ads: {
		transform: (delivery) => ({
			id_ads: delivery.id_ads,
			date_ads: delivery.date_ads,
			plataform: delivery.plataform,
			funding_ecom: delivery.funding_ecom,
			funding_store: delivery.funding_store,
			funding_general: delivery.funding_general,
			funding_chatbot: delivery.funding_chatbot,
			funding_insta: delivery.funding_insta,
			funding_mirror: delivery.funding_mirror,
			funding_painting: delivery.funding_painting,
			active: toIntBool(delivery.active), // ← conversão
			store: delivery.store,
			// Colunas de analytics/conversão (Google) + total de verba e impressões (Meta).
			// Permitem que o AnalyticsContext do frontend venha da base nova.
			funding_all: delivery.funding_all,
			total_visits: delivery.total_visits,
			users_by_device: delivery.users_by_device,
			carts: delivery.carts,
			begin_checkout: delivery.begin_checkout,
			impressions: delivery.impressions
		})
	},
	clients: {
		transform: (delivery) => ({
			id_cli: delivery.id_cli,
			cpf_cnpj_cli: delivery.cpf_cnpj_cli,
			nome_cli: delivery.nome_cli,
			email_cli: delivery.email_cli,
			fone_cli: delivery.fone_cli,
			tipo_cli: delivery.tipo_cli,
			bairro_cli: delivery.bairro_cli,
			cidade_cli: delivery.cidade_cli,
			numero_cli: delivery.numero_cli,
			uf_cli: delivery.uf_cli,
			cep_cli: delivery.cep_cli,
			endereco_cli: delivery.endereco_cli,
			dt_criacao_cli: delivery.dt_criacao_cli,
			ativo: toIntBool(delivery.ativo), // ← conversão
			dt_att_ativo: delivery.dt_att_ativo,
			origem_cli: delivery.origem_cli
		})
	},
	coupon: {
		transform: (delivery) => ({
			//id_coupon: delivery.id_coupon,
			date_coupon: delivery.date_coupon,
			name: delivery.name,
			quantity: delivery.quantity,
			total_money: delivery.total_money,
			total_discount: delivery.total_discount,
			order_ids: delivery.order_ids,
			store: delivery.store
		})
	},
	daily_sales: {
		transform: (delivery) => ({
			id_sales: delivery.id_sales,
			date_sales: delivery.date_sales,
			total_orders: delivery.total_orders,
			total_paid_orders: delivery.total_paid_orders,
			total_money: delivery.total_money,
			total_paid_money: delivery.total_paid_money,
			aov: delivery.aov,
			id_ads: delivery.id_ads,
			store: delivery.store,
			id_orders: delivery.id_orders,
			id_coupons: delivery.id_coupons,
			active: toIntBool(delivery.active), // ← conversão
			dt_att_active: delivery.dt_att_active,
			created_at: delivery.created_at,
			updated_at: delivery.updated_at
		})
	},
	orders_shop: {
		transform: (delivery) => ({
			order_id: delivery.order_id,
			id_cli: delivery.id_cli,
			store: delivery.store,
			total: delivery.total,
			subtotal: delivery.subtotal,
			payment_status: delivery.payment_status,
			coupons: JSON.stringify(delivery.coupons),
			coupon_discount: delivery.coupon_discount,
			products: JSON.stringify(delivery.products),
			products_detail:
				delivery.products_detail != null
					? JSON.stringify(delivery.products_detail)
					: null,
			shipping_option: delivery.shipping_option,
			created_at: delivery.created_at,
			paid_at: delivery.paid_at,
			updated_at: delivery.updated_at,
			active: toIntBool(delivery.active), // ← conversão
			storefront: delivery.storefront,
			shipping_status: delivery.shipping_status,
			gateway_link: delivery.gateway_link,
			payment_method: delivery.payment_method,
			url_tracking: delivery.url_tracking,
			markers_order_tiny: delivery.markers_order_tiny
				? JSON.stringify(delivery.markers_order_tiny)
				: null,
			fiscal_note: delivery.fiscal_note,
			estimated_delivery: delivery.estimated_delivery,
			shipping_cost: delivery.shipping_cost,
			order_tracking_link: delivery.order_tracking_link ?? null
		})
	},
	product: {
		transform: (delivery) => ({
			cod_categoria: (delivery.cod_categoria || "").toUpperCase(),
			nome_categoria: delivery.nome_categoria,
			desc_categoria: delivery.desc_categoria,
			grp_categoria: delivery.grp_categoria,
			ativo: toIntBool(delivery.ativo), // ← conversão (originalmente fixo 1, mas pode vir booleano)
			dim_categoria: delivery.dim_categoria,
			cor_categoria: delivery.cor_categoria,
			tipo_categoria: delivery.tipo_categoria,
			dt_att_ativo: delivery.dt_att_ativo,
			dt_att_categoria: delivery.dt_att_categoria,
			img_categoria: delivery.img_categoria,
			custo_categoria: delivery.custo_categoria,
			tempo_prod_categoria: delivery.tempo_prod_categoria || null,
			preco: delivery.preco
		})
	}
}

export const storeMapping = {
	// mapeamento de código numérico para nome amigável
	numericToName: {
		3889735: "outlet",
		1146504: "artepropria"
	},
	// mapeamento inverso: nome amigável para código numérico
	nameToNumeric: {
		outlet: 3889735,
		artepropria: 1146504
	},
	//Mapeamentoo para o tiny
	tinyNameToNumeric: {
		OUTLETDOSQUADROS: 3889735,
		ARTEPROPRIA: 1146504,
		"SITE OUTLET": 3889735,
		"SITE ARTEPROPRIA": 1146504
	},
	//Mapeamentoo para o tiny
	numericToTinyName: {
		3889735: "OUTLETDOSQUADROS",
		1146504: "ARTEPROPRIA"
	},
	// dominio público de cada loja (para montar o link de acompanhamento do pedido)
	numericToUrl: {
		3889735: "https://www.outletdosquadros.com.br",
		1146504: "https://www.artepropria.com.br"
	}
}

export function mapNuvemshopToDelivery(nuvemData) {
	logWebhookDB("Iniciando mapNuvemshopToDelivery")
	// Usa sempre o identificador real do pedido. Antes, pedidos "Loja Fisica"
	// recebiam order_id = "Loja Fisica" (literal) e colidiam entre si em orders_shop.
	const orderNumber = nuvemData?.number || nuvemData?.order_id || nuvemData?.id
	logWebhookDB("orderNumber:", orderNumber)
	const now = new Date().toISOString()

	// Cliente
	const c = nuvemData?.customer || {}
	//logWebhookDB("customer data:", c)

	// mapaLojas: cada loja física recebe um CPF fictício próprio, para os pedidos
	// físicos não colapsarem todos no mesmo cliente (99999999999).
	const mapaLojas = {
		MOEMA: "12311111111",
		TURIASSU: "45611111111",
		ANALIA: "78911111111",
		GABRIEL: "45688888888",
		CHATBOT: "45699999999"
	}

	// Pedido de loja física? (storefront "Loja" ou "Loja Fisica")
	const isLojaFisica =
    nuvemData?.storefront === "Loja" || nuvemData?.storefront === "Loja Fisica"

	// Filial: billing_business_name; fallback CHATBOT (mesma regra do ChartLojas do front).
	let lojaFisica = null
	if (isLojaFisica) {
		lojaFisica = nuvemData?.billing_business_name || null
		if (!lojaFisica && nuvemData?.billing_name === "Cliente Loja Física") {
			lojaFisica = "CHATBOT"
		}
	}
	const cpfLojaFisica = lojaFisica ? mapaLojas[lojaFisica] || null : null

	// CPF final: filial física tem prioridade; senão, o CPF do próprio pedido.
	const cpfFinal = cpfLojaFisica || cleanCpfCnpj(c.identification)

	const clienteId =
    cpfLojaFisica ||
    cleanCpfCnpj(c.identification) ||
    c.email ||
    `temp_${orderNumber || Date.now()}`
	// Em mapNuvemshopToDelivery
	const clienteDelivery = {
		id_cli: null, // será gerado pela sequência
		cpf_cnpj_cli: cpfFinal,
		nome_cli: cpfLojaFisica
			? `LOJA FÍSICA - ${lojaFisica}`
			: c.name || nuvemData?.contact_name,
		email_cli: c.email || nuvemData?.contact_email,
		fone_cli: cleanPhone(c.phone || nuvemData?.contact_phone),
		tipo_cli: cpfFinal && cpfFinal.length > 11 ? "J" : "F",
		bairro_cli: c.billing_locality || c.default_address?.locality,
		cidade_cli: c.billing_city || c.default_address?.city,
		numero_cli: c.billing_number || c.default_address?.number,
		uf_cli: c.billing_province || c.default_address?.province,
		cep_cli: (c.billing_zipcode || c.default_address?.zipcode)?.replace(/\D/g,
			""),
		endereco_cli: c.billing_address || c.default_address?.address,
		dt_criacao_cli: toISOString(c.created_at || nuvemData?.created_at),
		ativo: true,
		dt_att_ativo: now,
		origem_cli: nuvemData?.customer_visit?.utm_parameters?.utm_source || null
	}
	//logWebhookDB("clienteDelivery criado:", clienteDelivery)

	// Produtos
	// Em mapNuvemshopToDelivery, substitua a parte de produtos:
	const produtosDelivery = (nuvemData?.products || []).map((prod) => {
		const productName = prod.name_without_variants || prod.name
		const dimensao = extractDimensions(productName)
		// Cor: a variante (ex.: "Caramelo") não está em name_without_variants. Usa a
		// variante estruturada (variant_values) e, em fallback, o parêntese do nome completo.
		const variantColor =
      Array.isArray(prod.variant_values) && prod.variant_values.length
      	? prod.variant_values.join(" ").trim()
      	: null
		const cor =
      (
      	variantColor ||
        extractColor(prod.name) ||
        extractColor(productName)
      )?.toUpperCase() || "-"
		const tipo = extractFinishType(productName)
		const now = new Date().toISOString()

		const nomeCategoria = classifyProductCategory(productName)

		return {
			cod_categoria: (prod.sku || `nuvem_${prod.id}`).toUpperCase(),
			nome_categoria: nomeCategoria,
			desc_categoria: prod.name,
			grp_categoria: determinarGrupo(prod),
			ativo: 1,
			dim_categoria: dimensao,
			cor_categoria: cor,
			tipo_categoria: tipo,
			dt_att_ativo: now,
			dt_att_categoria: now,
			img_categoria: prod.image?.src || null,
			custo_categoria: parseFloat(prod.cost) || 0,
			tempo_prod_categoria: null,
			preco: parseFloat(prod.price) || 0
		}
	})
	//logWebhookDB("produtosDelivery:", produtosDelivery)

	// products_detail: linha a linha do pedido, preservando os campos que a tela
	// legada de Produtos usava (product_id, price histórico, variant_values, name,
	// image). orders_shop.products continua sendo só SKUs; este campo é aditivo.
	const produtosDetail = (nuvemData?.products || []).map((prod) => ({
		product_id: prod.product_id ?? null,
		sku: (prod.sku || `nuvem_${prod.id}`).toUpperCase(),
		name: prod.name || null,
		price: parseFloat(prod.price) || 0,
		image: prod.image?.src || null,
		variant_values: Array.isArray(prod.variant_values) ? prod.variant_values : []
	}))

	// Cupons
	// B6: date_coupon como data pura (YYYY-MM-DD) para casar com o lookup do daily_sales
	//     e garantir a agregação por dia no ON CONFLICT (name, date_coupon).
	//     Dia de negócio BRT com corte às 03:00 (mesmo critério do daily_sales).
	const couponDate = toBusinessDateBR(nuvemData?.created_at)
	// Nome amigável da loja (ex.: "outlet"/"artepropria") para rastrear a origem do cupom.
	const couponStore =
    storeMapping.numericToName[Number(nuvemData?.store_id)] || null
	const couponsDelivery = (nuvemData?.coupon || []).map((coupon) => ({
		//id_coupon: coupon.id?.toString() || `cupom_${orderNumber}`,
		date_coupon: couponDate,
		name: coupon.code,
		// 1 uso por pedido (coupon.used é o total global do cupom na loja, não deste pedido)
		quantity: 1,
		// total_money = valor total da VENDA que usou o cupom (não o valor do cupom).
		total_money: toNumber(nuvemData?.total),
		// total_discount = VALOR do cupom (campo `value` da Nuvemshop, ex.: 10.00 para 10%).
		// Propriedade fixa do cupom — NÃO é a soma dos descontos aplicados.
		total_discount: toNumber(coupon.value),
		order_ids: [orderNumber],
		store: couponStore
	}))
	//logWebhookDB("couponsDelivery:", couponsDelivery)

	// Link de acompanhamento/sucesso do pedido: dominio da loja + id e token do pedido Nuvemshop.
	const storeBaseUrl = storeMapping.numericToUrl[Number(nuvemData?.store_id)] || null
	const orderTrackingLink = storeBaseUrl && nuvemData?.id && nuvemData?.token
		? `${storeBaseUrl}/checkout/v3/success/${nuvemData.id}/${nuvemData.token}`
		: null

	// Pedido
	const orderDelivery = {
		order_id: orderNumber,
		id_cli: clienteId,
		// Q1: store numérico canônico (mesmo formato do fluxo Tiny)
		store: nuvemData?.store_id ? Number(nuvemData.store_id) : null,
		total: toNumber(nuvemData?.total),
		subtotal: toNumber(nuvemData?.subtotal),
		payment_status: nuvemData?.payment_status || null,
		coupons: (nuvemData?.coupon || []).map((c) => c.code),
		coupon_discount: toNumber(nuvemData?.discount_coupon),
		products: produtosDelivery.map((p) => p.cod_categoria),
		products_detail: produtosDetail,
		shipping_option: nuvemData?.shipping_option || null,
		// C4: preserva a data real de criação do pedido (fallback para agora)
		created_at: toISOString(nuvemData?.created_at) || now,
		paid_at: toISOString(nuvemData?.paid_at),
		updated_at: now,
		active: nuvemData?.status !== "cancelled",
		storefront: nuvemData?.storefront || null,
		gateway_link: nuvemData?.gateway_link || null,
		payment_method: nuvemData?.payment_details?.method || null,
		shipping_status: nuvemData?.shipping_status || null,
		url_tracking: nuvemData?.shipping_tracking_url || null,
		markers_order_tiny: null,
		fiscal_note: null,
		estimated_delivery: calculateEstimatedDeliveryDate(nuvemData?.created_at,
			nuvemData?.shipping_max_days),
		shipping_cost: shippingCost(nuvemData?.shipping_cost_customer),
		order_tracking_link: orderTrackingLink
	}
	//logWebhookDB("orderDelivery:", orderDelivery)

	const result = {
		orders_shop: [orderDelivery],
		ads: [],
		coupons: couponsDelivery,
		product: produtosDelivery,
		clients: [clienteDelivery]
	}
	logWebhookDB("result keys:", Object.keys(result))
	return result
}

export async function mapTinyToDelivery(tinyData, fiscalNoteLink = null) {
	console.log("[mapTinyToDelivery] Iniciando mapeamento do pedido Tiny")
	const pedido = tinyData.retorno.pedido
	const orderNumber = extractOrderNumber(tinyData)
	if (!orderNumber) throw new Error("Número do pedido não encontrado no Tiny")
	console.log(`[mapTinyToDelivery] orderNumber: ${orderNumber}`)

	const now = new Date().toISOString()

	// ----- Cliente -----
	const c = pedido.cliente
	const clienteId =
    cleanCpfCnpj(c.cpf_cnpj) || c.email || `temp_${orderNumber}`
	const clienteDelivery = {
		id_cli: null,
		cpf_cnpj_cli: cleanCpfCnpj(c.cpf_cnpj),
		nome_cli: c.nome,
		email_cli: c.email,
		fone_cli: cleanPhone(c.fone),
		tipo_cli: c.tipo_pessoa,
		bairro_cli: c.bairro,
		cidade_cli: c.cidade,
		numero_cli: c.numero,
		uf_cli: c.uf,
		cep_cli: c.cep?.replace(/\D/g, ""),
		endereco_cli: c.endereco,
		dt_criacao_cli: toISOString(pedido.data_pedido),
		ativo: true,
		dt_att_ativo: now,
		origem_cli: null
	}
	console.log(`[mapTinyToDelivery] Cliente: ${clienteId} - ${c.nome}`)

	// ----- Produtos -----
	const produtosDelivery = (pedido.itens || []).map((item) => {
		const prodItem = item.item
		const productName = prodItem.descricao
		const dimensao = extractDimensions(productName)
		const cor = extractColor(productName)?.toUpperCase() || "-"
		const tipo = extractFinishType(productName)
		const nomeCategoria = classifyProductCategory(productName)
		return {
			cod_categoria: (
				prodItem.codigo || `tiny_${prodItem.id_produto}`
			).toUpperCase(),
			nome_categoria: nomeCategoria,
			desc_categoria: prodItem.descricao,
			grp_categoria: null,
			ativo: 1,
			dim_categoria: dimensao,
			cor_categoria: cor,
			tipo_categoria: tipo,
			dt_att_ativo: now,
			dt_att_categoria: now,
			img_categoria: null,
			// O Tiny NÃO fornece custo. Enviar 0 aqui faria a upsertProduct
			// sobrescrever o custo real (da Nuvemshop) por 0. Com null, o
			// removeNullFields descarta o campo e o custo existente é preservado.
			custo_categoria: null,
			tempo_prod_categoria: null,
			preco: parseFloat(prodItem.valor_unitario) || 0
		}
	})
	console.log(`[mapTinyToDelivery] ${produtosDelivery.length} produtos mapeados`)

	// products_detail (aditivo). O Tiny não fornece product_id nem variant_values;
	// degrada para o SKU/descrição do item — o backfill a partir de pedidos_* cobre
	// os pedidos históricos que também existem no ecommerce Nuvemshop.
	const produtosDetail = (pedido.itens || []).map((item) => {
		const prodItem = item.item
		return {
			product_id: null,
			sku: (prodItem.codigo || `tiny_${prodItem.id_produto}`).toUpperCase(),
			name: prodItem.descricao || null,
			price: parseFloat(prodItem.valor_unitario) || 0,
			image: null,
			variant_values: []
		}
	})

	// ----- Cupons (nenhum) -----
	const couponsDelivery = []

	// ----- Dados adicionais do pedido -----
	const markers = (pedido.marcadores || [])
		.map((m) => m.marcador?.descricao)
		.filter(Boolean)
	const trackingUrl = pedido.url_rastreamento || null
	let estimatedDelivery = null
	if (pedido.data_prevista) {
		const [dia, mes, ano] = pedido.data_prevista.split("/")
		estimatedDelivery = `${ano}-${mes}-${dia}`
		console.log(`[mapTinyToDelivery] Data prevista calculada: ${estimatedDelivery}`)
	}
	const shippingCostValue = toNumber(pedido.valor_frete)
	const shippingStatus = pedido.situacao || null
	console.log(`[mapTinyToDelivery] Status do pedido: ${shippingStatus}, frete: ${shippingCostValue}`)

	// ----- Pedido (todos os campos que a tabela orders_shop espera) -----
	const orderDelivery = {
		order_id: Number(orderNumber),
		id_cli: clienteId,
		// Q1: persiste o código numérico canônico da loja (igual ao Nuvemshop),
		//     com fallback para o nome do ecommerce caso não esteja mapeado.
		store:
      storeMapping.tinyNameToNumeric?.[pedido.ecommerce?.nomeEcommerce] ||
      pedido.ecommerce?.nomeEcommerce ||
      null,
		total: parseFloat(pedido.total_pedido) || 0,
		subtotal: parseFloat(pedido.total_produtos) || 0,
		payment_status: null,
		coupons: [],
		coupon_discount: parseFloat(pedido.valor_desconto) || 0,
		products: produtosDelivery.map((p) => p.cod_categoria),
		products_detail: produtosDetail,
		shipping_option: null,
		// C4: usa a data do pedido (dd/mm/aaaa → ISO); created_at não é atualizável depois
		created_at: toISOString(pedido.data_pedido) || now,
		paid_at: null,
		updated_at: now,
		active: pedido.situacao !== "Cancelado",
		storefront: null,
		gateway_link: null,
		payment_method: null,
		shipping_status: shippingStatus,
		url_tracking: trackingUrl,
		markers_order_tiny: markers,
		fiscal_note: fiscalNoteLink,
		estimated_delivery: estimatedDelivery,
		shipping_cost: shippingCostValue
	}
	console.log(`[mapTinyToDelivery] Pedido ${orderDelivery.order_id} mapeado. Nota fiscal: ${fiscalNoteLink ? "presente" : "não disponível"}`)

	return {
		orders_shop: [orderDelivery],
		ads: [],
		coupons: couponsDelivery,
		product: produtosDelivery,
		clients: [clienteDelivery]
	}
}

export const fetchMetaAdsByDate = async (store, date) => {
	// Passa mesma data como min e max
	const result = await fetchDataADSMeta({
		store,
		createdAtMin: date,
		createdAtMax: date
	})
	if (!result || result.length === 0) return null
	const data = result[0] // result é array com um objeto
	return {
		date_ads: date,
		plataform: "Meta",
		funding_all: data.totalCost?.all || 0,
		funding_ecom: data.totalCost?.ecom || 0,
		funding_painting: data.totalCost?.quadros || 0,
		funding_mirror: data.totalCost?.espelhos || 0,
		funding_chatbot: data.totalCost?.chatbot || 0,
		funding_insta: data.totalCost?.instagram || 0,
		funding_general: data.totalCost?.geral || 0,
		funding_store: 0, // Meta não tem store específico
		active: 1,
		store: store,
		total_visits: 0,
		users_by_device: { mobile: 0, desktop: 0, tablet: 0 },
		carts: 0,
		begin_checkout: 0,
		impressions: data?.impressions
	}
}

export const fetchGoogleAdsByDate = async (store, date) => {
	const result = await fetchAnalytics({
		store,
		createdAtMin: date,
		createdAtMax: date
	})
	// O resultado de fetchAnalytics é um objeto com totalCost
	return {
		date_ads: date,
		plataform: "Google",
		funding_all: result.totalCost?.all || 0,
		funding_ecom: result.totalCost?.ecom || 0,
		funding_painting: result.totalCost?.quadros || 0,
		funding_mirror: result.totalCost?.espelhos || 0,
		funding_store: result.totalCost?.loja || 0,
		funding_general: result.totalCost?.geral || 0,
		funding_chatbot: 0, // Google não separa chatbot
		funding_insta: 0, // Google não separa Instagram
		active: 1,
		store: store,
		total_visits: result?.totalVisits || 0,
		users_by_device: result?.usersByDevice || 0,
		carts: result?.carts || 0,
		begin_checkout: result?.beginCheckout || 0,
		impressions: 0 //Google não gera impressões
	}
}

export async function getAdsIdsForDateStore(date, store) {
	const sql = `SELECT id_ads FROM ${dataBase.ads} WHERE date_ads = $1 AND store = $2`
	const res = await query(sql, [date, store])
	return res.rows.map((row) => row.id_ads)
}
