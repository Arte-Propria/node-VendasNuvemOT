import { callShop } from "./client.js"

/**
 * Operações de catálogo (produto/modelo). O 3print baixa o catálogo da loja
 * para criar um produto por variação e fazer o de/para de SKU.
 */

/** GET /api/v2/product/get_item_list — `item_status` é parâmetro repetido. */
export const getItemList = ({
	shopId,
	accessToken,
	offset,
	pageSize,
	itemStatus
}) =>
	callShop({
		shopId,
		accessToken,
		path: "/api/v2/product/get_item_list",
		params: {
			offset,
			page_size: pageSize,
			item_status: itemStatus
		}
	})

/** GET /api/v2/product/get_item_base_info — até 50 anúncios por chamada. */
export const getItemBaseInfo = ({ shopId, accessToken, itemIdList }) =>
	callShop({
		shopId,
		accessToken,
		path: "/api/v2/product/get_item_base_info",
		params: {
			item_id_list: itemIdList.join(",")
		}
	})

/** GET /api/v2/product/get_model_list — variações de um anúncio. */
export const getModelList = ({ shopId, accessToken, itemId }) =>
	callShop({
		shopId,
		accessToken,
		path: "/api/v2/product/get_model_list",
		params: {
			item_id: itemId
		}
	})
