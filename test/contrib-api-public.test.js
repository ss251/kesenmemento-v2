// Contributor backend: the public API, in-process (no socket): plumbing, CORS, contributors, profile, account
// transfer, leaderboard. Submissions are in contrib-api-submit.test.js, the admin API in contrib-api-admin.test.js.
import { describe, test as bunTest, expect } from "bun:test";
// a loaded machine (the gate runs tests at background priority) is many times slower than an idle one: generous per-test timeout
const test = (name, fn) => bunTest(name, fn, 60_000);
import { makeApp, ADMIN_TOKEN, API, BASE } from "../tools/contrib/testkit.mjs";
import { synthJpeg } from "../tools/contrib/synth.mjs";

const APP_ORIGIN = "https://kesennuma-living-city-production.up.railway.app";

describe("plumbing", () => {
  test("GET /health reports the service, its version and the storage kind", async () => {
    const k = makeApp();
    const r = await k.call("GET", "/health");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, service: "kesennuma-contrib", version: "1.0.0", storage: "disk" });
    expect(r.body.time).toBe("2026-10-05T03:00:00.000Z");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  test("health also tells the app the limits it can check before uploading, and the default points", async () => {
    const k = makeApp({ config: { maxPhotos: 4, maxPhotoMb: 10, maxShotMb: 2, dailyLimit: 7, pointsIssue: 3, pointsFix: 30 } });
    const r = await k.call("GET", "/health");
    expect(r.body.limits).toEqual({ maxPhotos: 4, maxPhotoBytes: 10 * 1024 * 1024, maxScreenshotBytes: 2 * 1024 * 1024, maxNoteChars: 2000, dailyLimit: 7 });
    expect(r.body.points).toEqual({ issue: 3, fix: 30 });
    const d = await makeApp().call("GET", "/health"); // the defaults of the contract
    expect(d.body.limits).toMatchObject({ maxPhotos: 6, maxPhotoBytes: 15 * 1024 * 1024, maxScreenshotBytes: 8 * 1024 * 1024, dailyLimit: 20 });
    expect(d.body.points).toEqual({ issue: 5, fix: 20 });
    expect(JSON.stringify(d.body)).not.toMatch(/token|secret|path|dir/i); // nothing about the machine
  });
  test("health says 503 when the database is gone", async () => {
    const k = makeApp();
    k.app.db.close();
    const r = await k.call("GET", "/health");
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
  });
  test("every response has a request id and the security headers", async () => {
    const k = makeApp();
    for (const r of [await k.call("GET", "/health"), await k.call("GET", "/nope"), await k.call("GET", "/me")]) {
      expect(r.headers.get("x-request-id")).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{7}$/);
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("referrer-policy")).toBe("no-referrer");
      expect(r.headers.get("permissions-policy")).toContain("geolocation=()");
    }
    const a = await k.call("GET", "/health"), b = await k.call("GET", "/health");
    expect(a.headers.get("x-request-id")).not.toBe(b.headers.get("x-request-id"));
  });
  test("unknown paths are a JSON 404; wrong methods are a 405 with an Allow header; a trailing slash is tolerated", async () => {
    const k = makeApp();
    const nf = await k.call("GET", "/api/contrib/v1/nope");
    expect(nf.status).toBe(404);
    expect(nf.body).toEqual({ error: "not_found", message: "not found" });
    expect((await k.call("GET", "/definitely/not/here")).status).toBe(404);
    const m = await k.call("DELETE", "/health");
    expect(m.status).toBe(405);
    expect(m.body.error).toBe("method_not_allowed");
    expect(m.headers.get("allow")).toBe("GET, OPTIONS");
    const me = await k.call("PUT", "/me");
    expect(me.status).toBe(405);
    expect(me.headers.get("allow")).toBe("GET, PATCH, DELETE, OPTIONS");
    expect((await k.call("GET", "/health/")).status).toBe(200);
  });
  test("HEAD works for GET routes; a malformed percent escape is a 400, not a crash", async () => {
    const k = makeApp();
    const h = await k.app.fetch(new Request(BASE + API + "/health", { method: "HEAD" }));
    expect(h.status).toBe(200);
    const bad = await k.app.fetch(new Request(BASE + "/admin/%E0%A4%A", { method: "GET" }));
    expect([400, 404]).toContain(bad.status);
    const bad2 = await k.call("GET", `${API}/admin/files/%E0%A4%A`, { admin: true });
    expect(bad2.status).toBe(400);
  });
  test("the service root points at health and the admin page", async () => {
    const k = makeApp();
    const r = await k.call("GET", "/");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ service: "kesennuma-contrib", health: "/api/contrib/v1/health", admin: "/admin" });
  });
  test("an unexpected error is a generic 500 that names nothing (and the log line carries no message)", async () => {
    const k = makeApp();
    k.app.repo.ping = () => { throw new Error("secret detail: /Users/someone/db.sqlite password=hunter2"); };
    const r = await k.call("GET", "/health");
    expect(r.status).toBe(503); // health catches its own failure and reports it
    expect(r.body.ok).toBe(false);
    k.app.repo.pointsOf = () => { throw new Error("secret detail: /Users/someone/db.sqlite password=hunter2"); };
    const me = await k.newContributor();
    const crash = await k.call("GET", "/me", { token: me.token });
    expect(crash.status).toBe(500);
    expect(crash.body).toEqual({ error: "internal", message: "internal error" });
    const logged = k.lines.join("\n");
    expect(logged).toContain("request.crashed");
    expect(logged).not.toContain("hunter2");
    expect(logged).not.toContain("/Users/someone");
  });
});

