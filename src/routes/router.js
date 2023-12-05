import express from "express"
import { getProducts } from "../controllers/productsController.js"
import { getOrders } from "../controllers/ordersController.js"

const router = express.Router()

// Rota para buscar produtos
router.use("/products", getProducts)
router.use("/orders", getOrders)

export default router