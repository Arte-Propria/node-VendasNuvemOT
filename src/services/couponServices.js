import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

export const fetchCoupons = async () => {
  const { store } = params
	let code
	let storeId

	if(store === "outlet"){
		code = process.env.ACCESS_TOKEN_OUTLET
		storeId = process.env.STORE_ID_OUTLET
	}
	if(store === "artepropria"){
		code = process.env.ACCESS_TOKEN_ARTEPROPRIA
		storeId = process.env.STORE_ID_ARTEPROPRIA
	}

	let url = `https://api.tiendanube.com/v1/${storeId}/coupons`
	console.log("Recuperando dados dos cupons...")

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

  const coupons = data.map((element) => {

    return {
      id: element.id,
      code: element.code,
      type: element.type,
      value: element.value,
      used: element.used,
    }
  })

	return coupons
}