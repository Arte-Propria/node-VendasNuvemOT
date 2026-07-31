import { query, pool } from "../db/db.js";
import { TOKEN_PLACEHOLDER, LOJA_FISICA_ORDER_ID_OFFSET } from "../db/dataBaseQueryList.js";
import { parseJsonArray, toNumber } from "../tools/helpers.js";

export const deleteOrderFromDB = async (owner_note, store) => {
  const tableName =
  store === 'outlet' ? 'pedidos_outlet' : 'pedidos_artepropria';

  const queryText = `DELETE FROM ${tableName} WHERE owner_note = $1`;
  return query(queryText, [owner_note]);
};

// Tabelas dump por loja — nomes fixos, nunca vindos do input (sem risco de injeção)
const DUMP_TABLES = { outlet: "pedidos_outlet", artepropria: "pedidos_artepropria" };

/**
 * Recupera o `token` do dump a partir do order_id sintético de orders_shop.
 *
 * mapNuvemshopToDelivery monta `order_id = token + LOJA_FISICA_ORDER_ID_OFFSET[loja]`
 * (3e12 artepropria, 4e12 outlet), então a volta é SUBTRAIR o offset da loja. Usar
 * `order_id % 1e12` só acerta enquanto o token couber em 1e12: o popup de cadastro gera
 * `Date.now()*1000 + aleatório` (~1,8e15), o resto vinha errado, o DELETE no dump não
 * casava nada e o pedido sumia da tela continuando a contar em daily_sales.
 *
 * @returns {{sintetico:boolean, token:string|null}}
 */
const resolveDumpToken = (store, orderId) => {
  const offset = LOJA_FISICA_ORDER_ID_OFFSET[store.numeric] || 0
  if (!offset || Number(orderId) < offset) return { sintetico: false, token: null }
  return { sintetico: true, token: String(Number(orderId) - offset) }
}

// Códigos de cupom do pedido. O dump guarda objetos ({ code, ... }) em `coupon`;
// orders_shop guarda a lista de códigos serializada em `coupons` (JSON.stringify).
const couponCodesOf = (dumpRow, osRow) => {
  const codes = new Set();
  for (const c of parseJsonArray(dumpRow?.coupon)) {
    const code = typeof c === "string" ? c : c?.code;
    if (code) codes.add(String(code));
  }
  for (const code of parseJsonArray(osRow?.coupons)) {
    if (code) codes.add(String(code));
  }
  return [...codes];
};

/**
 * Tira o pedido das linhas de `coupon`, com a mesma regra do cancelamento em upsertCoupon:
 * quantity = quantos pedidos sobraram, total_money perde o total do pedido, total_discount
 * (valor fixo do cupom) fica intacto e a linha some quando não resta nenhum pedido.
 *
 * O par (name, order_ids ∋ number) já isola a linha certa — `store` entra só como reforço
 * porque as linhas legadas têm store NULL.
 *
 * @returns {Promise<number>} linhas de coupon alteradas ou removidas
 */
const removeOrderFromCoupons = async (client, { storeName, orderNumber, orderTotal, codes }) => {
  if (!orderNumber || !codes.length) return 0;

  const res = await client.query(
    `SELECT id_coupon, order_ids, total_money
       FROM coupon
      WHERE name = ANY($1::text[])
        AND (store = $2 OR store IS NULL)
        AND order_ids @> $3::jsonb`,
    [codes, storeName, JSON.stringify([Number(orderNumber)])]
  );

  for (const row of res.rows) {
    const remaining = parseJsonArray(row.order_ids)
      .map(Number)
      .filter((id) => id !== Number(orderNumber));

    if (remaining.length === 0) {
      await client.query("DELETE FROM coupon WHERE id_coupon = $1", [row.id_coupon]);
    } else {
      await client.query(
        `UPDATE coupon
            SET quantity = $1, total_money = $2, order_ids = $3
          WHERE id_coupon = $4`,
        [
          remaining.length,
          toNumber(row.total_money) - orderTotal,
          JSON.stringify(remaining),
          row.id_coupon
        ]
      );
    }
  }
  return res.rowCount;
};

