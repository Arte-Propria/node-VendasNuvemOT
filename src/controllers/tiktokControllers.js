import { fetchTiktokAuth, fetchTiktokAds } from "../services/tiktokServices.js"

export const getTikTokAuth = async (req, res) => {
	const auth = await fetchTiktokAuth()

	res.redirect(auth)
}

export const getTikTokAds = async (req, res) => {
	const ads = await fetchTiktokAds()
	res.status(200).json(ads)
}

