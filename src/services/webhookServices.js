/* eslint-disable camelcase */
import { GETNuvemOrder } from "../api/get.js"
import { GETtiny, POSTtiny, PUTtiny } from "../api/tiny.js"
import { saveOrder, updateOrderStatus } from "../db/saveOrder.js"
import {
	logEcommerce,
	logPCP,
	logWebhookMarketplace
} from "../utils/logger.js"
import { getProductDetails } from "../utils/tiny.js"
import { google } from "googleapis"
import { JWT } from "google-auth-library"
import { config } from "../config/env.js"
import { delay, getSheetIdByName } from "../tools/tools.js"

const marketplaceNames = [
	"Shopee",
	"Magalu Abstract",
	"Magalu Marketplace",
	"Magazine Luiza",
	"Mercado Livre Abstract",
	"Mercado Livre",
	"Mercado Livre Integrada",
	"Mercado Livre Fulfillment",
	"Mercado Livre Fulfillment Abst",
	"Amazon FBA Classic",
	"Amazon FBA Onsite",
	"Amazon",
	"MadeiraMadeira",
	"Shein",
	"TikTok Shop Abstract"
]

const statusPermitidos = [
	"aberto",
	"aprovado",
	"faturado",
	"pronto_envio",
	"enviado",
	"entregue",
	"preparando_envio"
]

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

const ABA_DESTINOS = {
	Entregue: "Pedidos ENTREGUE",
	Enviado: "Pedidos ENVIADO",
	Cancelado: "Pedidos CANCELADO"
}

const ABAS_ORIGEM = [
	"Pedidos",
	"Pedidos ENVIADO",
	"Pedidos ENTREGUE",
	"Pedidos CANCELADO",
	"Full",
	"Estoque Produção"
]

export async function processUpdateOrderGSheets(dados) {
	const { id: idPedidoTiny, descricaoSituacao, idNotaFiscal = "0" } = dados
	const novaSituacao = descricaoSituacao

	if (!idPedidoTiny || !novaSituacao)
		return { status: "error", message: "ID ou situação ausente" }

	const auth = new JWT({
		email: config.googleClientEmail,
		key: config.googlePrivateKey.replace(/\\n/g, "\n"),
		scopes: SCOPES
	})

	const sheets = google.sheets({ version: "v4", auth })
	const sheetId = config.googleIdGSheets

	for (const nomeAba of ABAS_ORIGEM) {
		// Adiciona delay antes de cada nova requisição
		await delay(1000) // 1 segundo de delay entre requisições

		const res = await sheets.spreadsheets.values.get({
			spreadsheetId: sheetId,
			range: `${nomeAba}!A2:AF`
		})

		let linhas = res.data.values || []
		let linhasAtualizadas = []
		let linhasParaMover = []

		// Primeiro, identifica todas as linhas que precisam ser atualizadas
		for (let i = 0; i < linhas.length; i++) {
			const linha = linhas[i]
			const idLinha = linha[0]?.trim()

			if (idLinha === String(idPedidoTiny)) {
				const linhaIndex = i + 2 // +2 por causa do cabeçalho e índice base 1
				const agora = new Date().toLocaleString("pt-BR", {
					timeZone: "America/Sao_Paulo"
				})
				const historicoAnterior = linha[31] || ""
				const novoHistorico = `[${agora}] ${novaSituacao} ${
					historicoAnterior ? "\n" + historicoAnterior : ""
				}`

				// Atualiza as colunas diretamente na aba de origem
				await sheets.spreadsheets.values.update({
					spreadsheetId: sheetId,
					range: `${nomeAba}!D${linhaIndex}:D${linhaIndex}`,
					valueInputOption: "RAW",
					requestBody: { values: [[novaSituacao]] }
				})

				await delay(500)

				await sheets.spreadsheets.values.update({
					spreadsheetId: sheetId,
					range: `${nomeAba}!U${linhaIndex}:U${linhaIndex}`,
					valueInputOption: "RAW",
					requestBody: { values: [[idNotaFiscal]] }
				})

				await delay(500)

				await sheets.spreadsheets.values.update({
					spreadsheetId: sheetId,
					range: `${nomeAba}!AF${linhaIndex}:AF${linhaIndex}`,
					valueInputOption: "RAW",
					requestBody: { values: [[novoHistorico]] }
				})

				// Se for um status que deve mover a linha
				if (ABA_DESTINOS[novaSituacao]) {
					const linhaAtualizada = [...linha]
					linhaAtualizada[3] = novaSituacao
					linhaAtualizada[20] = idNotaFiscal
					linhaAtualizada[31] = novoHistorico
					linhasParaMover.push({ linhaIndex, linhaAtualizada })
				}

				linhasAtualizadas.push(linhaIndex)
			}
		}

		// Se houver linhas para mover e for um status que deve mover
		if (linhasParaMover.length > 0 && ABA_DESTINOS[novaSituacao]) {
			const destino = ABA_DESTINOS[novaSituacao]

			await delay(500)

			// Primeiro, remove todas as linhas da aba de origem (em ordem decrescente para não afetar os índices)
			const sheetIdByName = await getSheetIdByName(sheets, sheetId, nomeAba)
			const requests = linhasParaMover
				.sort((a, b) => b.linhaIndex - a.linhaIndex)
				.map(({ linhaIndex }) => ({
					deleteDimension: {
						range: {
							sheetId: sheetIdByName,
							dimension: "ROWS",
							startIndex: linhaIndex - 1,
							endIndex: linhaIndex
						}
					}
				}))

			if (requests.length > 0) {
				await sheets.spreadsheets.batchUpdate({
					spreadsheetId: sheetId,
					requestBody: { requests }
				})
			}

			// Depois, adiciona todas as linhas à aba de destino
			for (const { linhaAtualizada } of linhasParaMover) {
				await delay(500)
				await sheets.spreadsheets.values.append({
					spreadsheetId: sheetId,
					range: `${destino}!A1`,
					valueInputOption: "RAW",
					insertDataOption: "INSERT_ROWS",
					requestBody: { values: [linhaAtualizada] }
				})
			}
		}

		if (linhasAtualizadas.length > 0) {
			logPCP(`Atualizado ${linhasAtualizadas.length} linha(s) e movido se necessário`)
			return {
				status: "success",
				message: `Atualizado ${linhasAtualizadas.length} linha(s) e movido se necessário`
			}
		}
	}

	logPCP("Pedido não encontrado")
	return {
		status: "error",
		message: "Pedido não encontrado"
	}
}

