import {
	fetchRequest,
	filterBdByDateRange,
	processOrderFromTiny,
	processOrderFromNuvemshop,
	syncNuvemshopOrders,
	chamarAdsWebhooksPeriodo
} from "../services/segmentacaoServices.js"
import {
	dataBase,
	dataBaseDb,
	fetchMetaAdsByDate,
	fetchGoogleAdsByDate
} from "../db/dataBaseQueryList.js"
import { upsertAds } from "../db/upsert.js"
import { query } from "../db/db.js"

// Allowlist de tabelas consultáveis: querySelect é interpolado direto no SQL
// (`SELECT * FROM ${querySelect}`), então só aceitamos os nomes físicos conhecidos
// (defesa contra injeção / tabela inválida). Mesmo conjunto usado em upsert.js.
const ALLOWED_QUERY_TABLES = new Set(Object.values(dataBase))

export const getDbQuery = async (req, res) => {
	try {
		const { querySelect, startDate, endDate, store } = req.params

		// Valida a tabela ANTES de qualquer interpolação no SQL.
		if (!ALLOWED_QUERY_TABLES.has(querySelect)) {
			return res.status(400).json({
				error: `Tabela inválida: '${querySelect}'. Permitidas: ${[...ALLOWED_QUERY_TABLES].join(", ")}`
			})
		}

		// A coluna `store` tem REPRESENTAÇÃO diferente por tabela:
		//  - orders_shop / daily_sales → código numérico (ex.: 3889735)
		//  - ads / coupon              → nome amigável ("outlet"/"artepropria")
		// Por isso o valor do filtro precisa ser convertido para o formato da tabela-alvo.
		const STORE_TO_NUMERIC = { outlet: 3889735, artepropria: 1146504 }
		const NUMERIC_TO_NAME = { 3889735: "outlet", 1146504: "artepropria" }
		const storeColumnType = {
			orders_shop: "numeric",
			daily_sales: "numeric",
			ads: "name",
			coupon: "name"
		}

		// Normaliza a entrada; string vazia / só espaços conta como ausência de filtro.
		const storeParam = store !== undefined ? String(store).trim() : undefined
		const hasStoreFilter = storeParam !== undefined && storeParam !== ""

		// Validação: store só é suportado nas tabelas que possuem a coluna mapeada
		if (hasStoreFilter && !storeColumnType[querySelect]) {
			return res.status(400).json({
				error: `Filtro 'store' não suportado para a tabela '${querySelect}'. Tabelas permitidas: ${Object.keys(storeColumnType).join(", ")}`
			})
		}

		// Resolve o valor de store na representação correta para a tabela-alvo,
		// aceitando tanto o nome amigável quanto o código numérico na entrada.
		let storeValue
		if (hasStoreFilter) {
			let name = null
			let numeric = null
			if (storeParam === "outlet" || storeParam === "artepropria") {
				name = storeParam
				numeric = STORE_TO_NUMERIC[storeParam]
			} else if (/^\d+$/.test(storeParam)) {
				// Apenas dígitos: trata como código numérico (evita coerções frouxas
				// de isNaN, ex.: "0x10", "1e3" ou espaços virando número).
				numeric = Number(storeParam)
				name = NUMERIC_TO_NAME[numeric] || null
			} else {
				name = storeParam // nome desconhecido: usa como veio
			}
			storeValue = storeColumnType[querySelect] === "name" ? name : numeric

			// Filtro pedido mas não resolvível para a representação desta tabela
			// (ex.: ads/coupon com um código numérico sem nome conhecido) → sem resultados.
			if (storeValue === null || storeValue === undefined) {
				return res.status(200).json([])
			}
		}

		// Monta a consulta SQL
		let sql = `SELECT * FROM ${querySelect}`
		const params = []

		if (storeValue !== undefined) {
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

/**
 * Endpoint genérico de busca por ID:  GET /db/:table/:id
 * Mapeia cada tabela lógica para o nome físico, sua chave primária e o transform.
 */
const ID_TABLE_MAP = {
	orders_shop: {
		table: dataBase.orders_shop,
		pk: "order_id",
		transform: dataBaseDb.orders_shop?.transform
	},
	clients: {
		table: dataBase.clients,
		pk: "id_cli",
		transform: dataBaseDb.clients?.transform
	},
	product: {
		table: dataBase.product,
		pk: "cod_categoria",
		transform: dataBaseDb.product?.transform
	},
	coupon: {
		table: dataBase.coupon,
		pk: "id_coupon",
		transform: dataBaseDb.coupon?.transform
	},
	ads: {
		table: dataBase.ads,
		pk: "id_ads",
		transform: dataBaseDb.ads?.transform
	},
	daily_sales: {
		table: dataBase.daily_sales,
		pk: "id_sales",
		transform: dataBaseDb.daily_sales?.transform
	}
}

export const getItemById = async (req, res) => {
	const { table, id } = req.params
	try {
		const config = ID_TABLE_MAP[table]
		if (!config) {
			return res.status(400).json({
				error: `Tabela inválida. Permitidas: ${Object.keys(ID_TABLE_MAP).join(", ")}`
			})
		}

		// clients: id_cli é um SERIAL (int4). Porém orders_shop.id_cli às vezes guarda
		// o CPF/CNPJ (fallback do map quando o cliente não tem id serial resolvido).
		// Resolvemos então por id_cli (apenas quando o valor cabe em int4) E, em
		// fallback, por cpf_cnpj_cli (texto — preserva zeros à esquerda e evita o
		// "integer out of range" que um CPF de 11 dígitos causaria em id_cli).
		// Alinha com o spec: "por id_cli (se numérico) ou cpf_cnpj_cli (se textual)".
		if (table === "clients") {
			const raw = String(id).trim()
			const onlyDigits = /^\d+$/.test(raw)
			// Serial plausível: cabe em int4 e não tem zero à esquerda (CPF/CNPJ podem ter).
			const looksSerial =
        onlyDigits &&
        raw.length <= 9 &&
        !raw.startsWith("0") &&
        Number(raw) <= 2147483647

			let result = null
			if (looksSerial) {
				result = await query(`SELECT * FROM ${config.table} WHERE id_cli = $1`,
					[Number(raw)])
			}
			// CPF/CNPJ (ou serial sem correspondência) → busca por cpf_cnpj_cli (texto).
			if (!result || result.rows.length === 0) {
				result = await query(`SELECT * FROM ${config.table} WHERE cpf_cnpj_cli = $1`,
					[raw])
			}
			if (result.rows.length === 0) {
				return res.status(404).json({ error: "Registro não encontrado" })
			}
			const data = config.transform
				? config.transform(result.rows[0])
				: result.rows[0]
			return res.status(200).json(data)
		}

		// product usa SKU em maiúsculas como chave; demais usam o valor cru
		const idValue =
      config.pk === "cod_categoria" ? String(id).toUpperCase().trim() : id

		const sql = `SELECT * FROM ${config.table} WHERE ${config.pk} = $1`
		const result = await query(sql, [idValue])
		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Registro não encontrado" })
		}

		const data = config.transform
			? config.transform(result.rows[0])
			: result.rows[0]
		return res.status(200).json(data)
	} catch (err) {
		console.error(`Erro ao buscar ${table} por ID:`, err)
		return res.status(500).json({ error: "Erro interno" })
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

export const postDbQueryPeriod = async (req, res) => {
	try {
		const { startDate, endDate } = req.params

		// Validação básica das datas
		if (!startDate || !endDate) {
			return res
				.status(400)
				.json({ error: "startDate e endDate são obrigatórios" })
		}
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
		) {
			return res
				.status(400)
				.json({ error: "Formato de data inválido. Use YYYY-MM-DD" })
		}

		// Executa a sincronização (pode demorar, por isso é melhor executar em background)
		// Se você quiser executar em background e retornar imediatamente, use setImmediate ou fila.
		// Aqui vamos aguardar a conclusão (pode timeout para períodos grandes)
		const result = await chamarAdsWebhooksPeriodo(startDate, endDate)

		return res.status(200).json({
			message: "Processamento concluído com sucesso",
			...result
		})
	} catch (error) {
		console.error("Erro na sincronização por período:", error)
		return res.status(500).json({ error: error.message })
	}
}
