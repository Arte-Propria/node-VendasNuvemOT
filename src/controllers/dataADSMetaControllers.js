import { fetchDataADSMeta } from "../services/dataADSMetaServices.js"

export const getDataADSMeta = async (req, res) => {
	try {
		const params = req.params
		const dataADSMeta = await fetchDataADSMeta(params)
		return res.status(200).json(dataADSMeta)
	} catch (error) {
		console.error(error)
		return res.status(404).send("Erro ao buscar dados do ADS")
	}
}