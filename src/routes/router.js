import express from "express"
import { getProduct, getProducts } from "../controllers/productsController.js"
import { getOrder, getOrders, getOrdersByDate, getOrdersByStore } from "../controllers/ordersController.js"
import { getCustomers } from "../controllers/customersController.js"
import { getOrdersBot } from "../controllers/ordersBotController.js"
import { getCoupons, postCoupon } from "../controllers/couponsControllers.js"
import { getAnalytics } from "../controllers/analyticsControllers.js"
import { getDataADSMeta } from "../controllers/dataADSMetaControllers.js"
import { createOrder } from "../controllers/createOrderController.js"
import { postProduct } from "../controllers/createProductController.js"
import { getCategories } from "../controllers/categoriesControllers.js"
import { deleteOrderByOwnerNote } from "../controllers/deleteOrderController.js"
import { createdOrderWebhook, createOrderEcommerceWebhook, createOrderMarketplaceWebhook } from "../controllers/webhooksController.js"
import { getNoteOrderTiny, getOrderTiny } from "../controllers/orderTinyController.js"
import { getRefunds, createRefund, deleteRefund } from "../controllers/refundsControllers.js"
import { getTikTokAuth, getTikTokAds, getTikTokCreatives } from "../controllers/tiktokControllers.js"
import { getOrdersAllMarketplace, getOrdersAllMarketplaceOptimized, getOrdersByMarketplace } from "../controllers/marketplaceControllers.js"
import { getShopeeAuth, handleShopeeCallback } from "../controllers/shopeeControllers.js"

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

// Rota para criar pedidos
router.post("/order/:store", createOrder) // Adicione a rota para criar um novo pedido

// Rota para excluir pedidos
router.delete("/order/:store/:ownerNote", deleteOrderByOwnerNote) // Adicione a rota para criar um novo pedido

// WEBHOOKS
router.post("/webhooks/order-created", createdOrderWebhook)
router.post("/webhooks/order-marketplace", createOrderMarketplaceWebhook)
router.post("/webhooks/order-ecommerce", createOrderEcommerceWebhook)

// Rotas TINY
router.get("/tiny/order/:id/:cpf", getOrderTiny)
router.get("/tiny/note/:id/:cpf", getNoteOrderTiny)

// Rotas de reembolsos
router.get("/refunds/:store/:createdAtMin/:createdAtMax", getRefunds)
router.post("/refunds/:store", createRefund)
router.delete("/refunds/:store/:id", deleteRefund)

// Rotas Marketplace
router.get("/marketplace/orders/:marketplace/:createdAtMin/:createdAtMax", getOrdersByMarketplace)
router.get("/marketplace/orders/:createdAtMin/:createdAtMax", getOrdersAllMarketplace)

// Rotas PCP
router.get("/pcp/orders/:createdAtMin/:createdAtMax", getOrdersAllMarketplaceOptimized)

export default router
