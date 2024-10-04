import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export const fetchCoupons = async (params = {}) => {
  const { store } = params;
  let code;
  let storeId;

  if (store === 'outlet') {
    code = process.env.ACCESS_TOKEN_OUTLET;
    storeId = process.env.STORE_ID_OUTLET;
  }
  if (store === 'artepropria') {
    code = process.env.ACCESS_TOKEN_ARTEPROPRIA;
    storeId = process.env.STORE_ID_ARTEPROPRIA;
  }

  let url = `https://api.tiendanube.com/v1/${storeId}/coupons`;
  
  let allCoupons = [];
  console.log('Recuperando dados dos cupons...');

  // Loop para lidar com a paginação da API
  while(url) {
    const response = await axios({
      method: 'get',
      url: url,
      headers: {
        Authentication: `bearer ${code}`,
        'User-Agent': 'API-NuvemShop (lucasecom@artepropria.com)',
        'Content-Type': 'application/json',
      },
      params: {
        per_page: 156,
      },
    });

    const data = response.data;

    const coupons = data.map(element => {
      return {
        id: element.id,
        code: element.code,
        type: element.type,
        value: element.value,
        used: element.used,
        data: element,
      };
    });

    allCoupons = allCoupons.concat(coupons);
    
    // Verifica o cabeçalho "Link" para a próxima página
    const linkHeader = response.headers.link;
    const nextLinkMatch = /<([^>]+)>;\s*rel="next"/.exec(linkHeader);

    if (nextLinkMatch) {
      url = nextLinkMatch[1];
    } else {
      url = null; // Não há mais páginas
    }
  }

  return allCoupons;
};

export const createCoupon = async (params = {}, codeCoupon) => {
  const { store } = params;
  let code;
  let storeId;

  if (store === 'outlet') {
    code = process.env.ACCESS_TOKEN_OUTLET;
    storeId = process.env.STORE_ID_OUTLET;
  }
  if (store === 'artepropria') {
    code = process.env.ACCESS_TOKEN_ARTEPROPRIA;
    storeId = process.env.STORE_ID_ARTEPROPRIA;
  }

  let url = `https://api.tiendanube.com/v1/${storeId}/coupons`;
  
  console.log(`Criando cupom...${codeCoupon}`);

  const body =  {
    code: codeCoupon,
    type: "percentage",
    value: "10.00",
    max_uses: null,
    includes_shipping: true,
    first_consumer_purchase: true,
  }

  const response = await axios({
    method: 'post',
    url: url,
    data: body,
    headers: {
      Authentication: `bearer ${code}`,
      'User-Agent': 'API-NuvemShop (lucasecom@artepropria.com)',
      'Content-Type': 'application/json',
    },
  });

  const data = response.data

  return data;
};
