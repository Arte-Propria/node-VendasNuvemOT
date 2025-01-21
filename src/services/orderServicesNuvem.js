import axios from "axios"
import dotenv from "dotenv"
import { query } from "../db/db.js"
import { generateNumericId } from "../tools/tools.js"

dotenv.config()

export const fetchOrders = async (params = {}) => {
	const { store } = params
	let code
	let storeId

	if (store === "outlet") {
		code = process.env.ACCESS_TOKEN_OUTLET
		storeId = process.env.STORE_ID_OUTLET
	}
	if (store === "artepropria") {
		code = process.env.ACCESS_TOKEN_ARTEPROPRIA
		storeId = process.env.STORE_ID_ARTEPROPRIA
	}

	let url = `https://api.tiendanube.com/v1/${storeId}/orders`

	// Define a data atual para o início do dia
	const currentDateStart = new Date()
	currentDateStart.setHours(
		0, 0, 0, 0
	)

	// Define a data atual para o final do dia
	const currentDateEnd = new Date()
	currentDateEnd.setHours(currentDateEnd.getHours() - 3)

	// Desestruturação dos parâmetros com valores padrão
	const { createdAtMin = currentDateStart, createdAtMax = currentDateEnd } =
    params

	let allOrders = []
	console.log("Recuperando dados dos pedidos...")

	try {
		// Loop para lidar com a paginação da API
		while (url) {
			const response = await axios({
				method: "get",
				url: url,
				headers: {
					Authentication: `bearer ${code}`,
					"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
					"Content-Type": "application/json"
				},
				params: {
					created_at_min: createdAtMin,
					created_at_max: createdAtMax,
					per_page: 156
				}
			})

			if (response.status === 404) {
				console.log("Nenhum pedido encontrado para o intervalo de datas fornecido.")
				return
			}

			const data = response.data

			if (data.length === 0) {
				console.log("Nenhum pedido encontrado para o intervalo de datas fornecido.")
				return
			}

			const orders = data.map((order) => ({
				id: order.id,
				orderId: order.number,
				client: order.customer.name,
				billingProvince: order.billing_province,
				gateway: order.gateway_name,
				gatewayLink: order.gateway_link,
				createdAt: order.created_at,
				subtotal: order.subtotal,
				total: order.total,
				status: order.payment_status,
				statusOrder: order.status,
				products: order.products,
				data: order
			}))

			allOrders = allOrders.concat(orders)

			const linkHeader = response.headers.link
			const nextLinkMatch = /<([^>]+)>;\s*rel="next"/.exec(linkHeader)

			if (nextLinkMatch) {
				url = nextLinkMatch[1]
			} else {
				url = null
			}
		}
	} catch (error) {
		if (error.response && error.response.data) {
			console.error(`Erro ao processar pedidos da loja ${store}:`,
				error.response.data)
		} else {
			console.error("Erro desconhecido ao recuperar pedidos:", error)
		}
	}

	return allOrders
}

export const fetchOrder = async ({ store, id }) => {
	let code
	let storeId

	if(store === "outlet"){
		code = process.env.ACCESS_TOKEN_OUTLET
		storeId = process.env.STORE_ID_OUTLET
	}
	if(store === "artepropria"){
		code = process.env.ACCESS_TOKEN_ARTEPROPRIA
		storeId = process.env.STORE_ID_ARTEPROPRIA
	}
	
	let url = `https://api.tiendanube.com/v1/${storeId}/orders/${id}`
	console.log("Recuperando dado do pedido...")

	const response = await axios({
		method: "get",
		url: url,
		headers: {
			"Authentication": `bearer ${code}`,
			"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
			"Content-Type": "application/json"
		}
	})

	const data = response.data
	
	return data
}

