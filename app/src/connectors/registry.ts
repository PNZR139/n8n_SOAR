import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Connector } from "./types";

// TS compiles import() to require() under module:commonjs, which breaks
// file:// dynamic loads off the require graph. Use a native import instead.
const nativeImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<Record<string, unknown>>;

const PLUGINS_DIR = process.env.PLUGINS_DIR ?? resolve(process.cwd(), "../plugins");

const connectors = new Map<string, Connector>();

/**
 * Scan PLUGINS_DIR for subdirectories containing an index.js, load each as
 * a connector, and register by manifest.name. Bad plugins are skipped with a
 * warning instead of crashing the service.
 */
export async function loadConnectors(log: { warn: (msg: string) => void; info: (msg: string) => void }): Promise<void> {
  connectors.clear();
  if (!existsSync(PLUGINS_DIR)) {
    log.warn(`plugins dir not found: ${PLUGINS_DIR}`);
    return;
  }

  for (const entry of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const entrypoint = join(PLUGINS_DIR, entry.name, "index.js");
    if (!existsSync(entrypoint)) continue;

    try {
      const mod = await nativeImport(pathToFileURL(entrypoint).href);
      const connector: Connector = (mod.default ?? mod) as Connector;
      if (!connector?.manifest?.name) {
        log.warn(`plugin ${entry.name}: missing manifest.name, skipped`);
        continue;
      }
      connectors.set(connector.manifest.name, connector);
      log.info(`connector loaded: ${connector.manifest.name}@${connector.manifest.version ?? "?"}`);
    } catch (err) {
      log.warn(`plugin ${entry.name}: failed to load — ${(err as Error).message}`);
    }
  }
}

export function listConnectors(): Connector[] {
  return [...connectors.values()];
}

export function getConnector(name: string): Connector | undefined {
  return connectors.get(name);
}
