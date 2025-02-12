/* eslint-disable camelcase */
import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

// Função para buscar dados do ADS
export const fetchDataADSMeta = async ({ store, createdAtMin, createdAtMax }) => {
	let accountID
	let accessToken = process.env.META_ACCESS_TOKEN
  
	if (store === "outlet") {
		accountID = process.env.META_ID_ACCOUNT_OUTLET
	}
	if (store === "artepropria") {
		accountID = process.env.META_ID_ACCOUNT_ARTEPROPRIA
	}

	const campaignsUrl = `https://graph.facebook.com/v22.0/act_${accountID}/campaigns`

	const campaignParams = {
		fields: "id,name",
		access_token: accessToken,
		limit: 200
	}

	try {
		const campaignsResponse = await axios.get(campaignsUrl, { params: campaignParams })
		let campaigns = campaignsResponse.data.data

		// Busca insights para cada campanha
		const insightsPromises = campaigns.map(async (campaign) => {
			const insightsUrl = `https://graph.facebook.com/v20.0/${campaign.id}/insights`
			const params = {
				time_range: `{"since":"${createdAtMin}","until":"${createdAtMax}"}`,
				access_token: accessToken,
				fields: "spend,account_id,impressions"
			}

			const insightsResponse = await axios.get(insightsUrl, { params })
			return { campaignName: campaign.name, insights: insightsResponse.data.data }
		})

		const insightsArray = await Promise.all(insightsPromises)
    
		// Variáveis para armazenar os gastos
		let totalSpend = 0
		let totalSpendEcom = 0
		let totalSpendQuadros = 0
		let totalSpendEspelhos = 0
		let totalSpendChatbot = 0
		let totalSpendInsta = 0
		let totalSpendGeral = 0
		let totalImpressions = 0
		let account_id = accountID

		insightsArray.forEach(({ campaignName, insights }) => {
			insights.forEach((insight) => {
				const spend = parseFloat(insight.spend)
				totalSpend += spend

				if (campaignName.toLowerCase().includes("ecom")) {
					totalSpendEcom += spend
				} else if (campaignName.toLowerCase().includes("quadro")) {
					totalSpendQuadros += spend
				} else if (campaignName.toLowerCase().includes("espelho")) {
					totalSpendEspelhos += spend
				} else if (campaignName.includes("WSP")) {
					totalSpendChatbot += spend
				} else if (campaignName.toLowerCase().includes("instagram")){
					totalSpendInsta += spend
				} else if (campaignName.toLowerCase().includes("geral")){
					totalSpendGeral += spend
				}

				totalImpressions += parseInt(insight.impressions, 10)
				account_id = insight.account_id
			})
		})

		// Retorna os valores formatados com `toFixed(2)`
		const result = [{
			account_id,
			totalCost: {
				all: parseFloat(totalSpend.toFixed(2)),
				ecom: parseFloat(totalSpendEcom.toFixed(2)),
				quadros: parseFloat(totalSpendQuadros.toFixed(2)),
				espelhos: parseFloat(totalSpendEspelhos.toFixed(2)),
				chatbot: parseFloat(totalSpendChatbot.toFixed(2)),
				instagram: parseFloat(totalSpendInsta.toFixed(2)),
				geral: parseFloat(totalSpendGeral.toFixed(2))
			},
			impressions: totalImpressions
		}]

		return result
    
	} catch (error) {
		console.error("Error fetching data ADS:", error)
		throw error
	}
}
