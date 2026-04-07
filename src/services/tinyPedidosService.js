import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

const token = process.env.TINY_API_TOKEN_ABSTRACT
const baseUrl = process.env.TINY_API_URL

const RETRY_DELAY_MS = 30000
const MAX_CONCURRENCY = 15
const LIST_BATCH_SIZE = 10
const MAX_PAGES_SAFETY = 500

// Mapeamento de nomes de lojas
const storeMapping = {
	outlet: "OUTLETDOSQUADROS",
	artepropria: "ARTEPROPRIA"
	// -- Adicione outros mapeamentos conforme necessário --
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getStoreNameOrThrow = (store) => {
	const storeName = storeMapping[String(store || "").toLowerCase()]
	if (!storeName) {
		throw new Error(`Nome de loja inválido: ${store}. Opções válidas: ${Object.keys(storeMapping).join(", ")}`)
	}
	return storeName
}

const simplifyTinyOrder = (order) => {
	if (!order || order.error) return null

	const produtos = Array.isArray(order.itens)
		? order.itens
			.map((item) => item?.item?.codigo)
			.filter(Boolean)
			.map((sku) => ({ sku }))
		: []

	return {
		id: order.id,
		"created_at": order.data_pedido,
		pedido: order.numero_ecommerce || order.numero || "N/A",
		produtos
	}
}

const pesquisarPedidosComRetry = async ({ retryLabel, baseParams, attemptParams }) => {
	// Regra solicitada: se der erro, aguarda 30s e tenta novamente até conseguir.
	// Usamos uma condição controlada por variável para evitar warnings de lint de "constant condition".
	let retryForever = true
	while (retryForever) {
		try {
			const resp = await axios.get(`${baseUrl}/pedidos.pesquisa.php`, {
				params: { ...baseParams, ...attemptParams }
			})

			const retorno = resp?.data?.retorno
			if (!retorno) return null

			if (retorno.status === "Erro") {
				const msg = retorno.erros?.[0]?.erro || "Erro desconhecido"
				console.error(`[Tiny] erro na pesquisa (${retryLabel}): ${msg}. Tentando novamente em 30s...`)
				await sleep(RETRY_DELAY_MS)
				continue
			}

			return retorno
		} catch (err) {
			console.error(`[Tiny] falha na pesquisa (${retryLabel}). Tentando novamente em 30s...`, err.message)
			await sleep(RETRY_DELAY_MS)
		}
	}
}

const obterPedidoComRetry = async (orderId, retryLabel) => {
	let retryForever = true
	while (retryForever) {
		try {
			const params = {
				token,
				formato: "json",
				id: orderId
			}

			const response = await axios.get(`${baseUrl}/pedido.obter.php`, {
				params,
				headers: { "Content-Type": "application/json" }
			})

			const { retorno } = response.data || {}
			if (!retorno) return null

			if (retorno.status === "Erro") {
				const msg = retorno.erros?.[0]?.erro || "Erro desconhecido"
				console.error(`[Tiny] erro em pedido.obter (${retryLabel}): ${msg}. Tentando novamente em 30s...`)
				await sleep(RETRY_DELAY_MS)
				continue
			}

			return retorno.pedido || null
		} catch (err) {
			console.error(`[Tiny] falha em pedido.obter (${retryLabel}). Tentando novamente em 30s...`, err.message)
			await sleep(RETRY_DELAY_MS)
		}
	}
}

const toTinyDate = (dateObj) => {
	const day = String(dateObj.getDate()).padStart(2, "0")
	const month = String(dateObj.getMonth() + 1).padStart(2, "0")
	const year = dateObj.getFullYear()
	return `${day}/${month}/${year}`
}

export const fetchTinyOrdersListByDate = async (createdAtMin, createdAtMax) => {
	// TRATAMENTO DE DATAS (mesma lógica já usada no projeto)
	let startDate = new Date(createdAtMin)

	let endDate = new Date(createdAtMax)
	endDate.setDate(endDate.getDate() + 1)

	const listParams = {
		token,
		formato: "json",
		dataInicial: toTinyDate(startDate),
		dataFinal: toTinyDate(endDate)
	}

	const pedidos = []
	let page = 1
	let totalPages = null

	while (page <= MAX_PAGES_SAFETY) {
		const retorno = await pesquisarPedidosComRetry({
			retryLabel: `dataInicial=${listParams.dataInicial} dataFinal=${listParams.dataFinal} pagina=${page}`,
			baseParams: { token, formato: "json" },
			attemptParams: { dataInicial: listParams.dataInicial, dataFinal: listParams.dataFinal, pagina: page }
		})
		if (!retorno) break

		if (totalPages == null && retorno.numero_paginas != null) {
			const parsed = Number(retorno.numero_paginas)
			totalPages = Number.isFinite(parsed) ? parsed : null
		}

		const pagePedidos = Array.isArray(retorno.pedidos) ? retorno.pedidos : []
		for (const p of pagePedidos) {
			const pedido = p?.pedido
			if (!pedido) continue
			pedidos.push({
				id: pedido?.id,
				"numero_ecommerce": pedido?.numero_ecommerce,
				numero: pedido?.numero
			})
		}

		if (totalPages != null && page >= totalPages) break
		if (totalPages == null && pagePedidos.length === 0) break
		page += 1
	}

	if (page > MAX_PAGES_SAFETY) {
		throw new Error(`Tiny API Error: paginação excedeu ${MAX_PAGES_SAFETY} páginas (safety)`)
	}

	return pedidos
}

export const fetchTinyOrdersByIdsWithDetails = async (orderIds, { concurrency = 5 } = {}) => {
	const uniqueIds = Array.from(new Set((orderIds || []).filter((id) => id != null)))
	if (uniqueIds.length === 0) return []

	const results = []
	let idx = 0

	const worker = async () => {
		while (idx < uniqueIds.length) {
			const currentId = uniqueIds[idx]
			idx += 1

			const order = await obterPedidoComRetry(currentId, `id=${currentId}`)
			const simplified = simplifyTinyOrder(order)
			if (simplified) results.push(simplified)
		}
	}

	const poolSize = Math.max(1, Math.min(Number(concurrency) || 1, MAX_CONCURRENCY))
	await Promise.all(Array.from({ length: poolSize }, () => worker()))

	return results
}

// Função principal para buscar todos os pedidos com detalhes
export const fetchTinyOrdersWithDetails = async (store, createdAtMin, createdAtMax) => {
	try { 
		// Verificar se a store existe no mapeamento
		const storeName = getStoreNameOrThrow(store)

		// TRATAMENTO DE DATAS (conforme solicitado)
		let startDate = new Date(createdAtMin)
		startDate.setDate(startDate.getDate() - 1) // Subtrai um dia
		startDate.setHours(startDate.getHours() - 3) // Ajuste para UTC-3
    
		let endDate = new Date(createdAtMax)
		endDate.setDate(endDate.getDate() + 1) // Adiciona um dia
		endDate.setHours(endDate.getHours() - 3) // Ajuste para UTC-3
    
		// Busca lista de pedidos  
		const listParams = {  
			token,
			formato: "json",  
			dataInicial: toTinyDate(startDate),  
			dataFinal: toTinyDate(endDate)  
		}

		// Busca lista de pedidos com paginação (Tiny pode retornar várias páginas)
		const orderIds = []
		let page = 1
		let totalPages = null

		while (page <= MAX_PAGES_SAFETY) {
			const retorno = await pesquisarPedidosComRetry({
				retryLabel: `dataInicial=${listParams.dataInicial} dataFinal=${listParams.dataFinal} pagina=${page}`,
				baseParams: { token, formato: "json" },
				attemptParams: { dataInicial: listParams.dataInicial, dataFinal: listParams.dataFinal, pagina: page }
			})
			if (!retorno) break

			// Alguns retornos trazem controle de páginas
			if (totalPages == null && retorno.numero_paginas != null) {
				const parsed = Number(retorno.numero_paginas)
				totalPages = Number.isFinite(parsed) ? parsed : null
			}

			const pedidos = Array.isArray(retorno.pedidos) ? retorno.pedidos : []
			for (const p of pedidos) {
				const id = p?.pedido?.id
				if (id != null) orderIds.push(id)
			}

			// Critérios de parada: última página conhecida ou página sem itens
			if (totalPages != null && page >= totalPages) break
			if (totalPages == null && pedidos.length === 0) break

			page += 1
		}

		if (page > MAX_PAGES_SAFETY) {
			throw new Error(`Tiny API Error: paginação excedeu ${MAX_PAGES_SAFETY} páginas (safety)`)
		}
    
		// Divide os IDs em lotes de 10
		const batches = []
    
		for (let i = 0; i < orderIds.length; i += LIST_BATCH_SIZE) {
			batches.push(orderIds.slice(i, i + LIST_BATCH_SIZE))
		}

		let allOrders = []
    
		// Processa cada lote com intervalo de 10 segundos
		for (let i = 0; i < batches.length; i++) {
			console.log(`Processando lote ${i + 1}/${batches.length}...`)
      
			// Processa os 10 pedidos do lote em paralelo
			const batchResults = await Promise.all(batches[i].map((id) => obterPedidoComRetry(id, `id=${id}`)))
      
			allOrders = [...allOrders, ...batchResults]
      
			// Aguarda 10 segundos se não for o último lote
			if (i < batches.length - 1) {
				console.log("Aguardando 10 segundos antes do próximo lote...")
				// await sleep(11000) // 11 segundos
			}
		}

		// Filtrar pedidos pelo nome do e-commerce
		const filteredOrders = allOrders.filter((order) => {
			// Verificar se o pedido tem informações de e-commerce
			if (!order.ecommerce || !order.ecommerce.nomeEcommerce) {
				return false
			}
			// Comparação case-insensitive
			return order.ecommerce.nomeEcommerce.toLowerCase() === storeName.toLowerCase()
		})

		// Simplificar a resposta dos pedidos
		const simplifiedOrders = filteredOrders
			.map(simplifyTinyOrder)
			.filter(Boolean)

		return simplifiedOrders

	} catch (error) {
		console.error("Erro ao buscar pedidos no Tiny:", error.message)
		throw error
	}
}

const searchTinyOrderIdByNumeroEcommerce = async (numeroEcommerce) => {
	const baseParams = {
		token,
		formato: "json"
	}

	const retorno = await pesquisarPedidosComRetry({
		retryLabel: `numeroEcommerce=${numeroEcommerce}`,
		baseParams,
		attemptParams: { numeroEcommerce: String(numeroEcommerce).trim() }
	})
	if (!retorno) return null

	const pedidos = Array.isArray(retorno.pedidos) ? retorno.pedidos : []
	const id = pedidos?.[0]?.pedido?.id
	if (id != null) return id

	return null
}

export const fetchTinyOrderByNumeroEcommerce = async (store, numeroEcommerce) => {
	if (numeroEcommerce == null || String(numeroEcommerce).trim() === "") return null

	const storeName = getStoreNameOrThrow(store)
	const orderId = await searchTinyOrderIdByNumeroEcommerce(numeroEcommerce)
	if (!orderId) return null

	const order = await obterPedidoComRetry(orderId, `id=${orderId} numeroEcommerce=${numeroEcommerce}`)
	if (!order || order.error) return null

	// Garantia extra: confere se o pedido realmente pertence ao e-commerce da store
	const nomeEcommerce = order?.ecommerce?.nomeEcommerce
	if (!nomeEcommerce || String(nomeEcommerce).toLowerCase() !== String(storeName).toLowerCase()) {
		return null
	}

	return simplifyTinyOrder(order)
}

export const fetchTinyOrdersByNumeroEcommerce = async (store, numerosEcommerce, { concurrency = 5 } = {}) => {
	const unique = Array.from(new Set((numerosEcommerce || []).map((n) => String(n).trim()).filter(Boolean)))

	if (unique.length === 0) return []

	const results = []
	const cache = new Map()
	let idx = 0

	const worker = async () => {
		while (idx < unique.length) {
			const current = unique[idx]
			idx += 1

			if (cache.has(current)) continue

			try {
				const order = await fetchTinyOrderByNumeroEcommerce(store, current)
				cache.set(current, order || null)
			} catch (err) {
				cache.set(current, null)
				console.error(`[Tiny] erro buscando numeroEcommerce=${current}:`, err.message)
			}
		}
	}

	const poolSize = Math.max(1, Math.min(Number(concurrency) || 1, MAX_CONCURRENCY))
	await Promise.all(Array.from({ length: poolSize }, () => worker()))

	for (const n of unique) {
		const o = cache.get(n)
		if (o) results.push(o)
	}

	return results
}
