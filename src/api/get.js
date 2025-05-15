import axios from "axios"
import { config } from "../config/env.js"
import { logEcommerce } from "../utils/logger.js"

export const GETtinyES = async (endpoint, data) => {
	const { idPedidoEcommerce, ...dataOrder } = data
	const pedidos = await tinyApiRequest(endpoint, config.tinyApiTokenArteIntegradaES, dataOrder)
	const { number: numberOrder } = await GETNuvemOrder(idPedidoEcommerce)
	const { pedido } = pedidos.find((pedido) => pedido.pedido.numero_ecommerce === numberOrder.toString())

	if(!pedido) {
		logEcommerce(`Erro ao obter detalhes do pedido ${data.idPedidoEcommerce} na API Tiny. Aguardando 60 segundos para tentar novamente.`, data)
		await new Promise((resolve) => setTimeout(resolve, 60000))
		const retryPedidos = await tinyApiRequest(endpoint, config.tinyApiTokenArteIntegradaES, data)
		const { number: numberOrderRetry } = await GETNuvemOrder(idPedidoEcommerce)
		const { pedido: pedidoRetry } = retryPedidos.find((pedido) => pedido.pedido.numero_ecommerce === numberOrderRetry.toString())
		return pedidoRetry
	}
	
	return pedido
}

export const GETtinyABSTRACT = async (endpoint, data) => {
	const pedidos = await tinyApiRequest(endpoint, config.tinyApiToken, data)

	if(!pedidos) {
		logEcommerce(`Erro ao obter detalhes do pedido ${data.id} na API Tiny. Aguardando 60 segundos para tentar novamente.`, data)
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

export const GETNuvemOrder = async (id) => {
	try {
		// Tenta buscar primeiro na loja Outlet
		const url = `${config.nuvemshopApiBaseUrl}/${config.storeIdOutlet}/orders/${id}`
		const response = await axios({
			method: "get",
			url,
			headers: {
				Authentication: `bearer ${config.accessTokenOutlet}`,
				"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
				"Content-Type": "application/json"
			}
		})
		return response.data
	} catch (error) {
		// Se falhar, tenta buscar na loja Arte Própria
		const urlArtePropria = `${config.nuvemshopApiBaseUrl}/${config.storeIdArtePropria}/orders/${id}`
		const responseArtePropria = await axios({
			method: "get",
			url: urlArtePropria,
			headers: {
				Authentication: `bearer ${config.accessTokenArtePropria}`,
				"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
				"Content-Type": "application/json"
			}
		})
		return responseArtePropria.data
	}
}


