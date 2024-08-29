import { query } from "../db/db.js";

export const deleteOrderFromDB = async (owner_note, store) => {
  const tableName =
  store === 'outlet' ? 'pedidos_outlet' : 'pedidos_artepropria';

  const queryText = `DELETE FROM ${tableName} WHERE owner_note = $1`;
  return query(queryText, [owner_note]);
};
