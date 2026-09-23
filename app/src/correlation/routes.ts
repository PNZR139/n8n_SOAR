import type { FastifyInstance } from "fastify";
import { pool } from "../cases/db";
import { loadRules } from "./rules";
import { processEvent, type NormalizedEvent } from "./engine";

let rules = loadRules();

export async function correlationRoutes(app: FastifyInstance) {
  const tenant = () => process.env.DEFAULT_TENANT ?? "default";

  /**
   * Alert intake. Connectors/sources POST events here.
   * Body: single normalized event or an array of them.
   */
  app.post<{ Body: NormalizedEvent | NormalizedEvent[] }>("/events", async (req, reply) => {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    if (events.length === 0) return reply.code(400).send({ error: "empty event batch" });

    const outcomes = [];
    for (const ev of events) {
      const normalized = { ...ev, tenant_id: ev.tenant_id ?? tenant() };
      if (!normalized.event_type || !normalized.source) {
        outcomes.push({ outcome: "rejected", reason: "event_type and source are required" });
        continue;
      }
      await pool.query(
        `INSERT INTO events (tenant_id, event_type, source, severity, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [normalized.tenant_id, normalized.event_type, normalized.source, normalized.severity ?? "info", JSON.stringify(normalized)]
      );
      const result = await processEvent(pool, rules, normalized);
      outcomes.push(...result);
    }
    return { processed: events.length, outcomes };
  });

  app.get("/incidents", async () => {
    const { rows } = await pool.query(
      `SELECT id, tenant_id, rule_name, severity, status, summary, created_at
       FROM incidents WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [tenant()]
    );
    return rows;
  });

  /** Reload correlation rules from disk without restart. */
  app.post("/rules/reload", async () => {
    rules = loadRules();
    return { loaded: rules.map((r) => r.name) };
  });
}
