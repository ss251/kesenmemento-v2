// [jpyc] The proxy as the production server runs it: the real server/app/server.js started from a staged bundle (server.js, static.js, jpyc.js, data/shops/jpyc.json,
// a stub of the /api/live module) with JPYC_EC_BASE pointing at the platform's stand-in (tools/anime/jpyc-mock-api.mjs, answering with the recorded responses). It sends
// real HTTP requests with cookies and an Authorization header and checks what the stand-in received (neither), what comes back, the damaged-data-file case (the
// server still starts), the switch (the shipped data file has the demo off: a production server then serves nothing and asks the platform for nothing), JPYC_DEV, and that stage.sh puts
// the three files and the data file in the bundle.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startMock } from "../tools/anime/jpyc-mock-api.mjs";

const ROOT = resolve(import.meta.dir, "..");
const kids = [];
const dirs = [];
let mock;

async function freePort() { const s = Bun.serve({ port: 0, fetch: () => new Response("") }); const p = s.port; s.stop(true); return p; }

/** A bundle in a temp dir, laid out as server/app/stage.sh lays it out, and the server started in it. */
async function boot({ dataFile = "real", env = {}, log = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "klc-jpyc-srv-")); dirs.push(dir);
  for (const f of ["server.js", "static.js", "jpyc.js"]) copyFileSync(join(ROOT, "server/app", f), join(dir, f));
  mkdirSync(join(dir, "src/server"), { recursive: true }); writeFileSync(join(dir, "src/server/live.js"), "export async function liveRoutes() { return null; }\n");
  mkdirSync(join(dir, "public")); writeFileSync(join(dir, "public/index.html"), "<!doctype html><title>app</title>");
  mkdirSync(join(dir, "data/live"), { recursive: true }); writeFileSync(join(dir, "data/live/sample.json"), "{}");
  mkdirSync(join(dir, "data/shops"), { recursive: true });
  if (dataFile === "real") copyFileSync(join(ROOT, "data/shops/jpyc.json"), join(dir, "data/shops/jpyc.json"));   // (as shipped: the demo switched off)
  else if (dataFile === "real-on") { const j = JSON.parse(readFileSync(join(ROOT, "data/shops/jpyc.json"), "utf8")); j.entries = j.entries.map((e) => (e.kind === "demo" ? { ...e, enabled: true } : e)); writeFileSync(join(dir, "data/shops/jpyc.json"), JSON.stringify(j, null, 2)); }   // (the one flag flipped: the switch on)
  else if (dataFile !== "missing") writeFileSync(join(dir, "data/shops/jpyc.json"), dataFile);
  const port = await freePort();
  const childEnv = { ...process.env, PORT: String(port), JPYC_EC_BASE: mock.url + "/__upstream", JPYC_WARM: "0", ...env }; delete childEnv.NODE_OPTIONS;   // (the warm-up has its own test: the others count the platform's calls)
  // The server's output goes to a file the child writes itself, not to a pipe read here: inside the full suite Bun 1.3.14's test runner returns empty output from a spawned process's pipe
  // (the same quirk as test/dbg-strip.test.js's note and the known "ship: a real build" failure), so a pipe made these assertions pass alone and fail in `bun test`.
  const logFile = join(dir, "server.log");
  const child = Bun.spawn([process.execPath, "server.js"], { cwd: dir, env: childEnv, stdout: log ? Bun.file(logFile) : "ignore", stderr: "ignore" });
  kids.push(child);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 300; i++) { try { if ((await fetch(base + "/healthz")).ok) return { base, dir, child, logFile }; } catch { /* not up yet */ } await Bun.sleep(50); }   // (15 s: a loaded machine, with other lanes running, once took more than 5 s to start a server)
  throw new Error("server did not start");
}
const stop = (c) => { try { c.child.kill(); } catch { /* gone */ } };
/** What a server booted with { log: true } has printed so far. */
const logOf = (c) => { try { return readFileSync(c.logFile, "utf8"); } catch { return ""; } };
/** Wait (while the server is still running) until its output matches `re`, up to 10 s; -> the output so far. */
async function waitLog(c, re, ms = 10000) { for (let t = 0; t < ms && !re.test(logOf(c)); t += 50) await Bun.sleep(50); return logOf(c); }

