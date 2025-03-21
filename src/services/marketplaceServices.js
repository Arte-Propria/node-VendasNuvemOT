import { query } from "../db/db.js"

const marketplaceNames = {
	"shopee": "Shopee",
	"magalu_marketplace": "Magalu Marketplace", 
	"magazine_luiza": "Magazine Luiza",
	"mercado_livre_abstract": "Mercado Livre Abstract",
	"mercado_livre_integrada": "Mercado Livre Integrada",
	"mercado_livre_fulfillment": "Mercado Livre Fulfillment",
	"amazon_fba_classic": "Amazon FBA Classic",
	"amazon_fba_onsite": "Amazon FBA Onsite",
	"amazon": "Amazon",
	"madeiramadeira": "MadeiraMadeira",
	"shein": "Shein"
}

export const fetchOrdersByMarketplace = async (marketplace, createdAtMin, createdAtMax) => {
	try {
		// Converte as datas para o formato DD/MM/YYYY
		const startDate = createdAtMin.split("T")[0].split("-").reverse().join("/")
		const endDate = createdAtMax.split("T")[0].split("-").reverse().join("/")
		
		if (!marketplaceNames[marketplace]) {
			throw new Error("Marketplace não encontrado")
		}

		const result = await query(`
			SELECT * FROM pedidos_marketplace 
			WHERE data_pedido BETWEEN $1 AND $2
			AND ecommerce->>'nomeEcommerce' = $3
			AND situacao NOT IN ('Cancelado', 'Reprovado', 'Não Entregue', 'Dados incompletos')
		`, [startDate, endDate, marketplaceNames[marketplace]])

		return result.rows
	} catch (error) {
		console.error(`Erro ao buscar pedidos do marketplace ${marketplace}:`, error)
		throw error
	}
}

export const fetchOrdersAllMarketplace = async (createdAtMin, createdAtMax) => {
	try {
		// Converte as datas para o formato DD/MM/YYYY
		const startDate = createdAtMin.split("T")[0].split("-").reverse().join("/")
		const endDate = createdAtMax.split("T")[0].split("-").reverse().join("/")
		
		const result = await query(`
			SELECT * FROM pedidos_marketplace 
			WHERE data_pedido BETWEEN $1 AND $2 AND situacao NOT IN ('Cancelado', 'Reprovado', 'Não Entregue', 'Dados incompletos')
		`, [startDate, endDate])

		return result.rows
	} catch (error) {
		console.error("Erro ao buscar pedidos de todos os marketplaces:", error)
		throw error
	}
}



