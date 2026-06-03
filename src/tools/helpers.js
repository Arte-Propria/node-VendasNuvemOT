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


// Busca o ID da nota fiscal a partir do número do pedido Tiny
export async function fetchNoteOrderTiny(orderId) {
	// chamada à API do Tiny para obter dados da nota fiscal
	// retorna o id da nota ou null
}

// Busca o link da nota fiscal a partir do id da nota
export async function fetchLinkNote(noteId) {
	// retorna URL pública da nota
}