/* eslint-disable camelcase */
import axios from 'axios';
import dotenv from 'dotenv';
import { query } from '../db/db.js';

dotenv.config();

export async function queryMandae() {
  try {
    const response = await query(`SELECT * FROM info_mandae`);
    return response
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
    
    return data.filter(item => {
      // Verificar correspondência da loja (case-insensitive)
      if (normalizedStore && item.store.toUpperCase() !== normalizedStore) return false;
      
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

    
    return data.filter(item => {
      // Verificar correspondência da loja (case-insensitive)
      if (normalizedStore && item.store.toUpperCase() !== normalizedStore) return false;
      
      return item
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
    
    // 2. Verificar se o shipping_status é 'delivered' e atualizar a situacao
    let newSituacao = mandaeOrder.situacao;
    if (order.shipping_status === 'delivered' && mandaeOrder.situacao === 'NOK') {
      newSituacao = 'OK';
    }
    
    // 3. Atualizar a data da última modificação
    const currentDate = new Date().toISOString();
    
    // 4. Query de atualização
    const updateQuery = `
      UPDATE info_mandae 
      SET situacao = $1, ultima_att = $2
      WHERE id_ped = $3
    `;
    
    await query(updateQuery, [newSituacao, currentDate, order.id]);
    console.log(`Mandae - Pedido ${order.id} atualizado: situacao = ${newSituacao}, ultima_att = ${currentDate}`);
    
  } catch (err) {
    console.error("Erro ao atualizar pedido na info_mandae:", err);
  }
};