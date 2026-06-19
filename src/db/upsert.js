import { removeNullFields, toNumber, parseJsonArray } from "../tools/helpers.js"
import { query } from "../db/db.js"
import { dataBase, storeMapping } from "./dataBaseQueryList.js"
import { logWebhookDB } from "../utils/logger.js"

// Q2: só permitimos operar nas tabelas conhecidas e validamos os identificadores SQL,
// já que tableName/campos são interpolados na query (defesa contra injeção caso algum
// dia cheguem de input externo).
const ALLOWED_TABLES = new Set(Object.values(dataBase))
const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function assertValidIdentifier(name) {
	if (!IDENTIFIER_REGEX.test(name)) {
		throw new Error(`Identificador SQL inválido: ${name}`)
	}
}

// Função genérica para upsert (insert or update) baseada em um campo de referência
export async function upsertRecord(tableName, record, referenceField) {
	if (!ALLOWED_TABLES.has(tableName)) {
		throw new Error(`Tabela não permitida em upsertRecord: ${tableName}`)
	}
	assertValidIdentifier(referenceField)

	const cleanRecord = removeNullFields(record)
	Object.keys(cleanRecord).forEach(assertValidIdentifier)

	const referenceValue = cleanRecord[referenceField]
	if (!referenceValue) {
		throw new Error(`Campo de referência ${referenceField} não encontrado no registro`)
	}

	// Q5: corrida SELECT→INSERT — em conflito de unique (23505) tentamos de novo;
	// na 2ª volta o registro já existe e cai no UPDATE.
	const maxRetries = 3
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			// 1. Verificar se o registro já existe
			const selectSql = `SELECT 1 FROM ${tableName} WHERE ${referenceField} = $1`
			const selectResult = await query(selectSql, [referenceValue])

			if (selectResult.rows.length > 0) {
				// 2. Registro existe: UPDATE (sem alterar a própria chave de referência)
				const fields = Object.keys(cleanRecord).filter((f) => f !== referenceField)
				if (fields.length === 0) {
					logWebhookDB(`Registro em ${tableName} (${referenceField}=${referenceValue}) sem campos para atualizar`)
					return
				}
				const setClause = fields
					.map((field, index) => `${field} = $${index + 1}`)
					.join(", ")
				const values = fields.map((field) => cleanRecord[field])
				const updateSql = `UPDATE ${tableName} SET ${setClause} WHERE ${referenceField} = $${fields.length + 1}`
				await query(updateSql, [...values, referenceValue])
				logWebhookDB(`Registro atualizado em ${tableName} com ${referenceField} = ${referenceValue}`)
			} else {
				// 3. Registro não existe: INSERT
				const fields = Object.keys(cleanRecord)
				const placeholders = fields.map((_, index) => `$${index + 1}`).join(", ")
				const insertSql = `INSERT INTO ${tableName} (${fields.join(", ")}) VALUES (${placeholders})`
				const values = fields.map((field) => cleanRecord[field])
				await query(insertSql, values)
				logWebhookDB(`Registro inserido em ${tableName} com ${referenceField} = ${referenceValue}`)
			}
			return
		} catch (error) {
			if (error.code === "23505" && attempt < maxRetries) {
				logWebhookDB(`Conflito de chave em ${tableName} (${referenceField}=${referenceValue}), tentativa ${attempt}/${maxRetries}...`)
				await new Promise((resolve) => setTimeout(resolve, 100 * attempt))
				continue
			}
			throw error
		}
	}
	throw new Error(`Falha ao upsert em ${tableName} após ${maxRetries} tentativas`)
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
		// ---- UPDATE PARCIAL ----
		// Lista de campos que podem ser atualizados após a criação do pedido
		const updatableFields = [
			"products", "shipping_option", "updated_at", "shipping_status",
			"url_tracking", "markers_order_tiny", "fiscal_note",
			"estimated_delivery", "shipping_cost", "active"
		]
		// Filtra quais campos estão presentes em cleanUpdate
		const fieldsToUpdate = updatableFields.filter((f) => cleanUpdate[f] !== undefined)
		if (fieldsToUpdate.length === 0) {
			console.log(`Nenhum campo atualizável para o pedido ${orderId}.`)
			return
		}
		// Prepara valores e cláusula SET
		const setClauses = []
		const values = []
		fieldsToUpdate.forEach((field, idx) => {
			setClauses.push(`${field} = $${idx + 1}`)
			let value = cleanUpdate[field]
			// Tratamento especial para campos JSON/JSONB
			if (field === "products" || field === "markers_order_tiny") {
				value = JSON.stringify(value)
			}
			values.push(value)
		})
		values.push(orderId) // para a cláusula WHERE
		const setClause = setClauses.join(", ")
		const updateSql = `UPDATE ${dataBase.orders_shop} SET ${setClause} WHERE order_id = $${fieldsToUpdate.length + 1}`
		await query(updateSql, values)
		console.log(`Pedido ${orderId} atualizado (campos: ${fieldsToUpdate.join(", ")})`)
	} else {
		// ---- INSERT COMPLETO ----
		const fields = Object.keys(cleanFull)
		const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(", ")
		const insertSql = `INSERT INTO ${dataBase.orders_shop} (${fields.join(", ")}) VALUES (${placeholders})`
		const values = fields.map((f) => cleanFull[f])
		await query(insertSql, values)
		console.log(`Pedido ${orderId} inserido (completo)`)
	}
}

