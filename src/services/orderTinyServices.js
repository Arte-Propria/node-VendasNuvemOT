import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

const token = process.env.TINY_API_TOKEN_ARTEINTEGRADAES
const tokenAbstract = process.env.TINY_API_TOKEN_ABSTRACT
const baseUrl = process.env.TINY_API_URL

async function fetchWithRetry(url, params, maxAttempts = 2) {
	let attempts = 0
	let lastError

	while (attempts < maxAttempts) {
		try {
			const response = await axios.get(url, {
				headers: { "Content-Type": "application/json" },
				params
			})
			if (response.data.retorno.status === "OK") {
				return response.data.retorno
			}
		} catch (error) {
			lastError = error
		}

		attempts++
		params.token = params.token === token ? tokenAbstract : token // Alterna o token
	}

	throw lastError || new Error("Erro desconhecido durante a requisição")
}

export async function fetchOrderTiny(id, cpf) {
	const searchParams = {
		token,
		formato: "json",
		cpf_cnpj: cpf,
		numeroEcommerce: id
	}

	const searchResponse = await fetchWithRetry(`${baseUrl}/pedidos.pesquisa.php`, searchParams)

	if (searchResponse.pedidos && searchResponse.pedidos.length > 0) {
		const idTiny = searchResponse.pedidos[0].pedido.id

		const orderParams = {
			token,
			formato: "json",
			id: idTiny
		}

		const orderResponse = await fetchWithRetry(`${baseUrl}/pedido.obter.php`, orderParams)
		return orderResponse.pedido
	}

	throw new Error("Pedido não encontrado")
}

export async function fetchNoteOrderTiny(id, cpf) {
	const searchParams = {
		token,
		formato: "json",
		cpf_cnpj: cpf,
		numeroEcommerce: id
	}

	const noteResponse = await fetchWithRetry(`${baseUrl}/notas.fiscais.pesquisa.php`, searchParams)

	if (noteResponse.notas_fiscais && noteResponse.notas_fiscais.length > 0) {
		return noteResponse.notas_fiscais[0].nota_fiscal
	}

	throw new Error("Nota fiscal não encontrada no Tiny")
}

export async function fetchLinkNote(id) {
	const params = {
		token,
		formato: "json",
		id
	}

	const linkResponse = await fetchWithRetry(`${baseUrl}/nota.fiscal.obter.link.php`, params)

	if (linkResponse.link_nfe) {
		return linkResponse.link_nfe
	}

	throw new Error("Link da nota fiscal não encontrado no Tiny")
}
