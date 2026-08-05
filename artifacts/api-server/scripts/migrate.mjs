import pg from "pg";
import bcrypt from "bcryptjs";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log("Connected to database");

async function run(label, sql) {
  try {
    await client.query(sql);
    console.log(`  OK: ${label}`);
  } catch (err) {
    console.error(`  FAIL: ${label} — ${err.message}`);
    throw err;
  }
}

try {
  await run("site_status enum",
    `CREATE TYPE site_status AS ENUM ('up', 'down', 'slow', 'unknown')`
  ).catch(e => { if (e.code === '42710') console.log("  (already exists)"); else throw e; });

  await run("alert_type enum",
    `CREATE TYPE alert_type AS ENUM ('downtime', 'slow_response', 'recovery')`
  ).catch(e => { if (e.code === '42710') console.log("  (already exists)"); else throw e; });

  await run("user_role enum",
    `CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer')`
  ).catch(e => { if (e.code === '42710') console.log("  (already exists)"); else throw e; });

  for (const val of ["cpu_high", "ram_high", "disk_high", "server_offline", "server_recovery"]) {
    await run(`alert_type += ${val}`,
      `ALTER TYPE alert_type ADD VALUE IF NOT EXISTS '${val}'`
    );
  }

  await run("users table", `CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    username text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role user_role NOT NULL DEFAULT 'viewer',
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await run("servers table", `CREATE TABLE IF NOT EXISTS servers (
    id serial PRIMARY KEY,
    name text NOT NULL,
    hostname text NOT NULL,
    api_key text NOT NULL UNIQUE,
    is_active boolean NOT NULL DEFAULT true,
    last_seen_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await run("server_metrics table", `CREATE TABLE IF NOT EXISTS server_metrics (
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

  await run("server_log_snapshots table", `CREATE TABLE IF NOT EXISTS server_log_snapshots (
    id serial PRIMARY KEY,
    server_id integer NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    logs jsonb NOT NULL,
    recorded_at timestamp NOT NULL DEFAULT now()
  )`);

  await run("sites table", `CREATE TABLE IF NOT EXISTS sites (
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

  await run("check_results table", `CREATE TABLE IF NOT EXISTS check_results (
    id serial PRIMARY KEY,
    site_id integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    status_code integer,
    response_time_ms integer,
    is_up boolean NOT NULL,
    error_message text,
    checked_at timestamp NOT NULL DEFAULT now()
  )`);

  await run("alerts table", `CREATE TABLE IF NOT EXISTS alerts (
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

  await run("alert_config table", `CREATE TABLE IF NOT EXISTS alert_config (
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
    slack_bot_token text NOT NULL DEFAULT '',
    slack_channel text NOT NULL DEFAULT '',
    whatsapp_enabled boolean NOT NULL DEFAULT false,
    whatsapp_api_token text NOT NULL DEFAULT '',
    whatsapp_phone_number_id text NOT NULL DEFAULT '',
    whatsapp_recipients text NOT NULL DEFAULT '',
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await run("server_alert_config table", `CREATE TABLE IF NOT EXISTS server_alert_config (
    id serial PRIMARY KEY,
    is_enabled boolean NOT NULL DEFAULT true,
    cpu_threshold integer NOT NULL DEFAULT 90,
    ram_threshold integer NOT NULL DEFAULT 90,
    disk_threshold integer NOT NULL DEFAULT 95,
    offline_timeout_minutes integer NOT NULL DEFAULT 5,
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await run("magento_orders table", `CREATE TABLE IF NOT EXISTS magento_orders (
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

  await run("magento_carts table", `CREATE TABLE IF NOT EXISTS magento_carts (
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

  await run("magento_sync_log table", `CREATE TABLE IF NOT EXISTS magento_sync_log (
    id serial PRIMARY KEY,
    sync_type text NOT NULL,
    status text NOT NULL,
    records_fetched integer NOT NULL DEFAULT 0,
    duration_ms integer NOT NULL DEFAULT 0,
    error text,
    synced_at timestamp NOT NULL DEFAULT now()
  )`);

  await run("magento_config table", `CREATE TABLE IF NOT EXISTS magento_config (
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

  await run("google_oauth_config table", `CREATE TABLE IF NOT EXISTS google_oauth_config (
    id serial PRIMARY KEY,
    client_id text NOT NULL DEFAULT '',
    client_secret text NOT NULL DEFAULT '',
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await run("health_report_config table", `CREATE TABLE IF NOT EXISTS health_report_config (
    id serial PRIMARY KEY,
    payment_gateways jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  for (const col of [
    { name: "company_name", type: "text NOT NULL DEFAULT 'Love Furniture'" },
    { name: "ie_payment_gateways", type: "jsonb NOT NULL DEFAULT '[]'::jsonb" },
    { name: "uk_payment_gateways", type: "jsonb NOT NULL DEFAULT '[]'::jsonb" },
  ]) {
    const { rows: exists } = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'health_report_config' AND column_name = $1`,
      [col.name]
    );
    if (exists.length === 0) {
      await run(`health_report_config.${col.name}`, `ALTER TABLE health_report_config ADD COLUMN ${col.name} ${col.type}`);
    }
  }

  await run("google_analytics_tokens table", `CREATE TABLE IF NOT EXISTS google_analytics_tokens (
    id serial PRIMARY KEY,
    access_token text NOT NULL,
    refresh_token text,
    expires_at timestamp NOT NULL,
    ga_property_id text,
    email text,
    created_at timestamp NOT NULL DEFAULT now()
  )`);

  await run("deployment_status enum",
    `CREATE TYPE deployment_status AS ENUM ('running', 'successful', 'failed', 'canceled', 'unknown')`
  ).catch(e => { if (e.code === '42710') console.log("  (already exists)"); else throw e; });

  await run("deployment_systems table", `CREATE TABLE IF NOT EXISTS deployment_systems (
    id serial PRIMARY KEY,
    system_key text NOT NULL UNIQUE,
    name text NOT NULL,
    provider text NOT NULL DEFAULT 'gitlab',
    project_path text,
    default_environment text NOT NULL DEFAULT 'production',
    webhook_secret_hash text,
    is_active boolean NOT NULL DEFAULT true,
    last_webhook_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await run("deployments table", `CREATE TABLE IF NOT EXISTS deployments (
    id serial PRIMARY KEY,
    system_id integer NOT NULL REFERENCES deployment_systems(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'gitlab',
    provider_deployment_id text NOT NULL,
    environment text NOT NULL DEFAULT 'production',
    status deployment_status NOT NULL DEFAULT 'unknown',
    ref_name text,
    commit_sha text,
    release_tag text,
    summary text,
    deployer_name text,
    pipeline_id text,
    pipeline_url text,
    started_at timestamp,
    completed_at timestamp,
    duration_ms integer,
    deployed_at timestamp NOT NULL DEFAULT now(),
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT deployments_provider_deployment_unique UNIQUE (provider, provider_deployment_id)
  )`);

  await run("seed deployment systems", `INSERT INTO deployment_systems (system_key, name)
    VALUES
      ('magento', 'Magento'),
      ('odoo', 'Odoo'),
      ('phone-server', 'Phone Server')
    ON CONFLICT (system_key) DO NOTHING`);

  await run("seed google_oauth_config", `INSERT INTO google_oauth_config (client_id, client_secret) SELECT '', '' WHERE NOT EXISTS (SELECT 1 FROM google_oauth_config LIMIT 1)`);
  await run("seed health_report_config", `INSERT INTO health_report_config (payment_gateways) SELECT '[]'::jsonb WHERE NOT EXISTS (SELECT 1 FROM health_report_config LIMIT 1)`);

  await client.query(`
    UPDATE health_report_config
    SET ie_payment_gateways = payment_gateways
    WHERE jsonb_array_length(payment_gateways) > 0
      AND jsonb_array_length(ie_payment_gateways) = 0
      AND jsonb_array_length(uk_payment_gateways) = 0
  `);
  console.log("  OK: backfill ie_payment_gateways from legacy payment_gateways if needed");

  await run("seed alert_config", `INSERT INTO alert_config (is_enabled) SELECT true WHERE NOT EXISTS (SELECT 1 FROM alert_config LIMIT 1)`);
  await run("seed server_alert_config", `INSERT INTO server_alert_config (is_enabled, cpu_threshold, ram_threshold, disk_threshold, offline_timeout_minutes) SELECT true, 90, 90, 95, 5 WHERE NOT EXISTS (SELECT 1 FROM server_alert_config LIMIT 1)`);
  await run("seed magento_config", `INSERT INTO magento_config (is_enabled) SELECT false WHERE NOT EXISTS (SELECT 1 FROM magento_config LIMIT 1)`);

  if (process.env.MAGENTO_API_URL) {
    const { rows: mc } = await client.query(`SELECT api_url FROM magento_config LIMIT 1`);
    if (mc.length > 0 && (!mc[0].api_url || mc[0].api_url === '')) {
      const apiUrl = process.env.MAGENTO_API_URL || '';
      const adminUser = process.env.MAGENTO_ADMIN_USER || '';
      const adminPass = process.env.MAGENTO_ADMIN_PASS || '';
      const apiToken = process.env.MAGENTO_API_TOKEN || '';
      const hasAnyCreds = apiToken || (adminUser && adminPass);
      if (apiUrl && hasAnyCreds) {
        await client.query(
          `UPDATE magento_config SET api_url = $1, admin_user = $2, admin_pass = $3, api_token = $4, is_enabled = true WHERE api_url IS NULL OR api_url = ''`,
          [apiUrl, adminUser, adminPass, apiToken]
        );
        console.log("  OK: populated magento_config from environment variables");
      }
    }
  }

  const { rows: existingUsers } = await client.query(`SELECT 1 FROM users LIMIT 1`);
  if (existingUsers.length === 0) {
    const hash = await bcrypt.hash("admin123", 10);
    await client.query(`INSERT INTO users (username, password_hash, role) VALUES ('admin', $1, 'admin')`, [hash]);
    console.log("  OK: seed default admin user (admin / admin123)");
  }

  const newMetricCols = [
    { name: "process_count", type: "integer" },
    { name: "connection_count", type: "integer" },
    { name: "http_connection_count", type: "integer" },
    { name: "top_processes", type: "jsonb" },
    { name: "php_fpm", type: "jsonb" },
    { name: "mysql_stats", type: "jsonb" },
    { name: "nginx", type: "jsonb" },
    { name: "varnish", type: "jsonb" },
    { name: "elasticsearch", type: "jsonb" },
    { name: "ssl_expiry", type: "jsonb" },
  ];
  for (const col of newMetricCols) {
    const { rows: colExists } = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'server_metrics' AND column_name = $1`,
      [col.name]
    );
    if (colExists.length === 0) {
      await run(`server_metrics.${col.name}`, `ALTER TABLE server_metrics ADD COLUMN ${col.name} ${col.type}`);
    }
  }

  const { rows: siteIdNull } = await client.query(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'site_id'`);
  if (siteIdNull.length > 0 && siteIdNull[0].is_nullable === "NO") {
    await run("alerts.site_id nullable", `ALTER TABLE alerts ALTER COLUMN site_id DROP NOT NULL`);
  }

  const { rows: serverIdCol } = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'server_id'`);
  if (serverIdCol.length === 0) {
    await run("alerts.server_id column", `ALTER TABLE alerts ADD COLUMN server_id integer REFERENCES servers(id) ON DELETE CASCADE`);
  }

  const { rows: roleCol } = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role'`);
  if (roleCol.length === 0) {
    await run("users.role column", `ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'viewer'`);
  }

  const { rows: isAdminCol } = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_admin'`);
  if (isAdminCol.length > 0) {
    await run("migrate is_admin to role", `UPDATE users SET role = 'admin' WHERE is_admin = true AND role = 'viewer'`);
    await run("drop is_admin", `ALTER TABLE users DROP COLUMN is_admin`);
  }

  const { rows: slackWebhookCol } = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'alert_config' AND column_name = 'slack_webhook_url'`);
  if (slackWebhookCol.length > 0) {
    await run("rename slack_webhook_url to slack_bot_token", `ALTER TABLE alert_config RENAME COLUMN slack_webhook_url TO slack_bot_token`);
  }
  const { rows: slackBotCol } = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'alert_config' AND column_name = 'slack_bot_token'`);
  if (slackBotCol.length === 0) {
    await run("add slack_bot_token", `ALTER TABLE alert_config ADD COLUMN slack_bot_token text NOT NULL DEFAULT ''`);
  }

  const { rows: existingSites } = await client.query(`SELECT 1 FROM sites LIMIT 1`);
  if (existingSites.length === 0) {
    await run("seed Love Furniture IE", `INSERT INTO sites (name, url, is_active, slow_threshold_ms) VALUES ('Love Furniture IE', 'https://www.lovefurniture.ie/', true, 5000)`);
    await run("seed Love Furniture UK", `INSERT INTO sites (name, url, is_active, slow_threshold_ms) VALUES ('Love Furniture UK', 'https://www.lovefurniture.co.uk/', true, 5000)`);
  }

  console.log("Migration completed successfully");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await client.end();
}
