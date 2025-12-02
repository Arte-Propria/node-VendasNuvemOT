import axios from "axios"
import { config } from "../config/env.js"
import { logEcommerce } from "../utils/logger.js"

export const GETtinyES = async (endpoint, data) => {
	const { idPedidoEcommerce, ...dataOrder } = data
	const pedidos = await tinyApiRequest(endpoint, config.tinyApiTokenArteIntegradaES, dataOrder)
	const dataPedido = pedidos.find((pedido) => pedido.pedido.numero_ecommerce === idPedidoEcommerce)

	if(!dataPedido) {
		const { number: numberOrder } = await GETNuvemOrder(idPedidoEcommerce)
		const { pedido: pedidoRetry } = pedidos.find((pedido) => pedido.pedido.numero_ecommerce === numberOrder.toString())
		return pedidoRetry
	}

	return dataPedido.pedido
}

export const GETOrdersTinyINTEGRADA = async (endpoint, data) => {
	const { pedidos } = await tinyApiRequestPaginated(endpoint, config.tinyApiTokenArteIntegrada, data)

	return pedidos
}

export const GETOrdersTinyINTEGRADAES = async (endpoint, data) => {
	const { pedidos } = await tinyApiRequestPaginated(endpoint, config.tinyApiTokenArteIntegradaES, data)

	return pedidos
}

export const GETOrdersTinyBASEL = async (endpoint, data) => {
	const { pedidos } = await tinyApiRequestPaginated(endpoint, config.tinyApiTokenBasel, data)

	return pedidos
}

export const GETOrdersTinyABSTRACT = async (endpoint, data) => {
	const { pedidos } = await tinyApiRequestPaginated(endpoint, config.tinyApiToken, data)

	return pedidos
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

const tinyApiRequestPaginated = async (endpoint, token, data) => {
	const url = `${config.tinyApiBaseUrl}/${endpoint}`
	const baseParams = { token, formato: "json", ...data }
	
	const response = await axios.get(url, {
		headers: { "Content-Type": "application/json" },
		params: baseParams
	})

	if(!response.data.retorno.pedidos || response.data.retorno.pedidos.length === 0) {
		return { pedidos: [] }
	}
	
	const { numero_paginas, pedidos } = response.data.retorno
	let pedidosAll = [...pedidos]

	if(numero_paginas > 1) {
		const paginasAdicionais = await Promise.all(Array.from({ length: numero_paginas - 1 }, (_, i) => i + 2)
			.map((pagina) => 
				axios.get(url, {
					headers: { "Content-Type": "application/json" },
					params: { ...baseParams, pagina }
				})))
		
		paginasAdicionais.forEach((response) => {
			if(response.data.retorno.pedidos) {	
				pedidosAll.push(...response.data.retorno.pedidos)
			}
		})
	}
	
	return { pedidos: pedidosAll }
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

export const GETNuvemOrderByCPF = async (cpf) => {
	try {
		// Tenta buscar primeiro na loja Outlet
		const url = `${config.nuvemshopApiBaseUrl}/${config.storeIdOutlet}/orders`
		const response = await axios({
			method: "get",
			url,
			headers: {
				Authentication: `bearer ${config.accessTokenOutlet}`,
				"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
				"Content-Type": "application/json"
			},
			params: {
				"per_page": 156,
				"q": cpf
			}
		})
		return response.data[0]
	} catch (error) {
		// Se falhar, tenta buscar na loja Arte Própria
		const urlArtePropria = `${config.nuvemshopApiBaseUrl}/${config.storeIdArtePropria}/orders`
		const responseArtePropria = await axios({
			method: "get",
			url: urlArtePropria,
			headers: {
				Authentication: `bearer ${config.accessTokenArtePropria}`,
				"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
				"Content-Type": "application/json"
			},
			params: {
				"per_page": 156,
				"q": cpf
			}
		})
		return responseArtePropria.data[0]
	}
}

export const GETNuvemOrderByNumberOrder = async (numberOrder, store) => {
	let code
	let storeId

	if (store === "OUTLETDOSQUADROS") {
		code = config.accessTokenOutlet
		storeId = config.storeIdOutlet
	} else if (store === "ARTEPROPRIA") {
		code = config.accessTokenArtePropria
		storeId = config.storeIdArtePropria
	}

	let url = `${config.nuvemshopApiBaseUrl}/${storeId}/orders`
	logEcommerce(`Recuperando dados do pedido ${numberOrder} na Nuvemshop...`)

	try {
		const response = await axios.get(url, {
			headers: {
				"Authentication": `bearer ${code}`,
				"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
				"Content-Type": "application/json"
			},
			params: {
				"per_page": 156,
				"q": numberOrder
			}
		})

		return response.data[0]
	} catch (error) {
		logEcommerce(`Erro ao recuperar pedido ${numberOrder} na Nuvemshop: ${error.message}`)

		return {
			status: "error",
			message: `Erro ao recuperar pedido ${numberOrder} na Nuvemshop: ${error.message}`
		}
	}
}


