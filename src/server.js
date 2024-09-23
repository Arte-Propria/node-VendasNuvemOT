import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import router from "./routes/router.js"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000 // Define a porta do servidor

// Configura o CORS para permitir qualquer origem
app.use(cors({ origin: '*' }));

app.use(express.json())

app.use(router)

app.listen(PORT, () => {
	console.log(`Servidor rodando na porta ${PORT}`)
})
