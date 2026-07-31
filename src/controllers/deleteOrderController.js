import {
	deleteOrderFromDB,
	deleteOrdersByDateBRT,
	deleteManualOrderById,
	pruneEmptyDailySales,
	orderStillInDailySales
} from "../services/deleteOrderServices.js"
import { storeMapping } from "../db/dataBaseQueryList.js"
import { recalcAllDailySales } from "../services/dailySalesRecalc.js"
import { toLocalDateBR } from "../tools/helpers.js"

// Normaliza a loja: aceita código numérico ("1146504") ou nome ("artepropria")
const resolveStore = (store) => {
	if (storeMapping.nameToNumeric[store]) {
		return { name: store, numeric: storeMapping.nameToNumeric[store] }
	}
	if (storeMapping.numericToName[Number(store)]) {
		const numeric = Number(store)
		return { name: storeMapping.numericToName[numeric], numeric }
	}
	return null
}

/**
 * Recalcula daily_sales dos dias afetados pela exclusão.
 *
 * Roda depois do COMMIT — o pedido já sumiu quando isto executa. Por isso a falha nunca
 * é silenciosa: volta no corpo da resposta para a tela avisar, em vez de exibir sucesso
 * com o Dashboard mostrando o pedido excluído.
 *
 * @returns {Promise<{recalculado:boolean, dias:string[], erro?:string}>}
 */
const refreshDailySalesFor = async (store, createdAt) => {
	if (!createdAt) {
		return {
			recalculado: false,
			dias: [],
			erro: "pedido excluído sem created_at (dump e orders_shop) — não há dia para recalcular"
		}
	}

	// Dia-calendário BRT: a mesma e única regra do motor de recálculo e da listagem.
	// Antes eram DOIS dias (o de negócio com corte 03:00 e o de calendário), porque as
	// duas regras coexistiam e podiam divergir em pedidos de meia-noite.
	const day = toLocalDateBR(createdAt)
	if (!day) {
		return { recalculado: false, dias: [], erro: `created_at inválido: ${createdAt}` }
	}
	const dias = [day]

	try {
		await recalcAllDailySales({ stores: [store.name], startDate: day, endDate: day, apply: true })
		// recalc só reescreve dias que ainda têm pedidos; se este era o último
		// do dia, a linha agregada precisa sair.
		for (const dia of dias) await pruneEmptyDailySales(store, dia)
		return { recalculado: true, dias }
	} catch (err) {
		console.error("Erro ao recalcular daily_sales após exclusão:", err)
		return { recalculado: false, dias, erro: err.message }
	}
}

// Exclui um pedido manual (loja física / chatbot) das DUAS bases pelo order_id da
// listagem nova, limpa os cupons vinculados e recalcula daily_sales do dia a partir do dump.
export const deleteManualOrder = async (req, res) => {
	const { store, orderId } = req.params

	if (!/^\d+$/.test(String(orderId))) {
		return res.status(400).json({ error: `orderId inválido: ${orderId}` })
	}

	const resolved = resolveStore(store)
	if (!resolved) {
		return res.status(400).json({
			error: `Loja desconhecida: ${store}. Use outlet/artepropria ou 3889735/1146504.`
		})
	}

	try {
		const result = await deleteManualOrderById(resolved, Number(orderId))
		const total = Object.values(result.deleted).reduce((a, b) => a + b, 0)
		if (total === 0) {
			return res.status(404).json({ error: "Pedido não encontrado" })
		}

		const dailySales = await refreshDailySalesFor(resolved, result.createdAt)

		// Confere o resultado na fonte em vez de confiar que o recálculo rodou.
		if (dailySales.recalculado) {
			if (await orderStillInDailySales(resolved, result.number, dailySales.dias)) {
				dailySales.recalculado = false
				dailySales.erro = `pedido ${result.number} continua em daily_sales.id_orders após o recálculo`
			} else if (result.dumpOrfao) {
				// Sem o `number` não dá para conferir; o dump intacto já indica que o
				// recálculo (que lê o dump) voltaria a contar o pedido.
				dailySales.recalculado = false
				dailySales.erro =
					"pedido removido de orders_shop mas não do dump legado: o recálculo lê o dump e continuaria contando o pedido"
			}
		}

		// 207: o pedido foi excluído, mas a agregação do dia continua com o valor antigo.
		// Responder 200 aqui foi o que deixou o Dashboard divergir sem ninguém perceber.
		return res.status(dailySales.recalculado ? 200 : 207).json({
			message: dailySales.recalculado
				? "Pedido excluído"
				: "Pedido excluído, mas daily_sales não foi recalculado",
			deleted: result.deleted,
			dailySales
		})
	} catch (err) {
		console.error("Erro ao excluir pedido manual:", err)
		return res.status(500).json({ error: "Falha ao excluir pedido" })
	}
}

export const deleteOrderByOwnerNote = async (req, res) => {
	const { ownerNote, store } = req.params // Assume que o ownerNote vem no corpo da requisição

	if (!ownerNote) {
		return res.status(400).json({ error: "ownerNote is required" })
	}

	const decodedOwnerNote = decodeURIComponent(ownerNote)

	try {
		const result = await deleteOrderFromDB(decodedOwnerNote, store)
		if (result.rowCount === 0) {
			return res.status(404).json({ error: "Order not found" })
		}
		return res.status(200).json({ message: "Order deleted successfully" })
	} catch (err) {
		console.error("Error deleting order:", err)
		return res.status(500).json({ error: "Failed to delete order" })
	}
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Formato estrito + round-trip para rejeitar datas inexistentes (ex.: 2026-06-32,
// que geraria Invalid Date e faria toISOString() lançar exceção)
const isValidDate = (date) => {
	if (!DATE_RE.test(date)) return false
	const d = new Date(`${date}T12:00:00Z`)
	return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date
}

export const deleteOrdersByDate = async (req, res) => {
	const { store, date } = req.params
	const apply = String(req.query.apply).toLowerCase() === "true"

	// Normaliza a loja: aceita código numérico ("1146504") ou nome ("artepropria")
	let name, numeric
	if (storeMapping.nameToNumeric[store]) {
		name = store
		numeric = storeMapping.nameToNumeric[store]
	} else if (storeMapping.numericToName[Number(store)]) {
		numeric = Number(store)
		name = storeMapping.numericToName[numeric]
	} else {
		return res.status(400).json({
			error: `Loja desconhecida: ${store}. Use outlet/artepropria ou 3889735/1146504.`
		})
	}

	if (!isValidDate(date)) {
		return res.status(400).json({ error: `Data inválida: ${date}. Use YYYY-MM-DD.` })
	}

	try {
		const result = await deleteOrdersByDateBRT({ name, numeric }, date, { apply })
		const total = Object.values(result.deleted).reduce((a, b) => a + b, 0)
		if (total === 0) {
			return res.status(404).json({
				error: "Nenhum registro encontrado para esta loja/data",
				store: { name, id: numeric },
				date
			})
		}
		return res.status(200).json({
			store: { name, id: numeric },
			date,
			applied: apply,
			message: apply
				? "Registros excluídos"
				: "DRY-RUN: nada foi excluído. Reenvie com ?apply=true para confirmar.",
			deleted: result.deleted,
			orderNumbers: result.orderNumbers
		})
	} catch (err) {
		console.error("Erro ao excluir pedidos por data:", err)
		return res.status(500).json({ error: "Falha ao excluir pedidos por data" })
	}
}
