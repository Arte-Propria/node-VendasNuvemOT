import axios from "axios"
import { config } from "../config/env.js"
import { logEcommerce } from "../utils/logger.js"

export const GETtinyES = async (endpoint, data) => {
	const pedidos = await tinyApiRequest(endpoint, config.tinyApiTokenArteIntegradaES, data)
	const { pedido } = pedidos[0]
	if(!pedido) {
		logEcommerce(`Erro ao obter detalhes do pedido ${data.numeroEcommerce} na API Tiny. Aguardando 60 segundos para tentar novamente.`, data)
		await new Promise((resolve) => setTimeout(resolve, 60000))
		const { pedido: retryPedido } = await tinyApiRequest(endpoint, config.tinyApiTokenArteIntegradaES, data)
		return retryPedido
	}
	
	return pedido
}

export const GETtinyABSTRACT = async (endpoint, data) => {
	const pedidos = await tinyApiRequest(endpoint, config.tinyApiToken, data)
	if(!pedidos) {
		logEcommerce(`Erro ao obter detalhes do pedido ${data.numeroEcommerce} na API Tiny. Aguardando 60 segundos para tentar novamente.`, data)
		await new Promise((resolve) => setTimeout(resolve, 60000))
		const retryPedidos = await tinyApiRequest(endpoint, config.tinyApiToken, data)
		return retryPedidos
	}
	
	return pedidos
}

const tinyApiRequest = async (endpoint, token, data) => {
	const params = {
		token,
		formato: "json",
		...data
	}

	const url = `${config.tinyApiBaseUrl}/${endpoint}`
	const response = await axios.get(url, {
		headers: { "Content-Type": "application/json" },
		params
	})
	
	if (!response.data.retorno.pedidos || response.data.retorno.pedidos.length === 0) {
		return [{ pedido: [] }]
	}

	return response.data.retorno.pedidos
}

export const GETtinyESnote = async (endpoint, data) => {
	const params = {
		token: config.tinyApiTokenArteIntegradaES,
		formato: "json",
		...data
	}

	const url = `${config.tinyApiBaseUrl}/${endpoint}`
	const response = await axios.get(url, {
		headers: { "Content-Type": "application/json" },
		params
	})

	if (!response.data.retorno.nota_fiscal || response.data.retorno.nota_fiscal.length === 0) {
		return { nota_fiscal: 0 }
	}

	return response.data.retorno.nota_fiscal.numero
}


