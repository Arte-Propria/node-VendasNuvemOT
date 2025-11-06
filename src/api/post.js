/* eslint-disable no-unused-vars */
/* eslint-disable camelcase */

import axios from "axios"
import { config } from "../config/env.js"
import { logEcommerce, logGaleria9, logPCP } from "../utils/logger.js"

export const POSTtinyES = async (endpoint, data) => {
	const {
		id,
		numero,
		numero_ecommerce,
		cliente,
		ecommerce,
		id_nota_fiscal,
		...dataPedido
	} = data
	const { codigo, ...dataCliente } = cliente
	try {
		const pedido = {
			cliente: { ...dataCliente },
			itens: data.itens.map(({ item }) => ({
				item: {
					descricao: item.descricao,
					quantidade: item.quantidade,
					valor_unitario: item.valor_unitario,
					unidade: item.unidade
				}
			})),
			situacao: data.situacao,
			obs: `Numero da Nota Fiscal: ${data.id_nota_fiscal}`,
			numero_pedido_ecommerce: data.ecommerce.numeroPedidoEcommerce,
			ecommerce: data.ecommerce.nomeEcommerce,
			...dataPedido
		}

		const payload = new URLSearchParams({
			pedido: JSON.stringify({ pedido })
		})

		const url = `${config.tinyApiBaseUrl}/pedido.incluir.php?token=${config.tinyApiTokenArteIntegradaES}&formato=json`

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: payload.toString()
		})

		const responseData = await response.json()
		return responseData
	} catch (error) {
		console.error("Erro! Não foi possível salvar o pedido na base.")
		console.error("Stacktrace:", error.stack)
		console.error("Error:", error)
		throw new Error(`Erro na requisição à API Tiny: ${error.message}`)
	}
}

export const POSTtinyABSTRACT = async (endpoint, data) => {
	const {
		id,
		numero,
		numero_ecommerce,
		cliente,
		ecommerce,
		situacao,
		obs,
		id_nota_fiscal,
		marcadores,
		id_natureza_operacao,
		nota_fiscal,
		...dataPedido
	} = data

	const ecommerceName = ecommerce?.nomeEcommerce || "Nuvemshop"

	const marcadoresINTEGRADAES = [
		{
			marcador: {
				descricao: "INTEGRADAES"
			}
		},
		{
			marcador: {
				descricao: ecommerceName
			}
		}
	]

	const observacao = `Remessa de mercadoria por conta e ordem de ARTE INTEGRADA COMERCIO DE ARTE LTDA, CNPJ nº 23.735.360/0003-07 e IE 84249188, conforme nota fiscal de venda nº ${nota_fiscal}. Endereço de cobrança: ${data.cliente.endereco}, ${data.cliente.numero} - ${data.cliente.bairro}, CEP ${data.cliente.cep},  ${data.cliente.cidade}/${data.cliente.uf}`

	const { codigo, ...dataCliente } = cliente

	try {
		const pedido = {
			cliente: { ...dataCliente },
			itens: data.itens.map(({ item }) => ({
				item: {
					descricao: item.descricao,
					quantidade: item.quantidade,
					valor_unitario: item.valor_unitario,
					unidade: item.unidade
				}
			})),
			situacao: "aberto",
			obs: observacao,
			numero_pedido_ecommerce:
        data.numero_ecommerce || data.numero_ordem_compra,
			ecommerce: ecommerceName,
			marcadores: marcadoresINTEGRADAES,
			id_natureza_operacao: "798952072",
			nome_natureza_operacao: "REMESSSA POR ORDEM DE TERCEIROS",
			...dataPedido
		}

		logEcommerce(`Salvando pedido no TINY Abstract. Cliente: ${dataCliente.nome}, Pedido IntegradaES: ${id}`)

		const payload = new URLSearchParams({
			pedido: JSON.stringify({ pedido })
		})

		const url = `${config.tinyApiBaseUrl}/pedido.incluir.php?token=${config.tinyApiToken}&formato=json`

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: payload.toString()
		})

		const responseData = await response.json()
		return responseData
	} catch (error) {
		console.error("Erro! Não foi possível salvar o pedido na base.")
		console.error("Stacktrace:", error.stack)
		console.error("Error:", error)
		throw new Error(`Erro na requisição à API Tiny: ${error.message}`)
	}
}

export const POSTwebhook = async (webhookUrls, body) => {
	try {
		await Promise.all(webhookUrls.map(async ({ url, name }) => {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify(body)
			})

			if (!response.ok) {
				logPCP(`Erro ao enviar webhook para ${name}. Pedido: ${body.dados.id}`)
				throw new Error(`Falha no webhook ${name}`)
			}

			logPCP(`Webhook enviado com sucesso para ${name}. Pedido: ${body.dados.id}`)
		}))
	} catch (error) {
		logPCP(`Erro ao processar webhooks. Pedido: ${body.dados.id}`)
		throw error
	}
}

export const POSTgaleria9 = async (body) => {
	const url = "https://primary-production-ca0e.up.railway.app/webhook/tiny-g9"
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify(body)
		})

		const responseData = await response.json()
		return responseData
	} catch (error) {
		logGaleria9(`Erro ao enviar webhook para Galeria9. Pedido: ${body.pedido.id}, Erro: ${error.message}`)
		throw error
	}
}
