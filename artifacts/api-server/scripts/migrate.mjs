import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function run(sql) {
  await client.query(sql);
}

try {
  await run(`DO $$ BEGIN CREATE TYPE site_status AS ENUM ('up', 'down', 'slow', 'unknown'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await run(`DO $$ BEGIN CREATE TYPE alert_type AS ENUM ('downtime', 'slow_response', 'recovery'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await run(`DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await run(`ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'cpu_high'`);
  await run(`ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'ram_high'`);
  await run(`ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'disk_high'`);
  await run(`ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'server_offline'`);
  await run(`ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'server_recovery'`);

  await run(`CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    username text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role user_role NOT NULL DEFAULT 'viewer',
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS servers (
    id serial PRIMARY KEY,
    name text NOT NULL,
    hostname text NOT NULL,
    api_key text NOT NULL UNIQUE,
    is_active boolean NOT NULL DEFAULT true,
    last_seen_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS server_metrics (
    id serial PRIMARY KEY,
    server_id integer NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    cpu_percent real NOT NULL,
    mem_used_bytes bigint NOT NULL,
    mem_total_bytes bigint NOT NULL,
    disk_used_bytes bigint NOT NULL,
    disk_total_bytes bigint NOT NULL,
    net_rx_bytes bigint NOT NULL,
    net_tx_bytes bigint NOT NULL,
    load_avg_1m real NOT NULL,
    load_avg_5m real NOT NULL,
    load_avg_15m real NOT NULL,
    recorded_at timestamp NOT NULL DEFAULT now()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sites (
    id serial PRIMARY KEY,
    name text NOT NULL,
    url text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    current_status site_status NOT NULL DEFAULT 'unknown',
    last_checked_at timestamp,
    last_response_time_ms integer,
    slow_threshold_ms integer NOT NULL DEFAULT 5000,
    consecutive_failures integer NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS check_results (
    id serial PRIMARY KEY,
    site_id integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    status_code integer,
    response_time_ms integer,
    is_up boolean NOT NULL,
    error_message text,
    checked_at timestamp NOT NULL DEFAULT now()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS alerts (
    id serial PRIMARY KEY,
    site_id integer REFERENCES sites(id) ON DELETE CASCADE,
    server_id integer REFERENCES servers(id) ON DELETE CASCADE,
    alert_type alert_type NOT NULL,
    message text NOT NULL,
    response_time_ms integer,
    status_code integer,
    email_sent boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS alert_config (
    id serial PRIMARY KEY,
    recipient_emails text NOT NULL DEFAULT '',
    sender_email text NOT NULL DEFAULT '',
    is_enabled boolean NOT NULL DEFAULT true,
    smtp_host text NOT NULL DEFAULT '',
    smtp_port integer NOT NULL DEFAULT 587,
    smtp_username text NOT NULL DEFAULT '',
    smtp_password text NOT NULL DEFAULT '',
    smtp_secure boolean NOT NULL DEFAULT false,
    slack_enabled boolean NOT NULL DEFAULT false,
    slack_webhook_url text NOT NULL DEFAULT '',
    slack_channel text NOT NULL DEFAULT '',
    whatsapp_enabled boolean NOT NULL DEFAULT false,
    whatsapp_api_token text NOT NULL DEFAULT '',
    whatsapp_phone_number_id text NOT NULL DEFAULT '',
    whatsapp_recipients text NOT NULL DEFAULT '',
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS server_alert_config (
    id serial PRIMARY KEY,
    is_enabled boolean NOT NULL DEFAULT true,
    cpu_threshold integer NOT NULL DEFAULT 90,
    ram_threshold integer NOT NULL DEFAULT 90,
    disk_threshold integer NOT NULL DEFAULT 95,
    offline_timeout_minutes integer NOT NULL DEFAULT 5,
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS magento_orders (
    id serial PRIMARY KEY,
    order_id integer NOT NULL UNIQUE,
    increment_id text NOT NULL,
    status text NOT NULL,
    grand_total real NOT NULL,
    currency text NOT NULL,
    customer_email text,
    customer_firstname text,
    customer_lastname text,
    items_count integer NOT NULL DEFAULT 0,
    store_id integer NOT NULL DEFAULT 0,
    order_created_at timestamp NOT NULL,
    synced_at timestamp NOT NULL DEFAULT now()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS magento_carts (
    id serial PRIMARY KEY,
    quote_id integer NOT NULL UNIQUE,
    customer_email text,
    customer_firstname text,
    customer_lastname text,
    is_active boolean NOT NULL DEFAULT true,
    items_count integer NOT NULL DEFAULT 0,
    grand_total real NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'EUR',
    store_id integer NOT NULL DEFAULT 0,
    cart_created_at timestamp NOT NULL,
    cart_updated_at timestamp NOT NULL,
    synced_at timestamp NOT NULL DEFAULT now()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS magento_sync_log (
    id serial PRIMARY KEY,
    sync_type text NOT NULL,
    status text NOT NULL,
    records_fetched integer NOT NULL DEFAULT 0,
    duration_ms integer NOT NULL DEFAULT 0,
    error text,
    synced_at timestamp NOT NULL DEFAULT now()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS magento_config (
    id serial PRIMARY KEY,
    api_url text NOT NULL DEFAULT '',
    admin_user text NOT NULL DEFAULT '',
    admin_pass text NOT NULL DEFAULT '',
    api_token text NOT NULL DEFAULT '',
    is_enabled boolean NOT NULL DEFAULT false,
    last_test_at timestamp,
    last_test_status text,
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await run(`INSERT INTO alert_config (is_enabled) SELECT true WHERE NOT EXISTS (SELECT 1 FROM alert_config LIMIT 1)`);
  await run(`INSERT INTO server_alert_config (is_enabled, cpu_threshold, ram_threshold, disk_threshold, offline_timeout_minutes) SELECT true, 90, 90, 95, 5 WHERE NOT EXISTS (SELECT 1 FROM server_alert_config LIMIT 1)`);

  const { rows: siteIdNull } = await client.query(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'site_id'`);
  if (siteIdNull.length > 0 && siteIdNull[0].is_nullable === "NO") {
    await run(`ALTER TABLE alerts ALTER COLUMN site_id DROP NOT NULL`);
  }

  const { rows: serverIdCol } = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'server_id'`);
  if (serverIdCol.length === 0) {
    await run(`ALTER TABLE alerts ADD COLUMN server_id integer REFERENCES servers(id) ON DELETE CASCADE`);
  }

  const { rows: roleCol } = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role'`);
  if (roleCol.length === 0) {
    await run(`ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'viewer'`);
  }

  const { rows: isAdminCol } = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_admin'`);
  if (isAdminCol.length > 0) {
    await run(`UPDATE users SET role = 'admin' WHERE is_admin = true AND role = 'viewer'`);
    await run(`ALTER TABLE users DROP COLUMN is_admin`);
  }

  console.log("Migration completed successfully");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await client.end();
}
