import { removeNullFields,toNumber } from "../tools/helpers.js"
import { query } from "../db/db.js"
import { dataBase, storeMapping } from "./dataBaseQueryList.js"
import { logWebhookDB } from "../utils/logger.js"

// Função genérica para upsert (insert or update) baseada em um campo de referência
export async function upsertRecord(tableName, record, referenceField) {
	const cleanRecord = removeNullFields(record)

	const referenceValue = cleanRecord[referenceField]
	if (!referenceValue) {
		throw new Error(`Campo de referência ${referenceField} não encontrado no registro`)
	}

	// 1. Verificar se o registro já existe
	const selectSql = `SELECT * FROM ${tableName} WHERE ${referenceField} = $1`
	const selectResult = await query(selectSql, [referenceValue])

	if (selectResult.rows.length > 0) {
		// 2. Registro existe: fazer UPDATE
		const fields = Object.keys(cleanRecord)
		const setClause = fields
			.map((field, index) => `${field} = $${index + 1}`)
			.join(", ")
		// O campo de referência é incluído no SET, mas também está no WHERE; isso é ok,
		// mas para evitar alterar a chave, podemos removê-lo do SET (opcional).
		// Neste exemplo, mantemos tudo, mas você pode ajustar.
		const values = fields.map((field) => cleanRecord[field])
		const updateSql = `UPDATE ${tableName} SET ${setClause} WHERE ${referenceField} = $${fields.length + 1}`
		// Adiciona o valor da referência no final dos parâmetros
		await query(updateSql, [...values, referenceValue])
		logWebhookDB(`Registro atualizado em ${tableName} com ${referenceField} = ${referenceValue}`)
	} else {
		// 3. Registro não existe: fazer INSERT
		const fields = Object.keys(cleanRecord)
		const placeholders = fields.map((_, index) => `$${index + 1}`).join(", ")
		const insertSql = `INSERT INTO ${tableName} (${fields.join(", ")}) VALUES (${placeholders})`
		const values = fields.map((field) => cleanRecord[field])
		await query(insertSql, values)
		logWebhookDB(`Registro inserido em ${tableName} com ${referenceField} = ${referenceValue}`)
	}
}

/**
 * Upsert (inserir ou atualizar) cliente usando CPF/CNPJ como referência.
 * O campo id_cli é gerado automaticamente pela sequência.
 */
export async function upsertClient(clientRecord) {
	const cleanRecord = removeNullFields(clientRecord)
	const cpf = cleanRecord.cpf_cnpj_cli
	if (!cpf) throw new Error("CPF/CNPJ é obrigatório para upsert de cliente")

	let maxRetries = 3
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			// Verificar se cliente já existe (FOR UPDATE não funciona sem transaction, mas tentamos)
			const selectSql = `SELECT id_cli FROM ${dataBase.clients} WHERE cpf_cnpj_cli = $1`
			const selectResult = await query(selectSql, [cpf])

			if (selectResult.rows.length > 0) {
				const existingId = selectResult.rows[0].id_cli
				// Remove id_cli e mantém os demais campos
				const { id_cli, ...updateFields } = cleanRecord
				const fields = Object.keys(updateFields)
				if (fields.length === 0) return existingId
				const setClause = fields
					.map((field, idx) => `${field} = $${idx + 1}`)
					.join(", ")
				const values = fields.map((f) => updateFields[f])
				const updateSql = `UPDATE ${dataBase.clients} SET ${setClause} WHERE id_cli = $${fields.length + 1}`
				await query(updateSql, [...values, existingId])
				logWebhookDB(`Cliente atualizado: CPF ${cpf}, id_cli ${existingId}`)
				return existingId
			} else {
				// Inserir novo cliente – obtém próximo ID da sequência
				const seqResult = await query("SELECT nextval('clients_id_seq') as new_id")
				const newId = seqResult.rows[0].new_id
				const newRecord = { ...cleanRecord, id_cli: newId }
				const fields = Object.keys(newRecord)
				const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(", ")
				const insertSql = `INSERT INTO ${dataBase.clients} (${fields.join(", ")}) VALUES (${placeholders})`
				const values = fields.map((f) => newRecord[f])
				await query(insertSql, values)
				logWebhookDB(`Cliente inserido: CPF ${cpf}, id_cli ${newId}`)
				return newId
			}
		} catch (error) {
			// Se for erro de violação de unique (código 23505) e ainda há tentativas, aguarda e repete
			if (error.code === "23505" && attempt < maxRetries) {
				logWebhookDB(`Conflito ao inserir/atualizar cliente CPF ${cpf}, tentativa ${attempt} de ${maxRetries}, aguardando...`)
				await new Promise((resolve) => setTimeout(resolve, 100 * attempt))
				continue
			}
			throw error
		}
	}
	throw new Error(`Falha ao upsert cliente após ${maxRetries} tentativas`)
}
/**
 * Upsert específico para orders_shop:
 * - Se o pedido existe: atualiza apenas products, shipping_option, updated_at, shipping_status
 * - Se não existe: insere todos os campos (fullRecord)
 */
