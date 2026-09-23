import type { FastifyInstance } from "fastify";
import { loadConnectors, listConnectors, getConnector } from "./registry";

export async function connectorRoutes(app: FastifyInstance) {
  await loadConnectors(app.log);

  /** List all registered connectors and their capabilities. */
  app.get("/", async () =>
    listConnectors().map((c) => ({
      ...c.manifest,
    }))
  );

  /** Hot-reload connectors from the plugins dir without restarting. */
  app.post("/reload", async () => {
    await loadConnectors(app.log);
    return { loaded: listConnectors().map((c) => c.manifest.name) };
  });

  /** Test a connector's connectivity/credentials. */
  app.post<{ Params: { name: string }; Body: { config?: Record<string, unknown> } }>(
    "/:name/test",
    async (req, reply) => {
      const connector = getConnector(req.params.name);
      if (!connector) return reply.code(404).send({ error: "connector not found" });
      return connector.testConnection(req.body?.config ?? {});
    }
  );

  /**
   * Execute an action capability. This is the endpoint n8n playbooks call:
   *   POST /connectors/virustotal/actions/enrich_ip  { "params": { "ip": "1.2.3.4" }, "config": { ... } }
   */
  app.post<{
    Params: { name: string; action: string };
    Body: { params?: Record<string, unknown>; config?: Record<string, unknown> };
  }>("/:name/actions/:action", async (req, reply) => {
    const connector = getConnector(req.params.name);
    if (!connector || !connector.execute) {
      return reply.code(404).send({ error: "connector not found or has no actions" });
    }
    if (!connector.manifest.capabilities.includes(req.params.action)) {
      return reply.code(400).send({
        error: `unknown action '${req.params.action}'`,
        capabilities: connector.manifest.capabilities,
      });
    }
    return connector.execute(req.params.action, req.body?.params ?? {}, req.body?.config ?? {});
  });
}
