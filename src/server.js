import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import router from "./routes/router.js"
import { updateAllOrders } from "./automation.js"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000 // Define a porta do servidor

app.use(express.json())

app.use(cors())

app.use(router)

app.listen(PORT, () => {
	console.log(`Servidor rodando na porta ${PORT}`)

	// updateAllOrders()

	// Agendar a tarefa para rodar a cada 5 minutos
	// cron.schedule('*/5 * * * *', () => {
	// 	updateTodayOrders();
	// });

	// // Agendar a tarefa para rodar a cada 10 minutos
	// cron.schedule('*/10 * * * *', () => {
	// 	updateLastTwoMonthsOrders();
	// });
})
