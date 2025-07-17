import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config();

const token = process.env.TINY_API_TOKEN_ARTEINTEGRADAES
const tokenAbstract = process.env.TINY_API_TOKEN_ABSTRACT
const baseUrl = process.env.TINY_API_URL

// Mapeamento de nomes de lojas
const storeMapping = {
  outlet: 'OUTLETDOSQUADROS',
  artepropria: 'ARTEPROPRIA'
  // -- Adicione outros mapeamentos conforme necessário --
};

// Função para buscar detalhes de um pedido específico
const fetchOrderDetails = async (orderId) => {
  try {
    const params = {
      token,
      formato: 'json',
      id: orderId
    };

    const response = await axios.get(`${baseUrl}/pedido.obter.php`, {
      params,
      headers: { "Content-Type": "application/json" }
    });

    const { retorno } = response.data;
    
    if (retorno.status === 'Erro') {
      const erro = retorno.erros[0].erro;
      throw new Error(`Tiny API Error [Pedido ${orderId}]: ${erro}`);
    }

    return retorno.pedido;

  } catch (error) {
    console.error(`Erro ao buscar pedido ${orderId}:`, error.message);
    return { 
      id: orderId,
      error: error.message
    };
  }
};

// Função para aguardar um tempo específico
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função principal para buscar todos os pedidos com detalhes
export const fetchTinyOrdersWithDetails = async (store, createdAtMin, createdAtMax) => {
  try { 
    // Verificar se a store existe no mapeamento
    const storeName = storeMapping[store.toLowerCase()];
    if (!storeName) {
      throw new Error(`Nome de loja inválido: ${store}. Opções válidas: ${Object.keys(storeMapping).join(', ')}`)
    }

    // TRATAMENTO DE DATAS (conforme solicitado)
    let startDate = new Date(createdAtMin);
    startDate.setDate(startDate.getDate() - 1); // Subtrai um dia
    startDate.setHours(startDate.getHours() - 3); // Ajuste para UTC-3
    
    let endDate = new Date(createdAtMax);
    endDate.setDate(endDate.getDate() + 1); // Adiciona um dia
    endDate.setHours(endDate.getHours() - 3); // Ajuste para UTC-3
    
    // Formatar datas para dd/mm/yyyy (após o tratamento)
    const formatDate = (dateObj) => {
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      return `${day}/${month}/${year}`
    };

    // Busca lista de pedidos  
  const listParams = {  
    token,  
    formato: 'json',  
    dataInicial: formatDate(startDate),  
    dataFinal: formatDate(endDate)  
  };

    const listResponse = await axios.get(`${baseUrl}/pedidos.pesquisa.php`, {
      params: listParams
    });

    const { retorno } = listResponse.data;
    
    if (retorno.status === 'Erro') {
      throw new Error(`Tiny API Error: ${retorno.erros[0].erro}`);
    }

    // Extrai IDs dos pedidos
    const orderIds = retorno.pedidos.map(p => p.pedido.id);
    
    // Divide os IDs em lotes de 10
    const batches = [];
    const batchSize = 10;
    
    for (let i = 0; i < orderIds.length; i += batchSize) {
      batches.push(orderIds.slice(i, i + batchSize));
    }

    let allOrders = [];
    
    // Processa cada lote com intervalo de 10 segundos
    for (let i = 0; i < batches.length; i++) {
      console.log(`Processando lote ${i + 1}/${batches.length}...`);
      
      // Processa os 10 pedidos do lote em paralelo
      const batchResults = await Promise.all(
        batches[i].map(id => fetchOrderDetails(id))
      );
      
      allOrders = [...allOrders, ...batchResults];
      
      // Aguarda 10 segundos se não for o último lote
      if (i < batches.length - 1) {
        console.log(`Aguardando 10 segundos antes do próximo lote...`);
        await wait(10000); // 10 segundos
      }
    }

       // Filtrar pedidos pelo nome do e-commerce
    const filteredOrders = allOrders.filter(order => {
      // Verificar se o pedido tem informações de e-commerce
      if (!order.ecommerce || !order.ecommerce.nomeEcommerce) {
        return false;
      }
      // Comparação case-insensitive
      return order.ecommerce.nomeEcommerce.toLowerCase() === storeName.toLowerCase();
    });

     // Simplificar a resposta dos pedidos
    const simplifiedOrders = filteredOrders.map(order => {
      // Se o pedido tiver erro, retornamos apenas id e erro
      if (order.error) {
        return {
          id: order.id,
          error: order.error
        };
      }
      
      // Extrair produtos
      const produtos = [];
      if (order.itens && Array.isArray(order.itens)) {
        order.itens.forEach(item => {
          if (item.item && item.item.codigo) {
            produtos.push({
              sku: item.item.codigo
            });
          }
        });
      }
      
      // Retornar estrutura simplificada
      return {
        id: order.id,
        created_at: order.data_pedido,
        pedido: order.numero_ecommerce || order.numero || 'N/A',
        produtos
      };
    });

    return simplifiedOrders;

  } catch (error) {
    console.error("Erro ao buscar pedidos no Tiny:", error.message);
    throw error;
  }
};