export async function upsertProduct(record) {
	// Normaliza o código da categoria (maiúsculo, sem espaços nas extremidades)
	let cod = record.cod_categoria ? record.cod_categoria.trim().toUpperCase() : null
	if (!cod) throw new Error("cod_categoria é obrigatório para upsert de produto")

	// Remove campos nulos e undefined
	const cleanRecord = removeNullFields(record)
	cleanRecord.cod_categoria = cod

	// 1. Verificar se já existe um produto com este código
	const selectSql = `SELECT * FROM ${dataBase.product} WHERE cod_categoria = $1`
	const selectResult = await query(selectSql, [cod])

	if (selectResult.rows.length > 0) {
		// Produto existe → atualizar apenas os campos que vieram com valor diferente
		const existing = selectResult.rows[0]
		const changedFields = []
		const updateValues = []

		// B3: timestamps mudam a cada chamada → não entram na detecção de mudança;
		// campos numéricos são comparados como número ("0" vs "0.00" não é mudança real).
		const timestampFields = new Set(["dt_att_ativo", "dt_att_categoria"])
		const numericFields = new Set(["custo_categoria", "preco", "ativo", "tempo_prod_categoria"])

		for (const [key, newValue] of Object.entries(cleanRecord)) {
			if (key === "cod_categoria") continue // não atualiza a chave
			if (timestampFields.has(key)) continue // tratados abaixo, só se houver mudança real
			const oldValue = existing[key]
			let changed
			if (numericFields.has(key)) {
				changed = toNumber(newValue) !== toNumber(oldValue)
			} else {
				const newStr = (newValue === null || newValue === undefined) ? "" : String(newValue)
				const oldStr = (oldValue === null || oldValue === undefined) ? "" : String(oldValue)
				changed = newStr !== oldStr
			}
			if (changed) {
				changedFields.push(key)
				updateValues.push(newValue)
			}
		}

		if (changedFields.length === 0) {
			console.log(`Produto ${cod} sem alterações, skip update`)
			return
		}

		// Houve mudança real → atualiza também a data de modificação da categoria
		if (cleanRecord.dt_att_categoria !== undefined) {
			changedFields.push("dt_att_categoria")
			updateValues.push(cleanRecord.dt_att_categoria)
		}
		// Se o status "ativo" mudou, atualiza também a data desse status
		if (changedFields.includes("ativo") && cleanRecord.dt_att_ativo !== undefined) {
			changedFields.push("dt_att_ativo")
			updateValues.push(cleanRecord.dt_att_ativo)
		}

		const setClause = changedFields.map((f, idx) => `${f} = $${idx + 1}`).join(", ")
		const updateSql = `UPDATE ${dataBase.product} SET ${setClause} WHERE cod_categoria = $${changedFields.length + 1}`
		updateValues.push(cod)
		await query(updateSql, updateValues)
		console.log(`Produto ${cod} atualizado (campos: ${changedFields.join(", ")})`)
	} else {
		// 2. Não existe → inserir
		const fields = Object.keys(cleanRecord)
		const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(", ")
		const insertSql = `INSERT INTO ${dataBase.product} (${fields.join(", ")}) VALUES (${placeholders})`
		const values = fields.map((f) => cleanRecord[f])
		await query(insertSql, values)
		console.log(`✅ Produto inserido: ${cod}`)
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

	// Q5: corrida na chave (date_ads, plataform, store) — em conflito de unique tenta de novo
	const maxRetries = 3
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
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
			break
		} catch (error) {
			if (error.code === "23505" && attempt < maxRetries) {
				logWebhookDB(`Conflito ao upsert ads ${date_ads}/${plataform}/${store}, tentativa ${attempt}/${maxRetries}...`)
				await new Promise((resolve) => setTimeout(resolve, 100 * attempt))
				continue
			}
			throw error
		}
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
	const { name, date_coupon, total_money, total_discount, store } = couponRecord
	if (!name || !date_coupon) throw new Error("name e date_coupon são obrigatórios")

	const isCancelled = orderStatus === "cancelled"
	const newOrderId = Number(orderId)
	// total_money = valor total da venda (acumula por pedido);
	// total_discount = VALOR do cupom (propriedade fixa, ex.: 10.00 → não acumula).
	const newMoney = Number(total_money) || 0
	const newDiscount = Number(total_discount) || 0
	const newStore = store ?? null

	// Se for cancelado, primeiro buscamos o cupom existente para remover o order_id
	if (isCancelled) {
		const selectSql = `
		  SELECT order_ids, total_money, total_discount FROM ${dataBase.coupon}
		  WHERE name = $1 AND date_coupon = $2
		`
		const res = await query(selectSql, [name, date_coupon])
		if (res.rows.length === 0) {
			console.log(`Cancelamento: cupom ${name} não existe. Nada a fazer.`)
			return
		}
		// C1: order_ids é JSONB → o driver pg pode retornar array já parseado (ou string em TEXT)
		const orderIds = parseJsonArray(res.rows[0].order_ids)
		if (!orderIds.includes(newOrderId)) {
			console.log(`Cancelamento: order_id ${newOrderId} não está no cupom. Ignorar.`)
			return
		}
		const newOrderIds = orderIds.filter((id) => id !== newOrderId)
		if (newOrderIds.length === 0) {
			await query(`DELETE FROM ${dataBase.coupon} WHERE name = $1 AND date_coupon = $2`, [name, date_coupon])
			console.log(`Cupom ${name} removido (sem pedidos restantes)`)
		} else {
			const newQuantity = newOrderIds.length
			const newTotalMoney = Number(res.rows[0].total_money) - newMoney
			// total_discount é o valor (fixo) do cupom → permanece inalterado no cancelamento.
			const newTotalDiscount = Number(res.rows[0].total_discount)
			await query(`UPDATE ${dataBase.coupon}
                 SET quantity = $1, total_money = $2, total_discount = $3, order_ids = $4
                 WHERE name = $5 AND date_coupon = $6`,
			[newQuantity, newTotalMoney, newTotalDiscount, JSON.stringify(newOrderIds), name, date_coupon])
			console.log(`Cupom ${name} atualizado (cancelamento): removido order_id ${newOrderId}`)
		}
		return
	}

	// Pedido normal – usar ON CONFLICT.
	// B2: só acumula valores/quantidade se este order_id ainda NÃO estiver contabilizado
	// (WHERE NOT order_ids @> [orderId]) → reenvio do mesmo pedido vira no-op (idempotente).
	const insertSql = `
        INSERT INTO ${dataBase.coupon} (date_coupon, name, quantity, total_money, total_discount, order_ids, store)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (name, date_coupon) DO UPDATE
        SET quantity = ${dataBase.coupon}.quantity + EXCLUDED.quantity,
            total_money = ${dataBase.coupon}.total_money + EXCLUDED.total_money,
            total_discount = EXCLUDED.total_discount,
            store = COALESCE(${dataBase.coupon}.store, EXCLUDED.store),
            order_ids = (
                SELECT jsonb_agg(DISTINCT elem)
                FROM (
                    SELECT jsonb_array_elements(${dataBase.coupon}.order_ids) AS elem
                    UNION ALL
                    SELECT jsonb_array_elements(EXCLUDED.order_ids)
                ) AS combined
            )
        WHERE NOT (${dataBase.coupon}.order_ids @> EXCLUDED.order_ids)
        RETURNING id_coupon
    `
	try {
		const result = await query(insertSql, [
			date_coupon, name, 1, newMoney, newDiscount, JSON.stringify([newOrderId]), newStore
		])
		if (result.rows.length === 0) {
			console.log(`Cupom ${name}: pedido ${newOrderId} já contabilizado, sem alteração (idempotente).`)
		} else {
			console.log(`Cupom ${name} inserido/atualizado. id_coupon: ${result.rows[0].id_coupon}`)
		}
	} catch (error) {
		console.error(`Erro no upsert do cupom ${name}:`, error)
		throw error
	}
}

