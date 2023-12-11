import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

export const fetchOrders = async (params = {}) => {
	const code = process.env.ACCESS_TOKEN
	const storeId = process.env.STORE_ID
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
				"created_at_max": createdAtMax
			}
		})

		const data = response.data

		const orders = data.map((order) => ({
			id: order.id,
			client: order.customer.name,
			createdAt: order.created_at,
			subtotal: order.subtotal,
			total: order.total,
			status: order.payment_status,
			statusOrder: order.status,
			products: order.products
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
