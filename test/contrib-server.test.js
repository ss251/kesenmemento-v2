// Contributor backend over a real socket: start() on 127.0.0.1:8982, plain fetch() clients. Covers what in-process
// tests cannot: Bun.serve's own limits and address reporting, real multipart framing, CORS preflights on the wire,
// graceful shutdown. (No subprocess is spawned: the CLI main is a thin wrapper around start().)
import { describe, test as bunTest, expect, afterAll, beforeAll } from "bun:test";
// a loaded machine (the gate runs tests at background priority) is many times slower than an idle one: generous per-test timeout
const test = (name, fn) => bunTest(name, fn, 60_000);
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, ConfigError, loadConfig, installProcessGuards } from "../server/contrib/index.js";
import { EventEmitter } from "node:events";
import { createLogger } from "../server/contrib/log.js";
import { ADMIN_TOKEN, TOKEN_SECRET } from "../tools/contrib/testkit.mjs";
import { synthJpeg, synthScreenshot } from "../tools/contrib/synth.mjs";
import { startDev, DEV_ADMIN_TOKEN } from "../tools/contrib/dev-server.mjs";

const PORT = 8982;
const lines = [];
let srv, dir, base;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "contrib-server-"));
  srv = await start({
    port: PORT, adminToken: ADMIN_TOKEN, tokenSecret: TOKEN_SECRET, dbPath: join(dir, "data", "contrib.db"), diskDir: join(dir, "data", "files"),
    maxPhotos: 2, maxPhotoMb: 0.5, maxShotMb: 0.5, rateLimitPerMinute: 60, logger: createLogger({ write: (l) => lines.push(l) }),
  });
  base = srv.url;
});
afterAll(async () => { await srv?.stop(); });

