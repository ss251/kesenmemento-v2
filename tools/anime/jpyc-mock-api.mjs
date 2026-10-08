// [jpyc] A stand-in for JPYC EC (https://ec.jpyc-service.com) with the real proxy (server/app/jpyc.js) in front of it, for the store panel's e2e
// (test/jpyc-store.e2e.test.js), the server integration test (test/jpyc-server.test.js) and for demos where the platform must not be touched.
// One process, one port, three things:
//   /api/jpyc/...            the REAL proxy handler, its upstream set to this server's own /__upstream  (so the panel is tested against the code that ships)
//   /__upstream/api/v1/...   the platform: GET shops, shops/{slug}/products, products/{id}, answering with the responses recorded from the real API on 2026-10-06
//                            (test/fixtures/jpyc/, no personal data) plus whatever shops a test adds
//   /__mock/...              controls: POST /__mock/mode {mode, ms?, retryAfter?}  POST /__mock/shop {slug, name, is_demo, products[]}  POST /__mock/reset  GET /__mock/state
// Modes of the platform: ok, slow (answers after `ms`), hang (never answers), 500, 503 and 429 (with Retry-After), badjson, html, empty (the demo shop has no products),
// shopdown (404 for every shop). The proxy's own timings can be shortened (`proxy: { timeout, ttl, ... }`) so a test does not wait five minutes.
// Everything is in memory; nothing is read from the network. CORS is open on this stand-in only (the page and the mock are on different ports in a test; in production the
// proxy is on the page's own origin and sends no CORS headers).
//
//   env -u NODE_OPTIONS bun tools/anime/jpyc-mock-api.mjs [--port 9426] [--app dist/anime-9425]
//       without --app: the app is served elsewhere, open  http://127.0.0.1:<app>/index.html?jpycApi=http://127.0.0.1:9426
//       with --app <a built dist dir>: this process also serves the app (and /data/ from the repo) on the same port, so  http://127.0.0.1:9426/index.html  is a whole preview of
//       the panel with no deploy and no real platform (build one with `env -u NODE_OPTIONS bun tools/anime/serve.mjs --port 9425`, which leaves dist/anime-9425; Ctrl-C it). A
//       phone or the public mirror (scripts/public-mirror.js allows the two proxy routes) can reach it.
//
//   import { startMock } from './jpyc-mock-api.mjs';
//   const mock = startMock({ port: 0, shops: [...], proxy: { timeout: 200 } });   // { port, url, state, proxy, setMode(), reset(), stop() }
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAllowlist, createJpycProxy } from "../../server/app/jpyc.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIX = join(ROOT, "test/fixtures/jpyc");
const fixture = (n) => JSON.parse(readFileSync(join(FIX, n), "utf8"));
export const MODES = ["ok", "slow", "hang", "500", "503", "429", "badjson", "html", "empty", "shopdown"];
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-expose-headers": "retry-after, x-jpyc-cache" };

/** The shops the platform knows: the demo shop as recorded, plus `extra` ({ slug, name, is_demo, products: [...upstream-shaped products] }). */
function initialShops(extra = []) {
  const rec = fixture("shop-otameshi-products.json").data;
  const shops = new Map([[rec.shop.slug, { shop: rec.shop, products: rec.products }]]);
  for (const s of extra) shops.set(s.slug, { shop: { ...rec.shop, id: s.id ?? "00000000-0000-4000-8000-" + String(shops.size).padStart(12, "0"), slug: s.slug, name: s.name ?? s.slug, is_demo: !!s.is_demo, available_chains: s.available_chains ?? [137], stock_display_mode: s.stock_display_mode ?? "exact" }, products: s.products ?? [] });
  return shops;
}
/** An upstream-shaped product (the recorded demo product as the template). */
export function makeProduct(over = {}) {
  const tpl = fixture("shop-otameshi-products.json").data.products[0];
  return { ...tpl, id: over.id ?? "11111111-1111-4111-8111-111111111111", ...over };
}

/** `rel` under `base`, or null when it would leave it. */
const inside = (base, rel) => { const p = resolve(base, rel); return p === base || p.startsWith(base + "/") ? p : null; };
const TYPES = { ".wasm": "application/wasm", ".bin": "application/octet-stream", ".f32": "application/octet-stream" };

