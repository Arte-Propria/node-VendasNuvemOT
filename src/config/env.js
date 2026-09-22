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
	// Sem fallback de propósito: um default tornaria a chave pública e previsível.
	// Ausente, as rotas de escrita de /webar/images respondem 503.
	webarWriteKey: process.env.WEBAR_WRITE_KEY,
	// Storage das artes do WebAR. Segredos sem fallback pelo mesmo motivo acima:
	// ausentes, a rota de upload responde 503 em vez de abrir por omissão.
	supabaseUrl: process.env.SUPABASE_URL,
	supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
	// Nome de bucket não é segredo: default explícito é aceitável.
	webarBucket: process.env.WEBAR_BUCKET || "webar-quadros",
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
	// Gateway da Shopee para o 3print: este serviço tem IP de saída fixo na
	// Render, e a Shopee só libera dados do comprador para IP whitelistado.
	// É o app da 3PRINT (partner 2039038) — não o SHOPEE_PARTNER_* acima, que
	// é outro app. Ver README › "Gateway da Shopee para o 3print".
	shopeeGateway: {
		partnerId: process.env.SHOPEE_3PRINT_PARTNER_ID,
		partnerKey: process.env.SHOPEE_3PRINT_PARTNER_KEY,
		host: process.env.SHOPEE_3PRINT_HOST || "https://partner.shopeemobile.com",
		// Abaixo dos 25s que o 3print espera pelo gateway: o 502 chega antes
		// de o outro lado estourar o próprio timeout.
		timeoutMs: Number(process.env.SHOPEE_3PRINT_TIMEOUT_MS || 20000),
		// Chaves aceitas no X-Gateway-Key. CSV para rotação sem janela: duas
		// chaves valem ao mesmo tempo enquanto o 3print troca para a nova.
		keys: (process.env.SHOPEE_GATEWAY_KEYS || "")
			.split(",")
			.map((key) => key.trim())
			.filter(Boolean),
		whoamiUpstream:
      process.env.WHOAMI_UPSTREAM || "https://checkip.amazonaws.com"
	},
	sheinClientId: process.env.SHEIN_APP_ID,
	sheinClientSecret: process.env.SHEIN_SECRET_KEY,
	sheinRedirectUri: process.env.SHEIN_REDIRECT_URI,
	// App Nuvemshop (OAuth)
	nuvemshopClientId: process.env.CLIENT_ID,
	nuvemshopClientSecret: process.env.CLIENT_SECRET,
	nuvemshopRedirectUri: process.env.NUVEMSHOP_REDIRECT_URI,
	geminiApiKey: process.env.GEMINI_API_KEY
}
