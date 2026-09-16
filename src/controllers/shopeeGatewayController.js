import { createRequire } from "module"
import { GatewayNotConfigured, RESULT } from "../services/shopeeGateway/client.js"
import { authorizeUrl, exchangeCode, refreshAccessToken } from "../services/shopeeGateway/auth.js"
import { getItemBaseInfo, getItemList, getModelList } from "../services/shopeeGateway/items.js"
import { getOrderDetail, getOrderList, getTrackingNumber } from "../services/shopeeGateway/orders.js"
import { egressIp } from "../services/shopeeGateway/whoami.js"
import { logShopeeGateway } from "../utils/logger.js"

const { version } = createRequire(import.meta.url)("../../package.json")

/**
 * Controller do gateway da Shopee para o 3print.
 *
 * Cada handler valida o corpo, chama o service e aplica o CONTRATO de resposta
 * (o mesmo para todas as operações — é o que o cliente PHP conhece):
 *
 *   200 { ok: true,  data, request_id }                     Shopee respondeu sem erro
 *   401 { ok: false, error: "shopee_token_rejected", shopee } token inválido/expirado → o 3print renova e repete
 *   422 { ok: false, error: "shopee_error", shopee }         erro de negócio da Shopee (error_param, not_found…)
 *   502 { ok: false, error: "shopee_unreachable", message }  rede/timeout até a Shopee
 *   400 { ok: false, error: "invalid_request", details }     corpo inválido
 *   503 { ok: false, error: "gateway_not_configured" }       credenciais do app ausentes no env
 */

// ── Validação (sem lib: o corpo é pequeno e o contrato é nosso) ──────────

const MAX_LIST = 50
const MAX_PAGE = 100
const MAX_WINDOW_SECONDS = 15 * 24 * 3600

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== ""

const isId = (value) => (typeof value === "number" && Number.isInteger(value) && value > 0)
	|| (typeof value === "string" && /^\d+$/.test(value))

const isIdList = (value, max) => Array.isArray(value)
	&& value.length >= 1 && value.length <= max
	&& value.every((item) => isNonEmptyString(item) || isId(item))

const isIntInRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max

/** shop_id + access_token: presentes em toda chamada de loja. */
const shopFields = (body, details) => {
	if (!isId(body.shop_id)) details.push("shop_id: obrigatório, numérico")
	if (!isNonEmptyString(body.access_token)) details.push("access_token: obrigatório")

	return { shopId: String(body.shop_id), accessToken: body.access_token }
}

const optionalString = (value, name, details) => {
	if (value === undefined || value === null) return undefined
	if (!isNonEmptyString(value)) details.push(`${name}: precisa ser string não vazia`)

	return value
}

const optionalBoolean = (value, name, details) => {
	if (value === undefined || value === null) return undefined
	if (typeof value !== "boolean") details.push(`${name}: precisa ser booleano`)

	return value
}

const optionalInt = (
	value, name, min, max, details
) => {
	if (value === undefined || value === null) return undefined
	if (!isIntInRange(value, min, max)) details.push(`${name}: inteiro entre ${min} e ${max}`)

	return value
}

// ── Resposta ─────────────────────────────────────────────────────────────

const invalid = (res, details) => res.status(400).json({ ok: false, error: "invalid_request", details })

const respond = (res, outcome, log) => {
	logShopeeGateway({ ...log, result: outcome.result, shopee_status: outcome.status, ms: Date.now() - log.started_at, started_at: undefined })

	switch (outcome.result) {
	case RESULT.OK:
		return res.json({ ok: true, data: outcome.data, request_id: outcome.requestId })
	case RESULT.TOKEN_REJECTED:
		return res.status(401).json({ ok: false, error: "shopee_token_rejected", shopee: outcome.shopee })
	case RESULT.SHOPEE_ERROR:
		return res.status(422).json({ ok: false, error: "shopee_error", shopee: outcome.shopee, shopee_status: outcome.status })
	default:
		return res.status(502).json({ ok: false, error: "shopee_unreachable", message: outcome.message })
	}
}

const failed = (res, error, log) => {
	if (error instanceof GatewayNotConfigured) {
		return res.status(503).json({ ok: false, error: "gateway_not_configured", message: error.message })
	}

	console.error(`SHOPEE-GATEWAY: falha inesperada em ${log.op}:`, error)

	return res.status(500).json({ ok: false, error: "gateway_error", message: error.message })
}

/** Executa uma operação de loja com o contrato acima. */
const shopOperation = (op, parse, call) => async (req, res) => {
	const body = req.body || {}
	const details = []
	const shop = shopFields(body, details)
	const input = parse(body, details)

	if (details.length > 0) return invalid(res, details)

	const log = { op, shop_id: shop.shopId, started_at: Date.now() }

	try {
		return respond(res, await call({ ...shop, ...input }), log)
	} catch (error) {
		return failed(res, error, log)
	}
}

// ── Pedidos ──────────────────────────────────────────────────────────────

export const ordersDetail = shopOperation("orders/detail",
	(body, details) => {
		if (!isIdList(body.order_sn_list, MAX_LIST)) details.push(`order_sn_list: lista de 1 a ${MAX_LIST} order_sn`)

		return {
			orderSnList: Array.isArray(body.order_sn_list) ? body.order_sn_list.map(String) : [],
			responseOptionalFields: optionalString(body.response_optional_fields, "response_optional_fields", details),
			requestOrderStatusPending: optionalBoolean(body.request_order_status_pending, "request_order_status_pending", details)
		}
	},
	getOrderDetail)

