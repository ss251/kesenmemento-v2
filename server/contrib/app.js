// Contributor backend: the application. `createApp(config, deps)` returns `{ fetch(req, server), close() }`.
//
// `fetch` is a plain Request -> Response function: Bun.serve calls it in production (index.js) and the tests call
// it directly, in-process, with no socket. Per request it
//   1. refuses a browser Origin that is neither allow-listed nor this service itself (CORS allow-list),
//   2. answers OPTIONS preflights,
//   3. routes the call (405 with an Allow header when the path exists for other methods),
//   4. applies the per-IP request limit, then authenticates (contributor token or admin token),
//   5. runs the handler and turns any error into `{ error, message }` JSON (unexpected errors are logged by
//      class name only and answered with a generic 500: no internals, no user data),
//   6. adds CORS, request-id and security headers and writes one PII-free log line.
import { openDb } from "./db.js";
import { createRepo } from "./repo.js";
import { createStorage } from "./storage.js";
import { createAuth } from "./auth.js";
import { createLogger } from "./log.js";
import { createWindowCounter, createVolumeCounter, createGate, clientIp } from "./limits.js";
import { HttpError, errorResponse, unauthorized, tooMany, BASE_HEADERS, applyCors, originAllowed, preflight, forwardedHosts, drainBody } from "./http.js";
import { randomId, iso, stripUnsafeChars } from "./util.js";
import { statfsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { publicRoutes } from "./routes-public.js";
import { adminRoutes } from "./routes-admin.js";
import { uiRoutes } from "./ui.js";

/**
 * Everything a handler receives.
 * @typedef {object} Ctx
 * @property {Request} req
 * @property {URL} url
 * @property {Record<string, string>} params path parameters
 * @property {URLSearchParams} query
 * @property {import("./config.js").ServiceConfig} config
 * @property {ReturnType<typeof createRepo>} repo
 * @property {ReturnType<typeof createStorage>} storage
 * @property {ReturnType<typeof createAuth>} auth
 * @property {ReturnType<typeof createWindowCounter>} counter
 * @property {ReturnType<typeof createVolumeCounter>} volume upload bytes per network per day
 * @property {ReturnType<typeof createGate>} bodyBudget byte budget for request bodies being received or processed
 * @property {ReturnType<typeof createGate>} processGate
 * @property {any} server the Bun server (for per-request timeouts), undefined in-process
 * @property {{byUser: Set<string>, byIp: Map<string, number>}} uploads uploads in flight
 * @property {Map<string, Promise<void>>} inflight idempotency keys being processed right now
 * @property {() => number | null} freeBytes free bytes on the data volume (null when unknown or unchecked)
 * @property {(keys: string[]) => Promise<{removed: number, failed: number}>} purge delete stored files; failures stay queued
 * @property {() => number} now
 * @property {ReturnType<typeof createLogger>} log
 * @property {string} ip rate-limit key of the client (never logged or stored)
 * @property {any} [user] the authenticated contributor row (auth "user" / "optional")
 * @property {string} [actor] audit actor of an admin request ("admin" or "admin:<name>")
 * @property {string} rid request id
 */

/** Compile "/a/:id/*rest" into a matcher. `:x` captures one segment, `*x` the rest of the path. */
function compile(route) {
  const keys = [];
  const src = route.path.split("/").map((seg) => {
    if (seg.startsWith(":")) { keys.push(seg.slice(1)); return "([^/]+)"; }
    if (seg.startsWith("*")) { keys.push(seg.slice(1)); return "(.+)"; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/");
  return { ...route, re: new RegExp(`^${src}$`), keys };
}

/** Admin name from X-Admin-Name (URI-encoded by the admin page) for the audit trail: short, printable, no markup. */
function adminActor(req) {
  let raw = req.headers.get("x-admin-name");
  if (!raw) return "admin";
  try { raw = decodeURIComponent(raw); } catch { /* not encoded: use as sent */ }
  const name = stripUnsafeChars(raw).replace(/[<>"'`\\]/g, "").trim().slice(0, 32);
  return name ? `admin:${name}` : "admin";
}

/** Does the request announce a body (Content-Length above zero, or a chunked transfer)? */
function hasBody(req) {
  const length = req.headers.get("content-length");
  return (length !== null && length.trim() !== "0") || req.headers.has("transfer-encoding");
}

const SEEN_EVERY_MS = 10 * 60 * 1000;
const DRAIN_EVERY_MS = 10 * 60 * 1000;

/** Free bytes on the local data volume, cached for a few seconds; null when there is nothing local to check. */
function freeSpaceProbe(config) {
  if (!(config.minFreeBytes > 0)) return () => null;
  const dir = config.storage === "disk" ? resolve(config.diskDir) : config.dbPath === ":memory:" ? null : dirname(resolve(config.dbPath));
  if (!dir) return () => null;
  let at = -Infinity, free = null;
  return () => {
    const t = Date.now();
    if (t - at > 5000) {
      at = t;
      try { const s = statfsSync(dir); free = Number(s.bavail) * Number(s.bsize); } catch { free = null; }
    }
    return free;
  };
}

/**
 * @param {import("./config.js").ServiceConfig} config
 * @param {object} [deps]
 * @param {() => number} [deps.now] clock (tests)
 * @param {ReturnType<typeof createLogger>} [deps.logger]
 * @param {import("bun:sqlite").Database} [deps.db] an already open database
 * @param {ReturnType<typeof createStorage>} [deps.storage]
 * @param {object} [deps.s3Client] a fake S3 client for STORAGE=s3 (tests)
 * @param {() => number | null} [deps.freeBytes] free space probe (tests simulate a full volume)
 */
export function createApp(config, deps = {}) {
  const now = deps.now ?? Date.now;
  const log = deps.logger ?? createLogger({ now });
  const db = deps.db ?? openDb(config.dbPath);
  const repo = createRepo(db);
  const storage = deps.storage ?? createStorage(config, { s3Client: deps.s3Client });
  const auth = createAuth(config);
  const counter = createWindowCounter({ now });
  const volume = createVolumeCounter({ now });
  // request bodies are held in memory from the first byte until the submission is stored: a byte budget (each
  // upload reserves its declared size) bounds that, whatever mix of big, small, slow and queued uploads arrives
  const bodyBudget = createGate(config.uploadBufferBytes, { maxQueue: 64, waitMs: 20_000 });
  const processGate = createGate(config.maxConcurrentUploads, { maxQueue: 64, waitMs: 60_000 });
  const uploads = { byUser: new Set(), byIp: new Map() };
  const inflight = new Map();
  const freeBytes = deps.freeBytes ?? freeSpaceProbe(config);
  const routes = [...publicRoutes, ...adminRoutes, ...uiRoutes].map(compile);

  /**
   * Delete stored files one by one. A file the store cannot delete stays in `pending_deletes` (queued before the
   * rows were removed) and is retried by drainPending, so a storage outage cannot leave private photos behind
   * with nothing recording that they exist.
   */
  async function purge(keys) {
    let removed = 0, failed = 0;
    for (const key of keys) {
      try { await storage.remove([key]); repo.clearPending([key]); removed++; }
      catch (e) { failed++; try { repo.notePendingFailure(key, e?.code ?? e?.name ?? "error", iso(now())); } catch { /* database closing */ } }
    }
    if (failed) log.warn("storage.delete_failed", { count: failed });
    return { removed, failed };
  }
  /** Retry the queued deletions (runs at start and every 10 minutes). */
  async function drainPending() {
    let rows;
    try { rows = repo.pendingDeletes(200); } catch { return { removed: 0, failed: 0 }; }
    return rows.length ? purge(rows.map((r) => r.key)) : { removed: 0, failed: 0 };
  }
  const drainTimer = setInterval(() => { drainPending().catch(() => {}); }, DRAIN_EVERY_MS);
  const firstDrain = setTimeout(() => { drainPending().catch(() => {}); }, 5000);
  drainTimer.unref?.(); firstDrain.unref?.();

  /** The contributor behind a Bearer token, or null. Constant-time comparison; touches last_seen at most every 10 minutes. */
  function userFrom(req) {
    const parsed = auth.parseToken(auth.bearer(req));
    if (!parsed) return null;
    const row = repo.getContributor(parsed.id);
    const hashes = row ? [row.secret_hash, ...repo.extraTokenHashes(parsed.id)] : [];
    const hit = auth.match(parsed.secret, hashes);
    if (!hit || !row) return null;
    if (!row.last_seen || now() - Date.parse(row.last_seen) > SEEN_EVERY_MS) repo.touchSeen(row.id, iso(now()));
    row.token_hash = hit; // which of the contributor's tokens this request used (sign-out-others keeps it)
    return row;
  }

  /**
   * Throws unless the request carries the admin token. A correct token always passes (the lock-out only slows
   * guessing: someone sharing the admin's address cannot lock the admin out); wrong tokens are counted per IP and,
   * past the limit, answered 429 so guessing is throttled.
   */
  function requireAdmin(req, ip) {
    if (auth.isAdmin(auth.bearer(req))) return;
    const key = `adminfail:${ip}`, window = 15 * 60_000, limit = config.limits.adminFailPer15MinIp;
    const wait = counter.retryAfter(key, limit, window);
    if (wait > 0) throw tooMany(wait, "admin_locked", "too many failed admin attempts from this network, try again later");
    counter.add(key, window);
    throw unauthorized();
  }

  /** @param {Request} req @param {any} server */
  async function dispatch(req, server, url, rid, meta) {
    const origin = req.headers.get("origin");
    const own = forwardedHosts(req, config.trustProxy);
    if (!originAllowed(origin, url, config.allowedOrigins, own)) throw new HttpError(403, "origin_not_allowed", "this origin may not call the API");
    if (req.method === "OPTIONS") { meta.route = "preflight"; return preflight(origin, url, config.allowedOrigins, own); }

    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    const method = req.method === "HEAD" ? "GET" : req.method;
    let hit = null;
    const allowed = new Set();
    for (const r of routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      if (r.method !== method) { allowed.add(r.method); continue; }
      hit = { r, m };
      break;
    }
    if (!hit) {
      if (allowed.size) throw new HttpError(405, "method_not_allowed", "method not allowed", { headers: { allow: [...allowed, "OPTIONS"].join(", ") } });
      throw new HttpError(404, "not_found", "not found");
    }
    const { r, m } = hit;
    meta.route = r.label;

    const params = {};
    try { r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); } catch { throw new HttpError(400, "bad_request", "malformed URL"); }

    const ip = clientIp(req, server, config.trustProxy);
    if (r.limit !== false) {
      const lim = counter.take(`ip:${ip}`, config.limits.perMinuteIp, 60_000);
      if (!lim.ok) throw tooMany(lim.retryAfterMs);
    }

    /** @type {Ctx} */
    const c = { req, url, params, query: url.searchParams, config, repo, storage, auth, counter, volume, bodyBudget, processGate, server, uploads, inflight, freeBytes, purge, now, log, ip, rid };
    if (r.auth === "admin") { requireAdmin(req, ip); c.actor = adminActor(req); }
    else if (r.auth === "user") { c.user = userFrom(req); if (!c.user) throw unauthorized(); }
    else if (r.auth === "optional") c.user = userFrom(req);
    return r.handler(c);
  }

  /** @param {Request} req @param {any} [server] the Bun server, for requestIP() */
  async function fetch(req, server) {
    const t0 = performance.now();
    const rid = randomId(6);
    const meta = { route: "unmatched" };
    let url;
    try { url = new URL(req.url); } catch { return new Response("bad request", { status: 400 }); }
    let res;
    try {
      res = await dispatch(req, server, url, rid, meta);
    } catch (e) {
      if (e instanceof HttpError) {
        res = errorResponse(e);
        if (e.status >= 500) log.error("request.failed", { rid, method: req.method, route: meta.route, code: e.code });
      } else {
        log.error("request.crashed", { rid, method: req.method, route: meta.route, name: e?.name });
        if (log.level === "debug") log.debug("request.crashed.detail", { rid, message: String(e?.message ?? e) });
        res = errorResponse(new HttpError(500, "internal", "internal error"));
      }
    }
    // A handler that answered without reading the request body (a limit, a bad token, a refused upload) leaves it on the
    // wire: take it off before replying, so the connection stays in step for whatever the client sends next.
    if (hasBody(req) && !req.bodyUsed) {
      await drainBody(req, config.maxBodyBytes, { minBytesPerSec: config.uploadMinBytesPerSec, graceMs: config.uploadGraceMs, deadlineMs: config.uploadDeadlineMs });
    }
    // headers on a Response built by Bun.file() or fetch() can be immutable: rebuild if needed
    let headers = res.headers;
    try { headers.set("x-request-id", rid); } catch { res = new Response(res.body, res); headers = res.headers; headers.set("x-request-id", rid); }
    for (const [k, v] of Object.entries(BASE_HEADERS)) if (!headers.has(k)) headers.set(k, v);
    // the platform proxy terminates TLS: when it says the request came in over https, tell browsers to keep using it
    if (config.trustProxy > 0 && /^https\b/i.test(req.headers.get("x-forwarded-proto") ?? "")) headers.set("strict-transport-security", "max-age=15552000");
    applyCors(headers, req.headers.get("origin"), url, config.allowedOrigins, forwardedHosts(req, config.trustProxy));
    log.info("request", { rid, method: req.method, route: meta.route, status: res.status, ms: Math.round(performance.now() - t0) });
    return res;
  }

  return {
    fetch,
    config, repo, storage, counter, volume, db,
    /** The upload bookkeeping, exposed for tests and diagnostics: budget, processing gate, uploads in flight. */
    gates: { bodyBudget, processGate, uploads, inflight },
    /** Retry queued file deletions now (also runs by itself every 10 minutes). */
    drainPending,
    /** Stop the background timers and close the database. Call once, after the HTTP server has stopped. */
    close() { clearInterval(drainTimer); clearTimeout(firstDrain); try { db.close(); } catch { /* already closed */ } },
  };
}