export async function upsertOrderShop(updateRecord, fullRecord) {
	const cleanFull = removeNullFields(fullRecord)
	const cleanUpdate = removeNullFields(updateRecord)

	const orderId = cleanUpdate.order_id || cleanFull.order_id
	if (!orderId) throw new Error("order_id é obrigatório")

	const selectSql = `SELECT order_id FROM ${dataBase.orders_shop} WHERE order_id = $1`
	const selectResult = await query(selectSql, [orderId])

	if (selectResult.rows.length > 0) {
		// UPDATE parcial
		const updateSql = `
      UPDATE ${dataBase.orders_shop} 
      SET 
        products = $1,
        shipping_option = $2,
        updated_at = $3,
        shipping_status = $4
      WHERE order_id = $5
		`
		await query(updateSql, [
			JSON.stringify(cleanUpdate.products),
			cleanUpdate.shipping_option,
			cleanUpdate.updated_at,
			cleanUpdate.shipping_status,
			orderId
		])
		logWebhookDB(`Pedido ${orderId} atualizado (parcialmente)`)
	} else {
		// INSERT completo
		const fields = Object.keys(cleanFull)
		const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(", ")
		const insertSql = `INSERT INTO ${dataBase.orders_shop} (${fields.join(", ")}) VALUES (${placeholders})`
		const values = fields.map((f) => cleanFull[f])
		await query(insertSql, values)
		logWebhookDB(`Pedido ${orderId} inserido (completo)`)
	}
}

export async function upsertProduct(record) {
	// Remove campos null
	const cleanRecord = removeNullFields(record)

	cleanRecord.cod_categoria = (cleanRecord.cod_categoria || "").toUpperCase()
	const productId = cleanRecord.cod_categoria
	if (!productId) throw new Error("cod_categoria obrigatório")

	// Verificar existência
	const selectSql = `SELECT * FROM ${dataBase.product} WHERE cod_categoria = $1`
	const selectResult = await query(selectSql, [productId])

	if (selectResult.rows.length === 0) {
		// INSERT apenas com campos não nulos
		const fields = Object.keys(cleanRecord)
		const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(", ")
		const insertSql = `INSERT INTO ${dataBase.product} (${fields.join(", ")}) VALUES (${placeholders})`
		const values = fields.map((f) => cleanRecord[f])
		await query(insertSql, values)
		logWebhookDB(`✅ Produto inserido: ${productId}`)
	} else {
		// Comparar apenas diferenças
		const existing = selectResult.rows[0]
		const changedFields = []
		const updateValues = []

		for (const [key, newValue] of Object.entries(cleanRecord)) {
			if (!existing.hasOwnProperty(key)) continue
			const oldValue = existing[key]
			if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
				changedFields.push(key)
				updateValues.push(newValue)
			}
		}

		if (changedFields.length === 0) {
			logWebhookDB(`⏭️ Produto ${productId} sem alterações`)
			return
		}

		// UPDATE apenas com campos alterados e não nulos
		const setClause = changedFields
			.map((field, idx) => `${field} = $${idx + 1}`)
			.join(", ")
		const updateSql = `UPDATE ${dataBase.product} SET ${setClause} WHERE cod_categoria = $${changedFields.length + 1}`
		updateValues.push(productId)
		await query(updateSql, updateValues)
		logWebhookDB(`🔄 Produto ${productId} atualizado (campos: ${changedFields.join(", ")})`)
	}
}

