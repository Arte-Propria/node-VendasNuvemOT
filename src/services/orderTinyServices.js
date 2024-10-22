import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TINY_API_TOKEN;
const baseUrl = process.env.TINY_API_URL;

export async function fetchOrderTiny(id, cpf) {
  const order = await axios.get(`${baseUrl}/pedidos.pesquisa.php`, {
    headers: {
      'Content-Type': 'application/json',
    },
    params: {
      token,
      formato: 'json',
      cpf_cnpj: cpf,
      numeroEcommerce: id,
    },
  });
  
  if (order.data.retorno.status === 'OK') {
    const idTiny = order.data.retorno.pedidos[0].pedido.id;

    const orderFull = await axios.get(`${baseUrl}/pedido.obter.php`, {
      headers: {
        'Content-Type': 'application/json',
      },
      params: {
        token,
        formato: 'json',
        id: idTiny,
      },
    });

    if (orderFull.data.retorno.status === 'OK') {
      
      return orderFull.data.retorno.pedido
    }

  } else {
    throw new Error('Pedido não encontrado');
  }

}

export async function fetchNoteOrderTiny(id, cpf) {
  const response = await axios.get(`${baseUrl}/notas.fiscais.pesquisa.php`, {
    headers: {
      'Content-Type': 'application/json',
    },
    params: {
      token,
      formato: 'json',
      cpf_cnpj: cpf,
      numeroEcommerce: id,
    },
  });

  if (response.data.retorno.status === 'OK') {
    const note = response.data.retorno.notas_fiscais[0].nota_fiscal;

    return note;
  } else {
    throw new Error('Pedido não encontrado no Tiny');
  }
}

export async function fetchLinkNote(id) {
  const response = await axios.get(`${baseUrl}/nota.fiscal.obter.link.php`, {
    headers: {
      'Content-Type': 'application/json',
    },
    params: {
      token,
      formato: 'json',
      id,
    },
  });

  if (response.data.retorno.status === 'OK') {
    const linkNote = response.data.retorno.link_nfe;

    return linkNote;
  } else {
    throw new Error('Nota não encontrada no Tiny');
  }
}
