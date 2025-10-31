import dotenv from 'dotenv';

dotenv.config();

// services/tinyOrderService.js

/**
 * Service para buscar pedidos na API da Tiny
 * @param {string} token - Token de autenticação
 * @param {string} formato - Formato da resposta (ex: 'json')
 * @param {string} idPedido - (Opcional) ID de um pedido específico
 * @returns {Promise<Object>} - Dados retornados pela API da Tiny
 */

export async function fetchTinyOrders(idPedidoTiny) {
  // Constrói a URL. O idPedido é adicionado apenas se existir.
  const token = '0c90cddd418d073478fe69018fef2c14324e30bea2fe60d84959a08c3aaeada2';
  const formato = 'json'
  const url = `https://api.tiny.com.br/api2/pedidos.pesquisa.php?token=${token}&formato=${formato}&id=${idPedidoTiny}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Erro na API Tiny: ${response.status} - ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // Em produção, você pode querer logar o erro em um serviço específico
    console.error('Falha ao buscar pedidos da Tiny:', error);
    throw new Error('Não foi possível obter os dados dos pedidos.');
  }
}
