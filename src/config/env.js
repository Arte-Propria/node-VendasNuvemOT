import dotenv from "dotenv"

dotenv.config()

export const config = {
	port: process.env.PORT || 3000,
	db: {
		host: process.env.POSTGRESQL_HOSTNAME,
		port: process.env.POSTGRESQL_PORT,
		database: process.env.POSTGRESQL_DATABASE,
		user: process.env.POSTGRESQL_USERNAME,
		password: process.env.POSTGRESQL_PASSWORD,
		// O banco é compartilhado com outro sistema: o schema precisa ser explícito.
		schema: process.env.POSTGRESQL_SCHEMA,
		// O Supabase impõe 2min por padrão; o Render não impunha limite algum.
		statementTimeout: process.env.POSTGRESQL_STATEMENT_TIMEOUT || "120000",
		poolMax: Number(process.env.POSTGRESQL_POOL_MAX || 10)
	},
	webhookSecret: process.env.WEBHOOK_SECRET || "default-secret",
	tinyApiToken: process.env.TINY_API_TOKEN,
	tinyApiTokenBasel: process.env.TINY_API_TOKEN_BASEL,
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
	sheinRedirectUri: process.env.SHEIN_REDIRECT_URI,
	// App Nuvemshop (OAuth)
	nuvemshopClientId: process.env.CLIENT_ID,
	nuvemshopClientSecret: process.env.CLIENT_SECRET,
	nuvemshopRedirectUri: process.env.NUVEMSHOP_REDIRECT_URI,
	geminiApiKey: process.env.GEMINI_API_KEY
}
