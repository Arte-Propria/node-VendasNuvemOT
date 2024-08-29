import { insertOrder, insertOrders } from '../services/orderServicesNuvem.js';

export const createOrder = async (req, res) => {
  const { store } = req.params;
  const order = req.body;

  if (!order || !store) {
    return res.status(400).json({ error: 'Store and order are required' });
  }

  try {
    console.log('Cadastrando pedido', order[0])
    await insertOrder(order[0], store); // Chama a função para inserir os pedidos no banco de dados

    res.status(201).json({ message: 'Pedido cadastrado!' });
  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    res.status(500).json({ error: 'Erro ao criar pedido' });
  }
};
