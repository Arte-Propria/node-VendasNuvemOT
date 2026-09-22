import axios from "axios"
import { config } from "../../config/env.js"

/**
 * IP de saída deste serviço, visto de fora — o que a Shopee enxerga e o que
 * precisa estar no whitelist do app. O 3print confere diariamente contra a
 * lista que foi cadastrada lá.
 */
export const egressIp = async () => {
	const { whoamiUpstream, timeoutMs } = config.shopeeGateway
	const response = await axios.get(whoamiUpstream, {
		timeout: timeoutMs,
		responseType: "text"
	})

	return String(response.data).trim()
}
