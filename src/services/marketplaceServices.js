import { GETOrdersTinyABSTRACT, GETOrdersTinyBASEL, GETOrdersTinyINTEGRADA } from "../api/get.js"
import { config } from "../config/env.js"
import { query } from "../db/db.js"
import { saveOrder, updateOrder } from "../db/saveOrder.js"
import { generateDateRanges } from "../tools/tools.js"
import { logDB } from "../utils/logger.js"
import { getOrderDetails } from "../utils/tiny.js"

const marketplaceNames = {
	"shopee": "Shopee",
	"shopee_abstract": "Shopee Abstract",
	"magalu_marketplace": "Magalu Marketplace", 
	"magazine_luiza": "Magazine Luiza",
	"mercado_livre_abstract": "Mercado Livre Abstract",
	"mercado_livre_integrada": "Mercado Livre Integrada",
	"mercado_livre_fulfillment": "Mercado Livre Fulfillment",
	"amazon_fba_classic": "Amazon FBA Classic",
	"amazon_fba_onsite": "Amazon FBA Onsite",
	"amazon": "Amazon",
	"madeiramadeira": "MadeiraMadeira",
	"shein": "Shein",
	"tiktok_shop_abstract": "TikTok Shop Abstract"
}

const marketplaceNamesList = [
	"Shopee",
	"Shopee Abstract",
	"Magalu Abstract",
	"Magalu Marketplace",
	"Magazine Luiza",
	"Mercado Livre Abstract",
	"Mercado Livre",
	"Mercado Livre Integrada",
	"Mercado Livre Fulfillment",
	"Mercado Livre Fulfillment Abst",
	"Amazon FBA Classic",
	"Amazon FBA Onsite",
	"Amazon",
	"MadeiraMadeira",
	"Shein",
	"TikTok Shop Abstract"
]

export const fetchOrdersByMarketplace = async (marketplace, createdAtMin, createdAtMax) => {
	try {
		// Converte as datas para o formato DD/MM/YYYY
		const startDate = createdAtMin.split("T")[0].split("-").reverse().join("/")
		const endDate = createdAtMax.split("T")[0].split("-").reverse().join("/")
		
		if (!marketplaceNames[marketplace]) {
			throw new Error("Marketplace não encontrado")
		}

		const result = await query(`
			SELECT
				id,
				total_pedido,
				produtos
			FROM pedidos_marketplace 
			WHERE TO_DATE(data_pedido, 'DD/MM/YYYY') BETWEEN TO_DATE($1, 'DD/MM/YYYY') AND TO_DATE($2, 'DD/MM/YYYY')
			AND ecommerce->>'nomeEcommerce' = $3
			AND (
				(situacao = 'Cancelado' AND CAST(id_nota_fiscal AS INTEGER) > 0)
				OR situacao NOT IN ('Cancelado', 'Reprovado', 'Não Entregue', 'Dados incompletos')
			)
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
			SELECT
				id,
				total_pedido,
				produtos
			FROM pedidos_marketplace 
			WHERE TO_DATE(data_pedido, 'DD/MM/YYYY') BETWEEN TO_DATE($1, 'DD/MM/YYYY') AND TO_DATE($2, 'DD/MM/YYYY') 
			AND (
				(
					(situacao = 'Cancelado' AND CAST(id_nota_fiscal AS INTEGER) > 0)
					OR situacao NOT IN ('Cancelado', 'Reprovado', 'Não Entregue', 'Dados incompletos')
				)
				AND ecommerce IS NOT NULL
			)
		`, [startDate, endDate])

		return result.rows
	} catch (error) {
		console.error("Erro ao buscar pedidos de todos os marketplaces:", error)
		throw error
	}
}

export const fetchOrdersAllMarketplaceOptimized = async (createdAtMin, createdAtMax) => {
	try {
		// Converte para Date e depois para string no formato YYYY-MM-DD
		const startDate = new Date(createdAtMin).toISOString().split("T")[0]
		const endDate = new Date(createdAtMax).toISOString().split("T")[0]
		
		const result = await query(`
			SELECT 
				id,
				situacao,
				numero,
				data_pedido,
				numero_ordem_compra,
				forma_envio,
				valor_frete,
				valor_desconto,
				total_pedido,
				cliente,
				id_nota_fiscal,
				total_produtos,
				marcadores,
				id_vendedor,
				codigo_rastreamento,
				url_rastreamento,
				ecommerce,
				id_natureza_operacao,
				deposito,
				itens
			FROM pedidos_marketplace 
			WHERE data_pedido BETWEEN $1::date AND $2::date
			AND (
				situacao NOT IN ('Cancelado', 'Reprovado', 'Não Entregue', 'Dados incompletos')
				OR (situacao = 'Cancelado' AND CAST(id_nota_fiscal AS INTEGER) > 0) AND ecommerce IS NOT NULL
			)
		`, [startDate, endDate])

		return result.rows
	} catch (error) {
		console.error("Erro ao buscar pedidos otimizados de todos os marketplaces:", error)
		throw error
	}
}

