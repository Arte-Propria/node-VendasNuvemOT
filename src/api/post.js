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