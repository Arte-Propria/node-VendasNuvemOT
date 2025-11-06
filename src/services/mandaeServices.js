/* eslint-disable camelcase */
import axios from "axios"
import dotenv from "dotenv"
import { query } from "../db/db.js"
import { logEcommerce, logMandae } from "../utils/logger.js"

dotenv.config()

export async function queryMandae() {
	try {
		const response = await query("SELECT * FROM info_mandae")
		return response
	} catch (error) {
		console.error("Error fetching Deliveries data from Mandae", error.message)
		return []
	}
}

// 1. Função para realizar o fetch
export const fetchTestRequest = async () => {
	let allDeliveries = []

	try {
		const response = await queryMandae()

		const result = response.rows.map((delivery) => ({
			id: delivery.id_ped,
			order_id: delivery.cod_ped,
			store: delivery.empresa,
			name_client: delivery.nome_cli,
			lastDate: delivery.dt_pag,
			rastreio: delivery.cod_rastreio,
			linkRastreio: delivery.detalhes_rastreio,
			total: delivery.valor,
			status: delivery.situacao,
			statusEntrega: delivery.status_mandae
		}))
		allDeliveries = allDeliveries.concat(result)

		return allDeliveries || []
	} catch (error) {
		console.error("Error fetching Deliveries data from Mandae", error.message)
		return []
	}
}

// Função para filtrar os dados formatados por data
export const filterMandaeData = (data, { store, startDate, endDate }) => {
	try {
		// Normalizar o nome da loja para comparação case-insensitive
		const normalizedStore =
      store === "artepropria" ? "ARTE_PROPRIA" : store.toUpperCase()

		// Converter datas para objetos Date
		const start = new Date(startDate + "T00:00:00.000Z")
		const end = new Date(endDate + "T23:59:59.999Z")

		// Validar datas
		if (isNaN(start.getTime()) || isNaN(end.getTime())) {
			throw new Error("Datas inválidas")
		}

		return data.filter((item) => {
			// Verificar correspondência da loja (case-insensitive)
			if (
				normalizedStore &&
        (store === "artepropria"
        	? "ARTE_PROPRIA"
        	: item.store.toUpperCase()) !== normalizedStore
			)
				return false

			// Converter a data do item
			const itemDate = new Date(item.lastDate)

			// Verificar se está dentro do intervalo
			return itemDate >= start && itemDate <= end
		})
	} catch (error) {
		console.error("Error filtering data:", error.message)
		throw new Error("Erro ao filtrar dados")
	}
}

// Função para filtrar os dados formatados
export const filterMandaeStore = (data, { store }) => {
	try {
		// Normalizar o nome da loja para comparação case-insensitive
		const normalizedStore =
      store === "artepropria" ? "ARTE_PROPRIA" : store.toUpperCase()

		return data.filter((item) => {
			// Verificar correspondência da loja (case-insensitive)
			if (
				normalizedStore &&
        (item.store === "artepropria"
        	? "ARTE_PROPRIA"
        	: item.store.toUpperCase()) !== normalizedStore
			)
				return false

			return item
		})
	} catch (error) {
		console.error("Error filtering data:", error.message)
		throw new Error("Erro ao filtrar dados")
	}
}

