/* eslint-disable camelcase */
import axios from 'axios';
import dotenv from 'dotenv';
import { query } from '../db/db.js';
import { logEcommerce, logMandae } from '../utils/logger.js';

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
    const normalizedStore = (store === 'artepropria' ? 'ARTE_PROPRIA'  : store.toUpperCase());

    return data.filter((item) => {
      // Verificar correspondência da loja (case-insensitive)
      if (normalizedStore && (item.store === 'artepropria' ? 'ARTE_PROPRIA'  : item.store.toUpperCase()) !== normalizedStore)
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
      logMandae(`Pedido ${order.id} não encontrado na tabela info_mandae`);
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
      (order.shipping_status === 'delivered' &&
        mandaeOrder.situacao === 'NOK') ||
      (order.shipping_status === 'delivered' && mandaeOrder.situacao === '-')
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

    logMandae(`Pedido ${order.id} atualizado na info_mandae:
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
export const webhookMandaeInfo = async (mandaeData) => {
  try {
    const { trackingCode, events } = mandaeData;

    // 1. Buscar o pedido na tabela info_mandae
    const findOrderQuery = `SELECT * FROM info_mandae WHERE cod_rastreio = $1`;
    const orderResult = await query(findOrderQuery, [trackingCode]);

    if (orderResult.rows.length === 0) {
      throw new Error(
        `Pedido com código de rastreio ${trackingCode} não encontrado na tabela info_mandae`
      );
    }

    const mandaeOrder = orderResult.rows[0];
    const id_ped = mandaeOrder.id_ped; // Extrair id_ped para uso nos logs

    // 2. Preparar o array de status_mandae
    let currentStatusArray = [];
    let hasInvalidData = false;

    try {
      // Verificar se o valor é "nan" ou outro valor inválido
      if (
        mandaeOrder.status_mandae === 'nan' ||
        mandaeOrder.status_mandae === 'NaN' ||
        mandaeOrder.status_mandae === 'null' ||
        mandaeOrder.status_mandae === null ||
        mandaeOrder.status_mandae === undefined
      ) {
        hasInvalidData = true;
        currentStatusArray = [];
      }
      // Tentar converter de string JSON para array
      else if (typeof mandaeOrder.status_mandae === 'string') {
        try {
          currentStatusArray = JSON.parse(mandaeOrder.status_mandae);
          if (!Array.isArray(currentStatusArray)) {
            hasInvalidData = true;
            currentStatusArray = [];
          }
        } catch (parseError) {
          hasInvalidData = true;
          currentStatusArray = [];
          logMandae(
            `Pedido ${id_ped} com valor inválido em status_mandae: ${mandaeOrder.status_mandae}. Substituindo por array vazio.`
          );
        }
      }
      // Se já for array, usar diretamente
      else if (Array.isArray(mandaeOrder.status_mandae)) {
        currentStatusArray = mandaeOrder.status_mandae;
      }
      // Qualquer outro caso, considerar inválido
      else {
        hasInvalidData = true;
        currentStatusArray = [];
      }
    } catch (err) {
      console.error(
        `[Pedido: ${id_ped}] Erro ao processar status_mandae:`,
        err
      );
      hasInvalidData = true;
      currentStatusArray = [];
    }

    // 3. Se havia dados inválidos, usar apenas os novos eventos
    // Caso contrário, mesclar os eventos existentes com os novos
    let finalStatusArray;

    if (hasInvalidData) {
      logMandae(
        ` Substituindo valor inválido no pedido ${id_ped} em status_mandae por novos eventos para trackingCode: ${trackingCode}`
      );
      finalStatusArray = [...events]; // Usa apenas os novos eventos
    } else {
      // Mesclar eventos existentes com novos, evitando duplicatas
      finalStatusArray = [...currentStatusArray];

      events.forEach((newEvent) => {
        const existingEventIndex = finalStatusArray.findIndex(
          (existingEvent) => existingEvent.id === newEvent.id
        );

        if (existingEventIndex === -1) {
          // Evento não existe, adicionar ao array
          finalStatusArray.push(newEvent);
        } else {
          // Evento já existe, atualizar com os novos dados
          finalStatusArray[existingEventIndex] = newEvent;
        }
      });
    }

    // 4. Ordenar eventos por timestamp (do mais recente para o mais antigo)
    finalStatusArray.sort((a, b) => {
      return new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date);
    });

    // 5. Usar o evento mais recente para atualizar ultima_att
    const latestEvent = finalStatusArray[0];
    const ultima_att_mandae = new Date(
      latestEvent.timestamp || latestEvent.date
    );

    // 5. Calcular diferença de dias para determinar a situacao
    const today = new Date();
    const currentDate = today.toISOString();
    const diffTime = Math.abs(today - ultima_att_mandae);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let situacao = mandaeOrder.situacao;
    if (diffDays >= 2) {
      situacao = 'NOK'; // Pedido em atraso
    } else {
      situacao = 'OK'; // Pedido no prazo
    }

    // 6. Query de atualização
    const updateQuery = `
      UPDATE info_mandae 
      SET 
        status_mandae = $1,
        ultima_att_mandae = $2,
        situacao = $3,
        dt_atualizacao = $4
      WHERE cod_rastreio  = $5
    `;

    await query(updateQuery, [
      JSON.stringify(finalStatusArray),
      ultima_att_mandae.toISOString(),
      situacao,
      currentDate,
      trackingCode
    ]);

    return {
      message: `Pedido ${id_ped} com código de rastreio ${trackingCode} atualizado via webhook Mandae`,
      details: {
        had_invalid_data: hasInvalidData,
        events_added: events.length,
        total_events_now: finalStatusArray.length,
        latest_event: latestEvent.name,
        ultima_att_mandae: ultima_att_mandae.toISOString(),
        dt_atualizacao: currentDate,
        situacao
      }
    };
  } catch (err) {
    console.error('Erro no service updateMandaeInfo:', err);
    throw err;
  }
};
