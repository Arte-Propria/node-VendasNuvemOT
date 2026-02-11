import express from "express"
import { getProduct, getProducts } from "../controllers/productsController.js"
import {
	getOrder,
	getOrders,
	getOrdersByDate,
	getOrdersByStore
} from "../controllers/ordersController.js"
import { getCustomers } from "../controllers/customersController.js"
import { getOrdersBot } from "../controllers/ordersBotController.js"
import { getCoupons, postCoupon } from "../controllers/couponsControllers.js"
import { getAnalytics } from "../controllers/analyticsControllers.js"
import { getDataADSMeta } from "../controllers/dataADSMetaControllers.js"
import { createOrder } from "../controllers/createOrderController.js"
import { postProduct } from "../controllers/createProductController.js"
import { getCategories } from "../controllers/categoriesControllers.js"
import { deleteOrderByOwnerNote } from "../controllers/deleteOrderController.js"
import {
	createdOrderWebhook,
	createOrderEcommerceWebhook,
	createOrderEcommerceWebhookManual,
	createOrderMarketplaceWebhook,
	mandaeWebhook
} from "../controllers/webhooksController.js"
import {
	getNoteOrderTiny,
	getOrderTiny
} from "../controllers/orderTinyController.js"
import { testarBuscaRastreioIsolada } from "../controllers/trackingControllers.js"
import {
	getRefunds,
	createRefund,
	deleteRefund
} from "../controllers/refundsControllers.js"
import {
	getTikTokAuth,
	getTikTokAds,
	getTikTokCreatives
} from "../controllers/tiktokControllers.js"
import {
	getOrdersAllMarketplace,
	getOrdersAllMarketplaceOptimized,
	getOrdersByMarketplace,
	updateOrdersMarketplace,
	updateOrdersMarketplaceByDate
} from "../controllers/marketplaceControllers.js"
import {
	getShopeeAuth,
	handleShopeeCallback
} from "../controllers/shopeeControllers.js"
import {
	getSheinAuth,
	handleSheinCallback,
	getSheinProductsController,
	getSheinProductController,
	getSheinOrdersController,
	getSheinOrderController,
	updateSheinOrderStatusController
} from "../controllers/sheinControllers.js"
import {
	getCategoriesChatFunnel,
	getOrdersChatFunnel,
	getProductsChatFunnel
} from "../controllers/chatfunnelControllers.js"
import {
	createAdsMarketplace,
	getAdsMarketplace
} from "../controllers/adsMarketplaceControllers.js"
import {
	compararPedidos,
	compararPedidoNuvem,
	compararPedidosTiny
} from "../controllers/comparacaoController.js"
import {
	getOMandaeInfo,
	getOMandaeInfoByStore,
	getMandaeInfoByDate,
	executeBatchUpdate,
	executeFullBatchUpdate
} from "../controllers/mandaeControllers.js"
import { fetchUpdateOrdersMarketplaceByDate } from "../services/marketplaceServices.js"
import { testWebhook } from "../controllers/galeria9Controllers.js"
import { getDbQuery } from "../controllers/segmentacaoControllers.js"
import { getNuvemshopCallback } from "../controllers/authNuvemshop.js"

const router = express.Router()

// Rota para buscar produtos
router.get("/products", getProducts)
router.get("/product/:store/:id", getProduct)

// Rota para cupons
router.get("/coupons/:store", getCoupons)
router.post("/coupons/:store/:code", postCoupon)

router.get("/categories/:store", getCategories)
router.get("/order/:store/:id", getOrder)

// Rota que puxa todos os pedidos
// router.get('/orders/:store', updateAllOrdersFromDateRange);

router.get("/orders/:store/:createdAtMin/:createdAtMax", getOrders)
router.get("/customers/:store/:createdAtMin/:createdAtMax", getCustomers)

// Rota de chatbot para enviar o código e link de rastreamento
router.get("/orders/:store/:cpf", getOrdersBot)

// Rota para cadastrar produto
router.post("/product/:store", postProduct)

// Rota para buscar todos os pedidos de uma loja específica
router.get("/db/orders/:store", getOrdersByStore)

// Rota para buscar pedidos por data
router.get("/db/orders/:store/:createdAtMin/:createdAtMax", getOrdersByDate)

// Meta ADS
router.get("/ads/meta/:store/:createdAtMin/:createdAtMax", getDataADSMeta)

