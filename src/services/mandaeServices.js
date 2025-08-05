/* eslint-disable camelcase */
import axios from "axios"
import dotenv from "dotenv"
import { query } from "../db/db.js"

dotenv.config()

// 1. Função para realizar o fetch básico (≤30 dias)
export const fetchTestRequest = async (store, startDate, endDate) => {
	let allDeliveries = []

	try {
		const response = await query(`SELECT * FROM info_mandae`)

		const result =  response.rows.map((delivery) => ({
			id: delivery.id_ped,
			order_id: delivery.cod_ped,
			name_client: delivery.nome_cli,
			lastDate: delivery.dt_pag,
			rastreio: delivery.cod_rastreio,
			total: delivery.valor,
			status: delivery.situacao
		}))
		allDeliveries = allDeliveries.concat(result)

		return allDeliveries || []

	} catch (error) {
		console.error(`Error fetching Deliveries data from Mandae`,error.message)
		return []
	}
}

