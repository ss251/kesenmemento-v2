// Contributor backend: rate limits as the API applies them (the per-submission and claim limits are also covered
// next to their endpoints; here: the per-IP request limit, new contributors, proxy trust, IPv6, exemptions).
import { describe, test as bunTest, expect } from "bun:test";
// a loaded machine (the gate runs tests at background priority) is many times slower than an idle one: generous per-test timeout
const test = (name, fn) => bunTest(name, fn, 60_000);
import { makeApp, fromIp, BASE, API } from "../tools/contrib/testkit.mjs";

const hit = (k, path, ip, extra = {}) => k.app.fetch(new Request(BASE + API + path, extra), fromIp(ip));

describe("requests per network", () => {
  test("every API request counts: past the per-minute limit the answer is 429 with Retry-After, and a new minute resets it", async () => {
    const k = makeApp({ config: { rateLimitPerMinute: 10 } });
    for (let i = 0; i < 10; i++) expect((await hit(k, "/leaderboard", "203.0.113.1")).status).toBe(200);
    const blocked = await hit(k, "/leaderboard", "203.0.113.1");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe("rate_limited");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(59);
    expect((await hit(k, "/leaderboard", "203.0.113.2")).status).toBe(200); // another network
    k.clock.advance(30_000);
    expect((await hit(k, "/leaderboard", "203.0.113.1")).status).toBe(429);
    k.clock.advance(30_001);
    expect((await hit(k, "/leaderboard", "203.0.113.1")).status).toBe(200);
  });
  test("it applies to every kind of route: public, authenticated, admin and unauthenticated", async () => {
    const k = makeApp({ config: { rateLimitPerMinute: 10 } });
    const me = await k.newContributor({}, { ip: "198.51.100.200" });
    for (let i = 0; i < 10; i++) await hit(k, "/me", "203.0.113.9", { headers: { authorization: `Bearer ${me.token}` } });
    for (const path of ["/me", "/leaderboard", "/admin/stats", "/me/transfer-code"]) expect([path, (await hit(k, path, "203.0.113.9")).status]).toEqual([path, 429]);
  });
  test("the health check and the admin page's static files are exempt, so monitoring and page loads never starve the API quota", async () => {
    const k = makeApp({ config: { rateLimitPerMinute: 10 } });
    for (let i = 0; i < 30; i++) {
      expect((await hit(k, "/health", "203.0.113.5")).status).toBe(200);
      expect((await k.app.fetch(new Request(BASE + "/admin"), fromIp("203.0.113.5"))).status).toBe(200);
      expect((await k.app.fetch(new Request(BASE + "/admin/app.js"), fromIp("203.0.113.5"))).status).toBe(200);
    }
    expect((await hit(k, "/leaderboard", "203.0.113.5")).status).toBe(200); // the quota is untouched
  });
  test("the default is 240 requests a minute: generous for a person, not for a script", async () => {
    const k = makeApp();
    expect(k.cfg.limits.perMinuteIp).toBe(240);
    for (let i = 0; i < 240; i++) await hit(k, "/leaderboard", "203.0.113.50");
    expect((await hit(k, "/leaderboard", "203.0.113.50")).status).toBe(429);
  });
});

describe("new contributors", () => {
  test("30 per network per hour by default, then 429; an hour later it works again; other networks are unaffected", async () => {
    const k = makeApp();
    for (let i = 0; i < 30; i++) expect((await k.call("POST", "/contributors", { json: {}, ip: "203.0.113.20" })).status).toBe(201);
    const r = await k.call("POST", "/contributors", { json: {}, ip: "203.0.113.20" });
    expect([r.status, r.body.error]).toEqual([429, "rate_limited"]);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(3500);
    expect((await k.call("POST", "/contributors", { json: {}, ip: "203.0.113.21" })).status).toBe(201);
    k.clock.advance(3600_001);
    expect((await k.call("POST", "/contributors", { json: {}, ip: "203.0.113.20" })).status).toBe(201);
    expect(k.app.db.query("SELECT COUNT(*) AS n FROM contributors").get().n).toBe(32); // 30 + the other network + the one an hour later
  });
  test("the limit is configurable", async () => {
    const k = makeApp({ config: { createPerHour: 2 } });
    for (let i = 0; i < 2; i++) expect((await k.call("POST", "/contributors", { json: {} })).status).toBe(201);
    expect((await k.call("POST", "/contributors", { json: {} })).status).toBe(429);
  });
});