/**
 * Resolve os IDs numéricos (id_coupon) a partir dos nomes/códigos de cupom para uma data.
 * C2: garante que daily_sales.id_coupons guarde SEMPRE IDs numéricos (tanto na inserção
 * quanto no update), e não os códigos do cupom.
 */
async function resolveCouponIds(couponNames, date) {
	const ids = []
	for (const name of (couponNames || [])) {
		const res = await query(
			`SELECT id_coupon FROM ${dataBase.coupon} WHERE name = $1 AND date_coupon = $2`,
			[name, date]
		)
		if (res.rows.length) ids.push(res.rows[0].id_coupon)
	}
	return ids
}

/**
 * Recalcula os totais de daily_sales (date, store) a partir de orders_shop, sobre um conjunto
 * conhecido de order_ids. É idempotente e reflete o estado ATUAL de cada pedido — capturando
 * transições pending→paid, cancelamentos (active=0) e reenvios de webhook, sem deltas frágeis.
 * Regra Bruto/Pago: BRUTO = todos os pedidos; PAGO = payment_status='paid' E active=1.
 */
async function recomputeDailyTotalsFromOrders(date, store, orderIds, idCoupons, idAds, now) {
	const ids = [...new Set((orderIds || []).map(Number))].filter((x) => !Number.isNaN(x))
	if (ids.length === 0) {
		await query(`DELETE FROM ${dataBase.daily_sales} WHERE date_sales = $1 AND store = $2`, [date, store])
		logWebhookDB(`🗑️ Daily sales removido (sem pedidos): ${date} - ${store}`)
		return
	}
	const res = await query(
		`SELECT order_id, total, payment_status, active FROM ${dataBase.orders_shop} WHERE order_id = ANY($1)`,
		[ids]
	)
	const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100
	let totalMoney = 0, paidMoney = 0, paidOrders = 0
	const presentIds = []
	for (const r of res.rows) {
		const t = toNumber(r.total)
		totalMoney += t                                  // bruto: todos os pedidos
		presentIds.push(Number(r.order_id))
		if (r.payment_status === "paid" && Number(r.active) === 1) { paidMoney += t; paidOrders++ }
	}
	const totalOrders = presentIds.length
	const aov = totalOrders ? round2(totalMoney / totalOrders) : 0
	await query(`
        UPDATE ${dataBase.daily_sales}
        SET total_orders = $1, total_paid_orders = $2, total_money = $3, total_paid_money = $4,
            aov = $5, id_orders = $6, id_coupons = $7, id_ads = $8, updated_at = $9
        WHERE date_sales = $10 AND store = $11
    `, [totalOrders, paidOrders, round2(totalMoney), round2(paidMoney), aov,
		JSON.stringify(presentIds), JSON.stringify(idCoupons || []), JSON.stringify(idAds || []),
		now, date, store])
}

