import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

export const fetchOrdersBot = async (params = {}) => {
	const { store, cpf } = params
	let code
	let storeId

	if (store === "outlet") {
		code = process.env.ACCESS_TOKEN_OUTLET
		storeId = process.env.STORE_ID_OUTLET
	} else if (store === "artepropria") {
		code = process.env.ACCESS_TOKEN_ARTEPROPRIA
		storeId = process.env.STORE_ID_ARTEPROPRIA
	}

	let url = `https://api.tiendanube.com/v1/${storeId}/orders`
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
				"per_page": 156,
				"q": cpf
			}
		})

		const orders = response.data.map((order) => ({
			id: order.id,
			client: order.customer.name,
			cpf: order.contact_identification,
			status: order.payment_status,
			statusOrder: order.status,
			codigoRastreio: order.shipping_tracking_number,
			urlRastreio: order.shipping_tracking_url,
			data: order
		}))

		// Verifica se algum pedido na página atual possui o CPF desejado
		const foundOrder = orders.find((order) => order.cpf === cpf)
		if (foundOrder) {
			console.log("Pedido encontrado com o CPF fornecido.")
			return foundOrder // Retorna imediatamente os dados do pedido encontrado
		}

		// Prepara para a próxima página, se houver
		const linkHeader = response.headers.link
		const nextLinkMatch = /<([^>]+)>;\s*rel="next"/.exec(linkHeader)

		if (nextLinkMatch) {
			url = nextLinkMatch[1]
		} else {
			url = null // Não há mais páginas
		}
	}

	// Retorna nulo se nenhum pedido com o CPF especificado for encontrado após verificar todas as páginas
	console.log("Nenhum pedido encontrado com o CPF fornecido.")
	return null
}