/**
 * Função auxiliar para atualizar a coluna id_ads na tabela daily_sales
 * @param {string} date - data no formato 'YYYY-MM-DD'
 * @param {string} store - identificador da loja
 */
export async function updateDailySalesWithAds(date, storeName) {
	// Converte o nome amigável (ex: "outlet") para o código numérico usado em daily_sales
	const storeNumeric = storeMapping.nameToNumeric[storeName]
	if (!storeNumeric) {
		console.error(`Store desconhecido: ${storeName}. Não é possível atualizar daily_sales.`)
		return
	}

	// Busca todos os id_ads para esta data e store (texto)
	const adsSql = `SELECT id_ads FROM ${dataBase.ads} WHERE date_ads = $1 AND store = $2`
	const adsResult = await query(adsSql, [date, storeName])
	const adsIds = adsResult.rows.map((row) => row.id_ads)

	// Verifica se já existe daily_sales com o código numérico correspondente
	const checkSql = `SELECT id_sales FROM ${dataBase.daily_sales} WHERE date_sales = $1 AND store = $2`
	const existing = await query(checkSql, [date, storeNumeric])

	if (existing.rows.length > 0) {
		const updateSql = `
            UPDATE ${dataBase.daily_sales}
            SET id_ads = $1, updated_at = $2
            WHERE date_sales = $3 AND store = $4
        `
		await query(updateSql, [JSON.stringify(adsIds), new Date().toISOString(), date, storeNumeric])
		logWebhookDB(`Daily sales atualizado com anúncios: ${date} - ${storeName} (código ${storeNumeric})`)
	} else {
		logWebhookDB(`Nenhum daily_sales encontrado para ${date} - ${storeNumeric}. Ignorar atualização de ads.`)
	}
}

/**
 * Upsert para tabela ads: baseado em date_ads + plataform
 */
export async function upsertAds(record) {
	const { date_ads, plataform, store } = record
	if (!date_ads || !plataform || !store)
		throw new Error("date_ads, plataform e store são obrigatórios")

	// Busca existente por (data, plataforma, loja)
	const selectSql = `SELECT id_ads FROM ${dataBase.ads} WHERE date_ads = $1 AND plataform = $2 AND store = $3`
	const selectResult = await query(selectSql, [date_ads, plataform, store])

	if (selectResult.rows.length > 0) {
		// Atualiza apenas os campos de funding e active (NÃO atualiza 'store')
		const fields = [
			"funding_ecom", "funding_store", "funding_general",
			"funding_chatbot", "funding_insta", "funding_mirror",
			"funding_painting", "active"
		]
		const setClause = fields.map((f, idx) => `${f} = $${idx + 1}`).join(", ")
		const values = fields.map((f) => (record[f] !== undefined ? record[f] : 0))
		// Inclui as condições WHERE com data, plataforma e loja
		const updateSql = `
            UPDATE ${dataBase.ads}
            SET ${setClause}
            WHERE date_ads = $${fields.length + 1}
              AND plataform = $${fields.length + 2}
              AND store = $${fields.length + 3}
        `
		values.push(date_ads, plataform, store)
		await query(updateSql, values)
		logWebhookDB(`Ads atualizado: ${date_ads} / ${plataform} / ${store}`)
	} else {
		// Inserir novo registro
		const seqResult = await query("SELECT nextval('ads_id_seq') as new_id")
		const newId = seqResult.rows[0].new_id
		const newRecord = { ...record, id_ads: newId }
		const fields = Object.keys(newRecord)
		const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(", ")
		const insertSql = `INSERT INTO ${dataBase.ads} (${fields.join(", ")}) VALUES (${placeholders})`
		const values = fields.map((f) => newRecord[f])
		await query(insertSql, values)
		logWebhookDB(`Ads inserido: ${date_ads} / ${plataform} / ${store} (id ${newId})`)
	}

	// Após atualizar, sincroniza daily_sales
	if (store) {
		await updateDailySalesWithAds(date_ads, store)
	}
}

