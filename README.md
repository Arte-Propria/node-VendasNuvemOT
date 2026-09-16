# node-VendasNuvemOT

API Node/Express da Arte Própria hospedada na Render (`https://node-vendasnuvemot.onrender.com`):
integrações com Nuvemshop, Tiny, marketplaces, Mandaê, Google/Meta Ads e o banco de pedidos.

```bash
yarn install
yarn start   # nodemon src/server.js (porta em PORT, .env)
yarn lint    # eslint src
```

## Gateway da Shopee para o 3print

### Por que existe

A Shopee mascara nome, telefone e endereço do comprador (`****`) para apps sem acesso a dados
sensíveis, e o único requisito para liberar (app BR in-house) é o **IP Address Whitelist** do app.
Ligado, toda chamada feita com o `partner_id` do app só é aceita dos IPs declarados. O backend do
3print roda em Laravel Vapor (AWS Lambda) e sai com IP dinâmico; este serviço roda na Render, cuja
saída tem IPs fixos por região. Então o 3print não chama mais a Shopee: chama este gateway, que
assina com as credenciais do app da 3print e faz a chamada.

O gateway **não guarda estado**: os tokens das lojas continuam no 3print (`3print_token`), que
manda `shop_id` + `access_token` em cada chamada e é dono do OAuth. Aqui só mora o que precisa da
`partner_key`: assinatura HMAC-SHA256 e a chamada em si.

Credenciais do app da 3print (partner 2039038) ficam em `SHOPEE_3PRINT_*` — **não** confundir com
`SHOPEE_PARTNER_ID`/`SHOPEE_PARTNER_KEY`, que são de outro app usado pelas rotas `/shopee/auth*`.

### Env (painel da Render)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SHOPEE_3PRINT_PARTNER_ID` | sim | partner_id do app da 3print (2039038) |
| `SHOPEE_3PRINT_PARTNER_KEY` | sim | partner_key do app (a chave da API, não a de push) |
| `SHOPEE_GATEWAY_KEYS` | sim | chaves aceitas em `X-Gateway-Key`, CSV. Gerar com `openssl rand -hex 32`. Duas ao mesmo tempo durante uma rotação |
| `SHOPEE_3PRINT_HOST` | não | default `https://partner.shopeemobile.com` |
| `SHOPEE_3PRINT_TIMEOUT_MS` | não | default `20000` (o 3print espera 25 s pelo gateway) |
| `WHOAMI_UPSTREAM` | não | default `https://checkip.amazonaws.com` |

### Rotas (`/gateway/shopee/...`)

Todas exigem `X-Gateway-Key: <chave>` (ou `Authorization: Bearer <chave>`), exceto `healthz`.
As operações são `POST` com JSON — o `access_token` vai no corpo, nunca na query (a Render guarda
a URL nos logs de acesso).

| Rota | Corpo | Shopee |
|---|---|---|
| `POST orders/detail` | `shop_id, access_token, order_sn_list[] (1–50), response_optional_fields?, request_order_status_pending?` | `order/get_order_detail` |
| `POST orders/list` | `shop_id, access_token, time_range_field, time_from, time_to (≤ 15 dias), page_size? (≤ 100), cursor?, order_status?, response_optional_fields?` | `order/get_order_list` |
| `POST orders/tracking-number` | `shop_id, access_token, order_sn, package_number?` | `logistics/get_tracking_number` |
| `POST items/list` | `shop_id, access_token, offset?, page_size? (≤ 100), item_status?[]` | `product/get_item_list` |
| `POST items/base-info` | `shop_id, access_token, item_id_list[] (1–50)` | `product/get_item_base_info` |
| `POST items/models` | `shop_id, access_token, item_id` | `product/get_model_list` |
| `POST token/refresh` | `shop_id, refresh_token` | `auth/access_token/get` |
| `POST token/exchange` | `shop_id, code` | `auth/token/get` |
| `POST auth/authorize-url` | `redirect` | monta a URL assinada de `shop/auth_partner` |
| `GET whoami` | — | IP de saída deste serviço (o que a Shopee vê) |
| `GET healthz` | — | `{ ok, version }`, sem auth |

### Contrato de resposta (igual para todas as operações)

| HTTP | Corpo | Quando |
|---|---|---|
| 200 | `{ ok: true, data, request_id }` | Shopee respondeu sem erro; `data` é o objeto `response` dela (ou os campos de token, nas rotas de token) |
| 401 | `{ ok: false, error: "shopee_token_rejected", shopee: { error, message } }` | HTTP 403 da Shopee ou `error_auth`/`invalid_acceess_token`. Em `orders/*` e `items/*` o 3print renova o token e repete uma vez; em `token/refresh` significa refresh token inválido (`error_shop_refresh_token`) |
| 422 | `{ ok: false, error: "shopee_error", shopee: { error, message, request_id }, shopee_status }` | erro de negócio da Shopee (`error_param`, `error_not_found`…), inclusive HTTP 200 com `error` preenchido |
| 502 | `{ ok: false, error: "shopee_unreachable", message }` | rede/timeout até a Shopee |
| 400 | `{ ok: false, error: "invalid_request", details[] }` | corpo inválido |
| 401 | `{ ok: false, error: "unauthorized" }` | chave do gateway ausente/errada |
| 503 | `{ ok: false, error: "gateway_not_configured" }` | env sem credenciais ou sem chaves |

Sem retry, sem cache. Log: uma linha `SHOPEE-GATEWAY: {op, shop_id, result, shopee_status, ms}`
por chamada — nunca token, assinatura, corpo ou query.

### Validação

```bash
GATEWAY_URL=http://localhost:8000/gateway/shopee GATEWAY_KEY=... scripts/shopee-gateway-smoke.sh
GATEWAY_URL=https://node-vendasnuvemot.onrender.com/gateway/shopee GATEWAY_KEY=... scripts/shopee-gateway-smoke.sh
```

O smoke usa um `access_token` inválido de propósito: a Shopee responder `error_auth` prova que a
assinatura, a chamada e a classificação funcionam sem precisar de token de loja.

### Runbook do whitelist

1. Render → serviço → **Connect** → aba **Outbound**: anote os IPs. `GET /gateway/shopee/whoami`
   tem que devolver um deles.
2. 3print (Vapor): `SHOPEE_GATEWAY_URL=https://node-vendasnuvemot.onrender.com/gateway/shopee`,
   `SHOPEE_GATEWAY_KEY`, `SHOPEE_WHITELISTED_IPS` (os IPs do passo 1). Deploy. Neste ponto todo o
   tráfego já sai pelo gateway com o whitelist ainda desligado.
3. Shopee Open Platform → App List → app da 3print → Go Live → **IP Address Whitelist**: os IPs do
   passo 1 → Enable → Submit.
4. O 3print roda `marketplace:shopee-egress --assert` todo dia: se a Render trocar os IPs da
   região, o comando avisa e o whitelist precisa ser atualizado.

Rotação da chave: adicione a nova em `SHOPEE_GATEWAY_KEYS` (CSV com as duas), troque
`SHOPEE_GATEWAY_KEY` no 3print, depois remova a antiga.

Rollback: desligar o whitelist na Shopee **e** voltar a release do 3print que chamava a Shopee
direto — nessa ordem; com o whitelist ligado a chamada direta é recusada.
