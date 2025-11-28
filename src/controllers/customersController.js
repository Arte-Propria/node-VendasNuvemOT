import { fetchCustomers } from "../services/customerServices.js"

export const getCustomers = async (req, res) => {
	try {
		const params = req.params
		const customers = await fetchCustomers(params)
		return res.json(customers)
	} catch (error) {
		console.error(error)
		return res.status(404).send("Erro ao buscar clientes")
	}
}
