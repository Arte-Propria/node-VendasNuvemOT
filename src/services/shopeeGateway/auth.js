import { config } from "../../config/env.js"
import { callPublic, partnerId, signPublic } from "./client.js"

/**
 * Fluxo de token. O 3print é dono dos tokens (guarda, decide quando renovar,
 * faz o OAuth da loja); aqui só entra o que precisa da partner_key.
 */

const AUTH_PARTNER_PATH = "/api/v2/shop/auth_partner"

/** POST /api/v2/auth/access_token/get — a Shopee ROTACIONA o refresh_token a cada renovação. */
export const refreshAccessToken = ({ shopId, refreshToken }) =>
	callPublic({
		path: "/api/v2/auth/access_token/get",
		body: {
			partner_id: Number(partnerId()),
			shop_id: Number(shopId),
			refresh_token: refreshToken
		}
	})

/** POST /api/v2/auth/token/get — troca o `code` do callback OAuth pelo primeiro par de tokens. */
export const exchangeCode = ({ shopId, code }) =>
	callPublic({
		path: "/api/v2/auth/token/get",
		body: {
			code,
			shop_id: Number(shopId),
			partner_id: Number(partnerId())
		}
	})

/** URL assinada para a loja autorizar o app; o `redirect` é do 3print (o callback é dele). */
export const authorizeUrl = ({ redirect }) => {
	const timestamp = Math.floor(Date.now() / 1000)
	const search = new URLSearchParams({
		partner_id: partnerId(),
		timestamp: String(timestamp),
		sign: signPublic(AUTH_PARTNER_PATH, timestamp),
		redirect
	})

	return `${config.shopeeGateway.host}${AUTH_PARTNER_PATH}?${search.toString()}`
}