/**
 * Upsert específico para cupons:
 * - Identifica por name + date_coupon
 * - Se existir: acumula valores e adiciona novo order_id (sem duplicar)
 * - Se não: insere novo registro
 */

export async function upsertCoupon(couponRecord, orderStatus, orderId) {
	const { name, date_coupon, total_money, total_discount } = couponRecord
	if (!name || !date_coupon)
		throw new Error("name e date_coupon são obrigatórios")

	const selectSql = `SELECT * FROM ${dataBase.coupon} WHERE name = $1 AND date_coupon = $2`
	const selectResult = await query(selectSql, [name, date_coupon])

	const isCancelled = orderStatus === "cancelled"

	if (selectResult.rows.length === 0) {
		// Cupom não existe
		if (isCancelled) {
			logWebhookDB(`Pedido cancelado e cupom ${name} não existe. Nada a fazer.`)
			return
		}
		// Inserir novo cupom
		const recordToInsert = {
			...couponRecord,
			order_ids: JSON.stringify([orderId])
		}
		const fields = Object.keys(recordToInsert)
		const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(", ")
		const insertSql = `INSERT INTO ${dataBase.coupon} (${fields.join(", ")}) VALUES (${placeholders})`
		const values = fields.map((f) => recordToInsert[f])
		await query(insertSql, values)
		logWebhookDB(`Cupom inserido: ${name} em ${date_coupon}`)
		return
	}

	// Cupom existe
	const existing = selectResult.rows[0]
	let existingOrderIds = []
	if (typeof existing.order_ids === "string") {
		try {
			existingOrderIds = JSON.parse(existing.order_ids)
		} catch (e) {
			existingOrderIds = []
		}
	} else if (Array.isArray(existing.order_ids)) {
		existingOrderIds = existing.order_ids
	}
	existingOrderIds = existingOrderIds.map((id) =>
		typeof id === "string" ? Number(id) : id)
	const alreadyHasOrder = existingOrderIds.includes(orderId)

	if (isCancelled) {
		if (!alreadyHasOrder) {
			logWebhookDB(`Pedido cancelado mas order_id ${orderId} não está no cupom ${name}. Nada a fazer.`)
			return
		}
		const newOrderIds = existingOrderIds.filter((id) => id !== orderId)
		if (newOrderIds.length === 0) {
			await query(`DELETE FROM ${dataBase.coupon} WHERE name = $1 AND date_coupon = $2`,
				[name, date_coupon])
			logWebhookDB(`Cupom ${name} removido (nenhum pedido restante)`)
		} else {
			const newTotalMoney =
        (parseFloat(existing.total_money) || 0) -
        (parseFloat(total_money) || 0)
			const newTotalDiscount =
        (parseFloat(existing.total_discount) || 0) -
        (parseFloat(total_discount) || 0)
			await query(`
				UPDATE ${dataBase.coupon} 
				SET quantity = $1, total_money = $2, total_discount = $3, order_ids = $4 
				WHERE name = $5 AND date_coupon = $6`,
			[
				newOrderIds.length,
				newTotalMoney,
				newTotalDiscount,
				JSON.stringify(newOrderIds),
				name,
				date_coupon
			])
			logWebhookDB(`Cupom ${name} atualizado (cancelamento): order_id ${orderId} removido`)
		}
		return
	}

	// Pedido NÃO cancelado
	if (alreadyHasOrder) {
		logWebhookDB(`Cupom ${name} já possui order_id ${orderId}. Nenhuma alteração.`)
		return
	}

	const newOrderIds = [...existingOrderIds, orderId]
	const newTotalMoney =
    (parseFloat(existing.total_money) || 0) + (parseFloat(total_money) || 0)
	const newTotalDiscount =
    (parseFloat(existing.total_discount) || 0) +
    (parseFloat(total_discount) || 0)
	await query(`
		UPDATE ${dataBase.coupon} 
		SET quantity = $1, total_money = $2, total_discount = $3, order_ids = $4
		WHERE name = $5 AND date_coupon = $6`,
	[
		newOrderIds.length,
		newTotalMoney,
		newTotalDiscount,
		JSON.stringify(newOrderIds),
		name,
		date_coupon
	])
	logWebhookDB(`Cupom ${name} atualizado: adicionado order_id ${orderId}`)
}

