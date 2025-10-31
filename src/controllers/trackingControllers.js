import { fetchTinyOrders } from '../services/trackingServices.js';

// controllers/orderController.js
/**
 * Controller para buscar pedidos
 * @param {import('next').NextApiRequest} req - Objeto de requisição do Next.js
 * @param {import('next').NextApiResponse} res - Objeto de resposta do Next.js
 */

export async function testarBuscaRastreioIsolada(req, res) {
  // Obtém parâmetros da query string da requisição
  const { id } = req.query;

  try {
    // Chama a camada de serviço
    const orderData = await fetchTinyOrders(id);

    // Retorna os dados com sucesso
    res.status(200).json({
      success: true,
      data: orderData,
    });
  } catch (error) {
    // Retorna o erro capturado do service
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor.',
    });
  }
}