export const insertOrderWebhook = async (order, store) => {
	const tableName =
    store === "outlet" ? "pedidos_outlet" : "pedidos_artepropria"
	const queryText = `
    INSERT INTO ${tableName} (
      weight, app_id, attributes, cancelled_at, checkout_enabled, client_details,
      closed_at, completed_at, coupon, created_at, customer, customer_visit, discount,
      discount_coupon, discount_gateway, extra, free_shipping_config, fulfillments,
      has_shippable_products, order_id, number, paid_at, payment_count, payment_details,
      products, promotional_discount, read_at, same_billing_and_shipping_address,
      shipped_at, shipping_address, shipping_cost_customer, shipping_cost_owner,
      shipping_max_days, shipping_min_days, shipping_pickup_details, shipping_store_branch_extra,
      shipping_suboption, store_id, subtotal, total, total_usd, updated_at, id,
      shipping_carrier_name, shipping_store_branch_name, landing_url, language, next_action,
      billing_address, billing_business_name, billing_city, billing_country, billing_customer_type,
      billing_document_type, billing_floor, billing_locality, billing_name, billing_number,
      billing_phone, billing_province, billing_state_registration, billing_trade_name, billing_zipcode,
      cancel_reason, note, storefront, order_origin, owner_note, shipping_tracking_number,
      contact_email, contact_identification, contact_name, contact_phone, shipping_tracking_url,
      shipping_option, currency, payment_status, shipping_option_code, shipping_option_reference,
      status, shipping_pickup_type, shipping_status, shipping, token, gateway, gateway_id, gateway_link,
      gateway_name
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38,
      $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56,
      $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74,
      $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88
    )
    ON CONFLICT (order_id) DO UPDATE SET
      weight = EXCLUDED.weight,
      app_id = EXCLUDED.app_id,
      attributes = EXCLUDED.attributes,
      cancelled_at = EXCLUDED.cancelled_at,
      checkout_enabled = EXCLUDED.checkout_enabled,
      client_details = EXCLUDED.client_details,
      closed_at = EXCLUDED.closed_at,
      completed_at = EXCLUDED.completed_at,
      coupon = EXCLUDED.coupon,
      created_at = EXCLUDED.created_at,
      customer = EXCLUDED.customer,
      customer_visit = EXCLUDED.customer_visit,
      discount = EXCLUDED.discount,
      discount_coupon = EXCLUDED.discount_coupon,
      discount_gateway = EXCLUDED.discount_gateway,
      extra = EXCLUDED.extra,
      free_shipping_config = EXCLUDED.free_shipping_config,
      fulfillments = EXCLUDED.fulfillments,
      has_shippable_products = EXCLUDED.has_shippable_products,
      number = EXCLUDED.number,
      paid_at = EXCLUDED.paid_at,
      payment_count = EXCLUDED.payment_count,
      payment_details = EXCLUDED.payment_details,
      products = EXCLUDED.products,
      promotional_discount = EXCLUDED.promotional_discount,
      read_at = EXCLUDED.read_at,
      same_billing_and_shipping_address = EXCLUDED.same_billing_and_shipping_address,
      shipped_at = EXCLUDED.shipped_at,
      shipping_address = EXCLUDED.shipping_address,
      shipping_cost_customer = EXCLUDED.shipping_cost_customer,
      shipping_cost_owner = EXCLUDED.shipping_cost_owner,
      shipping_max_days = EXCLUDED.shipping_max_days,
      shipping_min_days = EXCLUDED.shipping_min_days,
      shipping_pickup_details = EXCLUDED.shipping_pickup_details,
      shipping_store_branch_extra = EXCLUDED.shipping_store_branch_extra,
      shipping_suboption = EXCLUDED.shipping_suboption,
      store_id = EXCLUDED.store_id,
      subtotal = EXCLUDED.subtotal,
      total = EXCLUDED.total,
      total_usd = EXCLUDED.total_usd,
      updated_at = EXCLUDED.updated_at,
      id = EXCLUDED.id,
      shipping_carrier_name = EXCLUDED.shipping_carrier_name,
      shipping_store_branch_name = EXCLUDED.shipping_store_branch_name,
      landing_url = EXCLUDED.landing_url,
      language = EXCLUDED.language,
      next_action = EXCLUDED.next_action,
      billing_address = EXCLUDED.billing_address,
      billing_business_name = EXCLUDED.billing_business_name,
      billing_city = EXCLUDED.billing_city,
      billing_country = EXCLUDED.billing_country,
      billing_customer_type = EXCLUDED.billing_customer_type,
      billing_document_type = EXCLUDED.billing_document_type,
      billing_floor = EXCLUDED.billing_floor,
      billing_locality = EXCLUDED.billing_locality,
      billing_name = EXCLUDED.billing_name,
      billing_number = EXCLUDED.billing_number,
      billing_phone = EXCLUDED.billing_phone,
      billing_province = EXCLUDED.billing_province,
      billing_state_registration = EXCLUDED.billing_state_registration,
      billing_trade_name = EXCLUDED.billing_trade_name,
      billing_zipcode = EXCLUDED.billing_zipcode,
      cancel_reason = EXCLUDED.cancel_reason,
      note = EXCLUDED.note,
      storefront = EXCLUDED.storefront,
      order_origin = EXCLUDED.order_origin,
      owner_note = EXCLUDED.owner_note,
      shipping_tracking_number = EXCLUDED.shipping_tracking_number,
      contact_email = EXCLUDED.contact_email,
      contact_identification = EXCLUDED.contact_identification,
      contact_name = EXCLUDED.contact_name,
      contact_phone = EXCLUDED.contact_phone,
      shipping_tracking_url = EXCLUDED.shipping_tracking_url,
      shipping_option = EXCLUDED.shipping_option,
      currency = EXCLUDED.currency,
      payment_status = EXCLUDED.payment_status,
      shipping_option_code = EXCLUDED.shipping_option_code,
      shipping_option_reference = EXCLUDED.shipping_option_reference,
      status = EXCLUDED.status,
      shipping_pickup_type = EXCLUDED.shipping_pickup_type,
      shipping_status = EXCLUDED.shipping_status,
      shipping = EXCLUDED.shipping,
      token = EXCLUDED.token,
      gateway = EXCLUDED.gateway,
      gateway_id = EXCLUDED.gateway_id,
      gateway_link = EXCLUDED.gateway_link,
      gateway_name = EXCLUDED.gateway_name
    RETURNING *`

	try {
		await query(queryText, [
			order.weight || null,
			order.app_id || null,
			order.attributes || null,
			order.cancelled_at || null,
			order.checkout_enabled || null,
			order.client_details || null,
			order.closed_at || null,
			order.completed_at || null,
			JSON.stringify(order.coupon) || null,
			order.created_at || null,
			order.customer || null,
			order.customer_visit || null,
			order.discount || null,
			order.discount_coupon || null,
			order.discount_gateway || null,
			order.extra || null,
			order.free_shipping_config || null,
			JSON.stringify(order.fulfillments) || null,
			order.has_shippable_products || null,
			order.number || null, // corrigiu a ordem para colocar order_id
			order.number || null,
			order.paid_at || null,
			order.payment_count || null,
			order.payment_details || null,
			JSON.stringify(order.products) || null,
			order.promotional_discount || null,
			order.read_at || null,
			order.same_billing_and_shipping_address || null,
			order.shipped_at || null,
			order.shipping_address || null,
			order.shipping_cost_customer || null,
			order.shipping_cost_owner || null,
			order.shipping_max_days || null,
			order.shipping_min_days || null,
			order.shipping_pickup_details || null,
			order.shipping_store_branch_extra || null,
			order.shipping_suboption || null,
			order.store_id || null,
			order.subtotal || null,
			order.total || null,
			order.total_usd || null,
			order.updated_at || null,
			order.id || null,
			order.shipping_carrier_name || null,
			order.shipping_store_branch_name || null,
			order.landing_url || null,
			order.language || null,
			order.next_action || null,
			order.billing_address || null,
			order.billing_business_name || null,
			order.billing_city || null,
			order.billing_country || null,
			order.billing_customer_type || null,
			order.billing_document_type || null,
			order.billing_floor || null,
			order.billing_locality || null,
			order.billing_name || null,
			order.billing_number || null,
			order.billing_phone || null,
			order.billing_province || null,
			order.billing_state_registration || null,
			order.billing_trade_name || null,
			order.billing_zipcode || null,
			order.cancel_reason || null,
			order.note || null,
			order.storefront || null,
			order.order_origin || null,
			order.owner_note || null,
			order.shipping_tracking_number || null,
			order.contact_email || null,
			order.contact_identification || null,
			order.contact_name || null,
			order.contact_phone || null,
			order.shipping_tracking_url || null,
			order.shipping_option || null,
			order.currency || null,
			order.payment_status || null,
			order.shipping_option_code || null,
			order.shipping_option_reference || null,
			order.status || null,
			order.shipping_pickup_type || null,
			order.shipping_status || null,
			order.shipping || null,
			order.token || null,
			order.gateway || null,
			order.gateway_id || null,
			order.gateway_link || null,
			order.gateway_name || null
		])
	} catch (err) {
		console.error("Erro ao inserir pedido:", err)
	}
}