export function startMock({ port = 0, shops = [], proxy = {}, entries = null, hostname = "127.0.0.1", app = null } = {}) {
  const appDir = app ? resolve(app) : null;
  const state = { mode: "ok", ms: 0, retryAfter: 0, shops: initialShops(shops), requests: [], headers: [], upstream: 0 };
  const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "public, max-age=0, must-revalidate", ...headers } });
  const notFound = (code, message) => json(404, { ok: false, error: { code, message } });
  let server;

  async function platform(path, req) {
    state.upstream++; state.requests.push(path); state.headers.push({ method: req.method, ...Object.fromEntries(req.headers) });   // (what the platform is sent, for the test that no cookie or visitor header goes upstream)
    const m = state.mode;
    if (m === "hang") return new Promise(() => {});
    if (m === "slow") await Bun.sleep(state.ms);
    if (m === "500") return json(500, { ok: false, error: { code: "INTERNAL_ERROR", message: "boom" } });
    if (m === "503" || m === "429") return json(Number(m), { ok: false, error: { code: m === "429" ? "RATE_LIMITED" : "SERVICE_UNAVAILABLE", message: "later" } }, state.retryAfter ? { "retry-after": String(state.retryAfter) } : {});
    if (m === "badjson") return new Response("{ this is not json", { status: 200, headers: { "content-type": "application/json" } });
    if (m === "html") return new Response("<!doctype html><title>Maintenance</title>", { status: 200, headers: { "content-type": "text/html" } });
    const now = new Date().toISOString();
    let mm;
    if (path === "/api/v1/shops") return json(200, { ok: true, data: { shops: [...state.shops.values()].map((s) => ({ ...s.shop, wallet_address: undefined })) } });
    if ((mm = /^\/api\/v1\/shops\/([^/]+)\/products$/.exec(path))) {
      const s = state.shops.get(mm[1]);
      if (!s || m === "shopdown") return json(404, fixture("shop-not-found.json"));
      return json(200, { ok: true, data: { shop: s.shop, products: m === "empty" ? [] : s.products, has_nft_discounts: false, server_time: now } });
    }
    if ((mm = /^\/api\/v1\/products\/([^/]+)$/.exec(path))) {
      for (const s of state.shops.values()) { const p = s.products.find((x) => x.id === mm[1]); if (p) return json(200, { ok: true, data: { product: p, shop: s.shop, server_time: now } }); }
      return notFound("PRODUCT_NOT_FOUND", "Product not found");
    }
    return notFound("NOT_FOUND", "no such route");
  }

  // the proxy under test: the data file's own entries (or a test's), its upstream is this server. This is a test and preview tool, never a deployment: its proxy runs in dev mode (the switch
  // in data/shops/jpyc.json lifted, so the demo shop is served though it ships switched off) unless a test passes proxy: { dev: false } to see the production rule.
  const file = entries ?? JSON.parse(readFileSync(join(ROOT, "data/shops/jpyc.json"), "utf8"));
  const makeProxy = () => createJpycProxy({ allow: buildAllowlist(file, { dev: proxy.dev !== false }), upstream: "", log: () => {}, ...proxy, fetch: (url, init) => fetch(String(url).replace(/^\/api\//, `http://${hostname}:${server.port}/__upstream/api/`), init) });
  let prox = makeProxy();

  server = Bun.serve({
    port, hostname,
    async fetch(req) {
      const u = new URL(req.url), p = decodeURIComponent(u.pathname);
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (p.startsWith("/__upstream/")) return platform(p.slice("/__upstream".length), req);
      if (p.startsWith("/__mock/")) {
        const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
        if (p === "/__mock/mode") { if (!MODES.includes(body.mode)) return json(400, { error: "mode" }); state.mode = body.mode; state.ms = Number(body.ms ?? 0); state.retryAfter = Number(body.retryAfter ?? 0); return json(200, { ok: true, mode: state.mode }, CORS); }
        if (p === "/__mock/shop") { const s = initialShops([body]); state.shops.set(body.slug, s.get(body.slug)); return json(200, { ok: true }, CORS); }
        if (p === "/__mock/reset") { state.mode = "ok"; state.ms = 0; state.retryAfter = 0; state.shops = initialShops(); state.requests = []; state.headers = []; state.upstream = 0; prox = makeProxy(); return json(200, { ok: true }, CORS); }
        if (p === "/__mock/state") return json(200, { mode: state.mode, upstream: state.upstream, requests: state.requests, headers: state.headers, proxy: prox.stats, cached: prox.size }, CORS);
        return json(404, { error: "no such control" }, CORS);
      }
      const r = await prox.handle(p, req.method);
      if (r) { for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v); return r; }
      if (appDir && (req.method === "GET" || req.method === "HEAD") && !/\/\.|\.\./.test(p)) {   // the preview: the built app and the repo's data/
        const file = p.startsWith("/data/") ? inside(join(ROOT, "data"), p.slice(6)) : inside(appDir, p === "/" ? "index.html" : p.slice(1));
        const f = file && Bun.file(file);
        if (f && (await f.exists())) { const ext = file.slice(file.lastIndexOf(".")); return new Response(req.method === "HEAD" ? null : f, { headers: { "content-type": TYPES[ext] ?? f.type, "cache-control": "no-store" } }); }
      }
      return new Response("not found", { status: 404, headers: CORS });
    },
  });
  return {
    port: server.port, url: `http://${hostname}:${server.port}`, state, get proxy() { return prox; },
    setMode(mode, o = {}) { state.mode = mode; state.ms = o.ms ?? 0; state.retryAfter = o.retryAfter ?? 0; },
    reset() { state.mode = "ok"; state.shops = initialShops(); state.requests = []; state.headers = []; state.upstream = 0; prox = makeProxy(); },
    stop() { server.stop(true); },
  };
}

if (import.meta.main) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const m = startMock({ port: Number(arg("--port", 9426)), app: arg("--app", null) });
  console.log(arg("--app", null) ? `jpyc preview: ${m.url}/index.html  (the app from ${arg("--app")}, the proxy and a stand-in for JPYC EC on one port)` : `jpyc mock + proxy on ${m.url}  (app: ?jpycApi=${m.url})`);
  console.log(`controls: curl -X POST ${m.url}/__mock/mode -d '{"mode":"500"}'   modes: ${MODES.join(" ")}   (POST /__mock/reset puts it back)`);
  process.on("SIGINT", () => { m.stop(); process.exit(0); });
}
