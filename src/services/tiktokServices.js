/* eslint-disable camelcase */
import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

const appId = process.env.TIKTOK_CLIENT_APP_ID
const appSecret = process.env.TIKTOK_CLIENT_SECRET
const redirectUri = process.env.TIKTOK_REDIRECT_URI
const authCode = process.env.TIKTOK_AUTH_CODE
const advertiserId = process.env.TIKTOK_ADVERTISER_ID
const adAccountIdOutlet = process.env.TIKTOK_AD_ACCOUNT_ID_OUTLET
const accessToken = process.env.TIKTOK_ACCESS_TOKEN


export const fetchTiktokAuth = async () => {
	try {
		const response = await axios.post("https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", {
			app_id: appId,
			secret: appSecret,
			auth_code: authCode,
			grant_type: "authorization_code"
		})

		if (response.data.access_token) {
			return redirectUri + "?success=true&token=" + response.data.access_token
		}

	} catch (error) {
		console.error("Error getting TikTok access token:", error)
		return redirectUri + "?success=false&error=" + error.message
	}
}

export const fetchTiktokAds = async (store, createdAtMin, createdAtMax) => {
	try {
		const response = await axios.get("https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/", {
			headers: {
				"Access-Token": accessToken, // Token de acesso
				"Content-Type": "application/json"
        
			},
			params: {
				advertiser_id: advertiserId, // ID do anunciante (obrigatório)
				service_type:"AUCTION",
				report_type: "BASIC",
				data_level: "AUCTION_AD",
				dimensions: JSON.stringify(["stat_time_day"]),
				metrics: ["spend"],
				start_date: createdAtMin,
				end_date: createdAtMax
			}
		})

		// Converte strings para números e calcula o total
		const result = response.data.data.list.map((ads) => ({
			metrics: parseFloat(ads.metrics.spend)  // Converte string para número
		}))

		// Soma todos os valores de metrics
		const totalBudget = result.reduce((sum, item) => sum + item.metrics,	0)

		const totalResult = [{
			totalCost: {
				//dailyData: result,
				all: parseFloat(totalBudget.toFixed(2))
			}
		}]
		
		// Retorna tanto os dados individuais quanto o total formatado
		// nesse caso, apenas o valor total
		return totalResult

	} catch (error) {
		console.error("Erro ao buscar dados do ADS:", error.response ? error.response.data : error.message)
		return error.message
	}
}