export const insertOrders = async (orders, store) => {
	const tableName =
    store === "outlet" ? "pedidos_outlet" : "pedidos_artepropria"
	const queryText = `
    INSERT INTO ${tableName} (
      weight, app_id, attributes, cancelled_at, checkout_enabled, client_details,
      closed_at, completed_at, coupon, created_at, customer, customer_visit, discount,
      discount_coupon, discount_gateway, extra, free_shipping_config, fulfillments,
      has_shippable_products, order_id, number, paid_at, payment_count, payment_details,
      products, promotional_discount, read_at, same_billing_and_shipping_address,
      shipped_at, shipping_address, shipping_cost_customer, shipping_cost_owner,
      shipping_max_days, shipping_min_days, shipping_pickup_details, shipping_store_branch_extra,
      shipping_suboption, store_id, subtotal, total, total_usd, updated_at, id,
      shipping_carrier_name, shipping_store_branch_name, landing_url, language, next_action,
      billing_address, billing_business_name, billing_city, billing_country, billing_customer_type,
      billing_document_type, billing_floor, billing_locality, billing_name, billing_number,
      billing_phone, billing_province, billing_state_registration, billing_trade_name, billing_zipcode,
      cancel_reason, note, storefront, order_origin, owner_note, shipping_tracking_number,
      contact_email, contact_identification, contact_name, contact_phone, shipping_tracking_url,
      shipping_option, currency, payment_status, shipping_option_code, shipping_option_reference,
      status, shipping_pickup_type, shipping_status, shipping, token, gateway, gateway_id, gateway_link,
      gateway_name
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38,
      $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56,
      $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74,
      $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88
    )
    ON CONFLICT (order_id) DO UPDATE SET
      weight = EXCLUDED.weight,
      app_id = EXCLUDED.app_id,
      attributes = EXCLUDED.attributes,
      cancelled_at = EXCLUDED.cancelled_at,
      checkout_enabled = EXCLUDED.checkout_enabled,
      client_details = EXCLUDED.client_details,
      closed_at = EXCLUDED.closed_at,
      completed_at = EXCLUDED.completed_at,
      coupon = EXCLUDED.coupon,
      created_at = EXCLUDED.created_at,
      customer = EXCLUDED.customer,
      customer_visit = EXCLUDED.customer_visit,
      discount = EXCLUDED.discount,
      discount_coupon = EXCLUDED.discount_coupon,
      discount_gateway = EXCLUDED.discount_gateway,
      extra = EXCLUDED.extra,
      free_shipping_config = EXCLUDED.free_shipping_config,
      fulfillments = EXCLUDED.fulfillments,
      has_shippable_products = EXCLUDED.has_shippable_products,
      number = EXCLUDED.number,
      paid_at = EXCLUDED.paid_at,
      payment_count = EXCLUDED.payment_count,
      payment_details = EXCLUDED.payment_details,
      products = EXCLUDED.products,
      promotional_discount = EXCLUDED.promotional_discount,
      read_at = EXCLUDED.read_at,
      same_billing_and_shipping_address = EXCLUDED.same_billing_and_shipping_address,
      shipped_at = EXCLUDED.shipped_at,
      shipping_address = EXCLUDED.shipping_address,
      shipping_cost_customer = EXCLUDED.shipping_cost_customer,
      shipping_cost_owner = EXCLUDED.shipping_cost_owner,
      shipping_max_days = EXCLUDED.shipping_max_days,
      shipping_min_days = EXCLUDED.shipping_min_days,
      shipping_pickup_details = EXCLUDED.shipping_pickup_details,
      shipping_store_branch_extra = EXCLUDED.shipping_store_branch_extra,
      shipping_suboption = EXCLUDED.shipping_suboption,
      store_id = EXCLUDED.store_id,
      subtotal = EXCLUDED.subtotal,
      total = EXCLUDED.total,
      total_usd = EXCLUDED.total_usd,
      updated_at = EXCLUDED.updated_at,
      id = EXCLUDED.id,
      shipping_carrier_name = EXCLUDED.shipping_carrier_name,
      shipping_store_branch_name = EXCLUDED.shipping_store_branch_name,
      landing_url = EXCLUDED.landing_url,
      language = EXCLUDED.language,
      next_action = EXCLUDED.next_action,
      billing_address = EXCLUDED.billing_address,
      billing_business_name = EXCLUDED.billing_business_name,
      billing_city = EXCLUDED.billing_city,
      billing_country = EXCLUDED.billing_country,
      billing_customer_type = EXCLUDED.billing_customer_type,
      billing_document_type = EXCLUDED.billing_document_type,
      billing_floor = EXCLUDED.billing_floor,
      billing_locality = EXCLUDED.billing_locality,
      billing_name = EXCLUDED.billing_name,
      billing_number = EXCLUDED.billing_number,
      billing_phone = EXCLUDED.billing_phone,
      billing_province = EXCLUDED.billing_province,
      billing_state_registration = EXCLUDED.billing_state_registration,
      billing_trade_name = EXCLUDED.billing_trade_name,
      billing_zipcode = EXCLUDED.billing_zipcode,
      cancel_reason = EXCLUDED.cancel_reason,
      note = EXCLUDED.note,
      storefront = EXCLUDED.storefront,
      order_origin = EXCLUDED.order_origin,
      owner_note = EXCLUDED.owner_note,
      shipping_tracking_number = EXCLUDED.shipping_tracking_number,
      contact_email = EXCLUDED.contact_email,
      contact_identification = EXCLUDED.contact_identification,
      contact_name = EXCLUDED.contact_name,
      contact_phone = EXCLUDED.contact_phone,
      shipping_tracking_url = EXCLUDED.shipping_tracking_url,
      shipping_option = EXCLUDED.shipping_option,
      currency = EXCLUDED.currency,
      payment_status = EXCLUDED.payment_status,
      shipping_option_code = EXCLUDED.shipping_option_code,
      shipping_option_reference = EXCLUDED.shipping_option_reference,
      status = EXCLUDED.status,
      shipping_pickup_type = EXCLUDED.shipping_pickup_type,
      shipping_status = EXCLUDED.shipping_status,
      shipping = EXCLUDED.shipping,
      token = EXCLUDED.token,
      gateway = EXCLUDED.gateway,
      gateway_id = EXCLUDED.gateway_id,
      gateway_link = EXCLUDED.gateway_link,
      gateway_name = EXCLUDED.gateway_name
    RETURNING *`

	for (const order of orders) {
		try {
			await query(queryText, [
				order.data.weight || null,
				order.data.app_id || null,
				order.data.attributes || null,
				order.data.cancelled_at || null,
				order.data.checkout_enabled || null,
				order.data.client_details || null,
				order.data.closed_at || null,
				order.data.completed_at || null,
				JSON.stringify(order.data.coupon) || null,
				order.data.created_at || null,
				order.data.customer || null,
				order.data.customer_visit || null,
				order.data.discount || null,
				order.data.discount_coupon || null,
				order.data.discount_gateway || null,
				order.data.extra || null,
				order.data.free_shipping_config || null,
				JSON.stringify(order.data.fulfillments) || null,
				order.data.has_shippable_products || null,
				order.orderId || null, // corrigiu a ordem para colocar order_id
				order.data.number || null,
				order.data.paid_at || null,
				order.data.payment_count || null,
				order.data.payment_details || null,
				JSON.stringify(order.data.products) || null,
				order.data.promotional_discount || null,
				order.data.read_at || null,
				order.data.same_billing_and_shipping_address || null,
				order.data.shipped_at || null,
				order.data.shipping_address || null,
				order.data.shipping_cost_customer || null,
				order.data.shipping_cost_owner || null,
				order.data.shipping_max_days || null,
				order.data.shipping_min_days || null,
				order.data.shipping_pickup_details || null,
				order.data.shipping_store_branch_extra || null,
				order.data.shipping_suboption || null,
				order.data.store_id || null,
				order.data.subtotal || null,
				order.data.total || null,
				order.data.total_usd || null,
				order.data.updated_at || null,
				order.data.id || null,
				order.data.shipping_carrier_name || null,
				order.data.shipping_store_branch_name || null,
				order.data.landing_url || null,
				order.data.language || null,
				order.data.next_action || null,
				order.data.billing_address || null,
				order.data.billing_business_name || null,
				order.data.billing_city || null,
				order.data.billing_country || null,
				order.data.billing_customer_type || null,
				order.data.billing_document_type || null,
				order.data.billing_floor || null,
				order.data.billing_locality || null,
				order.data.billing_name || null,
				order.data.billing_number || null,
				order.data.billing_phone || null,
				order.data.billing_province || null,
				order.data.billing_state_registration || null,
				order.data.billing_trade_name || null,
				order.data.billing_zipcode || null,
				order.data.cancel_reason || null,
				order.data.note || null,
				order.data.storefront || null,
				order.data.order_origin || null,
				order.data.owner_note || null,
				order.data.shipping_tracking_number || null,
				order.data.contact_email || null,
				order.data.contact_identification || null,
				order.data.contact_name || null,
				order.data.contact_phone || null,
				order.data.shipping_tracking_url || null,
				order.data.shipping_option || null,
				order.data.currency || null,
				order.data.payment_status || null,
				order.data.shipping_option_code || null,
				order.data.shipping_option_reference || null,
				order.data.status || null,
				order.data.shipping_pickup_type || null,
				order.data.shipping_status || null,
				order.data.shipping || null,
				order.data.token || null,
				order.data.gateway || null,
				order.data.gateway_id || null,
				order.data.gateway_link || null,
				order.data.gateway_name || null
			])
		} catch (err) {
			console.error("Erro ao inserir pedido:", err)
		}
	}
}

