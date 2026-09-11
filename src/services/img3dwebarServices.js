import { query } from "../db/db.js"

// Tabelas de imagens do visualizador AR (3DWebAR), uma por loja. O nome físico
// leva aspas duplas de propósito: sem elas o Postgres dobra "img_3dwebar_OT"
// para minúsculas e a tabela não é encontrada.
const IMG_TABLES = { outlet: '"img_3dwebar_OT"' }

export const IMG_STORES = Object.keys(IMG_TABLES)

export class Img3dwebarInputError extends Error {}

// `product_images` é uma coluna `json`: o driver `pg` já entrega o valor
// parseado, mas se algum registro foi gravado como texto, tratamos aqui.
const toImageArray = (value) => {
	let images = value
	if (typeof images === "string") {
		try {
			images = JSON.parse(images)
		} catch {
			return []
		}
	}
	return Array.isArray(images) ? images : []
}

/**
 * Imagens (artes) de um produto para o 3DWebAR.
 * @param {string} store  loja ("outlet")
 * @param {string|number} id  número do produto extraído do SKU ("OT|558-..." → 558)
 * @returns {Promise<{ id: number, images: string[] } | null>} null quando não há registro
 */
export const getImg3dwebarService = async (store, id) => {
	const table = IMG_TABLES[store]
	if (!table) {
		throw new Img3dwebarInputError(
			`Loja inválida. Permitidas: ${IMG_STORES.join(", ")}`
		)
	}

	const productId = Number(id)
	if (!Number.isInteger(productId) || productId <= 0) {
		throw new Img3dwebarInputError(`Id de produto inválido: "${id}"`)
	}

	try {
		const result = await query(
			`SELECT id, product_images FROM ${table} WHERE id = $1`,
			[productId]
		)
		if (result.rows.length === 0) return null

		const row = result.rows[0]
		return { id: Number(row.id), images: toImageArray(row.product_images) }
	} catch (error) {
		console.error(`Erro ao obter imagens 3DWebAR do produto ${productId}: ${error}`)
		throw new Error(`Erro ao obter imagens 3DWebAR do produto ${productId}: ${error}`)
	}
}