export const fetchUpdateOrdersMarketplace = async (days) => {
	try {
		const dateRanges = generateDateRanges(days)
		const endpoint = "pedidos.pesquisa.php"		
		let ordersUpdated = []
		
		// Processa cada intervalo de datas
		for (const dateRange of dateRanges) {
			logDB(`Processando intervalo: ${dateRange.dataInicial} até ${dateRange.dataFinal}`)
			const data = {
				...dateRange
			}
			const ordersIntegrada = await GETOrdersTinyINTEGRADA(endpoint, data)
			const ordersBasel = await GETOrdersTinyBASEL(endpoint, data)
			const ordersAbstract = await GETOrdersTinyABSTRACT(endpoint, data)
			const orders = [...ordersIntegrada, ...ordersBasel, ...ordersAbstract]
			logDB(`Encontrados ${orders.length} pedidos para atualização.`)

			// Processa os pedidos de forma síncrona para evitar sobrecarga
			for (const order of orders) {
				const id = parseInt(order.pedido.id)
				const orderDB = await query(`
					SELECT id, situacao FROM pedidos_marketplace WHERE id = $1
				`, [id])
	
				const orderExists = orderDB.rows.length > 0
				
				if(!orderExists) {
					const isMarketplace = order.pedido.numero_ecommerce
					if(isMarketplace) {
						await new Promise((resolve) => setTimeout(resolve, 1000)) // Atraso de 1 segundo para evitar sobrecarga na API
						const orderDetails = await getOrderDetails(id, config.tinyApiToken)
						const isMarketplaceList = marketplaceNamesList.includes(orderDetails.ecommerce.nomeEcommerce)
						if(isMarketplaceList) {
							await saveOrder(orderDetails)
							ordersUpdated.push(order)
						}
					}
				} else {
					if(orderDB.rows[0].situacao !== order.pedido.situacao) {
						await updateOrder(order.pedido.situacao, id)
					} else {
						logDB(`Pedido ${order.pedido.id} já está atualizado.`)
					}
				}
			}
			
			logDB(`Processado intervalo: ${dateRange.dataInicial} até ${dateRange.dataFinal}`)
		}

		return ordersUpdated

	} catch (error) {
		console.error("Erro ao buscar pedidos para atualização:", error)
		throw error
	}
}

export const fetchUpdateOrdersMarketplaceByDate = async (createdAtMin, createdAtMax) => {
	try {
		const data = {
			dataInicial: createdAtMin,
			dataFinal: createdAtMax
		}
		const endpoint = "pedidos.pesquisa.php"
		let ordersUpdated = []
		
		logDB(`Processando intervalo: ${createdAtMin} até ${createdAtMax}`)

		const ordersIntegrada = await GETOrdersTinyINTEGRADA(endpoint, data)
		const ordersBasel = await GETOrdersTinyBASEL(endpoint, data)
		const ordersAbstract = await GETOrdersTinyABSTRACT(endpoint, data)
		const orders = [...ordersIntegrada, ...ordersBasel, ...ordersAbstract]
		logDB(`Encontrados ${orders.length} pedidos para atualização.`)

		// Processa os pedidos de forma síncrona para evitar sobrecarga
		for (const order of orders) {
			const id = parseInt(order.pedido.id)
			const orderDB = await query(`
					SELECT id, situacao FROM pedidos_marketplace WHERE id = $1
				`, [id])
	
			const orderExists = orderDB.rows.length > 0
				
			if(!orderExists) {
				const isMarketplace = order.pedido.numero_ecommerce
				if(isMarketplace) {
					const orderDetails = await getOrderDetails(id, config.tinyApiToken)
					const isMarketplaceList = marketplaceNamesList.includes(orderDetails.ecommerce.nomeEcommerce)
					if(isMarketplaceList) {
						await saveOrder(orderDetails)
						ordersUpdated.push(order)
					}
				}
			} else {
				if(orderDB.rows[0].situacao !== order.pedido.situacao) {
					await updateOrder(order.pedido.situacao, id)
				} else {
					logDB(`Pedido ${order.pedido.id} já está atualizado.`)
				}
			}
		}
			
		logDB(`Processado intervalo: ${createdAtMin} até ${createdAtMax}`)
		return ordersUpdated

	} catch (error) {
		console.error("Erro ao buscar pedidos para atualização:", error)
		throw error
	}
}