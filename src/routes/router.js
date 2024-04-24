import express from "express"
import { getProduct, getProducts } from "../controllers/productsController.js"
import { getOrders } from "../controllers/ordersController.js"
import { getOrdersBot } from "../controllers/ordersBotController.js"
import { getCoupons } from "../controllers/couponsControllers.js"
import { getAnalytics } from "../controllers/analyticsControllers.js"
import { getDataADSMeta } from "../controllers/dataADSMetaControllers.js"

const router = express.Router()

// Rota para buscar produtos
router.get("/products", getProducts)
router.get("/product/:store/:id", getProduct)
router.get("/coupons/:store", getCoupons)
router.get("/orders/", getOrders)
router.get("/orders/:store/:cpf", getOrdersBot)
router.get("/orders/:store/:createdAtMin/:createdAtMax", getOrders)

// Meta ADS
router.get("/ads/meta/:store/:createdAtMin/:createdAtMax", getDataADSMeta)

// Google Analytics
router.get("/analytics/:store/:createdAtMin/:createdAtMax", getAnalytics)

export default router