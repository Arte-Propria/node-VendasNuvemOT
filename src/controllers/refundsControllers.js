import { fetchRefunds, insertRefund, deleteRefundById } from "../services/refundServices.js"

export const getRefunds = async (req, res) => {
	try {
		const { store, createdAtMin, createdAtMax, refundType } = req.params
		const refunds = await fetchRefunds({ store, createdAtMin, createdAtMax, refundType })
		res.json(refunds)
	} catch (error) {
		res.status(500).json({ message: "Erro ao buscar reembolsos", error: error.message })
	}
}

export const createRefund = async (req, res) => {
	try {
		const refund = await insertRefund(req.body, req.params.store)
		res.status(201).json(refund)
	} catch (error) {
		res.status(400).json({ message: "Erro ao criar reembolso", error: error.message })
	}
}

export const deleteRefund = async (req, res) => {
	try {
		const { id, store } = req.params
		const refund = await deleteRefundById(id, store)
		if (!refund) {
			return res.status(404).json({ message: "Reembolso não encontrado" })
		}
		res.json({ message: "Reembolso deletado com sucesso" })
	} catch (error) {
		res.status(500).json({ message: "Erro ao deletar reembolso", error: error.message })
	}
}
