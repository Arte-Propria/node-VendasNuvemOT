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

export const ordersDbNuvemshop = {
  client: {
    name: nuvemshopOrder.contact_name || nuvemshopOrder.customer?.name,
    email: nuvemshopOrder.contact_email,
    phone: nuvemshopOrder.contact_phone,
    cpfCnpj: nuvemshopOrder.contact_identification,
    address: nuvemshopOrder.billing_address,
    number: nuvemshopOrder.billing_number,
    complement: nuvemshopOrder.billing_floor,
    neighborhood: nuvemshopOrder.billing_locality,
    city: nuvemshopOrder.billing_city,
    state: nuvemshopOrder.billing_province,
    zip: nuvemshopOrder.billing_zipcode,
    type: nuvemshopOrder.billing_customer_type || (nuvemshopOrder.contact_identification?.length === 11 ? 'F' : 'J'),
  },
  // Produtos
  products: (nuvemshopOrder.products || []).map(p => ({
    sku: p.sku,
    name: p.name,
    quantity: parseInt(p.quantity) || 1,
    price: parseFloat(p.price) || 0,
    image: p.image?.src,
  })),
  // Cupons
  coupons: (nuvemshopOrder.coupon || []).map(c => ({
    code: c.code,
    type: c.type,
    value: parseFloat(c.value) || 0,
    discount: parseFloat(nuvemshopOrder.discount_coupon) || 0,
  })),
}

export const ordersDbTiny = {
  client: {
    name: pedido.cliente?.nome,
    email: pedido.cliente?.email,
    phone: pedido.cliente?.fone,
    cpfCnpj: pedido.cliente?.cpf_cnpj?.replace(/\D/g, ''),
    address: pedido.cliente?.endereco,
    number: pedido.cliente?.numero,
    complement: pedido.cliente?.complemento,
    neighborhood: pedido.cliente?.bairro,
    city: pedido.cliente?.cidade,
    state: pedido.cliente?.uf,
    zip: pedido.cliente?.cep?.replace(/\D/g, ''),
    type: pedido.cliente?.tipo_pessoa, // 'F' ou 'J'
  },
  // Produtos
  products: (pedido.itens || []).map(i => ({
    sku: i.item.codigo,
    name: i.item.descricao,
    quantity: parseFloat(i.item.quantidade) || 1,
    price: parseFloat(i.item.valor_unitario) || 0,
    image: null, // Tiny não retorna imagem no webhook
  })),
}

// helpers.js - Funções utilitárias para limpeza e formatação
const cleanCpfCnpj = (value) => (value || '').replace(/[^\d]/g, '');
const cleanPhone = (value) => (value || '').replace(/[^\d+]/g, '');
const extractOrderNumber = (tinyData) => {
  // Tenta extrair o número do pedido (usado como chave) nos dados da Tiny
  const pedido = tinyData.retorno.pedido;
  return pedido.numero_ecommerce || pedido.numero_ordem_compra || pedido.ecommerce?.numeroPedidoEcommerce || null;
};

// Mapeamento Nuvemshop -> Tabelas
function mapNuvemshopToTables(nuvemData) {
  const orderNumber = nuvemData.number;  // identificador único do pedido
  const now = new Date().toISOString();

  // Cliente
  const cliente = nuvemData.customer || {};
  const clienteId = cleanCpfCnpj(cliente.identification) || cliente.email || `temp_${orderNumber}`;
  const clienteObj = {
    id_cli: clienteId,
    cpf_cnpj_cli: cleanCpfCnpj(cliente.identification),
    nome_cli: cliente.name || nuvemData.contact_name,
    email_cli: cliente.email || nuvemData.contact_email,
    fone_cli: cleanPhone(cliente.phone || nuvemData.contact_phone),
    tipo_cli: (cliente.identification && cliente.identification.length > 11) ? 'J' : 'F', // heuristic
    endereco_cli: cliente.billing_address || cliente.default_address?.address,
    numero_cli: cliente.billing_number || cliente.default_address?.number,
    bairro_cli: cliente.billing_locality || cliente.default_address?.locality,
    cidade_cli: cliente.billing_city || cliente.default_address?.city,
    uf_cli: cliente.billing_province || cliente.default_address?.province,
    cep_cli: (cliente.billing_zipcode || cliente.default_address?.zipcode)?.replace(/\D/g, ''),
    dt_criacao_cli: cliente.created_at || nuvemData.created_at,
    ativo: true,
    dt_att_ativo: now,
    origem_cli: nuvemData.customer_visit?.utm_parameters?.utm_source || null,
  };

  // Produtos
  const produtos = (nuvemData.products || []).map(prod => ({
    id_product: prod.sku || `prod_${prod.id}`,
    sku: prod.sku,
    description: prod.name,
    quantity: parseInt(prod.quantity, 10) || 1,
    price: parseFloat(prod.price) || 0,
    image: prod.image?.src || null,
  }));

  // Cupons
  const cupons = (nuvemData.coupon || []).map(c => ({
    id_coupons: c.id,
    date: nuvemData.created_at,
    name: c.code,
    quantity: c.used, // ou 1 por pedido, dependendo do contexto
    value: parseFloat(c.value) || 0,
    discount: parseFloat(nuvemData.discount_coupon) || 0,
    order_ids: [orderNumber],
  }));

  // Pedido
  const orderObj = {
    order_id: orderNumber,
    id_cli: clienteId,
    store: store_id === 3889735 ? "outlet" : store_id === 1146504 ? "artepropria" : "",
    total: parseFloat(nuvemData.total) || 0,
    subtotal: parseFloat(nuvemData.subtotal) || 0,
    payment_status: nuvemData.payment_status || null,
    coupons: (nuvemData.coupon || []).map(c => c.code),
    coupon_discount: parseFloat(nuvemData.discount_coupon) || 0,
    products: produtos.map(p => p.id_product),
    shipping_option: nuvemData.shipping_option || null,
    created_at: now,
    paid_at: nuvemData.paid_at || null,
    updated_at: now,
    active: true,
  };

  return {
    orders_shop: [orderObj],
    coupons: cupons,
    product: produtos,
    clients: [clienteObj],
  };
}

