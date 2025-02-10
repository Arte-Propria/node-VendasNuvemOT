import { google } from "googleapis"
import dotenv from "dotenv"

dotenv.config()

// Função para buscar dados do Analytics
export const fetchAnalytics = async ({ store, createdAtMin, createdAtMax }) => {
	const currentDate = new Date()
	const defaultStartDate = currentDate.toISOString().split("T")[0]
	const defaultEndDate = currentDate.toISOString().split("T")[0]

	createdAtMin = createdAtMin
		? new Date(createdAtMin).toISOString().split("T")[0]
		: defaultStartDate
	createdAtMax = createdAtMax
		? new Date(createdAtMax).toISOString().split("T")[0]
		: defaultEndDate

	let propertyID
	let clientEmail
	let privateKey

	if (store === "outlet") {
		propertyID = process.env.GOOGLE_PROPERTY_ID_OUTLET
		clientEmail = process.env.GOOGLE_CLIENT_EMAIL
		privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
	} else if (store === "artepropria") {
		propertyID = process.env.GOOGLE_PROPERTY_ID_AP
		clientEmail = process.env.GOOGLE_CLIENT_EMAIL
		privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
	} else {
		throw new Error("Store not recognized")
	}

	try {
		const auth = new google.auth.GoogleAuth({
			credentials: {
				client_email: clientEmail,
				private_key: privateKey
			},
			scopes: ["https://www.googleapis.com/auth/analytics.readonly"]
		})

		const analytics = google.analyticsdata("v1beta")
		const client = await auth.getClient()
		analytics.context._options.auth = client

		console.log("Recuperando dados do analytics...")

		// Definindo as consultas em paralelo
		const queries = [
			analytics.properties.runReport({
				property: `properties/${propertyID}`,
				requestBody: {
					dateRanges: [{ startDate: createdAtMin, endDate: createdAtMax }],
					dimensions: [{ name: "deviceCategory" }],
					metrics: [{ name: "sessions" }]
				}
			}),
			analytics.properties.runReport({
				property: `properties/${propertyID}`,
				requestBody: {
					dateRanges: [{ startDate: createdAtMin, endDate: createdAtMax }],
					dimensions: [{ name: "sessionCampaignName" }],
					metrics: [{ name: "advertiserAdCost" }]
				}
			}),
			analytics.properties.runReport({
				property: `properties/${propertyID}`,
				requestBody: {
					dateRanges: [{ startDate: createdAtMin, endDate: createdAtMax }],
					dimensions: [{ name: "eventName" }],
					metrics: [{ name: "activeUsers" }]
				}
			}),
			analytics.properties.runReport({
				property: `properties/${propertyID}`,
				requestBody: {
					dateRanges: [{ startDate: createdAtMin, endDate: createdAtMax }],
					dimensions: [{ name: "eventName" }],
					metrics: [{ name: "checkouts" }]
				}
			}),
			analytics.properties.runReport({
				property: `properties/${propertyID}`,
				requestBody: {
					dateRanges: [{ startDate: createdAtMin, endDate: createdAtMax }],
					dimensions: [{ name: "eventName" }],
					metrics: [{ name: "eventCount" }],
					dimensionFilter: {
						filter: {
							fieldName: "eventName",
							stringFilter: { matchType: "EXACT", value: "gtm.formSubmit" }
						}
					}
				}
			})
		]

		// Executa as consultas em paralelo
		const [
			deviceResponse,
			costResponse,
			cartResponse,
			beginCheckoutResponse,
			formSubmitResponse
		] = await Promise.all(queries)

		// Processa os dados simultaneamente
		let totalVisits = 0
		let usersByDevice = {}
		let all = 0
		let ecom = 0
		let quadros = 0
		let espelhos = 0
		let loja = 0
		let geral = 0
		let carts = 0
		let beginCheckout = 0
		let formSubmits = 0

		if (deviceResponse.data.rows) {
			deviceResponse.data.rows.forEach((row) => {
				const deviceType = row.dimensionValues[0].value
				const users = parseInt(row.metricValues[0].value, 10)
				totalVisits += users
				usersByDevice[deviceType] = users
			})
		}

		if (costResponse.data.rows) {
			costResponse.data.rows.forEach((row) => {
				const campaignName = row.dimensionValues[0].value.toLowerCase()
				const spent = parseFloat(row.metricValues[0].value)

				all += spent

				if (campaignName.includes("ecom")) {
					ecom += spent
				} else if (campaignName.includes("quadro")) {
					quadros += spent
				} else if (campaignName.includes("espelho")) {
					espelhos += spent
				} else if (campaignName.includes("visits")) {
					loja += spent
				} else if (campaignName.includes("geral")) {
					geral += spent
				}
			})
		}

		if (beginCheckoutResponse.data.rows) {
			beginCheckoutResponse.data.rows.forEach((row) => {
				const checkouts = parseFloat(row.metricValues[0].value)
				beginCheckout += checkouts
			})
		}

		if (cartResponse.data.rows) {
			const addToCartEvent = cartResponse.data.rows.find((row) => row.dimensionValues[0].value === "add_to_cart")
			carts = addToCartEvent
				? parseInt(addToCartEvent.metricValues[0].value, 10)
				: 0
		}

		if (formSubmitResponse.data.rows) {
			formSubmits = parseInt(formSubmitResponse.data.rows[0].metricValues[0].value,
				10)
		}

		all = parseFloat(all.toFixed(2))
		ecom = parseFloat(ecom.toFixed(2))
		quadros = parseFloat(quadros.toFixed(2))
		espelhos = parseFloat(espelhos.toFixed(2))
		loja = parseFloat(loja.toFixed(2))
		geral = parseFloat(geral.toFixed(2))

		return {
			totalVisits,
			usersByDevice,
			totalCost: {
				all,
				ecom,
				quadros,
				espelhos,
				loja,
				geral
			},
			carts,
			beginCheckout,
			formSubmits
		}
	} catch (error) {
		console.error("Error fetching analytics data:", error)
		throw error
	}
}