// Função para atualizar a tabela info_mandae
export const updateMandaeInfo = async (order, store) => {
	try {
		// 1. Buscar o pedido na tabela info_mandae pelo id_ped
		const findOrderQuery = "SELECT * FROM info_mandae WHERE id_ped = $1"
		const orderResult = await query(findOrderQuery, [order.id])

		if (orderResult.rows.length === 0) {
			logMandae(`Pedido ${order.id} não encontrado na tabela info_mandae`)
			return
		}

		const mandaeOrder = orderResult.rows[0]

		// 2. Determinar os novos valores para os campos
		let newSituacao = mandaeOrder.situacao
		let newStatusPed = mandaeOrder.status_ped
		let newCodRastreio = mandaeOrder.cod_rastreio
		let newDetalhesRastreio = mandaeOrder.detalhes_rastreio

		// 3. Verificar se o status é 'cancelled' e atualizar a situacao
		if (order.status === "cancelled") {
			newSituacao = "CANCELLED"
		}
		// Verificar se o shipping_status é 'delivered' e atualizar a situacao
		else if (
			(order.shipping_status === "delivered" &&
        mandaeOrder.situacao === "NOK") ||
      (order.shipping_status === "delivered" && mandaeOrder.situacao === "-")
		) {
			newSituacao = "OK"
		}

		// 4. Atualizar status_ped com base no status do pedido da Nuvemshop
		if (
			order.status &&
      ["open", "closed", "cancelled"].includes(order.status)
		) {
			newStatusPed = order.status
		}

		// 5. Atualizar código de rastreio se estiver vazio ou divergente
		if (
			order.shipping_tracking_number &&
      (mandaeOrder.cod_rastreio === "None" ||
        !mandaeOrder.cod_rastreio ||
        mandaeOrder.cod_rastreio !== order.shipping_tracking_number)
		) {
			newCodRastreio = order.shipping_tracking_number
		}

		// 6. Atualizar detalhes de rastreio se estiver vazio ou divergente
		if (
			order.shipping_tracking_url &&
      (!mandaeOrder.detalhes_rastreio ||
        mandaeOrder.detalhes_rastreio !== order.shipping_tracking_url)
		) {
			newDetalhesRastreio = order.shipping_tracking_url
		}

		// 7. Atualizar a data da última modificação
		const currentDate = new Date().toISOString()

		// 8. Query de atualização com todos os campos
		const updateQuery = `
      UPDATE info_mandae 
      SET 
        situacao = $1, 
        status_ped = $2,
        cod_rastreio = $3,
        detalhes_rastreio = $4,
        dt_atualizacao = $5
      WHERE id_ped = $6
    `

		await query(updateQuery, [
			newSituacao,
			newStatusPed,
			newCodRastreio,
			newDetalhesRastreio,
			currentDate,
			order.id
		])

		logMandae(`Pedido ${order.id} atualizado na info_mandae:
      - situacao: ${newSituacao}
      - status_ped: ${newStatusPed}
      - cod_rastreio: ${newCodRastreio}
      - detalhes_rastreio: ${newDetalhesRastreio}
      - dt_atualizacao: ${currentDate}
    `)
	} catch (err) {
		console.error("Erro ao atualizar pedido na info_mandae:", err)
	}
}

