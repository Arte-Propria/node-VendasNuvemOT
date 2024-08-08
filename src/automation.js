import dotenv from 'dotenv';
import { fetchOrders, insertOrders } from './services/orderServicesNuvem.js';

dotenv.config();

// Função para buscar e inserir pedidos
export const processOrders = async (store, startDate, endDate) => {
  try {
    const orders = await fetchOrders({ store, createdAtMin: startDate, createdAtMax: endDate });
    if(orders) {
      await insertOrders(orders, store);
    }
  } catch (err) {
    console.error(`Erro ao processar pedidos da loja ${store}:`, err.response.data);
  } finally {
    console.log(`Pedidos da loja ${store} processados com sucesso.`);
  }
};

export const updateTodayOrders = async () => {
  const currentDateStart = new Date();
  currentDateStart.setHours(0, 0, 0, 0);

  const currentDateEnd = new Date();
  currentDateEnd.setHours(currentDateEnd.getHours() - 3);

  console.log('Iniciando a atualização de pedidos do dia atual...');
  await processOrders('outlet', currentDateStart.toISOString(), currentDateEnd.toISOString());
  await processOrders('artepropria', currentDateStart.toISOString(), currentDateEnd.toISOString());
};

export const updateLastTwoMonthsOrders = async () => {
  let currentMonth = new Date();
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  currentMonth.setDate(1);
  
  const twoMonthsAgo = new Date(currentMonth);
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 1);

  while (currentMonth > twoMonthsAgo) {
    const startDate = new Date(currentMonth);
    const endDate = new Date(currentMonth);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);

    console.log(`Iniciando a atualização de pedidos de ${startDate.toISOString()} até ${endDate.toISOString()}...`);
    
    await processOrders('outlet', startDate.toISOString(), endDate.toISOString());
    await processOrders('artepropria', startDate.toISOString(), endDate.toISOString());

    currentMonth.setMonth(currentMonth.getMonth() - 1);
  }
};

export const updateAllOrders = async () => {
  let startDate = new Date('2023-11-22');
  const endDate = new Date();

  while (startDate < endDate) {
    const currentEndDate = new Date(startDate);
    currentEndDate.setMonth(currentEndDate.getMonth() + 1);
    if (currentEndDate > endDate) {
      currentEndDate = endDate;
    }
    
    console.log(`Iniciando a atualização de pedidos de ${startDate.toISOString()} até ${currentEndDate.toISOString()}...`);

    await processOrders('outlet', startDate.toISOString(), currentEndDate.toISOString());
    await processOrders('artepropria', startDate.toISOString(), currentEndDate.toISOString());

    startDate.setMonth(startDate.getMonth() + 1);
    startDate.setDate(1); // Avançando para o início do próximo mês
  }
};


