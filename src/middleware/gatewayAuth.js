import { timingSafeEqual } from "crypto"
import { config } from "../config/env.js"

/**
 * Autenticação das rotas do gateway da Shopee (X-Gateway-Key ou
 * Authorization: Bearer). Só o 3print chama estas rotas; o resto do serviço
 * continua sem autenticação, como sempre foi.
 *
 * Comparação em tempo constante: a chave é o único segredo entre os dois
 * servidores, e um `===` vaza o tamanho do prefixo que casou.
 */
const keyFromRequest = (req) => {
	const header = req.get("x-gateway-key")
	if (header) return header.trim()

	const authorization = req.get("authorization") || ""
	return authorization.toLowerCase().startsWith("bearer ")
		? authorization.slice(7).trim()
		: ""
}

const sameKey = (received, expected) => {
	const a = Buffer.from(received)
	const b = Buffer.from(expected)
	return a.length === b.length && timingSafeEqual(a, b)
}

export const gatewayAuth = (req, res, next) => {
	const { keys } = config.shopeeGateway

	if (keys.length === 0) {
		return res.status(503).json({
			ok: false,
			error: "gateway_not_configured",
			message: "SHOPEE_GATEWAY_KEYS não configurada neste ambiente"
		})
	}

	const received = keyFromRequest(req)

	if (!received || !keys.some((key) => sameKey(received, key))) {
		return res.status(401).json({ ok: false, error: "unauthorized" })
	}

	return next()
}
