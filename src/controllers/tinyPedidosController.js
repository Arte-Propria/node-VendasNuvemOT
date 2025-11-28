import { fetchTinyOrdersWithDetails } from '../services/tinyPedidosService.js';
import { query } from "../db/db.js"
import { formatDbOrders,fetchNuvemShopOrders } from "../services/orderServicesNuvem.js"


export const getPedidos = async (req, res) => {
  try {
    const { store, dataInicial, dataFinal } = req.params;

    // Validação das datas
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dataInicial) || !dateRegex.test(dataFinal)) {
      return res.status(400).json({
        error: 'Formato de data inválido. Use YYYY-MM-DD'
      });
    }

    // Busca todos os pedidos com detalhes
    const pedidos = await fetchTinyOrdersWithDetails(store, dataInicial, dataFinal);

    return res.status(200).json({
      success: true,
      store,
      count: pedidos.length,
      pedidos
    });
  } catch (error) {
    console.error('Erro no controller:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const getPedidosNuvemshop = async (req, res) => {
  const { store, createdAtMin, createdAtMax } = req.params;

  let startDate = new Date(createdAtMin);
  startDate.setDate(startDate.getDate() - 1); // Subtrai um dia
  startDate.setHours(startDate.getHours() - 3); // Ajuste para UTC-3
  
  let endDate = new Date(createdAtMax);
  endDate.setDate(endDate.getDate() + 1); // Adiciona um dia
  endDate.setHours(endDate.getHours() - 3); // Ajuste para UTC-3

  try {
    const tableName = store === "outlet" ? "pedidos_outlet" : "pedidos_artepropria";
    const startDateSQL = startDate.toISOString().slice(0, 10);
    const endDateSQL = endDate.toISOString().slice(0, 10);

    // 1. Busca os pedidos completos do banco
    const result = await query(
      `SELECT * FROM ${tableName} WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [startDateSQL, endDateSQL]
    );

    // 2. Formata os pedidos para o modelo simplificado
    const formattedOrders = formatDbOrders(result.rows);
    
    return res.json({
      success: true,
      store,
      periodo: `${createdAtMin} - ${createdAtMax}`,
      count: formattedOrders.length,
      pedidos: formattedOrders
    });
    
  } catch (err) {
    console.error("Erro ao buscar pedidos:", err);
    return res.status(500).json({ 
      success: false,
      error: "Erro ao buscar pedidos",
      details: err.message 
    });
  }
};

export const getPedidosNuvem = async (req, res) => {
  try {
    const { store, dataInicial, dataFinal } = req.params;

    // Busca todos os pedidos com detalhes
    const pedidos = await fetchNuvemShopOrders(store, dataInicial, dataFinal);

    return res.status(200).json({
      success: true,
      store,
      count: pedidos.length,
      pedidos
    });
  } catch (error) {
    console.error('Erro no controller:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};