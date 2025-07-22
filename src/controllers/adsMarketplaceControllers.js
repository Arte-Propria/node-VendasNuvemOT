import { processAdsMarketplace } from "../services/adsMarketplaceServices.js"

export const createAdsMarketplace = async (req, res) => {
	const { body } = req
	try {
		const response = await processAdsMarketplace(body)
		res.status(201).json(response)
	} catch (error) {
		console.error(error)
		res.status(500).send("Erro ao salvar anuncios marketplace")
	}
}