describe("CORS and origins", () => {
  test("an allow-listed origin is echoed back, with Vary: Origin and no credentials header", async () => {
    const k = makeApp();
    const r = await k.call("GET", "/leaderboard", { origin: APP_ORIGIN });
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    expect(r.headers.get("vary")).toContain("Origin");
    expect(r.headers.get("access-control-allow-credentials")).toBeNull();
    expect(r.headers.get("access-control-expose-headers")).toContain("Retry-After");
    for (const o of ["http://127.0.0.1:8787", "http://localhost:8787"]) expect((await k.call("GET", "/leaderboard", { origin: o })).headers.get("access-control-allow-origin")).toBe(o);
  });
  test("a preflight is answered 204 with the allowed methods and headers (including Idempotency-Key)", async () => {
    const k = makeApp();
    const r = await k.call("OPTIONS", "/submissions", { origin: APP_ORIGIN, headers: { "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    expect(r.headers.get("access-control-allow-methods")).toBe("GET, HEAD, POST, PATCH, DELETE, OPTIONS");
    const allowed = r.headers.get("access-control-allow-headers");
    for (const h of ["Authorization", "Content-Type", "Idempotency-Key"]) expect(allowed).toContain(h);
    expect(r.headers.get("access-control-max-age")).toBe("600");
  });
  test("an origin that is not on the list is refused outright (403), preflight or not, with no CORS headers", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    for (const origin of ["https://evil.example", "http://app.example", APP_ORIGIN + ".evil.example", "null"]) {
      for (const [method, path, extra] of [["GET", "/leaderboard", {}], ["OPTIONS", "/me", {}], ["GET", "/me", { token: me.token }], ["POST", "/contributors", { json: {} }]]) {
        const r = await k.call(method, path, { origin, ...extra });
        expect([origin, method, r.status]).toEqual([origin, method, 403]);
        expect(r.body.error).toBe("origin_not_allowed");
        expect(r.headers.get("access-control-allow-origin")).toBeNull();
      }
    }
    // and nothing was created by the refused POST
    expect(k.app.db.query("SELECT COUNT(*) AS n FROM contributors").get().n).toBe(1);
  });
  test("the service's own origin (the admin page calling its API) and calls without an Origin header pass", async () => {
    const k = makeApp();
    expect((await k.call("GET", "/leaderboard", { origin: BASE })).status).toBe(200);
    expect((await k.call("GET", "/leaderboard")).status).toBe(200);
    expect((await k.call("GET", "/leaderboard", { origin: BASE })).headers.get("access-control-allow-origin")).toBe(BASE);
  });
  test("if a trusted proxy rewrites Host, the page's own origin is still recognised through X-Forwarded-Host; a client cannot use that header without proxy trust", async () => {
    const proxied = makeApp({ config: { trustProxy: 1 } });
    const own = "https://contrib.example.org";
    const ok = await proxied.call("GET", "/leaderboard", { origin: own, headers: { "x-forwarded-host": "contrib.example.org" } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe(own);
    expect((await proxied.call("OPTIONS", "/me", { origin: own, headers: { "x-forwarded-host": "contrib.example.org:443" } })).status).toBe(403); // a different host:port is not the same origin
    expect((await proxied.call("GET", "/leaderboard", { origin: own })).status).toBe(403); // no forwarded host: it is just a foreign origin
    expect((await proxied.call("GET", "/leaderboard", { origin: own, headers: { "x-forwarded-host": "other.example.org" } })).status).toBe(403);
    expect((await proxied.call("GET", "/leaderboard", { origin: own, headers: { "x-forwarded-host": "evil<script>" } })).status).toBe(403);
    const direct = makeApp(); // no trusted proxy: the header is just a header
    expect((await direct.call("GET", "/leaderboard", { origin: own, headers: { "x-forwarded-host": "contrib.example.org" } })).status).toBe(403);
  });
  test("ALLOWED_ORIGINS replaces the default list", async () => {
    const k = makeApp({ config: { allowedOrigins: "https://only.example" } });
    expect((await k.call("GET", "/leaderboard", { origin: "https://only.example" })).status).toBe(200);
    expect((await k.call("GET", "/leaderboard", { origin: APP_ORIGIN })).status).toBe(403);
  });
});

describe("contributors", () => {
  test("POST /contributors returns {contributorId, token} (and the nickname), 201", async () => {
    const k = makeApp();
    const r = await k.call("POST", "/contributors", { json: { nickname: "さくら", crewNo: "1234-5678-9012-34" } });
    expect(r.status).toBe(201);
    expect(Object.keys(r.body).sort()).toEqual(["contributorId", "nickname", "token"]);
    expect(r.body.nickname).toBe("さくら");
    expect(r.body.contributorId).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{15}$/);
    expect(r.body.token.startsWith(r.body.contributorId + ".")).toBe(true);
    expect(r.body.token.split(".")[1].length).toBeGreaterThanOrEqual(43);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  test("the crew number is stored without dashes; a missing nickname becomes Guest-XXXX; an empty body is fine", async () => {
    const k = makeApp();
    const a = await k.call("POST", "/contributors", { json: { crewNo: "１２３４-5678-9012-34" } });
    expect(k.app.repo.getContributor(a.body.contributorId).crew_no).toBe("12345678901234");
    expect(a.body.nickname).toMatch(/^Guest-[A-Z0-9]{4}$/);
    const b = await k.call("POST", "/contributors", {});
    expect(b.status).toBe(201);
    expect(k.app.repo.getContributor(b.body.contributorId).crew_no).toBeNull();
    const c = await k.call("POST", "/contributors", { json: { nickname: "  ", crewNo: null } });
    expect(c.body.nickname).toMatch(/^Guest-/);
  });
  test("bad input is a 400 with a stable error code", async () => {
    const k = makeApp();
    const code = async (json) => { const r = await k.call("POST", "/contributors", { json }); return [r.status, r.body.error]; };
    expect(await code({ crewNo: "123" })).toEqual([400, "invalid_crew_no"]);
    expect(await code({ crewNo: 12345678901234 })).toEqual([400, "invalid_crew_no"]);
    expect(await code({ nickname: "x".repeat(25) })).toEqual([400, "invalid_nickname"]);
    expect(await code({ nickname: "visit http://spam.example" })).toEqual([400, "invalid_nickname"]);
    expect(await code({ nickname: 42 })).toEqual([400, "invalid_nickname"]);
    const raw = (body, ct = "application/json") => k.call("POST", "/contributors", { raw: body, headers: { "content-type": ct } });
    expect((await raw("{nope")).body.error).toBe("invalid_json");
    expect((await raw("[1]")).body.error).toBe("invalid_json");
    expect((await raw("{}", "text/plain")).status).toBe(415);
    expect((await raw('{"nickname":"' + "a".repeat(20000) + '"}')).status).toBe(413);
    expect(k.app.db.query("SELECT COUNT(*) AS n FROM contributors").get().n).toBe(0);
  });
  test("only a keyed hash of the secret is stored: the database never holds the token or its secret", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Hash Check" });
    const secret = me.token.split(".")[1];
    const row = k.app.repo.getContributor(me.id);
    expect(row.secret_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.secret_hash).not.toBe(secret);
    for (const v of Object.values(row)) expect(String(v)).not.toContain(secret);
    const dump = JSON.stringify(k.app.db.query("SELECT * FROM contributors").all()) + JSON.stringify(k.app.db.query("SELECT * FROM audit").all());
    expect(dump).not.toContain(secret);
    expect(dump).not.toContain(me.token);
  });
  test("every contributor gets an independent token", async () => {
    const k = makeApp();
    const [a, b] = [await k.newContributor({ nickname: "A" }), await k.newContributor({ nickname: "B" })];
    expect(a.id).not.toBe(b.id);
    expect((await k.call("GET", "/me", { token: a.token })).body.nickname).toBe("A");
    expect((await k.call("GET", "/me", { token: b.token })).body.nickname).toBe("B");
    const crossed = a.id + "." + b.token.split(".")[1];
    expect((await k.call("GET", "/me", { token: crossed })).status).toBe(401);
  });
});

describe("authentication of contributors", () => {
  test("anything but a valid token is the same 401, so an attacker learns nothing about which part was wrong", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const [id, secret] = me.token.split(".");
    const variants = {
      none: {}, junk: { token: "junk" }, wrongSecret: { token: `${id}.${"A".repeat(43)}` }, unknownId: { token: `${"B".repeat(16)}.${secret}` },
      admin: { token: ADMIN_TOKEN }, truncated: { token: me.token.slice(0, -3) }, empty: { headers: { authorization: "Bearer " } }, basic: { headers: { authorization: "Basic " + btoa("a:b") } },
    };
    const bodies = new Set();
    for (const [name, o] of Object.entries(variants)) {
      const r = await k.call("GET", "/me", o);
      expect([name, r.status]).toEqual([name, 401]);
      expect(r.headers.get("www-authenticate")).toContain("Bearer");
      bodies.add(JSON.stringify(r.body));
    }
    expect(bodies.size).toBe(1);
    expect((await k.call("GET", "/me", { token: me.token })).status).toBe(200);
  });
  test("last_seen is refreshed at most every ten minutes", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const seen = () => k.app.repo.getContributor(me.id).last_seen;
    const created = seen();
    k.clock.advance(5 * 60_000);
    await k.call("GET", "/me", { token: me.token });
    expect(seen()).toBe(created);
    k.clock.advance(6 * 60_000);
    await k.call("GET", "/me", { token: me.token });
    expect(seen()).toBe(new Date(k.clock.now()).toISOString());
  });
});

describe("GET /me", () => {
  test("profile, submissions with status and points, and the points total", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Sakura", crewNo: "1234-5678-9012-34" });
    const a = (await k.submit(me, { note: "first", kind: "issue" })).body.id;
    k.clock.advance(60_000);
    const b = (await k.submit(me, { note: "second", photos: [await synthJpeg({ lat: 38.9, lon: 141.5 })] })).body.id;
    k.clock.advance(60_000);
    const c = (await k.submit(me, { note: "third" })).body.id;
    await k.review(a, { status: "accepted", points: 10 });
    await k.review(b, { status: "used", points: 25, version: "v0.5.0" });
    await k.review(c, { status: "rejected", reviewerNote: "private reason" });
    const r = await k.call("GET", "/me", { token: me.token });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ contributorId: me.id, nickname: "Sakura", crewNo: "12345678901234", banned: false, points: 35, pointsTotal: 35, accepted: 2, rank: 1 });
    expect(r.body.createdAt).toBe("2026-10-05T03:00:00.000Z");
    expect(r.body.submissions.map((s) => s.id)).toEqual([c, b, a]); // newest first
    const byId = Object.fromEntries(r.body.submissions.map((s) => [s.id, s]));
    expect(byId[a]).toMatchObject({ status: "accepted", points: 10, kind: "issue", category: "sign", note: "first", photos: 0, usedVersion: null });
    expect(byId[b]).toMatchObject({ status: "used", points: 25, kind: "fix", photos: 1, usedVersion: "v0.5.0" });
    expect(byId[b].usedAt).toBe(new Date(k.clock.now()).toISOString());
    expect(byId[c]).toMatchObject({ status: "rejected", points: 0 });
    expect(JSON.stringify(r.body)).not.toContain("private reason"); // reviewer notes are internal
    expect(r.body.submissions[0]).not.toHaveProperty("reviewerNote");
  });
  test("a new contributor has no submissions, no points and no rank", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    expect((await k.call("GET", "/me", { token: me.token })).body).toMatchObject({ submissions: [], points: 0, pointsTotal: 0, accepted: 0, rank: null, crewNo: null });
  });
  test("a contributor only ever sees their own submissions", async () => {
    const k = makeApp();
    const [a, b] = [await k.newContributor(), await k.newContributor()];
    await k.submit(a, { note: "mine" });
    expect((await k.call("GET", "/me", { token: b.token })).body.submissions).toEqual([]);
  });
});

