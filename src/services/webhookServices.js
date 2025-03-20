import { saveOrder, updateOrderStatus } from "../db/saveOrder.js"
import { log } from "../utils/logger.js"
import { getOrderDetails, getProductDetails } from "../utils/tiny.js"

const marketplaceNames = [
	// "Nuvemshop",
	"Shopee",
	"Magalu Marketplace",
	"Magazine Luiza",
	"Mercado Livre",
	"Amazon",
	"MadeiraMadeira",
	"Shein"
]

export const processMarketplaceWebhook = async (body) => {
	const { tipo, dados } = body

	if (tipo === "inclusao_pedido") {
		const { nomeEcommerce, codigoSituacao } = dados

		// Verificar se o pedido é de um marketplace configurado
		if (!marketplaceNames.includes(nomeEcommerce)) {
			console.log(
				"Pedido não pertence aos marketplaces configurados", "id:", dados.id, "nomeEcommerce:", nomeEcommerce
			)
			return {
				status: "ignored",
				message: "Pedido não pertence aos marketplaces configurados"
			}
		}

		// Verificar o status do pedido
		if (codigoSituacao === "cancelado") {
			console.log(
				"Pedido cancelado", "id:", dados.id, "nomeEcommerce:", nomeEcommerce
			)
			return { status: "ignored", message: "Pedido cancelado" }
		}

		if (codigoSituacao !== "aprovado") {
			console.log(
				"Pedido não aprovado", "id:", dados.id, "nomeEcommerce:", nomeEcommerce
			)
			return { status: "ignored", message: "Pedido não aprovado" }
		}

		try {
			// Obter detalhes do pedido
			const orderDetails = await getOrderDetails(dados.id)

			// Recuperar informações dos produtos no pedido
			const enrichedItems = await Promise.all(orderDetails.itens.map(async ({item}) => {
				try {
					const productDetails = await getProductDetails(item.id_produto)
					return { ...item, ...productDetails }
				} catch (error) {
					console.log(`Erro ao obter detalhes do produto ${item.id_produto}:`, error)
					return { ...item, productDetails: null }
				}
			}))

			// Incorporar os detalhes dos produtos no pedido
			const enrichedOrder = { ...orderDetails, produtos: enrichedItems }

			// Salvar pedido no banco de dados
			// await saveOrder(enrichedOrder)
			console.log(enrichedOrder)

			return {
				status: "success",
				message: "Pedido processado e salvo com sucesso"
			}
		} catch (error) {
			console.log("Erro ao processar o pedido:", error)
			return { status: "error", message: "Erro ao processar o pedido" }
		}
	}

	if(tipo === "atualizacao_pedido") {
		const { nomeEcommerce } = dados

		// Verificar se o pedido é de um marketplace configurado
		if (!marketplaceNames.includes(nomeEcommerce)) {
			return {
				status: "ignored",
				message: "Pedido não pertence aos marketplaces configurados"
			}
		}

		try {
			// Obter detalhes do pedido
			const orderDetails = await getOrderDetails(dados.id)

			// Atualizar status do pedido
			// await updateOrderStatus(orderDetails)
			console.log(orderDetails)

			return { status: "success", message: "Pedido atualizado com sucesso" }

		} catch (error) {
			console.log(`Erro ao obter detalhes do pedido ${dados.id}:`, error)
			return { status: "error", message: "Erro ao obter detalhes do pedido" }
		}
	}
}
