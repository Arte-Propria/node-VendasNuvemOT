export function isOrderFromToday(orderCreatedAt) {
	const orderDate = new Date(orderCreatedAt)
	const today = new Date()

	// Convertendo a data do pedido para o fuso horário local
	const orderDateLocal = new Date(orderDate.getTime() - orderDate.getTimezoneOffset() * 60000)

	return (
		orderDateLocal.getFullYear() === today.getFullYear() &&
    orderDateLocal.getMonth() === today.getMonth() &&
    orderDateLocal.getDate() === today.getDate()
	)
}
