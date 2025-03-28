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

// 1. Função para realizar o fetch básico (≤30 dias)
const makeTikTokRequest = async (store, startDate, endDate) => {
	const accessToken = process.env[`TIKTOK_ACCESS_TOKEN_${store === "outlet" ? "OT" : "AP"}`]
	try {
		const response = await axios.get("https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/",
			{
				headers: {
					"Access-Token": accessToken,
					"Content-Type": "application/json"
				},
        
				params: {
					advertiser_id: advertiserId,
					service_type: "AUCTION",
					report_type: "BASIC",
					data_level: "AUCTION_AD",
					dimensions: JSON.stringify(["stat_time_day"]),
					metrics: JSON.stringify(["spend"]),
					start_date: startDate,
					end_date: endDate,
					page_size: 100 // Max page size to minimize requests
				}
			})
		return response.data.data?.list || []
	} catch (error) {
		console.error(`Error fetching TikTok data from ${startDate} to ${endDate}:`,error.message)
		return []
	}
}

// 2. Function to split date range into 30-day chunks
const splitDateRange = (startDate, endDate) => {
  
	const dateRanges = []
	let currentStart = new Date(startDate)
	const finalEnd = new Date(endDate)

	while (currentStart <= finalEnd) {
		// Calculate end date (currentStart + 29 days)
		const periodEnd = new Date(currentStart)
		periodEnd.setDate(currentStart.getDate() + 29) // 30 days total (inclusive)

		// Determine the actual end date (min of periodEnd or finalEnd)
		const actualEnd = periodEnd > finalEnd ? new Date(finalEnd) : new Date(periodEnd)

		dateRanges.push({
			start: currentStart.toISOString().split("T")[0],
			end: actualEnd.toISOString().split("T")[0]
		})

		// Move to next period (actualEnd + 1 day)
		currentStart = new Date(actualEnd)
		currentStart.setDate(actualEnd.getDate() + 1)
	}

	return dateRanges
}

// 3. Main function to fetch TikTok ads data
export const fetchTiktokAds = async (store, createdAtMin, createdAtMax) => {
  
	try {
		// Split date range into 30-day chunks if needed
		const dateRanges = splitDateRange(createdAtMin, createdAtMax)
		const Store_choose = store
		let allResults = []

		// Process each date range sequentially
		for (const range of dateRanges) {
			const chunkData = await makeTikTokRequest(Store_choose, range.start, range.end)

			// Transform and add to results
			const formattedData = chunkData.map((item) => ({
				date: item.dimensions?.stat_time_day || "N/A",
				metrics: parseFloat(item.metrics?.spend) || 0
			}))

			allResults = [...allResults, ...formattedData]
		}

		// Calculate total spend
		const totalSpend = allResults.reduce((sum, item) => sum + item.metrics, 0)

		// Sort by date
		allResults.sort((a, b) => new Date(a.date) - new Date(b.date))

		return [
			{
				totalCost: {
					//dailyData: allResults,
					all: parseFloat(totalSpend.toFixed(2))
				}
			}
		]
	} catch (error) {
		console.error("Error in fetchTiktokAds:", error.message)
		return [
			{
				totalCost: {
					dailyData: [],
					all: 0
				}
			}
		]
	}
}