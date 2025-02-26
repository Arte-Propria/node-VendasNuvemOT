import dotenv from "dotenv"
import { fetchOrders, insertOrders } from "./services/orderServicesNuvem.js"

dotenv.config()

// Função para buscar e inserir pedidos
export const processOrders = async (store, startDate, endDate) => {
	try {
		const orders = await fetchOrders({ store, createdAtMin: startDate, createdAtMax: endDate })
		if(orders.length > 0) {
			await insertOrders(orders, store)
			console.log(`Pedidos da loja ${store} processados com sucesso.`)
		}
	} catch (err) {
		console.error(`Erro ao processar pedidos da loja ${store}:`, err.response.data)
	}
}

export const updateTodayOrders = async () => {
	const currentDateStart = new Date()
	currentDateStart.setHours(
		0, 0, 0, 0
	)

	const currentDateEnd = new Date()
	currentDateEnd.setHours(currentDateEnd.getHours() - 3)

	console.log("Iniciando a atualização de pedidos do dia atual...")
	await processOrders("outlet", currentDateStart.toISOString(), currentDateEnd.toISOString())
	await processOrders("artepropria", currentDateStart.toISOString(), currentDateEnd.toISOString())
}

export const updateLastTwoMonthsOrders = async ({ store }) => {
	// Define o mês de dois meses atrás
	let startMonth = new Date()
	startMonth.setMonth(startMonth.getMonth() - 2)
	startMonth.setDate(1)

	// Define o mês atual como o limite final
	const currentMonth = new Date()
	currentMonth.setDate(1)

	while (startMonth <= currentMonth) {
		const startDate = new Date(startMonth)
		let endDate = new Date(startMonth)

		if (startMonth.getMonth() === currentMonth.getMonth() && startMonth.getFullYear() === currentMonth.getFullYear()) {
			// Se for o mês atual, define o dia final como o dia atual
			endDate = new Date()
		} else {
			// Se não for o mês atual, define o último dia do mês
			endDate.setMonth(endDate.getMonth() + 1)
			endDate.setDate(0)
		}

		console.log(`Iniciando a atualização de pedidos de ${store} ${startDate.toISOString()} até ${endDate.toISOString()}...`)
    
		await processOrders(store, startDate.toISOString(), endDate.toISOString())

		// Avança para o próximo mês
		startMonth.setMonth(startMonth.getMonth() + 1)
		startMonth.setDate(1) // Ajusta para o primeiro dia do mês
	}
}

export const updateAllOrders = async () => {
	let startDate = new Date("2023-11-22")
	const endDate = new Date()

	while (startDate < endDate) {
		const currentEndDate = new Date(startDate)
		currentEndDate.setMonth(currentEndDate.getMonth() + 1)
		if (currentEndDate > endDate) {
			currentEndDate = endDate
		}
    
		console.log(`Iniciando a atualização de pedidos de ${startDate.toISOString()} até ${currentEndDate.toISOString()}...`)

		await processOrders("outlet", startDate.toISOString(), currentEndDate.toISOString())
		await processOrders("artepropria", startDate.toISOString(), currentEndDate.toISOString())

		startDate.setMonth(startDate.getMonth() + 1)
		startDate.setDate(1) // Avançando para o início do próximo mês
	}
}


