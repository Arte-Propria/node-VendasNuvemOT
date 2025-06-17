/* eslint-disable camelcase */
import { POSTwebhook } from "../api/post.js"
import { fetchOrder, insertOrderWebhook } from "../services/orderServicesNuvem.js"
import { processEcommerceWebhook, processMarketplaceWebhook } from "../services/webhookServices.js"
import { logEcommerce } from "../utils/logger.js"

export const createdOrderWebhook = async  (req, res) => {
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

		const order = await fetchOrder(data)
		await insertOrderWebhook(order, stores[store_id])
		console.log(`Pedido ID: ${id} atualizado`)
    
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

		const webhookUrl = "https://script.google.com/macros/s/AKfycbwWNxCO5x4jvaBgD-EdPdPuE8Q9XwaVmc_3_j-yXpI5yrYHyHslfvRRlNC7j7bJ8fZC/exec"
		const webhookEdu = "https://script.google.com/macros/s/AKfycbzVuwgMw6PTi5TquPJOADYMLSWsxEjr11WYlgv7e2Kf6P_igqqkonQmf35dKeaReEoQ/exec"

		if(body.tipo === "atualizacao_pedido") {
			await POSTwebhook(webhookUrl, body)
			await POSTwebhook(webhookEdu, body)
		}

		res.status(200).send(result)
	} catch (error) {
		// logWebhook(`Erro ao processar o webhook: ${error}`)
		res.status(200)
	}
}

export const createOrderEcommerceWebhook = async (req, res) => {
	try {
		const { body } = req

		const { message } = await processEcommerceWebhook(body)

		logEcommerce(message)
		res.sendStatus(200)
	} catch (error) {
		logEcommerce(`Erro ao processar o webhook: ${error}`)
		res.sendStatus(200)
	}
}