export const processMarketplaceWebhook = async (body) => {
	const { tipo, dados, pedido } = body

	if (tipo === "inclusao_pedido") {
		const { nomeEcommerce, codigoSituacao, cliente } = dados
		const isClientFullEstoque =
      cliente.nome.toUpperCase().includes("FULL") ||
      cliente.nome.toUpperCase().includes("ESTOQUE")

		// Verificar se o pedido é de um marketplace configurado ou se o cliente é FULL/ESTOQUE
		if (!marketplaceNames.includes(nomeEcommerce) && !isClientFullEstoque) {
			logWebhookMarketplace(`Pedido não pertence aos marketplaces configurados e cliente não é FULL/ESTOQUE, id: ${dados.id}, nomeEcommerce: ${nomeEcommerce}, cliente: ${cliente.nome}`)
			return {
				status: "ignored",
				message:
          "Pedido não pertence aos marketplaces configurados e cliente não é FULL/ESTOQUE"
			}
		}

		// Verificar o status do pedido
		if (codigoSituacao === "cancelado") {
			logWebhookMarketplace(`Pedido cancelado, id: ${dados.id}, nomeEcommerce: ${nomeEcommerce}`)
			return { status: "ignored", message: "Pedido cancelado" }
		}

		if (statusPermitidos.includes(codigoSituacao)) {
			const result = await processSaveOrder(dados, pedido)
			return result
		}

		logWebhookMarketplace(`Pedido não aprovado ou não faturado ou com dados incompletos, id: ${dados.id}, nomeEcommerce: ${nomeEcommerce}`)
		return { status: "ignored", message: "Pedido não aprovado" }
	}

	if (tipo === "atualizacao_pedido") {
		const { nomeEcommerce, cliente } = dados
		const isClientFullEstoque =
      cliente.nome.toUpperCase().includes("FULL") ||
      cliente.nome.toUpperCase().includes("ESTOQUE")
		const { marcadores } = pedido
		const isIntegradaES = marcadores.some((marcador) => marcador.marcador.descricao.toLowerCase() === "integradaes")

		if (isIntegradaES) {
			const result = await updateOrderNuvemshop(dados, pedido)
			return result
		}

		// Verificar se o pedido é de um marketplace configurado
		if (!marketplaceNames.includes(nomeEcommerce) && !isClientFullEstoque) {
			logWebhookMarketplace(`Pedido não pertence aos marketplaces configurados e não é um pedido FULL/ESTOQUE, id: ${dados.id}, nomeEcommerce: ${nomeEcommerce}, cliente: ${cliente.nome}`)
			return {
				status: "ignored",
				message: "Pedido não pertence aos marketplaces configurados"
			}
		}

		try {
			await processUpdateOrderGSheets(dados)
			const result = await processUpdateOrder(dados, pedido)
			return result
		} catch (error) {
			logWebhookMarketplace(`Erro ao processar webhook: ${error.message}. Pedido ${dados.id}: ${error.stack}`)
			return { status: "error", message: error.message }
		}
	}
}

