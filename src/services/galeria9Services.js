import axios from "axios"
import { google } from "googleapis"
import dotenv from "dotenv"
import { logGaleria9 } from "../utils/logger.js"

dotenv.config()

// Your deployed Google Apps Script Web App URL
const WEBHOOK_URL = process.env.WEBHOOK_TESTE_URL

// The payload structure expected by your doPost(e) function
const testPayload = {
	"retorno": {
		"pedido": {
			"id": "901339345",
			"numero": "64545",
			"numero_ecommerce": "300045160",
			"data_pedido": "11/09/2025",
			"data_prevista": "23/09/2025",
			"data_faturamento": "16/09/2025",
			"data_envio": "18/09/2025",
			"data_entrega": "",
			"id_lista_preco": "0",
			"descricao_lista_preco": "Padr\u00e3o",
			"cliente": {
				"nome": "Gabriela Lucio Fonseca",
				"codigo": "",
				"nome_fantasia": "",
				"tipo_pessoa": "F",
				"cpf_cnpj": "119.011.547-69",
				"ie": "",
				"rg": "",
				"endereco": "Rua Jornalista Luiz Eduardo Lobo",
				"numero": "437",
				"complemento": "C3 Q1 Interfone 103 Cond. Coqueiro",
				"bairro": "Recreio dos Bandeirantes",
				"cidade": "Rio de Janeiro",
				"uf": "RJ",
				"fone": "(21) 99611-4819",
				"email": "",
				"cep": "22783-410"
			},
			"itens": [
				{
					"item": {
						"id_produto": "901339333",
						"codigo": "G9|10333-1-000+391-1-1-0-1-70x98-1",
						"descricao": "G9|10333 QUADRO MOLDURA CAIXA PRETA SIMPLES DURATEX 2,5mm PAPEL COUCH\u00ca VIDRO 2mm 70x98",
						"unidade": "UN",
						"quantidade": "1.0000",
						"valor_unitario": "1127.00000000"
					}
				},
				{
					"item": {
						"id_produto": "901339337",
						"codigo": "G9|94375-1-000+377-1-3-0-0-60x85-1",
						"descricao": "G9|94375 QUADRO MOLDURA FILETE PRETA PERFIL 2818CH DURATEX 2,5mm ADESIVO BRANCO 60x85",
						"unidade": "UN",
						"quantidade": "1.0000",
						"valor_unitario": "657.00000000"
					}
				},
				{
					"item": {
						"id_produto": "901339341",
						"codigo": "G9|94374-1-000+377-1-3-0-0-60x85-1",
						"descricao": "G9|94374 QUADRO MOLDURA FILETE PRETA PERFIL 2818CH DURATEX 2,5mm ADESIVO BRANCO 60x85",
						"unidade": "UN",
						"quantidade": "1.0000",
						"valor_unitario": "657.00000000"
					}
				},
				{
					"item": {
						"id_produto": "815823954",
						"codigo": "CL-1",
						"descricao": "CAIXA LIVRO GALERIA9",
						"unidade": "UN",
						"quantidade": "1.0000",
						"valor_unitario": "0.00000000"
					}
				},
				{
					"item": {
						"id_produto": "815605402",
						"codigo": "C-G9",
						"descricao": "Certificado Galeria9",
						"unidade": "UN",
						"quantidade": "3.0000",
						"valor_unitario": "0.00000000"
					}
				},
				{
					"item": {
						"id_produto": "892150130",
						"codigo": "FL-G9",
						"descricao": "Flyer Galeria 9",
						"unidade": "Un",
						"quantidade": "1.0000",
						"valor_unitario": "0.00000000"
					}
				}
			],
			"parcelas": [],
			"marcadores": [
				{
					"marcador": {
						"id": "174986",
						"descricao": "trianguladogaleria9",
						"cor": "#000000"
					}
				},
				{
					"marcador": {
						"id": "182372",
						"descricao": "dropgaleria9",
						"cor": "#808080"
					}
				},
				{
					"marcador": {
						"id": "182373",
						"descricao": "g9lote7h",
						"cor": "#808080"
					}
				},
				{
					"marcador": {
						"id": "176127",
						"descricao": "normal",
						"cor": "#808080"
					}
				},
				{
					"marcador": {
						"id": "183531",
						"descricao": "ENCOMENDA LOJA 02-CASASHOP-RJ",
						"cor": "#808080"
					}
				},
				{
					"marcador": {
						"id": "182354",
						"descricao": "1\u00aa venda",
						"cor": "#808080"
					}
				},
				{
					"marcador": {
						"id": "183622",
						"descricao": "OP Gerada",
						"cor": "#808080"
					}
				},
				{
					"marcador": {
						"id": "184051",
						"descricao": "3PRINT - LOTE 4478",
						"cor": "#808080"
					}
				},
				{
					"marcador": {
						"id": "183913",
						"descricao": "atrasado",
						"cor": "#808080"
					}
				}
			],
			"condicao_pagamento": "",
			"forma_pagamento": "multiplas",
			"meio_pagamento": null,
			"nome_transportador": "Manda\u00ea",
			"frete_por_conta": "T",
			"valor_frete": "0.00000000",
			"valor_desconto": 366.15,
			"outras_despesas": "0.00",
			"total_produtos": "2441.00000000",
			"total_pedido": "2074.85000000",
			"numero_ordem_compra": "300045160",
			"deposito": "DEP\u00d3SITO MARKETPLACE",
			"ecommerce": {
				"id": "0",
				"numeroPedidoEcommerce": "300045160",
				"numeroPedidoCanalVenda": ""
			},
			"forma_envio": "MANDAE",
			"forma_frete": "Econ\u00f4mico",
			"situacao": "N\u00e3o entregue",
			"obs": " Remessa de mercadoria por conta e ordem de Galeria9 Com\u00e9rcio de Arte Ltda, CNPJ n\u00ba 32.470.399/0001-60 e IE 45272430069, conforme nota fiscal de venda n\u00ba 00029680. Endere\u00e7o de cobran\u00e7a: Avenida Genaro de Carvalho, 2950 / cond. Key West - apto 203 - Recreio dos Bandeirantes, CEP 22795078, Rio de Janeiro / RJ. Origem: ENCOMENDA LOJA 02-CASASHOP-RJ, Status: normal.",
			"obs_interna": "",
			"id_vendedor": "0",
			"codigo_rastreamento": "ATSRB901473089",
			"url_rastreamento": "https://rastreae.com.br/ATSRB901473089",
			"id_nota_fiscal": "901473089",
			"pagamentos_integrados": [],
			"id_natureza_operacao": "798952072"
		}
	}
}


