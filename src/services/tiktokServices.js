/* eslint-disable camelcase */
import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

const appId = process.env.TIKTOK_CLIENT_APP_ID
const appSecret = process.env.TIKTOK_CLIENT_SECRET
const redirectUri = process.env.TIKTOK_REDIRECT_URI
const authCode = process.env.TIKTOK_AUTH_CODE
const accessToken = process.env.TIKTOK_ACCESS_TOKEN
const advertiserId = process.env.TIKTOK_ADVERTISER_ID
const adAccountIdOutlet = process.env.TIKTOK_AD_ACCOUNT_ID_OUTLET


export const fetchTiktokAuth = async () => {
	try {
		const response = await axios.post("https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", {
			app_id: appId,
			secret: appSecret,
			auth_code: authCode,
			grant_type: "authorization_code"
		})

		console.log(response.data)
		if (response.data.access_token) {
			return redirectUri + "?success=true&token=" + response.data.access_token
		}

	} catch (error) {
		console.error("Error getting TikTok access token:", error)
		return redirectUri + "?success=false&error=" + error.message
	}
}

export const fetchTiktokAds = async () => {
	try {
		const response = await axios.get("", {
			headers: {
				"Access-Token": accessToken
			}
		})

		return response.data
	} catch (error) {
		console.error("Erro ao buscar dados do ADS:", error)
		return error.message
	}
}
