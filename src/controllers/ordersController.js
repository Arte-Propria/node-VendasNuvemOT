import { fetchOrders } from "../services/orderServices.js"

export const getOrders = async (req, res) => {
	try {
		const orders = await fetchOrders()
		res.json(orders)
	} catch (error) {
		console.error(error)
		res.status(500).send("Erro ao buscar pedidos")
	}
}
