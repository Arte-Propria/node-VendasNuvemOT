import { query } from "../db/db.js"
import { fetchTestRequest, filterMandaeData, filterMandaeStore } from '../services/mandaeServices.js'

// Buscar pedidos por data
export const getMandaeInfoByDate = async (req, res) => {
  const { store, createdAtMin, createdAtMax } = req.params;
  
    // Log para conferencia dos parametros recebidos
  console.log('Parâmetros recebidos:', {
    store,
    createdAtMin,
    createdAtMax
  });

  try {
    // 1. Buscar todos os dados formatados
    const formattedData = await fetchTestRequest();
    
    // 2. Filtrar os dados conforme parâmetros
    const filteredData = filterMandaeData(formattedData, {
      store,
      startDate: createdAtMin,
      endDate: createdAtMax
    });
    
    // 3. Retornar resultados filtrados
    res.json(filteredData);
    
  } catch (err) {
    console.error("Erro ao processar pedidos:", err.message);
    
    const statusCode = err.message.includes('inválida') ? 400 : 500;
    res.status(statusCode).json({ 
      error: err.message || "Erro interno no servidor" ,
      details: {
        receivedDates: {
          startDate: createdAtMin,
          endDate: createdAtMax
        }
      }
    });
  }
};
/*
export const getOMandaeInfoByStore = async (req, res) => {
  const { store } = req.params

  try {
    const result = await query(`SELECT * FROM info_mandae`)
    res.status(200).json(result.rows)
  } catch (err) {
    console.error("Erro ao buscar pedidos:", err)
    res.status(500).json({ error: "Erro ao buscar pedidos" })
  }
}*/

export const getOMandaeInfoByStore = async (req, res) => {
  const { store } = req.params;
  
    // Log para conferencia dos parametros recebidos
  console.log('Parâmetros recebidos:', {
    store
  });

  try {
    // 1. Buscar todos os dados formatados
    const formattedData = await fetchTestRequest();
    
    // 2. Filtrar os dados conforme parâmetros
    const filteredData = filterMandaeStore(formattedData, {
      store
    });
    
    // 3. Retornar resultados filtrados
    res.json(filteredData);
    
  } catch (err) {
    console.error("Erro ao processar pedidos:", err.message);
    
    const statusCode = err.message.includes('inválida') ? 400 : 500;
    res.status(statusCode).json({ 
      error: err.message || "Erro interno no servidor" 
    });
  }
};