describe("PATCH /me", () => {
  test("changes the nickname and the crew number; the response is the updated profile", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Old" });
    const r = await k.call("PATCH", "/me", { token: me.token, json: { nickname: "New Name", crewNo: "0000-1111-2222-33" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ nickname: "New Name", crewNo: "00001111222233", contributorId: me.id });
    expect(k.app.repo.getContributor(me.id).crew_no).toBe("00001111222233");
  });
  test("crewNo: null (or an empty string) removes it; omitted keys are left alone", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Keep", crewNo: "12345678901234" });
    const only = await k.call("PATCH", "/me", { token: me.token, json: { nickname: "Renamed" } });
    expect(only.body).toMatchObject({ nickname: "Renamed", crewNo: "12345678901234" });
    const gone = await k.call("PATCH", "/me", { token: me.token, json: { crewNo: null } });
    expect(gone.body).toMatchObject({ nickname: "Renamed", crewNo: null });
    await k.call("PATCH", "/me", { token: me.token, json: { crewNo: "11112222333344" } });
    expect((await k.call("PATCH", "/me", { token: me.token, json: { crewNo: "" } })).body.crewNo).toBeNull();
    expect(k.app.repo.getContributor(me.id).crew_no).toBeNull();
  });
  test("an empty nickname resets it to the generated default", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Chosen" });
    const r = await k.call("PATCH", "/me", { token: me.token, json: { nickname: "" } });
    expect(r.body.nickname).toMatch(/^Guest-[A-Z0-9]{4}$/);
    expect((await k.call("PATCH", "/me", { token: me.token, json: { nickname: null } })).body.nickname).toBe(r.body.nickname);
  });
  test("invalid values are refused and change nothing", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Stable", crewNo: "12345678901234" });
    for (const [json, error] of [[{ crewNo: "999" }, "invalid_crew_no"], [{ nickname: "z".repeat(30) }, "invalid_nickname"], [{ nickname: "a@b.example" }, "invalid_nickname"], [{ nickname: "ok", crewNo: "bad" }, "invalid_crew_no"]]) {
      const r = await k.call("PATCH", "/me", { token: me.token, json });
      expect([r.status, r.body.error]).toEqual([400, error]);
    }
    expect(k.app.repo.getContributor(me.id)).toMatchObject({ nickname: "Stable", crew_no: "12345678901234" });
  });
  test("an empty body is a no-op; unknown keys are ignored; it needs a token", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Same" });
    const r = await k.call("PATCH", "/me", { token: me.token, json: { points: 9999, banned: false, id: "x", role: "admin" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ nickname: "Same", points: 0, banned: false, contributorId: me.id });
    expect((await k.call("PATCH", "/me", { json: { nickname: "x" } })).status).toBe(401);
  });
});

