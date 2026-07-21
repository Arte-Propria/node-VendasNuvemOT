import pkg from "pg"
import dotenv from "dotenv"
import { config } from "../config/env.js"

dotenv.config()

const { Pool } = pkg

const { host, port, database, user, password, statementTimeout, poolMax } =
	config.db
const schema = config.db.schema

// O banco de destino é compartilhado: o schema `public` pertence a outro sistema
// e tem uma tabela `clientes` homônima à nossa. Como todas as queries do projeto
// usam nomes não-qualificados, cair no schema errado gravaria em produção alheia
// sem erro nenhum — por isso aqui é falha na largada, não default silencioso.
if (!schema) {
	throw new Error(
		"POSTGRESQL_SCHEMA não definido. Informe o schema do banco (ex.: pedidos_db)."
	)
}

if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
	throw new Error(`POSTGRESQL_SCHEMA inválido: "${schema}".`)
}

const pool = new Pool({
	user,
	host,
	database,
	password,
	port,
	max: poolMax,
	// O `search_path` precisa vir como opção de inicialização porque o role no
	// Supabase já traz um search_path próprio, e só as opções de conexão têm
	// precedência sobre a configuração do role.
	// Um `-c` só: o pooler (Supavisor) descarta os parâmetros seguintes.
	options: `-c search_path=${schema}`,
	ssl: {
		rejectUnauthorized: false
	}
})

// O que o `options` não consegue entregar vai aqui, na abertura de cada sessão:
// o statement_timeout (o Supabase impõe 2min por padrão) e um reforço do
// search_path, caso algum intermediário descarte as opções de inicialização.
pool.on("connect", (client) => {
	client
		.query(
			`SET search_path TO ${schema}; SET statement_timeout TO ${Number(statementTimeout)}`
		)
		.catch((err) => {
			console.error("Falha ao preparar a sessão do banco:", err.message)
		})
})

export const query = (text, params) => pool.query(text, params)

// Exporta o pool para fluxos que precisam de uma conexão dedicada (ex.: transações
// BEGIN/COMMIT com pool.connect()), já que query() pode usar conexões distintas.
export { pool, schema }
