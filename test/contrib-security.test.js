// Contributor backend: the security building blocks, tested in isolation (auth hashing, constant-time compares,
// rate limiter, upload gate, client IP, bounded body reads, CORS, PII-free logging).
import { describe, test, expect } from "bun:test";
import { createAuth } from "../server/contrib/auth.js";
import { createWindowCounter, createGate, GateBusyError, normalizeIp, clientIp } from "../server/contrib/limits.js";
import { HttpError, errorResponse, json, readBody, readJson, multipartBoundary, countMultipartParts, originAllowed, forwardedHosts, preflight, applyCors, tooMany, unauthorized } from "../server/contrib/http.js";
import { createLogger, SAFE_KEYS } from "../server/contrib/log.js";
import { safeEqualHex, safeEqualStr, randomId, randomBase32, stripUnsafeChars, cpLength, iso, makeDataDir, CROCKFORD } from "../server/contrib/util.js";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEYS = { tokenSecret: "tok-secret-" + "k".repeat(24), adminToken: "admin-token-" + "a".repeat(24) };

describe("contributor tokens", () => {
  const auth = createAuth(KEYS);
  test("a token is <id>.<secret>; only a keyed hash of the secret is ever stored", () => {
    const t = auth.newToken("abcDEF123456");
    const [id, secret] = [t.token.slice(0, t.token.indexOf(".")), t.token.slice(t.token.indexOf(".") + 1)];
    expect(id).toBe("abcDEF123456");
    expect(secret.length).toBeGreaterThanOrEqual(43); // 32 random bytes in base64url
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.hash).not.toContain(secret);
    expect(auth.parseToken(t.token)).toEqual({ id, secret });
  });
  test("the hash depends on TOKEN_SECRET: the same secret hashes differently under another key", () => {
    const other = createAuth({ ...KEYS, tokenSecret: "another-secret-" + "z".repeat(20) });
    expect(auth.hashSecret("same")).not.toBe(other.hashSecret("same"));
    expect(auth.hashSecret("same")).toBe(auth.hashSecret("same"));
  });
  test("two tokens for one contributor are independent; a wrong secret never matches", () => {
    const a = auth.newToken("contributor-1"), b = auth.newToken("contributor-1");
    expect(a.token).not.toBe(b.token);
    const sa = auth.parseToken(a.token).secret, sb = auth.parseToken(b.token).secret;
    expect(auth.matches(sa, [a.hash, b.hash])).toBe(true);
    expect(auth.matches(sb, [a.hash, b.hash])).toBe(true);
    expect(auth.matches("x".repeat(43), [a.hash, b.hash])).toBe(false);
    expect(auth.matches(sa, [])).toBe(false); // unknown contributor
    expect(auth.matches(sa, [b.hash])).toBe(false);
  });
  test("match() says which stored hash a secret belongs to (so a device can sign the others out), or null", () => {
    const a = auth.newToken("contributor-1"), b = auth.newToken("contributor-1");
    const sa = auth.parseToken(a.token).secret, sb = auth.parseToken(b.token).secret;
    expect(auth.match(sa, [a.hash, b.hash])).toBe(a.hash);
    expect(auth.match(sb, [a.hash, b.hash])).toBe(b.hash);
    expect(auth.match(sb, [a.hash])).toBeNull();
    expect(auth.match(sa, [])).toBeNull();
    expect(auth.match("z".repeat(43), [a.hash, b.hash])).toBeNull();
  });
  test("malformed credentials are refused before any lookup", () => {
    for (const bad of [null, undefined, "", "nodot", ".secret", "id.", "short.short", "a b.c d", "../etc.passwd", "id.secret with space", "x".repeat(300), 42]) expect(auth.parseToken(bad)).toBeNull();
  });
  test("the Authorization header must be `Bearer <credential>`", () => {
    const req = (h) => new Request("http://x.test/", { headers: h ? { authorization: h } : {} });
    expect(auth.bearer(req("Bearer abc.def"))).toBe("abc.def");
    expect(auth.bearer(req("bearer abc.def"))).toBe("abc.def");
    expect(auth.bearer(req("Basic abc"))).toBeNull();
    expect(auth.bearer(req("Bearer"))).toBeNull();
    expect(auth.bearer(req("Bearer a b"))).toBeNull();
    expect(auth.bearer(req("Bearer " + "x".repeat(500)))).toBeNull();
    expect(auth.bearer(req(null))).toBeNull();
  });
  test("transfer codes are hashed under their own domain: a code hash is never a token hash", () => {
    expect(auth.hashCode("K7QM2XHD9P")).not.toBe(auth.hashSecret("K7QM2XHD9P"));
  });
});

