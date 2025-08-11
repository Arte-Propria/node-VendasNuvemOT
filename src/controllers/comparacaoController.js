// controllers/comparacaoController.js
import { fetchTinyOrdersWithDetails } from '../services/tinyPedidosService.js';
import { fetchNuvemShopOrders } from '../services/orderServicesNuvem.js';
import { parseDate, isDateInRange } from '../utils/dateUtils.js';

export const compararPedidos = async (req, res) => {
  const { store, dataInicial, dataFinal } = req.params;
  console.log(`Iniciando comparação: ${store} de ${dataInicial} a ${dataFinal}`);
  
  try {
    // 1. Buscar pedidos do Tiny
    const pedidosTiny = await fetchTinyOrdersWithDetails(store, dataInicial, dataFinal);
    console.log(`[Tiny] ${pedidosTiny.length} pedidos encontrados`);
    
    // 2. Buscar pedidos da NuvemShop
    const pedidosNuvem = await fetchNuvemShopOrders(store, dataInicial, dataFinal);
    console.log(`[NuvemShop] ${pedidosNuvem.length} pedidos encontrados`);
    
    // 3. Comparar os pedidos apenas pelo número do pedido
    const resultados = compararPedidosPorNumero(pedidosTiny, pedidosNuvem);
    
    console.log(`Comparação concluída: ${resultados.length} resultados`);
    
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

const compararPedidosPorNumero = (pedidosTiny, pedidosNuvem) => {
  // 1. Criar mapas com chaves padronizadas (número do pedido)
  const mapaTiny = createSafeMap(pedidosTiny, 'tiny');
  const mapaNuvem = createSafeMap(pedidosNuvem, 'nuvem');
  
  console.log(`Mapa Tiny: ${mapaTiny.size} chaves | Exemplos: ${Array.from(mapaTiny.keys()).slice(0, 5).join(', ')}`);
  console.log(`Mapa Nuvem: ${mapaNuvem.size} chaves | Exemplos: ${Array.from(mapaNuvem.keys()).slice(0, 5).join(', ')}`);
  
  // 2. Array para resultados
  const todosResultados = [];
  let pedidosPareados = 0;
  let pedidosNaoPareados = 0;
  
  // 3. Comparar pedidos do Tiny com os da NuvemShop
  for (const [numPedido, pedidoTiny] of mapaTiny) {
    try {
      const pedidoNuvem = mapaNuvem.get(numPedido);
      
      if (pedidoNuvem) {
        pedidosPareados++;
        // Comparar SKUs dos produtos
        processProdutosPareados(pedidoTiny, pedidoNuvem, numPedido, todosResultados);
      } else {
        pedidosNaoPareados++;
        // Pedido encontrado apenas no Tiny
        pedidoTiny.produtos.forEach(produto => {
          todosResultados.push(createResult(
            numPedido, 
            produto.sku, 
            "Ocorrência: Pedido não encontrado na NuvemShop",
            false
          ));
        });
      }
    } catch (error) {
      console.error(`Erro processando pedido Tiny ${numPedido}:`, error);
    }
  }
  
  // 4. Processar pedidos encontrados apenas na NuvemShop
  for (const [numPedido, pedidoNuvem] of mapaNuvem) {
    if (!mapaTiny.has(numPedido)) {
      pedidosNaoPareados++;
      pedidoNuvem.produtos.forEach(produto => {
        todosResultados.push(createResult(
          numPedido, 
          produto.sku, 
          "Ocorrência: Pedido não encontrado no Tiny",
          false
        ));
      });
    }
  }
  
  console.log(`Resumo: 
  - Pedidos pareados: ${pedidosPareados}
  - Pedidos não pareados: ${pedidosNaoPareados}
  - Itens comparados: ${todosResultados.length}`);
  
  return todosResultados;
};

const createSafeMap = (pedidos, tipo) => {
  const map = new Map();
  const chavesVistas = new Set();
  
  (pedidos || []).forEach(pedido => {
    try {
      // Extrair número do pedido de forma segura
      let numeroPedido = 'N/A';
      
      if (tipo === 'tiny') {
        numeroPedido = pedido?.numero_ecommerce || pedido?.pedido || 'N/A';
      } else {
        numeroPedido = pedido?.pedido || pedido?.number || 'N/A';
      }
      
      // Converter para string, limpar espaços e padronizar
      const chave = String(numeroPedido).trim();
      
      // Ignorar chaves inválidas ou duplicadas
      if (chave === 'N/A' || chave === '' || chavesVistas.has(chave)) {
        return;
      }
      chavesVistas.add(chave);
      
      // Criar objeto seguro
      const safePedido = {
        id: pedido?.id || 'N/A',
        pedido: chave,
        produtos: Array.isArray(pedido?.produtos) 
          ? pedido.produtos.map(p => ({ 
              sku: p?.sku || 'SEM-SKU' 
            })) 
          : []
      };
      
      map.set(chave, safePedido);
      
    } catch (error) {
      console.error('Erro criando mapa seguro:', error);
    }
  });
  
  return map;
};

const processProdutosPareados = (pedidoTiny, pedidoNuvem, numPedido, resultados) => {
  // Criar mapa de SKUs da NuvemShop para comparação rápida
  const skusNuvem = new Set();
  pedidoNuvem.produtos.forEach(produto => {
    if (produto.sku) skusNuvem.add(produto.sku);
  });
  
  // Comparar cada produto do Tiny com os da NuvemShop
  pedidoTiny.produtos.forEach(produtoTiny => {
    if (produtoTiny.sku && skusNuvem.has(produtoTiny.sku)) {
      resultados.push(createResult(
        numPedido, 
        produtoTiny.sku, 
        "SKU correto",
        true
      ));
    } else {
      resultados.push(createResult(
        numPedido, 
        produtoTiny.sku, 
        `Ocorrência: SKU não encontrado na NuvemShop | Tiny: ${produtoTiny.sku}`,
        false
      ));
    }
  });
  
  // Verificar produtos na NuvemShop que não estão no Tiny
  pedidoNuvem.produtos.forEach(produtoNuvem => {
    if (!produtoNuvem.sku) return;
    
    const encontradoNoTiny = pedidoTiny.produtos.some(
      p => p.sku === produtoNuvem.sku
    );
    
    if (!encontradoNoTiny) {
      resultados.push(createResult(
        numPedido, 
        produtoNuvem.sku, 
        `Ocorrência: SKU não encontrado no Tiny | Nuvem: ${produtoNuvem.sku}`,
        false
      ));
    }
  });
};

const createResult = (pedido, sku, log, retorno) => ({
  Pedido: pedido,
  SKU: sku,
  log,
  retorno
});

export const compararPedidoNuvem = async (req, res) => {
  const { store, dataInicial, dataFinal } = req.params;
  
  try {
    // 2. Buscar pedidos da NuvemShop
    const pedidosNuvem = await fetchNuvemShopOrders(store, dataInicial, dataFinal);
    console.log(`[NuvemShop] ${pedidosNuvem.length} pedidos encontrados`);
    
    res.json({
      success: true,
      pedidosNuvem
    });
    
  } catch (error) {
    console.error("Erro tiny:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const compararPedidosTiny = async (req, res) => {
  const { store, dataInicial, dataFinal } = req.params;
  
  try {
    // 1. Buscar pedidos do Tiny
    const pedidosTiny = await fetchTinyOrdersWithDetails(store, dataInicial, dataFinal);
    console.log(`[Tiny] ${pedidosTiny.length} pedidos encontrados`);
    
    res.json({
      success: true,
      pedidosTiny
    });
    
  } catch (error) {
    console.error("Erro tiny:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};