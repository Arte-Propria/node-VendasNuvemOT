import dotenv from "dotenv"

dotenv.config()

export const config = {
	port: process.env.PORT || 3000,
	webhookSecret: process.env.WEBHOOK_SECRET || "default-secret",
	tinyApiToken: process.env.TINY_API_TOKEN,
	tinyApiTokenArteIntegrada: process.env.TINY_API_TOKEN_ARTEINTEGRADA,
	tinyApiTokenArteIntegradaES: process.env.TINY_API_TOKEN_ARTEINTEGRADAES,
	tinyApiBaseUrl: "https://api.tiny.com.br/api2"
}
