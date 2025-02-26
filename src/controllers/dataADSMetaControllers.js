import { fetchDataADSMeta } from "../services/dataADSMetaServices.js"

export const getDataADSMeta = async (req, res) => {
	try {
		const params = req.params
		const dataADSMeta = await fetchDataADSMeta(params)
		res.status(200).json(dataADSMeta)
	} catch (error) {
		console.error(error.data)
		const status = error.status
		res.status(status).send("Erro ao buscar dados do ADS")
	}
}