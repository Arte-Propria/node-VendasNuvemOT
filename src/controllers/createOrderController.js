import { insertOrder } from "../services/orderServicesNuvem.js"
import { processOrderFromNuvemshop } from "../services/segmentacaoServices.js"

export const createOrder = async (req, res) => {
	const { store } = req.params
	const order = req.body

	if (!order || !order[0] || !store) {
		return res.status(400).json({ error: "Store and order are required" })
	}

	try {
		console.log("Cadastrando pedido", order[0])
		// 1) Tabela legada (pedidos_<loja>): mantém compatibilidade com o dump/migração.
		await insertOrder(order[0], store)
		// 2) orders_shop + clients/products/coupons/daily_sales: mesmo pipeline dos webhooks
		//    Nuvemshop, que já trata loja física. É daqui que o app (Pedidos/Dashboard) lê.
		await processOrderFromNuvemshop(order[0].data)

		return res.status(201).json({ message: "Pedido cadastrado!" })
	} catch (error) {
		console.error("Erro ao criar pedido:", error)
		return res.status(500).json({ error: "Erro ao criar pedido" })
	}
}