export const ordersList = shopOperation("orders/list",
	(body, details) => {
		if (!["create_time", "update_time"].includes(body.time_range_field)) details.push("time_range_field: create_time | update_time")
		if (!isIntInRange(body.time_from, 1, Number.MAX_SAFE_INTEGER)) details.push("time_from: epoch em segundos")
		if (!isIntInRange(body.time_to, 1, Number.MAX_SAFE_INTEGER)) details.push("time_to: epoch em segundos")
		if (Number.isInteger(body.time_from) && Number.isInteger(body.time_to)) {
			if (body.time_to < body.time_from) details.push("time_to: precisa ser maior que time_from")
			if (body.time_to - body.time_from > MAX_WINDOW_SECONDS) details.push("janela: no máximo 15 dias")
		}

		return {
			timeRangeField: body.time_range_field,
			timeFrom: body.time_from,
			timeTo: body.time_to,
			pageSize: optionalInt(
				body.page_size, "page_size", 1, MAX_PAGE, details
			),
			cursor: optionalString(body.cursor, "cursor", details),
			orderStatus: optionalString(body.order_status, "order_status", details),
			responseOptionalFields: optionalString(body.response_optional_fields, "response_optional_fields", details)
		}
	},
	getOrderList)

export const ordersTrackingNumber = shopOperation("orders/tracking-number",
	(body, details) => {
		if (!isNonEmptyString(body.order_sn)) details.push("order_sn: obrigatório")

		return {
			orderSn: body.order_sn,
			packageNumber: optionalString(body.package_number, "package_number", details)
		}
	},
	getTrackingNumber)

// ── Catálogo ─────────────────────────────────────────────────────────────

export const itemsList = shopOperation("items/list",
	(body, details) => {
		const itemStatus = body.item_status === undefined || body.item_status === null
			? undefined
			: body.item_status

		if (itemStatus !== undefined && !(Array.isArray(itemStatus) && itemStatus.every(isNonEmptyString))) {
			details.push("item_status: lista de strings (NORMAL, BANNED, UNLIST…)")
		}

		return {
			offset: optionalInt(
				body.offset, "offset", 0, Number.MAX_SAFE_INTEGER, details
			),
			pageSize: optionalInt(
				body.page_size, "page_size", 1, MAX_PAGE, details
			),
			itemStatus
		}
	},
	getItemList)

export const itemsBaseInfo = shopOperation("items/base-info",
	(body, details) => {
		if (!isIdList(body.item_id_list, MAX_LIST)) details.push(`item_id_list: lista de 1 a ${MAX_LIST} item_id`)

		return { itemIdList: Array.isArray(body.item_id_list) ? body.item_id_list.map(String) : [] }
	},
	getItemBaseInfo)

export const itemsModels = shopOperation("items/models",
	(body, details) => {
		if (!isId(body.item_id)) details.push("item_id: obrigatório, numérico")

		return { itemId: String(body.item_id) }
	},
	getModelList)

// ── Token (APIs públicas: sem access_token) ──────────────────────────────

export const tokenRefresh = async (req, res) => {
	const body = req.body || {}
	const details = []

	if (!isId(body.shop_id)) details.push("shop_id: obrigatório, numérico")
	if (!isNonEmptyString(body.refresh_token)) details.push("refresh_token: obrigatório")
	if (details.length > 0) return invalid(res, details)

	const log = { op: "token/refresh", shop_id: String(body.shop_id), started_at: Date.now() }

	try {
		return respond(res, await refreshAccessToken({ shopId: body.shop_id, refreshToken: body.refresh_token }), log)
	} catch (error) {
		return failed(res, error, log)
	}
}

export const tokenExchange = async (req, res) => {
	const body = req.body || {}
	const details = []

	if (!isId(body.shop_id)) details.push("shop_id: obrigatório, numérico")
	if (!isNonEmptyString(body.code)) details.push("code: obrigatório")
	if (details.length > 0) return invalid(res, details)

	const log = { op: "token/exchange", shop_id: String(body.shop_id), started_at: Date.now() }

	try {
		return respond(res, await exchangeCode({ shopId: body.shop_id, code: body.code }), log)
	} catch (error) {
		return failed(res, error, log)
	}
}

export const authAuthorizeUrl = (req, res) => {
	const body = req.body || {}

	if (!isNonEmptyString(body.redirect) || !/^https?:\/\//.test(body.redirect)) {
		return invalid(res, ["redirect: URL http(s) do callback do 3print"])
	}

	try {
		return res.json({ ok: true, data: { url: authorizeUrl({ redirect: body.redirect }) } })
	} catch (error) {
		return failed(res, error, { op: "auth/authorize-url" })
	}
}

// ── Diagnóstico ──────────────────────────────────────────────────────────

export const whoami = async (req, res) => {
	try {
		return res.json({ ok: true, data: { egress_ip: await egressIp() } })
	} catch (error) {
		return res.status(502).json({ ok: false, error: "whoami_unreachable", message: error.message })
	}
}

export const healthz = (req, res) => res.json({ ok: true, version })
