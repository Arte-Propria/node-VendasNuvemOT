import { query } from '../db/db.js';

export const fetchRefunds = async (params) => {
  const { store, createdAtMin, createdAtMax, refundType } = params;

  let queryString = `SELECT * FROM reembolsos_${store} WHERE deleted = false`;

  const queryParams = [];

  if (createdAtMin) {
    queryString += ` AND DATE(created_at) >= $${queryParams.length + 1}`;
    queryParams.push(new Date(createdAtMin).toISOString().split('T')[0]);
  }

  if (createdAtMax) {
    queryString += ` AND DATE(created_at) <= $${queryParams.length + 1}`;
    queryParams.push(new Date(createdAtMax).toISOString().split('T')[0]);
  }

  // Filtro por tipo de reembolso
  if (refundType) {
    queryString += ` AND type = $${queryParams.length + 1}`;
    queryParams.push(refundType);
  }

  queryString += ' ORDER BY created_at DESC';

  const result = await query(queryString, queryParams);
  return result.rows;
};

export const insertRefund = async (refundData, store) => {
  // eslint-disable-next-line camelcase
  const { order_id, category, total, created_at, type } = refundData;

  const queryString = `
        INSERT INTO reembolsos_${store} (order_id, category, total, created_at, type)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    `;

  // eslint-disable-next-line camelcase
  const result = await query(queryString, [
    order_id,
    category,
    total,
    created_at,
    type
  ]);
  return result.rows[0];
};

export const deleteRefundById = async (id, store) => {
  const queryString = `UPDATE reembolsos_${store} SET deleted = true WHERE id = $1 RETURNING *`;
  const result = await query(queryString, [id]);
  return result.rows[0];
};
