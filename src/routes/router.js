import express from 'express';
import { getProduct, getProducts } from '../controllers/productsController.js';
import { getOrders, getOrdersByDate, getOrdersByStore } from '../controllers/ordersController.js';
import { getCustomers } from '../controllers/customersController.js';
import { getOrdersBot } from '../controllers/ordersBotController.js';
import { getCoupons } from '../controllers/couponsControllers.js';
import { getAnalytics } from '../controllers/analyticsControllers.js';
import { getDataADSMeta } from '../controllers/dataADSMetaControllers.js';
import { createOrder } from '../controllers/createOrderController.js'; // Importe o controlador de criação de pedidos

const router = express.Router();

// Rota para buscar produtos
router.get('/products', getProducts);
router.get('/product/:store/:id', getProduct);
router.get('/coupons/:store', getCoupons);
router.get('/orders/', getOrders);
router.get('/orders/:store/:cpf', getOrdersBot);
router.get('/orders/:store/:createdAtMin/:createdAtMax', getOrders);
router.get('/customers/:store/:createdAtMin/:createdAtMax', getCustomers);

// Rota para buscar todos os pedidos de uma loja específica
router.get('/db/orders/:store', getOrdersByStore);

// Rota para buscar pedidos por data
router.get('/db/orders/:store/:createdAtMin/:createdAtMax', getOrdersByDate);

// Meta ADS
router.get('/ads/meta/:store/:createdAtMin/:createdAtMax', getDataADSMeta);

// Google Analytics
router.get('/analytics/:store/:createdAtMin/:createdAtMax', getAnalytics);

// Rota para criar pedidos
router.post('/order', createOrder); // Adicione a rota para criar um novo pedido

export default router;