export async function atualizarPlanilhaGaleria9(pedidoDados) {
	// 1. Monta o payload no formato exato que a sua função doPost espera
	const payload = {
		retorno: {
			pedido: {
				id: pedidoDados.id,
				situacao: pedidoDados.situacao,
				codigo_rastreamento: pedidoDados.codigo_rastreamento || null,
				url_rastreamento: pedidoDados.url_rastreamento || null
			}
		}
	}

	//logGaleria9(`[TinyWebhookService] Enviando atualização para pedido ID: ${pedidoDados.id}`);
	//logGaleria9(`[TinyWebhookService] Endpoint: ${WEBHOOK_URL}`);
	//logGaleria9(`[TinyWebhookService] Payload: ${payload}`);

	try {
		// 3. Faz a requisição HTTP POST
		const resposta = await axios.post(WEBHOOK_URL, payload, {
			headers: {
				"Content-Type": "application/json"
			}
		})

		logGaleria9(`Enviado pedido ${pedidoDados.id} para a planilha/apps script`)
		return {
			success: true,
			statusCode: resposta.status,
			data: resposta.data,
			message: "Webhook processado com sucesso."
		}

	} catch (erro) {
		// 4. Tratamento robusto de erros
		console.error(`[TinyWebhookService] Erro na requisição para o pedido ${pedidoDados.id}:`, erro.message)

		let erroFormatado = {
			success: false,
			message: "Falha ao comunicar com o webhook.",
			pedidoId: pedidoDados.id
		}

		if (erro.response) {
			// O servidor respondeu com um status de erro (4xx, 5xx)
			erroFormatado.statusCode = erro.response.status
			erroFormatado.data = erro.response.data
			erroFormatado.message = `Servidor retornou erro: ${erro.response.status}`
		} else if (erro.request) {
			// A requisição foi feita mas não houve resposta
			erroFormatado.message = "Sem resposta do servidor (timeout ou rede)."
		} else {
			// Erro ao configurar a requisição
			erroFormatado.message = `Erro na configuração: ${erro.message}`
		}

		throw erroFormatado // Propaga o erro para o controller tratar
	}
}

