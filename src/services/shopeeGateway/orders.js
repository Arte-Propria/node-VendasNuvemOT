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
