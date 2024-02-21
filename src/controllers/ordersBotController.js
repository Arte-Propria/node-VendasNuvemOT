import { fetchOrdersBot } from "../services/orderServicesBot.js"

export const getOrdersBot = async (req, res) => {
	try {
		const params = req.params
		const orders = await fetchOrdersBot(params)
		res.json(orders)
	} catch (error) {
		console.error(error)
		res.status(404).send("Erro ao buscar pedidos")
	}
}
