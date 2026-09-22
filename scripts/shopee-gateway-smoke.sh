#!/usr/bin/env bash
# Smoke test do gateway da Shopee (3print). Sem test runner no repo: isto é a
# validação, local ou em produção.
#
#   GATEWAY_URL=http://localhost:8000/gateway/shopee GATEWAY_KEY=... scripts/shopee-gateway-smoke.sh
#   GATEWAY_URL=https://node-vendasnuvemot.onrender.com/gateway/shopee GATEWAY_KEY=... scripts/shopee-gateway-smoke.sh
#
# O que prova: auth do gateway, validação de corpo, e — com um access_token
# inválido — que a chamada ASSINADA chega à Shopee e volta classificada
# (401 shopee_token_rejected). Não precisa de token real de loja.
set -u

: "${GATEWAY_URL:?defina GATEWAY_URL}"
: "${GATEWAY_KEY:?defina GATEWAY_KEY}"
SHOP_ID="${SHOP_ID:-1746531986}"

fail=0

check() {
	local name="$1" expected_status="$2" expected_body="$3" actual_status="$4" actual_body="$5"

	if [[ "$actual_status" == "$expected_status" && "$actual_body" == *"$expected_body"* ]]; then
		echo "ok   $name"
	else
		echo "FAIL $name — esperado HTTP $expected_status contendo '$expected_body'; veio HTTP $actual_status: ${actual_body:0:200}"
		fail=1
	fi
}

call() {
	# call <método> <caminho> <corpo|-> [header extra]
	local method="$1" path="$2" body="$3" header="${4:-}"
	local tmp; tmp="$(mktemp)"
	local status

	if [[ "$body" == "-" ]]; then
		status="$(curl -s -o "$tmp" -w '%{http_code}' -X "$method" ${header:+-H "$header"} "$GATEWAY_URL$path")"
	else
		status="$(curl -s -o "$tmp" -w '%{http_code}' -X "$method" ${header:+-H "$header"} \
			-H 'Content-Type: application/json' --data "$body" "$GATEWAY_URL$path")"
	fi

	RESP_STATUS="$status"
	RESP_BODY="$(cat "$tmp")"
	rm -f "$tmp"
}

AUTH="X-Gateway-Key: $GATEWAY_KEY"

call GET /healthz -
check "healthz sem auth" 200 '"ok":true' "$RESP_STATUS" "$RESP_BODY"

call GET /whoami -
check "whoami sem chave -> 401" 401 unauthorized "$RESP_STATUS" "$RESP_BODY"

call GET /whoami - "X-Gateway-Key: chave-errada"
check "whoami chave errada -> 401" 401 unauthorized "$RESP_STATUS" "$RESP_BODY"

call GET /whoami - "$AUTH"
check "whoami com chave -> egress_ip" 200 egress_ip "$RESP_STATUS" "$RESP_BODY"
echo "     $RESP_BODY"

call POST /orders/detail '{"access_token":"x","order_sn_list":["A"]}' "$AUTH"
check "orders/detail sem shop_id -> 400" 400 invalid_request "$RESP_STATUS" "$RESP_BODY"

list51="$(python3 -c 'import json; print(json.dumps(["SN%d" % i for i in range(51)]))')"
call POST /orders/detail "{\"shop_id\":$SHOP_ID,\"access_token\":\"x\",\"order_sn_list\":$list51}" "$AUTH"
check "orders/detail com 51 itens -> 400" 400 invalid_request "$RESP_STATUS" "$RESP_BODY"

call POST /orders/detail "{\"shop_id\":$SHOP_ID,\"access_token\":\"token-invalido\",\"order_sn_list\":[\"250911ABC\"]}" "$AUTH"
check "orders/detail token inválido -> 401 shopee_token_rejected (assinatura chegou à Shopee)" 401 shopee_token_rejected "$RESP_STATUS" "$RESP_BODY"

call POST /orders/list "{\"shop_id\":$SHOP_ID,\"access_token\":\"x\",\"time_range_field\":\"update_time\",\"time_from\":1,\"time_to\":2000000}" "$AUTH"
check "orders/list janela > 15 dias -> 400" 400 "15 dias" "$RESP_STATUS" "$RESP_BODY"

call POST /items/models "{\"shop_id\":$SHOP_ID,\"access_token\":\"token-invalido\",\"item_id\":123}" "$AUTH"
check "items/models token inválido -> 401" 401 shopee_token_rejected "$RESP_STATUS" "$RESP_BODY"

# A Shopee responde 403 error_shop_refresh_token para refresh inválido: vira
# shopee_token_rejected, e o 3print trata como "renovação falhou" (sem loop).
call POST /token/refresh "{\"shop_id\":$SHOP_ID,\"refresh_token\":\"refresh-invalido\"}" "$AUTH"
check "token/refresh inválido -> 401 shopee_token_rejected (error_shop_refresh_token)" 401 error_shop_refresh_token "$RESP_STATUS" "$RESP_BODY"

call POST /orders/list "{\"shop_id\":$SHOP_ID,\"access_token\":\"token-invalido\",\"time_range_field\":\"update_time\",\"time_from\":1700000000,\"time_to\":1700000100}" "$AUTH"
check "orders/list token inválido -> 401" 401 shopee_token_rejected "$RESP_STATUS" "$RESP_BODY"

call POST /auth/authorize-url '{"redirect":"https://3print-srv-01.com.br/api/marketplace/shopee/callback"}' "$AUTH"
check "auth/authorize-url -> url assinada" 200 auth_partner "$RESP_STATUS" "$RESP_BODY"

call DELETE /orders/detail - "$AUTH"
check "método não exposto -> 404" 404 "" "$RESP_STATUS" "$RESP_BODY"

if [[ $fail -eq 0 ]]; then
	echo "SMOKE OK"
else
	echo "SMOKE FALHOU"
	exit 1
fi