describe("DELETE /me (deletion on request)", () => {
  test("it asks for confirm=1; then it erases the contributor, their submissions and every stored file", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Leaving" }), other = await k.newContributor({ nickname: "Staying" });
    await k.submit(me, { photos: [await synthJpeg({ lat: 38.9, lon: 141.5 }), await synthJpeg({ seed: 2 })] });
    await k.submit(me, {});
    const keep = (await k.submit(other, { photos: [await synthJpeg({ seed: 4 })] })).body.id;
    const before = (await k.app.storage.list()).length;
    expect(before).toBeGreaterThan(8);
    const no = await k.call("DELETE", "/me", { token: me.token });
    expect([no.status, no.body.error]).toEqual([400, "confirm_required"]);
    expect((await k.call("GET", "/me", { token: me.token })).status).toBe(200);
    const r = await k.call("DELETE", "/me?confirm=1", { token: me.token });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, deletedFiles: 6 + 2 }); // (screenshot + thumbnail + 2 x (photo + preview)) + (screenshot + thumbnail)
    expect((await k.call("GET", "/me", { token: me.token })).status).toBe(401);
    expect(k.app.repo.getContributor(me.id)).toBeNull();
    expect(k.app.db.query("SELECT COUNT(*) AS n FROM submissions WHERE contributor_id = ?").get(me.id).n).toBe(0);
    const left = await k.app.storage.list();
    expect(left.every((f) => f.key.includes(keep))).toBe(true); // only the other contributor's files remain
    expect((await k.call("GET", "/me", { token: other.token })).body.submissions).toHaveLength(1);
  });
  test("the erasure is audited without personal data", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Private Name", crewNo: "12345678901234" });
    await k.submit(me, { note: "private note text" });
    await k.call("DELETE", "/me?confirm=1", { token: me.token });
    const audit = k.app.db.query("SELECT * FROM audit").all();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor: "contributor", action: "contributor.self_delete", target: me.id });
    const dump = JSON.stringify(audit) + k.lines.join("");
    for (const secret of ["Private Name", "12345678901234", "private note text"]) expect(dump).not.toContain(secret);
  });
});

