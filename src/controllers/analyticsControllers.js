import { fetchAnalytics } from "../services/analyticsServices.js"

export const getAnalytics = async (req, res) => {
	try {
		const params = req.params
		const analytics = await fetchAnalytics(params)
		res.json(analytics)
	} catch (error) {
		console.error(error)
		res.status(500).send("Erro ao buscar analytics")
	}
}