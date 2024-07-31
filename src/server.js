import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import cron from 'node-cron';
import router from "./routes/router.js"
import { updateAllOrders, updateLastTwoMonthsOrders, updateTodayOrders } from "./automation.js"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000 // Define a porta do servidor

app.use(express.json())

app.use(cors())

app.use(router)

app.listen(PORT, () => {
	console.log(`Servidor rodando na porta ${PORT}`)

	// updateAllOrders()

	setInterval(() => {
		updateTodayOrders();
	}, 300000);

	setInterval(() => {
		updateLastTwoMonthsOrders();
	}, 600000);
})
