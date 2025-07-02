import axios from "axios"
import { config } from "../config/env.js"
import { query } from "../db/db.js"
import { generateRandomState } from "../tools/tools.js"
import CryptoJS from "crypto-js"

// Função para gerar a URL de autorização inicial da SHEIN
export const generateSheinAuthUrl = () => {
	const baseUrl = "https://openapi-sem.sheincorp.com/#/empower"

	// Parâmetros obrigatórios
	const redirectUrl = Buffer.from(config.sheinRedirectUri).toString("base64") // URL de redirecionamento codificada em Base64
	const appid = config.sheinClientId // AppID da aplicação no portal SHEIN
	
	// Parâmetro opcional - state personalizado para validação
	
	const state = `AUTH-SHEIN-${generateRandomState()}` // Formato seguindo a documentação
	
	// Montagem da URL seguindo exatamente o padrão da documentação
	const url = `${baseUrl}?appid=${appid}&redirectUrl=${redirectUrl}&state=${state}`
	
	return url
}


function generateSheinSignature(
	appid, secretKey, path, timestamp, randomKey
) {
	// Etapa 1: Montar dados da assinatura VALUE
	const value = appid + "&" + timestamp + "&" + path
    
	// Etapa 2: Montar chave de assinatura KEY
	const key = secretKey + randomKey
    
	// Etapa 3: Cálculo HMAC-SHA256 e conversão para hexadecimal
	const hexSignature = CryptoJS.HmacSHA256(value, key).toString()
    
	// Etapa 4: Codificação Base64
	const base64Signature = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(hexSignature))
    
	// Etapa 5: Anexar RandomKey
	const finalSignature = randomKey + base64Signature
    
	return finalSignature
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

		const response = await axios.post("https://openapi.sheincorp.com/oauth/token", params, {
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

// Função para renovar token de acesso (se necessário)
export const refreshSheinToken = async (refreshToken) => {
	try {
		const params = new URLSearchParams({
			client_id: config.sheinClientId,
			client_secret: config.sheinClientSecret,
			refresh_token: refreshToken,
			grant_type: "refresh_token"
		})

		const response = await axios.post("https://openapi.sheincorp.com/oauth/token", params, {
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

// Função para salvar token no banco de dados
export const saveSheinToken = async (tokenData) => {
	try {
		const { access_token, refresh_token, expires_in, scope } = tokenData
		const expiresAt = new Date(Date.now() + expires_in * 1000)
		
		const queryText = `
			INSERT INTO shein_tokens (access_token, refresh_token, expires_at, scope, created_at)
			VALUES ($1, $2, $3, $4, NOW())
			ON CONFLICT (id) DO UPDATE SET
				access_token = EXCLUDED.access_token,
				refresh_token = EXCLUDED.refresh_token,
				expires_at = EXCLUDED.expires_at,
				scope = EXCLUDED.scope,
				updated_at = NOW()
		`
		
		await query(queryText, [access_token, refresh_token, expiresAt, scope])
		console.log("Token da SHEIN salvo com sucesso")
		return true
	} catch (error) {
		console.error("Erro ao salvar token da SHEIN:", error)
		throw new Error(`Erro ao salvar token: ${error.message}`)
	}
}

// Função para recuperar token válido do banco de dados
export const getValidSheinToken = async () => {
	try {
		const queryText = `
			SELECT access_token, refresh_token, expires_at, scope
			FROM shein_tokens
			WHERE expires_at > NOW()
			ORDER BY created_at DESC
			LIMIT 1
		`
		
		const result = await query(queryText)
		
		if (result.rows.length > 0) {
			return result.rows[0]
		}
		
		// Se não há token válido, tenta renovar o último token
		return await refreshLastSheinToken()
	} catch (error) {
		console.error("Erro ao recuperar token da SHEIN:", error)
		throw new Error(`Erro ao recuperar token: ${error.message}`)
	}
}

// Função para renovar o último token salvo
const refreshLastSheinToken = async () => {
	try {
		const queryText = `
			SELECT refresh_token
			FROM shein_tokens
			ORDER BY created_at DESC
			LIMIT 1
		`
		
		const result = await query(queryText)
		
		if (result.rows.length === 0) {
			throw new Error("Nenhum token encontrado para renovação")
		}
		
		const { refresh_token } = result.rows[0]
		const newTokenData = await refreshSheinToken(refresh_token)
		
		// Salva o novo token
		await saveSheinToken(newTokenData)
		
		return {
			access_token: newTokenData.access_token,
			refresh_token: newTokenData.refresh_token,
			expires_at: new Date(Date.now() + newTokenData.expires_in * 1000),
			scope: newTokenData.scope
		}
	} catch (error) {
		console.error("Erro ao renovar token da SHEIN:", error)
		throw new Error(`Erro ao renovar token: ${error.message}`)
	}
}

// Função para fazer requisições autenticadas para a API da SHEIN
export const makeSheinApiRequest = async (endpoint, method = "GET", data = null) => {
	try {
		const tokenData = await getValidSheinToken()
		
		const config = {
			method,
			url: `https://openapi.sheincorp.com${endpoint}`,
			headers: {
				"Authorization": `Bearer ${tokenData.access_token}`,
				"Content-Type": "application/json"
			}
		}
		
		if (data && method !== "GET") {
			config.data = data
		}
		
		const response = await axios(config)
		return response.data
	} catch (error) {
		console.error("Erro na requisição para API da SHEIN:", error)
		throw new Error(`Erro na API da SHEIN: ${error.message}`)
	}
}

// Função para buscar produtos da SHEIN
export const getSheinProducts = async (params = {}) => {
	try {
		const defaultParams = {
			page: 1,
			page_size: 50,
			...params
		}
		
		const queryString = new URLSearchParams(defaultParams).toString()
		const endpoint = `/product/list?${queryString}`
		
		return await makeSheinApiRequest(endpoint)
	} catch (error) {
		console.error("Erro ao buscar produtos da SHEIN:", error)
		throw new Error(`Erro ao buscar produtos: ${error.message}`)
	}
}

// Função para buscar detalhes de um produto específico
export const getSheinProduct = async (productId) => {
	try {
		const endpoint = `/product/detail?product_id=${productId}`
		return await makeSheinApiRequest(endpoint)
	} catch (error) {
		console.error("Erro ao buscar produto da SHEIN:", error)
		throw new Error(`Erro ao buscar produto: ${error.message}`)
	}
}

// Função para buscar pedidos da SHEIN
export const getSheinOrders = async (params = {}) => {
	try {
		const defaultParams = {
			page: 1,
			page_size: 50,
			...params
		}
		
		const queryString = new URLSearchParams(defaultParams).toString()
		const endpoint = `/order/list?${queryString}`
		
		return await makeSheinApiRequest(endpoint)
	} catch (error) {
		console.error("Erro ao buscar pedidos da SHEIN:", error)
		throw new Error(`Erro ao buscar pedidos: ${error.message}`)
	}
}

// Função para buscar detalhes de um pedido específico
export const getSheinOrder = async (orderId) => {
	try {
		const endpoint = `/order/detail?order_id=${orderId}`
		return await makeSheinApiRequest(endpoint)
	} catch (error) {
		console.error("Erro ao buscar pedido da SHEIN:", error)
		throw new Error(`Erro ao buscar pedido: ${error.message}`)
	}
}

// Função para atualizar status de um pedido
export const updateSheinOrderStatus = async (orderId, status) => {
	try {
		const endpoint = "/order/status/update"
		const data = {
			order_id: orderId,
			status: status
		}
		
		return await makeSheinApiRequest(endpoint, "POST", data)
	} catch (error) {
		console.error("Erro ao atualizar status do pedido da SHEIN:", error)
		throw new Error(`Erro ao atualizar status: ${error.message}`)
	}
} 