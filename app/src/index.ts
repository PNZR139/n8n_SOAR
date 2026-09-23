import Fastify from "fastify";
import { initDb } from "./cases/db";
import { connectorRoutes } from "./connectors/routes";
import { correlationRoutes } from "./correlation/routes";
import { caseRoutes } from "./cases/routes";

const PORT = Number(process.env.PORT ?? 3000);

async function main() {
  const app = Fastify({ logger: true });

  await initDb();

  app.get("/health", async () => ({ status: "ok", time: new Date().toISOString() }));

  await app.register(connectorRoutes, { prefix: "/connectors" });
  await app.register(correlationRoutes);
  await app.register(caseRoutes, { prefix: "/cases" });

  await app.listen({ port: PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
