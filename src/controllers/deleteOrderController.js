import { deleteOrderFromDB, deleteOrdersByBusinessDate } from "../services/deleteOrderServices.js"
import { storeMapping } from "../db/dataBaseQueryList.js"

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
		const result = await deleteOrdersByBusinessDate({ name, numeric }, date, { apply })
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
