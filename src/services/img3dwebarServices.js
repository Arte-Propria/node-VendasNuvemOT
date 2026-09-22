import axios from "axios"
import { query } from "../db/db.js"
import { config } from "../config/env.js"

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

// A interpolação do nome da tabela no SQL só é segura porque o valor sai deste
// mapa fechado — nunca do que o cliente mandou.
const resolveTable = (store) => {
	const table = IMG_TABLES[store]
	if (!table) {
		throw new Img3dwebarInputError(
			`Loja inválida. Permitidas: ${IMG_STORES.join(", ")}`
		)
	}
	return table
}

// O id é o número do produto extraído do SKU ("OT|558-..." → 558) e é a PK bigint
// da tabela.
const parseProductId = (id) => {
	const productId = Number(id)
	if (!Number.isInteger(productId) || productId <= 0) {
		throw new Img3dwebarInputError(`Id de produto inválido: "${id}"`)
	}
	return productId
}

// Limite de 1 a 3 artes por produto: é o que o visualizador AR consegue exibir.
const MAX_IMAGES = 3

const isHttpUrl = (value) => {
	if (typeof value !== "string" || !value.trim()) return false
	try {
		const { protocol } = new URL(value)
		return protocol === "http:" || protocol === "https:"
	} catch {
		return false
	}
}

const validateImages = (images) => {
	if (!Array.isArray(images)) {
		throw new Img3dwebarInputError(
			"product_images deve ser um array de URLs (1 a 3)"
		)
	}
	if (images.length < 1 || images.length > MAX_IMAGES) {
		throw new Img3dwebarInputError(
			`product_images deve ter de 1 a ${MAX_IMAGES} URLs (recebidas: ${images.length})`
		)
	}
	const invalid = images.find((image) => !isHttpUrl(image))
	if (invalid !== undefined) {
		throw new Img3dwebarInputError(
			`URL inválida em product_images: "${invalid}". Use http:// ou https://`
		)
	}
	return images.map((image) => image.trim())
}

/**
 * Imagens (artes) de um produto para o 3DWebAR.
 * @param {string} store  loja ("outlet")
 * @param {string|number} id  número do produto extraído do SKU ("OT|558-..." → 558)
 * @returns {Promise<{ id: number, images: string[] } | null>} null quando não há registro
 */
export const getImg3dwebarService = async (store, id) => {
	const table = resolveTable(store)
	const productId = parseProductId(id)

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

/**
 * Grava as imagens de um produto, substituindo o array inteiro quando o registro
 * já existe (o cadastro é sempre o conjunto completo, nunca um acréscimo).
 * @param {string} store  loja ("outlet")
 * @param {string|number} id  número do produto extraído do SKU
 * @param {string[]} images  1 a 3 URLs http(s)
 * @returns {Promise<{ id: number, images: string[] }>}
 */
export const upsertImg3dwebarService = async (store, id, images) => {
	const table = resolveTable(store)
	const productId = parseProductId(id)
	const validImages = validateImages(images)

	try {
		const result = await query(
			`INSERT INTO ${table} (id, product_images)
			 VALUES ($1, $2::json)
			 ON CONFLICT (id) DO UPDATE SET product_images = EXCLUDED.product_images
			 RETURNING id, product_images`,
			[productId, JSON.stringify(validImages)]
		)

		const row = result.rows[0]
		return { id: Number(row.id), images: toImageArray(row.product_images) }
	} catch (error) {
		console.error(`Erro ao gravar imagens 3DWebAR do produto ${productId}: ${error}`)
		throw new Error(`Erro ao gravar imagens 3DWebAR do produto ${productId}: ${error}`)
	}
}

/**
 * Sobe uma arte já processada (JPEG) para o bucket público do Supabase Storage e
 * devolve a URL pública pronta para entrar em `product_images`.
 *
 * A chave é montada aqui, nunca a partir do nome do arquivo original: nome de
 * quadro costuma ter acento e parêntese, que o Storage rejeita com InvalidKey, e
 * derivar a chave do que o cliente mandou abriria path traversal.
 *
 * @param {Buffer} buffer  bytes do JPEG
 * @param {{ id: string|number, slot: string|number }} meta  produto e posição (1 a 3)
 * @returns {Promise<{ url: string, key: string }>}
 */
export const uploadWebarImageService = async (buffer, { id, slot }) => {
	const productId = parseProductId(id)
	const position = Number(slot)
	if (!Number.isInteger(position) || position < 1 || position > MAX_IMAGES) {
		throw new Img3dwebarInputError(
			`Posição inválida: "${slot}". Use de 1 a ${MAX_IMAGES}`
		)
	}

	const key = `${productId}/${position}.jpg`
	if (!/^[0-9]+\/[1-3]\.jpg$/.test(key)) {
		throw new Img3dwebarInputError(`Caminho de arquivo inválido: "${key}"`)
	}

	const baseUrl = config.supabaseUrl.replace(/\/+$/, "")
	const bucket = config.webarBucket

	try {
		// x-upsert deixa o upload idempotente: reprocessar a mesma pasta sobrescreve
		// em vez de falhar, e um retry não deixa objeto órfão no bucket.
		await axios.post(
			`${baseUrl}/storage/v1/object/${bucket}/${key}`,
			buffer,
			{
				headers: {
					Authorization: `Bearer ${config.supabaseServiceKey}`,
					apikey: config.supabaseServiceKey,
					"Content-Type": "image/jpeg",
					"cache-control": "max-age=31536000",
					"x-upsert": "true"
				},
				timeout: 30000
			}
		)
	} catch (error) {
		// O erro do Storage vem no corpo; error.message só diria "status code 400".
		const detail = error.response?.data
		console.error(
			`Erro ao subir arte ${key} para o bucket ${bucket}:`,
			detail ?? error.message
		)
		throw new Error(
			`Erro ao subir arte ${key}: ${detail?.message ?? detail?.error ?? error.message}`
		)
	}

	// A chave é fixa por produto/posição, então a URL não muda quando a arte é
	// trocada — e o CDN continuaria servindo a antiga por horas. O sufixo de versão
	// é o que faz o visualizador enxergar a imagem nova.
	return {
		key,
		url: `${baseUrl}/storage/v1/object/public/${bucket}/${key}?v=${Date.now()}`
	}
}

/**
 * Remove o registro de imagens de um produto.
 * @returns {Promise<{ id: number } | null>} null quando não havia registro
 */
export const deleteImg3dwebarService = async (store, id) => {
	const table = resolveTable(store)
	const productId = parseProductId(id)

	try {
		const result = await query(
			`DELETE FROM ${table} WHERE id = $1 RETURNING id`,
			[productId]
		)
		if (result.rows.length === 0) return null

		return { id: Number(result.rows[0].id) }
	} catch (error) {
		console.error(`Erro ao excluir imagens 3DWebAR do produto ${productId}: ${error}`)
		throw new Error(`Erro ao excluir imagens 3DWebAR do produto ${productId}: ${error}`)
	}
}
