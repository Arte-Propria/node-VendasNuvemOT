import { fetchCoupons } from "../services/couponServices.js"

export const getCoupons = async (req, res) => {
	try {
		const params = req.params
		const coupons = await fetchCoupons(params)
		res.json(coupons)
	} catch (error) {
		console.error(error)
		res.status(500).send("Erro ao buscar coupons")
	}
}