import { dataBase, dataBaseDb, mapNuvemshopToDelivery, mapTinyToDelivery, upsertRecord } from "../db/dataBaseQueryList.js"
import { query } from '../db/db.js';

// 1. Função para realizar o MAP dos itens, com base em qual query será acessada
// o parametro querySelect será usado para:
// - fazer o fetch;
// - usando switch case, o querySelect vai definir qual caso será usado para a requisição 
export const fetchRequest = async (queryData, querySelect) => {
  let allRequests = []

  try {
    const response = queryData

    const result = response.rows.map((delivery) => {
      // o objeto dataBase possui o nome de cada banco de dados
      // o objeto dataBaseDb engloba cada caso a ser usado pelo map
      switch (querySelect) {
        case dataBase.ads:
          return dataBaseDb.ads.transform(delivery)

        case dataBase.clients:
          return dataBaseDb.clients.transform(delivery)

        case dataBase.coupon:
          return dataBaseDb.coupon.transform(delivery)

        case dataBase.daily_sales:
          return dataBaseDb.daily_sales.transform(delivery)

        case dataBase.orders_shop:
          return dataBaseDb.orders_shop.transform(delivery)

        case dataBase.product:
          return dataBaseDb.product.transform(delivery)

        default:
          console.log("Database desconhecida");
      }
    })

    allRequests = allRequests.concat(result)

    return allRequests || []
  } catch (error) {
    console.error("Error fetching data from Query", error.message)
    return []
  }
}

// Função para filtrar os dados formatados por data
export const filterBdByDateRange = (queryData, querySelect, { startDate, endDate } = {}) => {
  try {
    // Se não houver datas de filtro, retorna todos os dados
    if (!startDate && !endDate) {
      console.log("⚠️ Nenhum filtro de data aplicado");
      console.log("DEBUG startDate:", startDate);
      console.log("DEBUG endDate:", endDate);

      return queryData;
    }

    // Valida se queryData é array
    if (!Array.isArray(queryData)) {
      throw new Error("queryData deve ser um array");
    }

    // Valida se há dados
    if (!queryData || queryData.length === 0) {
      console.log("📭 Nenhum dado para filtrar");
      return [];
    }

    console.log(`📅 Aplicando filtro de data para tabela: ${querySelect}`);
    console.log(`📆 Período: ${startDate || 'Início não definido'} até ${endDate || 'Fim não definido'}`);

    // Mapeamento dos campos de data para cada tabela
    const dateFieldMap = {
      [dataBase.ads]: 'date_ads',
      [dataBase.clients]: 'dt_criacao_cli',
      [dataBase.coupon]: 'date_coupon',
      [dataBase.daily_sales]: 'date_sales',
      [dataBase.orders_shop]: 'created_at',
      [dataBase.product]: 'lastDate'
    };

    // Obter o campo de data correto para a tabela
    const dateField = dateFieldMap[querySelect];

    if (!dateField) {
      console.warn(`⚠️ Tabela '${querySelect}' não possui campo de data mapeado. Retornando dados sem filtro.`);
      return queryData;
    }

    // Validar campo existe nos dados
    const sampleItem = queryData[0];
    if (!sampleItem || !sampleItem.hasOwnProperty(dateField)) {
      console.warn(`⚠️ Campo '${dateField}' não encontrado nos dados. Campos disponíveis:`, Object.keys(sampleItem || {}));
      return queryData;
    }

    // Converter datas para objetos Date com tratamento de fuso horário
    const parseDate = (dateString) => {
      if (!dateString) return null;

      // Se já for um objeto Date
      if (dateString instanceof Date) {
        return dateString;
      }

      // Remove hora e fuso para comparação apenas por data
      // Usando UTC para evitar problemas de fuso horário
      const parts = dateString.split('-');
      if (parts.length === 3) {
        return new Date(Date.UTC(
          parseInt(parts[0]),
          parseInt(parts[1]) - 1,
          parseInt(parts[2])
        ));
      }
      return new Date(dateString);

    };

    const start = startDate ? parseDate(startDate) : null;
    const end = endDate ? parseDate(endDate) : null;

    // Ajustar horários para incluir todo o intervalo
    if (start) {
      // Início do dia: 00:00:00.000
      start.setUTCHours(0, 0, 0, 0);
    }

    if (end) {
      // Final do dia: 23:59:59.999
      end.setUTCHours(23, 59, 59, 999);
    }

    // Validar datas
    if (start && isNaN(start.getTime())) {
      throw new Error("Data inicial inválida");
    }

    if (end && isNaN(end.getTime())) {
      throw new Error("Data final inválida");
    }

    if (start && end && start > end) {
      throw new Error("Data inicial não pode ser maior que data final");
    }

    // Aplicar filtro
    const filteredData = queryData.filter((item) => {
      try {
        // Obter a data do item
        const itemDateValue = item[dateField];

        if (!itemDateValue) {
          console.warn(`⚠️ Item sem data no campo '${dateField}':`, item.id || item);
          return false; // Ou true se quiser incluir itens sem data
        }

        const itemDate = parseDate(itemDateValue);

        if (!itemDate || isNaN(itemDate.getTime())) {
          console.warn(`⚠️ Data inválida no item:`, item);
          return false;
        }

        // Verificar se está dentro do intervalo
        const isAfterStart = !start || itemDate >= start;
        const isBeforeEnd = !end || itemDate <= end;

        return isAfterStart && isBeforeEnd;

      } catch (error) {
        console.error(`❌ Erro ao processar item:`, item, error);
        return false;
      }
    });

    console.log(`✅ Filtro aplicado: ${filteredData.length} de ${queryData.length} itens mantidos`);

    return filteredData;

  } catch (error) {
    console.error("❌ Erro em filterByDateRange:", error.message);
    // Em produção, você pode querer retornar os dados originais ou lançar o erro
    throw new Error(`Falha ao filtrar por data: ${error.message}`);
  }
};

