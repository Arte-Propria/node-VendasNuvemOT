/* eslint-disable camelcase */
import { query } from "./db.js"
import { logDB, logWebhookMarketplace } from "../utils/logger.js"

export const saveOrder = async (order) => {
	// Validação básica dos parâmetros
	if (!order) {
		throw new Error("Parâmetro order é obrigatório")
	}

	const tableName = "pedidos_marketplace"

	// Formatação dos dados antes do salvamento
	const formattedOrder = {
		id: order.id,
		numero: order.numero,
		numero_ecommerce: order.numero_ecommerce || null,
		data_pedido: order.data_pedido,
		data_prevista: order.data_prevista || null,
		data_faturamento: order.data_faturamento || null,
		data_envio: order.data_envio || null,
		data_entrega: order.data_entrega || null,
		id_lista_preco: order.id_lista_preco || null,
		descricao_lista_preco: order.descricao_lista_preco || null,
		cliente: JSON.stringify(order.cliente || {}),
		endereco_entrega: JSON.stringify(order.endereco_entrega || {}),
		itens: JSON.stringify(order.itens || []),
		parcelas: JSON.stringify(order.parcelas || []),
		marcadores: JSON.stringify(order.marcadores || []),
		condicao_pagamento: order.condicao_pagamento || null,
		forma_pagamento: order.forma_pagamento || null,
		meio_pagamento: order.meio_pagamento || null,
		nome_transportador: order.nome_transportador || null,
		frete_por_conta: order.frete_por_conta || null,
		valor_frete: parseFloat(order.valor_frete) || 0,
		valor_desconto: parseFloat(order.valor_desconto) || 0,
		outras_despesas: parseFloat(order.outras_despesas) || 0,
		total_produtos: parseFloat(order.total_produtos) || 0,
		total_pedido: parseFloat(order.total_pedido) || 0,
		numero_ordem_compra: order.numero_ordem_compra || null,
		deposito: order.deposito || null,
		ecommerce: order.ecommerce || null,
		forma_envio: order.forma_envio || null,
		situacao: order.situacao || null,
		obs: order.obs || null,
		obs_interna: order.obs_interna || null,
		id_vendedor: order.id_vendedor || null,
		codigo_rastreamento: order.codigo_rastreamento || null,
		url_rastreamento: order.url_rastreamento || null,
		id_nota_fiscal: order.id_nota_fiscal || null,
		id_natureza_operacao: order.id_natureza_operacao || null,
		produtos: JSON.stringify(order.produtos || [])
	}

	const queryText = `
      INSERT INTO ${tableName} (
        id,
        numero,
        numero_ecommerce,
        data_pedido,
        data_prevista,
        data_faturamento,
        data_envio,
        data_entrega,
        id_lista_preco,
        descricao_lista_preco,
        cliente,
        endereco_entrega,
        itens,
        parcelas,
        marcadores,
        condicao_pagamento,
        forma_pagamento,
        meio_pagamento,
        nome_transportador,
        frete_por_conta,
        valor_frete,
        valor_desconto,
        outras_despesas,
        total_produtos,
        total_pedido,
        numero_ordem_compra,
        deposito,
        ecommerce,
        forma_envio,
        situacao,
        obs,
        obs_interna,
        id_vendedor,
        codigo_rastreamento,
        url_rastreamento,
        id_nota_fiscal,
        id_natureza_operacao,
        produtos
      ) 
      VALUES (
        $1, $2, $3, TO_DATE($4, 'DD/MM/YYYY'), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38
      )
      ON CONFLICT (id) DO UPDATE SET
        numero = $2,
        numero_ecommerce = $3,
        data_pedido = TO_DATE($4, 'DD/MM/YYYY'),
        data_prevista = $5,
        data_faturamento = $6,
        data_envio = $7,
        data_entrega = $8,
        id_lista_preco = $9,
        descricao_lista_preco = $10,
        cliente = $11,
        endereco_entrega = $12,
        itens = $13,
        parcelas = $14,
        marcadores = $15,
        condicao_pagamento = $16,
        forma_pagamento = $17,
        meio_pagamento = $18,
        nome_transportador = $19,
        frete_por_conta = $20,
        valor_frete = $21,
        valor_desconto = $22,
        outras_despesas = $23,
        total_produtos = $24,
        total_pedido = $25,
        numero_ordem_compra = $26,
        deposito = $27,
        ecommerce = $28,
        forma_envio = $29,
        situacao = $30,
        obs = $31,
        obs_interna = $32,
        id_vendedor = $33,
        codigo_rastreamento = $34,
        url_rastreamento = $35,
        id_nota_fiscal = $36,
        id_natureza_operacao = $37,
        produtos = $38
      RETURNING *
    `

	const values = Object.values(formattedOrder)
	const result = await query(queryText, values)

	logDB(`Pedido ${order.id} salvo com sucesso na tabela ${tableName} | ${order.data_pedido}`)
	return result.rows[0]
}

export const updateOrder = async (situacaoOrder, id) => {
	await query(`
    UPDATE pedidos_marketplace SET situacao = $1 WHERE id = $2
  `, [situacaoOrder, id])
	logDB(`Pedido ${id} atualizado com sucesso.`)
}

export const updateOrderStatus = async (order) => {
	// Validação básica dos parâmetros
	if (!order || !order.id) {
		throw new Error("Parâmetro order e order.id são obrigatórios")
	}

	const tableName = "pedidos_marketplace"

	// Formatação apenas dos campos que serão atualizados
	const formattedOrder = {
		data_prevista: order.data_prevista || null,
		data_faturamento: order.data_faturamento || null,
		data_envio: order.data_envio || null,
		data_entrega: order.data_entrega || null,
		nome_transportador: order.nome_transportador || null,
		forma_envio: order.forma_envio || null,
		situacao: order.situacao || null,
		obs: order.obs || null,
		obs_interna: order.obs_interna || null,
		url_rastreamento: order.url_rastreamento || null,
		id_nota_fiscal: order.id_nota_fiscal || null,
		id_natureza_operacao: order.id_natureza_operacao || null
	}

	const queryText = `
    UPDATE ${tableName} 
    SET
      data_prevista = $1,
      data_faturamento = $2,
      data_envio = $3,
      data_entrega = $4,
      nome_transportador = $5,
      forma_envio = $6,
      situacao = $7,
      obs = $8,
      obs_interna = $9,
      url_rastreamento = $10,
      id_nota_fiscal = $11,
      id_natureza_operacao = $12
    WHERE id = $13
    RETURNING *
  `

	const values = [...Object.values(formattedOrder), order.id]
	const result = await query(queryText, values)

	if (result.rows.length === 0) {
		logWebhookMarketplace(`Pedido com ID ${order.id} não encontrado`)
		return {
			success: false,
			message: `Pedido com ID ${order.id} não encontrado`,
			data: null
		}
	}

	logWebhookMarketplace(`Status do pedido ${order.id} atualizado com sucesso na tabela ${tableName}`)
	return {
		success: true,
		message: "Pedido atualizado com sucesso",
		data: result.rows[0],
		code: 200
	}

}
