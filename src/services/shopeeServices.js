import axios from "axios"
import { config } from "../config/env.js"
import crypto from "crypto"

// Função para gerar a URL de autorização inicial
export const generateAuthUrl = () => {
	const baseUrl = "https://partner.shopeemobile.com/api/v2/shop/auth_partner"
	const timestamp = Math.floor(Date.now() / 1000)
	const apiPath = "/api/v2/shop/auth_partner"
	
	// Criar string para assinatura seguindo a ordem: partner_id + api path + timestamp
	const signString = `${config.shopeePartnerId}${apiPath}${timestamp}`
	
	// Gerar assinatura usando HMAC-SHA256
	const sign = crypto
		.createHmac("sha256", config.shopeePartnerKey)
		.update(signString)
		.digest("hex")

	const params = new URLSearchParams({
		partner_id: config.shopeePartnerId,
		redirect: config.shopeeRedirectUri,
		timestamp: timestamp,
		sign: sign
	})
	
	return `${baseUrl}?${params.toString()}`
}

// Função para trocar o código por token
export const fetchShopeeAuth = async (code) => {
	try {
		const response = await axios.post("https://partner.shopeemobile.com/api/v2/auth/token", {
			code: code,
			partner_id: config.shopeePartnerId,
			partner_key: config.shopeePartnerKey
		})
		return response.data
	} catch (error) {
		console.error("Error getting Shopee access token:", error)
		return config.shopeeRedirectUri + "?success=false&error=" + error.message
	}
}