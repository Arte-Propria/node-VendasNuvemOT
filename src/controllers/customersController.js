import { fetchCustomers } from "../services/customerServices.js"

export const getCustomers = async (req, res) => {
	try {
		const params = req.params
		const customers = await fetchCustomers(params)
		res.json(customers)
	} catch (error) {
		console.error(error)
		res.status(404).send("Erro ao buscar clientes")
	}
}