const json = (path, init = {}) => fetch(base + "/api/contrib/v1" + path, init).then(async (r) => ({ status: r.status, headers: r.headers, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() }));
const post = (path, body, headers = {}) => json(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("the server on a real port", () => {
  test("it listens where it was told, reports its url, and answers health with the security headers", async () => {
    expect(srv.port).toBe(PORT);
    expect(base).toBe(`http://127.0.0.1:${PORT}`);
    const r = await json("/health");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, storage: "disk" });
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-request-id")).toBeTruthy();
  });
  test("the data directory was created with a self-ignoring .gitignore (databases and photos must never be committed)", () => {
    expect(existsSync(join(dir, "data", "contrib.db"))).toBe(true);
    expect(existsSync(join(dir, "data", ".gitignore"))).toBe(true);
  });
  test("a full flow over HTTP: create a contributor, submit with a screenshot and a photo, the admin accepts it, the leaderboard and CSV follow", async () => {
    const created = await post("/contributors", { nickname: "さくら", crewNo: "1234-5678-9012-34" });
    expect(created.status).toBe(201);
    const auth = { authorization: `Bearer ${created.body.token}` };
    const fd = new FormData();
    fd.append("pose", JSON.stringify({ enu: [12, 1.6, -34], heading: 90, pitch: -3, fov: 60, mode: "walk" }));
    fd.append("category", "sign"); fd.append("note", "看板が違います"); fd.append("lang", "ja"); fd.append("consent", "1");
    fd.append("screenshot", new File([await synthScreenshot({ width: 640, height: 360 })], "s.jpg", { type: "image/jpeg" }));
    fd.append("photos", new File([await synthJpeg({ width: 640, height: 480, lat: 38.9065, lon: 141.5752 })], "p.jpg", { type: "image/jpeg" }));
    const sub = await json("/submissions", { method: "POST", headers: auth, body: fd });
    expect(sub.status).toBe(201);
    expect(sub.body).toMatchObject({ status: "new", kind: "fix", photos: 1 });
    const admin = { authorization: `Bearer ${ADMIN_TOKEN}` };
    const review = await post(`/admin/submissions/${sub.body.id}`, { status: "accepted" }, admin);
    expect(review.body).toMatchObject({ status: "accepted", points: 20 });
    expect((await json("/leaderboard")).body).toEqual([{ nickname: "さくら", accepted: 1, points: 20 }]);
    const me = await json("/me", { headers: auth });
    expect(me.body).toMatchObject({ points: 20, rank: 1, submissions: [{ status: "accepted", points: 20 }] });
    const csv = await fetch(base + "/api/contrib/v1/admin/export/crew.csv", { headers: admin });
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('crew_no,nickname,points,accepted\r\n="12345678901234",さくら,20,1\r\n');
    const img = await fetch(base + review.body.photos[0].previewUrl, { headers: admin });
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect((await fetch(base + review.body.photos[0].previewUrl)).status).toBe(401);
  });
  test("CORS on the wire: an allowed origin gets its preflight answered; an unlisted one is refused", async () => {
    const pre = await fetch(`${base}/api/contrib/v1/submissions`, { method: "OPTIONS", headers: { origin: "http://localhost:8787", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("http://localhost:8787");
    expect(pre.headers.get("access-control-allow-headers")).toContain("Authorization");
    const evil = await fetch(`${base}/api/contrib/v1/leaderboard`, { headers: { origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const own = await fetch(`${base}/api/contrib/v1/leaderboard`, { headers: { origin: base } });
    expect(own.status).toBe(200);
  });
  test("an oversized body is refused by the HTTP layer itself (413) before it is buffered", async () => {
    const me = await post("/contributors", {});
    const limit = 2 * 0.5 * 1024 * 1024 + 0.5 * 1024 * 1024 + 1024 * 1024; // MAX_PHOTOS * photo + screenshot + 1 MiB of slack
    const big = new Uint8Array(Math.ceil(limit) + 512 * 1024);
    const res = await fetch(`${base}/api/contrib/v1/submissions`, { method: "POST", headers: { authorization: `Bearer ${me.body.token}`, "content-type": "multipart/form-data; boundary=XYZ" }, body: big }).catch((e) => e);
    // Bun answers 413 and may close the socket while the client is still sending; either is a refusal
    if (res instanceof Response) expect(res.status).toBe(413); else expect(String(res)).toMatch(/closed|reset|abort|socket|connection/i);
    expect((await json("/health")).status).toBe(200); // and the server is fine
  });
  test("the rate limiter sees the real socket address (all requests here come from loopback and share a quota)", async () => {
    let limited = 0;
    for (let i = 0; i < 70; i++) { const r = await fetch(`${base}/api/contrib/v1/leaderboard`); if (r.status === 429) limited++; }
    expect(limited).toBeGreaterThan(0);
    const r = await fetch(`${base}/api/contrib/v1/leaderboard`);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await fetch(`${base}/api/contrib/v1/health`)).status).toBe(200); // health is exempt
  });
  test("HEAD and the admin page work over HTTP, with the strict policy", async () => {
    const h = await fetch(`${base}/api/contrib/v1/health`, { method: "HEAD" });
    expect(h.status).toBe(200);
    const page = await fetch(`${base}/admin`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await page.text()).toContain('<script type="module" src="/admin/app.js"></script>');
  });
  test("what the server logged holds no secret, no address and no content", () => {
    const logged = lines.join("\n");
    expect(logged).toContain("server.started");
    expect(logged).toContain('"route":"submissions.create"');
    for (const needle of [ADMIN_TOKEN, TOKEN_SECRET, "さくら", "看板", "127.0.0.1:", "1234-5678", "12345678901234", "38.9065"]) expect(logged).not.toContain(needle);
  });
});

describe("starting and stopping", () => {
  test("a missing or short admin token stops start() with a ConfigError that names the variable but not its value", async () => {
    await expect(start({ port: 8983, tokenSecret: TOKEN_SECRET, env: {}, dbPath: ":memory:" })).rejects.toBeInstanceOf(ConfigError);
    let msg = "";
    try { await start({ port: 8983, adminToken: "short-token", tokenSecret: TOKEN_SECRET, env: {}, dbPath: ":memory:" }); } catch (e) { msg = e.message; }
    expect(msg).toContain("ADMIN_TOKEN must be at least 24 characters");
    expect(msg).not.toContain("short-token");
  });
  test("stop() closes the port and the database; the service can be started again on the same port", async () => {
    const d = mkdtempSync(join(tmpdir(), "contrib-restart-"));
    const opts = { port: 8983, adminToken: ADMIN_TOKEN, tokenSecret: TOKEN_SECRET, dbPath: join(d, "c.db"), diskDir: join(d, "f"), logger: createLogger({ level: "silent" }) };
    const a = await start(opts);
    const me = await fetch(`${a.url}/api/contrib/v1/contributors`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.json());
    await a.stop();
    await expect(fetch(`${a.url}/api/contrib/v1/health`)).rejects.toThrow();
    const b = await start(opts); // same database file, same port
    expect((await fetch(`${b.url}/api/contrib/v1/me`, { headers: { authorization: `Bearer ${me.token}` } })).status).toBe(200); // the contributor survived the restart
    await b.stop();
  });
  test("a stray promise rejection is logged by its class name only (Bun would otherwise end the process and cut every upload in flight)", () => {
    const proc = new EventEmitter(), logged = [];
    installProcessGuards(createLogger({ write: (l) => logged.push(l) }), proc);
    expect(proc.listenerCount("unhandledRejection")).toBe(1);
    proc.emit("unhandledRejection", Object.assign(new Error("secret detail: Bearer abc.def crew 12345678901234 /Users/someone/db"), { name: "TypeError" }));
    proc.emit("unhandledRejection", "just a string");
    proc.emit("unhandledRejection", undefined);
    expect(logged.length).toBe(3);
    expect(logged[0]).toContain('"event":"unhandled.rejection"');
    expect(logged[0]).toContain("TypeError");
    expect(logged.join("\n")).not.toMatch(/secret detail|Bearer|12345678901234|Users/);
    expect(proc.listenerCount("uncaughtException")).toBe(0); // an uncaught exception still ends the process
    // a logger that throws must not turn the guard into the next crash
    const broken = new EventEmitter();
    installProcessGuards({ error() { throw new Error("disk full"); } }, broken);
    expect(() => broken.emit("unhandledRejection", new Error("x"))).not.toThrow();
  });
  test("configuration comes from the environment when no overrides are given", async () => {
    const d = mkdtempSync(join(tmpdir(), "contrib-env-"));
    const s = await start({ env: { PORT: "8983", ADMIN_TOKEN, TOKEN_SECRET, DB_PATH: join(d, "e.db"), DISK_DIR: join(d, "f"), ALLOWED_ORIGINS: "https://only.example" }, logger: createLogger({ level: "silent" }) });
    expect(s.port).toBe(8983);
    expect((await fetch(`${s.url}/api/contrib/v1/leaderboard`, { headers: { origin: "https://only.example" } })).status).toBe(200);
    expect((await fetch(`${s.url}/api/contrib/v1/leaderboard`, { headers: { origin: "http://localhost:8787" } })).status).toBe(403);
    await s.stop();
    expect(loadConfig({ ADMIN_TOKEN, TOKEN_SECRET }, {}).port).toBe(8788);
  });
});

describe("the development server (tools/contrib/dev-server.mjs)", () => {
  test("it binds loopback with a throwaway data directory, allows the app origins it is given, and can seed demo data", async () => {
    const dev = await startDev({ port: 8983, origins: ["http://127.0.0.1:8985"], seed: true, quiet: true });
    try {
      expect(dev.url).toBe("http://127.0.0.1:8983");
      const stats = await fetch(`${dev.url}/api/contrib/v1/admin/stats`, { headers: { authorization: `Bearer ${DEV_ADMIN_TOKEN}` } }).then((r) => r.json());
      expect(stats.byStatus).toEqual({ new: 7, accepted: 3, used: 1, rejected: 1 });
      expect((await fetch(`${dev.url}/api/contrib/v1/leaderboard`, { headers: { origin: "http://127.0.0.1:8985" } })).status).toBe(200);
      expect((await fetch(`${dev.url}/api/contrib/v1/leaderboard`, { headers: { origin: "http://localhost:8787" } })).status).toBe(200); // the service's defaults stay
      expect((await fetch(`${dev.url}/api/contrib/v1/leaderboard`, { headers: { origin: "https://evil.example" } })).status).toBe(403);
      expect(dev.dir).toContain("klc-contrib-dev-");
    } finally { await dev.stop(); }
    await expect(fetch(`${dev.url}/api/contrib/v1/health`)).rejects.toThrow();
  });
});

describe("refusals sent before the upload has arrived", () => {
  // Reproduced with Bun's own fetch against a bare Bun.serve that does not read the body: every other round of
  // concurrent big uploads came back as a bare 400 (sometimes 431) because the unread body desynchronised the reused
  // connections. The service now takes the body off the connection before it refuses, so every answer is the real one.
  test("big uploads refused early (no valid token) always get their own 401, and the next request on the connection is fine", async () => {
    const d = mkdtempSync(join(tmpdir(), "contrib-desync-"));
    const s = await start({ port: 8983, adminToken: ADMIN_TOKEN, tokenSecret: TOKEN_SECRET, dbPath: join(d, "c.db"), diskDir: join(d, "f"), rateLimitPerMinute: 100000, logger: createLogger({ level: "silent" }) });
    try {
      const api = `${s.url}/api/contrib/v1`;
      const photo = new Uint8Array(1_200_000).fill(7);
      const upload = async () => {
        const fd = new FormData();
        fd.append("consent", "1");
        fd.append("photos", new File([photo], "a.jpg", { type: "image/jpeg" }));
        fd.append("photos", new File([photo], "b.jpg", { type: "image/jpeg" }));
        const r = await fetch(`${api}/submissions`, { method: "POST", headers: { authorization: "Bearer nobody.not-a-secret" }, body: fd });
        const body = (await r.json().catch(() => null)) ?? {};
        return `${r.status}:${body.error ?? ""}`;
      };
      const seen = [];
      for (let round = 0; round < 4; round++) {
        seen.push(...await Promise.all(Array.from({ length: 10 }, upload)));
        const health = await fetch(`${api}/health`);
        seen.push(`health ${health.status}`);
        await health.text();
      }
      expect([...new Set(seen)].sort()).toEqual(["401:unauthorized", "health 200"]);
      expect(seen.length).toBe(44);
    } finally { await s.stop(); }
  });
});
