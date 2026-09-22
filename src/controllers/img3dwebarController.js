import express from "express"
import {
	getImg3dwebarService,
	upsertImg3dwebarService,
	deleteImg3dwebarService,
	uploadWebarImageService,
	Img3dwebarInputError
} from "../services/img3dwebarServices.js"
import { config } from "../config/env.js"

// As rotas de escrita são as únicas autenticadas da API (o resto é público com
// cors "*"), então a chave vive aqui mesmo: uma pasta de middlewares só para
// estas 10 linhas seria excesso.
export const requireWebarWriteKey = (req, res, next) => {
	// Sem WEBAR_WRITE_KEY configurada a rota falha fechada: nunca aberta por omissão.
	if (!config.webarWriteKey) {
		console.error("WEBAR_WRITE_KEY não configurada: rotas de escrita desabilitadas")
		return res.status(503).json({
			success: false,
			message: "Escrita de imagens indisponível: chave não configurada no servidor"
		})
	}

	if (req.get("x-api-key") !== config.webarWriteKey) {
		return res.status(401).json({ success: false, message: "Chave de escrita inválida" })
	}

	return next()
}

// O corpo do upload é o JPEG cru, não JSON. O express.json() global (server.js:21)
// checa o Content-Type e chama next() sem tocar no stream quando não é
// application/json, então o limite de 100kb dele não alcança esta rota.
// O `type` explícito é obrigatório: o default de express.raw é
// application/octet-stream, e image/jpeg cairia fora, deixando req.body = {}.
const rawImage = express.raw({
	type: ["image/jpeg", "image/png", "image/webp"],
	limit: "8mb"
})

// Envelopar o parser: estouro de limite vira erro passado ao next(), e como a app
// não tem error handler o cliente receberia HTML com stack em vez de { success }.
export const parseWebarUploadBody = (req, res, next) =>
	rawImage(req, res, (error) =>
		error
			? res.status(error.status || 400).json({
					success: false,
					message: "Imagem inválida ou acima de 8mb"
			  })
			: next()
	)

// POST /webar/upload?id=558&slot=1 → sobe a arte no Storage e devolve a URL pública.
// Corpo: os bytes da imagem. O cliente manda a arte já recortada e reduzida.
export const postWebarUpload = async (req, res) => {
	const { id, slot } = req.query

	// Mesma postura do requireWebarWriteKey: sem credencial configurada a rota
	// falha fechada, nunca tenta e devolve 500.
	if (!config.supabaseUrl || !config.supabaseServiceKey) {
		console.error("SUPABASE_URL/SUPABASE_SERVICE_KEY não configuradas: upload desabilitado")
		return res.status(503).json({
			success: false,
			message: "Upload de imagens indisponível: storage não configurado no servidor"
		})
	}

	// Quando o Content-Type não casa, express.raw deixa req.body como {} em vez de Buffer.
	if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
		return res.status(415).json({
			success: false,
			message: "Envie os bytes da imagem com Content-Type image/jpeg, image/png ou image/webp"
		})
	}

	try {
		const data = await uploadWebarImageService(req.body, { id, slot })

		return res.status(201).json({
			success: true,
			message: `Arte ${data.key} enviada com sucesso`,
			data
		})
	} catch (error) {
		if (error instanceof Img3dwebarInputError) {
			return res.status(400).json({ success: false, message: error.message })
		}
		console.error(error)
		return res.status(500).json({
			success: false,
			message: `Erro ao subir arte do produto ${id}`,
			error: error.message
		})
	}
}

// GET /webar/images/:store/:id → imagens do produto para o visualizador AR (3DWebAR)
export const getImg3dwebar = async (req, res) => {
	const { store, id } = req.params
	try {
		const data = await getImg3dwebarService(store, id)

		if (!data) {
			return res.status(404).json({
				success: false,
				message: `Nenhuma imagem cadastrada para o produto ${id}`
			})
		}

		return res.status(200).json({
			success: true,
			message: `Imagens do produto ${id} obtidas com sucesso`,
			data
		})
	} catch (error) {
		if (error instanceof Img3dwebarInputError) {
			return res.status(400).json({ success: false, message: error.message })
		}
		console.error(error)
		return res.status(500).json({
			success: false,
			message: `Erro ao obter imagens do produto ${id}`,
			error: error.message
		})
	}
}

// POST /webar/images → cadastra (ou substitui) as imagens de um produto.
// Body: { store, id, product_images: string[] } com 1 a 3 URLs.
export const postImg3dwebar = async (req, res) => {
	const { store, id, product_images: productImages } = req.body || {}
	try {
		const data = await upsertImg3dwebarService(store, id, productImages)

		return res.status(201).json({
			success: true,
			message: `Imagens do produto ${id} salvas com sucesso`,
			data
		})
	} catch (error) {
		if (error instanceof Img3dwebarInputError) {
			return res.status(400).json({ success: false, message: error.message })
		}
		console.error(error)
		return res.status(500).json({
			success: false,
			message: `Erro ao salvar imagens do produto ${id}`,
			error: error.message
		})
	}
}

// PUT /webar/images/:store/:id → mesma gravação do POST, com loja e produto na URL.
// Body: { product_images: string[] }
export const putImg3dwebar = async (req, res) => {
	const { store, id } = req.params
	const { product_images: productImages } = req.body || {}
	try {
		const data = await upsertImg3dwebarService(store, id, productImages)

		return res.status(200).json({
			success: true,
			message: `Imagens do produto ${id} atualizadas com sucesso`,
			data
		})
	} catch (error) {
		if (error instanceof Img3dwebarInputError) {
			return res.status(400).json({ success: false, message: error.message })
		}
		console.error(error)
		return res.status(500).json({
			success: false,
			message: `Erro ao atualizar imagens do produto ${id}`,
			error: error.message
		})
	}
}

// DELETE /webar/images/:store/:id → remove o registro de imagens do produto
export const deleteImg3dwebar = async (req, res) => {
	const { store, id } = req.params
	try {
		const data = await deleteImg3dwebarService(store, id)

		if (!data) {
			return res.status(404).json({
				success: false,
				message: `Nenhuma imagem cadastrada para o produto ${id}`
			})
		}

		return res.status(200).json({
			success: true,
			message: `Imagens do produto ${id} excluídas com sucesso`,
			data
		})
	} catch (error) {
		if (error instanceof Img3dwebarInputError) {
			return res.status(400).json({ success: false, message: error.message })
		}
		console.error(error)
		return res.status(500).json({
			success: false,
			message: `Erro ao excluir imagens do produto ${id}`,
			error: error.message
		})
	}
}
