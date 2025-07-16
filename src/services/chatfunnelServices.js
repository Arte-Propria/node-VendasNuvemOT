import axios from "axios"
import { config } from "../config/env.js"
import { logChatFunnel } from "../utils/logger.js"

export const fetchOrdersChatFunnel = async (params) => {
	const { store, client } = params
	let code
	let storeId

	if (store === "outlet") {
		code = config.accessTokenOutlet
		storeId = config.storeIdOutlet
	} else if (store === "artepropria") {
		code = config.accessTokenArtePropria
		storeId = config.storeIdArtePropria
	}

	let url = `${config.nuvemshopApiBaseUrl}/${storeId}/orders`
	logChatFunnel(`Recuperando dados dos pedidos do ${store}...`)

	const response = await axios({
		method: "get",
		url: url,
		headers: {
			"Authentication": `bearer ${code}`,
			"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
			"Content-Type": "application/json"
		},
		params: {
			"per_page": 100,
			"q": client
		}
	})

	const orders = response.data

	return orders 
}

export const fetchProductsChatFunnel = async (params) => {
	const { store } = params

	let code
	let storeId

	if (store === "outlet") {
		code = config.accessTokenOutlet
		storeId = config.storeIdOutlet
	} else if (store === "artepropria") {
		code = config.accessTokenArtePropria
		storeId = config.storeIdArtePropria
	}

	let url = `${config.nuvemshopApiBaseUrl}/${storeId}/products`
	logChatFunnel(`Recuperando produtos do ${store}...`)
   
	let products = []

	while (url) {
		const response = await axios({
			method: "get",
			url: url,
			headers: {
				"Authentication": `bearer ${code}`,
				"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
				"Content-Type": "application/json"
			},
			params: {
				"per_page": 156,
				"fields": "name",
				"published": true
			}
		})

		products.push(...response.data)

		// Prepara para a próxima página, se houver
		const linkHeader = response.headers.link
		const nextLinkMatch = /<([^>]+)>;\s*rel="next"/.exec(linkHeader)

		if (nextLinkMatch) {
			url = nextLinkMatch[1]
		} else {
			url = null // Não há mais páginas
		}
	}

	return products
}

export const fetchCategoriesChatFunnel = async (params) => {
	const { store } = params
  
	let code
	let storeId
  
	if (store === "outlet") {
		code = config.accessTokenOutlet
		storeId = config.storeIdOutlet
	} else if (store === "artepropria") {
		code = config.accessTokenArtePropria
		storeId = config.storeIdArtePropria
	}
  
	let url = `${config.nuvemshopApiBaseUrl}/${storeId}/categories`
	logChatFunnel(`Recuperando categorias do ${store}...`)
     
	let categories = []
  
	while (url) {
		const response = await axios({
			method: "get",
			url: url,
			headers: {
				"Authentication": `bearer ${code}`,
				"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
				"Content-Type": "application/json"
			},
			params: {
				"per_page": 100,
				"fields": "name",
				"published": true
			}
		})
  
		categories.push(response.data)
  
		// Prepara para a próxima página, se houver
		const linkHeader = response.headers.link
		const nextLinkMatch = /<([^>]+)>;\s*rel="next"/.exec(linkHeader)
  
		if (nextLinkMatch) {
			url = nextLinkMatch[1]
		} else {
			url = null // Não há mais páginas
		}
	}
  
	return categories
}