/**
 * Exclui UM pedido manual (loja física / chatbot) pelas duas bases, em transação.
 *
 * A tela nova (OrdersShop) lê orders_shop, que não tem `owner_note` — a chave que o
 * DELETE legado usava. O `order_id` da listagem é chave suficiente para as duas tabelas,
 * mas casa com colunas diferentes do dump conforme a convenção do pedido:
 *   - order_id sintético (>= 1e12) → `token = order_id % 1e12` (loja física com token real);
 *   - order_id "cru"               → `number = order_id` (chatbot e histórico com token placeholder).
 *
 * `coupon` é limpo aqui, na mesma transação, com a regra do cancelamento em upsertCoupon:
 * o `number` sai de order_ids, quantity vira o novo tamanho, total_money perde o total do
 * pedido e total_discount (valor fixo do cupom) fica intacto; sem pedidos, a linha some.
 *
 * daily_sales NÃO é tocada aqui: quem recalcula é o controller, via recalcAllDailySales
 * na data do pedido (a agregação do dia sobrevive à remoção de um pedido).
 *
 * @param {{name:string, numeric:number}} store  já normalizado pelo controller
 * @param {number} orderId
 * @returns {Promise<{deleted:Object, createdAt:Date|null, ownerNote:string|null, number:number|null}>}
 */
