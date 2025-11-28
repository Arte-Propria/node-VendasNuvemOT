import { fetchAnalytics } from "../services/analyticsServices.js"

export const getAnalytics = async (req, res) => {
	try {
		const params = req.params
		const analytics = await fetchAnalytics(params)
		return res.json(analytics)
	} catch (error) {
		console.error(error)
		return res.status(500).send("Erro ao buscar analytics")
	}
}