// Webhook para atualizar info_mandae com dados da Mandae
export const webhookMandaeInfo = async (mandaeData) => {
	try {
		const { trackingCode, events } = mandaeData

		// 1. Buscar o pedido na tabela info_mandae
		const findOrderQuery = "SELECT * FROM info_mandae WHERE cod_rastreio = $1"
		const orderResult = await query(findOrderQuery, [trackingCode])

		if (orderResult.rows.length === 0) {
			throw new Error(`Pedido com código de rastreio ${trackingCode} não encontrado na tabela info_mandae`)
		}

		const mandaeOrder = orderResult.rows[0]
		const id_ped = mandaeOrder.id_ped // Extrair id_ped para uso nos logs

		// 2. Preparar o array de status_mandae
		let currentStatusArray = []
		let hasInvalidData = false

		try {
			// Verificar se o valor é "nan" ou outro valor inválido
			if (
				mandaeOrder.status_mandae === "nan" ||
        mandaeOrder.status_mandae === "NaN" ||
        mandaeOrder.status_mandae === "null" ||
        mandaeOrder.status_mandae === null ||
        mandaeOrder.status_mandae === undefined
			) {
				hasInvalidData = true
				currentStatusArray = []
			}
			// Tentar converter de string JSON para array
			else if (typeof mandaeOrder.status_mandae === "string") {
				try {
					currentStatusArray = JSON.parse(mandaeOrder.status_mandae)
					if (!Array.isArray(currentStatusArray)) {
						hasInvalidData = true
						currentStatusArray = []
					}
				} catch (parseError) {
					hasInvalidData = true
					currentStatusArray = []
					logMandae(`Pedido ${id_ped} com valor inválido em status_mandae: ${mandaeOrder.status_mandae}. Substituindo por array vazio.`)
				}
			}
			// Se já for array, usar diretamente
			else if (Array.isArray(mandaeOrder.status_mandae)) {
				currentStatusArray = mandaeOrder.status_mandae
			}
			// Qualquer outro caso, considerar inválido
			else {
				hasInvalidData = true
				currentStatusArray = []
			}
		} catch (err) {
			console.error(`[Pedido: ${id_ped}] Erro ao processar status_mandae:`,
				err)
			hasInvalidData = true
			currentStatusArray = []
		}

		// 3. Se havia dados inválidos, usar apenas os novos eventos
		// Caso contrário, mesclar os eventos existentes com os novos
		let finalStatusArray

		if (hasInvalidData) {
			logMandae(` Substituindo valor inválido no pedido ${id_ped} em status_mandae por novos eventos para trackingCode: ${trackingCode}`)
			finalStatusArray = [...events] // Usa apenas os novos eventos
		} else {
			// Mesclar eventos existentes com novos, evitando duplicatas
			finalStatusArray = [...currentStatusArray]

			events.forEach((newEvent) => {
				const existingEventIndex = finalStatusArray.findIndex((existingEvent) => existingEvent.id === newEvent.id)

				if (existingEventIndex === -1) {
					// Evento não existe, adicionar ao array
					finalStatusArray.push(newEvent)
				} else {
					// Evento já existe, atualizar com os novos dados
					finalStatusArray[existingEventIndex] = newEvent
				}
			})
		}

		// 4. Ordenar eventos por timestamp (do mais recente para o mais antigo)
		finalStatusArray.sort((a, b) => {
			return new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date)
		})

		// 5. Usar o evento mais recente para atualizar ultima_att
		const latestEvent = finalStatusArray[0]
		const ultima_att_mandae = new Date(latestEvent.timestamp || latestEvent.date)

		let situacao = mandaeOrder.situacao

		const today = new Date()
		const currentDate = today.toISOString()

		// Buscar por evento de entrega realizada (id: "1" e name: "Entrega realizada")
		const entregaRealizada = finalStatusArray.find((event) => event.id === "1" && event.name === "Entrega realizada")

		if (entregaRealizada) {
			// Se encontrou evento de entrega realizada, mudar situacao para OK
			situacao = "OK"
			logMandae(`Pedido ${id_ped} marcado como OK - Entrega realizada encontrada`)
		} else {
			// 5. Calcular diferença de dias para determinar a situacao

			const diffTime = Math.abs(today - ultima_att_mandae)
			const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

			if (diffDays >= 2) {
				situacao = "NOK"
			} else {
				situacao = "OK"
			}
		}

		// 6. Query de atualização
		const updateQuery = `
      UPDATE info_mandae 
      SET 
        status_mandae = $1,
        ultima_att_mandae = $2,
        situacao = $3,
        dt_atualizacao = $4
      WHERE cod_rastreio  = $5
    `

		await query(updateQuery, [
			JSON.stringify(finalStatusArray),
			ultima_att_mandae.toISOString(),
			situacao,
			currentDate,
			trackingCode
		])

		return {
			message: `Pedido ${id_ped} com código de rastreio ${trackingCode} atualizado via webhook Mandae`,
			details: {
				had_invalid_data: hasInvalidData,
				events_added: events.length,
				total_events_now: finalStatusArray.length,
				latest_event: latestEvent.name,
				ultima_att_mandae: ultima_att_mandae.toISOString(),
				dt_atualizacao: currentDate,
				situacao
			}
		}
	} catch (err) {
		//console.error('Erro no service updateMandaeInfo:', err);
		//throw err;
	}
}

