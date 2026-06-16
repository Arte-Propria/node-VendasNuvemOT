import {
	fetchRequest,
	filterBdByDateRange,
	processOrderFromTiny,
	processOrderFromNuvemshop,
	syncNuvemshopOrders
} from "../services/segmentacaoServices.js"
import {
	dataBase,
	fetchMetaAdsByDate,
	fetchGoogleAdsByDate
} from "../db/dataBaseQueryList.js"
import { upsertAds } from "../db/upsert.js"
import { query } from "../db/db.js"

export const getDbQuery = async (req, res) => {
	try {
		const { querySelect, startDate, endDate } = req.params
		const { store } = req.query // <-- novo parâmetro via query string

		let storeValue = store
		if (store === "outlet") {
			storeValue = 3889735
		} else if (store === "artepropria") {
			storeValue = 1146504
		}
		// Se for numérico, mantém

		// Monta a consulta SQL base
		let sql = `SELECT * FROM ${querySelect}`
		const params = []

		// Aplica filtro por store se fornecido
		if (storeValue) {
			sql += " WHERE store = $1"
			params.push(storeValue)
		}

		const result = await query(sql, params)

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

// Buscar cupom por ID
export const getCouponById = async (req, res) => {
	try {
		const { id } = req.params
		if (!id) {
			return res.status(400).json({ error: "ID do cupom é obrigatório" })
		}

		let sql = `SELECT * FROM ${dataBase.coupon} WHERE id_coupon = $1`
		const params = [id]

		const result = await query(sql, params)
		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Cupom não encontrado" })
		}
		// Transformar usando dataBaseDb.coupon.transform se necessário, mas já está no formato da tabela.
		return res.status(200).json(result.rows[0])
	} catch (err) {
		console.error("Erro ao buscar cupom:", err)
		return res.status(500).json({ error: "Erro ao buscar cupom" })
	}
}

// Buscar cliente por ID (cpf_cnpj_cli ou id_cli)
export const getClientById = async (req, res) => {
	try {
		const { id } = req.params
		if (!id) {
			return res.status(400).json({ error: "ID do cliente é obrigatório" })
		}

		// Tentar buscar por id_cli ou cpf_cnpj_cli
		const isNumeric = /^\d+$/.test(id)
		let sql, params
		if (isNumeric) {
			sql = `SELECT * FROM ${dataBase.clients} WHERE id_cli = $1`
			params = [id]
		} else {
			sql = `SELECT * FROM ${dataBase.clients} WHERE cpf_cnpj_cli = $1`
			params = [id]
		}

		const result = await query(sql, params)
		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Cliente não encontrado" })
		}
		return res.status(200).json(result.rows[0])
	} catch (err) {
		console.error("Erro ao buscar cliente:", err)
		return res.status(500).json({ error: "Erro ao buscar cliente" })
	}
}

// Buscar produto por SKU (cod_categoria)
export const getProductBySku = async (req, res) => {
	try {
		const { sku } = req.params
		if (!sku) {
			return res.status(400).json({ error: "SKU do produto é obrigatório" })
		}

		const cod = sku.toUpperCase().trim()
		let sql = `SELECT * FROM ${dataBase.product} WHERE cod_categoria = $1`
		const params = [cod]

		const result = await query(sql, params)
		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Produto não encontrado" })
		}
		return res.status(200).json(result.rows[0])
	} catch (err) {
		console.error("Erro ao buscar produto:", err)
		return res.status(500).json({ error: "Erro ao buscar produto" })
	}
}

export const postDbQueryNuvemshop = async (req, res) => {
	try {
		const nuvemData = req.body
		console.log("Recebido pedido Nuvemshop ID:", nuvemData?.id)

		if (!nuvemData) {
			throw new Error("Corpo da requisição vazio")
		}

		await processOrderFromNuvemshop(nuvemData)

		res
			.status(200)
			.json({ message: "Pedido processado com sucesso (simulação Nuvemshop)" })
	} catch (error) {
		// Q6: não engolir o erro — registra e responde com status apropriado
		console.error("Erro ao processar pedido Nuvemshop:", error)
		return res.status(500).json({ error: error.message })
	}
}

export const postDbQueryTiny = async (req, res) => {
	try {
		const tinyData = req.body
		//console.log("Recebido pedido Tiny ID:", tinyData?.retorno.pedido.id)

		if (!tinyData) {
			throw new Error("Corpo da requisição vazio")
		}
		console.log("Debug TinyData:", tinyData)

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

export const syncOrders = async (req, res) => {
	try {
		const { store } = req.params // 'outlet' ou 'artepropria'
		// Validação básica
		if (store !== "outlet" && store !== "artepropria") {
			return res
				.status(400)
				.json({ error: "Loja inválida. Use \"outlet\" ou \"artepropria\"." })
		}

		const options = {
			delayMs: req.query.delay ? parseInt(req.query.delay, 10) : 100,
			skipExisting: req.query.skipExisting !== "false"
		}

		const result = await syncNuvemshopOrders(store, options)
		res.status(200).json(result)
	} catch (error) {
		console.error("Erro na sincronização:", error)
		res.status(500).json({ error: error.message })
	}
}
