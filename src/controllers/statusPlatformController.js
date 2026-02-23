import { getStatusPlatformService } from "../services/statusPlatformServices.js"

export const getStatusPlatform = async (req, res) => {
	const { platform } = req.params
	try {
		const status = await getStatusPlatformService(platform)
		return res.json({
			success: true,
			message: `Status da plataforma ${platform} obtido com sucesso`,
			data: {
        status
      }
		})
	} catch (error) {
		console.error(error)
		return res.status(500).json({
			success: false,
			message: `Erro ao obter status da plataforma ${platform}`,
			error: error.message
		})
	}
}