/**
 * Atualiza daily_sales a cada pedido recebido (semântica "Bruto / Pago", dia de negócio BRT):
 * - Linha inexistente: cria a partir do pedido atual.
 * - Linha existente: RECALCULA o dia a partir de orders_shop sobre o conjunto de order_ids
 *   (idempotente; captura pending→paid, cancelamentos e reenvios).
 * BRUTO = todos os pedidos (inclui cancelado/pendente); PAGO = pago E não cancelado (active=1).
 * @param {string} date - data 'YYYY-MM-DD' (dia de negócio BRT)
 * @param {string} store - identificador da loja
 * @param {Object} currentOrder - { order_id, payment_status, total, coupons, status, ads_ids }
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

	// Semântica "Bruto / Pago": o pedido conta no BRUTO sempre; no PAGO só se pago e não cancelado.
	const isPaidContribution = currentOrder.payment_status === "paid" && !isCancelled
	// Cupons/anúncios a incorporar (cancelado não traz cupom)
	const incomingCouponIds = isCancelled ? [] : await resolveCouponIds(currentOrder.coupons, date)
	const incomingAds = currentOrder.ads_ids || []

	// Inserção de novo registro
	if (!row) {
		const data = {
			date_sales: date,
			total_orders: 1,
			total_paid_orders: isPaidContribution ? 1 : 0,
			total_money: toNumber(currentOrder.total),
			total_paid_money: isPaidContribution ? toNumber(currentOrder.total) : 0,
			aov: toNumber(currentOrder.total),
			id_ads: JSON.stringify(incomingAds),
			store: store,
			id_orders: JSON.stringify([currentOrder.order_id]),
			id_coupons: JSON.stringify(incomingCouponIds),
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

	// Linha existe – RECALCULA o dia a partir de orders_shop sobre o conjunto de pedidos.
	// (orders_shop já foi atualizado com o pedido atual antes desta chamada.)
	// Idempotente: captura pending→paid, cancelamentos (active=0) e reenvios de webhook.
	const id_orders = parseJsonArray(row.id_orders).map(Number)
	const id_coupons = parseJsonArray(row.id_coupons)
	const id_ads = parseJsonArray(row.id_ads)

	const orderId = Number(currentOrder.order_id)
	const newIds = [...new Set([...id_orders, orderId])]
	const newCoupons = [...new Set([...id_coupons, ...incomingCouponIds])]
	const newAds = [...new Set([...id_ads, ...incomingAds])]

	await recomputeDailyTotalsFromOrders(date, store, newIds, newCoupons, newAds, now)
	logWebhookDB(`🔄 Daily sales recalculado de orders_shop: ${date} - ${store} (gatilho: pedido ${orderId})`)
}