describe("account transfer (own login, no Crewship)", () => {
  const CODE = /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;
  test("GET /me/transfer-code gives a short human code valid for 15 minutes (POST works too)", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const r = await k.call("GET", "/me/transfer-code", { token: me.token });
    expect(r.status).toBe(200);
    expect(r.body.code).toMatch(CODE);
    expect(r.body.expiresInSeconds).toBe(900);
    expect(r.body.expiresAt).toBe("2026-10-05T03:15:00.000Z");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await k.call("POST", "/me/transfer-code", { token: me.token })).body.code).toMatch(CODE);
    expect((await k.call("GET", "/me/transfer-code")).status).toBe(401);
  });
  test("claiming it on another device returns a new token for the same contributor, and revokes nothing", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Two Phones", crewNo: "12345678901234" });
    await k.submit(me, { note: "from the first phone" });
    const { code } = (await k.call("GET", "/me/transfer-code", { token: me.token })).body;
    const r = await k.call("POST", "/contributors/claim", { json: { code }, ip: "198.51.100.99" });
    expect(r.status).toBe(200);
    expect(r.body.contributorId).toBe(me.id);
    expect(r.body.nickname).toBe("Two Phones");
    expect(r.body.token).not.toBe(me.token);
    expect(r.body.token.startsWith(me.id + ".")).toBe(true);
    const second = await k.call("GET", "/me", { token: r.body.token });
    expect(second.status).toBe(200);
    expect(second.body.submissions.map((s) => s.note)).toEqual(["from the first phone"]);
    expect(second.body.crewNo).toBe("12345678901234");
    expect((await k.call("GET", "/me", { token: me.token })).status).toBe(200); // the first device still works
    // the new device can submit as the same contributor, and also mint a code for a third device
    expect((await k.submit({ token: r.body.token }, { note: "from the second phone" })).status).toBe(201);
    expect((await k.call("GET", "/me", { token: me.token })).body.submissions).toHaveLength(2);
    expect((await k.call("GET", "/me/transfer-code", { token: r.body.token })).status).toBe(200);
  });
  test("a code works once, is forgiving about case and separators, and expires after 15 minutes", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const get = async () => (await k.call("GET", "/me/transfer-code", { token: me.token })).body.code;
    const code = await get();
    const sloppy = " " + code.toLowerCase().replace("-", " ") + " ";
    expect((await k.call("POST", "/contributors/claim", { json: { code: sloppy } })).status).toBe(200);
    const again = await k.call("POST", "/contributors/claim", { json: { code } });
    expect([again.status, again.body.error]).toEqual([404, "code_not_found"]);
    const code2 = await get();
    k.clock.advance(14 * 60_000 + 59_000);
    expect((await k.call("POST", "/contributors/claim", { json: { code: code2 } })).status).toBe(200);
    const code3 = await get();
    k.clock.advance(15 * 60_000);
    const late = await k.call("POST", "/contributors/claim", { json: { code: code3 } });
    expect([late.status, late.body.error]).toEqual([404, "code_not_found"]);
  });
  test("a new code replaces the unused old one", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const first = (await k.call("GET", "/me/transfer-code", { token: me.token })).body.code;
    const second = (await k.call("GET", "/me/transfer-code", { token: me.token })).body.code;
    expect(second).not.toBe(first);
    expect((await k.call("POST", "/contributors/claim", { json: { code: first } })).status).toBe(404);
    expect((await k.call("POST", "/contributors/claim", { json: { code: second } })).status).toBe(200);
  });
  test("wrong and malformed codes are told apart only as 404 vs 400; the response never says which part was wrong", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    await k.call("GET", "/me/transfer-code", { token: me.token });
    const wrong = await k.call("POST", "/contributors/claim", { json: { code: "ZZZZZ-ZZZZZ" } });
    expect([wrong.status, wrong.body.error, wrong.body.message]).toEqual([404, "code_not_found", "this code is wrong, expired or already used"]);
    let n = 0;
    for (const code of ["", "123", "K7QM2-XHD9", "K7QM2-XHD9PX", "!!!!!-!!!!!", 12345, null]) {
      const r = await k.call("POST", "/contributors/claim", { json: { code }, ip: `198.51.100.${++n}` }); // a fresh network each time: every attempt counts against the limit
      expect([code, r.status, r.body.error]).toEqual([code, 400, "code_malformed"]);
    }
    expect((await k.call("POST", "/contributors/claim", { json: {} })).status).toBe(400);
  });
  test("the database holds only a keyed hash of the code", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const { code } = (await k.call("GET", "/me/transfer-code", { token: me.token })).body;
    const rows = k.app.db.query("SELECT * FROM transfer_codes").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(code.replace("-", ""));
    expect(JSON.stringify(rows)).not.toContain(code);
    expect(k.lines.join("")).not.toContain(code);
  });
  test("claim attempts are limited to 5 per IP per hour, rejected ones included", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const { code } = (await k.call("GET", "/me/transfer-code", { token: me.token })).body;
    for (let i = 0; i < 5; i++) expect((await k.call("POST", "/contributors/claim", { json: { code: "ZZZZZ-ZZZZZ" }, ip: "198.51.100.1" })).status).toBe(404);
    const sixth = await k.call("POST", "/contributors/claim", { json: { code }, ip: "198.51.100.1" }); // even the right code
    expect([sixth.status, sixth.body.error]).toEqual([429, "rate_limited"]);
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(3000);
    // another network is not affected, and the code still works there
    expect((await k.call("POST", "/contributors/claim", { json: { code }, ip: "198.51.100.2" })).status).toBe(200);
    // an hour later the first network may try again
    k.clock.advance(3600_001);
    expect((await k.call("POST", "/contributors/claim", { json: { code: "ZZZZZ-ZZZZZ" }, ip: "198.51.100.1" })).status).toBe(404);
  });
  test("a banned contributor can neither mint nor claim a code; an account can be on at most 10 devices", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const { code } = (await k.call("GET", "/me/transfer-code", { token: me.token })).body;
    await k.call("POST", `/admin/contributors/${me.id}`, { admin: true, json: { banned: true } });
    expect((await k.call("GET", "/me/transfer-code", { token: me.token })).status).toBe(403);
    expect((await k.call("POST", "/contributors/claim", { json: { code } })).body.error).toBe("banned");
    await k.call("POST", `/admin/contributors/${me.id}`, { admin: true, json: { banned: false } });
    for (let i = 0; i < 9; i++) {
      const c = (await k.call("GET", "/me/transfer-code", { token: me.token })).body.code;
      const r = await k.call("POST", "/contributors/claim", { json: { code: c }, ip: `198.51.100.${10 + i}` });
      expect([i, r.status]).toEqual([i, 200]);
    }
    k.clock.advance(3600_001); // a contributor may mint 10 codes an hour
    const c10 = (await k.call("GET", "/me/transfer-code", { token: me.token })).body.code;
    const full = await k.call("POST", "/contributors/claim", { json: { code: c10 }, ip: "198.51.100.77" });
    expect([full.status, full.body.error]).toEqual([409, "too_many_devices"]);
    expect(k.app.repo.countDeviceTokens(me.id)).toBe(10);
  });
  test("a contributor can mint at most 10 codes an hour", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    for (let i = 0; i < 10; i++) expect((await k.call("GET", "/me/transfer-code", { token: me.token })).status).toBe(200);
    expect((await k.call("GET", "/me/transfer-code", { token: me.token })).status).toBe(429);
  });
});

