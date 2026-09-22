import express from "express"
import {
	authAuthorizeUrl,
	healthz,
	itemsBaseInfo,
	itemsList,
	itemsModels,
	logisticsDocumentCreate,
	logisticsDocumentDownload,
	logisticsDocumentParameter,
	logisticsDocumentResult,
	logisticsShipOrder,
	logisticsShippingParameter,
	ordersDetail,
	ordersInvoiceUpload,
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

// Parser próprio, DEPOIS da chave: o XML da NF-e (em base64) passa dos 100 kb
// do parser global — e só quem tem a chave faz o gateway ler um corpo grande.
router.use(express.json({ limit: "2mb" }))

router.get("/whoami", whoami)

router.post("/orders/detail", ordersDetail)
router.post("/orders/list", ordersList)
router.post("/orders/tracking-number", ordersTrackingNumber)
router.post("/orders/invoice-upload", ordersInvoiceUpload)

router.post("/logistics/shipping-parameter", logisticsShippingParameter)
router.post("/logistics/ship-order", logisticsShipOrder)
router.post("/logistics/document-parameter", logisticsDocumentParameter)
router.post("/logistics/document-create", logisticsDocumentCreate)
router.post("/logistics/document-result", logisticsDocumentResult)
router.post("/logistics/document-download", logisticsDocumentDownload)

router.post("/items/list", itemsList)
router.post("/items/base-info", itemsBaseInfo)
router.post("/items/models", itemsModels)

router.post("/token/refresh", tokenRefresh)
router.post("/token/exchange", tokenExchange)
router.post("/auth/authorize-url", authAuthorizeUrl)

export default router
