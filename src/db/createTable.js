import { query } from "./db.js"

const createTable = async () => {
	const queryText = `
    CREATE TABLE pedidos_artepropria (
      weight numeric,
      app_id integer,
      attributes jsonb,
      cancelled_at timestamp without time zone,
      checkout_enabled boolean,
      client_details jsonb,
      closed_at timestamp without time zone,
      completed_at jsonb,
      coupon jsonb,
      created_at timestamp without time zone,
      customer jsonb,
      customer_visit jsonb,
      discount numeric,
      discount_coupon numeric,
      discount_gateway numeric,
      extra jsonb,
      free_shipping_config jsonb,
      fulfillments jsonb,
      has_shippable_products boolean,
      order_id bigint UNIQUE,
      number integer,
      paid_at timestamp without time zone,
      payment_count integer,
      payment_details jsonb,
      products jsonb,
      promotional_discount jsonb,
      read_at timestamp without time zone,
      same_billing_and_shipping_address boolean,
      shipped_at timestamp without time zone,
      shipping_address jsonb,
      shipping_cost_customer numeric,
      shipping_cost_owner numeric,
      shipping_max_days integer,
      shipping_min_days integer,
      shipping_pickup_details jsonb,
      shipping_store_branch_extra jsonb,
      shipping_suboption jsonb,
      store_id integer,
      subtotal numeric,
      total numeric,
      total_usd numeric,
      updated_at timestamp without time zone,
      id integer,
      shipping_carrier_name character varying,
      shipping_store_branch_name character varying,
      landing_url text,
      language character varying,
      next_action character varying,
      billing_address character varying,
      billing_business_name character varying,
      billing_city character varying,
      billing_country character varying,
      billing_customer_type character varying,
      billing_document_type character varying,
      billing_floor character varying,
      billing_locality character varying,
      billing_name character varying,
      billing_number character varying,
      billing_phone character varying,
      billing_province character varying,
      billing_state_registration character varying,
      billing_trade_name character varying,
      billing_zipcode character varying,
      cancel_reason text,
      note text,
      storefront character varying,
      order_origin character varying,
      owner_note text,
      shipping_tracking_number character varying,
      contact_email character varying,
      contact_identification character varying,
      contact_name character varying,
      contact_phone character varying,
      shipping_tracking_url text,
      shipping_option character varying,
      currency character varying,
      payment_status character varying,
      shipping_option_code character varying,
      shipping_option_reference text,
      status character varying,
      shipping_pickup_type character varying,
      shipping_status character varying,
      shipping character varying,
      token character varying,
      gateway character varying,
      gateway_id character varying,
      gateway_link text,
      gateway_name character varying
    );
  `

	try {
		await query(queryText)
		console.log("Tabela criada com sucesso")
	} catch (err) {
		console.error("Erro ao criar tabela", err)
	}
}

// createTable().then(() => process.exit())

const createTableRefund = async () => {
	const queryText = `
  CREATE TABLE reembolsos_artepropria (
    id SERIAL PRIMARY KEY,
    order_id int UNIQUE,
    category VARCHAR(50),
    total numeric,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
    );
    `
    
	try {
		await query(queryText)
		console.log("Tabela reembolsos_artepropria criada com sucesso")
	} catch (err) {
		console.error("Erro ao criar tabela", err)
	}
}

const createTableSheinTokens = async () => {
	const queryText = `
		CREATE TABLE shein_tokens (
			id SERIAL PRIMARY KEY,
			access_token TEXT NOT NULL,
			refresh_token TEXT NOT NULL,
			expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
			scope TEXT,
			created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
	`
	
	try {
		await query(queryText)
		console.log("Tabela shein_tokens criada com sucesso")
	} catch (err) {
		console.error("Erro ao criar tabela shein_tokens", err)
	}
}

// createTableRefund().then(() => process.exit())
createTableSheinTokens().then(() => process.exit())