beforeAll(() => { mock = startMock({ port: 0 }); });
afterAll(() => { for (const k of kids) { try { k.kill(); } catch { /* gone */ } } mock?.stop(); for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

describe("PRODUCTION DEFAULT: server.js with the shipped data file (the demo switched off) serves nothing and asks the platform for nothing", () => {
  test("every /api/jpyc route is a 404 JSON, even with the background warm-up on; the platform sees no request at all; the site itself is up; the log says the feature is off", async () => {
    mock.reset();
    const s = await boot({ env: { JPYC_WARM: "1" }, log: true });
    try {
      await Bun.sleep(500);   // (a warm-up at start would have asked by now)
      for (const p of ["/api/jpyc/shops/otameshi/products", "/api/jpyc/products/e899a1dd-754d-4a97-b07b-58fcd5940e36", "/api/jpyc/shops/anyone/products", "/api/jpyc", "/api/jpyc/"]) {
        const r = await fetch(s.base + p), b = await r.json();
        expect([p, r.status, r.headers.get("content-type")?.startsWith("application/json"), b.ok, b.error]).toEqual([p, 404, true, false, "not_found"]);
      }
      expect(mock.state.upstream).toBe(0); expect(mock.state.requests).toEqual([]);
      expect(await (await fetch(s.base + "/healthz")).text()).toBe("ok"); expect(await (await fetch(s.base + "/")).text()).toContain("<title>app</title>");
      expect(JSON.parse(await (await fetch(s.base + "/data/shops/jpyc.json")).text()).entries.map((e) => [e.kind, e.enabled])).toEqual([["demo", false]]);   // (the file the server decides by is the one it serves)
      expect(await waitLog(s, /jpyc: off/)).toMatch(/jpyc: off \(no shop is switched on in data\/shops\/jpyc\.json/);
    } finally { stop(s); }
  }, 30000);
  test("JPYC_DEV=1 lifts the switch on a dev server (the demo is served, the log says on); production never sets it", async () => {
    mock.reset();
    const s = await boot({ env: { JPYC_DEV: "1" }, log: true });
    try { const r = await fetch(s.base + "/api/jpyc/shops/otameshi/products"); expect([r.status, (await r.json()).shop.is_demo]).toEqual([200, true]); expect(await waitLog(s, /jpyc: on for otameshi/)).toMatch(/jpyc: on for otameshi/); } finally { stop(s); }
    expect(readFileSync(join(ROOT, "server/app/server.js"), "utf8")).toContain('dev: process.env.JPYC_DEV === "1"');   // (only the literal "1")
    expect(readFileSync(join(ROOT, "server/app/README.md"), "utf8")).not.toMatch(/JPYC_DEV=1[^\n]*(railway|production)/i);
  }, 30000);
  test("flip the one flag in the staged data file and restart: the same server now answers for the demo (the switch, both ways, on the real server)", async () => {
    mock.reset();
    const s = await boot({ dataFile: "real-on", log: true });
    try { const r = await fetch(s.base + "/api/jpyc/shops/otameshi/products"); expect([r.status, (await r.json()).ok]).toEqual([200, true]); expect(mock.state.upstream).toBe(1); expect(await waitLog(s, /jpyc: on for otameshi/)).toMatch(/jpyc: on for otameshi/); } finally { stop(s); }
  }, 30000);
});

describe("server.js with the real data file, the demo switched on", () => {
  let s;
  beforeAll(async () => { s = await boot({ dataFile: "real-on" }); }, 20000);
  afterAll(() => stop(s));

  test("GET /api/jpyc/shops/otameshi/products: the demo shop's product, filtered, JSON, from one platform call", async () => {
    mock.reset();
    const r = await fetch(s.base + "/api/jpyc/shops/otameshi/products"), b = await r.json();
    expect(r.status).toBe(200); expect(r.headers.get("content-type")).toMatch(/^application\/json/); expect(r.headers.get("x-jpyc-cache")).toBe("miss");
    expect(b.ok).toBe(true); expect(b.shop.is_demo).toBe(true); expect(b.shop.slug).toBe("otameshi");
    expect(b.products.map((p) => [p.id, p.name, p.price_jpyc])).toEqual([["e899a1dd-754d-4a97-b07b-58fcd5940e36", "【テスト用】決済お試し商品（0 JPYC）", "0"]]);
    expect(JSON.stringify(b)).not.toMatch(/wallet|0x/);
    expect(mock.state.requests).toEqual(["/api/v1/shops/otameshi/products"]);
  });
  test("a crowd: 40 requests, still one platform call; the second says hit", async () => {
    const rs = await Promise.all(Array.from({ length: 40 }, () => fetch(s.base + "/api/jpyc/shops/otameshi/products")));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(mock.state.upstream).toBe(1);
    expect((await fetch(s.base + "/api/jpyc/shops/otameshi/products")).headers.get("x-jpyc-cache")).toBe("hit");
  });
  test("what the platform received: a GET with accept and our user-agent; no cookie, no Authorization, no Referer, no Origin, no forwarded address", async () => {
    mock.reset();
    const fresh = await boot({ dataFile: "real-on" });   // (its own cache: the shared server has the shop's list already)
    let r;
    try { r = await fetch(fresh.base + "/api/jpyc/shops/otameshi/products?session=abc&utm=x", { headers: { cookie: "session=SECRET; klc.x=1", authorization: "Bearer SECRET", referer: "https://evil.example/", origin: "https://evil.example", "x-forwarded-for": "203.0.113.9", "x-api-key": "SECRET", "user-agent": "VisitorBrowser/1" } }); } finally { stop(fresh); }
    expect(r.status).toBe(200);
    expect(mock.state.headers.length).toBe(1);
    const h = mock.state.headers[0];
    expect(h.method).toBe("GET"); expect(h.accept).toBe("application/json"); expect(h["user-agent"]).toMatch(/^KesenMemento-jpyc-proxy/);
    for (const k of ["cookie", "authorization", "referer", "origin", "x-forwarded-for", "x-api-key"]) expect([k, h[k]]).toEqual([k, undefined]);
    expect(mock.state.requests).toEqual(["/api/v1/shops/otameshi/products"]);   // (the visitor's query string is not part of it)
    expect(JSON.stringify(h)).not.toMatch(/SECRET|VisitorBrowser|203\.0\.113/);
  });
  test("the response sets no cookie and carries no CORS header (the page and the proxy are one origin)", async () => {
    const r = await fetch(s.base + "/api/jpyc/shops/otameshi/products");
    expect(r.headers.get("set-cookie")).toBeNull(); expect(r.headers.get("access-control-allow-origin")).toBeNull();
  });
  test("a shop that is not in the data file is 404 and the platform is not asked; the other jpyc paths are 404 JSON too", async () => {
    mock.reset();
    for (const p of ["/api/jpyc/shops/somebody-else/products", "/api/jpyc/shops/otameshi", "/api/jpyc", "/api/jpyc/", "/api/jpyc/products/not-an-allowed-product"]) {   // (the proxy's own answer: 404 and JSON)
      const r = await fetch(s.base + p), b = await r.json();
      expect([p, r.status, r.headers.get("content-type")?.startsWith("application/json"), b.ok, b.error]).toEqual([p, 404, true, false, "not_found"]);
    }
    for (const p of ["/api/jpyc/shops/%2e%2e/products", "/api/jpyc/shops/a%2Fb/products"]) {   // (a dot segment or an encoded slash: the server's own guards, or the proxy's; either way a 404, never a platform call)
      const r = await fetch(s.base + p); expect([p, r.status]).toEqual([p, 404]);
    }
    const r = await fetch(s.base + "/api/jpyc/shops/somebody-else/products"); expect((await r.json()).error).toBe("not_found");
    expect(mock.state.upstream).toBeLessThanOrEqual(1);   // (only the look into the allowed shop's own list for a made-up product id)
  });
  test("a product of the allowed shop by id", async () => {
    mock.reset();
    const r = await fetch(s.base + "/api/jpyc/products/e899a1dd-754d-4a97-b07b-58fcd5940e36"), b = await r.json();
    expect([r.status, b.ok, b.product.id, b.shop.slug]).toEqual([200, true, "e899a1dd-754d-4a97-b07b-58fcd5940e36", "otameshi"]);
  });
  test("writes are refused by the server itself (405); HEAD works", async () => {
    for (const m of ["POST", "PUT", "DELETE", "PATCH"]) expect([m, (await fetch(s.base + "/api/jpyc/shops/otameshi/products", { method: m })).status]).toEqual([m, 405]);
    const h = await fetch(s.base + "/api/jpyc/shops/otameshi/products", { method: "HEAD" }); expect([h.status, await h.text()]).toEqual([200, ""]);
  });
  test("the platform down: a clean 5xx JSON error with words, not a hang or a stack; recovery on the next try", async () => {
    mock.reset(); mock.setMode("500");
    const fresh = await boot({ dataFile: "real-on" });
    try {
      const r = await fetch(fresh.base + "/api/jpyc/shops/otameshi/products"), b = await r.json();
      expect([r.status, b.ok, b.error]).toEqual([502, false, "unavailable"]); expect(b.message).toMatch(/JPYC EC/); expect(JSON.stringify(b)).not.toMatch(/boom|INTERNAL/);
    } finally { stop(fresh); mock.setMode("ok"); }
  });
  test("the rest of the server is untouched: /healthz, the page, the data files (the allowlist file is public data like the rest)", async () => {
    expect(await (await fetch(s.base + "/healthz")).text()).toBe("ok");
    expect(await (await fetch(s.base + "/")).text()).toContain("<title>app</title>");
    const d = await fetch(s.base + "/data/shops/jpyc.json"); expect(d.status).toBe(200);
    expect(JSON.parse(await d.text()).entries[0].shopSlug).toBe("otameshi");
    expect((await fetch(s.base + "/data/live/sample.json")).status).toBe(200);
    expect((await fetch(s.base + "/nope.js")).status).toBe(404);
    expect((await fetch(s.base + "/api/live")).status).toBe(200);   // (the stub's null falls through to the sample)
  });
});

describe("the warm-up on the real server: the first visitor after a start finds the shop's list ready", () => {
  test("by default the server asks the platform for each allowlisted shop once at start; the first request is a hit and costs no second call; JPYC_WARM=0 switches it off", async () => {
    mock.reset();
    const warm = await boot({ dataFile: "real-on", env: { JPYC_WARM: "1" } });
    try {
      for (let i = 0; i < 100 && mock.state.upstream < 1; i++) await Bun.sleep(50);
      await Bun.sleep(150);
      expect(mock.state.requests).toEqual(["/api/v1/shops/otameshi/products"]);
      const r = await fetch(warm.base + "/api/jpyc/shops/otameshi/products");
      expect([r.status, r.headers.get("x-jpyc-cache")]).toEqual([200, "hit"]);
      expect(mock.state.upstream).toBe(1);
    } finally { stop(warm); }
    mock.reset();
    const cold = await boot({ dataFile: "real-on", env: { JPYC_WARM: "0" } });
    try { await Bun.sleep(400); expect(mock.state.upstream).toBe(0); const r = await fetch(cold.base + "/api/jpyc/shops/otameshi/products"); expect(r.headers.get("x-jpyc-cache")).toBe("miss"); } finally { stop(cold); }
    expect(readFileSync(join(ROOT, "server/app/server.js"), "utf8")).toContain('warm: process.env.JPYC_WARM !== "0"');   // (on unless switched off)
  }, 30000);
});

describe("a damaged or missing data file never stops the server: the proxy is just empty", () => {
  for (const [name, dataFile] of [["missing", "missing"], ["not JSON", "{ nope"], ["wrong shape", "[1,2,3]"], ["no entries", "{}"]]) {
    test(name, async () => {
      const s = await boot({ dataFile });
      try {
        expect(await (await fetch(s.base + "/healthz")).text()).toBe("ok");
        const r = await fetch(s.base + "/api/jpyc/shops/otameshi/products"); expect(r.status).toBe(404);
      } finally { stop(s); }
    }, 20000);
  }
});

describe("the consent gate on the server: an entry without its record is not served unless JPYC_DEV=1", () => {
  const file = JSON.stringify({ schema: "klc-jpyc-shops/1", version: 1, entries: [
    { id: "jpyc-demo", kind: "demo", enabled: true, ja: "d", en: "d", x: 0, z: 0, shopSlug: "otameshi", consent: null },
    { id: "pending", kind: "kesennuma", ja: "p", en: "p", x: 0, z: 0, shopSlug: "kesen-pending", consent: null },
  ] });
  test("production: only the demo", async () => {
    mock.reset(); mock.state.shops.set("kesen-pending", { shop: { ...mock.state.shops.get("otameshi").shop, slug: "kesen-pending", name: "Pending", is_demo: false }, products: mock.state.shops.get("otameshi").products });
    const s = await boot({ dataFile: file });
    try {
      expect((await fetch(s.base + "/api/jpyc/shops/otameshi/products")).status).toBe(200);
      expect((await fetch(s.base + "/api/jpyc/shops/kesen-pending/products")).status).toBe(404);
    } finally { stop(s); }
  }, 20000);
  test("JPYC_DEV=1: the pending shop is served too", async () => {
    mock.reset(); mock.state.shops.set("kesen-pending", { shop: { ...mock.state.shops.get("otameshi").shop, slug: "kesen-pending", name: "Pending", is_demo: false }, products: mock.state.shops.get("otameshi").products });
    const s = await boot({ dataFile: file, env: { JPYC_DEV: "1" } });
    try { expect((await fetch(s.base + "/api/jpyc/shops/kesen-pending/products")).status).toBe(200); } finally { stop(s); }
  }, 20000);
});

describe("the stand-in's preview mode (--app <dist>): the app, the proxy and the platform's stand-in on one port", () => {
  test("serves the built app and the repo's data/, the proxy routes and the controls; nothing outside the app dir or with a dot segment", async () => {
    const app = mkdtempSync(join(tmpdir(), "klc-jpyc-app-")); dirs.push(app);
    writeFileSync(join(app, "index.html"), "<!doctype html><title>preview</title>"); mkdirSync(join(app, "sub")); writeFileSync(join(app, "sub/a.js"), "export const a = 1;");
    const m = startMock({ port: 0, app });
    try {
      const get = async (p, init) => { const r = await fetch(m.url + p, init); return [r.status, await r.text(), r.headers.get("content-type")]; };
      expect((await get("/"))[1]).toContain("<title>preview</title>"); expect((await get("/index.html"))[0]).toBe(200);
      expect((await get("/sub/a.js"))[1]).toBe("export const a = 1;"); expect((await get("/sub/a.js"))[2]).toMatch(/javascript/);
      expect(JSON.parse((await get("/data/shops/jpyc.json"))[1]).entries[0].shopSlug).toBe("otameshi");
      const api = await get("/api/jpyc/shops/otameshi/products"); expect(api[0]).toBe(200); expect(JSON.parse(api[1]).shop.is_demo).toBe(true);
      expect((await get("/__mock/state"))[0]).toBe(200);
      for (const p of ["/../etc/passwd", "/sub/../../x", "/%2e%2e/x", "/data/../package.json", "/.env", "/nope.js", "/data/.hidden"]) expect([p, (await get(p))[0]]).toEqual([p, 404]);
      expect((await get("/", { method: "POST", body: "x" }))[0]).toBe(404);
    } finally { m.stop(); }
    const bare = startMock({ port: 0 });
    try { expect((await (await fetch(bare.url + "/")).text())).toBe("not found"); } finally { bare.stop(); }   // (without --app it serves no files at all)
  });
});

describe("the public mirror (the public mirror) lets the proxy's two routes through, and nothing near them", () => {
  test("allowed: /api/jpyc/shops/:slug/products and /api/jpyc/products/:id; refused: the rest of the prefix, longer paths, traversal, other jpyc-looking paths", async () => {
    const { allowed } = await import("../scripts/public-mirror.js");
    for (const p of ["/api/jpyc/shops/otameshi/products", "/api/jpyc/products/e899a1dd-754d-4a97-b07b-58fcd5940e36", "/api/jpyc/shops/a_b-9/products"]) expect([p, allowed(p)]).toEqual([p, true]);
    for (const p of ["/api/jpyc", "/api/jpyc/", "/api/jpyc/shops", "/api/jpyc/shops/otameshi", "/api/jpyc/shops/otameshi/products/x", "/api/jpyc/shops//products", "/api/jpyc/shops/a.b/products", "/api/jpyc/shops/../live/products",
      "/api/jpyc/products", "/api/jpyc/products/a/b", "/api/jpyc/checkout", "/api/jpycx/shops/a/products", "/api/jpyc/shops/" + "x".repeat(65) + "/products", "/api/jpyc/shops/a%2Fb/products"]) expect([p, allowed(p)]).toEqual([p, false]);
  });
});

describe("staging: stage.sh puts jpyc.js beside server.js and the allowlist file in data/", () => {
  const sh = readFileSync(join(ROOT, "server/app/stage.sh"), "utf8"), srv = readFileSync(join(ROOT, "server/app/server.js"), "utf8");
  test("the three server files and the two data files are in the bundle recipe", () => {
    for (const f of ["server.js", "static.js", "jpyc.js"]) expect(sh).toContain(`git -C "$REPO" show "$C:server/app/${f}" > "$OUT/${f}"`);
    expect(sh).toMatch(/data\/ui-jpyc-i18n\.json data\/shops( \$\(present [^)]*\))? \| tar -x -C "\$OUT"/);   // (optional paths a later commit may have, e.g. data/play) expect(sh).toContain("data/ui-jpyc-i18n.json");   // (the whole data/shops/ directory, as data/anime and data/ship are, so the allowlist and anything beside it is staged)
  });
  test("the bundle never carries the e2e's screenshots: JPYC_SHOTS=dist/jpyc-shots is a documented way to run it, and stage.sh rsyncs everything else in dist/ into public/", () => {
    expect(sh).toContain("--exclude 'jpyc-shots*'");
    expect(sh.indexOf("--exclude 'jpyc-shots*'")).toBeLessThan(sh.indexOf('"$DIST"/ "$OUT/public/"'));
  });
  test("server.js imports jpyc.js as a sibling (bundle-relative), reads the allowlist from data/, routes /api/jpyc before the static files and stays read-only", () => {
    expect(srv).toContain('import { buildAllowlist, createJpycProxy } from "./jpyc.js"');
    expect(srv).toContain('join(DATA, "shops/jpyc.json")');
    expect(srv).toContain('if (p === "/api/jpyc" || p.startsWith("/api/jpyc/")) return jpyc.handle(p, req.method);');
    expect(srv.indexOf("/api/jpyc/")).toBeLessThan(srv.indexOf('p.startsWith("/data/")'));
    expect(srv).toContain('req.method !== "GET" && req.method !== "HEAD"');
    expect(srv).toMatch(/idleTimeout: 30/);   // (Bun's default of 10 s is the proxy's own deadline: a request that waits for the platform would be cut by the server first)
    expect(srv).not.toMatch(/process\.env\.JPYC_EC_BASE\s*\?\?\s*"http:/);
  });
  test("server/app/README.md names jpyc.js, the allowlist file and the probe (a bundle without jpyc.js dies at the import)", () => {
    const readme = readFileSync(join(ROOT, "server/app/README.md"), "utf8");
    for (const s of ["jpyc.js", "data/shops/jpyc.json", "/api/jpyc/shops/otameshi/products", "A missing `jpyc.js` kills the start"]) expect([s, readme.includes(s)]).toEqual([s, true]);
  });
  test("jpyc.js has no relative imports (it is copied flat) and no Bun or node globals at the top level", () => {
    const src = readFileSync(join(ROOT, "server/app/jpyc.js"), "utf8");
    expect(src).not.toMatch(/^import /m); expect(src).not.toMatch(/\bBun\./); expect(src).not.toMatch(/require\(/);
  });
});
