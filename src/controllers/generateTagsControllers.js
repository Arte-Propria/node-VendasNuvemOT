import { generateTagsIAServices } from "../services/generateTagsServices.js"

export const generateTagsIA = async (req, res) => {
	try {
		const { store, date } = req.params
		const response = await generateTagsIAServices(store, date)

		return res.status(response.status).json({
			success: response.success,
			message: response.message,
			data: response.data
		})
	} catch (error) {
		console.error(error)
		return res.status(error.status).json({
			success: false,
			message: error.message,
			data: null
		})
	}
}