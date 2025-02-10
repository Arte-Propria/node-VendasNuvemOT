import pkg from "pg"
import dotenv from "dotenv"

dotenv.config()

const { Pool } = pkg

const host = process.env.POSTGRESQL_HOSTNAME
const port = process.env.POSTGRESQL_PORT
const database = process.env.POSTGRESQL_DATABASE
const user = process.env.POSTGRESQL_USERNAME
const password = process.env.POSTGRESQL_PASSWORD

const pool = new Pool({
	user,
	host,
	database,
	password,
	port,
	ssl: {
		rejectUnauthorized: false
	}
})

export const query = (text, params) => pool.query(text, params)