export const insertOrder = async (order, store) => {
	const tableName =
    store === "outlet" ? "pedidos_outlet" : "pedidos_artepropria"
	const queryText = `
    INSERT INTO ${tableName} (
      weight, app_id, attributes, cancelled_at, checkout_enabled, client_details,
      closed_at, completed_at, coupon, created_at, customer, customer_visit, discount,
      discount_coupon, discount_gateway, extra, free_shipping_config, fulfillments,
      has_shippable_products, order_id, number, paid_at, payment_count, payment_details,
      products, promotional_discount, read_at, same_billing_and_shipping_address,
      shipped_at, shipping_address, shipping_cost_customer, shipping_cost_owner,
      shipping_max_days, shipping_min_days, shipping_pickup_details, shipping_store_branch_extra,
      shipping_suboption, store_id, subtotal, total, total_usd, updated_at, id,
      shipping_carrier_name, shipping_store_branch_name, landing_url, language, next_action,
      billing_address, billing_business_name, billing_city, billing_country, billing_customer_type,
      billing_document_type, billing_floor, billing_locality, billing_name, billing_number,
      billing_phone, billing_province, billing_state_registration, billing_trade_name, billing_zipcode,
      cancel_reason, note, storefront, order_origin, owner_note, shipping_tracking_number,
      contact_email, contact_identification, contact_name, contact_phone, shipping_tracking_url,
      shipping_option, currency, payment_status, shipping_option_code, shipping_option_reference,
      status, shipping_pickup_type, shipping_status, shipping, token, gateway, gateway_id, gateway_link,
      gateway_name
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38,
      $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56,
      $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74,
      $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88
    )
    ON CONFLICT (order_id) DO UPDATE SET
      weight = EXCLUDED.weight,
      app_id = EXCLUDED.app_id,
      attributes = EXCLUDED.attributes,
      cancelled_at = EXCLUDED.cancelled_at,
      checkout_enabled = EXCLUDED.checkout_enabled,
      client_details = EXCLUDED.client_details,
      closed_at = EXCLUDED.closed_at,
      completed_at = EXCLUDED.completed_at,
      coupon = EXCLUDED.coupon,
      created_at = EXCLUDED.created_at,
      customer = EXCLUDED.customer,
      customer_visit = EXCLUDED.customer_visit,
      discount = EXCLUDED.discount,
      discount_coupon = EXCLUDED.discount_coupon,
      discount_gateway = EXCLUDED.discount_gateway,
      extra = EXCLUDED.extra,
      free_shipping_config = EXCLUDED.free_shipping_config,
      fulfillments = EXCLUDED.fulfillments,
      has_shippable_products = EXCLUDED.has_shippable_products,
      number = EXCLUDED.number,
      paid_at = EXCLUDED.paid_at,
      payment_count = EXCLUDED.payment_count,
      payment_details = EXCLUDED.payment_details,
      products = EXCLUDED.products,
      promotional_discount = EXCLUDED.promotional_discount,
      read_at = EXCLUDED.read_at,
      same_billing_and_shipping_address = EXCLUDED.same_billing_and_shipping_address,
      shipped_at = EXCLUDED.shipped_at,
      shipping_address = EXCLUDED.shipping_address,
      shipping_cost_customer = EXCLUDED.shipping_cost_customer,
      shipping_cost_owner = EXCLUDED.shipping_cost_owner,
      shipping_max_days = EXCLUDED.shipping_max_days,
      shipping_min_days = EXCLUDED.shipping_min_days,
      shipping_pickup_details = EXCLUDED.shipping_pickup_details,
      shipping_store_branch_extra = EXCLUDED.shipping_store_branch_extra,
      shipping_suboption = EXCLUDED.shipping_suboption,
      store_id = EXCLUDED.store_id,
      subtotal = EXCLUDED.subtotal,
      total = EXCLUDED.total,
      total_usd = EXCLUDED.total_usd,
      updated_at = EXCLUDED.updated_at,
      id = EXCLUDED.id,
      shipping_carrier_name = EXCLUDED.shipping_carrier_name,
      shipping_store_branch_name = EXCLUDED.shipping_store_branch_name,
      landing_url = EXCLUDED.landing_url,
      language = EXCLUDED.language,
      next_action = EXCLUDED.next_action,
      billing_address = EXCLUDED.billing_address,
      billing_business_name = EXCLUDED.billing_business_name,
      billing_city = EXCLUDED.billing_city,
      billing_country = EXCLUDED.billing_country,
      billing_customer_type = EXCLUDED.billing_customer_type,
      billing_document_type = EXCLUDED.billing_document_type,
      billing_floor = EXCLUDED.billing_floor,
      billing_locality = EXCLUDED.billing_locality,
      billing_name = EXCLUDED.billing_name,
      billing_number = EXCLUDED.billing_number,
      billing_phone = EXCLUDED.billing_phone,
      billing_province = EXCLUDED.billing_province,
      billing_state_registration = EXCLUDED.billing_state_registration,
      billing_trade_name = EXCLUDED.billing_trade_name,
      billing_zipcode = EXCLUDED.billing_zipcode,
      cancel_reason = EXCLUDED.cancel_reason,
      note = EXCLUDED.note,
      storefront = EXCLUDED.storefront,
      order_origin = EXCLUDED.order_origin,
      owner_note = EXCLUDED.owner_note,
      shipping_tracking_number = EXCLUDED.shipping_tracking_number,
      contact_email = EXCLUDED.contact_email,
      contact_identification = EXCLUDED.contact_identification,
      contact_name = EXCLUDED.contact_name,
      contact_phone = EXCLUDED.contact_phone,
      shipping_tracking_url = EXCLUDED.shipping_tracking_url,
      shipping_option = EXCLUDED.shipping_option,
      currency = EXCLUDED.currency,
      payment_status = EXCLUDED.payment_status,
      shipping_option_code = EXCLUDED.shipping_option_code,
      shipping_option_reference = EXCLUDED.shipping_option_reference,
      status = EXCLUDED.status,
      shipping_pickup_type = EXCLUDED.shipping_pickup_type,
      shipping_status = EXCLUDED.shipping_status,
      shipping = EXCLUDED.shipping,
      token = EXCLUDED.token,
      gateway = EXCLUDED.gateway,
      gateway_id = EXCLUDED.gateway_id,
      gateway_link = EXCLUDED.gateway_link,
      gateway_name = EXCLUDED.gateway_name
    RETURNING *`

	try {
		const numericUuid = generateNumericId()

		// Concatena o owner_note com o UUID
		const finalOwnerNote = `${order.data.owner_note}_${numericUuid}`

		await query(queryText, [
			order.data.weight || null,
			order.data.app_id || null,
			order.data.attributes || null,
			order.data.cancelled_at || null,
			order.data.checkout_enabled || null,
			order.data.client_details || null,
			order.data.closed_at || null,
			order.data.completed_at || null,
			JSON.stringify(order.data.coupon) || null,
			order.data.created_at || null,
			order.data.customer || null,
			order.data.customer_visit || null,
			order.data.discount || null,
			order.data.discount_coupon || null,
			order.data.discount_gateway || null,
			order.data.extra || null,
			order.data.free_shipping_config || null,
			JSON.stringify(order.data.fulfillments) || null,
			order.data.has_shippable_products || null,
			order.orderId || null,
			numericUuid,
			order.data.paid_at || null,
			order.data.payment_count || null,
			order.data.payment_details || null,
			JSON.stringify(order.data.products) || null,
			order.data.promotional_discount || null,
			order.data.read_at || null,
			order.data.same_billing_and_shipping_address || null,
			order.data.shipped_at || null,
			order.data.shipping_address || null,
			order.data.shipping_cost_customer || null,
			order.data.shipping_cost_owner || null,
			order.data.shipping_max_days || null,
			order.data.shipping_min_days || null,
			order.data.shipping_pickup_details || null,
			order.data.shipping_store_branch_extra || null,
			order.data.shipping_suboption || null,
			order.data.store_id || null,
			order.data.subtotal || null,
			order.data.total || null,
			order.data.total_usd || null,
			order.data.updated_at || null,
			numericUuid,
			order.data.shipping_carrier_name || null,
			order.data.shipping_store_branch_name || null,
			order.data.landing_url || null,
			order.data.language || null,
			order.data.next_action || null,
			order.data.billing_address || null,
			order.data.billing_business_name || null,
			order.data.billing_city || null,
			order.data.billing_country || null,
			order.data.billing_customer_type || null,
			order.data.billing_document_type || null,
			order.data.billing_floor || null,
			order.data.billing_locality || null,
			order.data.billing_name || null,
			order.data.billing_number || null,
			order.data.billing_phone || null,
			order.data.billing_province || null,
			order.data.billing_state_registration || null,
			order.data.billing_trade_name || null,
			order.data.billing_zipcode || null,
			order.data.cancel_reason || null,
			order.data.note || null,
			order.data.storefront || null,
			order.data.order_origin || null,
			finalOwnerNote, // Atualiza o `owner_note` com o valor gerado
			order.data.shipping_tracking_number || null,
			order.data.contact_email || null,
			order.data.contact_identification || null,
			order.data.contact_name || null,
			order.data.contact_phone || null,
			order.data.shipping_tracking_url || null,
			order.data.shipping_option || null,
			order.data.currency || null,
			order.data.payment_status || null,
			order.data.shipping_option_code || null,
			order.data.shipping_option_reference || null,
			order.data.status || null,
			order.data.shipping_pickup_type || null,
			order.data.shipping_status || null,
			order.data.shipping || null,
			order.data.token || null,
			order.data.gateway || null,
			order.data.gateway_id || null,
			order.data.gateway_link || null,
			order.data.gateway_name || null
		])
	} catch (err) {
		console.error("Erro ao inserir pedido:", err)
	}
}
