import { config } from "../config/env.js"

const NUVEMSHOP_TOKEN_URL = "https://www.nuvemshop.com.br/apps/authorize/token"

/* eslint-disable camelcase -- API Nuvemshop usa snake_case (client_id, access_token, user_id) */

/**
 * Callback OAuth da Nuvemshop.
 * A Nuvemshop redireciona para esta URL com ?code=xxx (e opcionalmente ?state=xxx).
 * Trocamos o code por access_token e user_id (ID da loja).
 */
export const getNuvemshopCallback = async (req, res) => {
	try {
		const { code, error } = req.query

		if (error) {
			return res.status(400).json({
				success: false,
				message: "Erro na autorização da Nuvemshop",
				error
			})
		}

		if (!code) {
			return res.status(400).json({
				success: false,
				message: "Código de autorização não fornecido. A Nuvemshop deve redirecionar com ?code=..."
			})
		}

		const clientId = config.nuvemshopClientId
		const clientSecret = config.nuvemshopClientSecret

		if (!clientId || !clientSecret) {
			return res.status(500).json({
				success: false,
				message: "App Nuvemshop não configurado. Defina NUVEMSHOP_APP_ID e NUVEMSHOP_APP_SECRET no .env"
			})
		}

		const body = {
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: "authorization_code",
			code
		}

		const response = await fetch(NUVEMSHOP_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body)
		})

		if (!response.ok) {
			const errText = await response.text()
			console.error("Nuvemshop token error:", response.status, errText)
			return res.status(response.status).json({
				success: false,
				message: "Falha ao trocar o code por access_token na Nuvemshop",
				error: errText
			})
		}

		const data = await response.json()
		// data: access_token, token_type, scope, user_id (user_id = ID da loja)
		// TODO: persistir access_token e user_id (ex.: por loja no banco)
		// await salvarTokenPorLoja(data.user_id, data.access_token)

		const appUrl = config.nuvemshopRedirectUri
		if (appUrl) {
			const url = new URL(appUrl)
			return res.redirect(302, url.toString())
		}

		return res.json({
			success: true,
			message: "App instalado com sucesso. Guarde o access_token e user_id (ID da loja).",
			data: {
				access_token: data.access_token,
				token_type: data.token_type,
				scope: data.scope,
				user_id: data.user_id
			}
		})
	} catch (error) {
		console.error("Erro no callback Nuvemshop:", error)
		return res.status(500).json({
			success: false,
			message: "Erro ao processar callback da Nuvemshop",
			error: error.message
		})
	}
}
