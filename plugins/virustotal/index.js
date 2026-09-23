/**
 * Example action connector: VirusTotal enrichment.
 * Executes: enrich_ip, enrich_hash. Requires config.apiKey.
 *
 * Test it after `docker compose up`:
 *   curl -X POST localhost:3000/connectors/virustotal/actions/enrich_ip \
 *     -H "content-type: application/json" \
 *     -d '{"params":{"ip":"8.8.8.8"},"config":{"apiKey":"YOUR_KEY"}}'
 */

const VT_BASE = "https://www.virustotal.com/api/v3";

async function vtGet(path, apiKey) {
  const res = await fetch(`${VT_BASE}${path}`, {
    headers: { "x-apikey": apiKey },
  });
  if (!res.ok) return { ok: false, error: `VirusTotal HTTP ${res.status}` };
  return { ok: true, data: await res.json() };
}

const connector = {
  manifest: {
    name: "virustotal",
    version: "1.0.0",
    direction: "action",
    description: "Enrich IPs and file hashes via VirusTotal",
    configSchema: {
      type: "object",
      required: ["apiKey"],
      properties: { apiKey: { type: "string", title: "VirusTotal API key" } },
    },
    capabilities: ["enrich_ip", "enrich_hash"],
  },

  async testConnection(config) {
    if (!config.apiKey) return { ok: false, message: "apiKey is required" };
    const res = await vtGet("/ip_addresses/8.8.8.8", config.apiKey);
    return res.ok
      ? { ok: true, message: "connected to VirusTotal" }
      : { ok: false, message: res.error };
  },

  async execute(action, params, config) {
    if (!config.apiKey) return { ok: false, error: "apiKey is required" };

    if (action === "enrich_ip") {
      if (!params.ip) return { ok: false, error: "params.ip is required" };
      return vtGet(`/ip_addresses/${encodeURIComponent(params.ip)}`, config.apiKey);
    }
    if (action === "enrich_hash") {
      if (!params.hash) return { ok: false, error: "params.hash is required" };
      return vtGet(`/files/${encodeURIComponent(params.hash)}`, config.apiKey);
    }
    return { ok: false, error: `unsupported action: ${action}` };
  },
};

module.exports = connector;
module.exports.default = connector;
