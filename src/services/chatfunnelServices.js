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