/* eslint-disable camelcase */
import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

const advertiserId = process.env.TEST_ADVERTISER_ID
const appToken = process.env.TEST_ACCESS_TOKEN

// 1. Função para realizar o fetch básico (≤30 dias)
const fetchTestRequest = async (store, startDate, endDate) => {
	const accessToken = appToken
	let allDeliveries = []

	try {
		const response = await axios.get("https://test_request/api/response/get/",
			{
				headers: {
					"Access-Token": accessToken,
					"Content-Type": "application/json"
				},
				params: {
					advertiser_id: advertiserId// Max page size to minimize requests
				}
			})
			
		const result =  response.data.data?.list

		const deliveries = result.map((delivery) => ({
			id: delivery.id,
			order_id: delivery.order_id,
			name_client: delivery.name_client,
			lastDate: delivery.lastDate,
			rastreio: delivery.rastreio,
			total: delivery.total,
			status: delivery.status
		}))
		//console.log(response.data.data?.list || [])
		allDeliveries = allDeliveries.concat(deliveries)

		return allDeliveries || []
	} catch (error) {
		console.error(`Error fetching Deliveries data from Mandae`,error.message)
		return []
	}
}

