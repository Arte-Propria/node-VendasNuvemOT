export const log = (message) => {
	console.log(`[${new Date().toISOString()}] ${message}`)
}
export const logWebhook = (message) => {
	console.log(`WEBHOOK Marketplace: ${message}`)
}
