/* eslint-disable camelcase */
import axios from 'axios';
import dotenv from 'dotenv';
import { query } from '../db/db.js';

dotenv.config();

// 1. Função para realizar o fetch
export const fetchTestRequest = async () => {
  let allDeliveries = [];

  try {
    const response = await query(`SELECT * FROM info_mandae`);

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