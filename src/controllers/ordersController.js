import { query } from "../db/db.js"
import { fetchOrder, fetchOrders, insertOrders } from "../services/orderServicesNuvem.js"

export const getOrders = async (req, res) => {
	try {
		const params = req.params
		const orders = await fetchOrders(params)
		if(orders.length > 0) {
			await insertOrders(orders, params.store)
		}
		res.status(200).send("Pedidos atualizados")
	} catch (error) {
		console.error(error)
		res.status(404).send("Erro ao buscar pedidos")
	}
}

export const getOrder = async (req, res) => {
	try {
		const params = req.params
		const orders = await fetchOrder(params)
		console.log(orders)
		res.status(200).json(orders)
	} catch (error) {
		console.error(error)
		res.status(404).send("Erro ao buscar pedido")
	}
}

// Buscar pedidos por data
export const getOrdersByDate = async (req, res) => {
	const { store, createdAtMin, createdAtMax } = req.params

	let startDate = new Date(createdAtMin)
	startDate.setDate(startDate.getDate() - 1) // Subtrai um dia
	startDate.setHours(startDate.getHours() - 3) // Ajuste para UTC-3
  
	let endDate = new Date(createdAtMax)
	endDate.setDate(endDate.getDate() + 1) // Adiciona um dia
	endDate.setHours(endDate.getHours() - 3) // Ajuste para UTC-3

	try {
		const tableName = store === "outlet" ? "pedidos_outlet" : "pedidos_artepropria"
		// Formatando as datas para o formato YYYY-MM-DD
		const startDateSQL = startDate.toISOString().slice(0, 10)
		const endDateSQL = endDate.toISOString().slice(0, 10)

		const result = await query(`SELECT * FROM ${tableName} WHERE DATE(created_at) BETWEEN '${startDateSQL}' AND '${endDateSQL}'`)
		res.json(result.rows)
	} catch (err) {
		console.error("Erro ao buscar pedidos:", err)
		res.status(500).json({ error: "Erro ao buscar pedidos" })
	}
}

export const getOrdersByStore = async (req, res) => {
	const { store } = req.params

	try {
		const tableName = store === "outlet" ? "pedidos_outlet" : "pedidos_artepropria"
		const result = await query(`SELECT * FROM ${tableName}`)
		res.status(200).json(result.rows)
	} catch (err) {
		console.error("Erro ao buscar pedidos:", err)
		res.status(500).json({ error: "Erro ao buscar pedidos" })
	}
}

export const updateAllOrdersFromDateRange = async (req, res) => {
	const { store } = req.params
	const endDate = new Date("2023-11-20")  // Data final da busca
	let currentDate = new Date()            // Inicia a busca a partir de hoje

	try {
		// Loop até que a data atual seja menor que a data de 2023-11-20
		while (currentDate > endDate) {
			const previousMonth = new Date(currentDate)
			previousMonth.setMonth(previousMonth.getMonth() - 1) // Retrocede um mês

			if (previousMonth < endDate) {
				previousMonth.setDate(endDate.getDate()) // Se o mês anterior for menor que a data final, ajusta para a data final
			}

			const startDateISO = previousMonth.toISOString().slice(0, 10)
			const currentDateISO = currentDate.toISOString().slice(0, 10)

			console.log(`Buscando pedidos entre ${startDateISO} e ${currentDateISO}`)

			// Buscando pedidos mês a mês
			const orders = await fetchOrders({ store, createdAtMin: startDateISO, createdAtMax: currentDateISO })

			if (orders.length > 0) {
				console.log("Salvando no banco de dados...")
				await insertOrders(orders, store)
				console.log(`Pedidos de ${startDateISO} até ${currentDateISO} foram salvos no banco.`)
			} else {
				console.log(`Nenhum pedido encontrado entre ${startDateISO} e ${currentDateISO}`)
			}

			// Atualiza a data atual para o mês anterior
			currentDate = previousMonth
		}

		res.status(200).send("Todos os pedidos foram recuperados e atualizados com sucesso.")
	} catch (error) {
		console.error("Erro ao buscar pedidos:", error)
		res.status(500).send("Erro ao buscar e salvar pedidos.")
	}
}

export const updateOrdersTinyIntegradaES = async (req, res) => {
	const { store, createdAtMin, createdAtMax } = req.params

	try {
		const orders = await fetchOrders({ store, createdAtMin, createdAtMax })
		console.log(orders)
		res.status(200).json(orders)
	} catch (error) {
		console.error(error)
		res.status(404).send("Erro ao buscar pedidos")
	}
}
