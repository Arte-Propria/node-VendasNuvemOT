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
export async function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

// Função para gerar estado aleatório para segurança
export function generateRandomState() {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// Função para gerar datas em intervalos de 5 dias
export function generateDateRanges(daysBack) {
	const ranges = []
	const endDate = new Date()
	const startDate = new Date()
	startDate.setDate(startDate.getDate() - daysBack)
	
	let currentStart = new Date(startDate)
	
	while (currentStart < endDate) {
		const currentEnd = new Date(currentStart)
		currentEnd.setDate(currentEnd.getDate() + 3) // 3 dias (incluindo o dia inicial)
		
		if (currentEnd > endDate) {
			currentEnd.setTime(endDate.getTime())
		}
		
		// Formata as datas para dd/mm/yyyy
		const formatDate = (date) => {
			const day = date.getDate().toString().padStart(2, "0")
			const month = (date.getMonth() + 1).toString().padStart(2, "0")
			const year = date.getFullYear()
			return `${day}/${month}/${year}`
		}
		
		ranges.push({
			dataInicial: formatDate(currentStart),
			dataFinal: formatDate(currentEnd)
		})
		
		currentStart.setDate(currentStart.getDate() + 5)
	}
	
	return ranges
}