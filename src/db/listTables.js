import { query } from '../db/db.js';

const listOrdersOutlet = async () => {
  const queryText = `
    SELECT * 
    FROM pedidos_outlet
  `;

  try {
    const res = await query(queryText);
    console.log('Pedidos na tabela pedidos_outlet:', res.rows);
  } catch (err) {
    console.error('Erro ao listar pedidos:', err);
  }
};

listOrdersOutlet();
