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
		logAdsMarketplace(`Anúncio marketplace salvo: ${ads.ad_id}, usuário: ${ads.user}`)
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
	const { user, marketplace, order_at, ad_id, product_name, product_sku, quantity, total } = body
	const now = new Date()
	// Ajusta para o fuso horário de São Paulo (UTC-3)
	const offsetMs = -3 * 60 * 60 * 1000
	const saoPauloDate = new Date(now.getTime() + offsetMs)
	const createdAt = saoPauloDate.toISOString().slice(0, 19).replace("T", " ")
	const updatedAt = saoPauloDate.toISOString().slice(0, 19).replace("T", " ")
  
	const tableName = "anuncios_marketplace"
  
	const queryString = `
    INSERT INTO ${tableName} (
      created_at,
      updated_at,
      marketplace,
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
      $11
    ) RETURNING *
  `

	const values = [
		createdAt,
		updatedAt,
		marketplace,
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
