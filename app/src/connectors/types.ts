/**
 * Connector contract. Every integration in `plugins/` must export an object
 * satisfying this interface (default export from index.js).
 *
 * - collector: pulls or receives alerts (normalized by the intake route)
 * - action: performs an operation (enrich, contain, notify) invoked by n8n
 *   playbooks via POST /connectors/:name/actions/:action
 */

export interface ConnectorManifest {
  name: string; // unique, kebab-case, e.g. "virustotal"
  version: string;
  direction: "collector" | "action" | "both";
  description?: string;
  configSchema: Record<string, unknown>; // JSON Schema for the config form (future UI)
  capabilities: string[]; // e.g. ["enrich_ip", "enrich_hash"]
}

export interface ActionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface Result {
  ok: boolean;
  message?: string;
}

export interface Connector {
  manifest: ConnectorManifest;
  /** Verify credentials/connectivity. Backs the "Test" button. */
  testConnection(config: Record<string, unknown>): Promise<Result>;
  /** Execute an action capability. `action` is one of manifest.capabilities. */
  execute?(
    action: string,
    params: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<ActionResult>;
}
