import { fetchCategoriesChatFunnel, fetchOrdersChatFunnel, fetchProductsChatFunnel } from "../services/chatfunnelServices.js"

export const getOrdersChatFunnel = async (req, res) => {
	try {
		const params = req.params
		const orders = await fetchOrdersChatFunnel(params)
		return res.json(orders)
	} catch (error) {
		console.error(error)
		return res.status(404).send(error)
	}
}

export const getProductsChatFunnel = async (req, res) => {
	try {
		const params = req.params
		const products = await fetchProductsChatFunnel(params)
		return res.json(products)
	} catch (error) {
		console.error(error)
		return res.status(404).send(error)
	}
}

export const getCategoriesChatFunnel = async (req, res) => {
	try {
		const params = req.params
		const categories = await fetchCategoriesChatFunnel(params)
		return res.json(categories)
	} catch (error) {
		console.error(error)
		return res.status(404).send(error)
	}
}
