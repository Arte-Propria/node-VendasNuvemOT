let baseId = 1000000 // Começa a partir de um milhão
let lastTimestamp = Date.now()
let sequence = 0

export function generateNumericId() {
	const now = Date.now()
	if (now === lastTimestamp) {
		sequence += 1
	} else {
		sequence = 0
		lastTimestamp = now
	}
	// Usando apenas os últimos 7 dígitos do timestamp para garantir que o valor seja menor
	const shortTimestamp = parseInt(now.toString().slice(-7))
	return baseId + shortTimestamp + sequence
}

// Utilitário para pegar o ID interno da aba pelo nome
export async function getSheetIdByName(sheets, spreadsheetId, sheetName) {
	const metadata = await sheets.spreadsheets.get({ spreadsheetId })
	const sheet = metadata.data.sheets.find((s) => s.properties.title === sheetName)
	return sheet?.properties.sheetId
}

// Função para criar um delay entre as requisições
export function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}