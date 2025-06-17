import { fetchShopeeAuth, generateAuthUrl } from "../services/shopeeServices.js"

export const getShopeeAuth = async (req, res) => {
	try {
		const authUrl = generateAuthUrl()
		res.redirect(authUrl)
	} catch (error) {
		console.error("Erro ao gerar URL de autorização da Shopee:", error)
		res.status(500).json({
			success: false,
			message: "Erro ao gerar URL de autorização da Shopee",
			error: error.message
		})
	}
}

export const handleShopeeCallback = async (req, res) => {
	try {
		const { code, error } = req.query

		if (error) {
			return res.status(400).json({
				success: false,
				message: "Erro na autorização da Shopee",
				error: error
			})
		}

		if (!code) {
			return res.status(400).json({
				success: false,
				message: "Código de autorização não fornecido"
			})
		}

		const authResult = await fetchShopeeAuth(code)

		// Aqui você pode salvar o token no banco de dados
		// TODO: Implementar salvamento do token

		return res.json({
			success: true,
			message: "Autenticação com Shopee realizada com sucesso",
			data: authResult
		})

	} catch (error) {
		console.error("Erro no callback da Shopee:", error)
		return res.status(500).json({
			success: false,
			message: "Erro interno no servidor",
			error: error.message
		})
	}
} 