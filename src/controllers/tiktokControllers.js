import { fetchTiktokAuth, fetchTiktokAds } from "../services/tiktokServices.js"

export const getTikTokAuth = async (req, res) => {
	const auth = await fetchTiktokAuth()

	res.redirect(auth)
}

export const getTikTokAds = async (req, res) => {
	const { store, createdAtMin, createdAtMax } = req.params

	const ads = await fetchTiktokAds(store, createdAtMin, createdAtMax)
	
	res.status(200).json(ads)
}

