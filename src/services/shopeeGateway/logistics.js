import { callShop } from "./client.js"

/**
 * Operações de logística: organizar o envio (ship_order) e gerar/baixar a
 * etiqueta (documento de envio). Uma operação por pedido — o 3print busca a
 * etiqueta pedido a pedido.
 *
 * As de documento recebem `order_list` na Shopee; aqui a lista tem um item só.
 * `package_number` ausente sai do JSON (undefined), e a Shopee usa o pacote
 * único do pedido.
 */

const orderList = (orderSn, packageNumber, extra = {}) => [{
	order_sn: orderSn,
	package_number: packageNumber,
	...extra
}]

/** GET /api/v2/logistics/get_shipping_parameter — o que o ship_order precisa (coleta, drop-off). */
export const getShippingParameter = ({
	shopId,
	accessToken,
	orderSn,
	packageNumber
}) =>
	callShop({
		shopId,
		accessToken,
		path: "/api/v2/logistics/get_shipping_parameter",
		params: {
			order_sn: orderSn,
			package_number: packageNumber
		}
	})

/** POST /api/v2/logistics/ship_order — organiza o envio. Não tem volta. */
export const shipOrder = ({
	shopId,
	accessToken,
	orderSn,
	packageNumber,
	pickup,
	dropoff
}) =>
	callShop({
		shopId,
		accessToken,
		method: "POST",
		path: "/api/v2/logistics/ship_order",
		body: {
			order_sn: orderSn,
			package_number: packageNumber,
			pickup,
			dropoff
		}
	})

/** POST /api/v2/logistics/get_shipping_document_parameter — tipos de etiqueta do pedido. */
export const getShippingDocumentParameter = ({
	shopId,
	accessToken,
	orderSn,
	packageNumber
}) =>
	callShop({
		shopId,
		accessToken,
		method: "POST",
		path: "/api/v2/logistics/get_shipping_document_parameter",
		body: { order_list: orderList(orderSn, packageNumber) }
	})

/** POST /api/v2/logistics/create_shipping_document — pede a etiqueta (a geração é assíncrona). */
export const createShippingDocument = ({
	shopId,
	accessToken,
	orderSn,
	packageNumber,
	trackingNumber,
	shippingDocumentType
}) =>
	callShop({
		shopId,
		accessToken,
		method: "POST",
		path: "/api/v2/logistics/create_shipping_document",
		body: {
			order_list: orderList(orderSn, packageNumber, {
				tracking_number: trackingNumber,
				shipping_document_type: shippingDocumentType
			})
		}
	})

/** POST /api/v2/logistics/get_shipping_document_result — READY, PROCESSING ou FAILED. */
export const getShippingDocumentResult = ({
	shopId,
	accessToken,
	orderSn,
	packageNumber,
	shippingDocumentType
}) =>
	callShop({
		shopId,
		accessToken,
		method: "POST",
		path: "/api/v2/logistics/get_shipping_document_result",
		body: {
			order_list: orderList(orderSn, packageNumber, {
				shipping_document_type: shippingDocumentType
			})
		}
	})

/** POST /api/v2/logistics/download_shipping_document — o ARQUIVO: PDF, ou ZIP com o ZPL. */
export const downloadShippingDocument = ({
	shopId,
	accessToken,
	orderSn,
	packageNumber,
	shippingDocumentType
}) =>
	callShop({
		shopId,
		accessToken,
		method: "POST",
		path: "/api/v2/logistics/download_shipping_document",
		body: {
			shipping_document_type: shippingDocumentType,
			order_list: orderList(orderSn, packageNumber)
		},
		binary: true
	})
