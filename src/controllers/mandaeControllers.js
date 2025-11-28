import { query } from '../db/db.js';
import {
  fetchTestRequest,
  filterMandaeData,
  filterMandaeStore,
  batchUpdateSituacaoFromMandaeEvents,
  debugParseStatusMandaeByCodPed, batchUpdateSituacaoFromMandaeEventsParallel
} from '../services/mandaeServices.js';
import { logEcommerce } from '../utils/logger.js';

// Buscar pedidos por data
export const getMandaeInfoByDate = async (req, res) => {
  const { store, createdAtMin, createdAtMax } = req.params;

  // Log para conferencia dos parametros recebidos
  console.log('Parâmetros recebidos:', {
    store,
    createdAtMin,
    createdAtMax,
  });

  try {
    // 1. Buscar todos os dados formatados
    const formattedData = await fetchTestRequest();

    // 2. Filtrar os dados conforme parâmetros
    const filteredData = filterMandaeData(formattedData, {
      store,
      startDate: createdAtMin,
      endDate: createdAtMax,
    });

    // 3. Retornar resultados filtrados
    return res.json(filteredData);
  } catch (err) {
    console.error('Erro ao processar pedidos:', err.message);

    const statusCode = err.message.includes('inválida') ? 400 : 500;
    return res.status(statusCode).json({
      error: err.message || 'Erro interno no servidor',
      details: {
        receivedDates: {
          startDate: createdAtMin,
          endDate: createdAtMax,
        },
      },
    });
  }
};

export const getOMandaeInfo = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM info_mandae`);
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar pedidos:', err);
    return res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
};

export const getOMandaeInfoByStore = async (req, res) => {
  const { store } = req.params;

  // Log para conferencia dos parametros recebidos
  logEcommerce('Parâmetros recebidos:', {
    store,
  });

  try {
    // 1. Buscar todos os dados formatados
    const formattedData = await fetchTestRequest();

    // 2. Filtrar os dados conforme parâmetros
    const filteredData = filterMandaeStore(formattedData, {
      store,
    });

    // 3. Retornar resultados filtrados
    return res.json(filteredData);
  } catch (err) {
    console.error('Erro ao processar pedidos:', err.message);

    const statusCode = err.message.includes('inválida') ? 400 : 500;
    return res.status(statusCode).json({
      error: err.message || 'Erro interno no servidor',
    });
  }
};

// Rota para executar a atualização em lote

export const executeBatchUpdate = async (req, res) => {
  try {
    console.log('Body recebido:', req.body);
    console.log('Params recebido:', req.params);
    console.log('Query recebido:', req.query);

    // Tentar obter cod_ped de diferentes fontes
    let { cod_ped } = req.body;

    if (!cod_ped && req.params.cod_ped) {
      cod_ped = req.params.cod_ped;
    }

    if (!cod_ped && req.query.cod_ped) {
      cod_ped = req.query.cod_ped;
    }

    console.log('cod_ped extraído:', cod_ped);

    if (!cod_ped) {
      return res.status(400).json({
        success: false,
        message: 'cod_ped é obrigatório',
        example: {
          via_body: { cod_ped: '21136' },
          via_params: '/api/debug/21136',
          via_query: '/api/debug?cod_ped=21136',
        },
      });
    }

    // Usar a função corrigida que agora também atualiza
    const resultado = await debugParseStatusMandaeByCodPed(cod_ped);

    if (resultado.success) {
      return res.status(200).json({
        success: true,
        message: resultado.acao_realizada,
        data: resultado,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Erro durante o debug',
        error: resultado.error,
      });
    }
  } catch (error) {
    console.error('Erro na execução do debug:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message,
    });
  }
};

// Nova rota para executar a atualização em lote
export const executeFullBatchUpdate = async (req, res) => {
  try {
    const { batch_size, parallel } = req.body;
    
    const batchSize = parseInt(batch_size) || 100;
    const parallelBatches = parseInt(parallel) || 1;

    console.log(`Iniciando atualização em lote com batch_size: ${batchSize}, paralelo: ${parallelBatches}`);

    let resultado;
    
    if (parallelBatches > 1) {
      resultado = await batchUpdateSituacaoFromMandaeEventsParallel(batchSize, parallelBatches);
    } else {
      resultado = await batchUpdateSituacaoFromMandaeEvents(batchSize);
    }

    if (resultado.success) {
      return res.status(200).json({
        success: true,
        message: resultado.message,
        data: resultado
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Erro durante a atualização em lote',
        error: resultado.error
      });
    }

  } catch (error) {
    console.error('Erro na execução da atualização em lote:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
};