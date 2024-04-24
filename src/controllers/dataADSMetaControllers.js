import { fetchDataADSMeta } from "../services/dataADSMetaServices.js"

export const getDataADSMeta = async (req, res) => {
	try {
		const params = req.params
		const dataADSMeta = await fetchDataADSMeta(params)
		res.json(dataADSMeta)
	} catch (error) {
		console.error(error)
		res.status(500).send("Erro ao buscar dados do ADS")
	}
}