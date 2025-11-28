import { processAdsMarketplace, fetchAdsMarketplace } from "../services/adsMarketplaceServices.js"

export const createAdsMarketplace = async (req, res) => {
	const { body } = req
	try {
		const response = await processAdsMarketplace(body)
		return res.status(201).json(response)
	} catch (error) {
		console.error(error, body)
		return res.status(500).send("Erro ao salvar anuncios marketplace")
	}
}

export const getAdsMarketplace = async (req, res) => {
	const { createdAtMin, createdAtMax, marketplace } = req.query
	try {
		const response = await fetchAdsMarketplace(createdAtMin, createdAtMax, marketplace)
		return res.status(200).json(response)
	} catch (error) {
		console.error(error)
		return res.status(500).send("Erro ao buscar anuncios marketplace")
	}
}
