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

app.use(cors({
	origin: function (origin, callback) {
		if (!origin || allowedOrigins.includes(origin)) {
			callback(null, true)
		} else {
			callback(new Error("Not allowed by CORS"))
		}
	},
	credentials: true, // Permite envio de cookies/sessões se necessário
	methods: "GET,POST,PUT,DELETE,OPTIONS", // Métodos permitidos
	allowedHeaders: "Content-Type,Authorization" // Headers permitidos
}))

app.use(express.json())

app.use(router)

app.listen(PORT, () => {
	console.log(`Servidor rodando na porta ${PORT}`)
})
