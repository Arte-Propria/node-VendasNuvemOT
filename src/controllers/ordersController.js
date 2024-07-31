import { updateLastTwoMonthsOrders, updateTodayOrders } from "../automation.js";
import { query } from "../db/db.js";
import { fetchOrders, insertOrders } from "../services/orderServicesNuvem.js";

export const getOrders = async (req, res) => {
	try {
		const params = req.params
		const orders = await fetchOrders(params)
		await insertOrders(orders, params.store);
	} catch (error) {
		console.error(error)
		res.status(404).send("Erro ao buscar pedidos")
	}
}

// Buscar pedidos por data
export const getOrdersByDate = async (req, res) => {
  const { store, createdAtMin, createdAtMax } = req.params;

  let startDate = new Date(createdAtMin);
  startDate.setHours(0, 0, 0, 0); // Início do dia
  startDate.setHours(startDate.getHours() - 3); // Ajuste para UTC-3

  let endDate = new Date(createdAtMax);
  endDate.setHours(23, 59, 59, 999); // Final do dia
  endDate.setHours(endDate.getHours() - 3); // Ajuste para UTC-3

  try {
    const tableName = store === 'outlet' ? 'pedidos_outlet' : 'pedidos_artepropria';
    const result = await query(
      `SELECT * FROM ${tableName} WHERE created_at >= $1 AND created_at <= $2`,
      [startDate, endDate]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar pedidos:', err);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  } finally {
    updateTodayOrders()
  }
};

export const getOrdersByStore = async (req, res) => {
  const { store } = req.params;

  try {
    const tableName = store === 'outlet' ? 'pedidos_outlet' : 'pedidos_artepropria';
    const result = await query(`SELECT * FROM ${tableName}`);
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar pedidos:', err);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  } finally {
    updateTodayOrders()
    updateLastTwoMonthsOrders()
  }
};