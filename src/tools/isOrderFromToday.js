export function isOrderFromToday(orderCreatedAt) {
	const orderDate = new Date(orderCreatedAt)
	const today = new Date()

	return (
		orderDate.getFullYear() === today.getFullYear() &&
    orderDate.getMonth() === today.getMonth() &&
    orderDate.getDate() === today.getDate()
	)
}
