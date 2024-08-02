import { fetchCategories } from "../services/categoriesServices.js"

export const getCategories = async (req, res) => {
	try {
		const params = req.params
		const categories = await fetchCategories(params)
		res.json(categories)
	} catch (error) {
		console.error(error)
		res.status(500).send("Erro ao buscar categorias")
	}
}