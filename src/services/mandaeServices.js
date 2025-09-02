/* eslint-disable camelcase */
import axios from 'axios';
import dotenv from 'dotenv';
import { query } from '../db/db.js';
import { logEcommerce } from '../utils/logger.js';

dotenv.config();

export async function queryMandae() {
  try {
    const response = await query(`SELECT * FROM info_mandae`);
    return response;
  } catch (error) {
    console.error(`Error fetching Deliveries data from Mandae`, error.message);
    return [];
  }
}

// 1. Função para realizar o fetch
export const fetchTestRequest = async () => {
  let allDeliveries = [];

  try {
    const response = await queryMandae();

    const result = response.rows.map((delivery) => ({
      id: delivery.id_ped,
      order_id: delivery.cod_ped,
      store: delivery.empresa,
      name_client: delivery.nome_cli,
      lastDate: delivery.dt_pag,
      rastreio: delivery.cod_rastreio,
      linkRastreio: delivery.detalhes_rastreio,
      total: delivery.valor,
      status: delivery.situacao,
      statusEntrega: delivery.status_mandae
    }));
    allDeliveries = allDeliveries.concat(result);

    return allDeliveries || [];
  } catch (error) {
    console.error(`Error fetching Deliveries data from Mandae`, error.message);
    return [];
  }
};

// Função para filtrar os dados formatados por data
export const filterMandaeData = (data, { store, startDate, endDate }) => {
  try {
    // Normalizar o nome da loja para comparação case-insensitive
    const normalizedStore = store.toUpperCase();

    // Converter datas para objetos Date
    const start = new Date(startDate + 'T00:00:00.000Z');
    const end = new Date(endDate + 'T23:59:59.999Z');

    // Validar datas
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Datas inválidas');
    }

    return data.filter((item) => {
      // Verificar correspondência da loja (case-insensitive)
      if (normalizedStore && item.store.toUpperCase() !== normalizedStore)
        return false;

      // Converter a data do item
      const itemDate = new Date(item.lastDate);

      // Verificar se está dentro do intervalo
      return itemDate >= start && itemDate <= end;
    });
  } catch (error) {
    console.error('Error filtering data:', error.message);
    throw new Error('Erro ao filtrar dados');
  }
};

// Função para filtrar os dados formatados
export const filterMandaeStore = (data, { store }) => {
  try {
    // Normalizar o nome da loja para comparação case-insensitive
    const normalizedStore = store.toUpperCase();

    return data.filter((item) => {
      // Verificar correspondência da loja (case-insensitive)
      if (normalizedStore && item.store.toUpperCase() !== normalizedStore)
        return false;

      return item;
    });
  } catch (error) {
    console.error('Error filtering data:', error.message);
    throw new Error('Erro ao filtrar dados');
  }
};

