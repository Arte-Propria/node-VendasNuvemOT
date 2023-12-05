import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import productRoutes from "./routes/router.js"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000 // Define a porta do servidor

app.use(express.json())

app.use(cors())

app.get("/products", productRoutes)
app.get("/orders", productRoutes)

app.listen(PORT, () => {
	console.log(`Servidor rodando na porta ${PORT}`)
})
