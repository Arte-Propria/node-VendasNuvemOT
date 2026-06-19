/**
 * Script de migração ÚNICA para a tabela `coupon`.
 *
 * Objetivos:
 *  1. Garantir a coluna `store` (ALTER TABLE ... ADD COLUMN IF NOT EXISTS).
 *  2. Corrigir os campos quantity, total_money, total_discount e store de cada cupom
 *     a partir da fonte da verdade (orders_shop):
 *        - quantity      = nº de pedidos em order_ids
 *        - total_money   = soma do `total` das vendas que usaram o cupom
 *        - total_discount = soma do `coupon_discount` desses pedidos
 *        - store         = nome amigável da loja do 1º pedido (ex.: "outlet")
 *
 * Executar UMA ÚNICA VEZ, após backup:
 *     node src/db/migrateCouponData.js
 *
 * Tudo roda dentro de UMA transação (BEGIN/COMMIT) — em qualquer erro faz ROLLBACK.
 */
import { pool } from "./db.js"
import { dataBase, storeMapping } from "./dataBaseQueryList.js"
import { parseJsonArray, toNumber } from "../tools/helpers.js"

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100

export async function migrateCouponData() {
	const client = await pool.connect()
	let updated = 0
	let skipped = 0
	try {
		await client.query("BEGIN")

		// 1. Garante a coluna `store`
		await client.query(`ALTER TABLE ${dataBase.coupon} ADD COLUMN IF NOT EXISTS store TEXT`)

		// 2. Percorre todos os cupons
		const allCoupons = await client.query(`SELECT * FROM ${dataBase.coupon}`)
		console.log(`Iniciando migração de ${allCoupons.rows.length} cupons...`)

		for (const coupon of allCoupons.rows) {
			const orderIds = parseJsonArray(coupon.order_ids).map(Number).filter((n) => !Number.isNaN(n))
			const quantity = orderIds.length
			if (quantity === 0) {
				skipped++
				continue
			}

			// Busca os pedidos correspondentes para obter totais, descontos e loja
			const orders = await client.query(
				`SELECT order_id, total, subtotal, coupon_discount, store
				   FROM ${dataBase.orders_shop}
				  WHERE order_id = ANY($1)`,
				[orderIds]
			)
			if (orders.rows.length === 0) {
				console.warn(`Cupom id ${coupon.id_coupon} (${coupon.name}): nenhum pedido encontrado em orders_shop. Pulando.`)
				skipped++
				continue
			}

			// total_money = soma do total das vendas; total_discount = soma dos descontos
			const totalMoney = orders.rows.reduce((sum, o) => sum + toNumber(o.total), 0)
			const totalDiscount = orders.rows.reduce((sum, o) => sum + toNumber(o.coupon_discount), 0)

			// store: nome amigável a partir do código numérico do 1º pedido (fallback: valor bruto)
			const rawStore = orders.rows[0].store
			const store = storeMapping.numericToName[Number(rawStore)] || (rawStore != null ? String(rawStore) : null)

			await client.query(
				`UPDATE ${dataBase.coupon}
				    SET quantity = $1, total_money = $2, total_discount = $3, store = $4
				  WHERE id_coupon = $5`,
				[quantity, round2(totalMoney), round2(totalDiscount), store, coupon.id_coupon]
			)
			updated++
		}

		await client.query("COMMIT")
		console.log(`✅ Migração de cupons concluída. Atualizados: ${updated}, Pulados: ${skipped}`)
		return { updated, skipped }
	} catch (err) {
		await client.query("ROLLBACK")
		console.error("❌ Erro na migração de cupons (ROLLBACK aplicado):", err)
		throw err
	} finally {
		client.release()
	}
}

// Permite executar diretamente via `node src/db/migrateCouponData.js`
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/db/migrateCouponData.js")
if (isMain) {
	migrateCouponData()
		.then(() => process.exit(0))
		.catch(() => process.exit(1))
}
