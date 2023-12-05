import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

export const fetchOrders = async () => {
	const code = process.env.ACCESS_TOKEN
	const storeId = process.env.STORE_ID
	const url = `https://api.tiendanube.com/v1/${storeId}/orders`
	console.log("Recuperando dados dos pedidos...")

	const response = await axios({
		method: "get",
		url: url,
		headers: {
			"Authentication": `bearer ${code}`,
			"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
			"Content-Type": "application/json"
		}
	})

	const data = response.data

	return data

}
