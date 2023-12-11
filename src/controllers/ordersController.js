import { fetchOrders } from "../services/orderServices.js"

export const getOrders = async (req, res) => {
	try {
		const params = req.params
		const orders = await fetchOrders(params)
		res.json(orders)
	} catch (error) {
		console.error(error)
		res.status(500).send("Erro ao buscar pedidos")
	}
}
