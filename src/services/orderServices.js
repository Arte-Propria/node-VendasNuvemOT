import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

export const fetchOrders = async (params = {}) => {
	const { store } = params
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

	let url = `https://api.tiendanube.com/v1/${storeId}/orders`

	// Define a data atual para o início do dia
	const currentDateStart = new Date()
	currentDateStart.setHours(
		0, 0, 0, 0
	)

	// Define a data atual para o final do dia
	const currentDateEnd = new Date()
	currentDateEnd.setHours(
		23, 59, 59, 999
	)

	// Desestruturação dos parâmetros com valores padrão
	const { createdAtMin = currentDateStart, createdAtMax = currentDateEnd } = params

	let allOrders = []
	console.log("Recuperando dados dos pedidos...")

	// Loop para lidar com a paginação da API
	while (url) {
		const response = await axios({
			method: "get",
			url: url,
			headers: {
				"Authentication": `bearer ${code}`,
				"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
				"Content-Type": "application/json"
			},
			params: {
				"created_at_min": createdAtMin,
				"created_at_max": createdAtMax,
				"per_page": 156
			}
		})

		const data = response.data

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

		// Verifica o cabeçalho "Link" para a próxima página
		const linkHeader = response.headers.link
		const nextLinkMatch = /<([^>]+)>;\s*rel="next"/.exec(linkHeader)

		if (nextLinkMatch) {
			url = nextLinkMatch[1]
		} else {
			url = null // Não há mais páginas
		}
	}

	return allOrders
}

