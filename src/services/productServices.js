import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

export const fetchProducts = async () => {
	const code = process.env.ACCESS_TOKEN
	const storeId = process.env.STORE_ID
	let url = `https://api.tiendanube.com/v1/${storeId}/products`
	let allProducts = []
	console.log("Recuperando dados dos produtos...")

	while (url) {
		const response = await axios({
			method: "get",
			url: url,
			headers: {
				"Authentication": `bearer ${code}`,
				"User-Agent": "API-NuvemShop (lucasecom@artepropria.com)",
				"Content-Type": "application/json"
			}
		})

		const data = response.data

		const products = data.map((element) => {
			const skuFull = element.variants[0].sku
			const sku = skuFull ? skuFull.split("-")[0] : "sem_sku"

			return {
				id: element.id,
				name: element.name.pt,
				sku,
				images: element.images,
				variants: element.variants,
				published: element.published
			}
		})

		allProducts = allProducts.concat(products) // Combine produtos de todas as páginas

		// Verifique o cabeçalho "Link" para a próxima página
		const linkHeader = response.headers.link
		const nextLinkMatch = /<([^>]+)>;\s*rel="next"/.exec(linkHeader)

		if (nextLinkMatch) {
			url = nextLinkMatch[1]
		} else {
			url = null // Não há mais páginas
		}
	}

	return allProducts
}