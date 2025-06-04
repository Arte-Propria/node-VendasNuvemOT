import { fetchOrdersAllMarketplace, fetchOrdersAllMarketplaceOptimized, fetchOrdersByMarketplace } from "../services/marketplaceServices.js"
import { logMarketplace, logPCP } from "../utils/logger.js"

export const getOrdersByMarketplace = async (req, res) => {
	const { marketplace, createdAtMin, createdAtMax } = req.params
	try {
		const orders = await fetchOrdersByMarketplace(marketplace, createdAtMin, createdAtMax)
		logMarketplace(`Pedidos do marketplace ${marketplace} obtidos com sucesso. ${orders.length} pedidos.`)

		res.status(200).json(orders)
	} catch (error) {
		logMarketplace(`Erro ao obter pedidos do marketplace ${marketplace}: ${error}`)
		res.status(500).json({ error: "Erro ao obter pedidos do marketplace" })
	}

}

export const getOrdersAllMarketplace = async (req, res) => {
	const { createdAtMin, createdAtMax } = req.params
	try {
		const orders = await fetchOrdersAllMarketplace(createdAtMin, createdAtMax)
		logMarketplace(`Pedidos de todos os marketplaces obtidos com sucesso. ${orders.length} pedidos.`)
		res.status(200).json(orders)
	} catch (error) {
		logMarketplace(`Erro ao obter pedidos de todos os marketplaces: ${error}`)
		res.status(500).json({ error: "Erro ao obter pedidos de todos os marketplaces" })
	}
}

export const getOrdersAllMarketplaceOptimized = async (req, res) => {
	const { createdAtMin, createdAtMax } = req.params
	try {
		const orders = await fetchOrdersAllMarketplaceOptimized(createdAtMin, createdAtMax)
		logPCP(`Pedidos de todos os marketplaces obtidos com sucesso. ${orders.length} pedidos.`)
		res.status(200).json(orders)
	} catch (error) {
		logPCP(`Erro ao obter pedidos de todos os marketplaces: ${error}`)
		res.status(500).json({ error: "Erro ao obter pedidos de todos os marketplaces" })
	}
}

