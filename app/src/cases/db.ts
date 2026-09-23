import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://soar:soar_dev_password@localhost:5432/soar",
});

/** Migrations run via Postgres' /docker-entrypoint-initdb.d (schema.sql).
 *  This just verifies connectivity at boot. */
export async function initDb(): Promise<void> {
  await pool.query("SELECT 1");
}

/** Append-only audit record. Call from every mutating route and playbook callback. */
export async function audit(
  actor: string,
  action: string,
  target: string,
  detail: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (tenant_id, actor, action, target, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [process.env.DEFAULT_TENANT ?? "default", actor, action, target, JSON.stringify(detail)]
  );
}
