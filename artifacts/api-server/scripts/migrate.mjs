import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("BEGIN");

  const { rows: enumCheck } = await client.query(
    `SELECT 1 FROM pg_type WHERE typname = 'user_role'`
  );
  if (enumCheck.length === 0) {
    await client.query(`CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer')`);
  }

  const { rows: colCheck } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role'`
  );
  if (colCheck.length === 0) {
    await client.query(`ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'viewer'`);
  }

  const { rows: isAdminCol } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_admin'`
  );
  if (isAdminCol.length > 0) {
    await client.query(`UPDATE users SET role = 'admin' WHERE is_admin = true AND role = 'viewer'`);
    await client.query(`UPDATE users SET role = 'editor' WHERE is_admin = false AND role = 'viewer'`);
    await client.query(`ALTER TABLE users DROP COLUMN is_admin`);
  }

  const alertEnumValues = ["cpu_high", "ram_high", "disk_high", "server_offline", "server_recovery"];
  for (const val of alertEnumValues) {
    const { rows } = await client.query(
      `SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'alert_type' AND enumlabel = $1`,
      [val]
    );
    if (rows.length === 0) {
      await client.query(`COMMIT`);
      await client.query(`ALTER TYPE alert_type ADD VALUE IF NOT EXISTS '${val}'`);
      await client.query(`BEGIN`);
    }
  }

  const { rows: siteIdNull } = await client.query(
    `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'site_id'`
  );
  if (siteIdNull.length > 0 && siteIdNull[0].is_nullable === "NO") {
    await client.query(`ALTER TABLE alerts ALTER COLUMN site_id DROP NOT NULL`);
  }

  const { rows: serverIdCol } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'server_id'`
  );
  if (serverIdCol.length === 0) {
    await client.query(
      `ALTER TABLE alerts ADD COLUMN server_id integer REFERENCES servers(id) ON DELETE CASCADE`
    );
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS server_alert_config (
      id serial PRIMARY KEY,
      is_enabled boolean NOT NULL DEFAULT true,
      cpu_threshold integer NOT NULL DEFAULT 90,
      ram_threshold integer NOT NULL DEFAULT 90,
      disk_threshold integer NOT NULL DEFAULT 95,
      offline_timeout_minutes integer NOT NULL DEFAULT 5,
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    INSERT INTO server_alert_config (is_enabled, cpu_threshold, ram_threshold, disk_threshold, offline_timeout_minutes)
    SELECT true, 90, 90, 95, 5
    WHERE NOT EXISTS (SELECT 1 FROM server_alert_config LIMIT 1)
  `);

  await client.query("COMMIT");
  console.log("Migration completed successfully");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await client.end();
}
