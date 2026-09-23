import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";

/**
 * Correlation rule (YAML). Two kinds are supported in V1:
 *
 * 1) threshold — fire when an event type occurs `threshold` times within
 *    `window` (e.g. "10m") grouped by `group_by` entity fields.
 * 2) dedup — identical signature within `window` is merged, no new incident.
 */
export interface CorrelationRule {
  name: string;
  type: "threshold" | "dedup";
  match: { event_type?: string; source?: string };
  window: string; // e.g. "10m", "1h"
  group_by?: string[]; // event field names, e.g. ["target_user"]
  threshold?: number; // required for type=threshold
  severity: "low" | "medium" | "high" | "critical";
  playbook?: string; // n8n playbook webhook path, e.g. "pb-identity-triage"
  description?: string;
}

const RULES_DIR = process.env.RULES_DIR ?? resolve(process.cwd(), "../rules");

/** Parse "10m"/"1h"/"30s" into milliseconds. */
export function windowToMs(window: string): number {
  const match = /^(\d+)([smh])$/.exec(window);
  if (!match) throw new Error(`invalid window format: ${window}`);
  const n = Number(match[1]);
  switch (match[2]) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 3600 * 1000;
    default: throw new Error(`invalid window unit: ${window}`);
  }
}

export function loadRules(): CorrelationRule[] {
  if (!existsSync(RULES_DIR)) return [];
  const rules: CorrelationRule[] = [];
  for (const file of readdirSync(RULES_DIR)) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
    const raw = parse(readFileSync(join(RULES_DIR, file), "utf8")) as CorrelationRule;
    windowToMs(raw.window); // validate eagerly
    rules.push(raw);
  }
  return rules;
}