async function processSaveOrder(dados, pedido) {
	try {
		// Obter detalhes do pedido
		const orderDetails = pedido

		// Recuperar informações dos produtos no pedido
		const enrichedItems = await Promise.all(orderDetails.itens.map(async ({ item }) => {
			try {
				const productDetails = await getProductDetails(item.id_produto)
				return { ...item, ...productDetails }
			} catch (error) {
				logWebhookMarketplace(`Erro ao obter detalhes do produto ${item.id_produto}:`,
					error)
				return { ...item, productDetails: null }
			}
		}))

		// Incorporar os detalhes dos produtos no pedido
		const enrichedOrder = { ...orderDetails, produtos: enrichedItems }

		// Salvar pedido no banco de dados
		await saveOrder(enrichedOrder)

		return {
			status: "success",
			message: "Pedido salvo com sucesso"
		}
	} catch (error) {
		logWebhookMarketplace(`Erro ao processar o pedido: ${error}, ${dados}`)
		return { status: "error", message: "Erro ao processar o pedido" }
	}
}

async function processUpdateOrder(dados, pedido) {
	try {
		// Obter detalhes do pedido
		const orderDetails = pedido

		// Atualizar status do pedido
		const { success } = await updateOrderStatus(orderDetails)

		if (!success) {
			const result = await processSaveOrder(dados, pedido)
			return result
		}

		return { status: "success", message: "Pedido atualizado com sucesso" }
	} catch (error) {
		logWebhookMarketplace(`Erro ao processar o pedido: ${error}, ${dados}`)
		return { status: "error", message: "Erro ao processar o pedido" }
	}
}

export const processEcommerceWebhook = async (body) => {
	const { tipo, dados, pedido } = body
	const { codigoSituacao: status } = dados

	if (tipo === "inclusao_pedido") {
		return {
			status: "ignored",
			message: "Novo pedido criado"
		}
	}

	if (tipo === "atualizacao_pedido" && status !== "faturado") {
		return {
			status: "ignored",
			message: "Pedido não faturado"
		}
	}

	if (tipo === "atualizacao_pedido" && status === "faturado") {
		const orderDetails = pedido
		const pedidosExistentes = await GETtiny.ABSTRACT("pedidos.pesquisa.php", {
			dataInicialOcorrencia: dados.data,
			cliente: dados.cliente.nome,
			cpf_cnpj: dados.cliente.cpfCnpj
		})

		const { number: numberOrderRetry } = await GETNuvemOrder(dados.idPedidoEcommerce)
		const isPedidoExistente = pedidosExistentes.some((pedido) => pedido.pedido.numero_ecommerce === numberOrderRetry.toString())

		if (isPedidoExistente) {
			return {
				status: "success",
				message: `Pedido já existe na conta Abstract. Pedido com ID: ${dados.id}`
			}
		}

		const nota_fiscal = await GETtiny.ESnote("nota.fiscal.obter.php", {
			id: dados.idNotaFiscal
		})

		const result = await POSTtiny.ABSTRACT("pedido.incluir.php", {
			...orderDetails,
			nota_fiscal
		})
		const id = result.retorno.registros.registro.id

		return {
			status: "success",
			message: `Pedido salvo na conta Abstract. Pedido com ID: ${id}`
		}
	}
}

export const updateOrderNuvemshop = async (dados, pedido) => {
	const orderDetailsABSTRACT = pedido
	const { id } = await GETtiny.ES("pedidos.pesquisa.php", {
		dataInicialOcorrencia: dados.data,
		idPedidoEcommerce: dados.idPedidoEcommerce,
		// cliente: dados.cliente.nome,
		cpf_cnpj: dados.cliente.cpfCnpj
	})
	if (!id) {
		logEcommerce(`Não foram encontrados pedidos com o CPF/CNPJ: ${dados.cliente.cpfCnpj}`)
		return {
			status: "error",
			message: `Não foram encontrados pedidos com o CPF/CNPJ: ${dados.cliente.cpfCnpj}`
		}
	}

	const data = {
		id,
		situacao: orderDetailsABSTRACT.situacao,
		codigoRastreamento: orderDetailsABSTRACT.codigo_rastreamento,
		urlRastreamento: encodeURI(orderDetailsABSTRACT.url_rastreamento)
	}

	await PUTtiny.ES(data)
	logEcommerce(`Pedido atualizado no Tiny Integrada ES. Pedido com ID: ${id}`)

	return {
		status: "success",
		message: `Pedido atualizado no Tiny Integrada ES. Pedido com ID: ${id}`
	}
}
