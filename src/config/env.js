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
	storeIdArtePropria: process.env.STORE_ID_ARTEPROPRIA,
	googleClientEmail: process.env.GOOGLE_CLIENT_EMAIL_GSHEETS,
	googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY_GSHEETS,
	googleIdGSheets: process.env.GOOGLE_ID_GSHEETS,
	shopeePartnerId: process.env.SHOPEE_PARTNER_ID,
	shopeePartnerKey: process.env.SHOPEE_PARTNER_KEY,
	shopeeRedirectUri: process.env.SHOPEE_REDIRECT_URI,
	sheinClientId: process.env.SHEIN_APP_ID,
	sheinClientSecret: process.env.SHEIN_SECRET_KEY,
	sheinRedirectUri: process.env.SHEIN_REDIRECT_URI
}