export const deleteManualOrderById = async (store, orderId) => {
  const dumpTable = DUMP_TABLES[store.name];
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Dump — a coluna de busca depende da convenção do order_id (ver doc acima).
    //    `order_id` do dump não serve: é NULL na quase totalidade dos pedidos manuais.
    const { sintetico: isSyntheticId, token: dumpToken } = resolveDumpToken(store, orderId);
    // TOKEN_PLACEHOLDER se repete em ~1,5k linhas do dump legado: apagar por ele varreria
    // a base. Nenhum pedido legítimo vira order_id sintético com esse token.
    if (isSyntheticId && dumpToken === TOKEN_PLACEHOLDER) {
      throw new Error(
        `order_id ${orderId} resolve o token placeholder ${TOKEN_PLACEHOLDER}, que não identifica um único pedido`
      );
    }
    const dumpReturning = "RETURNING created_at, owner_note, number, total, coupon";
    const dumpResult = isSyntheticId
      ? await client.query(
          `DELETE FROM ${dumpTable}
           WHERE token = $1
           ${dumpReturning}`,
          [dumpToken]
        )
      : await client.query(
          `DELETE FROM ${dumpTable}
           WHERE number = $1
           ${dumpReturning}`,
          [orderId]
        );

    // 2) orders_shop — store::text pois os tipos podem diferir entre tabelas.
    //    O RETURNING serve de fallback quando a linha do dump não existia: sem uma data
    //    o controller não teria como recalcular daily_sales e o dia ficaria inflado.
    const osResult = await client.query(
      `DELETE FROM orders_shop
       WHERE order_id = $1 AND store::text = $2
       RETURNING created_at, total, coupons`,
      [orderId, String(store.numeric)]
    );

    const dumpRow = dumpResult.rows[0] ?? null;
    const osRow = osResult.rows[0] ?? null;

    // 3) coupon — order_ids guarda o `number` do pedido (upsertCoupon recebe nuvemData.number)
    const orderNumber = dumpRow?.number ?? (isSyntheticId ? null : Number(orderId));
    const orderTotal = toNumber(dumpRow?.total ?? osRow?.total ?? 0);
    const couponRows = await removeOrderFromCoupons(client, {
      storeName: store.name,
      orderNumber,
      orderTotal,
      codes: couponCodesOf(dumpRow, osRow)
    });

    await client.query("COMMIT");

    return {
      deleted: {
        [dumpTable]: dumpResult.rowCount,
        orders_shop: osResult.rowCount,
        coupon: couponRows
      },
      createdAt: dumpRow?.created_at ?? osRow?.created_at ?? null,
      ownerNote: dumpRow?.owner_note ?? null,
      number: orderNumber ?? null,
      // O recálculo de daily_sales lê o DUMP. Se a linha do dump sobreviveu, o pedido
      // some da tela e volta a ser contado no Dashboard no próximo recálculo — não pode
      // ser reportado como sucesso.
      dumpOrfao: dumpResult.rowCount === 0 && osResult.rowCount > 0
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

// Dia-calendário BRT — espelho SQL de toLocalDateBR (helpers.js) e do BRT_DATE_EXPR de
// dailySalesRecalc.js. created_at guarda relógio UTC como timestamp without time zone.
// Era o corte de NEGÓCIO às 03:00, que divergia do recalc e fazia "apagar o dia X" atingir
// um conjunto de pedidos diferente do que o Dashboard exibia para o dia X.
const BRT_DATE_EXPR =
  "((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date";

/**
 * Confirma na fonte que o pedido saiu da agregação do dia.
 *
 * É a garantia que faltava: em vez de assumir que o recálculo funcionou, olhamos
 * `daily_sales.id_orders` (que guarda o `number` do pedido) nos dias recalculados.
 *
 * @param {{numeric:number}} store
 * @param {number|null} orderNumber
 * @param {string[]} dias  'YYYY-MM-DD'
 * @returns {Promise<boolean>} true se o pedido AINDA está contabilizado
 */
export const orderStillInDailySales = async (store, orderNumber, dias) => {
  if (!orderNumber || !dias?.length) return false;

  const res = await query(
    `SELECT 1 FROM daily_sales
      WHERE store::text = $1
        AND date_sales = ANY($2::date[])
        AND id_orders @> $3::jsonb
      LIMIT 1`,
    [String(store.numeric), dias, JSON.stringify([Number(orderNumber)])]
  );
  return res.rowCount > 0;
};

/**
 * Remove a linha de daily_sales de um dia que ficou SEM pedidos no dump.
 *
 * recalcAllDailySales só reescreve dias que ainda têm pedidos — se o último pedido do
 * dia foi excluído, a linha agregada antiga sobreviveria com o valor velho.
 *
 * @param {{name:string, numeric:number}} store
 * @param {string} date 'YYYY-MM-DD' (dia-calendário SP, mesmo critério do recalc)
 * @returns {Promise<number>} linhas de daily_sales removidas
 */
export const pruneEmptyDailySales = async (store, date) => {
  const dumpTable = DUMP_TABLES[store.name];
  if (!dumpTable) return 0;

  const remaining = await query(
    `SELECT 1 FROM ${dumpTable}
     WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = $1::date
     LIMIT 1`,
    [date]
  );
  if (remaining.rowCount > 0) return 0;

  const result = await query(
    `DELETE FROM daily_sales WHERE date_sales = $1::date AND store::text = $2`,
    [date, String(store.numeric)]
  );
  return result.rowCount;
};

/**
 * Exclui, em transação única, todos os pedidos de uma loja em um dia-calendário BRT
 * das tabelas: dump (pedidos_<loja>), orders_shop, daily_sales e coupon.
 * clientes/categorias/ads não são tocadas (dados compartilhados).
 *
 * @param {{name:string, numeric:number}} store  já normalizado pelo controller
 * @param {string} date  'YYYY-MM-DD'
 * @param {{apply?:boolean}} options  apply=false → dry-run: executa os DELETEs e dá
 *   ROLLBACK, retornando contagens exatas sem excluir nada
 * @returns {Promise<{deleted:Object, orderNumbers:number[]}>}
 */
export const deleteOrdersByDateBRT = async (store, date, { apply = false } = {}) => {
  const dumpTable = DUMP_TABLES[store.name];
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Dump — RETURNING number para vincular os cupons legados (store IS NULL)
    const dumpResult = await client.query(
      `DELETE FROM ${dumpTable}
       WHERE ${BRT_DATE_EXPR} = $1::date
       RETURNING number`,
      [date]
    );
    const orderNumbers = dumpResult.rows.map((r) => Number(r.number));

    // 2) orders_shop — store::text pois os tipos podem diferir entre tabelas
    const osResult = await client.query(
      `DELETE FROM orders_shop
       WHERE store::text = $1
         AND ${BRT_DATE_EXPR} = $2::date`,
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
