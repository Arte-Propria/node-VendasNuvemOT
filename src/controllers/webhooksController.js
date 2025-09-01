/* eslint-disable camelcase */
import { POSTwebhook } from "../api/post.js"
import { fetchOrder, insertOrderWebhook } from "../services/orderServicesNuvem.js"
import { processEcommerceWebhook, processMarketplaceWebhook } from "../services/webhookServices.js"
import { logEcommerce } from "../utils/logger.js"
import { updateMandaeInfo, webhookMandaeInfo } from '../services/mandaeServices.js'

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

		//Receber dados da Nuvemshop
		const order = await fetchOrder(data)

		await insertOrderWebhook(order, stores[store_id])
		console.log(`Pedido ID: ${id} atualizado`)
		
    // Atualizar a tabela info_mandae
    //await updateMandaeInfo(order, stores[store_id]);

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

export const mandaeWebhook = async (req, res) => {
  try {
    const { id_ped, status_mandae } = req.body;

    // Validar dados recebidos
    if (!id_ped || !status_mandae) {
      return res.status(400).json({ 
        error: "id_ped e status_mandae são obrigatórios" 
      });
    }

    // Chamar o service para atualizar a informação
    const result = await webhookMandaeInfo(id_ped, status_mandae);
    
    console.log(result.message, result.details);
    
    res.sendStatus(200);
  } catch (err) {
    //console.error("Erro no webhook da Mandae:", err);
    
    if (err.message.includes('não encontrado')) {
      return res.status(404).json({ error: err.message });
    }
		logEcommerce(`Erro ao processar o webhook Mandae: ${err}`)
    res.sendStatus(200);
		/*
    res.status(500).json({ 
      error: "Erro interno do servidor",
      details: err.message 
    });
		*/
  }
};
