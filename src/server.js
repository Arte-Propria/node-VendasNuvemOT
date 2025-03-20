import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import router from "./routes/router.js"
import { config } from "./config/env.js"

dotenv.config()

const app = express()
const PORT = config.port

const allowedOrigins = [
	"https://vendas-nuvem-ot.vercel.app", // Seu front-end na Vercel
	"http://localhost:8001", // Ambiente local
	"http://localhost:5173" // Ambiente local
]

app.use(cors({ origin: "*" }))

app.use(express.json())

app.use(router)

app.listen(PORT, () => {
	console.log(`Servidor rodando na porta ${PORT}`)
})
