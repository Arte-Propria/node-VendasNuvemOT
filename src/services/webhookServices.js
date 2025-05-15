/* eslint-disable camelcase */
import { GETNuvemOrder } from "../api/get.js"
import { GETtiny, POSTtiny, PUTtiny } from "../api/tiny.js"
import { saveOrder, updateOrderStatus } from "../db/saveOrder.js"
import { logEcommerce, logWebhookMarketplace } from "../utils/logger.js"
import { getOrderDetails, getProductDetails, getOrderDetailsES } from "../utils/tiny.js"

const marketplaceNames = [
	"Shopee",
	"Magalu Marketplace",
	"Magazine Luiza",
	"Mercado Livre Abstract",
	"Mercado Livre",
	"Mercado Livre Integrada",
	"Mercado Livre Fulfillment",
	"Amazon FBA Classic",
	"Amazon FBA Onsite",
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
			logWebhookMarketplace(`Pedido não pertence aos marketplaces configurados, id: ${dados.id}, nomeEcommerce: ${nomeEcommerce}`)
			return {
				status: "ignored",
				message: "Pedido não pertence aos marketplaces configurados"
			}
		}

		// Verificar o status do pedido
		if (codigoSituacao === "cancelado") {
			logWebhookMarketplace(`Pedido cancelado, id: ${dados.id}, nomeEcommerce: ${nomeEcommerce}`)
			return { status: "ignored", message: "Pedido cancelado" }
		}

		if (codigoSituacao !== "aprovado") {
			logWebhookMarketplace(`Pedido não aprovado, id: ${dados.id}, nomeEcommerce: ${nomeEcommerce}`)
			return { status: "ignored", message: "Pedido não aprovado" }
		}

		const result = await processSaveOrder(dados)
		return result
	}

	if(tipo === "atualizacao_pedido") {
		const { id, nomeEcommerce } = dados
		const { marcadores } = await getOrderDetails(id)
		const isIntegradaES = marcadores.some((marcador) => marcador.marcador.descricao.toLowerCase() === "integradaes")

		if(isIntegradaES) {
			const result = await updateOrderNuvemshop(dados)
			return result
		}

		// Verificar se o pedido é de um marketplace configurado
		if (!marketplaceNames.includes(nomeEcommerce)) {
			return {
				status: "ignored",
				message: "Pedido não pertence aos marketplaces configurados"
			}
		}

		try {
			const result = await processUpdateOrder(dados)
			return result

		} catch (error) {
			logWebhookMarketplace(`Erro ao obter detalhe do pedido ${dados.id}:`, error)
			return { status: "error", message: "Erro ao obter detalhes do pedido" }
		}
	}
}

async function processSaveOrder(dados) {
	try {
		// Obter detalhes do pedido
		const orderDetails = await getOrderDetails(dados.id)

		// Recuperar informações dos produtos no pedido
		const enrichedItems = await Promise.all(orderDetails.itens.map(async ({item}) => {
			try {
				const productDetails = await getProductDetails(item.id_produto)
				return { ...item, ...productDetails }
			} catch (error) {
				logWebhookMarketplace(`Erro ao obter detalhes do produto ${item.id_produto}:`, error)
				return { ...item, productDetails: null }
			}
		}))

		// Incorporar os detalhes dos produtos no pedido
		const enrichedOrder = { ...orderDetails, produtos: enrichedItems }

		// Salvar pedido no banco de dados
		await saveOrder(enrichedOrder)

		return {
			status: "success",
			message: "Pedido salvo com sucesso"
		}
	} catch (error) {
		logWebhookMarketplace(`Erro ao processar o pedido: ${error}, ${dados}`)
		return { status: "error", message: "Erro ao processar o pedido" }
	}
}	

async function processUpdateOrder(dados) {
	try {
		// Obter detalhes do pedido
		const orderDetails = await getOrderDetails(dados.id)

		// Atualizar status do pedido
		const { success } = await updateOrderStatus(orderDetails)

		if(!success) {
			const result = await processSaveOrder(dados)
			return result
		}

		return { status: "success", message: "Pedido atualizado com sucesso" }
	} catch (error) {
		logWebhookMarketplace(`Erro ao processar o pedido: ${error}, ${dados}`)
		return { status: "error", message: "Erro ao processar o pedido" }
	}
}

export const processEcommerceWebhook = async (body) => {
	const { tipo, dados } = body
	const { codigoSituacao: status } = dados

	if(tipo === "inclusao_pedido") {
		return {
			status: "ignored",
			message: "Novo pedido criado"
		}
	}

	if(tipo === "atualizacao_pedido" && status !== "faturado") {
		return {
			status: "ignored",
			message: "Pedido não faturado"
		}
	}

	if(tipo === "atualizacao_pedido" && status === "faturado") {
		const orderDetails = await getOrderDetailsES(dados.id)
		const pedidosExistentes = await GETtiny.ABSTRACT("pedidos.pesquisa.php", { 
			dataInicialOcorrencia: dados.data,
			cliente: dados.cliente.nome,
			cpf_cnpj: dados.cliente.cpfCnpj
		})

		const { number: numberOrderRetry } = await GETNuvemOrder(dados.idPedidoEcommerce)
		const isPedidoExistente = pedidosExistentes.some((pedido) => pedido.pedido.numero_ecommerce === numberOrderRetry.toString())

		if(isPedidoExistente) {
			return {
				status: "success", 
				message: `Pedido já existe na conta Abstract. Pedido com ID: ${dados.id}`
			}
		}

		const nota_fiscal = await GETtiny.ESnote("nota.fiscal.obter.php", {
			id: dados.idNotaFiscal
		})

		const result = await POSTtiny.ABSTRACT("pedido.incluir.php", {...orderDetails, nota_fiscal})
		const id = result.retorno.registros.registro.id
	
		return {
			status: "success",
			message: `Pedido salvo na conta Abstract. Pedido com ID: ${id}`
		}
	}
}

export const updateOrderNuvemshop = async (dados) => {
	const orderDetailsABSTRACT = await getOrderDetails(dados.id)
	logEcommerce("Atualizando pedido")
	console.log(dados)
	const { id } = await GETtiny.ES("pedidos.pesquisa.php", { 
		dataInicialOcorrencia: dados.data,
		idPedidoEcommerce: dados.idPedidoEcommerce,
		// cliente: dados.cliente.nome,
		cpf_cnpj: dados.cliente.cpfCnpj
	})
	if(!id) {
		logEcommerce(`Não foram encontrados pedidos com o CPF/CNPJ: ${dados.cliente.cpfCnpj}`)
		return { status: "error", message: `Não foram encontrados pedidos com o CPF/CNPJ: ${dados.cliente.cpfCnpj}` }
	}

	const data = {
		id,
		situacao: orderDetailsABSTRACT.situacao,
		codigoRastreamento: orderDetailsABSTRACT.codigo_rastreamento,
		urlRastreamento: encodeURI(orderDetailsABSTRACT.url_rastreamento)
	}

	await PUTtiny.ES(data)
	logEcommerce(`Pedido atualizado no Tiny Integrada ES. Pedido com ID: ${id}`)

	return {
		status: "success",
		message: `Pedido atualizado no Tiny Integrada ES. Pedido com ID: ${id}`
	}
}