describe("admin token", () => {
  const auth = createAuth(KEYS);
  test("only the exact token passes (no prefix, suffix, case change, empty or non-string)", () => {
    expect(auth.isAdmin(KEYS.adminToken)).toBe(true);
    for (const bad of [KEYS.adminToken.slice(1), KEYS.adminToken + "x", KEYS.adminToken.toUpperCase(), "", null, undefined, 5, KEYS.tokenSecret, " " + KEYS.adminToken]) expect(auth.isAdmin(bad)).toBe(false);
  });
  test("constant-time helpers compare hex and arbitrary strings of any length without throwing", () => {
    expect(safeEqualHex("abcd", "abcd")).toBe(true);
    expect(safeEqualHex("abcd", "abce")).toBe(false);
    expect(safeEqualHex("abcd", "abcdef")).toBe(false);
    expect(safeEqualHex("", "")).toBe(false);
    expect(safeEqualHex("abc", "abc")).toBe(false); // odd length is not hex bytes
    expect(safeEqualHex(null, "ab")).toBe(false);
    expect(safeEqualStr("same", "same")).toBe(true);
    expect(safeEqualStr("a", "aaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(safeEqualStr("", "")).toBe(true);
  });
});

describe("random ids and text helpers", () => {
  test("ids are url-safe, never start with - or _, and do not repeat", () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const id = randomId(12);
      expect(id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{15}$/);
      seen.add(id);
    }
    expect(seen.size).toBe(2000);
  });
  test("base32 strings use the Crockford alphabet only (no I, L, O, U)", () => {
    const s = randomBase32(2000);
    for (const ch of s) expect(CROCKFORD).toContain(ch);
    expect(new Set(s).size).toBe(32); // all symbols occur
    expect(randomBase32(16, true)).toMatch(/^[0-9a-hjkmnp-tv-z]{16}$/);
    expect(CROCKFORD).not.toMatch(/[ILOU]/);
  });
  test("stripUnsafeChars, cpLength and iso", () => {
    expect(stripUnsafeChars("a\u0000b\nc\td", false)).toBe("abcd");
    expect(stripUnsafeChars("a\nb\tc\u0007", true)).toBe("a\nb\tc");
    expect(cpLength("a😀b")).toBe(3);
    expect(iso(Date.UTC(2026, 9, 5, 1, 2, 3, 4))).toBe("2026-10-05T01:02:03.004Z");
  });
  test("makeDataDir creates a private directory that ignores itself in git", () => {
    const dir = mkdtempSync(join(tmpdir(), "contrib-dd-"));
    makeDataDir(join(dir, ".contrib", "files"));
    expect(readFileSync(join(dir, ".contrib", ".gitignore"), "utf8")).toBe("*\n");
    expect(existsSync(join(dir, ".contrib", "files"))).toBe(true);
    makeDataDir(join(dir, ".contrib", "files")); // idempotent
  });
});

