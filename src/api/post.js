/* eslint-disable no-unused-vars */
/* eslint-disable camelcase */

import axios from "axios"
import { config } from "../config/env.js"

export const POSTtinyES = async (endpoint, data) => {
	try {
		const pedido = {
			cliente: { nome: data.cliente.nome },
			itens: data.itens.map(({item}) => ({
				item: { 
					descricao: item.descricao,
					quantidade: item.quantidade,
					valor_unitario: item.valor_unitario,
					unidade: item.unidade
				}
			}))
		}

		const query = new URLSearchParams({
			token: config.tinyApiTokenArteIntegradaES,
			formato: "json",
			pedido: JSON.stringify(pedido)
		})

		console.log(query.toString())
		
		const url = `${config.tinyApiBaseUrl}/pedido.incluir.php?${query.toString()}`

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			}
		})
		
		const responseData = await response.json()
		console.log(responseData.retorno.registros.registro)
		return responseData

	} catch (error) {
		console.error("Erro! Não foi possível salvar o pedido na base.")
		console.error("Stacktrace:", error.stack)
		console.error("Error:", error)
		throw new Error(`Erro na requisição à API Tiny: ${error.message}`)
	}
}

export const POSTtinyABSTRACT = async (endpoint, data) => {
	try {
		const { id, id_natureza_operacao, id_nota_fiscal, ...pedido } = data
		console.log(pedido)
		
		const response = await axios.post(`${config.tinyApiBaseUrl}/${endpoint}`, {
			params: {
				token: config.tinyApiToken,
				formato: "json",
				pedido: JSON.stringify(pedido)
			},
			headers: {
				"Content-Type": "application/json"
			}
		})

		console.log(response.data)
		return response.data.retorno

	} catch (error) {
		throw new Error(`Erro na requisição à API Tiny: ${error.message}`)
	}
}

class PedidoAPI {
	constructor(token, apiUrl) {
		this.token = token
		this.apiUrl = apiUrl
		this.url = ""
	}

	async generateOrder(array = null) {
		const obj = {
			token: this.token,
			formato: "json",
			pedido: array
		}

		const query = new URLSearchParams({
			token: obj.token,
			formato: obj.formato,
			pedido: JSON.stringify(obj.pedido)
		})

		this.url = `${this.apiUrl}/pedido.incluir.php?${query.toString()}`

		const response = await fetch(this.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			}
		})

		const data = await response.json()
		return data
	}
}