import { fetchCoupons } from "../services/couponServices"

export const getCoupons = async (req, res) => {
	try {
		const coupons = await fetchCoupons()
		res.json(coupons)
	} catch (error) {
		console.error(error)
		res.status(500).send("Erro ao buscar coupons")
	}
}