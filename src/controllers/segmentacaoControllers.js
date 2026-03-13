import { fetchRequest, filterBdByDateRange, processOrderFromTiny, processOrderFromNuvemshop } from "../services/segmentacaoServices.js"

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

export const postDbQueryNuvemshop = async (req, res) => {
  try {
    const nuvemData = req.body;
    console.log('Recebido pedido Nuvemshop ID:', nuvemData?.id);

    if (!nuvemData) {
      throw new Error('Corpo da requisição vazio');
    }

    await processOrderFromNuvemshop(nuvemData);

    res.status(200).json({ message: 'Pedido processado com sucesso (simulação)' });
  } catch (error) {
    console.error('Erro ao processar:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
}

export const postDbQueryTiny = async (req, res) => {
  try {
    const nuvemData = req.body;
    await processOrderFromTiny(nuvemData);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro ao processar pedido Tiny:', error);
    res.status(500).send('Erro interno');
  }
}