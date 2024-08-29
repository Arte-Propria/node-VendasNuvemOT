import { query } from '../db/db.js';

const listTables = async () => {
  const queryText = `
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'pedidos_artepropria' AND is_nullable = 'NO'
  `;

  try {
    const res = await query(queryText);
    console.log('Tabelas no banco de dados:', res.rows);
  } catch (err) {
    console.error('Erro ao listar tabelas:', err);
  }
};

listTables();
