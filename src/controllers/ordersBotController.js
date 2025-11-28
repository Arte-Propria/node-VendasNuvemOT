import { fetchOrdersBot } from "../services/orderServicesBot.js"

export const getOrdersBot = async (req, res) => {
	try {
		const params = req.params
		const orders = await fetchOrdersBot(params)
		return res.json(orders)
	} catch (error) {
		console.error(error)
		return res.status(404).send("Erro ao buscar pedidos")
	}
}
