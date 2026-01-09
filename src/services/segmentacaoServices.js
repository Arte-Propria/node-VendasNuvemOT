import axios from "axios"
import dotenv from "dotenv"
import { query } from "../db/db.js"
import { dataBase, dataBaseDb } from "../db/dataBaseQueryList.js"

export async function queryDb(querySelect) {
  try {
    const response = await query(`SELECT * FROM ${querySelect}`)
    return response
  } catch (error) {
    console.error("Error fetching data from Query", error.message)
    return []
  }
}

// 1. Função para realizar o fetch
export const fetchRequest = async (querySelect) => {
  let allRequests = []

  try {
    const response = await queryDb(querySelect)

    const result = response.rows.map((delivery) => {
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