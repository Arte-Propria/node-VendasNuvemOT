import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import compression from "compression"
import router from "./routes/router.js"
import shopeeGatewayRouter from "./routes/shopeeGatewayRouter.js"
import { config } from "./config/env.js"

dotenv.config()

const app = express()
const PORT = config.port

app.disable("x-powered-by")
// Atrás do proxy da Render: sem isto req.ip é o IP interno do proxy.
app.set("trust proxy", true)

app.use(cors({ origin: "*" }))

// As respostas de /db/query são JSON altamente repetitivo (chaves fixas, SKUs com
// prefixo comum e os campos JSONB re-serializados pelo transform, que geram muitas
// aspas escapadas) — comprimem para cerca de 1/8. Precisa vir ANTES do router.
// É transparente para o frontend: o `fetch` descomprime sozinho.
app.use(compression())

app.use(express.json())

// Gateway da Shopee para o 3print (IP de saída fixo). Tem autenticação própria.
app.use("/gateway/shopee", shopeeGatewayRouter)

app.use(router)

app.listen(PORT, () => {
	console.log(`Servidor rodando na porta ${PORT}`)
	// O filtro de data por dia-calendário BRT depende do fuso do PROCESSO: o driver
	// `pg` materializa `timestamp without time zone` como Date em hora LOCAL, e
	// toLocalDateBR converte esse instante para America/Sao_Paulo. Registrar o TZ
	// aqui é diagnóstico — NÃO defina TZ para "corrigir": isso mudaria a saída atual.
	console.log(
		"[boot] TZ:",
		process.env.TZ ?? "(não definido)",
		"| resolvido:",
		Intl.DateTimeFormat().resolvedOptions().timeZone,
		"| offset(min):",
		new Date().getTimezoneOffset()
	)
})
