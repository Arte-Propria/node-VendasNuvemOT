import { dataBase, dataBaseDb } from "../db/dataBaseQueryList.js"


// 1. Função para realizar o MAP dos itens, com base em qual query será acessada
// o parametro querySelect será usado para:
// - fazer o fetch;
// - usando switch case, o querySelect vai definir qual caso será usado para a requisição 
export const fetchRequest = async (queryData, querySelect) => {
  let allRequests = []

  try {
    const response = queryData

    const result = response.rows.map((delivery) => {
      // o objeto dataBase possui o nome de cada banco de dados
      // o objeto dataBaseDb engloba cada caso a ser usado pelo map
      switch (querySelect) {
        case dataBase.ads:
          return dataBaseDb.ads.transform(delivery)

        case dataBase.clients:
          return dataBaseDb.clients.transform(delivery)

        case dataBase.coupon:
          return dataBaseDb.coupon.transform(delivery)

        case dataBase.daily_sales:
          return dataBaseDb.daily_sales.transform(delivery)

        case dataBase.orders_shop:
          return dataBaseDb.orders_shop.transform(delivery)

        case dataBase.product:
          return dataBaseDb.product.transform(delivery)

        default:
          console.log("Database desconhecida");
      }
    })

    allRequests = allRequests.concat(result)

    return allRequests || []
  } catch (error) {
    console.error("Error fetching data from Query", error.message)
    return []
  }
}