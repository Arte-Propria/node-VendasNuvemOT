import {
	dataBase,
	dataBaseDb,
	storeMapping,
	mapNuvemshopToDelivery,
	mapTinyToDelivery
} from "../db/dataBaseQueryList.js"
import {
	upsertRecord,
	upsertClient,
	upsertOrderShop,
	upsertProduct,
	upsertCoupon,
	upsertDailySales
} from "../db/upsert.js"
import { query } from "../db/db.js"
import { toNumber, cleanCpfCnpj } from "../tools/helpers.js"
import { fetchLinkNote, fetchNoteOrderTiny, fetchOrderTiny } from "../services/orderTinyServices.js"

// 1. Função para realizar o MAP dos itens, com base em qual query será acessada
// o parametro querySelect será usado para:
// - fazer o fetch;
// - usando switch case, o querySelect vai definir qual caso será usado para a requisição
export const fetchRequest = async (queryData, querySelect) => {
	let allRequests = []

	try {
		const response = queryData

		const result = response.rows.map((delivery) => {
			// o objeto dataBase possui o nome de cada banco de dados
			// o objeto dataBaseDb engloba cada caso a ser usado pelo map
			switch (querySelect) {
			case dataBase.ads:
				return dataBaseDb.ads.transform(delivery)

			case dataBase.clients:
				return dataBaseDb.clients.transform(delivery)

			case dataBase.coupon:
				return dataBaseDb.coupon.transform(delivery)

			case dataBase.daily_sales:
				return dataBaseDb.daily_sales.transform(delivery)

			case dataBase.orders_shop:
				return dataBaseDb.orders_shop.transform(delivery)

			case dataBase.product:
				return dataBaseDb.product.transform(delivery)

			default:
				console.log("Database desconhecida")
			}
		})

		allRequests = allRequests.concat(result)

		return allRequests || []
	} catch (error) {
		console.error("Error fetching data from Query", error.message)
		return []
	}
}

// Função para filtrar os dados formatados por data
export const filterBdByDateRange = (queryData,
	querySelect,
	{ startDate, endDate } = {}) => {
	try {
		// Se não houver datas de filtro, retorna todos os dados
		if (!startDate && !endDate) {
			//console.log("⚠️ Nenhum filtro de data aplicado")
			//console.log("DEBUG startDate:", startDate)
			//console.log("DEBUG endDate:", endDate)

			return queryData
		}

		// Valida se queryData é array
		if (!Array.isArray(queryData)) {
			throw new Error("queryData deve ser um array")
		}

		// Valida se há dados
		if (!queryData || queryData.length === 0) {
			console.log("📭 Nenhum dado para filtrar")
			return []
		}

		//console.log(`📅 Aplicando filtro de data para tabela: ${querySelect}`)
		//console.log(`📆 Período: ${startDate || "Início não definido"} até ${endDate || "Fim não definido"}`)

		// Mapeamento dos campos de data para cada tabela
		const dateFieldMap = {
			[dataBase.ads]: "date_ads",
			[dataBase.clients]: "dt_criacao_cli",
			[dataBase.coupon]: "date_coupon",
			[dataBase.daily_sales]: "date_sales",
			[dataBase.orders_shop]: "created_at",
			[dataBase.product]: "lastDate"
		}

		// Obter o campo de data correto para a tabela
		const dateField = dateFieldMap[querySelect]

		if (!dateField) {
			console.warn(`⚠️ Tabela '${querySelect}' não possui campo de data mapeado. Retornando dados sem filtro.`)
			return queryData
		}

		// Validar campo existe nos dados
		const sampleItem = queryData[0]
		if (!sampleItem || !sampleItem.hasOwnProperty(dateField)) {
			console.warn(`⚠️ Campo '${dateField}' não encontrado nos dados. Campos disponíveis:`,
				Object.keys(sampleItem || {}))
			return queryData
		}

		// Converter datas para objetos Date com tratamento de fuso horário
		const parseDate = (dateString) => {
			if (!dateString) return null

			// Se já for um objeto Date
			if (dateString instanceof Date) {
				return dateString
			}

			// Remove hora e fuso para comparação apenas por data
			// Usando UTC para evitar problemas de fuso horário
			const parts = dateString.split("-")
			if (parts.length === 3) {
				return new Date(Date.UTC(parseInt(parts[0]),
					parseInt(parts[1]) - 1,
					parseInt(parts[2])))
			}
			return new Date(dateString)
		}

		const start = startDate ? parseDate(startDate) : null
		const end = endDate ? parseDate(endDate) : null

		// Ajustar horários para incluir todo o intervalo
		if (start) {
			// Início do dia: 00:00:00.000
			start.setUTCHours(
				0, 0, 0, 0
			)
		}

		if (end) {
			// Final do dia: 23:59:59.999
			end.setUTCHours(
				23, 59, 59, 999
			)
		}

		// Validar datas
		if (start && isNaN(start.getTime())) {
			throw new Error("Data inicial inválida")
		}

		if (end && isNaN(end.getTime())) {
			throw new Error("Data final inválida")
		}

		if (start && end && start > end) {
			throw new Error("Data inicial não pode ser maior que data final")
		}

		// Aplicar filtro
		const filteredData = queryData.filter((item) => {
			try {
				// Obter a data do item
				const itemDateValue = item[dateField]

				if (!itemDateValue) {
					console.warn(`⚠️ Item sem data no campo '${dateField}':`,
						item.id || item)
					return false // Ou true se quiser incluir itens sem data
				}

				const itemDate = parseDate(itemDateValue)

				if (!itemDate || isNaN(itemDate.getTime())) {
					console.warn("⚠️ Data inválida no item:", item)
					return false
				}

				// Verificar se está dentro do intervalo
				const isAfterStart = !start || itemDate >= start
				const isBeforeEnd = !end || itemDate <= end

				return isAfterStart && isBeforeEnd
			} catch (error) {
				console.error("❌ Erro ao processar item:", item, error)
				return false
			}
		})

		//console.log(`✅ Filtro aplicado: ${filteredData.length} de ${queryData.length} itens mantidos`)

		return filteredData
	} catch (error) {
		console.error("❌ Erro em filterByDateRange:", error.message)
		// Em produção, você pode querer retornar os dados originais ou lançar o erro
		throw new Error(`Falha ao filtrar por data: ${error.message}`)
	}
}

