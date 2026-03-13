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

	const campaignsUrl = `https://graph.facebook.com/v24.0/act_${accountID}/campaigns`

	const campaignParams = {
		fields: "id,name",
		access_token: accessToken,
		limit: 150
	}

	try {
		// Função para buscar todas as campanhas com paginação
		let allCampaigns = []
		let nextPageUrl = campaignsUrl
		let pageParams = { ...campaignParams }
		let hasNextPage = true
		let pageCount = 0
		const maxPages = 100 // Limite de segurança para evitar loops infinitos

		while (hasNextPage && pageCount < maxPages) {
			const campaignsResponse = await axios.get(nextPageUrl, { params: pageParams })
			const responseData = campaignsResponse.data

			if (responseData.data && responseData.data.length > 0) {
				allCampaigns = allCampaigns.concat(responseData.data)
			}

			// Verifica se há próxima página
			if (responseData.paging && responseData.paging.cursors && responseData.paging.cursors.after) {
				pageParams.after = responseData.paging.cursors.after
				pageCount++
			} else {
				hasNextPage = false
			}
		}

		let campaigns = allCampaigns

		// Busca insights para cada campanha
		const insightsPromises = campaigns.map(async (campaign) => {
			try {
				const insightsUrl = `https://graph.facebook.com/v20.0/${campaign.id}/insights`
				const params = {
					time_range: `{"since":"${createdAtMin}","until":"${createdAtMax}"}`,
					access_token: accessToken,
					fields: "spend,account_id,impressions"
				}

				const insightsResponse = await axios.get(insightsUrl, { params })
				const insights = insightsResponse.data.data || []
				return { campaignName: campaign.name, insights }
			} catch (error) {
				// Se falhar ao buscar insights de uma campanha, retorna array vazio
				console.warn(`Erro ao buscar insights da campanha ${campaign.name}:`, error.message)
				return { campaignName: campaign.name, insights: [] }
			}
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
			if (!insights || !Array.isArray(insights)) return

			insights.forEach((insight) => {
				if (!insight) return

				const spend = parseFloat(insight.spend) || 0
				const impressions = parseInt(insight.impressions, 10) || 0

				totalSpend += spend
				totalImpressions += impressions

				if (insight.account_id) {
					account_id = insight.account_id
				}

				const campaignNameLower = campaignName.toLowerCase()

				if (campaignNameLower.includes("ecom")) {
					totalSpendEcom += spend
				} else if (campaignNameLower.includes("quadro")) {
					totalSpendQuadros += spend
				} else if (campaignNameLower.includes("espelho")) {
					totalSpendEspelhos += spend
				} else if (campaignName.includes("WSP")) {
					totalSpendChatbot += spend
				} else if (campaignNameLower.includes("instagram")) {
					totalSpendInsta += spend
				}
			})
		})

		totalSpendGeral = totalSpend - totalSpendEcom - totalSpendQuadros - totalSpendEspelhos - totalSpendChatbot - totalSpendInsta

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
		// console.error("Error fetching data ADS:", error.response.data)
		throw error.response
	}
}
