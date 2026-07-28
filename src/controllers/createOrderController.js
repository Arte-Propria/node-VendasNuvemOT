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

	console.log("Cadastrando pedido", order[0])

	// 1) Tabela legada (pedidos_<loja>): mantém compatibilidade com o dump/migração.
	//    Devolve os ids EFETIVAMENTE persistidos — precisamos deles no passo 2.
	let ids
	try {
		ids = await insertOrder(order[0], store)
	} catch (error) {
		console.error("Erro ao gravar o pedido no dump legado:", error)
	}
	if (!ids) {
		return res.status(500).json({ error: "Falha ao gravar o pedido no dump legado" })
	}

	// A partir daqui o dump JÁ está commitado (não há transação entre os passos). Uma falha
	// adiante não pode virar "não foi cadastrado" — senão o operador reenvia e duplica, que
	// foi como nasceram as duplicatas de 25/07. Acumulamos avisos e devolvemos 201.
	const warnings = []

	// 2) orders_shop + clients/products/coupons/daily_sales: mesmo pipeline dos webhooks
	//    Nuvemshop, que já trata loja física. É daqui que o app (Pedidos/Dashboard) lê.
	//    `number` é injetado porque o payload manual não tem number/id/order_id — sem isso
	//    mapNuvemshopToDelivery gera order_id undefined, o upsert lança e o pedido fica SÓ
	//    no dump. Usar o number persistido mantém orders_shop.order_id == pedidos_<loja>.number,
	//    a mesma convenção da importação histórica, inclusive num reenvio.
	//    `clientEmail`: o payload manda sempre o CPF fictício da filial, então resolver por CPF
	//    colapsava todos os operadores no mesmo id_cli e sobrescrevia nome/e-mail a cada cadastro.
	try {
		await processOrderFromNuvemshop(
			{ ...order[0].data, number: ids.numericUuid },
			{ clientEmail: order[0].data?.customer?.email || order[0].data?.contact_email || null }
		)
	} catch (error) {
		console.error("Erro ao gravar em orders_shop (pedido já está no dump legado):", error)
		warnings.push({ step: "orders_shop", message: error.message })
	}

	// 3) daily_sales: upsertDailySales (dentro do passo 2) usa o dia de NEGÓCIO com corte
	//    03:00, enquanto a listagem e o Dashboard usam o dia-calendário SP do dump. Recalcula
	//    o intervalo que cobre as duas leituras para as fontes ficarem consistentes.
	if (STORE_NAMES.has(store)) {
		try {
			const createdAt = order[0].data?.created_at
			const businessDate = toBusinessDateBR(createdAt)
			const localDate = toLocalDateBR(createdAt)
			if (businessDate && localDate) {
				const [startDate, endDate] = businessDate <= localDate
					? [businessDate, localDate]
					: [localDate, businessDate]
				await recalcAllDailySales({ stores: [store], startDate, endDate, apply: true })
			}
		} catch (error) {
			console.error("Erro ao recalcular daily_sales (pedido já gravado):", error)
			warnings.push({ step: "daily_sales", message: error.message })
		}
	}

	return res.status(201).json({
		message: "Pedido cadastrado!",
		orderId: ids.numericUuid,
		warnings
	})
}