// Google Analytics
router.get("/analytics/:store/:createdAtMin/:createdAtMax", getAnalytics)

// Rotas TikTok
router.get("/tiktok/auth", getTikTokAuth)
router.get("/ads/tiktok/:store/:createdAtMin/:createdAtMax", getTikTokAds)
router.get("/creatives/tiktok/:store/:createdAtMin/:createdAtMax", getTikTokCreatives)

// Autenticação Shopee
router.get("/shopee/auth", getShopeeAuth)
router.get("/shopee/auth/callback", handleShopeeCallback)

// Autenticação Shein
router.get("/shein/auth", getSheinAuth)
router.get("/shein/auth/callback", handleSheinCallback)

// Rotas da API da SHEIN
router.get("/shein/products", getSheinProductsController)
router.get("/shein/product/:productId", getSheinProductController)
router.get("/shein/orders", getSheinOrdersController)
router.get("/shein/order/:orderId", getSheinOrderController)
router.put("/shein/order/:orderId/status", updateSheinOrderStatusController)

// Rota para criar pedidos
router.post("/order/:store", createOrder) // Adicione a rota para criar um novo pedido

// Rota para excluir pedidos
router.delete("/order/:store/:ownerNote", deleteOrderByOwnerNote) // Adicione a rota para criar um novo pedido

// WEBHOOKS
router.post("/webhooks/order-created", createdOrderWebhook) // Nuvemshop
router.post("/webhooks/order-marketplace", createOrderMarketplaceWebhook) // Tiny
router.post("/webhook/mandae", mandaeWebhook) // Webhook para atualizações da Mandae

// TINY ESINTEGRADA
router.post("/webhooks/order-ecommerce", createOrderEcommerceWebhook)
router.post("/webhooks/order-ecommerce-manual", createOrderEcommerceWebhookManual)

// Rotas TINY
router.get("/tiny/order/:id/:cpf", getOrderTiny)
router.get("/tiny/note/:id/:cpf", getNoteOrderTiny)

// -- Conferencia de sku
router.get("/comparar/:store/:dataInicial/:dataFinal", compararPedidos)
router.get("/comparar_tiny/:store/:dataInicial/:dataFinal", compararPedidosTiny)
router.get("/comparar_nuvem/:store/:dataInicial/:dataFinal", compararPedidoNuvem)

// Rotas Mandae
router.get("/mandae", getOMandaeInfo)
router.get("/mandae/:store", getOMandaeInfoByStore)
router.get("/mandae/:store/:createdAtMin/:createdAtMax", getMandaeInfoByDate)
router.get("/debug/:cod_ped", executeBatchUpdate)
router.get("/batch-update", executeFullBatchUpdate)

// Rotas de reembolsos
router.get("/refunds/:store/:refundType/:createdAtMin/:createdAtMax", getRefunds)
router.post("/refunds/:store", createRefund)
router.delete("/refunds/:store/:id", deleteRefund)

// Rotas Marketplace
router.get("/marketplace/orders/:marketplace/:createdAtMin/:createdAtMax", getOrdersByMarketplace)
router.get("/marketplace/orders/:createdAtMin/:createdAtMax", getOrdersAllMarketplace)
router.get("/update-orders-by-date/marketplace", updateOrdersMarketplaceByDate) // Atualiza os pedidos do marketplace por data
// Rotas PCP
router.get("/pcp/orders/:createdAtMin/:createdAtMax", getOrdersAllMarketplaceOptimized)
router.post("/pcp/ads/marketplace", createAdsMarketplace)
router.get("/pcp/ads/marketplace", getAdsMarketplace)

// Rotas ChatFunnel
router.get("/chatfunnel/:store/orders/:client", getOrdersChatFunnel)
router.get("/chatfunnel/:store/products", getProductsChatFunnel)
router.get("/chatfunnel/:store/categories", getCategoriesChatFunnel)

// Rotas ChatFunnel
router.get("/tracking/:id", testarBuscaRastreioIsolada)

// Rotas galeria9 teste 
router.get("/teste/galeria9", testWebhook)

// Rotas teste Db query
router.get("/dbquery/:querySelect/:startDate/:endDate", getDbQuery)

// Rotas de teste de aplicativo Nuvemshop
router.get("/apps/nuvemshop/callback", getNuvemshopCallback)

export default router
