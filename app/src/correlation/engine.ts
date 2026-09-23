import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";
import type { Pool } from "pg";
import { windowToMs, type CorrelationRule } from "./rules";

export interface NormalizedEvent {
  tenant_id: string;
  event_type: string; // e.g. "auth.failed", "edr.alert", "email.phish"
  source: string; // connector or product name
  severity: string;
  occurred_at: string; // ISO
  [key: string]: unknown; // entity fields: target_user, host, src_ip, ...
}

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

function signatureOf(event: NormalizedEvent): string {
  const base = JSON.stringify({
    t: event.event_type,
    s: event.source,
    user: event.target_user ?? null,
    host: event.host ?? null,
    ip: event.src_ip ?? null,
  });
  return createHash("sha256").update(base).digest("hex");
}

async function triggerPlaybook(playbook: string, payload: unknown): Promise<void> {
  const base = process.env.N8N_WEBHOOK_BASE ?? "http://localhost:5678/webhook";
  try {
    await fetch(`${base}/${playbook}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Don't fail intake if n8n is down; the incident is already persisted.
    console.error(`playbook trigger failed (${playbook}): ${(err as Error).message}`);
  }
}

async function createIncident(
  db: Pool,
  tenant: string,
  rule: CorrelationRule,
  event: NormalizedEvent
): Promise<{ id: string }> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO incidents (id, tenant_id, rule_name, severity, status, summary, event)
     VALUES ($1, $2, $3, $4, 'new', $5, $6)`,
    [id, tenant, rule.name, rule.severity, rule.description ?? rule.name, JSON.stringify(event)]
  );
  return { id };
}

/**
 * Run one normalized event through the rule set. Returns an outcome per rule.
 * State lives in Redis with keys prefixed by tenant for future multi-tenancy:
 *   {tenant}:dedup:{signature}     — presence-only, TTL = window
 *   {tenant}:corr:{rule}:{group}   — counter, TTL = window
 */
export async function processEvent(
  db: Pool,
  rules: CorrelationRule[],
  event: NormalizedEvent
): Promise<{ rule: string; outcome: string; incident_id?: string }[]> {
  const results = [];

  for (const rule of rules) {
    if (rule.match.event_type && rule.match.event_type !== event.event_type) continue;
    if (rule.match.source && rule.match.source !== event.source) continue;

    const windowMs = windowToMs(rule.window);

    if (rule.type === "dedup") {
      const key = `${event.tenant_id}:dedup:${signatureOf(event)}`;
      const isNew = await redis.set(key, "1", "PX", windowMs, "NX");
      results.push({ rule: rule.name, outcome: isNew ? "kept" : "suppressed-duplicate" });
      if (!isNew) return results; // swallowed — no further processing
      continue;
    }

    if (rule.type === "threshold") {
      const groupVals = (rule.group_by ?? []).map((f) => String(event[f] ?? ""));
      const groupKey = createHash("sha256").update(groupVals.join("|")).digest("hex");
      const key = `${event.tenant_id}:corr:${rule.name}:${groupKey}`;

      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, windowMs);

      if (count >= (rule.threshold ?? 1)) {
        await redis.del(key); // reset so we don't spam incidents
        const incident = await createIncident(db, event.tenant_id, rule, event);
        if (rule.playbook) {
          await triggerPlaybook(rule.playbook, { incident_id: incident.id, tenant_id: event.tenant_id, rule: rule.name, event });
        }
        results.push({ rule: rule.name, outcome: "incident-created", incident_id: incident.id, count });
      } else {
        results.push({ rule: rule.name, outcome: `counted ${count}/${rule.threshold}` });
      }
    }
  }

  return results;
}