describe("rate limiting", () => {
  const clock = (start = 1_000_000) => { let t = start; return { now: () => t, advance: (ms) => { t += ms; } }; };
  test("take() allows `limit` events per window and tells when to retry", () => {
    const c = clock(), w = createWindowCounter({ now: c.now });
    for (let i = 0; i < 3; i++) expect(w.take("k", 3, 1000).ok).toBe(true);
    const blocked = w.take("k", 3, 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
    c.advance(400);
    expect(w.take("k", 3, 1000)).toMatchObject({ ok: false, retryAfterMs: 600 });
    c.advance(601);
    expect(w.take("k", 3, 1000).ok).toBe(true); // the oldest events expired together
  });
  test("a rejected attempt does not extend its own lock-out; the window slides", () => {
    const c = clock(), w = createWindowCounter({ now: c.now });
    w.take("k", 1, 1000);
    c.advance(900);
    expect(w.take("k", 1, 1000).ok).toBe(false);
    c.advance(101);
    expect(w.take("k", 1, 1000).ok).toBe(true);
  });
  test("keys are independent; count/add/retryAfter/reset behave", () => {
    const c = clock(), w = createWindowCounter({ now: c.now });
    w.add("a", 1000); w.add("a", 1000); w.add("b", 1000);
    expect(w.count("a", 1000)).toBe(2);
    expect(w.count("b", 1000)).toBe(1);
    expect(w.retryAfter("a", 2, 1000)).toBe(1000);
    expect(w.retryAfter("a", 3, 1000)).toBe(0);
    w.reset("a");
    expect(w.count("a", 1000)).toBe(0);
    c.advance(1001);
    expect(w.count("b", 1000)).toBe(0);
  });
  test("memory is bounded: idle keys are swept and the oldest keys are evicted past maxKeys", () => {
    const c = clock(), w = createWindowCounter({ now: c.now, maxKeys: 50 });
    for (let i = 0; i < 200; i++) { w.add(`ip:${i}`, 60_000); }
    expect(w.size).toBeLessThanOrEqual(50);
    const w2 = createWindowCounter({ now: c.now });
    w2.add("x", 1000);
    c.advance(5000);
    w2.sweep();
    expect(w2.size).toBe(0);
  });
});

describe("upload gate", () => {
  test("lets `max` holders in, queues the next, refuses beyond the queue, and wakes waiters in order", async () => {
    const g = createGate(1, { maxQueue: 1, waitMs: 5000 });
    const r1 = await g.acquire();
    expect(g.active).toBe(1);
    let second = false;
    const p2 = g.acquire().then((r) => { second = true; return r; });
    await Bun.sleep(5);
    expect(second).toBe(false);
    expect(g.queued).toBe(1);
    await expect(g.acquire()).rejects.toBeInstanceOf(GateBusyError); // queue full
    r1();
    const r2 = await p2;
    expect(second).toBe(true);
    expect(g.active).toBe(1);
    r2(); r2(); // double release is harmless
    expect(g.active).toBe(0);
  });
  test("a waiter gives up after waitMs", async () => {
    const g = createGate(1, { maxQueue: 2, waitMs: 20 });
    const r1 = await g.acquire();
    await expect(g.acquire()).rejects.toBeInstanceOf(GateBusyError);
    expect(g.queued).toBe(0);
    r1();
    const r = await g.acquire();
    r();
  });
});

describe("client address", () => {
  test("normalizeIp: IPv4 as is, ports and zones dropped, IPv4-mapped IPv6 unwrapped, IPv6 collapsed to its /64", () => {
    expect(normalizeIp("203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeIp("203.0.113.9:51234")).toBe("203.0.113.9");
    expect(normalizeIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeIp("[2001:db8:1:2:aaaa:bbbb:cccc:dddd]:443")).toBe(normalizeIp("2001:db8:1:2:1:2:3:4"));
    expect(normalizeIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(normalizeIp("fe80::1%en0")).toBe("fe80:0:0:0::/64");
    expect(normalizeIp("::1")).toBe("0:0:0:0::/64");
    for (const bad of ["", null, undefined, "not an ip", "300.1.1.1", "1.2.3", "2001:db8:::1", "12345::1", "[::1", "1:2:3:4:5:6:7:8:9"]) expect(normalizeIp(bad)).toBeNull();
  });
  const srv = (address) => ({ requestIP: () => ({ address }) });
  const req = (xff) => new Request("http://x.test/", { headers: xff ? { "x-forwarded-for": xff } : {} });
  test("without proxy trust the socket address is used and X-Forwarded-For is ignored (it can be forged)", () => {
    expect(clientIp(req("1.1.1.1"), srv("203.0.113.9"), 0)).toBe("203.0.113.9");
    expect(clientIp(req(), srv("203.0.113.9"), 0)).toBe("203.0.113.9");
    expect(clientIp(req(), undefined, 0)).toBe("unknown");
    expect(clientIp(req(), { requestIP: () => { throw new Error("boom"); } }, 0)).toBe("unknown");
  });
  test("with one trusted proxy hop the right-most entry is the client; entries to its left are client-supplied", () => {
    expect(clientIp(req("6.6.6.6, 198.51.100.7"), srv("10.0.0.1"), 1)).toBe("198.51.100.7");
    expect(clientIp(req("198.51.100.7"), srv("10.0.0.1"), 1)).toBe("198.51.100.7");
    expect(clientIp(req("6.6.6.6, 198.51.100.7, 10.1.1.1"), srv("10.0.0.1"), 2)).toBe("198.51.100.7");
    expect(clientIp(req("198.51.100.7"), srv("10.0.0.1"), 3)).toBe("198.51.100.7"); // shorter chain than trusted hops: the left-most
    expect(clientIp(req(), srv("203.0.113.9"), 1)).toBe("203.0.113.9"); // no header: the socket
    expect(clientIp(req("garbage"), srv("203.0.113.9"), 1)).toBe("203.0.113.9");
  });
});

describe("bounded body reads", () => {
  const streamOf = (chunks, onCancel) => new ReadableStream({
    start(c) { for (const ch of chunks) c.enqueue(ch); c.close(); },
    cancel() { onCancel?.(); },
  });
  const post = (body, headers = {}) => new Request("http://x.test/", { method: "POST", body, headers, duplex: "half" });

  test("a body within the limit is returned whole, from one chunk or many", async () => {
    const one = await readBody(post(new Uint8Array(100).fill(7)), 1000);
    expect(one.byteLength).toBe(100);
    const many = await readBody(post(streamOf([new Uint8Array(300).fill(1), new Uint8Array(300).fill(2), new Uint8Array(300).fill(3)])), 1000);
    expect(many.byteLength).toBe(900);
    expect([many[0], many[300], many[899]]).toEqual([1, 2, 3]);
    expect((await readBody(post(null), 10)).byteLength).toBe(0);
  });
  test("an honest Content-Length over the limit is refused without consuming the body", async () => {
    const req = post(new Uint8Array(10), { "content-length": "5000" });
    let e;
    try { await readBody(req, 1000); } catch (x) { e = x; }
    expect(e).toBeInstanceOf(HttpError);
    expect(e.status).toBe(413);
    expect(e.code).toBe("payload_too_large");
    expect(req.bodyUsed).toBe(false);
  });
  test("a body that lies about (or omits) Content-Length is cut off as soon as it passes the limit, and the stream is cancelled", async () => {
    let cancelled = false;
    const big = streamOf([new Uint8Array(400), new Uint8Array(400), new Uint8Array(400), new Uint8Array(400)], () => { cancelled = true; });
    let e;
    try { await readBody(post(big), 1000); } catch (x) { e = x; }
    expect(e?.status).toBe(413);
    expect(cancelled).toBe(true);
  });
  test("readJson: empty body is {}, JSON object only, content type required when there is a body", async () => {
    const j = (body, ct = "application/json") => post(body, ct ? { "content-type": ct } : {});
    expect(await readJson(post(null))).toEqual({});
    expect(await readJson(j('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJson(j('{"a":1}', "application/json; charset=utf-8"))).toEqual({ a: 1 });
    expect(await readJson(j('{"a":1}', "application/vnd.api+json"))).toEqual({ a: 1 });
    const code = async (req) => { try { await readJson(req); return "ok"; } catch (e) { return `${e.status}:${e.code}`; } };
    expect(await code(j('{"a":1}', "text/plain"))).toBe("415:unsupported_media_type");
    expect(await code(j('{"a":1}', null))).toBe("415:unsupported_media_type");
    expect(await code(j("{nope"))).toBe("400:invalid_json");
    expect(await code(j("[1,2]"))).toBe("400:invalid_json");
    expect(await code(j("42"))).toBe("400:invalid_json");
    expect(await code(j("null"))).toBe("400:invalid_json");
    expect(await code(j(new Uint8Array([0xff, 0xfe, 0xfd])))).toBe("400:invalid_json"); // not UTF-8
    expect(await code(j('{"a":"' + "x".repeat(20000) + '"}'))).toBe("413:payload_too_large");
  });
});

describe("multipart helpers", () => {
  test("the boundary is read from the content type, quoted or not", () => {
    expect(multipartBoundary("multipart/form-data; boundary=----abc123")).toBe("----abc123");
    expect(multipartBoundary('multipart/form-data; charset=utf-8; boundary="x y"')).toBe("x y");
    expect(multipartBoundary("MULTIPART/FORM-DATA;boundary=Z")).toBe("Z");
    for (const bad of ["application/json", "multipart/form-data", "multipart/mixed; boundary=x", "", null, undefined]) expect(multipartBoundary(bad)).toBeNull();
  });
  test("delimiters are counted with a byte search, so a body of a million tiny parts is refused before it is parsed", () => {
    const b = "XYZ";
    const body = Buffer.from(["--XYZ\r\nContent-Disposition: form-data; name=a\r\n\r\n1\r\n", "--XYZ\r\nContent-Disposition: form-data; name=b\r\n\r\n2\r\n", "--XYZ--\r\n"].join(""));
    expect(countMultipartParts(body, b)).toBe(3);
    expect(countMultipartParts(Buffer.alloc(10), b)).toBe(0);
    const spam = Buffer.from("--XYZ\r\n".repeat(50000));
    expect(countMultipartParts(spam, b)).toBe(50000);
  });
});

describe("CORS", () => {
  const allowed = ["https://app.example", "http://localhost:8787"];
  const url = new URL("https://contrib.example/api/contrib/v1/me");
  test("allow-listed origins pass; the service's own origin passes; anything else does not; no Origin header is not a browser call", () => {
    expect(originAllowed("https://app.example", url, allowed)).toBe(true);
    expect(originAllowed("http://localhost:8787", url, allowed)).toBe(true);
    expect(originAllowed("https://contrib.example", url, allowed)).toBe(true); // the admin page calling its own API
    expect(originAllowed(null, url, allowed)).toBe(true);
    for (const bad of ["https://evil.example", "http://app.example", "https://app.example.evil.example", "null", "https://app.example:444", "nonsense"]) expect(originAllowed(bad, url, allowed)).toBe(false);
  });
  test("a preflight for an allowed origin lists methods, the headers the app sends and a max age; a response reflects only that origin", () => {
    const r = preflight("https://app.example", url, allowed);
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("https://app.example");
    expect(r.headers.get("access-control-allow-methods")).toContain("PATCH");
    expect(r.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(r.headers.get("access-control-allow-headers")).toContain("Idempotency-Key");
    expect(r.headers.get("access-control-allow-credentials")).toBeNull();
    expect(r.headers.get("vary")).toContain("Origin");
    const h = new Headers();
    applyCors(h, "https://evil.example", url, allowed);
    expect(h.get("access-control-allow-origin")).toBeNull();
    applyCors(h, null, url, allowed);
    expect(h.get("access-control-allow-origin")).toBeNull();
  });
});

describe("forwarded host", () => {
  const req = (v) => new Request("http://x.test/", { headers: v === undefined ? {} : { "x-forwarded-host": v } });
  test("only the first entry, lower-cased and shaped like a host, and only behind a trusted proxy", () => {
    expect(forwardedHosts(req("Contrib.Example.org, other.example"), 1)).toEqual(["contrib.example.org"]);
    expect(forwardedHosts(req("contrib.example.org:8443"), 2)).toEqual(["contrib.example.org:8443"]);
    expect(forwardedHosts(req("contrib.example.org"), 0)).toEqual([]);
    for (const bad of ["", "a b", "evil<script>", "host/path", "user@host", "host:notaport", "x".repeat(10) + ":" + "9".repeat(8)]) expect([bad, forwardedHosts(req(bad), 1)]).toEqual([bad, []]);
    expect(forwardedHosts(req(undefined), 1)).toEqual([]);
  });
  test("originAllowed accepts the service's own host names it is given, by host only", () => {
    const url = new URL("http://127.0.0.1:8788/api");
    expect(originAllowed("https://contrib.example.org", url, [], ["contrib.example.org"])).toBe(true);
    expect(originAllowed("https://contrib.example.org:9999", url, [], ["contrib.example.org"])).toBe(false);
    expect(originAllowed("https://evil.example", url, [], ["contrib.example.org"])).toBe(false);
  });
});

describe("HTTP errors", () => {
  test("an HttpError becomes {error, message} with its status and headers", async () => {
    const r = errorResponse(new HttpError(418, "teapot", "short and stout", { headers: { "x-a": "1" }, extra: { field: "spout" } }));
    expect(r.status).toBe(418);
    expect(r.headers.get("x-a")).toBe("1");
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(await r.json()).toEqual({ error: "teapot", message: "short and stout", field: "spout" });
  });
  test("429 carries Retry-After in whole seconds; 401 advertises the Bearer scheme; json() is never cached", () => {
    const t = tooMany(2500);
    expect(t.status).toBe(429);
    expect(t.headers["retry-after"]).toBe("3");
    expect(unauthorized().headers["www-authenticate"]).toContain("Bearer");
    expect(json({ a: 1 }).headers.get("cache-control")).toBe("no-store");
  });
});

describe("logs hold no personal data", () => {
  test("only whitelisted keys are written; a nickname, note, crew number, token, IP or user agent can never reach a line", () => {
    const lines = [];
    const log = createLogger({ write: (l) => lines.push(l), now: () => 0 });
    log.info("request", {
      method: "POST", route: "submissions.create", status: 201, ms: 12, rid: "abc",
      nickname: "Sakura", note: "my secret note", crewNo: "12345678901234", token: "id.secret", authorization: "Bearer id.secret", ip: "203.0.113.9", ua: "Mozilla/5.0", lat: 38.9, lon: 141.5, exif: { make: "X" }, body: "x",
    });
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]);
    expect(Object.keys(rec).sort()).toEqual(["event", "level", "method", "ms", "rid", "route", "status", "ts"]);
    for (const secret of ["Sakura", "secret note", "12345678901234", "id.secret", "203.0.113.9", "Mozilla", "38.9"]) expect(lines[0]).not.toContain(secret);
    for (const k of Object.keys(rec)) expect(k === "ts" || k === "level" || SAFE_KEYS.has(k)).toBe(true);
  });
  test("values are bounded and stripped of control characters; levels filter", () => {
    const lines = [];
    const log = createLogger({ write: (l) => lines.push(l), level: "warn", now: () => 0 });
    log.info("hidden", { code: "x" });
    log.debug("hidden", { code: "x" });
    log.warn("shown", { code: "a\nb\u0000" + "z".repeat(500) });
    log.error("shown2", { count: 3, ok: true, name: 5, status: "n/a" });
    expect(lines).toHaveLength(2);
    const w = JSON.parse(lines[0]);
    expect(w.code.length).toBeLessThanOrEqual(160);
    expect(w.code).not.toMatch(/[\u0000-\u001F]/);
    expect(JSON.parse(lines[1])).toMatchObject({ level: "error", count: 3 });
  });
});
