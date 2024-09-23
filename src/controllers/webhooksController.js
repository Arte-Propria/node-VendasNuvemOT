import { fetchOrder, insertOrderWebhook } from "../services/orderServicesNuvem.js";

export const createdOrderWebhook = async  (req, res) => {
  try {
    const { store_id, event, id } = req.body;
  
    console.log(`Evento: ${event} recebido para a loja ${store_id}, pedido ID: ${id}`);
    
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
    res.sendStatus(200); // Nuvemshop espera um status 2XX para considerar o webhook processado
  } catch (error) {
    console.log(error)
  }
 
}