import { query } from './db.js'; // Certifique-se de que o caminho para o arquivo db.js esteja correto

const addUniqueConstraint = async () => {
  const queryText = `
   TRUNCATE TABLE pedidos_outlet;
  `;
  
  try {
    await query(queryText);
    console.log('Ação executada.');
  } catch (err) {
    console.error('Erro na ação executada', err);
  }
};

addUniqueConstraint();
