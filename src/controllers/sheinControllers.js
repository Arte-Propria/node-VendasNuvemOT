import { generateSheinAuthUrl, fetchSheinAuth } from "../services/sheinServices.js"

export const getSheinAuth = async (req, res) => {
	try {
		const authUrl = generateSheinAuthUrl()
		res.redirect(authUrl)
	} catch (error) {
		console.error("Erro ao gerar URL de autorização da SHEIN:", error)
		res.status(500).json({
			success: false,
			message: "Erro ao gerar URL de autorização da SHEIN",
			error: error.message
		})
	}
}

export const handleSheinCallback = async (req, res) => {
	try {
		const { code, error } = req.query

		if (error) {
			return res.status(400).json({
				success: false,
				message: "Erro na autorização da SHEIN",
				error: error
			})
		}

		if (!code) {
			return res.status(400).json({
				success: false,
				message: "Código de autorização não fornecido"
			})
		}

		const authResult = await fetchSheinAuth(code)

		// Aqui você pode salvar o token no banco de dados
		// TODO: Implementar salvamento do token

		return res.json({
			success: true,
			message: "Autenticação com SHEIN realizada com sucesso",
			data: authResult
		})

	} catch (error) {
		console.error("Erro no callback da SHEIN:", error)
		return res.status(500).json({
			success: false,
			message: "Erro interno no servidor",
			error: error.message
		})
	}
} 