// Função para processar um pedido da Nuvenshop
export async function processOrderFromNuvemshop(nuvemData) {
	// Mapear
	const delivery = mapNuvemshopToDelivery(nuvemData)
	/*
	console.log("delivery recebido, tipos:")
	console.log(" - orders_shop:",
		Array.isArray(delivery.orders_shop) ? "array" : typeof delivery.orders_shop)
	console.log(" - clients:",
		Array.isArray(delivery.clients) ? "array" : typeof delivery.clients)
	console.log(" - product:",
		Array.isArray(delivery.product) ? "array" : typeof delivery.product)
	console.log(" - coupons:",
		Array.isArray(delivery.coupons) ? "array" : typeof delivery.coupons)
	console.log(" - ads:",
		Array.isArray(delivery.ads) ? "array" : typeof delivery.ads)
*/
	// Garantir que sejam arrays (caso algo tenha dado errado)
	const safeDelivery = {
		orders_shop: Array.isArray(delivery.orders_shop)
			? delivery.orders_shop
			: [],
		clients: Array.isArray(delivery.clients) ? delivery.clients : [],
		product: Array.isArray(delivery.product) ? delivery.product : [],
		coupons: Array.isArray(delivery.coupons) ? delivery.coupons : [],
		ads: Array.isArray(delivery.ads) ? delivery.ads : []
	}

	// Aplicar transforms e simular upsert
	//console.log("\n--- REGISTROS A SEREM PERSISTIDOS ---")

	// Dentro de processOrderFromNuvemshop
	for (const client of safeDelivery.clients) {
		const record = dataBaseDb.clients.transform(client)
		//console.log("Client record:", record) // debug
		await upsertClient(record)
	}
	for (const prod of safeDelivery.product) {
		const record = dataBaseDb.product.transform(prod)
		//console.log("Produto record:", record) // debug
		await upsertProduct(record)
	}
	for (const order of safeDelivery.orders_shop) {
		const record = dataBaseDb.orders_shop.transform(order)
		//console.log("Order record:", record) // debug
		await upsertRecord(dataBase.orders_shop, record, "order_id")
	}
	for (const coup of safeDelivery.coupons) {
		const record = dataBaseDb.coupon.transform(coup)
		//console.log("Coupon record:", record) // debug
		await upsertCoupon(record, nuvemData.status, nuvemData.number)
	}

	// Dentro de processOrderFromNuvemshop, após o upsert do pedido
	const firstOrder = safeDelivery.orders_shop[0]
	if (firstOrder) {
		const orderDate = nuvemData?.created_at?.split("T")[0]
		const storeId = nuvemData?.store_id?.toString() // "3889735"
		if (orderDate && storeId) {
			// Converte código numérico para nome amigável (ex: "outlet")
			const storeName = storeMapping.numericToName[parseInt(storeId)]
			if (!storeName) {
				console.warn(`Store ${storeId} não mapeado. Anúncios não serão vinculados.`)
			}

			// Busca IDs de anúncios usando o nome amigável
			let adsIds = []
			if (storeName) {
				const adsSql = `SELECT id_ads FROM ${dataBase.ads} WHERE date_ads = $1 AND store = $2`
				const adsResult = await query(adsSql, [orderDate, storeName])
				adsIds = adsResult.rows.map((row) => row.id_ads)
			}

			const currentOrderData = {
				order_id: firstOrder.order_id,
				payment_status: firstOrder.payment_status,
				total: toNumber(firstOrder.total),
				coupons: firstOrder.coupons || [],
				status: nuvemData.status,
				ads_ids: adsIds
			}

			await upsertDailySales(orderDate, storeId, currentOrderData) // storeId é numérico
		}
	}
}

