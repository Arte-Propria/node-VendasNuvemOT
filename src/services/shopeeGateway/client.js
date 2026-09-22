import axios from "axios"
import { createHmac } from "crypto"
import { config } from "../../config/env.js"

/**
 * Cliente da Shopee OpenAPI v2 do app da 3print.
 *
 * Aqui mora tudo que exige a partner_key: a assinatura HMAC-SHA256 das
 * chamadas de loja (partner_id + path + timestamp + access_token + shop_id)
 * e das públicas (partner_id + path + timestamp). O 3print manda o
 * access_token da loja em cada chamada e continua dono dos tokens — este
 * serviço não guarda estado nenhum.
 *
 * Toda chamada volta CLASSIFICADA em um de quatro desfechos (RESULT), para o
 * controller aplicar um contrato de resposta único. A Shopee acusa token
 * inválido de duas formas — HTTP 403, ou 200 com `error_auth` /
 * `invalid_acceess_token` (sic, é assim que ela escreve) — e as duas viram
 * TOKEN_REJECTED, que é o que faz o 3print renovar o token e repetir.
 */
export const RESULT = {
	OK: "ok",
	TOKEN_REJECTED: "token_rejected",
	SHOPEE_ERROR: "shopee_error",
	UNREACHABLE: "unreachable"
}

const TOKEN_ERRORS = [
	"error_auth",
	"invalid_acceess_token",
	"invalid_access_token"
]

/** Campos de envelope da Shopee, que não são dado da operação. */
const ENVELOPE_FIELDS = ["error", "message", "request_id", "warning"]

export class GatewayNotConfigured extends Error {
	constructor() {
		super("SHOPEE_3PRINT_PARTNER_ID / SHOPEE_3PRINT_PARTNER_KEY não configurados")
		this.name = "GatewayNotConfigured"
	}
}

const credentials = () => {
	const { partnerId, partnerKey } = config.shopeeGateway

	if (!partnerId || !partnerKey) {
		throw new GatewayNotConfigured()
	}

	return { partnerId: String(partnerId), partnerKey }
}

const hmac = (base, key) =>
	createHmac("sha256", key).update(base).digest("hex")

/** Assinatura das APIs públicas (auth/token, access_token/get, shop/auth_partner). */
export const signPublic = (path, timestamp) => {
	const { partnerId, partnerKey } = credentials()
	return hmac(`${partnerId}${path}${timestamp}`, partnerKey)
}

/** Assinatura das APIs de loja (pedidos, produtos, logística). */
export const signShop = (
	path, timestamp, accessToken, shopId
) => {
	const { partnerId, partnerKey } = credentials()
	return hmac(`${partnerId}${path}${timestamp}${accessToken}${shopId}`,
		partnerKey)
}

export const partnerId = () => credentials().partnerId

/**
 * Query string como a Shopee espera. Lista vira parâmetro REPETIDO
 * (`item_status=NORMAL&item_status=BANNED`); o padrão da axios (`key[]=`) ela
 * não entende. Onde a Shopee pede CSV (`order_sn_list`) quem monta os params
 * já manda a string pronta.
 */
const serializeParams = (params) => {
	const search = new URLSearchParams()

	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null || value === "") continue

		if (Array.isArray(value)) {
			value.forEach((item) => search.append(key, String(item)))
		} else {
			search.append(key, String(value))
		}
	}

	return search.toString()
}

const stripEnvelope = (data) =>
	Object.fromEntries(Object.entries(data).filter(([key]) => !ENVELOPE_FIELDS.includes(key)))

const classify = (response) => {
	const data = response.data && typeof response.data === "object" ? response.data : {}
	const shopeeError = String(data.error || "")
	const shopee = {
		error: shopeeError,
		message: String(data.message || ""),
		request_id: String(data.request_id || "")
	}

	if (response.status === 403 || TOKEN_ERRORS.includes(shopeeError)) {
		return { result: RESULT.TOKEN_REJECTED, status: response.status, shopee }
	}

	if (response.status >= 400 || shopeeError !== "") {
		return { result: RESULT.SHOPEE_ERROR, status: response.status, shopee }
	}

	// APIs de loja embrulham o dado em `response`; as de token (auth/token/get,
	// access_token/get) devolvem os campos na raiz, ao lado do envelope.
	const payload = data.response !== undefined ? data.response : stripEnvelope(data)

	return {
		result: RESULT.OK,
		status: response.status,
		data: payload,
		requestId: shopee.request_id
	}
}

const request = async ({ method, path, params, body }) => {
	const { host, timeoutMs } = config.shopeeGateway

	try {
		const response = await axios({
			method,
			url: `${host}${path}`,
			params,
			paramsSerializer: serializeParams,
			data: body,
			timeout: timeoutMs,
			// Status HTTP entra na classificação; erro só para falha de rede.
			validateStatus: () => true,
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "node-vendasnuvemot-shopee-gateway"
			}
		})

		return classify(response)
	} catch (error) {
		const timedOut = error.code === "ECONNABORTED"
		const message = timedOut ? `Shopee não respondeu em ${timeoutMs}ms` : error.message

		return { result: RESULT.UNREACHABLE, status: 502, message }
	}
}

/** Chamada de loja: assina com o access_token da loja que o 3print mandou. */
export const callShop = ({
	shopId,
	accessToken,
	method = "GET",
	path,
	params = {},
	body
}) => {
	const timestamp = Math.floor(Date.now() / 1000)

	return request({
		method,
		path,
		params: {
			partner_id: partnerId(),
			timestamp,
			access_token: accessToken,
			shop_id: shopId,
			sign: signShop(
				path, timestamp, accessToken, shopId
			),
			...params
		},
		body
	})
}

/** Chamada pública: só partner_id + timestamp + sign na query. */
export const callPublic = ({ method = "POST", path, params = {}, body }) => {
	const timestamp = Math.floor(Date.now() / 1000)

	return request({
		method,
		path,
		params: {
			partner_id: partnerId(),
			timestamp,
			sign: signPublic(path, timestamp),
			...params
		},
		body
	})
}
