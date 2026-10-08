// Test kit for the contributor backend: an in-process app (no socket) with a fake clock, a fake client address and
// helpers to create contributors and submissions from synthetic images. Used by test/contrib-*.test.js and the pull
// tool's tests; nothing here starts a process or opens a port.
//
//   const k = makeApp();
//   const me = await k.newContributor({ nickname: "Sakura" });
//   const sub = await k.submit(me, { note: "sign is wrong", photos: [await synthJpeg({ lat: 38.9, lon: 141.57 })] });
//   const list = await k.call("GET", "/admin/submissions", { admin: true });
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, createApp, createLogger } from "../../server/contrib/index.js";
import { synthScreenshot } from "./synth.mjs";

export const ADMIN_TOKEN = "adm-" + "x".repeat(30);
export const TOKEN_SECRET = "tok-" + "y".repeat(30);
export const BASE = "http://contrib.test";
export const API = "/api/contrib/v1";

/** A clock the test controls: `now()` for the app, `advance(ms)` to move it. Starts 2026-10-05 12:00 JST. */
export function fakeClock(start = Date.UTC(2026, 9, 5, 3, 0, 0)) {
  let t = start;
  return { now: () => t, advance(ms) { t += ms; return t; }, set(ms) { t = ms; return t; } };
}

/** Paths that are not under /api/contrib/v1: the API prefix itself, the service root and the admin page with its assets. */
const isOwnPath = (p) => p.startsWith("/api/") || p === "/" || /^\/admin(?:\/(?:app\.js|lib\.js|app\.css|icon\.svg|nope\.js))?\/?$/.test(p) || p.startsWith("/definitely/");

/** The screenshot a form carries unless a test passes its own: rendered once (image work is the slow part of a test). */
let shotPromise;
const defaultScreenshot = () => (shotPromise ??= synthScreenshot({ width: 800, height: 450 }));

/** The `server` argument of app.fetch(): the socket address the rate limiter sees. */
export const fromIp = (ip) => ({ requestIP: () => ({ address: ip, family: ip.includes(":") ? "IPv6" : "IPv4", port: 51234 }) });

/**
 * @param {object} [o]
 * @param {Record<string, any>} [o.config] overrides for loadConfig (camelCase)
 * @param {number} [o.start] clock start (epoch ms)
 * @param {object} [o.s3Client] fake S3 client (with config.storage = "s3")
 */
export function makeApp({ config = {}, start, s3Client, storage } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "contrib-test-"));
  const clock = fakeClock(start);
  const lines = [];
  const cfg = loadConfig({}, { adminToken: ADMIN_TOKEN, tokenSecret: TOKEN_SECRET, dbPath: ":memory:", diskDir: join(dir, "files"), ...config });
  const app = createApp(cfg, { now: clock.now, logger: createLogger({ write: (l) => lines.push(l), now: clock.now }), s3Client, storage });
  let ip = "203.0.113.10";

  /**
   * One request. `token` is a contributor token, `admin: true` uses the admin token. `json` / `form` / `raw` set the body.
   * Returns `{status, headers, body, res}` where `body` is parsed JSON when the response is JSON, else text.
   */
  async function call(method, path, o = {}) {
    const headers = { ...(o.headers ?? {}) };
    if (o.token) headers.authorization = `Bearer ${o.token}`;
    if (o.admin) headers.authorization = `Bearer ${o.admin === true ? ADMIN_TOKEN : o.admin}`;
    if (o.origin) headers.origin = o.origin;
    let body;
    if (o.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(o.json); }
    else if (o.form) body = o.form;
    else if (o.raw !== undefined) body = o.raw;
    const url = path.startsWith("http") ? path : BASE + (isOwnPath(path) ? path : API + path);
    const res = await app.fetch(new Request(url, { method, headers, body }), fromIp(o.ip ?? ip));
    const ct = res.headers.get("content-type") ?? "";
    let parsed;
    if (ct.includes("json")) parsed = await res.json(); else if (ct.startsWith("text/") || ct.includes("csv")) parsed = await res.text(); else parsed = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, body: parsed, res };
  }

  /** Create a contributor; returns `{id, token, nickname}`. */
  async function newContributor(fields = {}, o = {}) {
    const r = await call("POST", "/contributors", { json: fields, ip: o.ip });
    if (r.status !== 201) throw new Error(`contributor create failed: ${r.status} ${JSON.stringify(r.body)}`);
    return { id: r.body.contributorId, token: r.body.token, nickname: r.body.nickname };
  }

  /**
   * A submission form. `photos` and `screenshot` are byte arrays (or `false` for no screenshot).
   * @param {{pose?: object | string | false, category?: string, kind?: string, note?: string, lang?: string, consent?: string | false, photos?: Uint8Array[], screenshot?: Uint8Array | false, extra?: Record<string, string>, photoTypes?: string[]}} [f]
   */
  async function form(f = {}) {
    const fd = new FormData();
    if (f.pose !== false) fd.append("pose", typeof f.pose === "string" ? f.pose : JSON.stringify(f.pose ?? { enu: [12, 1.6, -34], latlon: [38.9063, 141.5751], heading: 120, pitch: -3, fov: 60, mode: "walk", at: new Date(clock.now()).toISOString(), appVersion: "0.1.0", layoutVersion: "v6", timePreset: "noon", season: "autumn", viewport: { w: 390, h: 844 } }));
    fd.append("category", f.category ?? "sign");
    if (f.kind !== undefined) fd.append("kind", f.kind);
    fd.append("note", f.note ?? "the sign says the wrong thing");
    fd.append("lang", f.lang ?? "en");
    if (f.consent !== false) fd.append("consent", f.consent ?? "1");
    const shot = f.screenshot === false ? null : f.screenshot ?? (await defaultScreenshot());
    if (shot) fd.append("screenshot", new File([shot], "screenshot.jpg", { type: "image/jpeg" }));
    (f.photos ?? []).forEach((bytes, i) => fd.append("photos", new File([bytes], `IMG_${i}.jpg`, { type: f.photoTypes?.[i] ?? "image/jpeg" })));
    for (const [k, v] of Object.entries(f.extra ?? {})) fd.append(k, v);
    return fd;
  }

  /** Submit as `contributor`; returns the call result. */
  async function submit(contributor, f = {}, o = {}) {
    return call("POST", "/submissions", { token: contributor.token, form: await form(f), headers: o.headers, ip: o.ip, origin: o.origin });
  }

  return {
    app, cfg, dir, clock, lines, call, form, submit, newContributor,
    setIp(v) { ip = v; },
    /** Review as admin; returns the call result. */
    review: (id, body) => call("POST", `/admin/submissions/${id}`, { admin: true, json: body }),
    close() { app.close(); },
  };
}
