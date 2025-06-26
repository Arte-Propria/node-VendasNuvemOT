# Configuração da Autenticação SHEIN

Este documento explica como configurar a autenticação OAuth2 da SHEIN no seu backend.

## Pré-requisitos

1. Conta de desenvolvedor na SHEIN Open Platform
2. Aplicação registrada na plataforma SHEIN
3. Client ID e Client Secret da sua aplicação

## Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```env
# Configurações da SHEIN
SHEIN_APP_ID=seu_client_id_aqui
SHEIN_SECRET_KEY=seu_client_secret_aqui
SHEIN_REDIRECT_URI=https://seu-dominio.com/api/shein/auth/callback
```

## Configuração do Banco de Dados

Execute o script para criar a tabela de tokens:

```bash
node src/db/createTable.js
```

Isso criará a tabela `shein_tokens` para armazenar os tokens de acesso.

## Rotas Disponíveis

### 1. Iniciar Autenticação
```
GET /api/shein/auth
```
Esta rota redireciona o usuário para a página de autorização da SHEIN.

### 2. Callback de Autenticação
```
GET /api/shein/auth/callback
```
Esta rota recebe o código de autorização da SHEIN e troca por um token de acesso.

### 3. Produtos da SHEIN
```
GET /api/shein/products
```
Busca lista de produtos da SHEIN com paginação e filtros.

**Parâmetros de query:**
- `page`: Número da página (padrão: 1)
- `page_size`: Itens por página (padrão: 50)
- `category_id`: ID da categoria
- `status`: Status do produto

### 4. Detalhes de Produto
```
GET /api/shein/product/:productId
```
Busca detalhes de um produto específico da SHEIN.

### 5. Pedidos da SHEIN
```
GET /api/shein/orders
```
Busca lista de pedidos da SHEIN com paginação e filtros.

**Parâmetros de query:**
- `page`: Número da página (padrão: 1)
- `page_size`: Itens por página (padrão: 50)
- `status`: Status do pedido
- `start_time`: Data de início (formato: YYYY-MM-DD HH:mm:ss)
- `end_time`: Data de fim (formato: YYYY-MM-DD HH:mm:ss)

### 6. Detalhes de Pedido
```
GET /api/shein/order/:orderId
```
Busca detalhes de um pedido específico da SHEIN.

### 7. Atualizar Status de Pedido
```
PUT /api/shein/order/:orderId/status
```
Atualiza o status de um pedido da SHEIN.

**Body da requisição:**
```json
{
  "status": "novo_status"
}
```

## Fluxo de Autenticação

1. **Início da Autenticação**: O usuário acessa `/api/shein/auth`
2. **Redirecionamento**: O sistema redireciona para a página de autorização da SHEIN
3. **Autorização**: O usuário autoriza o acesso na plataforma SHEIN
4. **Callback**: A SHEIN redireciona de volta para `/api/shein/auth/callback` com o código
5. **Troca de Token**: O sistema troca o código por um token de acesso
6. **Salvamento**: O token é salvo no banco de dados para uso futuro
7. **Resposta**: O sistema retorna os dados de autenticação

## Gerenciamento de Tokens

O sistema gerencia automaticamente os tokens da SHEIN:

- **Salvamento**: Tokens são salvos no banco de dados com data de expiração
- **Renovação**: Tokens expirados são automaticamente renovados usando o refresh token
- **Validação**: O sistema verifica se o token está válido antes de fazer requisições
- **Segurança**: Apenas tokens válidos são utilizados para requisições à API

## Exemplo de Uso

### Iniciar Autenticação
```javascript
// Redireciona para a página de autorização da SHEIN
window.location.href = '/api/shein/auth';
```

### Verificar Callback
```javascript
// O callback será processado automaticamente
// A resposta será um JSON com os dados de autenticação
{
  "success": true,
  "message": "Autenticação com SHEIN realizada com sucesso",
  "data": {
    "access_token": "token_de_acesso",
    "expires_in": 3600,
    "scope": "read write",
    "token_type": "Bearer"
  }
}
```

### Buscar Produtos
```javascript
// Buscar produtos da SHEIN
fetch('/api/shein/products?page=1&page_size=20')
  .then(response => response.json())
  .then(data => console.log(data));
```

### Buscar Pedidos
```javascript
// Buscar pedidos da SHEIN
fetch('/api/shein/orders?status=pending&start_time=2024-01-01 00:00:00')
  .then(response => response.json())
  .then(data => console.log(data));
```

### Atualizar Status de Pedido
```javascript
// Atualizar status de um pedido
fetch('/api/shein/order/12345/status', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    status: 'shipped'
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

## Configuração na SHEIN Open Platform

1. Acesse a [SHEIN Open Platform](https://open.sheincorp.com/)
2. Registre sua aplicação
3. Configure a URL de redirecionamento: `https://seu-dominio.com/api/shein/auth/callback`
4. Obtenha o Client ID e Client Secret
5. Configure as permissões necessárias para sua aplicação

## Escopos Disponíveis

- `read`: Permissão de leitura
- `write`: Permissão de escrita

## Tratamento de Erros

O sistema trata os seguintes erros:

- **Erro de autorização**: Quando o usuário cancela a autorização
- **Código ausente**: Quando o código de autorização não é fornecido
- **Token expirado**: Renovação automática de tokens
- **Erro de servidor**: Quando há problemas na comunicação com a SHEIN
- **Parâmetros inválidos**: Validação de parâmetros obrigatórios

## Estrutura do Banco de Dados

### Tabela: shein_tokens
```sql
CREATE TABLE shein_tokens (
    id SERIAL PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    scope TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Próximos Passos

1. ✅ Implementar o salvamento do token no banco de dados
2. ✅ Implementar a renovação automática de tokens
3. ✅ Implementar as chamadas para a API da SHEIN usando o token de acesso
4. Implementar o tratamento de webhooks da SHEIN (se necessário)
5. Implementar sincronização de produtos e pedidos
6. Implementar notificações de mudanças de status

## Suporte

Para dúvidas sobre a API da SHEIN, consulte a [documentação oficial](https://open.sheincorp.com/documents/system/2169474d-1d4a-41a9-b9fd-427f63f54a63). 