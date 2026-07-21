import { pool, schema } from "./db.js"

const diagnostico = `
	SELECT current_database() AS banco,
	       current_schema()   AS schema_efetivo,
	       (SELECT count(*)
	          FROM information_schema.tables
	         WHERE table_schema = current_schema()) AS tabelas
`

pool
	.query(diagnostico)
	.then(({ rows }) => {
		const { banco, schema_efetivo, tabelas } = rows[0]
		console.log("Conectado ao banco de dados", { banco, schema_efetivo, tabelas })

		if (schema_efetivo !== schema) {
			console.error(
				`ATENÇÃO: search_path resolveu para "${schema_efetivo}", esperado "${schema}".`
			)
			process.exitCode = 1
		}
	})
	.catch((err) => {
		console.error("Erro ao conectar ao banco de dados:", err.message)
		process.exitCode = 1
	})
	.finally(() => pool.end())
