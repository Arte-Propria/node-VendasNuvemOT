import { fetchCreateProduct } from '../services/productServices.js';

export const postProduct = async (req, res) => {
  try {
    const { store } = req.params;
    const { body } = req.body;
    const response = await fetchCreateProduct({ store, body });
    
    // Enviar uma resposta clara para o frontend
    return res.status(response.status).json({
      message: response.statusText,
      data: response.data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send('Erro ao cadastrar produto');
  }
};
