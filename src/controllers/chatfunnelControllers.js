import { fetchOrdersChatFunnel } from "../services/chatfunnelServices.js"

export const getOrdersChatFunnel = async (req, res) => {
	try {
		const params = req.params
		const orders = await fetchOrdersChatFunnel(params)
		res.json(orders)
	} catch (error) {
		console.error(error)
		res.status(404).send(error)
	}
}