// Função para processar e corrigir o parsing do status_mandae
// Função específica para parse do status_mandae
export const parseStatusMandae = (statusMandae) => {
	if (!statusMandae) return []

	try {
		console.log("Tentando parse do status_mandae:",
			typeof statusMandae,
			statusMandae)

		// Caso 1: Já é um array
		if (Array.isArray(statusMandae)) {
			return statusMandae
		}

		// Caso 2: É string
		if (typeof statusMandae === "string") {
			let jsonString = statusMandae.trim()

			// Remove espaços em branco extras
			jsonString = jsonString.trim()

			// Se a string começa com " e termina com ", remove as aspas externas
			if (jsonString.startsWith("\"") && jsonString.endsWith("\"")) {
				jsonString = jsonString.slice(1, -1)
			}

			// Agora temos uma string que deve ser um array JSON válido
			// Exemplo: [{"date":"2025-09-26 11:52",...}]

			// Tenta fazer parse diretamente
			try {
				const parsed = JSON.parse(jsonString)
				if (Array.isArray(parsed)) {
					return parsed
				} else if (typeof parsed === "object" && parsed !== null) {
					return [parsed]
				}
			} catch (directError) {
				console.log("Parse direto falhou, tentando alternativas...")

				// Tentativa alternativa: a string pode ter escapes duplos
				// Remove escapes de barras
				let cleanedString = jsonString.replace(/\\"/g, "\"")
				cleanedString = cleanedString.replace(/\\\\/g, "\\")

				try {
					const parsed = JSON.parse(cleanedString)
					if (Array.isArray(parsed)) {
						return parsed
					} else if (typeof parsed === "object" && parsed !== null) {
						return [parsed]
					}
				} catch (secondError) {
					console.log("Segunda tentativa de parse falhou:",
						secondError.message)

					// Última tentativa: se parece com array, tenta construir manualmente
					if (jsonString.startsWith("[") && jsonString.endsWith("]")) {
						try {
							// Tenta avaliar como JavaScript (cuidado - só usar em dados confiáveis)
							const evaluated = eval(`(${jsonString})`)
							if (Array.isArray(evaluated)) {
								return evaluated
							}
						} catch (evalError) {
							console.log("Avaliação também falhou:", evalError.message)
						}
					}
				}
			}
		}

		console.log("Não foi possível fazer parse do status_mandae")
		return []
	} catch (error) {
		console.error("Erro crítico no parseStatusMandae:", error)
		return []
	}
}

// Função principal para atualização em lote
// Função principal usando cod_ped como identificador
// services/mandaeServices.js

