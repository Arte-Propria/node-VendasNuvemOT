import { query, pool } from "../db/db.js";

export const deleteOrderFromDB = async (owner_note, store) => {
  const tableName =
  store === 'outlet' ? 'pedidos_outlet' : 'pedidos_artepropria';

  const queryText = `DELETE FROM ${tableName} WHERE owner_note = $1`;
  return query(queryText, [owner_note]);
};

// Tabelas dump por loja — nomes fixos, nunca vindos do input (sem risco de injeção)
const DUMP_TABLES = { outlet: "pedidos_outlet", artepropria: "pedidos_artepropria" };

// Dia de NEGÓCIO BRT com corte às 03:00 — espelho SQL de toBusinessDateBR (helpers.js).
// created_at guarda relógio UTC como timestamp without time zone.
// Atenção: dailySalesRecalc.js usa a variante SEM o corte de 3h; se daily_sales tiver
// sido reescrito pelo recalc, pedidos de 00:00–03:00 BRT podem estar em dia diferente —
// o dry-run expõe divergências antes de aplicar.
const BUSINESS_DATE_EXPR =
  "(((created_at - interval '3 hours') AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date";

/**
 * Exclui, em transação única, todos os pedidos de uma loja em um dia de negócio (BRT)
 * das tabelas: dump (pedidos_<loja>), orders_shop, daily_sales e coupon.
 * clientes/categorias/ads não são tocadas (dados compartilhados).
 *
 * @param {{name:string, numeric:number}} store  já normalizado pelo controller
 * @param {string} date  'YYYY-MM-DD'
 * @param {{apply?:boolean}} options  apply=false → dry-run: executa os DELETEs e dá
 *   ROLLBACK, retornando contagens exatas sem excluir nada
 * @returns {Promise<{deleted:Object, orderNumbers:number[]}>}
 */
export const deleteOrdersByBusinessDate = async (store, date, { apply = false } = {}) => {
  const dumpTable = DUMP_TABLES[store.name];
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Dump — RETURNING number para vincular os cupons legados (store IS NULL)
    const dumpResult = await client.query(
      `DELETE FROM ${dumpTable}
       WHERE ${BUSINESS_DATE_EXPR} = $1::date
       RETURNING number`,
      [date]
    );
    const orderNumbers = dumpResult.rows.map((r) => Number(r.number));

    // 2) orders_shop — store::text pois os tipos podem diferir entre tabelas
    const osResult = await client.query(
      `DELETE FROM orders_shop
       WHERE store::text = $1
         AND ${BUSINESS_DATE_EXPR} = $2::date`,
      [String(store.numeric), date]
    );

    // 3) daily_sales — linha agregada do dia
    const dsResult = await client.query(
      `DELETE FROM daily_sales
       WHERE date_sales = $1::date AND store::text = $2`,
      [date, String(store.numeric)]
    );

    // 4) coupon — store guarda o NOME da loja; linhas legadas (store NULL) são
    // excluídas apenas se referenciarem pedidos excluídos no passo 1
    const cpResult = await client.query(
      `DELETE FROM coupon
       WHERE date_coupon = $1::date
         AND (
           store = $2
           OR (store IS NULL AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(order_ids) AS e
             WHERE e::text = ANY($3::text[])
           ))
         )`,
      [date, store.name, orderNumbers.map(String)]
    );

    await client.query(apply ? "COMMIT" : "ROLLBACK");

    return {
      deleted: {
        [dumpTable]: dumpResult.rowCount,
        orders_shop: osResult.rowCount,
        daily_sales: dsResult.rowCount,
        coupon: cpResult.rowCount
      },
      orderNumbers
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // conexão pode já estar inválida; o release abaixo descarta o client
    }
    throw err;
  } finally {
    client.release();
  }
};
