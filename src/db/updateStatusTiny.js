import { query } from "./db.js"

export const updateStatusPlatform = async (data) => {
	const { platform, status } = data

	const dataUpdateOrderTiny = {
    platform,
		status,
	}

	const queryText = `
		UPDATE status_platform
		SET status = $2
		WHERE platform = $1
	`

	const values = [...Object.values(dataUpdateOrderTiny)]
	const result = await query(queryText, values)
	return result
}