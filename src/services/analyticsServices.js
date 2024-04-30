import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

// Função para buscar dados do Analytics
export const fetchAnalytics = async ({ store, createdAtMin, createdAtMax }) => {
  // Definindo valores padrões para datas caso não sejam fornecidos
  const currentDate = new Date();
  const defaultStartDate = currentDate.toISOString().split('T')[0]; // Obtem a data no formato 'YYYY-MM-DD'
  const defaultEndDate = currentDate.toISOString().split('T')[0]; // Obtem a data no formato 'YYYY-MM-DD'

  // Se createdAtMin e createdAtMax forem fornecidos, converte para o formato 'YYYY-MM-DD'
  createdAtMin = createdAtMin
    ? new Date(createdAtMin).toISOString().split('T')[0]
    : defaultStartDate;
  createdAtMax = createdAtMax
    ? new Date(createdAtMax).toISOString().split('T')[0]
    : defaultEndDate;

  let propertyID;
  let clientEmail;
  let privateKey;

  // Seleciona o propertyID com base na loja
  if (store === 'outlet') {
    propertyID = process.env.GOOGLE_PROPERTY_ID_OUTLET;
    clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  } else if (store === 'artepropria') {
    propertyID = process.env.GOOGLE_PROPERTY_ID_AP;
    clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  } else {
    throw new Error('Store not recognized');
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });

    const analytics = google.analyticsdata('v1beta');
    const client = await auth.getClient();
    analytics.context._options.auth = client;

    console.log('Recuperando dados do analytics...');

    // Consulta para recuperar os dados dos dispositivos
    const deviceResponse = await analytics.properties.runReport({
      property: `properties/${propertyID}`,
      requestBody: {
        dateRanges: [
          {
            startDate: createdAtMin,
            endDate: createdAtMax,
          },
        ],
        dimensions: [
          { name: 'deviceCategory' },
        ],
        metrics: [
          { name: 'activeUsers' },
        ],
      },
    });

    // Consulta para recuperar os dados dos custos de anúncios
    const costResponse = await analytics.properties.runReport({
      property: `properties/${propertyID}`,
      requestBody: {
        dateRanges: [
          {
            startDate: createdAtMin,
            endDate: createdAtMax,
          },
        ],
        dimensions: [
          { name: 'sessionCampaignName' }
        ],
        metrics: [
          { name: 'advertiserAdCost' }
        ],
      },
    });

    // Consulta para recuperar os dados de carrinho
    const cartResponse = await analytics.properties.runReport({
      property: `properties/${propertyID}`,
      requestBody: {
        dateRanges: [
          {
            startDate: createdAtMin,
            endDate: createdAtMax,
          },
        ],
        dimensions: [
          { name: 'eventName' } // Adicionando a dimensão eventName
        ],
        metrics: [
          { name: 'activeUsers' },
        ],
      },
    });

    // Processamento para calcular o total de usuários e por dispositivo
    let totalVisits = 0;
    let usersByDevice = {};
    let totalCost = 0;
    let carts = 0

    // Processa os dados dos dispositivos
    let isData = deviceResponse.data.rows ? true : false
    if (isData) {
      deviceResponse.data.rows.forEach(row => {
        const deviceType = row.dimensionValues[0].value;
        const users = parseInt(row.metricValues[0].value, 10);
        totalVisits += users;
        usersByDevice[deviceType] = users;
      });
    }

    // Processa os dados dos custos de anúncios
    isData = costResponse.data.rows ? true : false
    if (isData) {
      costResponse.data.rows.forEach(row => {
        const spent = parseFloat(row.metricValues[0].value);
        totalCost += spent;
      });
    }

    // Processa os dados dos custos de anúncios
    isData = cartResponse.data.rows ? true : false
    if (isData) {
        // Filtrando os eventos relacionados à adição de itens ao carrinho
        const addToCartEvent = cartResponse.data.rows.find(row => row.dimensionValues[0].value === 'add_to_cart');
        carts = addToCartEvent ? parseInt(addToCartEvent.metricValues[0].value, 10) : 0;
    }

    totalCost = parseFloat(totalCost.toFixed(2));

    return {
      totalVisits,
      usersByDevice,
      totalCost,
      carts
    };

  } catch (error) {
    console.error('Error fetching analytics data:', error);
    throw error;
  }
};
