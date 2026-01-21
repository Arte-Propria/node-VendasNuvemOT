import { fetchRequest } from "../services/segmentacaoServices.js"
import { query } from '../db/db.js';

export const getDbQuery = async (req, res) => {
  try {
    const { querySelect } = req.params

    const result = await query(`SELECT * FROM ${querySelect}`);

    const queryData = await fetchRequest(result, querySelect)

    return res.status(200).json(queryData);
  } catch (err) {
    console.error('Erro ao buscar database:', err);
    return res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
};