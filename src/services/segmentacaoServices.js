import { dataBase, dataBaseDb } from "../db/dataBaseQueryList.js"


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