describe("who the client is", () => {
  test("without proxy trust a forged X-Forwarded-For does not buy a fresh quota", async () => {
    const k = makeApp({ config: { rateLimitPerMinute: 10 } });
    for (let i = 0; i < 10; i++) await hit(k, "/leaderboard", "203.0.113.30", { headers: { "x-forwarded-for": `9.9.9.${i}` } });
    expect((await hit(k, "/leaderboard", "203.0.113.30", { headers: { "x-forwarded-for": "8.8.8.8" } })).status).toBe(429);
  });
  test("behind one trusted proxy the right-most entry is the client; entries a client forged on the left are ignored", async () => {
    const k = makeApp({ config: { rateLimitPerMinute: 10, trustProxy: 1 } });
    const asClient = (client, forged = "1.1.1.1") => hit(k, "/leaderboard", "10.0.0.1", { headers: { "x-forwarded-for": `${forged}, ${client}` } });
    for (let i = 0; i < 10; i++) expect((await asClient("198.51.100.7", `6.6.6.${i}`)).status).toBe(200);
    expect((await asClient("198.51.100.7", "7.7.7.7")).status).toBe(429); // forging the left side does not help
    expect((await asClient("198.51.100.8")).status).toBe(200); // a different client behind the same proxy has its own quota
    expect((await hit(k, "/leaderboard", "10.0.0.1")).status).toBe(200); // no header at all: the proxy's own address
  });
  test("two trusted hops (a CDN in front of the platform proxy)", async () => {
    const k = makeApp({ config: { rateLimitPerMinute: 10, trustProxy: 2 } });
    const call = (xff) => hit(k, "/leaderboard", "10.0.0.1", { headers: { "x-forwarded-for": xff } });
    for (let i = 0; i < 10; i++) await call(`1.2.3.${i}, 198.51.100.7, 172.16.0.9`);
    expect((await call("5.5.5.5, 198.51.100.7, 172.16.0.77")).status).toBe(429);
    expect((await call("5.5.5.5, 198.51.100.99, 172.16.0.9")).status).toBe(200);
  });
  test("an IPv6 client is one client per /64: rotating the lower 64 bits (privacy addresses) does not reset its quota", async () => {
    const k = makeApp({ config: { rateLimitPerMinute: 10 } });
    for (let i = 0; i < 10; i++) expect((await hit(k, "/leaderboard", `2001:db8:abcd:12:${i}:${i}:${i}:${i}`)).status).toBe(200);
    expect((await hit(k, "/leaderboard", "2001:db8:abcd:12:ffff:ffff:ffff:ffff")).status).toBe(429);
    expect((await hit(k, "/leaderboard", "2001:db8:abcd:13::1")).status).toBe(200); // a different /64
  });
  test("an IPv4-mapped IPv6 address and a bracketed address with a port are the same client as plain IPv4", async () => {
    const k = makeApp({ config: { rateLimitPerMinute: 10 } });
    const forms = ["203.0.113.60", "::ffff:203.0.113.60", "203.0.113.60:51000", "::ffff:203.0.113.60"];
    for (let i = 0; i < 10; i++) await hit(k, "/leaderboard", forms[i % forms.length]);
    expect((await hit(k, "/leaderboard", "203.0.113.60")).status).toBe(429);
  });
  test("requests with no resolvable address share one bucket rather than bypassing the limit", async () => {
    const k = makeApp({ config: { rateLimitPerMinute: 10 } });
    for (let i = 0; i < 10; i++) await k.app.fetch(new Request(BASE + API + "/leaderboard")); // no server object: unknown address
    expect((await k.app.fetch(new Request(BASE + API + "/leaderboard"))).status).toBe(429);
  });
  test("the rate-limit tables are bounded: a flood of distinct addresses cannot exhaust memory", async () => {
    const k = makeApp({ config: { rateLimitPerMinute: 10 } });
    for (let i = 0; i < 3000; i++) await hit(k, "/leaderboard", `10.${(i >> 8) & 255}.${i & 255}.1`);
    expect(k.app.counter.size).toBeLessThanOrEqual(50000);
    k.clock.advance(10 * 60_000);
    k.app.counter.sweep();
    expect(k.app.counter.size).toBe(0);
  });
});

describe("limits never leak or persist addresses", () => {
  test("no IP address reaches the database, the audit table or the log, however many requests were made", async () => {
    const k = makeApp({ config: { trustProxy: 1 } });
    const me = await k.newContributor({ nickname: "NoIp" }, { ip: "203.0.113.77" });
    await hit(k, "/me", "10.0.0.1", { headers: { authorization: `Bearer ${me.token}`, "x-forwarded-for": "203.0.113.77" } });
    await k.call("POST", "/contributors/claim", { json: { code: "ZZZZZ-ZZZZZ" }, ip: "198.51.100.66" });
    await k.call("GET", "/admin/stats", { admin: "wrong-wrong-wrong-wrong-wrong-wrong", ip: "198.51.100.67" });
    const dump = JSON.stringify(["contributors", "submissions", "photos", "audit", "transfer_codes", "contributor_tokens"].map((t) => k.app.db.query(`SELECT * FROM ${t}`).all())) + k.lines.join("\n");
    for (const ip of ["203.0.113.77", "198.51.100.66", "198.51.100.67", "10.0.0.1"]) expect(dump).not.toContain(ip);
  });
});

describe("transport security headers", () => {
  test("behind a trusted proxy that reports https, responses carry HSTS; direct http and untrusted proxies do not", async () => {
    const proxied = makeApp({ config: { trustProxy: 1 } });
    const https = await hit(proxied, "/health", "10.0.0.1", { headers: { "x-forwarded-proto": "https" } });
    expect(https.headers.get("strict-transport-security")).toBe("max-age=15552000");
    expect((await hit(proxied, "/health", "10.0.0.1", { headers: { "x-forwarded-proto": "http" } })).headers.get("strict-transport-security")).toBeNull();
    expect((await hit(proxied, "/health", "10.0.0.1")).headers.get("strict-transport-security")).toBeNull();
    const direct = makeApp(); // no trusted proxy: the header could be forged, so it is not believed
    expect((await hit(direct, "/health", "10.0.0.1", { headers: { "x-forwarded-proto": "https" } })).headers.get("strict-transport-security")).toBeNull();
  });
});