describe("leaderboard", () => {
  async function board() {
    const k = makeApp();
    const people = {};
    for (const [key, nickname, crewNo] of [["ana", "Ana", "11111111111111"], ["ben", "Ben", "22222222222222"], ["cho", "Cho"], ["dan", "Dan"]]) people[key] = await k.newContributor({ nickname, crewNo });
    const accept = async (who, points) => { const s = (await k.submit(people[who], { note: "x" })).body.id; k.clock.advance(1000); await k.review(s, { status: "accepted", points }); };
    await accept("ana", 10); await accept("ana", 15); await accept("ben", 30); await accept("cho", 5);
    await k.submit(people.dan, {}); // never accepted
    return { k, people };
  }
  test("returns [{nickname, accepted, points}] by points, never a crew number, and nobody without an accepted submission", async () => {
    const { k } = await board();
    const r = await k.call("GET", "/leaderboard");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ nickname: "Ben", accepted: 1, points: 30 }, { nickname: "Ana", accepted: 2, points: 25 }, { nickname: "Cho", accepted: 1, points: 5 }]);
    for (const row of r.body) expect(Object.keys(row).sort()).toEqual(["accepted", "nickname", "points"]);
    expect(JSON.stringify(r.body)).not.toMatch(/\d{14}|crew/i);
    expect((await k.call("GET", "/leaderboard")).headers.get("access-control-allow-origin")).toBeNull();
  });
  test("it needs no token; ?limit= defaults to 20 and is clamped to 1..100; garbage falls back to the default", async () => {
    const { k } = await board();
    expect((await k.call("GET", "/leaderboard?limit=1")).body).toHaveLength(1);
    expect((await k.call("GET", "/leaderboard?limit=2")).body.map((r) => r.nickname)).toEqual(["Ben", "Ana"]);
    expect((await k.call("GET", "/leaderboard?limit=0")).body).toHaveLength(1);
    expect((await k.call("GET", "/leaderboard?limit=-5")).body).toHaveLength(1);
    expect((await k.call("GET", "/leaderboard?limit=9999")).body).toHaveLength(3);
    expect((await k.call("GET", "/leaderboard?limit=abc")).body).toHaveLength(3);
    expect((await makeApp().call("GET", "/leaderboard")).body).toEqual([]);
  });
  test("banned contributors drop off the board; a valid token marks the caller's own row with me: true", async () => {
    const { k, people } = await board();
    const mine = await k.call("GET", "/leaderboard", { token: people.ana.token });
    expect(mine.body.map((r) => [r.nickname, r.me ?? false])).toEqual([["Ben", false], ["Ana", true], ["Cho", false]]);
    expect((await k.call("GET", "/leaderboard", { token: "invalid.token" })).body.every((r) => !r.me)).toBe(true); // a stale token never breaks a public page
    expect((await k.call("GET", "/leaderboard", { token: people.dan.token })).body.every((r) => !r.me)).toBe(true); // not on the board: no row to mark
    await k.call("POST", `/admin/contributors/${people.ben.id}`, { admin: true, json: { banned: true } });
    expect((await k.call("GET", "/leaderboard")).body.map((r) => r.nickname)).toEqual(["Ana", "Cho"]);
    expect((await k.call("GET", "/me", { token: people.ana.token })).body.rank).toBe(1);
  });
});
