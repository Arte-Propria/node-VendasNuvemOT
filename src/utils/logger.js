export const log = (message) => {
	console.log(`[${new Date().toISOString()}] ${message}`)
}

export const logWebhook = (message) => {
	console.log(`WEBHOOK: ${message}`)
}

export const logWebhookMarketplace = (message) => {
	console.log(`WEBHOOK Marketplace: ${message}`)
}

export const logEcommerce = (message) => {
	console.log(`WEBHOOK Ecommerce: ${message}`)
}

export const logMarketplace = (message) => {
	console.log(`Marketplace: ${message}`)
}

export const logPCP = (message) => {
	console.log(`PCP: ${message}`)
}

export const logDB = (message) => {
	console.log(`DB: ${message}`)
}

export const logChatFunnel = (message) => {
	console.log(`ChatFunnel: ${message}`)
}
