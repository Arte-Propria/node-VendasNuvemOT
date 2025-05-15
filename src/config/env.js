import dotenv from "dotenv"

dotenv.config()

export const config = {
	port: process.env.PORT || 3000,
	webhookSecret: process.env.WEBHOOK_SECRET || "default-secret",
	tinyApiToken: process.env.TINY_API_TOKEN,
	tinyApiTokenArteIntegrada: process.env.TINY_API_TOKEN_ARTEINTEGRADA,
	tinyApiTokenArteIntegradaES: process.env.TINY_API_TOKEN_ARTEINTEGRADAES,
	tinyApiBaseUrl: "https://api.tiny.com.br/api2",
	nuvemshopApiBaseUrl: "https://api.tiendanube.com/v1",
	accessTokenOutlet: process.env.ACCESS_TOKEN_OUTLET,
	accessTokenArtePropria: process.env.ACCESS_TOKEN_ARTEPROPRIA,
	storeIdOutlet: process.env.STORE_ID_OUTLET,
	storeIdArtePropria: process.env.STORE_ID_ARTEPROPRIA
}
