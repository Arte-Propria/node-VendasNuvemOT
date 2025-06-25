import axios from "axios"
import { config } from "../config/env.js"

// Função para gerar a URL de autorização inicial da SHEIN
export const generateSheinAuthUrl = () => {
	const baseUrl = "https://open.sheincorp.com/oauth/authorize"
	
	const params = new URLSearchParams({
		client_id: config.sheinClientId,
		redirect_uri: config.sheinRedirectUri,
		response_type: "code",
		scope: "read write", // Escopo necessário para acessar dados da SHEIN
		state: generateRandomState() // Estado para segurança
	})
	
	return `${baseUrl}?${params.toString()}`
}

// Função para trocar o código por token de acesso
export const fetchSheinAuth = async (code) => {
	try {
		const params = new URLSearchParams({
			client_id: config.sheinClientId,
			client_secret: config.sheinClientSecret,
			code: code,
			grant_type: "authorization_code",
			redirect_uri: config.sheinRedirectUri
		})

		const response = await axios.post("https://open.sheincorp.com/oauth/token", params, {
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			}
		})
		
		return response.data
	} catch (error) {
		console.error("Erro ao obter token de acesso da SHEIN:", error)
		throw new Error(`Erro na autenticação da SHEIN: ${error.message}`)
	}
}

// Função para gerar estado aleatório para segurança
const generateRandomState = () => {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// Função para renovar token de acesso (se necessário)
export const refreshSheinToken = async (refreshToken) => {
	try {
		const params = new URLSearchParams({
			client_id: config.sheinClientId,
			client_secret: config.sheinClientSecret,
			refresh_token: refreshToken,
			grant_type: "refresh_token"
		})

		const response = await axios.post("https://open.sheincorp.com/oauth/token", params, {
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			}
		})
		
		return response.data
	} catch (error) {
		console.error("Erro ao renovar token da SHEIN:", error)
		throw new Error(`Erro ao renovar token da SHEIN: ${error.message}`)
	}
} 