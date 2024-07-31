import { query } from '../db/db.js';

const listTables = async () => {
  const queryText = `
    SELECT * from pedidos_outlet
  `;

  try {
    const res = await query(queryText);
    console.log('Tabelas no banco de dados:', res.rows.length);
  } catch (err) {
    console.error('Erro ao listar tabelas:', err);
  }
};

listTables();
