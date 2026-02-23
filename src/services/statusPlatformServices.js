import { query } from "../db/db.js"

export const getStatusPlatformService = async (platform) => {
	try {
		const status = await query(`SELECT status FROM status_platform WHERE platform = $1`, [platform])
		return status.rows[0].status
	} catch (error) {
		console.error(`Erro ao obter status da plataforma ${platform}: ${error}`)
		throw new Error(`Erro ao obter status da plataforma ${platform}: ${error}`)
	}
}

export const updateStatusPlatformService = async (data) => {
	const { platform, status } = data

	try {
		const result = await query(`UPDATE status_platform SET status = $1 WHERE platform = $2`, [status, platform])
		return result
	} catch (error) {
		console.error(`Erro ao atualizar status da plataforma ${platform}: ${error}`)
		throw new Error(`Erro ao atualizar status da plataforma ${platform}: ${error}`)
	}
}