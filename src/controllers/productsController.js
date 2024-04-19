import { fetchProduct, fetchProducts } from "../services/productServices.js"

export const getProducts = async (req, res) => {
	try {
		const products = await fetchProducts()
		res.json(products)
	} catch (error) {
		console.error(error)
		res.status(500).send("Erro ao buscar produtos")
	}
}

export const getProduct = async (req, res) => {
	const params = req.params
	try {
		const products = await fetchProduct(params)
		res.json(products)
	} catch (error) {
		console.error(error)
		res.status(500).send("Erro ao buscar produtos")
	}
}