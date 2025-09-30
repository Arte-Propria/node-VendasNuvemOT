/* eslint-disable camelcase */
import { query } from "../db/db.js"
import { logAdsMarketplace } from "../utils/logger.js"

export const processAdsMarketplace = async (body) => {
	try {
		const adsExists = await getAdsMarketplace(body)
		if (adsExists) {
			logAdsMarketplace(`Anúncio marketplace já existe: ${body.ad_id}, usuário: ${body.user}`)
			return {
				message: "Anúncio marketplace já existe",
				success: false,
				ads: adsExists
			}
		}

		const ads = await saveAdsMarketplace(body)
		logAdsMarketplace(`Anúncio marketplace salvo: ${ads.ad_id}, usuário: ${body.user}`)
		return {
			message: "Anúncio marketplace salvo com sucesso",
			success: true,
			ads
		}
	} catch (error) {
		console.error(error)
		throw error
	}
}

const getAdsMarketplace = async (body) => {
	const { order_at, ad_id } = body
	const queryString = `
		SELECT * FROM anuncios_marketplace WHERE order_at = $1 AND ad_id = $2
	`
	const values = [order_at, ad_id]
	const result = await query(queryString, values)
	return result.rows[0]
}

const saveAdsMarketplace = async (body) => {
	const { user, marketplace, ecommerce_id, order_at, ad_id, product_name, product_sku, quantity, total } = body
	const now = new Date()
	// Ajusta para o fuso horário de São Paulo (UTC-3)
	const offsetMs = -3 * 60 * 60 * 1000
	const saoPauloDate = new Date(now.getTime() + offsetMs)
	const createdAt = saoPauloDate
	const updatedAt = saoPauloDate
  
	const tableName = "anuncios_marketplace"
  
	const queryString = `
    INSERT INTO ${tableName} (
      created_at,
      updated_at,
      marketplace,
      ecommerce_id,
      created_user,
      updated_user,
      order_at,
      ad_id,
      product_name,
      product_sku,
      quantity,
      total
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12
    ) RETURNING *
  `

	const values = [
		createdAt,
		updatedAt,
		marketplace,
		ecommerce_id,
		user,
		user,
		order_at,
		ad_id,
		product_name,
		product_sku,
		quantity,
		total
	]

	const result = await query(queryString, values)
	return result.rows[0]
}

export const fetchAdsMarketplace = async (createdAtMin, createdAtMax, marketplace) => {
	const queryString = `
		SELECT order_at, ad_id, product_name, product_sku, quantity, total FROM anuncios_marketplace WHERE order_at >= $1 AND order_at <= $2 AND marketplace = $3
	`
	const values = [createdAtMin, createdAtMax, marketplace]
	const result = await query(queryString, values)
	const total = result.rowCount
	
	logAdsMarketplace(`Anúncios marketplace encontrados: ${total}, marketplace: ${marketplace}, createdAtMin: ${createdAtMin}, createdAtMax: ${createdAtMax}`)
	return {
		message: "Anúncios marketplace encontrados com sucesso",
		success: true,
		ads: result.rows
	}
}