export const batchUpdateSituacaoFromMandaeEvents = async (batchSize = 100) => {
	try {
		console.log(`🚀 Iniciando atualização em lote com tamanho de lote: ${batchSize}...`)

		let totalUpdated = 0
		let totalProcessed = 0
		let offset = 0
		let hasMore = true
		let batchNumber = 1

		const updatedOrders = []
		const failedOrders = []

		while (hasMore) {
			console.log(`\n📦 PROCESSANDO LOTE ${batchNumber} (offset: ${offset}, limite: ${batchSize})`)

			// Buscar pedidos em lotes
			const batchQuery = `
        SELECT cod_ped, id_ped, cod_rastreio, status_mandae, situacao
        FROM info_mandae 
        WHERE situacao = 'NOK' 
        AND status_mandae IS NOT NULL 
        AND status_mandae != 'null' 
        AND status_mandae != 'nan'
        AND status_mandae != 'NaN'
        AND status_mandae != ''
        ORDER BY cod_ped
        LIMIT $1 OFFSET $2
      `

			const batchResult = await query(batchQuery, [batchSize, offset])

			if (batchResult.rows.length === 0) {
				console.log("✅ Não há mais pedidos para processar.")
				hasMore = false
				break
			}

			console.log(`📊 Lote ${batchNumber}: ${batchResult.rows.length} pedidos encontrados para análise`)

			let batchUpdated = 0
			let batchErrors = 0

			// Processar cada pedido do lote atual
			for (const order of batchResult.rows) {
				try {
					const { cod_ped, id_ped, cod_rastreio, status_mandae, situacao } =
            order

					console.log(`\n--- Processando pedido ${
						totalProcessed + 1
					}: cod_ped ${cod_ped} ---`)

					// Usar a função de parse
					const eventsArray = parseStatusMandae(status_mandae)

					if (eventsArray.length === 0) {
						console.log("❌ Nenhum evento válido encontrado após parse")
						failedOrders.push({
							cod_ped,
							id_ped,
							cod_rastreio,
							error: "Nenhum evento válido encontrado após parse",
							batch: batchNumber
						})
						batchErrors++
						totalProcessed++
						continue
					}

					// Verificar se existe evento de "Entrega realizada"
					const entregaRealizada = eventsArray.find((event) => {
						if (!event || typeof event !== "object") return false

						const idMatch =
              event.id === "1" || event.id === 1 || event.id === "1.0"
						const nameMatch =
              event.name === "Entrega realizada" ||
              event.name === "Pedido entregue" ||
              (event.name &&
                event.name.toLowerCase().includes("entrega realizada")) ||
              (event.name && event.name.toLowerCase().includes("entregue"))

						return idMatch && nameMatch
					})

					if (entregaRealizada) {
						console.log(`✅ ENCONTROU ENTREGA REALIZADA: ${entregaRealizada.name}`)

						// Atualizar situacao para OK
						const updateQuery = `
              UPDATE info_mandae 
              SET situacao = 'OK', 
                  dt_atualizacao = $1,
                  ultima_att_mandae = $2
              WHERE cod_ped = $3
            `

						const currentDate = new Date().toISOString()
						const updateResult = await query(updateQuery, [
							currentDate,
							currentDate,
							cod_ped
						])

						if (updateResult.rowCount > 0) {
							batchUpdated++
							totalUpdated++
							updatedOrders.push({
								cod_ped,
								id_ped,
								cod_rastreio,
								evento_entrega: entregaRealizada,
								data_atualizacao: currentDate,
								batch: batchNumber
							})

							console.log(`✅ ATUALIZADO: ${cod_ped} (NOK → OK)`)
						} else {
							console.log(`❌ FALHA NA ATUALIZAÇÃO: ${cod_ped}`)
							failedOrders.push({
								cod_ped,
								id_ped,
								cod_rastreio,
								error: "Falha na atualização - nenhuma linha afetada",
								batch: batchNumber
							})
							batchErrors++
						}
					} else {
						console.log(`ℹ️  NÃO encontrou entrega realizada em ${cod_ped}`)
						// Não é um erro, apenas não atende aos critérios
					}

					totalProcessed++
				} catch (error) {
					console.error(`❌ Erro ao processar pedido ${order.cod_ped}:`,
						error.message)
					failedOrders.push({
						cod_ped: order.cod_ped,
						id_ped: order.id_ped,
						cod_rastreio: order.cod_rastreio,
						error: error.message,
						batch: batchNumber
					})
					batchErrors++
					totalProcessed++
				}
			}

			// Resumo do lote atual
			console.log(`\n📋 RESUMO DO LOTE ${batchNumber}:`)
			console.log(`   - Processados: ${batchResult.rows.length}`)
			console.log(`   - Atualizados: ${batchUpdated}`)
			console.log(`   - Erros: ${batchErrors}`)
			console.log(`   - Taxa de sucesso: ${
				batchResult.rows.length > 0
					? ((batchUpdated / batchResult.rows.length) * 100).toFixed(2) + "%"
					: "0%"
			}`)

			// Preparar para o próximo lote
			offset += batchSize
			batchNumber++

			// Pequena pausa para não sobrecarregar o banco (opcional)
			if (hasMore) {
				console.log("⏳ Aguardando 1 segundo antes do próximo lote...")
				await new Promise((resolve) => setTimeout(resolve, 1000))
			}
		}

		// Resultado final
		const result = {
			success: true,
			message: `Atualização em lote concluída. ${totalUpdated} pedidos atualizados de ${totalProcessed} processados em ${
				batchNumber - 1
			} lotes.`,
			summary: {
				total_processados: totalProcessed,
				total_atualizados: totalUpdated,
				total_erros: failedOrders.length,
				total_lotes: batchNumber - 1,
				taxa_sucesso_geral:
          totalProcessed > 0
          	? ((totalUpdated / totalProcessed) * 100).toFixed(2) + "%"
          	: "0%"
			},
			updated_orders: updatedOrders,
			failed_orders: failedOrders
		}

		console.log("\n🎉 === RESUMO FINAL DA ATUALIZAÇÃO EM LOTE ===")
		console.log(`📊 Total processado: ${result.summary.total_processados}`)
		console.log(`✅ Total atualizado: ${result.summary.total_atualizados}`)
		console.log(`❌ Total de erros: ${result.summary.total_erros}`)
		console.log(`📦 Total de lotes: ${result.summary.total_lotes}`)
		console.log(`📈 Taxa de sucesso: ${result.summary.taxa_sucesso_geral}`)

		if (failedOrders.length > 0) {
			console.log("\n⚠️  PEDIDOS COM ERRO:")
			failedOrders.forEach((failed) => {
				console.log(`   - Lote ${failed.batch}: ${failed.cod_ped} - ${failed.error}`)
			})
		}

		return result
	} catch (error) {
		console.error("💥 Erro crítico na função batchUpdateSituacaoFromMandaeEvents:",
			error)
		return {
			success: false,
			message: "Erro durante a atualização em lote",
			error: error.message
		}
	}
}
// Versão com processamento paralelo controlado
export const batchUpdateSituacaoFromMandaeEventsParallel = async (batchSize = 100,
	parallelBatches = 3) => {
	try {
		console.log(`🚀 Iniciando atualização em lote paralela (${parallelBatches} lotes paralelos de ${batchSize})...`)

		// Primeiro, contar o total de pedidos
		const countQuery = `
      SELECT COUNT(*) as total
      FROM info_mandae 
      WHERE situacao = 'NOK' 
      AND status_mandae IS NOT NULL 
      AND status_mandae != 'null' 
      AND status_mandae != 'nan'
      AND status_mandae != 'NaN'
      AND status_mandae != ''
    `

		const countResult = await query(countQuery)
		const totalOrders = parseInt(countResult.rows[0].total)

		console.log(`📊 Total de pedidos para processar: ${totalOrders}`)

		if (totalOrders === 0) {
			console.log("✅ Nenhum pedido com situacao = NOK encontrado.")
			return {
				success: true,
				message: "Nenhum pedido encontrado para atualização",
				total_orders: 0,
				updated: 0
			}
		}

		const totalBatches = Math.ceil(totalOrders / batchSize)
		console.log(`📦 Serão processados ${totalBatches} lotes de ${batchSize} pedidos`)

		let totalUpdated = 0
		let totalProcessed = 0
		const allUpdatedOrders = []
		const allFailedOrders = []

		// Processar lotes em paralelo controlado
		for (
			let batchIndex = 0;
			batchIndex < totalBatches;
			batchIndex += parallelBatches
		) {
			const currentBatches = Math.min(parallelBatches,
				totalBatches - batchIndex)
			console.log(`\n🔄 Processando ${currentBatches} lotes em paralelo (${
				batchIndex + 1
			}-${batchIndex + currentBatches} de ${totalBatches})`)

			const batchPromises = []

			for (let i = 0; i < currentBatches; i++) {
				const currentBatch = batchIndex + i + 1
				const offset = (batchIndex + i) * batchSize

				batchPromises.push(processBatch(currentBatch, offset, batchSize).then((result) => {
					totalUpdated += result.updated
					totalProcessed += result.processed
					allUpdatedOrders.push(...result.updatedOrders)
					allFailedOrders.push(...result.failedOrders)

					console.log(`✅ Lote ${currentBatch} concluído: ${result.updated}/${result.processed} atualizados`)

					return result
				}))
			}

			// Aguardar a conclusão dos lotes paralelos atuais
			await Promise.allSettled(batchPromises)

			// Pequena pausa entre grupos de lotes
			if (batchIndex + parallelBatches < totalBatches) {
				console.log("⏳ Aguardando 2 segundos antes do próximo grupo de lotes...")
				await new Promise((resolve) => setTimeout(resolve, 2000))
			}
		}

		// Resultado final
		const result = {
			success: true,
			message: `Atualização em lote paralela concluída. ${totalUpdated} pedidos atualizados de ${totalProcessed} processados.`,
			summary: {
				total_pedidos: totalOrders,
				total_processados: totalProcessed,
				total_atualizados: totalUpdated,
				total_erros: allFailedOrders.length,
				taxa_sucesso:
          totalProcessed > 0
          	? ((totalUpdated / totalProcessed) * 100).toFixed(2) + "%"
          	: "0%"
			},
			updated_orders: allUpdatedOrders,
			failed_orders: allFailedOrders
		}

		console.log("\n🎉 === RESUMO FINAL ===")
		console.log(`📊 Total de pedidos: ${result.summary.total_pedidos}`)
		console.log(`✅ Total atualizado: ${result.summary.total_atualizados}`)
		console.log(`❌ Total de erros: ${result.summary.total_erros}`)
		console.log(`📈 Taxa de sucesso: ${result.summary.taxa_sucesso}`)

		return result
	} catch (error) {
		console.error("💥 Erro crítico na atualização em lote paralela:", error)
		return {
			success: false,
			message: "Erro durante a atualização em lote paralela",
			error: error.message
		}
	}
}