/**
 * Atualiza a tabela daily_sales de forma incremental:
 * - Se não existe linha para (date, store), cria com os dados do pedido atual.
 * - Se existe e pedido ainda não contabilizado, soma valores e adiciona order_id.
 * - Se pedido cancelado e já contabilizado, subtrai valores e remove order_id.
 * @param {string} date - data 'YYYY-MM-DD'
 * @param {string} store - identificador da loja
 * @param {Object} currentOrder - { order_id, payment_status, total, coupons, status }
 */
export async function upsertDailySales(date, store, currentOrder) {
	if (!date || !store || !currentOrder) {
		console.error("❌ upsertDailySales: parâmetros inválidos", { date, store, currentOrder })
		return
	}
	const selectSql = `SELECT * FROM ${dataBase.daily_sales} WHERE date_sales = $1 AND store = $2`
	const existing = await query(selectSql, [date, store])
	const row = existing.rows[0]
	const now = new Date().toISOString()
	const isCancelled = (currentOrder.status === "cancelled")

	if (!row && isCancelled) {
		logWebhookDB(`Pedido cancelado e não há daily_sales para ${date} - ${store}. Ignorar.`)
		return
	}

	// Inserção de novo registro
	if (!row) {
		const data = {
			date_sales: date,
			total_orders: 1,
			total_paid_orders: currentOrder.payment_status === "paid" ? 1 : 0,
			total_money: toNumber(currentOrder.total),
			total_paid_money: currentOrder.payment_status === "paid" ? toNumber(currentOrder.total) : 0,
			aov: toNumber(currentOrder.total),
			id_ads: JSON.stringify(currentOrder.ads_ids || []),
			store: store,
			id_orders: JSON.stringify([currentOrder.order_id]),
			id_coupons: JSON.stringify(currentOrder.coupons || []),
			active: 1,
			dt_att_active: now.split("T")[0],
			created_at: now,
			updated_at: now
		}
		const fields = Object.keys(data)
		const placeholders = fields.map((_, i) => `$${i+1}`).join(", ")
		const insertSql = `INSERT INTO ${dataBase.daily_sales} (${fields.join(", ")}) VALUES (${placeholders})`
		await query(insertSql, fields.map((f) => data[f]))
		logWebhookDB(`✅ Daily sales inserido (novo pedido): ${date} - ${store}`)
		return
	}

	// Linha existe – processar atualização
	let id_orders = []
	let id_coupons = []
	let id_ads = []
	try {
		id_orders = typeof row.id_orders === "string" ? JSON.parse(row.id_orders) : row.id_orders 
	} catch(e) {
		id_orders = [] 
	}
	try {
		id_coupons = typeof row.id_coupons === "string" ? JSON.parse(row.id_coupons) : row.id_coupons 
	} catch(e) {
		id_coupons = [] 
	}
	try {
		id_ads = typeof row.id_ads === "string" ? JSON.parse(row.id_ads) : row.id_ads 
	} catch(e) {
		id_ads = [] 
	}

	const orderId = currentOrder.order_id
	const alreadyExists = id_orders.includes(orderId)

	// Cancelamento
	if (isCancelled && alreadyExists) {
		const newIdOrders = id_orders.filter((id) => id !== orderId)
		const newTotalOrders = row.total_orders - 1
		const newTotalMoney = toNumber(row.total_money) - toNumber(currentOrder.total)
		const newTotalPaidOrders = (currentOrder.payment_status === "paid") ? row.total_paid_orders - 1 : row.total_paid_orders
		const newTotalPaidMoney = (currentOrder.payment_status === "paid") ? toNumber(row.total_paid_money) - toNumber(currentOrder.total) : row.total_paid_money
		const newAov = newTotalOrders > 0 ? newTotalMoney / newTotalOrders : 0

		if (newTotalOrders === 0) {
			await query(`DELETE FROM ${dataBase.daily_sales} WHERE date_sales = $1 AND store = $2`, [date, store])
			logWebhookDB(`🗑️ Daily sales removido (sem pedidos): ${date} - ${store}`)
		} else {
			await query(`
                UPDATE ${dataBase.daily_sales}
                SET total_orders = $1, total_paid_orders = $2, total_money = $3,
                    total_paid_money = $4, aov = $5, id_orders = $6, updated_at = $7
                WHERE date_sales = $8 AND store = $9
            `, [newTotalOrders, newTotalPaidOrders, newTotalMoney, newTotalPaidMoney,
				newAov, JSON.stringify(newIdOrders), now, date, store])
			logWebhookDB(`🔄 Daily sales atualizado (cancelamento): ${date} - ${store}, removido pedido ${orderId}`)
		}
		return
	}

	// Pedido normal já contabilizado
	if (alreadyExists) {
		logWebhookDB(`Pedido ${orderId} já contabilizado. Ignorar.`)
		return
	}

	// Pedido normal não contabilizado – adicionar
	const newIdOrders = [...id_orders, orderId]
	const newTotalOrders = row.total_orders + 1
	const newTotalMoney = toNumber(row.total_money) + toNumber(currentOrder.total)
	const newTotalPaidOrders = (currentOrder.payment_status === "paid") ? row.total_paid_orders + 1 : row.total_paid_orders
	const newTotalPaidMoney = (currentOrder.payment_status === "paid") ? toNumber(row.total_paid_money) + toNumber(currentOrder.total) : row.total_paid_money
	const newAov = newTotalMoney / newTotalOrders

	// Mesclar cupons (buscar IDs numéricos)
	let numericCouponIds = []
	for (const name of (currentOrder.coupons || [])) {
		const couponSql = `SELECT id_coupon FROM ${dataBase.coupon} WHERE name = $1 AND date_coupon = $2`
		const couponRes = await query(couponSql, [name, date])
		if (couponRes.rows.length) numericCouponIds.push(couponRes.rows[0].id_coupon)
	}
	const newIdCoupons = [...new Set([...id_coupons, ...numericCouponIds])]

	// Mesclar anúncios
	const newIdAds = [...new Set([...id_ads, ...(currentOrder.ads_ids || [])])]

	await query(`
        UPDATE ${dataBase.daily_sales}
        SET total_orders = $1, total_paid_orders = $2, total_money = $3,
            total_paid_money = $4, aov = $5, id_orders = $6, id_coupons = $7,
            id_ads = $8, updated_at = $9
        WHERE date_sales = $10 AND store = $11
    `, [newTotalOrders, newTotalPaidOrders, newTotalMoney, newTotalPaidMoney,
		newAov, JSON.stringify(newIdOrders), JSON.stringify(newIdCoupons),
		JSON.stringify(newIdAds), now, date, store])
	logWebhookDB(`✅ Daily sales atualizado (novo pedido): ${date} - ${store}, adicionado ${orderId}`)
}