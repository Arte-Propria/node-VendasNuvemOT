/* eslint-disable no-unused-vars */
/* eslint-disable camelcase */

import axios from "axios"
import { config } from "../config/env.js"
import { logEcommerce } from "../utils/logger.js"

export const POSTtinyES = async (endpoint, data) => {
	const { id, numero, numero_ecommerce, cliente, ecommerce, id_nota_fiscal, ...dataPedido } = data
	const { codigo, ...dataCliente } = cliente
	try {
		const pedido = {
			cliente: { ...dataCliente	},
			itens: data.itens.map(({item}) => ({
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
	const { id, numero, numero_ecommerce, cliente, ecommerce, obs, id_nota_fiscal, ...dataPedido } = data
	const { codigo, ...dataCliente } = cliente
	try {
		const pedido = {
			cliente: { ...dataCliente },
			itens: data.itens.map(({item}) => ({
				item: { 
					descricao: item.descricao,
					quantidade: item.quantidade,
					valor_unitario: item.valor_unitario,
					unidade: item.unidade
				}
			})),
			situacao: data.situacao,
			obs: `Numero da Nota Fiscal: ${data.id_nota_fiscal}`,
			numero_pedido_ecommerce: "17036",
			ecommerce: "Nuvemshop",
			...dataPedido
		}

		logEcommerce("Salvando pedido na conta Abstract. Pedido", pedido)

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