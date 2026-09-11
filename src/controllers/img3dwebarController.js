import {
	getImg3dwebarService,
	Img3dwebarInputError
} from "../services/img3dwebarServices.js"

// GET /webar/images/:store/:id → imagens do produto para o visualizador AR (3DWebAR)
export const getImg3dwebar = async (req, res) => {
	const { store, id } = req.params
	try {
		const data = await getImg3dwebarService(store, id)

		if (!data) {
			return res.status(404).json({
				success: false,
				message: `Nenhuma imagem cadastrada para o produto ${id}`
			})
		}

		return res.status(200).json({
			success: true,
			message: `Imagens do produto ${id} obtidas com sucesso`,
			data
		})
	} catch (error) {
		if (error instanceof Img3dwebarInputError) {
			return res.status(400).json({ success: false, message: error.message })
		}
		console.error(error)
		return res.status(500).json({
			success: false,
			message: `Erro ao obter imagens do produto ${id}`,
			error: error.message
		})
	}
}
