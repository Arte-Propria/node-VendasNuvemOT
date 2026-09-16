import express from "express"
import {
	authAuthorizeUrl,
	healthz,
	itemsBaseInfo,
	itemsList,
	itemsModels,
	ordersDetail,
	ordersList,
	ordersTrackingNumber,
	tokenExchange,
	tokenRefresh,
	whoami
} from "../controllers/shopeeGatewayController.js"
import { gatewayAuth } from "../middleware/gatewayAuth.js"

/**
 * Gateway da Shopee para o 3print — montado em /gateway/shopee (server.js).
 *
 * Tudo é POST com JSON: o access_token da loja vai no corpo, nunca na query,
 * porque a Render registra a URL nos logs de acesso, não o corpo.
 */
const router = express.Router()

router.get("/healthz", healthz)

router.use(gatewayAuth)

router.get("/whoami", whoami)

router.post("/orders/detail", ordersDetail)
router.post("/orders/list", ordersList)
router.post("/orders/tracking-number", ordersTrackingNumber)

router.post("/items/list", itemsList)
router.post("/items/base-info", itemsBaseInfo)
router.post("/items/models", itemsModels)

router.post("/token/refresh", tokenRefresh)
router.post("/token/exchange", tokenExchange)
router.post("/auth/authorize-url", authAuthorizeUrl)

export default router
