import { generateSheinAuthUrl, fetchSheinAuth, saveSheinToken, getSheinProducts, getSheinProduct, getSheinOrders, getSheinOrder, updateSheinOrderStatus } from "../services/sheinServices.js"

export const getSheinAuth = async (req, res) => {
	try {
		const authUrl = generateSheinAuthUrl()
		console.log("URL de autorização SHEIN gerada:", authUrl)
		return res.redirect(authUrl)
	} catch (error) {
		console.error("Erro ao gerar URL de autorização da SHEIN:", error)
		return res.status(500).json({
			success: false,
			message: "Erro ao gerar URL de autorização da SHEIN",
			error: error.message
		})
	}
}

export const handleSheinCallback = async (req, res) => {
	try {
		const { code, error, state } = req.query

		if (error) {
			return res.status(400).json({
				success: false,
				message: "Erro na autorização da SHEIN",
				error: error
			})
		}

		if (!code) {
			return res.status(400).json({
				success: false,
				message: "Código de autorização não fornecido"
			})
		}

		// Validação do state (opcional, mas recomendado para segurança)
		if (state && !state.startsWith("AUTH-SHEIN-")) {
			console.warn("State inválido recebido:", state)
		}

		console.log("Código de autorização recebido:", code)
		
		// Troca o código por token de acesso
		const authResult = await fetchSheinAuth(code)
		console.log("Token de acesso obtido com sucesso")

		// Salva o token no banco de dados
		await saveSheinToken(authResult)
		console.log("Token salvo no banco de dados")

		return res.json({
			success: true,
			message: "Autenticação com SHEIN realizada com sucesso",
			data: {
				access_token: authResult.access_token,
				expires_in: authResult.expires_in,
				scope: authResult.scope,
				token_type: authResult.token_type
			}
		})

	} catch (error) {
		console.error("Erro no callback da SHEIN:", error)
		return res.status(500).json({
			success: false,
			message: "Erro interno no servidor",
			error: error.message
		})
	}
}

// Controller para buscar produtos da SHEIN
export const getSheinProductsController = async (req, res) => {
	try {
		const { page, page_size, category_id, status } = req.query
		const params = {}
		
		if (page) params.page = parseInt(page)
		if (page_size) params.page_size = parseInt(page_size)
		if (category_id) params.category_id = category_id
		if (status) params.status = status
		
		const products = await getSheinProducts(params)
		
		return res.json({
			success: true,
			message: "Produtos da SHEIN recuperados com sucesso",
			data: products
		})
	} catch (error) {
		console.error("Erro ao buscar produtos da SHEIN:", error)
		return res.status(500).json({
			success: false,
			message: "Erro ao buscar produtos da SHEIN",
			error: error.message
		})
	}
}

// Controller para buscar detalhes de um produto específico
export const getSheinProductController = async (req, res) => {
	try {
		const { productId } = req.params
		
		if (!productId) {
			return res.status(400).json({
				success: false,
				message: "ID do produto é obrigatório"
			})
		}
		
		const product = await getSheinProduct(productId)
		
		return res.json({
			success: true,
			message: "Produto da SHEIN recuperado com sucesso",
			data: product
		})
	} catch (error) {
		console.error("Erro ao buscar produto da SHEIN:", error)
		return res.status(500).json({
			success: false,
			message: "Erro ao buscar produto da SHEIN",
			error: error.message
		})
	}
}

// Controller para buscar pedidos da SHEIN
export const getSheinOrdersController = async (req, res) => {
	try {
		const { page, page_size, status, start_time, end_time } = req.query
		const params = {}
		
		if (page) params.page = parseInt(page)
		if (page_size) params.page_size = parseInt(page_size)
		if (status) params.status = status
		if (start_time) params.start_time = start_time
		if (end_time) params.end_time = end_time
		
		const orders = await getSheinOrders(params)
		
		return res.json({
			success: true,
			message: "Pedidos da SHEIN recuperados com sucesso",
			data: orders
		})
	} catch (error) {
		console.error("Erro ao buscar pedidos da SHEIN:", error)
		return res.status(500).json({
			success: false,
			message: "Erro ao buscar pedidos da SHEIN",
			error: error.message
		})
	}
}

// Controller para buscar detalhes de um pedido específico
export const getSheinOrderController = async (req, res) => {
	try {
		const { orderId } = req.params
		
		if (!orderId) {
			return res.status(400).json({
				success: false,
				message: "ID do pedido é obrigatório"
			})
		}
		
		const order = await getSheinOrder(orderId)
		
		return res.json({
			success: true,
			message: "Pedido da SHEIN recuperado com sucesso",
			data: order
		})
	} catch (error) {
		console.error("Erro ao buscar pedido da SHEIN:", error)
		return res.status(500).json({
			success: false,
			message: "Erro ao buscar pedido da SHEIN",
			error: error.message
		})
	}
}

// Controller para atualizar status de um pedido
export const updateSheinOrderStatusController = async (req, res) => {
	try {
		const { orderId } = req.params
		const { status } = req.body
		
		if (!orderId) {
			return res.status(400).json({
				success: false,
				message: "ID do pedido é obrigatório"
			})
		}
		
		if (!status) {
			return res.status(400).json({
				success: false,
				message: "Status é obrigatório"
			})
		}
		
		const result = await updateSheinOrderStatus(orderId, status)
		
		return res.json({
			success: true,
			message: "Status do pedido atualizado com sucesso",
			data: result
		})
	} catch (error) {
		console.error("Erro ao atualizar status do pedido da SHEIN:", error)
		return res.status(500).json({
			success: false,
			message: "Erro ao atualizar status do pedido da SHEIN",
			error: error.message
		})
	}
} 