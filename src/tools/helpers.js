// ==================== helpers.js ====================

export const classifyProductCategory = (productName) => {
	if (!productName) return "OUTROS"
	const lowerName = productName.toLowerCase()
	if (lowerName.includes("quadro")) return "QUADROS"
	if (lowerName.includes("espelho")) return "ESPELHOS"
	return "OUTROS"
}

export const determinarGrupo = (prod) => {
	if (prod.sku && prod.sku.includes("OT")) return "OT"
	if (prod.sku && prod.sku.includes("AP")) return "AP"
	// fallback: pode buscar de outra propriedade
	return "OUTROS"
}
export const cleanCpfCnpj = (value) => (value || "").replace(/[^\d]/g, "")
export const cleanPhone = (value) => (value || "").replace(/[^\d+]/g, "")
export const toNumber = (value) => {
	if (value === undefined || value === null) return 0
	if (typeof value === "number") return isNaN(value) ? 0 : value
	let str = String(value).trim()
	str = str.replace(/[^\d.,-]/g, "")
	str = str.replace(",", ".")
	const parts = str.split(".")
	if (parts.length > 2) {
		str = parts[0] + parts.slice(1).join("")
	}
	const match = str.match(/^-?\d+(?:\.\d+)?/)
	if (!match) return 0
	const num = parseFloat(match[0])
	return isNaN(num) ? 0 : num
}
export const toISOString = (dateStr) => {
	if (!dateStr) return null
	// Se já estiver no formato ISO, retorna direto
	if (dateStr.includes("T")) return dateStr
	// Tenta converter dd/mm/aaaa -> aaaa-mm-dd
	const parts = dateStr.split("/")
	if (parts.length === 3) {
		const [dia, mes, ano] = parts
		return new Date(`${ano}-${mes}-${dia}`).toISOString()
	}
	return new Date(dateStr).toISOString()
}

/**
 * Retorna a data (YYYY-MM-DD) de um instante no fuso de negócio (Brasil).
 * Usa America/Sao_Paulo para respeitar o histórico de horário de verão (extinto em 2019),
 * evitando que vendas da madrugada (UTC) caiam no dia errado em daily_sales/cupom.
 */
export const toLocalDateBR = (input) => {
	if (!input) return null
	const d = input instanceof Date ? input : new Date(input)
	if (isNaN(d.getTime())) return null
	return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
}

/**
 * Dia de NEGÓCIO (BRT) com corte às 03:00 da manhã: pedidos feitos entre 00:00 e 03:00
 * (horário de São Paulo) contam para o dia anterior. Implementado subtraindo 3h do
 * instante (created_at) antes de converter para a data no fuso America/Sao_Paulo.
 * Ex.: 2026-06-16T03:58Z → -3h = 00:58Z → BRT 2026-06-15T21:58 → "2026-06-15".
 */
export const toBusinessDateBR = (input) => {
	if (!input) return null
	const d = input instanceof Date ? input : new Date(input)
	if (isNaN(d.getTime())) return null
	const shifted = new Date(d.getTime() - 3 * 60 * 60 * 1000) // -3h (corte do dia de negócio)
	return shifted.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
}

// Extrai o número do pedido (identificador único) dos dados da Tiny
export const extractOrderNumber = (tinyData) => {
	const pedido = tinyData.retorno.pedido
	return (
		pedido.numero_ecommerce ||
    pedido.numero_ordem_compra ||
    pedido.ecommerce?.numeroPedidoEcommerce ||
    null
	)
}

// Converte valor booleano/string para 0 ou 1 (smallint)
export const toIntBool = (value) => {
	if (typeof value === "boolean") return value ? 1 : 0
	if (typeof value === "number") return value ? 1 : 0
	if (typeof value === "string") {
		const lower = value.toLowerCase()
		if (lower === "true") return 1
		if (lower === "false") return 0
	}
	return 0 // padrão falso
}

export const removeNullFields = (obj) => {
	const cleanObj = {}
	for (const [key, value] of Object.entries(obj)) {
		if (value !== null && value !== undefined) {
			cleanObj[key] = value
		}
	}
	return cleanObj
}

/**
 * Parse seguro de um campo que pode vir como array já parseado (JSONB pelo driver pg)
 * ou como string JSON (coluna TEXT). Retorna sempre um array (vazio em caso de falha).
 */
export const parseJsonArray = (value) => {
	if (Array.isArray(value)) return value
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value)
			return Array.isArray(parsed) ? parsed : []
		} catch (e) {
			return []
		}
	}
	return []
}

// ==================== extração de atributos do nome do produto ====================

/**
 * Extrai dimensões do nome do produto (ex: "100x70", "60x90")
 * Retorna string com "X" maiúsculo, ex: "100X70"
 */
export const extractDimensions = (productName) => {
	if (!productName) return null
	// busca padrão como 100x70, 100x70cm, 100x70 cm, 40x60, etc.
	const match = productName.match(/(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)/)
	if (match) {
		let dim = `${match[1]}X${match[2]}`.replace(/\./g, ",")
		return dim.toUpperCase()
	}
	return null
}

/**
 * Extrai cor do nome do produto (após hífen ou entre parênteses no final)
 * Ex: "Espelho Rocha 100x70cm - Caramelo" → "Caramelo"
 *     "Quadro (Branco)" → "Branco"
 */
export const extractColor = (productName) => {
	if (!productName) return null
	let color = null
	// Padrão: " - Cor" (último hífen)
	const hyphenMatch = productName.match(/\s*-\s*([^-]+)$/)
	if (hyphenMatch) {
		color = hyphenMatch[1].trim()
	} else {
		// Padrão: "(Cor)" no final
		const parenMatch = productName.match(/\(([^)]+)\)$/)
		if (parenMatch) {
			color = parenMatch[1].trim()
		}
	}
	if (color) {
		// remove possível prefixo "cor " (case insensitive)
		color = color.replace(/^cor\s*/i, "").trim()
		return color.toUpperCase() || null
	}
	return null
}

/**
 * Extrai tipo de acabamento (LED, MDF, COURO) do nome do produto
 * Retorna o tipo encontrado ou "-" se nenhum
 */
export const extractFinishType = (productName) => {
	if (!productName) return "-"
	const upperName = productName.toUpperCase()
	if (upperName.includes("LED")) return "LED"
	if (upperName.includes("MDF")) return "MDF"
	if (upperName.includes("COURO")) return "COURO"
	return "-"
}

// Calcula a data estimada de entrega (created_at + shipping_max_days)
export const calculateEstimatedDeliveryDate = (createdAt, maxDays) => {
	if (!createdAt || !maxDays) return null
	const date = new Date(createdAt)
	date.setDate(date.getDate() + parseInt(maxDays, 10))
	return date.toISOString().split("T")[0]
}

// Converte custo de frete para número
export const shippingCost = (value) => toNumber(value)