import axios from "axios"
import dotenv from "dotenv"
import { isOrderFromToday } from "../tools/isOrderFromToday.js"

dotenv.config()

export const fetchOrders = async () => {
	const code = process.env.ACCESS_TOKEN
	const storeId = process.env.STORE_ID
	let url = `https://api.tiendanube.com/v1/${storeId}/orders`
	let allOrders = []
	console.log("Recuperando dados dos pedidos...")

	while(url) {
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

		const orders = data.map((order) => ({
			id: order.id,
			client: order.customer.name,
			createdAt: order.created_at,
			subtotal: order.subtotal,
			total: order.total,
			status: order.payment_status
		}))

		allOrders = allOrders.concat(orders)

		// Verifique o cabeçalho "Link" para a próxima página
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
