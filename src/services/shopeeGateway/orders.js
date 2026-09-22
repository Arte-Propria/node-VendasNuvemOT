import { callShop } from "./client.js"

/**
 * Operações de pedido. Cada função recebe só o que a operação aceita e monta
 * os params no formato da Shopee (CSV onde ela pede CSV).
 */

/** GET /api/v2/order/get_order_detail — até 50 pedidos por chamada. */
export const getOrderDetail = ({
	shopId,
	accessToken,
	orderSnList,
	responseOptionalFields,
	requestOrderStatusPending
}) =>
	callShop({
		shopId,
		accessToken,
		path: "/api/v2/order/get_order_detail",
		params: {
			order_sn_list: orderSnList.join(","),
			response_optional_fields: responseOptionalFields,
			request_order_status_pending: requestOrderStatusPending
		}
	})

/** GET /api/v2/order/get_order_list — janela de no máximo 15 dias, paginada por cursor. */
export const getOrderList = ({
	shopId,
	accessToken,
	timeRangeField,
	timeFrom,
	timeTo,
	pageSize,
	cursor,
	orderStatus,
	responseOptionalFields
}) =>
	callShop({
		shopId,
		accessToken,
		path: "/api/v2/order/get_order_list",
		params: {
			time_range_field: timeRangeField,
			time_from: timeFrom,
			time_to: timeTo,
			page_size: pageSize,
			cursor,
			order_status: orderStatus,
			response_optional_fields: responseOptionalFields
		}
	})

/** `file_type` do upload_invoice_doc: 4 = XML (a NF-e autorizada). */
const INVOICE_FILE_XML = "4"

/**
 * POST /api/v2/order/upload_invoice_doc — o XML da NF-e do pedido (Brasil).
 *
 * Multipart, não JSON. A assinatura não muda: os parâmetros comuns continuam
 * na query, como em toda chamada de loja. A Shopee não devolve eco — quem
 * confirma é o `invoice_data` do get_order_detail.
 */
export const uploadInvoiceDoc = ({
	shopId,
	accessToken,
	orderSn,
	xml
}) => {
	const form = new FormData()

	form.append("order_sn", orderSn)
	form.append("file_type", INVOICE_FILE_XML)
	form.append("file", new Blob([xml], { type: "application/xml" }), `${orderSn}.xml`)

	return callShop({
		shopId,
		accessToken,
		method: "POST",
		path: "/api/v2/order/upload_invoice_doc",
		body: form
	})
}

/** GET /api/v2/logistics/get_tracking_number */
export const getTrackingNumber = ({
	shopId,
	accessToken,
	orderSn,
	packageNumber
}) =>
	callShop({
		shopId,
		accessToken,
		path: "/api/v2/logistics/get_tracking_number",
		params: {
			order_sn: orderSn,
			package_number: packageNumber
		}
	})
