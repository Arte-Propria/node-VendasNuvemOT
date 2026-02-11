import { fetchRequest, filterBdByDateRange } from "../services/segmentacaoServices.js"
import { query } from '../db/db.js';

export const getDbQuery = async (req, res) => {
  try {
    const { querySelect, startDate, endDate } = req.params

    const result = await query(`SELECT * FROM ${querySelect}`);

    const queryData = await fetchRequest(result, querySelect);

    const filterDataByDate = await filterBdByDateRange(queryData, querySelect, { startDate, endDate })

    return res.status(200).json(filterDataByDate);
  } catch (err) {
    console.error('Erro ao buscar database:', err);
    return res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
};