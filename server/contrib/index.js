// Kesennuma Living City: contributor backend. A standalone Bun service; it does not touch the app server.
//
//   env -u NODE_OPTIONS bun server/contrib/index.js            configuration: environment variables, see
//                                                               docs/contrib/DEPLOY.md and docs/contrib/README.md
//   env -u NODE_OPTIONS bun server/contrib/index.js --check    validate the environment, print it (secrets as "set")
//
//   import { start } from "./server/contrib/index.js";
//   const { url, stop } = await start({ port: 8981, adminToken: "...24+ chars...", tokenSecret: "...",
//                                       dbPath: "/tmp/c.db", diskDir: "/tmp/files" });
//
// `start(opts)`: `opts` are camelCase overrides of the environment (port, host, dbPath, storage, diskDir,
// adminToken, tokenSecret, allowedOrigins, appUrl, maxPhotos, maxPhotoMb, maxShotMb, dailyLimit, ...) plus
// `env` (a replacement for process.env), `logger`, `now` and `s3Client` for tests.
// `createApp(config, deps)` is the same service without a socket: `app.fetch(request)` returns a Response.
import { loadConfig, describeConfig, ConfigError, VERSION } from "./config.js";
import { createApp } from "./app.js";
import { createLogger } from "./log.js";

export { loadConfig, createApp, createLogger, ConfigError, VERSION };

/**
 * Start the HTTP server.
 * @param {Record<string, any>} [opts]
 * @returns {Promise<{server: import("bun").Server, url: string, port: number, app: ReturnType<typeof createApp>, stop: () => Promise<void>}>}
 */
export async function start(opts = {}) {
  const { env, logger, now, s3Client, db, storage, ...overrides } = opts;
  const config = loadConfig(env ?? process.env, overrides);
  const log = logger ?? createLogger({ now });
  const app = createApp(config, { logger: log, now, s3Client, db, storage });
  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    maxRequestBodySize: config.maxBodyBytes, // the HTTP layer refuses an oversized upload before any of it is buffered
    idleTimeout: 120, // seconds without traffic: image processing after a slow upload must not cut the connection
    fetch: (req, srv) => app.fetch(req, srv),
    error: () => new Response(JSON.stringify({ error: "internal", message: "internal error" }), { status: 500, headers: { "content-type": "application/json; charset=utf-8" } }),
  });
  const url = `http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${server.port}`;
  log.info("server.started", { service: "kesennuma-contrib", version: VERSION, port: server.port, host: config.host, storage: config.storage });
  return {
    server, url, port: server.port, app,
    async stop() {
      await server.stop(true);
      app.close();
    },
  };
}

/**
 * Bun ends the process on an unhandled promise rejection, which would cut every upload in flight. Everything
 * request-scoped is caught in app.js, so a stray rejection can only come from a background task: log its class
 * name (never its message) and carry on. An uncaught exception is left alone: the state is unknown, so it still ends
 * the process and the platform restarts it.
 * @param {{error: (event: string, fields?: Record<string, unknown>) => void}} log
 * @param {{on: (event: string, fn: (reason: any) => void) => unknown}} [proc]
 */
export function installProcessGuards(log, proc = process) {
  proc.on("unhandledRejection", (reason) => {
    try { log.error("unhandled.rejection", { name: String(reason?.name ?? typeof reason).slice(0, 40) }); } catch { /* logging must never throw here */ }
  });
}

if (import.meta.main) {
  try {
    if (process.argv.includes("--check")) {
      // validate the environment and print the effective configuration (secrets shown as "set"), then exit
      console.log(JSON.stringify(describeConfig(loadConfig(process.env, {})), null, 2));
      process.exit(0);
    }
    const s = await start();
    const log = createLogger();
    installProcessGuards(log);
    const shutdown = async (sig) => {
      log.info("server.stopping", { reason: sig });
      await s.stop();
      process.exit(0);
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(e.message);
      process.exit(1);
    }
    console.error(`startup failed: ${e?.name ?? "Error"}: ${String(e?.message ?? e).split("\n")[0]}`);
    process.exit(1);
  }
}
