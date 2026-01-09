export const dataBase = {
  ads: 'ads',
  clients: 'clients',
  coupon: 'coupon',
  daily_sales: 'daily_sales',
  orders_shop: 'orders_shop',
  product: 'product',
}

export const dataBaseDb = {
  ads: {
    transform: (delivery) => ({
      id_ads: delivery.id_ads,
      date_ads: delivery.date_ads,
      plataform: delivery.plataform,
      funding_ecom: delivery.funding_ecom,
      funding_store: delivery.funding_store,
      funding_general: delivery.funding_general,
      funding_chatbot: delivery.funding_chatbot,
      funding_insta: delivery.funding_insta,
      funding_mirror: delivery.funding_mirror,
      funding_painting: delivery.funding_painting,
      active: delivery.active
    })
  },
  clients: {
    transform: (delivery) => ({
      id_cli: delivery.id_cli,
      cpf_cnpj_cli: delivery.cpf_cnpj_cli,
      nome_cli: delivery.nome_cli,
      email_cli: delivery.email_cli,
      fone_cli: delivery.fone_cli,
      tipo_cli: delivery.tipo_cli,
      bairro_cli: delivery.bairro_cli,
      cidade_cli: delivery.cidade_cli,
      numero_cli: delivery.numero_cli,
      uf_cli: delivery.uf_cli,
      cep_cli: delivery.cep_cli,
      endereco_cli: delivery.endereco_cli,
      dt_criacao_cli: delivery.dt_criacao_cli,
      ativo: delivery.ativo,
      dt_att_ativo: delivery.dt_att_ativo,
      origem_cli: delivery.origem_cli,
    })
  },
  coupon: {
    transform: (delivery) => ({
      id_coupon: delivery.id_coupon,
      date_coupon: delivery.date_coupon,
      name: delivery.name,
      quantity: delivery.quantity,
      total_money: delivery.total_money,
      total_discount: delivery.total_discount,
      order_ids: delivery.order_ids,
    })
  },
  daily_sales: {
    transform: (delivery) => ({
      id_sales: delivery.id_sales,
      date_sales: delivery.date_sales,
      total_orders: delivery.total_orders,
      total_paid_orders: delivery.total_paid_orders,
      total_money: delivery.total_money,
      total_paid_money: delivery.total_paid_money,
      aov: delivery.aov,
      id_ads: delivery.id_ads,
      store: delivery.store,
      id_orders: delivery.id_orders,
      id_coupons: delivery.id_coupons,
      active: delivery.active,
      dt_att_active: delivery.dt_att_active,
      created_at: delivery.created_at,
      updated_at: delivery.updated_at
    }),
  },
  orders_shop: {
    transform: (delivery) => ({
      order_id: delivery.order_id,
      client: delivery.client,
      store: delivery.store,
      total: delivery.total,
      subtotal: delivery.subtotal,
      payment_status: delivery.payment_status,
      coupons: delivery.coupons,
      coupon_discount: delivery.coupon_discount,
      products: delivery.products,
      shipping_option: delivery.shipping_option,
      created_at: delivery.created_at,
      paid_at: delivery.paid_at,
      updated_at: delivery.updated_at,
      active: delivery.active,
    })
  },
  product: {
    transform: (delivery) => ({
      id_product: delivery.id_product,
      sku: delivery.sku,
      description: delivery.description,
      quantity: delivery.quantity,
      price: delivery.price,
      image: delivery.image,
    })
  },
}
