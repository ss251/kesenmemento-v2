// A throwaway contributor backend for local development and end-to-end scripts (the app's report sheet, the admin
// page). Binds loopback only, keeps its database and files in a temporary directory that is removed on exit, and
// uses a fixed development admin token: it is not a secret and must never be used anywhere reachable.
//
//   env -u NODE_OPTIONS bun tools/contrib/dev-server.mjs --port 8988 --origin http://127.0.0.1:8985 [--seed] [--keep]
//
//   --port N       listen port (default 8788)
//   --origin URL   an app origin allowed by CORS; repeatable (the default list of the service is kept too)
//   --seed         fill it with demo data (tools/contrib/seed.mjs)
//   --keep         keep the temporary data directory after exit
//
// Admin page: http://127.0.0.1:<port>/admin   admin token: DEV_ADMIN_TOKEN below
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { start } from "../../server/contrib/index.js";
import { DEFAULT_ALLOWED_ORIGINS } from "../../server/contrib/config.js";
import { createLogger } from "../../server/contrib/log.js";
import { seedDemo } from "./seed.mjs";

export const DEV_ADMIN_TOKEN = "dev-admin-token-not-a-secret-0000";
export const DEV_TOKEN_SECRET = "dev-token-secret-not-a-secret-0000";

/**
 * @param {{port?: number, origins?: string[], seed?: boolean, quiet?: boolean}} [o]
 * @returns {Promise<{url: string, port: number, dir: string, stop: () => Promise<void>, adminToken: string, demo: any}>}
 */
export async function startDev({ port = 8788, origins = [], seed = false, quiet = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "klc-contrib-dev-"));
  const s = await start({
    port, host: "127.0.0.1", adminToken: DEV_ADMIN_TOKEN, tokenSecret: DEV_TOKEN_SECRET, dbPath: join(dir, "contrib.db"), diskDir: join(dir, "files"),
    allowedOrigins: [...DEFAULT_ALLOWED_ORIGINS, ...origins], logger: createLogger({ level: quiet ? "silent" : "info" }),
  });
  const demo = seed ? await seedDemo({ base: s.url, adminToken: DEV_ADMIN_TOKEN }) : null;
  return { url: s.url, port: s.port, dir, adminToken: DEV_ADMIN_TOKEN, demo, stop: () => s.stop() };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const arg = (name) => { const out = []; args.forEach((a, i) => { if (a === name && args[i + 1]) out.push(args[i + 1]); }); return out; };
  const port = Number(arg("--port")[0] ?? 8788);
  const keep = args.includes("--keep");
  const dev = await startDev({ port, origins: arg("--origin"), seed: args.includes("--seed") });
  console.log(`dev backend ${dev.url}  (admin page ${dev.url}/admin, admin token ${DEV_ADMIN_TOKEN})${dev.demo ? `  seeded ${dev.demo.created.length} demo submissions` : ""}`);
  console.log(`data in ${dev.dir}${keep ? " (kept)" : " (removed on exit)"}`);
  const shutdown = async () => { await dev.stop(); if (!keep) rmSync(dev.dir, { recursive: true, force: true }); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
