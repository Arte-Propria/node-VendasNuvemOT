/* eslint-disable camelcase */
import { fetchOrder, insertOrderWebhook } from "../services/orderServicesNuvem.js"
import { processEcommerceWebhook, processEcommerceWebhookGetOrders, processEcommerceWebhookManual, processMarketplaceWebhook } from "../services/webhookServices.js"
import { logEcommerce, logMandae } from "../utils/logger.js"
import { parseStatusMandae, updateMandaeInfo, webhookMandaeInfo } from "../services/mandaeServices.js"
import { query } from "../db/db.js"

export const createdOrderWebhook = async (req, res) => {
	try {
		const { store_id, event, id } = req.body

		console.log(`Evento: ${event} recebido para a loja ${store_id}, pedido ID: ${id}`)

		const stores = {
			3889735: "outlet",
			1146504: "artepropria"
		}

		const data = {
			store: stores[store_id],
			id
		}

		//Receber dados da Nuvemshop
		const order = await fetchOrder(data)

		await insertOrderWebhook(order, stores[store_id])
		console.log(`Pedido ID: ${id} atualizado`)

		// Atualizar a tabela info_mandae
		await updateMandaeInfo(order, stores[store_id])

		// Confirmação de recebimento do webhook
		res.sendStatus(200) // Nuvemshop espera um status 2XX para considerar o webhook processado
	} catch (error) {
		console.log(error)
	}
}

export const createOrderMarketplaceWebhook = async (req, res) => {
	try {
		const { body } = req

		// Chamar o serviço para processar o webhook
		const result = await processMarketplaceWebhook(body)

		return res.status(200).send(result)
	} catch (error) {
		// logWebhook(`Erro ao processar o webhook: ${error}`)
		return res.status(200)
	}
}

export const createOrderEcommerceWebhook = async (req, res) => {
	try {
		const { body } = req

		const { message } = await processEcommerceWebhook(body)

		logEcommerce(body)
		logEcommerce(message)
		
		return res.sendStatus(200)
	} catch (error) {
		logEcommerce(JSON.stringify(req.body, null, 2))
		logEcommerce(`Erro ao processar o webhook: ${error}`)
		return res.sendStatus(200)
	}
}

export const createOrderEcommerceWebhookManual = async (req, res) => {
	try {
		const { createdAtMin, createdAtMax } = req.query

		const orders = await processEcommerceWebhookGetOrders(createdAtMin, createdAtMax)

		logEcommerce(`Processando ${orders.length} pedidos`)
		let ordersProcessed = 0
		for (const order of orders) {
			const { message } = await processEcommerceWebhookManual(order)
			logEcommerce(message + ` - ${ordersProcessed} de ${orders.length}`)
			ordersProcessed++
		}

		return res.sendStatus(200)
	} catch (error) {
		logEcommerce(`Erro ao processar o webhook: ${error}`)
		return res.sendStatus(200)
	}
}

export const mandaeWebhook = async (req, res) => {
	const mandaeData = req.body
	try {
		// Validar dados recebidos
		if (!mandaeData.trackingCode || !mandaeData.events || !Array.isArray(mandaeData.events)) {
			return res.status(200).json({
				error: "trackingCode e events (array) são obrigatórios"
			})
		}

		// Chamar o service para atualizar a informação
		const result = await webhookMandaeInfo(mandaeData)

		logMandae(result.message, result.details)

		return res.sendStatus(200)
	} catch (err) {

		//logMandae(`Erro ao processar o webhook Mandae no pedido com código de rastreio ${mandaeData.trackingCode} : ${err}`)
		return res.sendStatus(200)

	}
}

// Função para testar o parse com um pedido específico
export const debugParseStatusMandae = async (orderId) => {
	try {
		console.log(`🔍 DEBUG: Analisando pedido ${orderId}...`)

		const findOrderQuery = "SELECT * FROM info_mandae WHERE id_ped = $1"
		const orderResult = await query(findOrderQuery, [orderId])

		if (orderResult.rows.length === 0) {
			throw new Error(`Pedido ${orderId} não encontrado`)
		}

		const order = orderResult.rows[0]
		const { id_ped, cod_rastreio, status_mandae, situacao } = order

		console.log("\n=== DADOS DO PEDIDO ===")
		console.log("ID:", id_ped)
		console.log("Código Rastreio:", cod_rastreio)
		console.log("Situação atual:", situacao)
		console.log("Tipo do status_mandae:", typeof status_mandae)
		console.log("Valor do status_mandae:")
		console.log(status_mandae)

		// Testar diferentes métodos de parse
		console.log("\n=== TESTANDO DIFERENTES MÉTODOS DE PARSE ===")

		// Método 1: Parse direto
		console.log("\n--- Método 1: Parse direto ---")
		try {
			const parsed1 = JSON.parse(status_mandae)
			console.log("✅ Parse direto funcionou:", typeof parsed1)
			console.log("Resultado:", JSON.stringify(parsed1, null, 2))
		} catch (e) {
			console.log("❌ Parse direto falhou:", e.message)
		}

		// Método 2: Remover aspas externas + parse
		console.log("\n--- Método 2: Remover aspas externas ---")
		try {
			let cleaned = status_mandae.trim()
			if (cleaned.startsWith("\"") && cleaned.endsWith("\"")) {
				cleaned = cleaned.slice(1, -1)
			}
			const parsed2 = JSON.parse(cleaned)
			console.log("✅ Método 2 funcionou:", typeof parsed2)
			console.log("Resultado:", JSON.stringify(parsed2, null, 2))
		} catch (e) {
			console.log("❌ Método 2 falhou:", e.message)
		}

		// Método 3: Usar nossa função de parse
		console.log("\n--- Método 3: Nossa função de parse ---")
		const parsed3 = parseStatusMandae(status_mandae)
		console.log("Resultado da nossa função:", parsed3.length, "eventos")
		console.log("Eventos:", JSON.stringify(parsed3, null, 2))

		// Verificar entrega realizada
		const entregaRealizada = parsed3.find((event) =>
			event &&
			(event.id === "1" || event.id === 1) &&
			(event.name === "Entrega realizada" || event.name === "Pedido entregue"))

		console.log("\n=== VERIFICAÇÃO DE ENTREGA REALIZADA ===")
		console.log("Encontrou entrega realizada:", !!entregaRealizada)
		if (entregaRealizada) {
			console.log("Detalhes do evento:", entregaRealizada)
		}

		return {
			success: true,
			order: {
				id_ped,
				cod_rastreio,
				situacao_atual: situacao,
				deve_ser_atualizado: !!entregaRealizada
			},
			parse_result: parsed3,
			entrega_realizada: entregaRealizada
		}

	} catch (error) {
		console.error("Erro no debug:", error)
		return {
			success: false,
			error: error.message
		}
	}
}