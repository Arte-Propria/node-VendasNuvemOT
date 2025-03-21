import { fetchTiktokAuth, fetchTiktokAds } from "../services/tiktokServices.js"

export const getTikTokAuth = async (req, res) => {
	try {
		const auth = await fetchTiktokAuth()
		res.redirect(auth)
	} catch (error) {
		console.error(error.data)
		const status = error.status
		res.status(status).send("Erro ao buscar a Auth do Tiktok")
	}
}

export const getTikTokAds = async (req, res) => {
	try {
		const { store, createdAtMin, createdAtMax } = req.params
		const ads = await fetchTiktokAds(store, createdAtMin, createdAtMax)
		res.status(200).json(ads)
	} catch (error) {
		console.error(error.data)
		const status = error.status
		res.status(status).send("Erro ao buscar dados do Tiktok")
	}
}

