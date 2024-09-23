import { updateLastTwoMonthsOrders, updateTodayOrders } from "../automation.js";
import { query } from "../db/db.js";
import { fetchOrder, fetchOrders, insertOrders } from "../services/orderServicesNuvem.js";

export const getOrders = async (req, res) => {
	try {
		const params = req.params
		const orders = await fetchOrders(params)
    if(orders.length > 0) {
      await insertOrders(orders, params.store);
    }
    res.status(200).send("Pedidos atualizados")
	} catch (error) {
		console.error(error)
		res.status(404).send("Erro ao buscar pedidos")
	}
}

export const getOrder = async (req, res) => {
	try {
		const params = req.params
		const orders = await fetchOrder(params)
    console.log(orders)
    res.status(200).send("Pedido encontrado")
	} catch (error) {
		console.error(error)
		res.status(404).send("Erro ao buscar pedido")
	}
}

// Buscar pedidos por data
export const getOrdersByDate = async (req, res) => {
  const { store, createdAtMin, createdAtMax } = req.params;

  let startDate = new Date(createdAtMin);
  startDate.setDate(startDate.getDate() - 1); // Subtrai um dia
  startDate.setHours(startDate.getHours() - 3); // Ajuste para UTC-3
  
  let endDate = new Date(createdAtMax);
  endDate.setDate(endDate.getDate() + 1); // Adiciona um dia
  endDate.setHours(endDate.getHours() - 3); // Ajuste para UTC-3

  try {
    const tableName = store === 'outlet' ? 'pedidos_outlet' : 'pedidos_artepropria';
    // Formatando as datas para o formato YYYY-MM-DD
    const startDateSQL = startDate.toISOString().slice(0, 10);
    const endDateSQL = endDate.toISOString().slice(0, 10);

    const result = await query(
      `SELECT * FROM ${tableName} WHERE DATE(created_at) BETWEEN '${startDateSQL}' AND '${endDateSQL}'`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar pedidos:', err);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  } finally {
    await updateTodayOrders()
  }
};

export const getOrdersByStore = async (req, res) => {
  const { store } = req.params;

  try {
    const tableName = store === 'outlet' ? 'pedidos_outlet' : 'pedidos_artepropria';
    const result = await query(`SELECT * FROM ${tableName}`);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar pedidos:', err);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  } finally {
    // Executa a função em segundo plano sem bloquear a resposta
    setImmediate(async () => {
      try {
        await updateLastTwoMonthsOrders({ store });
        console.log(`Atualização dos pedidos para ${store} concluída em segundo plano.`);
      } catch (err) {
        console.error(`Erro ao atualizar pedidos para ${store}:`, err);
      }
    });
  }
};
