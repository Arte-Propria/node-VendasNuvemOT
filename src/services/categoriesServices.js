import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

export const fetchCategories = async (params = {}) => {
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

	let url = `https://api.tiendanube.com/v1/${storeId}/categories`
	console.log("Recuperando dados das categorias...")

  const response = await axios({
    method: "get",
    url: url,
    headers: {
      "Authentication": `bearer ${code}`,
      "User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
      "Content-Type": "application/json"
    },
    params: {
      "per_page": 156
    }
  })

  const data = response.data

  const categories = data.map((category) => {

    return {
      id: category.id,
      name: category.name.pt,
      data: category
    }
  })

	return categories
}