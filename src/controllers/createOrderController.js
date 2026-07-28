import { insertOrder } from "../services/orderServicesNuvem.js"
import { processOrderFromNuvemshop } from "../services/segmentacaoServices.js"
import { recalcAllDailySales } from "../services/dailySalesRecalc.js"
import { toBusinessDateBR, toLocalDateBR } from "../tools/helpers.js"

const STORE_NAMES = new Set(["outlet", "artepropria"])

export const createOrder = async (req, res) => {
	const { store } = req.params
	const order = req.body

	if (!order || !order[0] || !store) {
		return res.status(400).json({ error: "Store and order are required" })
	}

	try {
		console.log("Cadastrando pedido", order[0])
		// 1) Tabela legada (pedidos_<loja>): mantém compatibilidade com o dump/migração.
		//    Devolve os ids gerados (numericUuid) — precisamos deles no passo 2.
		const ids = await insertOrder(order[0], store)
		if (!ids) {
			return res.status(500).json({ error: "Falha ao gravar o pedido no dump legado" })
		}

		// 2) orders_shop + clients/products/coupons/daily_sales: mesmo pipeline dos webhooks
		//    Nuvemshop, que já trata loja física. É daqui que o app (Pedidos/Dashboard) lê.
		//    `number` é injetado porque o payload manual não tem number/id/order_id e o
		//    `token` é o placeholder "999999" — sem isso mapNuvemshopToDelivery gera
		//    order_id undefined, o upsert lança e o pedido fica SÓ no dump.
		//    Usar o numericUuid mantém orders_shop.order_id == pedidos_<loja>.number,
		//    a mesma convenção da importação histórica.
		await processOrderFromNuvemshop({ ...order[0].data, number: ids.numericUuid })

		// 3) daily_sales: upsertDailySales (dentro do passo 2) usa o dia de NEGÓCIO com corte
		//    03:00, enquanto a listagem e o Dashboard usam o dia-calendário SP do dump. Recalcula
		//    o intervalo que cobre as duas leituras para as fontes ficarem consistentes.
		if (STORE_NAMES.has(store)) {
			const createdAt = order[0].data?.created_at
			const businessDate = toBusinessDateBR(createdAt)
			const localDate = toLocalDateBR(createdAt)
			if (businessDate && localDate) {
				const [startDate, endDate] = businessDate <= localDate
					? [businessDate, localDate]
					: [localDate, businessDate]
				await recalcAllDailySales({ stores: [store], startDate, endDate, apply: true })
			}
		}

		return res.status(201).json({ message: "Pedido cadastrado!", orderId: ids.numericUuid })
	} catch (error) {
		console.error("Erro ao criar pedido:", error)
		return res.status(500).json({ error: "Erro ao criar pedido" })
	}
}
