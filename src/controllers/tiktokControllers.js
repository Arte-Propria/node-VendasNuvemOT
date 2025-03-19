import { fetchTiktokAuth } from "../services/tiktokServices.js"

export const getTikTokAuth = async (req, res) => {
	const auth = await fetchTiktokAuth()

	res.redirect(auth)
}