export async function nuvemDbWebhook(queryData, querySelect) {

  let payload;

  switch (querySelect) {
    case dataBase.ads:
      payload = dataBaseDb.ads.transform(queryData)

    case dataBase.clients:
      payload = dataBaseDb.clients.transform(queryData)

    case dataBase.coupon:
      payload = dataBaseDb.coupon.transform(queryData)

    case dataBase.daily_sales:
      payload = dataBaseDb.daily_sales.transform(queryData)

    case dataBase.orders_shop:
      payload = dataBaseDb.orders_shop.transform(queryData)

    case dataBase.product:
      payload = dataBaseDb.product.transform(queryData)

    default:
      console.log("Database desconhecida");
  }

  try {
    const resposta = await query(`SELECT * FROM ${querySelect}`);
  } catch (error) {

  }
}

// Função para processar um pedido da Nuvenshop
export async function processOrderFromNuvemshop(nuvemData) {
    // Mapear
    const delivery = mapNuvemshopToDelivery(nuvemData);

    console.log('delivery recebido, tipos:');
    console.log(' - orders_shop:', Array.isArray(delivery.orders_shop) ? 'array' : typeof delivery.orders_shop);
    console.log(' - clients:', Array.isArray(delivery.clients) ? 'array' : typeof delivery.clients);
    console.log(' - product:', Array.isArray(delivery.product) ? 'array' : typeof delivery.product);
    console.log(' - coupons:', Array.isArray(delivery.coupons) ? 'array' : typeof delivery.coupons);
    console.log(' - ads:', Array.isArray(delivery.ads) ? 'array' : typeof delivery.ads);

    // Garantir que sejam arrays (caso algo tenha dado errado)
    const safeDelivery = {
      orders_shop: Array.isArray(delivery.orders_shop) ? delivery.orders_shop : [],
      clients: Array.isArray(delivery.clients) ? delivery.clients : [],
      product: Array.isArray(delivery.product) ? delivery.product : [],
      coupons: Array.isArray(delivery.coupons) ? delivery.coupons : [],
      ads: Array.isArray(delivery.ads) ? delivery.ads : [],
    };

    // Aplicar transforms e simular upsert
    console.log('\n--- REGISTROS A SEREM PERSISTIDOS ---');

    safeDelivery.clients.forEach(item => {
      const record = dataBaseDb.clients.transform(item);
      console.log('\n[clients]', JSON.stringify(record, null, 2));
      console.log(`-> Upsert clients com id_cli = ${record.id_cli}`);
    });

    safeDelivery.product.forEach(item => {
      const record = dataBaseDb.product.transform(item);
      console.log('\n[product]', JSON.stringify(record, null, 2));
      console.log(`-> Upsert product com id_product = ${record.id_product}`);
    });

    safeDelivery.orders_shop.forEach(item => {
      const record = dataBaseDb.orders_shop.transform(item);
      console.log('\n[orders_shop]', JSON.stringify(record, null, 2));
      console.log(`-> Upsert orders_shop com order_id = ${record.order_id}`);
    });

    safeDelivery.coupons.forEach(item => {
      const record = dataBaseDb.coupon.transform(item);
      console.log('\n[coupon]', JSON.stringify(record, null, 2));
      console.log(`-> Upsert coupon com id_coupon = ${record.id_coupon}`);
    });

    safeDelivery.ads.forEach(item => {
      console.log('\n[ads] (ignorado)');
    });

}

// Função para processar um pedido da Tiny (similar)
export async function processOrderFromTiny(tinyResponse) {
  const delivery = mapTinyToDelivery(tinyResponse);

  // orders_shop
  for (const item of delivery.orders_shop) {
    const record = dataBaseDb.orders_shop.transform(item);
    await upsertRecord('orders_shop', record, 'order_id');
  }

  // clients
  for (const item of delivery.clients) {
    const record = dataBaseDb.clients.transform(item);
    await upsertRecord('clients', record, 'id_cli');
  }

  // product
  for (const item of delivery.product) {
    const record = dataBaseDb.product.transform(item);
    await upsertRecord('product', record, 'id_product');
  }

  // coupons
  for (const item of delivery.coupons) {
    const record = dataBaseDb.coupon.transform(item);
    await upsertRecord('coupon', record, 'id_coupon');
  }

}