// Função para processar um pedido da Tiny (similar)
export async function processOrderFromTiny(tinyResponse) {

	const idEcom = tinyResponse.pedido.ecommerce.id
	const cpfEcom = cleanCpfCnpj(tinyResponse.pedido.cliente.cpf_cnpj)
	const tinyOrder = await fetchOrderTiny(idEcom, cpfEcom)
	const note = await fetchNoteOrderTiny(idEcom, cpfEcom)
	const tinyNoteOrder = await fetchLinkNote(note.id)

		
	const delivery = await mapTinyToDelivery(tinyResponse)
	/*
	console.log("delivery recebido, tipos:")
	console.log(" - orders_shop:",
		Array.isArray(delivery.orders_shop) ? "array" : typeof delivery.orders_shop)
	console.log(" - clients:",
		Array.isArray(delivery.clients) ? "array" : typeof delivery.clients)
	console.log(" - product:",
		Array.isArray(delivery.product) ? "array" : typeof delivery.product)
	console.log(" - coupons:",
		Array.isArray(delivery.coupons) ? "array" : typeof delivery.coupons)
	console.log(" - ads:",
		Array.isArray(delivery.ads) ? "array" : typeof delivery.ads)
*/
	const safeDelivery = {
		orders_shop: Array.isArray(delivery.orders_shop)
			? delivery.orders_shop
			: [],
		clients: Array.isArray(delivery.clients) ? delivery.clients : [],
		product: Array.isArray(delivery.product) ? delivery.product : [],
		coupons: Array.isArray(delivery.coupons) ? delivery.coupons : [],
		ads: Array.isArray(delivery.ads) ? delivery.ads : []
	}

	// 1. Inserir/atualizar clientes
	for (const client of safeDelivery.clients) {
		const record = dataBaseDb.clients.transform(client)
		await upsertClient(record)
	}

	// 2. Inserir/atualizar produtos
	for (const prod of safeDelivery.product) {
		const record = dataBaseDb.product.transform(prod)
		await upsertProduct(record)
	}

	// 3. Inserir/atualizar pedido (orders_shop)
	const firstOrder = safeDelivery.orders_shop[0]
	if (firstOrder) {
		// Garantir que order_id seja número
		firstOrder.order_id = Number(firstOrder.order_id)
		const fullRecord = dataBaseDb.orders_shop.transform(firstOrder)
		const updateRecord = {
			order_id: firstOrder.order_id,
			products: firstOrder.products,
			shipping_option: firstOrder.shipping_option,
			updated_at: firstOrder.updated_at,
			shipping_status: firstOrder.shipping_status || null
		}
		await upsertOrderShop(updateRecord, fullRecord)
	}

	// 4. Tiny não envia cupons – nada a fazer

	// 5. Atualizar daily_sales (após persistir o pedido)
	if (firstOrder) {
		const pedido = tinyResponse.retorno.pedido
		const dataStr = pedido.data_pedido // "26/01/2026"
		const [dia, mes, ano] = dataStr.split("/")
		const orderDate = `${ano}-${mes}-${dia}`

		// Mapear loja
		const storeName = pedido.ecommerce?.nomeEcommerce?.toLowerCase() // "outletdosquadros"
		let storeNumeric = null
		if (storeName === "outletdosquadros") storeNumeric = 3889735
		else if (storeName === "artepropria") storeNumeric = 1146504
		else {
			storeNumeric = storeMapping.nameToNumeric[storeName]
		}

		if (!storeNumeric) {
			console.warn(`Loja não mapeada: ${storeName}. Usando store original.`)
			storeNumeric = storeName // fallback (pode causar erro, mas prossegue)
		}

		// Buscar IDs de anúncios para a data e loja (nome amigável)
		let adsIds = []
		const storeNameForAds = storeMapping.numericToName[storeNumeric]
		if (storeNameForAds) {
			const adsSql = `SELECT id_ads FROM ${dataBase.ads} WHERE date_ads = $1 AND store = $2`
			const adsResult = await query(adsSql, [orderDate, storeNameForAds])
			adsIds = adsResult.rows.map((row) => row.id_ads)
		}

		// Dados do pedido atual para daily_sales – forçar order_id como número
		const currentOrderData = {
			order_id: Number(firstOrder.order_id),
			payment_status: firstOrder.payment_status || null,
			total: Number(firstOrder.total),
			coupons: Array.isArray(firstOrder.coupons) ? firstOrder.coupons : [],
			status: pedido.situacao === "Cancelado" ? "cancelled" : "open",
			ads_ids: adsIds
		}

		await upsertDailySales(orderDate, storeNumeric, currentOrderData)
	} else {
		console.warn("⚠️ Nenhum pedido encontrado no payload do Tiny.")
	}
}
