import axios from "axios"
import { GoogleGenAI, createPartFromBase64, createUserContent } from "@google/genai"
import { config } from "../config/env.js"
import { GETlistProducts } from "../api/get.js"
import { PUTProductNuvemshop } from "../api/put.js"

const PROMPT_TAGS = `Analise a imagem deste produto e gere palavras-chave (tags) para e-commerce e busca.
Regras:
- Gere apenas tags relevantes para o que aparece na imagem. Se a imagem for um ambiente, pegue apenas a imagem que contida no quadro(s). (produto, cor, estilo, etc.).
- Use palavras em português, em minúsculo, separadas por vírgula.
- Máximo 15 tags. Não inclua número ou lista, apenas as tags separadas por vírgula, não use a tag "quadro" ou "arte em parede".
- Exemplo de formato de resposta: escada, floral, filme famoso, verão, casual, algodão, midi`

const MAX_TAGS = 15
const GEMINI_MODEL = "gemini-2.5-flash-lite"

async function fetchImageAsBase64(imageUrl) {
	const response = await axios.get(imageUrl, { responseType: "arraybuffer" })
	const data = Buffer.from(response.data).toString("base64")
	const mimeType = response.headers["content-type"]?.split(";")[0]?.trim() || "image/jpeg"
	return { data, mimeType }
}

export async function generateTagsFromImage(imageUrl) {
	if (!config.geminiApiKey) {
		throw new Error("GEMINI_API_KEY não configurada no .env")
	}

	const { data: imageBase64, mimeType } = await fetchImageAsBase64(imageUrl)
	const ai = new GoogleGenAI({ apiKey: config.geminiApiKey })

	const imagePart = createPartFromBase64(imageBase64, mimeType)
	const userContent = createUserContent([imagePart, PROMPT_TAGS])

	const response = await ai.models.generateContent({
		model: GEMINI_MODEL,
		contents: userContent
	})

	const text = response?.text?.trim()
	if (!text) return []

	const raw = text.replace(/\n/g, ",").split(",")
	const tags = raw
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean)
		.slice(0, MAX_TAGS)

	return tags
}

export const generateTagsIAServices = async (store, date) => {
	try {
		const products = await GETlistProducts(
			store,
			`?published=true&per_page=156&created_at_min=${date}&fields=id,name,images,tags`
		)

		const productsWithTags = []
		for (const product of products) {
			const imageUrl = product.images?.[0]
      const productIsUpdated = product.id < 327935257
			if (!imageUrl || productIsUpdated) {
				continue
			}
      const tagsAI = await generateTagsFromImage(imageUrl)
      const tags = `${product.tags},${tagsAI.join(",")}`
      productsWithTags.push({ id: product.id, name: product.name, tags })

      const result = await PUTProductNuvemshop(product.id, { tags }, store)
      if (result.status === 200) {
        console.log(`Tags do produto ${product.id} ${product.name} atualizado na Nuvemshop com sucesso`)
      } else {
        console.error(`Erro ao atualizar tags do produto ${product.id} ${product.name} na Nuvemshop: ${result}`)
      }
		}

		return {
			status: 200,
			success: true,
			message: "Tags geradas com sucesso",
			data: productsWithTags
		}
	} catch (error) {
		return {
			status: 500,
			success: false,
			message: error.message,
			data: null
		}
	}
}
