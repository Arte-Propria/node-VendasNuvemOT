import axios from "axios"
import { config } from "../config/env.js"
import { logEcommerce } from "../utils/logger.js"

export const PUTtinyES = async (data) => {
	const urlSituacao = `${config.tinyApiBaseUrl}/pedido.alterar.situacao?token=${config.tinyApiTokenArteIntegradaES}&formato=json`

	const urlRastreamento = `${config.tinyApiBaseUrl}/cadastrar.codigo.rastreamento.pedido.php?token=${config.tinyApiTokenArteIntegradaES}&formato=json`

	// Verifica se o pedido tem código de rastreamento
	const codigoRastreamento = data.codigoRastreamento && data.codigoRastreamento !== ""

	logEcommerce("Atualizando situação do pedido no Tiny Integrada ES", data)
	const payloadSituacao = new URLSearchParams({
		id: data.id,
		situacao: data.situacao
	})

	const responseSituacao = await fetch(urlSituacao, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded"
		},
		body: payloadSituacao.toString()
	})
	const responseData = await responseSituacao.json()

	if(codigoRastreamento && data.situacao !== "Entregue") {
		logEcommerce("Atualizando código de rastreamento do pedido no Tiny Integrada ES", data)

		const payloadRastreamento = new URLSearchParams({
			id: data.id,
			codigoRastreamento: data.codigoRastreamento,
			urlRastreamento: data.urlRastreamento
		})

		const responseRastreamento = await fetch(urlRastreamento, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: payloadRastreamento.toString()
		})

		const responseDataRastreamento = await responseRastreamento.json()

		return {
			responseData,
			responseDataRastreamento
		}
	}

	return {
		responseData
	}
}

export const PUTtinyABSTRACT = async (data) => {
	const url = `${config.tinyApiBaseUrl}/pedido.alterar.php?token=${config.tinyApiToken}&formato=json`

	const payload = new URLSearchParams({
		pedido: JSON.stringify(data)
	})

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded"
		},
		body: payload.toString()
	})

	return response.json()
}

