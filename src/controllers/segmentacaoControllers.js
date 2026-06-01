import {
	fetchRequest,
	filterBdByDateRange,
	processOrderFromTiny,
	processOrderFromNuvemshop
} from "../services/segmentacaoServices.js"
import {
	fetchMetaAdsByDate,
	fetchGoogleAdsByDate
} from "../db/dataBaseQueryList.js"
import { upsertAds } from "../db/upsert.js"
import { fetchOrderTiny } from "../services/orderTinyServices.js"
import { query } from "../db/db.js"
import { cleanCpfCnpj } from "../tools/helpers.js"

export const getDbQuery = async (req, res) => {
	try {
		const { querySelect, startDate, endDate } = req.params

		const result = await query(`SELECT * FROM ${querySelect}`)

		const queryData = await fetchRequest(result, querySelect)

		const filterDataByDate = await filterBdByDateRange(queryData, querySelect, {
			startDate,
			endDate
		})

		return res.status(200).json(filterDataByDate)
	} catch (err) {
		console.error("Erro ao buscar database:", err)
		return res.status(500).json({ error: "Erro ao buscar pedidos" })
	}
}

export const postDbQueryNuvemshop = async (req, res) => {
	try {
		const nuvemData = req.body
		console.log("Recebido pedido Nuvemshop ID:", nuvemData?.id)

		if (!nuvemData) {
			throw new Error("Corpo da requisição vazio")
		}

		const idEcom = nuvemData.pedido.ecommerce.id
		const cpfEcom = cleanCpfCnpj(nuvemData.pedido.cliente.cpf_cnpj)
		const tinyOrder = await fetchOrderTiny(idEcom, cpfEcom)

		await processOrderFromNuvemshop(tinyOrder)

		res
			.status(200)
			.json({ message: "Pedido processado com sucesso (simulação Nuvemshop)" })
	} catch (error) {
		return res.status(200)
	}
}

export const postDbQueryTiny = async (req, res) => {
	try {
		const tinyData = req.body
		console.log("Recebido pedido Tiny ID:", tinyData?.retorno.pedido.id)

		if (!tinyData) {
			throw new Error("Corpo da requisição vazio")
		}

		await processOrderFromTiny(tinyData)

		res
			.status(200)
			.json({ message: "Pedido processado com sucesso (simulação Tiny)" })
	} catch (error) {
		console.error("Erro ao processar pedido Tiny:", error)
		res.status(500).send("Erro interno")
	}
}

export const postDbQueryAds = async (req, res) => {
	try {
		const { ads, store, date } = req.params

		// Validação da data (formato YYYY-MM-DD)
		if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return res
				.status(400)
				.json({ error: "Data inválida. Use formato YYYY-MM-DD" })
		}

		let delivery

		if (ads == "meta") {
			delivery = await fetchMetaAdsByDate(store, date)
		} else if (ads == "google") {
			delivery = await fetchGoogleAdsByDate(store, date)
		}

		if (!delivery) {
			return res.status(404).json({
				message: "Nenhum dado encontrado para a data e loja informados"
			})
		}

		await upsertAds(delivery)

		res.status(200).json({
			message: `${ads} webhook processed`,
			data: delivery
		})
	} catch (error) {
		console.error("Erro no Google webhook:", error)
		res.status(500).json({ error: error.message })
	}
}
