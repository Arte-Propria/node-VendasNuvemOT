// controllers/comparacaoController.js
import { fetchTinyOrdersWithDetails } from '../services/tinyPedidosService.js';
import { fetchNuvemShopOrders } from '../services/orderServicesNuvem.js';
import { parseDate, isDateInRange } from '../utils/dateUtils.js';

export const compararPedidos = async (req, res) => {
  const { store, dataInicial, dataFinal } = req.params;
  
  try {
    // 1. Buscar pedidos do Tiny
    const pedidosTiny = await fetchTinyOrdersWithDetails(store, dataInicial, dataFinal);
    console.log(`[Tiny] ${pedidosTiny.length} pedidos encontrados`);
    
    // 2. Buscar pedidos da NuvemShop
    const pedidosNuvem = await fetchNuvemShopOrders(store, dataInicial, dataFinal);
    console.log(`[NuvemShop] ${pedidosNuvem.length} pedidos encontrados`);
    
    // 3. Comparar os pedidos
    const resultados = compararPedidosPorNumero(
      pedidosTiny, 
      pedidosNuvem,
      dataInicial,
      dataFinal
    );
    
    res.json({
      success: true,
      periodo: `${dataInicial} - ${dataFinal}`,
      totalPedidosTiny: pedidosTiny.length,
      totalPedidosNuvem: pedidosNuvem.length,
      totalComparados: resultados.length,
      resultados
    });
    
  } catch (error) {
    console.error("Erro na comparação:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Função principal de comparação
const compararPedidosPorNumero = (pedidosTiny, pedidosNuvem, dataInicial, dataFinal) => {
  // 1. Criar mapas seguros
  const mapaTiny = createSafeMap(pedidosTiny);
  const mapaNuvem = createSafeMap(pedidosNuvem);
  
  // 2. Array para resultados
  const todosResultados = [];
  
  // 3. Comparar pedidos do Tiny
  for (const [numPedido, pedidoTiny] of mapaTiny) {
    try {
      const pedidoNuvem = mapaNuvem.get(numPedido) || {};
      const dataPedido = getSafeOrderDate(pedidoTiny, pedidoNuvem);
      
      // Pular pedidos sem data válida ou fora do período
      if (!isValidDateInRange(dataPedido, dataInicial, dataFinal)) {
        continue;
      }
      
      // Processar produtos do Tiny
      processTinyProducts(pedidoTiny, pedidoNuvem, numPedido, todosResultados);
      
    } catch (error) {
      console.error(`Erro processando pedido Tiny ${numPedido}:`, error);
    }
  }
  
  // 4. Processar pedidos exclusivos da NuvemShop
  for (const [numPedido, pedidoNuvem] of mapaNuvem) {
    try {
      if (!mapaTiny.has(numPedido)) {
        const dataPedido = getSafeOrderDate(null, pedidoNuvem);
        
        // Pular pedidos sem data válida ou fora do período
        if (!isValidDateInRange(dataPedido, dataInicial, dataFinal)) {
          continue;
        }
        
        // Processar produtos da NuvemShop
        processNuvemProducts(numPedido, pedidoNuvem, todosResultados);
      }
    } catch (error) {
      console.error(`Erro processando pedido Nuvem ${numPedido}:`, error);
    }
  }
  
  return todosResultados;
};

// Funções auxiliares
const createSafeMap = (pedidos) => {
  const map = new Map();
  
  (pedidos || []).forEach(pedido => {
    const safePedido = {
      id: pedido?.id || 'N/A',
      pedido: pedido?.pedido?.toString() || 'N/A',
      produtos: Array.isArray(pedido?.produtos) 
        ? pedido.produtos.map(p => ({ sku: p?.sku || 'SEM-SKU' })) 
        : [],
      created_at: pedido?.created_at || ''
    };
    
    if (safePedido.pedido !== 'N/A') {
      map.set(safePedido.pedido, safePedido);
    }
  });
  
  return map;
};

const getSafeOrderDate = (pedidoTiny, pedidoNuvem) => {
  // Priorizar Tiny
  if (pedidoTiny?.created_at) {
    return parseDate(pedidoTiny.created_at);
  }
  
  // Usar NuvemShop como fallback
  if (pedidoNuvem?.created_at) {
    return parseDate(pedidoNuvem.created_at);
  }
  
  // Fallback final: data atual
  return new Date();
};

const isValidDateInRange = (date, start, end) => {
  if (!date || isNaN(date)) {
    console.warn('Data inválida encontrada', { date });
    return false;
  }
  return isDateInRange(date, start, end);
};

const processTinyProducts = (pedidoTiny, pedidoNuvem, numPedido, resultados) => {
  // Caso 1: Pedido não encontrado na NuvemShop
  if (!pedidoNuvem || !pedidoNuvem.produtos) {
    pedidoTiny.produtos.forEach(produto => {
      resultados.push(createResult(
        numPedido, 
        produto.sku, 
        "Ocorrência: Pedido não encontrado na NuvemShop",
        false
      ));
    });
    return;
  }
  
  // Caso 2: Comparar SKUs
  pedidoTiny.produtos.forEach(produtoTiny => {
    const produtoNuvem = pedidoNuvem.produtos.find(p => p.sku === produtoTiny.sku);
    
    if (produtoNuvem) {
      resultados.push(createResult(
        numPedido, 
        produtoTiny.sku, 
        "SKU correto",
        true,
        produtoTiny.created_at
      ));
    } else {
      resultados.push(createResult(
        numPedido, 
        produtoTiny.sku, 
        `Ocorrência: Divergência de SKU entre plataformas\nNuvemShop: Não encontrado\nTiny: ${produtoTiny.sku}`,
        false,
        produtoTiny.created_at
      ));
    }
  });
};

const processNuvemProducts = (numPedido, pedidoNuvem, resultados) => {
  pedidoNuvem.produtos.forEach(produto => {
    resultados.push(createResult(
      numPedido, 
      produto.sku, 
      "Ocorrência: Pedido não encontrado no Tiny",
      false,
      pedidoNuvem.created_at
    ));
  });
};

const createResult = (pedido, sku, log, retorno, created_at) => ({
  Pedido: pedido,
  SKU: sku,
  created_at: created_at,
  log,
  retorno
});
