import { fetchCreateProduct } from '../services/productServices.js';

export const postProduct = async (req, res) => {
  try {
    const { store } = req.params;
    const { body } = req.body;
    await fetchCreateProduct({ store, body });
    return 
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao cadastrar produto');
  }
};