// Mapeamento Tiny -> Tabelas
function mapTinyToTables(tinyData) {
  const pedido = tinyData.retorno.pedido;
  const orderNumber = extractOrderNumber(tinyData);
  if (!orderNumber) throw new Error('Número do pedido não encontrado no Tiny');
  const now = new Date().toISOString();

  // Cliente
  const c = pedido.cliente;
  const clienteId = cleanCpfCnpj(c.cpf_cnpj) || c.email || `temp_${orderNumber}`;
  const clienteObj = {
    id_cli: clienteId,
    cpf_cnpj_cli: cleanCpfCnpj(c.cpf_cnpj),
    nome_cli: c.nome,
    email_cli: c.email,
    fone_cli: cleanPhone(c.fone),
    tipo_cli: c.tipo_pessoa, // 'F' ou 'J'
    endereco_cli: c.endereco,
    numero_cli: c.numero,
    bairro_cli: c.bairro,
    cidade_cli: c.cidade,
    uf_cli: c.uf,
    cep_cli: c.cep?.replace(/\D/g, ''),
    dt_criacao_cli: pedido.data_pedido, // formato dd/mm/aaaa
    ativo: true,
    dt_att_ativo: now,
    origem_cli: null, // Tiny não tem origem
  };

  // Produtos
  const produtos = (pedido.itens || []).map(item => ({
    id_product: item.item.codigo || `prod_${item.item.id_produto}`,
    sku: item.item.codigo,
    description: item.item.descricao,
    quantity: parseFloat(item.item.quantidade) || 1,
    price: parseFloat(item.item.valor_unitario) || 0,
    image: null, // Tiny não tem imagem no pedido
  }));

  // Pedido
  const orderObj = {
    order_id: orderNumber,
    id_cli: clienteId,
    store: pedido.ecommerce?.nomeEcommerce || null,
    total: parseFloat(pedido.total_pedido) || 0,
    subtotal: parseFloat(pedido.total_produtos) || 0,
    payment_status: null, // Tiny não tem status de pagamento explícito
    coupons: cupons.map(c => c.name),
    coupon_discount: parseFloat(pedido.valor_desconto) || 0,
    products: produtos.map(p => p.id_product),
    shipping_option: pedido.forma_envio || pedido.forma_frete || null,
    created_at: now,
    paid_at: null, // pode ser derivado da primeira parcela
    updated_at: now,
    active: true,
  };

  // Ads (não disponível)
  const ads = [];

  return {
    orders_shop: [orderObj],
    product: produtos,
    clients: [clienteObj],
  };
}

// Exemplo de uso integrado (simulação)
//const nuvemResponse = { ... }; // cole aqui o JSON da Nuvemshop
//const tinyResponse = { ... };   // cole aqui o JSON da Tiny

const nuvemTables = mapNuvemshopToTables(nuvemResponse);
const tinyTables = mapTinyToTables(tinyResponse);

// Para unificar, você pode combinar os dados (ex: usar o número do pedido como chave)
const combinedOrders = [...nuvemTables.orders_shop, ...tinyTables.orders_shop];
const combinedProducts = [...nuvemTables.product, ...tinyTables.product];
const combinedClients = [...nuvemTables.clients, ...tinyTables.clients];
const combinedCoupons = [...nuvemTables.coupons, ...tinyTables.coupons];

console.log('Orders:', combinedOrders);
console.log('Products:', combinedProducts);
console.log('Clients:', combinedClients);
console.log('Coupons:', combinedCoupons);