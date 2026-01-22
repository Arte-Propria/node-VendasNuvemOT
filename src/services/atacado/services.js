import { saveOrderAtacado, updateOrderAtacadoStatus } from "../../db/saveOrder.js"
import { logAtacado } from "../../utils/logger.js"
import { getProductDetails } from "../../utils/tiny.js"

const atacadoNames = [
	"leroymerlin",
	"carajas",
	"ferreira costa",
	"obramax",
	"openbox2",
	"mobly",
	"tokstok",
	"goquadros"
]

export const processAtacadoWebhook = async (body) => {
	const { pedido } = body
	const { marcadores } = pedido
	const isAtacado = marcadores.some((marcador) => atacadoNames.includes(marcador.marcador.descricao.toLowerCase()))

	if (isAtacado) {
		try {
			await processSaveOrderAtacado(pedido)
			logAtacado(`Pedido ${pedido.id} enviado para o Atacado com sucesso`)

			return {
				status: "success",
				message: `Pedido ${pedido.id} enviado para o Atacado com sucesso`
			}
		} catch (error) {
			logAtacado(`Erro ao enviar webhook para Atacado. Pedido: ${pedido.id}, Erro: ${error.message}`)
			return {
				status: "error",
				message: `Erro ao enviar webhook para Atacado. Pedido: ${pedido.id}, Erro: ${error.message}`
			}
		}
	}
}

export async function processSaveOrderAtacado(dados, pedido) {
	try {
		// Obter detalhes do pedido
		const orderDetails = pedido

		// Recuperar informações dos produtos no pedido
		const enrichedItems = await Promise.all(orderDetails.itens.map(async ({ item }) => {
			try {
				const productDetails = await getProductDetails(item.id_produto)
				return { ...item, ...productDetails }
			} catch (error) {
				logAtacado(`Erro ao obter detalhes do produto ${item.id_produto}:`,
					error)
				return { ...item, productDetails: null }
			}
		}))

		const qtdProdutos = enrichedItems.length
		const cpfcnpjCli = orderDetails.cliente.cpf_cnpj
		const produtosSkus = enrichedItems.map((item) => item.codigo)

		// Incorporar os detalhes dos produtos no pedido
		const enrichedOrder = { ...orderDetails, produtos: enrichedItems, qtdProdutos, cpfcnpjCli, produtosSkus }

		// Salvar pedido no banco de dados
		await saveOrderAtacado(enrichedOrder)

		return {
			status: "success",
			message: "Pedido salvo com sucesso"
		}
	} catch (error) {
		logAtacado(`Erro ao processar o pedido: ${error}, ${dados}`)
		return { status: "error", message: "Erro ao processar o pedido" }
	}
}

export async function processUpdateOrderAtacado(dados, pedido) {
	try {
		// Obter detalhes do pedido
		const orderDetails = pedido

		// Atualizar status do pedido
		const { success } = await updateOrderAtacadoStatus(orderDetails)

		if (!success) {
			const result = await processSaveOrderAtacado(dados, pedido)
			return result
		}

		return { status: "success", message: "Pedido atualizado com sucesso" }
	} catch (error) {
		logAtacado(`Erro ao processar o pedido: ${error}, ${dados}`)
		return { status: "error", message: "Erro ao processar o pedido" }
	}
}