// Função para atualizar a tabela info_mandae
export const updateMandaeInfo = async (order, store) => {
  try {
    // 1. Buscar o pedido na tabela info_mandae pelo id_ped
    const findOrderQuery = `SELECT * FROM info_mandae WHERE id_ped = $1`;
    const orderResult = await query(findOrderQuery, [order.id]);

    if (orderResult.rows.length === 0) {
      console.log(`Pedido ${order.id} não encontrado na tabela info_mandae`);
      return;
    }

    const mandaeOrder = orderResult.rows[0];

    // 2. Determinar os novos valores para os campos
    let newSituacao = mandaeOrder.situacao;
    let newStatusPed = mandaeOrder.status_ped;
    let newCodRastreio = mandaeOrder.cod_rastreio;
    let newDetalhesRastreio = mandaeOrder.detalhes_rastreio;

    // 3. Verificar se o status é 'cancelled' e atualizar a situacao
    if (order.status === 'cancelled') {
      newSituacao = 'CANCELLED';
    }
    // Verificar se o shipping_status é 'delivered' e atualizar a situacao
    else if (
      order.shipping_status === 'delivered' &&
      mandaeOrder.situacao === 'NOK'
    ) {
      newSituacao = 'OK';
    }

    // 4. Atualizar status_ped com base no status do pedido da Nuvemshop
    if (
      order.status &&
      ['open', 'closed', 'cancelled'].includes(order.status)
    ) {
      newStatusPed = order.status;
    }

    // 5. Atualizar código de rastreio se estiver vazio ou divergente
    if (
      order.shipping_tracking_number &&
      (mandaeOrder.cod_rastreio === 'None' ||
        !mandaeOrder.cod_rastreio ||
        mandaeOrder.cod_rastreio !== order.shipping_tracking_number)
    ) {
      newCodRastreio = order.shipping_tracking_number;
    }

    // 6. Atualizar detalhes de rastreio se estiver vazio ou divergente
    if (
      order.shipping_tracking_url &&
      (!mandaeOrder.detalhes_rastreio ||
        mandaeOrder.detalhes_rastreio !== order.shipping_tracking_url)
    ) {
      newDetalhesRastreio = order.shipping_tracking_url;
    }

    // 7. Atualizar a data da última modificação
    const currentDate = new Date().toISOString();

    // 8. Query de atualização com todos os campos
    const updateQuery = `
      UPDATE info_mandae 
      SET 
        situacao = $1, 
        status_ped = $2,
        cod_rastreio = $3,
        detalhes_rastreio = $4,
        dt_atualizacao = $5
      WHERE id_ped = $6
    `;

    await query(updateQuery, [
      newSituacao,
      newStatusPed,
      newCodRastreio,
      newDetalhesRastreio,
      currentDate,
      order.id
    ]);

    logEcommerce(`Pedido ${order.id} atualizado na info_mandae:
      - situacao: ${newSituacao}
      - status_ped: ${newStatusPed}
      - cod_rastreio: ${newCodRastreio}
      - detalhes_rastreio: ${newDetalhesRastreio}
      - dt_atualizacao: ${currentDate}
    `);
  } catch (err) {
    console.error('Erro ao atualizar pedido na info_mandae:', err);
  }
};

// Webhook para atualizar info_mandae com dados da Mandae
export const webhookMandaeInfo = async (id_ped, status_mandae) => {
  try {
    // 1. Buscar o pedido na tabela info_mandae
    const findOrderQuery = `SELECT * FROM info_mandae WHERE id_ped = $1`;
    const orderResult = await query(findOrderQuery, [id_ped]);
    
    if (orderResult.rows.length === 0) {
      throw new Error(`Pedido ${id_ped} não encontrado na tabela info_mandae`);
    }
    
    const mandaeOrder = orderResult.rows[0];
    
    // 2. Preparar o array de status_mandae
    let currentStatusArray = [];
    
    try {
      // Converter status_mandae de string JSON para array, se necessário
      if (typeof mandaeOrder.status_mandae === 'string') {
        currentStatusArray = JSON.parse(mandaeOrder.status_mandae);
      } else if (Array.isArray(mandaeOrder.status_mandae)) {
        currentStatusArray = mandaeOrder.status_mandae;
      }
    } catch (err) {
      console.error("Erro ao processar status_mandae:", err);
      currentStatusArray = [];
    }
    
    // 3. Adicionar novo status ao array
    currentStatusArray.push(status_mandae);
    
    // 4. Atualizar ultima_att_mandae com a data do último evento
    const ultima_att_mandae = new Date(status_mandae.timestamp || status_mandae.date);
    
    // 5. Calcular diferença de dias para determinar a situacao
    const today = new Date();
    const currentDate = today.toISOString();
    const diffTime = Math.abs(today - ultima_att_mandae);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let situacao = mandaeOrder.situacao;
    if (diffDays >= 2) {
      situacao = "NOK"; // Pedido em atraso
    } else {
      situacao = "OK"; // Pedido no prazo
    }
    
    // 6. Query de atualização
    const updateQuery = `
      UPDATE info_mandae 
      SET 
        status_mandae = $1,
        ultima_att_mandae = $2,
        situacao = $3,
        dt_atualizacao = $4
      WHERE id_ped = $5
    `;
    
    await query(updateQuery, [
      JSON.stringify(currentStatusArray),
      ultima_att_mandae.toISOString(),
      situacao,
      currentDate,
      id_ped
    ]);
    
    return {
      message: `Pedido ${id_ped} atualizado via webhook Mandae`,
      details: {
        new_event: status_mandae.name,
        ultima_att_mandae: ultima_att_mandae.toISOString(),
        dt_atualizacao: currentDate,
        situacao
      }
    };
    
  } catch (err) {
    console.error("Erro no service updateMandaeInfo:", err);
    throw err;
  }
};
