import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export const fetchCustomers = async (params = {}) => {
  const { store, createdAtMin, createdAtMax } = params;
  let code;
  let storeId;

  if (!store) {
    throw new Error('Store parameter is required');
  }

  if (store === 'outlet') {
    code = process.env.ACCESS_TOKEN_OUTLET;
    storeId = process.env.STORE_ID_OUTLET;
  } else if (store === 'artepropria') {
    code = process.env.ACCESS_TOKEN_ARTEPROPRIA;
    storeId = process.env.STORE_ID_ARTEPROPRIA;
  } else {
    throw new Error('Invalid store parameter');
  }

  if (!code || !storeId) {
    throw new Error(
      'API credentials are not properly set in the environment variables'
    );
  }

  let url = `https://api.tiendanube.com/v1/${storeId}/customers`;

  // Ajusta a data para o início do dia
  const adjustedCreatedAtMin = new Date(createdAtMin);

  // Ajusta a data para o final do dia
  let adjustedCreatedAtMax = new Date(createdAtMax);
  adjustedCreatedAtMax.setUTCHours(23, 59, 59, 999);

  // Verifica se as datas são iguais
  if (createdAtMin === createdAtMax) {
    // Adiciona um dia à data de createdAtMax e ajusta para o início do dia seguinte
    adjustedCreatedAtMax.setUTCDate(adjustedCreatedAtMax.getUTCDate() + 1);
    adjustedCreatedAtMax.setUTCHours(0, 0, 0, 0);
  }

  const createdAtMinISO = adjustedCreatedAtMin.toISOString();
  const createdAtMaxISO = adjustedCreatedAtMax.toISOString();

  let allCustomers = [];
  console.log('Recuperando dados dos clientes...');

  // Loop para lidar com a paginação da API
  while (url) {
    const response = await axios({
      method: 'get',
      url: url,
      headers: {
        Authentication: `bearer ${code}`,
        'User-Agent': 'API-NuvemShop (lucasecom@artepropria.com)',
        'Content-Type': 'application/json'
      },
      params: {
        created_at_min: createdAtMinISO,
        created_at_max: createdAtMaxISO,
        per_page: 156
      },
    });

    const data = response.data;

    const customers = data.map(customer => ({
      id: customer.id,
      name: customer.name,
      createdAt: customer.created_at,
      buy: customer.last_order_id,
    }));

    allCustomers = allCustomers.concat(customers);

    // Verifica o cabeçalho "Link" para a próxima página
    const linkHeader = response.headers.link;
    const nextLinkMatch = /<([^>]+)>;\s*rel="next"/.exec(linkHeader);

    if (nextLinkMatch) {
      url = nextLinkMatch[1];
    } else {
      url = null; // Não há mais páginas
    }
  }

  return allCustomers;
};
