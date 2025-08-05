import { query } from "../db/db.js"
import {fetchTestRequest} from '../services/mandaeServices.js'

// Buscar pedidos por data
export const getMandaeInfo = async (req, res) => {
  const { store } = req.params

  try {
    const result = await fetchTestRequest()
    res.json(result)
  } catch (err) {
    console.error("Erro ao buscar pedidos:", err)
    res.status(500).json({ error: "Erro ao buscar pedidos" })
  }
}

export const getOMandaeInfoByStore = async (req, res) => {
  const { store } = req.params

  try {
    const result = await query(`SELECT * FROM info_mandae`)
    res.status(200).json(result.rows)
  } catch (err) {
    console.error("Erro ao buscar pedidos:", err)
    res.status(500).json({ error: "Erro ao buscar pedidos" })
  }
}
