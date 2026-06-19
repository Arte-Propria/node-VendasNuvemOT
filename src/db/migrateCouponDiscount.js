/**
 * Script de migração ÚNICA: corrige `coupon.total_discount` para o VALOR do cupom
 * (campo `value` da API de cupons da Nuvemshop, ex.: "10.00" para um cupom de 10%),
 * em vez da soma dos descontos aplicados.
 *
 * Como o `value` não existe em orders_shop, é buscado na API de cupons de cada loja
 * (fetchCoupons) e casado por (store, code).
 *
 * Uso (após backup):  node src/db/migrateCouponDiscount.js
 * Aceita --dry-run para apenas relatar a cobertura sem gravar.
 *
 * Observações:
 *  - Usa o `value` ATUAL do cupom na Nuvemshop; se o valor mudou ao longo do tempo,
 *    as linhas históricas recebem o valor atual.
 *  - Cupons que não existem mais na API (ex.: deletados) ficam inalterados e são contados.
 */
import { pool } from "./db.js"
import { dataBase } from "./dataBaseQueryList.js"
import { fetchCoupons } from "../services/couponServices.js"
import { toNumber } from "../tools/helpers.js"

const STORES = ["outlet", "artepropria"]

async function buildValueMap() {
	// Mapa `${store}::${code}` -> value, e fallback `${code}` -> value
	const byStoreCode = new Map()
	const byCode = new Map()
	for (const store of STORES) {
		const coupons = await fetchCoupons({ store })
		for (const c of coupons) {
			const v = toNumber(c.value)
			byStoreCode.set(`${store}::${c.code}`, v)
			byCode.set(c.code, v) // último vence; usado só como fallback
		}
		console.log(`Loja ${store}: ${coupons.length} cupons carregados da API`)
	}
	return { byStoreCode, byCode }
}

function resolveValue(maps, store, code) {
	const key = `${store}::${code}`
	if (maps.byStoreCode.has(key)) return maps.byStoreCode.get(key)
	if (maps.byCode.has(code)) return maps.byCode.get(code) // fallback entre lojas
	return undefined
}

export async function migrateCouponDiscount({ dryRun = false } = {}) {
	const maps = await buildValueMap()

	const client = await pool.connect()
	let updated = 0
	let unmatched = 0
	const unmatchedCodes = new Set()
	try {
		await client.query("BEGIN")
		const rows = await client.query(`SELECT id_coupon, name, store FROM ${dataBase.coupon}`)
		console.log(`Processando ${rows.rows.length} cupons (dryRun=${dryRun})...`)

		for (const r of rows.rows) {
			const value = resolveValue(maps, r.store, r.name)
			if (value === undefined) {
				unmatched++
				unmatchedCodes.add(r.name)
				continue
			}
			if (!dryRun) {
				await client.query(
					`UPDATE ${dataBase.coupon} SET total_discount = $1 WHERE id_coupon = $2`,
					[value, r.id_coupon]
				)
			}
			updated++
		}

		if (dryRun) {
			await client.query("ROLLBACK")
			console.log(`🔎 DRY-RUN: seriam atualizados ${updated}; não encontrados ${unmatched}`)
		} else {
			await client.query("COMMIT")
			console.log(`✅ total_discount migrado. Atualizados: ${updated}, Não encontrados: ${unmatched}`)
		}
		if (unmatchedCodes.size) {
			console.log(`Códigos sem valor na API (${unmatchedCodes.size}): ${[...unmatchedCodes].join(", ")}`)
		}
		return { updated, unmatched, unmatchedCodes: [...unmatchedCodes] }
	} catch (err) {
		await client.query("ROLLBACK")
		console.error("❌ Erro na migração de total_discount (ROLLBACK aplicado):", err)
		throw err
	} finally {
		client.release()
	}
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/db/migrateCouponDiscount.js")
if (isMain) {
	const dryRun = process.argv.includes("--dry-run")
	migrateCouponDiscount({ dryRun })
		.then(() => process.exit(0))
		.catch(() => process.exit(1))
}
