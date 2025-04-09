export const log = (message) => {
	console.log(`[${new Date().toISOString()}] ${message}`)
}

export const logWebhook = (message) => {
	console.log(`WEBHOOK Marketplace: ${message}`)
}

export const logEcommerce = (message) => {
	console.log(`WEBHOOK Ecommerce: ${message}`)
}


export const logMarketplace = (message) => {
	console.log(`Marketplace: ${message}`)
}
