import { fetchCategoriesChatFunnel, fetchOrdersChatFunnel, fetchProductsChatFunnel } from "../services/chatfunnelServices.js"

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

export const getProductsChatFunnel = async (req, res) => {
	try {
		const params = req.params
		const products = await fetchProductsChatFunnel(params)
		res.json(products)
	} catch (error) {
		console.error(error)
		res.status(404).send(error)
	}
}

export const getCategoriesChatFunnel = async (req, res) => {
	try {
		const params = req.params
		const categories = await fetchCategoriesChatFunnel(params)
		res.json(categories)
	} catch (error) {
		console.error(error)
		res.status(404).send(error)
	}
}
