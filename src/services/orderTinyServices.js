import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TINY_API_TOKEN;
const baseUrl = process.env.TINY_API_URL;

export async function fetchOrderTiny(id) {
  const response = await axios.get(`${baseUrl}/pedidos.pesquisa.php`, {
    headers: {
      'Content-Type': 'application/json',
    },
    params: {
      token,
      formato: 'json',
      numeroEcommerce: id,
    },
  });

  if (response.data.retorno.status === 'OK') {
    const order = response.data.retorno.pedidos[0].pedido;

    return order;
  } else {
    throw new Error('Pedido não encontrado');
  }
}