// Função auxiliar para processar um lote individual
async function processBatch(batchNumber, offset, batchSize) {
	try {
		const batchQuery = `
      SELECT cod_ped, id_ped, cod_rastreio, status_mandae, situacao
      FROM info_mandae 
      WHERE situacao = 'NOK' 
      AND status_mandae IS NOT NULL 
      AND status_mandae != 'null' 
      AND status_mandae != 'nan'
      AND status_mandae != 'NaN'
      AND status_mandae != ''
      ORDER BY cod_ped
      LIMIT $1 OFFSET $2
    `

		const batchResult = await query(batchQuery, [batchSize, offset])

		let batchUpdated = 0
		const batchUpdatedOrders = []
		const batchFailedOrders = []

		for (const order of batchResult.rows) {
			try {
				const { cod_ped, id_ped, cod_rastreio, status_mandae } = order

				const eventsArray = parseStatusMandae(status_mandae)

				if (eventsArray.length === 0) {
					batchFailedOrders.push({
						cod_ped,
						id_ped,
						cod_rastreio,
						error: "Nenhum evento válido",
						batch: batchNumber
					})
					continue
				}

				const entregaRealizada = eventsArray.find((event) => {
					if (!event || typeof event !== "object") return false
					const idMatch = event.id === "1" || event.id === 1
					const nameMatch =
            event.name === "Entrega realizada" ||
            event.name === "Pedido entregue"
					return idMatch && nameMatch
				})

				if (entregaRealizada) {
					const updateQuery = `
            UPDATE info_mandae 
            SET situacao = 'OK', dt_atualizacao = NOW(), ultima_att_mandae = NOW()
            WHERE cod_ped = $1
          `

					await query(updateQuery, [cod_ped])
					batchUpdated++
					batchUpdatedOrders.push({
						cod_ped,
						id_ped,
						cod_rastreio,
						evento_entrega: entregaRealizada,
						batch: batchNumber
					})
				}
			} catch (error) {
				batchFailedOrders.push({
					cod_ped: order.cod_ped,
					id_ped: order.id_ped,
					cod_rastreio: order.cod_rastreio,
					error: error.message,
					batch: batchNumber
				})
			}
		}

		return {
			batch: batchNumber,
			processed: batchResult.rows.length,
			updated: batchUpdated,
			updatedOrders: batchUpdatedOrders,
			failedOrders: batchFailedOrders
		}
	} catch (error) {
		console.error(`💥 Erro no lote ${batchNumber}:`, error)
		return {
			batch: batchNumber,
			processed: 0,
			updated: 0,
			updatedOrders: [],
			failedOrders: [
				{
					error: `Erro no lote: ${error.message}`,
					batch: batchNumber
				}
			]
		}
	}
}

