const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000; // Define a porta do servidor

app.use(express.json());

app.get('/products', async (req, res) => {
  try {
    const response = await axios.get('https://api.tiendanube.com/v1/3889735/products');
    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao buscar produtos');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