// Função para testar o parse com um pedido específico usando cod_ped
// Função de debug melhorada

export const debugParseStatusMandaeByCodPed = async (codPed) => {
	// Validação mais robusta do parâmetro
	if (codPed === undefined || codPed === null || codPed === "") {
		const errorMsg =
      "cod_ped não foi fornecido ou é inválido. Valor recebido: " + codPed
		console.error("❌", errorMsg)
		throw new Error(errorMsg)
	}

	// Garantir que é string (caso seja número)
	codPed = String(codPed).trim()

	if (!codPed) {
		throw new Error("cod_ped está vazio após conversão para string")
	}

	try {
		console.log(`🔍 DEBUG: Analisando pedido cod_ped: "${codPed}"...`)

		// Query usando cod_ped
		const findOrderQuery = "SELECT * FROM info_mandae WHERE cod_ped = $1"
		console.log(
			"Executando query:", findOrderQuery, "com parâmetro:", codPed
		)

		const orderResult = await query(findOrderQuery, [codPed])

		if (orderResult.rows.length === 0) {
			throw new Error(`Pedido com cod_ped "${codPed}" não encontrado na base de dados`)
		}

		const order = orderResult.rows[0]
		const { cod_ped, id_ped, cod_rastreio, status_mandae, situacao } = order

		console.log("\n=== DADOS DO PEDIDO ENCONTRADO ===")
		console.log("cod_ped:", cod_ped)
		console.log("id_ped:", id_ped)
		console.log("Código Rastreio:", cod_rastreio)
		console.log("Situação atual:", situacao)
		console.log("Tipo do status_mandae:", typeof status_mandae)
		console.log("Valor do status_mandae:")
		console.log(status_mandae)

		// Método 4: Nossa função de parse
		console.log("\n--- Método 4: Nossa função de parse ---")
		const parsed4 = parseStatusMandae(status_mandae)
		console.log("Resultado da nossa função:", parsed4.length, "eventos")
		console.log("Eventos:", JSON.stringify(parsed4, null, 2))

		// VERIFICAÇÃO DE ENTREGA REALIZADA
		console.log("\n=== VERIFICAÇÃO DE ENTREGA REALIZADA ===")

		// Inicializar a variável para evitar "is not defined"
		let entregaRealizada = null

		if (parsed4 && parsed4.length > 0) {
			entregaRealizada = parsed4.find((event) => {
				if (!event || typeof event !== "object") return false

				// Verificar ID (pode ser string "1" ou número 1)
				const idMatch =
          event.id === "1" || event.id === 1 || event.id === "1.0"

				// Verificar nome (diferentes variações possíveis)
				const nameMatch =
          event.name === "Entrega realizada" ||
          event.name === "Pedido entregue" ||
          (event.name &&
            event.name.toLowerCase().includes("entrega realizada")) ||
          (event.name && event.name.toLowerCase().includes("entregue"))

				return idMatch && nameMatch
			})
		}

		console.log("Encontrou entrega realizada:", !!entregaRealizada)
		if (entregaRealizada) {
			console.log("Detalhes do evento:", entregaRealizada)
		} else {
			console.log("Nenhum evento de entrega realizada encontrado")
			console.log("Eventos disponíveis:")
			parsed4.forEach((event, index) => {
				if (event && typeof event === "object") {
					console.log(`  [${index}] id: "${event.id}", name: "${event.name}"`)
				}
			})
		}

		// NOVA LÓGICA: ATUALIZAR SITUAÇÃO SE NECESSÁRIO
		let situacaoAtualizada = situacao
		let atualizou = false

		if (entregaRealizada && situacao === "NOK") {
			console.log("\n🚀 CONDIÇÃO ATENDIDA: Pedido tem entrega realizada e situação = NOK")
			console.log("📝 Atualizando situação de NOK para OK...")

			const updateQuery = `
        UPDATE info_mandae 
        SET situacao = 'OK', 
            dt_atualizacao = $1,
            ultima_att_mandae = $2
        WHERE cod_ped = $3
      `

			const currentDate = new Date().toISOString()
			const updateResult = await query(updateQuery, [
				currentDate,
				currentDate,
				cod_ped
			])

			if (updateResult.rowCount > 0) {
				situacaoAtualizada = "OK"
				atualizou = true
				console.log("✅ SITUAÇÃO ATUALIZADA COM SUCESSO: NOK → OK")
			} else {
				console.log("❌ FALHA NA ATUALIZAÇÃO: Nenhuma linha afetada")
			}
		} else if (entregaRealizada && situacao === "OK") {
			console.log("ℹ️  Pedido já está com situação = OK (nada a fazer)")
		} else if (!entregaRealizada && situacao === "NOK") {
			console.log("ℹ️  Pedido com situação = NOK mas sem evento de entrega realizada (nada a fazer)")
		}

		// RETORNO CORRIGIDO - garantir que todas as variáveis estão definidas
		return {
			success: true,
			order: {
				cod_ped,
				id_ped,
				cod_rastreio,
				situacao_anterior: situacao,
				situacao_atual: situacaoAtualizada,
				deve_ser_atualizado: !!entregaRealizada && situacao === "NOK",
				foi_atualizado: atualizou
			},
			parse_result: parsed4,
			entrega_realizada: entregaRealizada || null, // garantir que sempre tem um valor
			acao_realizada: atualizou
				? "Situação atualizada de NOK para OK"
				: "Nenhuma ação necessária"
		}
	} catch (error) {
		console.error("❌ Erro no debugParseStatusMandaeByCodPed:", error.message)
		return {
			success: false,
			error: error.message
		}
	}
}
