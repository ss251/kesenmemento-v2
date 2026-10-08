// Contributor backend: the protections added after an independent security review. Upload volume budgets, the
// free-space guard, slow and stalled uploads, concurrency caps, the byte-weighted memory budget, atomic idempotency,
// durable file deletion, text-size caps, time parsing, and signing out other devices. All in-process.
import { describe, test as bunTest, expect } from "bun:test";
// a loaded machine (the gate runs tests at background priority) is many times slower than an idle one: generous per-test timeout
const test = (name, fn) => bunTest(name, fn, 60_000);
import { makeApp, BASE, API, fromIp } from "../tools/contrib/testkit.mjs";
import { synthJpeg, synthScreenshot } from "../tools/contrib/synth.mjs";
import { createGate, GateBusyError, createVolumeCounter } from "../server/contrib/limits.js";
import { readBody } from "../server/contrib/http.js";
import { parseInstantUtc, parsePose, cleanText, cleanNickname, normalizeCrewNo } from "../server/contrib/validate.js";
import { parseTakenAt } from "../server/contrib/images.js";

const MB = 1024 * 1024;
const rows = (k, sql, ...p) => k.app.db.query(sql).all(...p);
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await Bun.sleep(5); } };

/** The multipart bytes and content type of a form, for hand-built (streamed) requests. */
async function serialize(form) {
  const r = new Request(BASE, { method: "POST", body: form });
  return { ct: r.headers.get("content-type"), bytes: new Uint8Array(await r.arrayBuffer()) };
}
/** A request body that sends `first` bytes at once and the rest only when released; cancelling releases it too. */
function gated(bytes, first = 1000) {
  let release;
  const hold = new Promise((r) => { release = r; });
  let sent = 0, cancelled = false;
  const stream = new ReadableStream({
    async pull(c) {
      if (sent === 0) { c.enqueue(bytes.slice(0, first)); sent = first; return; }
      await hold;
      if (!cancelled && sent < bytes.length) { c.enqueue(bytes.slice(sent)); sent = bytes.length; }
      if (!cancelled) c.close();
    },
    cancel() { cancelled = true; release(); },
  });
  return { stream, release, get cancelled() { return cancelled; } };
}
const small = { maxPhotos: 1, maxPhotoMb: 0.2, maxShotMb: 0.2 };
/** Size in bytes of the request body of an ordinary test submission (so budgets can be set relative to it). */
const typicalBody = async () => { const p = makeApp(); return (await serialize(await p.form({}))).bytes.length; };

describe("upload volume budgets (padded files are valid files: counting submissions is not enough)", () => {
  test("a contributor's bytes per rolling day are budgeted; with a declared Content-Length the check is exact", async () => {
    const size = await typicalBody();
    const k = makeApp({ config: { dailyMb: (size * 1.5) / MB } }); // room for one and a half submissions
    const me = await k.newContributor();
    const first = await k.submit(me, {});
    expect(first.status).toBe(201);
    const used = JSON.parse(k.app.repo.getSubmission(first.body.id).client_json).bodyBytes;
    expect(Math.abs(used - size)).toBeLessThan(200);
    expect(k.app.repo.bytesSince(me.id, "2000-01-01T00:00:00.000Z")).toBe(used);
    // a client that announces its size is refused before a byte of it is read
    const { ct, bytes } = await serialize(await k.form({}));
    const big = await k.call("POST", "/submissions", { token: me.token, raw: bytes, headers: { "content-type": ct, "content-length": String(bytes.length) } });
    expect([big.status, big.body.error]).toEqual([429, "daily_limit"]);
    expect(big.body.message).toContain("volume");
    expect(Number(big.headers.get("retry-after"))).toBeGreaterThan(86000);
    expect((await k.submit(me, {})).status).toBe(201); // unknown size (chunked): admitted while under budget...
    expect((await k.submit(me, {})).status).toBe(429); // ...and the budget now counts what was really stored
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(2);
    k.clock.advance(86400_000 + 1);
    expect((await k.submit(me, {})).status).toBe(201); // a new day
  });
  test("so are a network's bytes per day, across contributors; another network is unaffected", async () => {
    const size = await typicalBody();
    const k = makeApp({ config: { ipDailyMb: (size * 1.5) / MB } });
    const [a, b, c] = [await k.newContributor(), await k.newContributor(), await k.newContributor()];
    expect((await k.submit(a, {})).status).toBe(201);
    expect((await k.submit(b, {})).status).toBe(201);
    const r = await k.submit(c, {});
    expect([r.status, r.body.error]).toEqual([429, "daily_limit"]);
    expect(r.body.message).toContain("network");
    expect((await k.submit(c, {}, { ip: "198.51.100.9" })).status).toBe(201);
    k.clock.advance(86400_000 + 1);
    expect((await k.submit(c, {})).status).toBe(201);
  });
  test("a padded 'photo' (a valid JPEG followed by filler) cannot be used to fill the disk at 98 MB a time", async () => {
    const k = makeApp({ config: { ...small, dailyMb: 0.3 } });
    const me = await k.newContributor();
    const padded = Buffer.concat([await synthJpeg({ width: 200, height: 150 }), Buffer.alloc(150_000)]);
    expect((await k.submit(me, { photos: [padded] })).status).toBe(201);
    expect((await k.submit(me, { photos: [padded] })).status).toBe(201);
    expect((await k.submit(me, { photos: [padded] })).status).toBe(429); // 3 x ~150 KB is past the 0.3 MB budget
  });
  test("the defaults are 1 GB a day per contributor and 3 GB per network; both configurable", () => {
    const k = makeApp();
    expect(k.cfg.dailyBytes).toBe(1024 * MB);
    expect(k.cfg.ipDailyBytes).toBe(3 * 1024 * MB);
    expect(makeApp({ config: { dailyMb: 100 } }).cfg.ipDailyBytes).toBe(300 * MB);
    expect(makeApp({ config: { dailyMb: 100, ipDailyMb: 150 } }).cfg.ipDailyBytes).toBe(150 * MB);
  });
});

describe("the free-space guard", () => {
  test("uploads are refused with 503 storage_full when the volume is nearly full, while moderation keeps working", async () => {
    let free = 100 * MB;
    const k = makeApp({ config: { minFreeMb: 512 } });
    // the app was built with the real probe; build one with an injected probe for the simulated volume
    const { createApp, loadConfig } = await import("../server/contrib/index.js");
    const { ADMIN_TOKEN, TOKEN_SECRET } = await import("../tools/contrib/testkit.mjs");
    const lines = [];
    const { createLogger } = await import("../server/contrib/log.js");
    const cfg = loadConfig({}, { adminToken: ADMIN_TOKEN, tokenSecret: TOKEN_SECRET, dbPath: ":memory:", diskDir: k.dir + "/files2", minFreeMb: 512 });
    const app = createApp(cfg, { logger: createLogger({ write: (l) => lines.push(l) }), freeBytes: () => free });
    const call = async (method, path, o = {}) => {
      const headers = { ...(o.headers ?? {}) };
      if (o.token) headers.authorization = `Bearer ${o.token}`;
      if (o.admin) headers.authorization = `Bearer ${ADMIN_TOKEN}`;
      if (o.json !== undefined) { headers["content-type"] = "application/json"; }
      const res = await app.fetch(new Request(BASE + API + path, { method, headers, body: o.json !== undefined ? JSON.stringify(o.json) : o.form }), fromIp("203.0.113.5"));
      return { status: res.status, headers: res.headers, body: await res.json() };
    };
    const me = (await call("POST", "/contributors", { json: {} })).body;
    const fd = new FormData(); fd.append("consent", "1"); fd.append("note", "hello");
    const refused = await call("POST", "/submissions", { token: me.token, form: fd });
    expect([refused.status, refused.body.error]).toEqual([503, "storage_full"]);
    expect(refused.headers.get("retry-after")).toBe("3600");
    expect(lines.join("\n")).toContain("storage.low");
    expect((await call("GET", "/admin/stats", { admin: true })).status).toBe(200); // the admin can still work
    free = 10_000 * MB;
    const fd2 = new FormData(); fd2.append("consent", "1"); fd2.append("note", "hello");
    expect((await call("POST", "/submissions", { token: me.token, form: fd2 })).status).toBe(201);
    free = null; // unknown free space (an S3 deployment's database volume that cannot be read): do not block
    const fd3 = new FormData(); fd3.append("consent", "1"); fd3.append("note", "again");
    expect((await call("POST", "/submissions", { token: me.token, form: fd3 })).status).toBe(201);
    app.close();
  });
  test("the real probe reads the data volume: a threshold no disk can meet refuses, the default lets a normal machine through", async () => {
    const full = makeApp({ config: { minFreeMb: 9_000_000 } }); // 9 TB free required
    const me = await full.newContributor();
    expect((await full.submit(me, {})).body.error).toBe("storage_full");
    const ok = makeApp(); // 512 MB
    expect((await ok.submit(await ok.newContributor(), {})).status).toBe(201);
    const off = makeApp({ config: { minFreeMb: 0 } });
    expect((await off.submit(await off.newContributor(), {})).status).toBe(201);
  });
});

describe("slow and stalled uploads", () => {
  test("a body that stops arriving is cut off (408 upload_too_slow), its stream is cancelled, and its slot is given back", async () => {
    const k = makeApp({ config: { uploadGraceS: 0.1, uploadMinKbps: 100, ...small } });
    const me = await k.newContributor();
    const { ct, bytes } = await serialize(await k.form({}));
    const g = gated(bytes);
    const t0 = Date.now();
    const r = await k.call("POST", "/submissions", { token: me.token, raw: g.stream, headers: { "content-type": ct } });
    expect([r.status, r.body.error]).toEqual([408, "upload_too_slow"]);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(g.cancelled).toBe(true);
    expect(k.app.gates.bodyBudget.active).toBe(0);
    expect(k.app.gates.uploads.byUser.size).toBe(0);
    expect(k.app.gates.uploads.byIp.size).toBe(0);
    expect((await k.submit(me, {})).status).toBe(201); // and the same contributor can upload normally right after
  });
  test("a body that keeps trickling above the minimum speed still has to arrive within the deadline (408 upload_timeout)", async () => {
    const k = makeApp({ config: { uploadGraceS: 0.05, uploadMinKbps: 0, uploadTimeoutS: 0.3, ...small } });
    const me = await k.newContributor();
    let cancelled = false, timer;
    const stream = new ReadableStream({
      start(c) { timer = setInterval(() => { try { c.enqueue(new Uint8Array(4096)); } catch { clearInterval(timer); } }, 20); },
      cancel() { cancelled = true; clearInterval(timer); },
    });
    const r = await k.call("POST", "/submissions", { token: me.token, raw: stream, headers: { "content-type": "multipart/form-data; boundary=XYZ" } });
    clearInterval(timer);
    expect([r.status, r.body.error]).toEqual([408, "upload_timeout"]);
    expect(cancelled).toBe(true);
  });
  test("a normal upload is not affected by the speed rules", async () => {
    const k = makeApp({ config: { uploadGraceS: 0.05, uploadMinKbps: 5000, uploadTimeoutS: 5 } });
    const me = await k.newContributor();
    expect((await k.submit(me, { photos: [await synthJpeg({ width: 800, height: 600, lat: 38.9, lon: 141.5 })] })).status).toBe(201);
  });
  test("readBody enforces the same rules on its own: slow, deadline, size, and no rule when none is asked", async () => {
    const stall = () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); } });
    const post = (body, headers = {}) => new Request("http://x.test/", { method: "POST", body, headers, duplex: "half" });
    const code = async (promise) => { try { await promise; return "ok"; } catch (e) { return `${e.status}:${e.code}`; } };
    expect(await code(readBody(post(stall()), 1000, { minBytesPerSec: 1000, graceMs: 80 }))).toBe("408:upload_too_slow");
    expect(await code(readBody(post(stall()), 1000, { deadlineMs: 80 }))).toBe("408:upload_timeout");
    expect(await code(readBody(post(new Uint8Array(500)), 1000, { minBytesPerSec: 10, graceMs: 80, deadlineMs: 5000 }))).toBe("ok");
    expect(await code(readBody(post(new Uint8Array(2000)), 1000, { minBytesPerSec: 10, graceMs: 80 }))).toBe("413:payload_too_large");
  });
});

describe("concurrency", () => {
  test("a contributor has one upload at a time: a second one is a 409 until the first is done", async () => {
    const k = makeApp({ config: small });
    const me = await k.newContributor();
    const { ct, bytes } = await serialize(await k.form({ note: "first" }));
    const g = gated(bytes);
    const p1 = k.call("POST", "/submissions", { token: me.token, raw: g.stream, headers: { "content-type": ct } });
    await until(() => k.app.gates.uploads.byUser.has(me.id));
    const second = await k.submit(me, { note: "second" });
    expect([second.status, second.body.error]).toEqual([409, "upload_in_progress"]);
    expect(second.headers.get("retry-after")).toBe("5");
    g.release();
    const first = await p1;
    expect(first.status).toBe(201);
    expect((await k.submit(me, { note: "third" })).status).toBe(201);
    expect(rows(k, "SELECT note FROM submissions ORDER BY note").map((r) => r.note)).toEqual(["first", "third"]);
  });
  test("a network has a few at a time (MAX_UPLOADS_PER_IP): beyond that, 429 until one finishes", async () => {
    const k = makeApp({ config: { ...small, maxUploadsPerIp: 2 } });
    const people = [await k.newContributor(), await k.newContributor(), await k.newContributor()];
    const ups = [];
    for (const p of people.slice(0, 2)) {
      const { ct, bytes } = await serialize(await k.form({ note: p.id }));
      const g = gated(bytes);
      ups.push({ g, p: k.call("POST", "/submissions", { token: p.token, raw: g.stream, headers: { "content-type": ct } }) });
    }
    await until(() => k.app.gates.uploads.byIp.get("203.0.113.10") === 2);
    const third = await k.submit(people[2], {});
    expect([third.status, third.body.error]).toEqual([429, "rate_limited"]);
    expect(third.body.message).toContain("at once");
    expect((await k.submit(people[2], {}, { ip: "198.51.100.9" })).status).toBe(201); // another network has its own
    ups[0].g.release();
    expect((await ups[0].p).status).toBe(201);
    expect((await k.submit(people[2], {})).status).toBe(201); // one slot is free again
    ups[1].g.release();
    expect((await ups[1].p).status).toBe(201);
    expect(k.app.gates.uploads.byIp.size).toBe(0);
  });
  test("a refused concurrent upload does not use up an upload attempt", async () => {
    const k = makeApp({ config: { ...small, submitAttemptsPerHour: 2 } });
    const me = await k.newContributor();
    const { ct, bytes } = await serialize(await k.form({}));
    const g = gated(bytes);
    const p1 = k.call("POST", "/submissions", { token: me.token, raw: g.stream, headers: { "content-type": ct } });
    await until(() => k.app.gates.uploads.byUser.has(me.id));
    for (let i = 0; i < 5; i++) expect((await k.submit(me, {})).status).toBe(409);
    g.release();
    expect((await p1).status).toBe(201);
    expect((await k.submit(me, {})).status).toBe(201); // 2 attempts were used, not 7
  });
});

describe("the memory budget for request bodies", () => {
  test("uploads reserve their declared size; one that does not fit waits (it is not refused) and runs when memory frees up", async () => {
    const k = makeApp({ config: { ...small, uploadBufferMb: 0.01, maxConcurrentUploads: 2 } }); // budget = the largest single request (about 1.4 MB)
    expect(k.cfg.uploadBufferBytes).toBe(k.cfg.maxBodyBytes);
    const [a, b] = [await k.newContributor({}, { ip: "198.51.100.1" }), await k.newContributor({}, { ip: "198.51.100.2" })];
    const sa = await serialize(await k.form({ note: "a" })), sb = await serialize(await k.form({ note: "b" }));
    const g = gated(sa.bytes);
    const declare = String(Math.floor(k.cfg.maxBodyBytes * 0.8));
    const p1 = k.call("POST", "/submissions", { token: a.token, raw: g.stream, headers: { "content-type": sa.ct, "content-length": declare }, ip: "198.51.100.1" });
    await until(() => k.app.gates.bodyBudget.active > 0);
    const p2 = k.call("POST", "/submissions", { token: b.token, raw: sb.bytes, headers: { "content-type": sb.ct, "content-length": declare }, ip: "198.51.100.2" });
    await until(() => k.app.gates.bodyBudget.queued === 1);
    expect(k.app.gates.bodyBudget.active).toBe(Math.floor(k.cfg.maxBodyBytes * 0.8));
    g.release();
    expect((await p1).status).toBe(201);
    expect((await p2).status).toBe(201); // it waited, then ran
    expect(k.app.gates.bodyBudget.active).toBe(0);
    expect(k.app.gates.bodyBudget.queued).toBe(0);
  });
  test("the budget is returned after every outcome: success, validation failure, refusal, oversize", async () => {
    const k = makeApp({ config: small });
    const me = await k.newContributor();
    await k.submit(me, {});
    await k.submit(me, { consent: false });
    await k.submit(me, { photos: [Buffer.alloc(400_000, 1)] });
    await k.call("POST", "/submissions", { token: me.token, raw: "x", headers: { "content-type": "multipart/form-data; boundary=XYZ", "content-length": "99999999" } });
    expect(k.app.gates.bodyBudget.active).toBe(0);
    expect(k.app.gates.processGate.active).toBe(0);
    expect(k.app.gates.uploads.byUser.size).toBe(0);
  });
  test("an unannounced size reserves the maximum a request can be; a size over the maximum is refused before anything is reserved", async () => {
    const k = makeApp({ config: small });
    const me = await k.newContributor();
    const { ct, bytes } = await serialize(await k.form({}));
    const huge = await k.call("POST", "/submissions", { token: me.token, raw: bytes, headers: { "content-type": ct, "content-length": String(k.cfg.maxBodyBytes + 1) } });
    expect([huge.status, huge.body.error]).toEqual([413, "payload_too_large"]);
    expect(k.app.gates.bodyBudget.active).toBe(0);
  });
  test("a weighted gate: heavier requests wait for enough room, in order; weights above the total are capped; the queue and the wait are bounded", async () => {
    const g = createGate(100, { maxQueue: 2, waitMs: 60 });
    const r1 = await g.acquire(60);
    expect(g.active).toBe(60);
    const order = [];
    const p2 = g.acquire(60).then((r) => { order.push(2); return r; });
    const p3 = g.acquire(30).then((r) => { order.push(3); return r; }); // fits now, but is behind the heavier waiter: first come, first served
    await Bun.sleep(5);
    expect(g.queued).toBe(2);
    await expect(g.acquire(1)).rejects.toBeInstanceOf(GateBusyError); // queue full
    r1();
    const [r2, r3] = await Promise.all([p2, p3]);
    expect(order).toEqual([2, 3]);
    expect(g.active).toBe(90);
    r2(); r3();
    expect(g.active).toBe(0);
    const big = await g.acquire(10_000);
    expect(g.active).toBe(100); // capped to the whole budget: it runs alone instead of waiting forever
    const late = g.acquire(1);
    await expect(late).rejects.toBeInstanceOf(GateBusyError); // gives up after waitMs
    expect(g.queued).toBe(0);
    big();
    big(); // a double release is harmless
    expect(g.active).toBe(0);
  });
  test("the volume counter sums a sliding window per key and stays bounded", () => {
    let t = 0;
    const v = createVolumeCounter({ now: () => t, maxKeys: 10 });
    v.add("a", 100, 1000); t = 400; v.add("a", 50, 1000); v.add("b", 7, 1000);
    expect(v.sum("a", 1000)).toBe(150);
    expect(v.oldestAge("a", 1000)).toBe(600);
    t = 1100;
    expect(v.sum("a", 1000)).toBe(50); // the first entry left the window
    t = 1500;
    expect(v.sum("a", 1000)).toBe(0);
    expect(v.oldestAge("zzz", 1000)).toBe(0);
    for (let i = 0; i < 100; i++) v.add(`k${i}`, 1, 1000);
    expect(v.size).toBeLessThanOrEqual(10);
  });
});

describe("decode limits", () => {
  test("MAX_IMAGE_MP bounds what is decoded: an image above the cap is refused as unreadable", async () => {
    const k = makeApp({ config: { maxImageMp: 0.1 } }); // 100,000 pixels
    const me = await k.newContributor();
    const tooBig = await synthJpeg({ width: 640, height: 480 }); // 307,200 pixels
    const r = await k.submit(me, { photos: [tooBig] });
    expect([r.status, r.body.error]).toEqual([415, "unreadable_image"]);
    expect((await k.submit(me, { photos: [await synthJpeg({ width: 300, height: 200 })], screenshot: false })).status).toBe(201); // 60,000 pixels
    expect(makeApp().cfg.maxPixels).toBe(64_000_000);
    expect((await k.submit(me, { screenshot: await synthScreenshot({ width: 640, height: 480 }) })).status).toBe(415); // the screenshot is decoded under the same cap
  });
});

describe("idempotent retries cannot race", () => {
  test("two copies of one upload at the same moment produce one submission; the second waits and gets the first's answer", async () => {
    const k = makeApp({ config: small });
    const me = await k.newContributor();
    const { ct, bytes } = await serialize(await k.form({ note: "double tap" }));
    const g = gated(bytes);
    const key = "double-tap-key-0001"; // gitleaks:allow (a made-up request id)
    const p1 = k.call("POST", "/submissions", { token: me.token, raw: g.stream, headers: { "content-type": ct, "idempotency-key": key } });
    await until(() => k.app.gates.inflight.has(`${me.id}:${key}`));
    const p2 = k.call("POST", "/submissions", { token: me.token, raw: bytes, headers: { "content-type": ct, "idempotency-key": key } });
    await Bun.sleep(30);
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(0); // nothing yet: the first is still arriving
    g.release();
    const [first, second] = await Promise.all([p1, p2]);
    expect(first.status).toBe(201);
    expect([second.status, second.body.replayed, second.body.id]).toEqual([200, true, first.body.id]);
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(1);
    expect(k.app.gates.inflight.size).toBe(0);
  });
  test("if the first copy fails, the waiting retry becomes the real attempt", async () => {
    const k = makeApp({ config: small });
    const me = await k.newContributor();
    const key = "retry-after-fail-0001";
    const bad = await serialize(await k.form({ consent: false }));
    const good = await serialize(await k.form({ note: "good" }));
    const g = gated(bad.bytes);
    const p1 = k.call("POST", "/submissions", { token: me.token, raw: g.stream, headers: { "content-type": bad.ct, "idempotency-key": key } });
    await until(() => k.app.gates.inflight.has(`${me.id}:${key}`));
    const p2 = k.call("POST", "/submissions", { token: me.token, raw: good.bytes, headers: { "content-type": good.ct, "idempotency-key": key } });
    g.release();
    const [first, second] = await Promise.all([p1, p2]);
    expect([first.status, first.body.error]).toEqual([400, "consent_required"]);
    expect([second.status, second.body.note]).toEqual([201, undefined]);
    expect(rows(k, "SELECT note FROM submissions").map((r) => r.note)).toEqual(["good"]);
  });
  test("the database refuses a duplicate key even if two copies get past the lookup: the loser's files are removed and it returns the winner", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const key = "race-key-0000001";
    const first = await k.submit(me, { note: "winner", photos: [await synthJpeg({ lat: 38.9, lon: 141.5 })] }, { headers: { "idempotency-key": key } });
    expect(first.status).toBe(201);
    const filesBefore = (await k.app.storage.list()).length;
    const real = k.app.repo.findByIdempotencyKey.bind(k.app.repo);
    let calls = 0;
    k.app.repo.findByIdempotencyKey = (...a) => (++calls === 1 ? null : real(...a)); // the lookup that "lost the race" sees nothing
    const loser = await k.submit(me, { note: "loser", photos: [await synthJpeg({ seed: 7 })] }, { headers: { "idempotency-key": key } });
    expect([loser.status, loser.body.id, loser.body.replayed]).toEqual([200, first.body.id, true]);
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(1);
    expect((await k.app.storage.list()).length).toBe(filesBefore); // nothing of the loser remains
    expect(rows(k, "SELECT COUNT(*) AS n FROM pending_deletes")[0].n).toBe(0);
  });
  test("the unique index itself: the same key twice for one contributor is an error, for two contributors it is fine", async () => {
    const k = makeApp();
    const [a, b] = [await k.newContributor(), await k.newContributor()];
    const ins = (cid, id) => k.app.db.query("INSERT INTO submissions (id, contributor_id, created_at, client_json) VALUES (?, ?, 'x', '{\"idem\":\"same-key-123\"}')").run(id, cid);
    ins(a.id, "s1aaaaaa");
    expect(() => ins(a.id, "s2aaaaaa")).toThrow(/UNIQUE/);
    ins(b.id, "s3aaaaaa");
    k.app.db.query("INSERT INTO submissions (id, contributor_id, created_at, client_json) VALUES ('s4aaaaaa', ?, 'x', '{}')").run(a.id);
    k.app.db.query("INSERT INTO submissions (id, contributor_id, created_at, client_json) VALUES ('s5aaaaaa', ?, 'x', '{}')").run(a.id); // no key: any number
  });
});

describe("deleting private files is durable", () => {
  /** A storage whose remove() fails for the keys the test names. */
  const breakRemove = (k, failFor) => {
    const real = k.app.storage.remove.bind(k.app.storage);
    k.app.storage.remove = async (keys) => { if (keys.some((x) => failFor(x))) throw Object.assign(new Error("storage unavailable"), { code: "EIO" }); return real(keys); };
    return () => { k.app.storage.remove = real; };
  };
  test("when the store cannot delete, the rows are still erased and every file key stays queued until it is gone", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const s = (await k.submit(me, { photos: [await synthJpeg({ lat: 38.9, lon: 141.5 }), await synthJpeg({ seed: 2 })] })).body.id;
    const all = (await k.app.storage.list()).map((f) => f.key);
    expect(all).toHaveLength(6);
    const restore = breakRemove(k, () => true);
    const r = await k.call("DELETE", `/admin/submissions/${s}`, { admin: true });
    expect(r.body).toEqual({ ok: true, deletedFiles: 0 });
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(0);
    expect(rows(k, "SELECT key FROM pending_deletes ORDER BY key").map((x) => x.key)).toEqual([...all].sort());
    expect((await k.call("GET", "/admin/stats", { admin: true })).body.pendingDeletes).toBe(6);
    expect((await k.app.storage.list()).length).toBe(6); // the private photos are still there, but the queue knows
    restore();
    const drained = await k.app.drainPending();
    expect(drained).toEqual({ removed: 6, failed: 0 });
    expect(await k.app.storage.list()).toEqual([]);
    expect(rows(k, "SELECT COUNT(*) AS n FROM pending_deletes")[0].n).toBe(0);
  });
  test("one stubborn file does not stop the others; its failure count grows; a later retry succeeds", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    await k.submit(me, { photos: [await synthJpeg({ lat: 38.9, lon: 141.5 })] });
    const keys = (await k.app.storage.list()).map((f) => f.key);
    const stubborn = keys.find((x) => x.endsWith("photo-1.jpg"));
    const restore = breakRemove(k, (x) => x === stubborn);
    const r = await k.call("DELETE", "/me?confirm=1", { token: me.token });
    expect(r.body).toEqual({ ok: true, deletedFiles: 3 });
    expect(rows(k, "SELECT key FROM pending_deletes").map((x) => x.key)).toEqual([stubborn]);
    await k.app.drainPending(); await k.app.drainPending();
    expect(rows(k, "SELECT attempts, last_error FROM pending_deletes")[0]).toEqual({ attempts: 3, last_error: "EIO" });
    expect((await k.app.storage.list()).map((f) => f.key)).toEqual([stubborn]);
    restore();
    await k.app.drainPending();
    expect(await k.app.storage.list()).toEqual([]);
    const audit = rows(k, "SELECT detail FROM audit WHERE action = 'contributor.self_delete'")[0];
    expect(JSON.parse(audit.detail)).toEqual({ files: 4, leftover: 1 });
  });
  test("a failed upload whose cleanup also fails leaves its files queued, not forgotten", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const realPut = k.app.storage.put.bind(k.app.storage);
    let puts = 0;
    k.app.storage.put = async (...a) => { if (++puts >= 3) throw new Error("disk full"); return realPut(...a); };
    const restore = breakRemove(k, () => true);
    const r = await k.submit(me, { photos: [await synthJpeg({ lat: 38.9, lon: 141.5 })] });
    expect(r.status).toBe(500);
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(0);
    expect(rows(k, "SELECT COUNT(*) AS n FROM pending_deletes")[0].n).toBe(2); // the screenshot and its thumbnail were already written
    restore();
    k.app.storage.put = realPut;
    expect((await k.app.drainPending()).removed).toBe(2);
    expect(await k.app.storage.list()).toEqual([]);
  });
  test("deleting a contributor queues the files of all their submissions; a missing file is not a failure", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    await k.submit(me, {}); await k.submit(me, { photos: [await synthJpeg()] });
    const keys = (await k.app.storage.list()).map((f) => f.key);
    await k.app.storage.remove([keys[0]]); // already gone from the store
    const r = await k.call("DELETE", `/admin/contributors/${me.id}`, { admin: true });
    expect(r.body).toEqual({ ok: true, deletedFiles: keys.length });
    expect(rows(k, "SELECT COUNT(*) AS n FROM pending_deletes")[0].n).toBe(0);
    expect(await k.app.storage.list()).toEqual([]);
  });
  test("the queue is drained by the app itself on a timer and survives a restart of the app on the same database", async () => {
    const k = makeApp();
    k.app.repo.queueDeletes(["submissions/2026/10/aaaaaaaa11111111/photo-1.jpg"]);
    await k.app.storage.put("submissions/2026/10/aaaaaaaa11111111/photo-1.jpg", new Uint8Array([1, 2, 3]));
    expect((await k.app.drainPending()).removed).toBe(1);
    expect(await k.app.storage.list()).toEqual([]);
    expect(await k.app.drainPending()).toEqual({ removed: 0, failed: 0 }); // nothing queued
    k.close();
    expect(await k.app.drainPending()).toEqual({ removed: 0, failed: 0 }); // after close it is harmless
  });
});

describe("text and time handling", () => {
  test("a text part over 64 KB is refused before any cleaning work is done on it; a long note is still note_too_long", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const huge = await k.submit(me, { note: "x".repeat(300_000) });
    expect([huge.status, huge.body.error]).toEqual([400, "invalid_note"]);
    const long = await k.submit(me, { note: "x".repeat(3000) });
    expect([long.status, long.body.error]).toEqual([400, "note_too_long"]);
    const t0 = performance.now();
    expect(cleanText("あ".repeat(5_000_000), 2000, "note_too_long", "note").ok).toBe(false);
    expect(cleanNickname("n".repeat(1_000_000)).ok).toBe(false);
    expect(normalizeCrewNo("1".repeat(1_000_000)).ok).toBe(false);
    expect(performance.now() - t0).toBeLessThan(500);
    const nick = await k.call("POST", "/contributors", { json: { nickname: "n".repeat(100_000) } });
    expect([nick.status, nick.body.error]).toEqual([413, "payload_too_large"]); // the JSON body limit (16 KB) catches it first
    const mid = await k.call("POST", "/contributors", { json: { nickname: "n".repeat(10_000) } });
    expect([mid.status, mid.body.error]).toEqual([400, "invalid_nickname"]);
  });
  test("a timestamp without a zone is UTC, never the machine's local time; offsets are honoured; impossible values are refused", () => {
    expect(new Date(parseInstantUtc("2026-10-04T14:23:05")).toISOString()).toBe("2026-10-04T14:23:05.000Z");
    expect(new Date(parseInstantUtc("2026-10-04 14:23")).toISOString()).toBe("2026-10-04T14:23:00.000Z");
    expect(new Date(parseInstantUtc("2026-10-04T14:23:05Z")).toISOString()).toBe("2026-10-04T14:23:05.000Z");
    expect(new Date(parseInstantUtc("2026-10-04T14:23:05+09:00")).toISOString()).toBe("2026-10-04T05:23:05.000Z");
    expect(new Date(parseInstantUtc("2026-10-04T14:23:05.123456-0530")).toISOString()).toBe("2026-10-04T19:53:05.123Z");
    for (const bad of ["", "yesterday", "2026-02-30T10:00:00Z", "2026-10-04T24:00:00Z", "2026-10-04T10:60:00Z", "2026-10-04T10:00:00+99:99", "2026-10-04T10:00:00+14:75", "10/04/2026"]) expect([bad, Number.isNaN(parseInstantUtc(bad))]).toEqual([bad, true]);
    expect(parsePose({ enu: [1, 2, 3], at: "2026-10-04T14:23:05" }).value.at).toBe("2026-10-04T14:23:05.000Z");
    expect(parsePose({ enu: [1, 2, 3], at: "2026-10-04T14:23:05+09:00" }).value.at).toBe("2026-10-04T05:23:05.000Z");
    expect(parsePose({ enu: [1, 2, 3], at: "2026-10-04T10:00:00+99:99" }).ok).toBe(false);
  });
  test("EXIF capture times with impossible minutes, seconds or offsets are dropped, not stored", () => {
    expect(parseTakenAt({ DateTimeOriginal: "2026:10:04 14:75:05" })).toBeNull();
    expect(parseTakenAt({ DateTimeOriginal: "2026:10:04 14:23:75" })).toBeNull();
    expect(parseTakenAt({ DateTimeOriginal: "2026:10:04 14:23:05", OffsetTimeOriginal: "+99:99" })).toEqual({ takenAt: "2026-10-04T14:23:05", zone: "unknown" });
    expect(parseTakenAt({ DateTimeOriginal: "2026:10:04 14:23:05", OffsetTimeOriginal: "+14:00" })).toEqual({ takenAt: "2026-10-04T14:23:05+14:00", zone: "exif-offset" });
    expect(parseTakenAt({ DateTimeOriginal: "2026:10:04 14:23:05", OffsetTimeOriginal: "-12:00" })).toEqual({ takenAt: "2026-10-04T14:23:05-12:00", zone: "exif-offset" });
    expect(parseTakenAt({ DateTimeOriginal: "2026:10:04 14:23:05", OffsetTimeOriginal: "+14:60" })?.zone).toBe("unknown");
  });
});

describe("signing out other devices (POST /me/sign-out-others)", () => {
  async function devices(k, n) {
    const me = await k.newContributor({ nickname: "Many Phones" });
    const tokens = [me.token];
    for (let i = 1; i < n; i++) {
      const { code } = (await k.call("GET", "/me/transfer-code", { token: me.token })).body;
      tokens.push((await k.call("POST", "/contributors/claim", { json: { code }, ip: `198.51.100.${i}` })).body.token);
      k.clock.advance(61_000);
    }
    return { me, tokens };
  }
  const works = async (k, token) => (await k.call("GET", "/me", { token })).status === 200;
  test("the caller keeps working; every other device's token stops; the answer says how many", async () => {
    const k = makeApp();
    const { tokens } = await devices(k, 3);
    for (const t of tokens) expect(await works(k, t)).toBe(true);
    const r = await k.call("POST", "/me/sign-out-others", { token: tokens[1] }); // an added device signs the others out
    expect([r.status, r.body]).toEqual([200, { ok: true, revoked: 2 }]);
    expect(await works(k, tokens[1])).toBe(true);
    expect(await works(k, tokens[0])).toBe(false); // the first token was the contributor's own: gone too
    expect(await works(k, tokens[2])).toBe(false);
    expect(k.app.repo.countDeviceTokens(tokens[0].split(".")[0])).toBe(1);
    expect((await k.call("GET", "/me", { token: tokens[1] })).body.nickname).toBe("Many Phones"); // same account, same data
  });
  test("it works from the first device too, and with one device it revokes nothing", async () => {
    const k = makeApp();
    const { tokens } = await devices(k, 3);
    expect((await k.call("POST", "/me/sign-out-others", { token: tokens[0] })).body.revoked).toBe(2);
    expect(await works(k, tokens[0])).toBe(true);
    expect(await works(k, tokens[1])).toBe(false);
    expect((await k.call("POST", "/me/sign-out-others", { token: tokens[0] })).body.revoked).toBe(0);
    const solo = await k.newContributor();
    expect((await k.call("POST", "/me/sign-out-others", { token: solo.token })).body).toEqual({ ok: true, revoked: 0 });
  });
  test("an open transfer code dies with it, new devices can be added afterwards, and the 10-device limit frees up", async () => {
    const k = makeApp();
    const { me, tokens } = await devices(k, 2);
    const { code } = (await k.call("GET", "/me/transfer-code", { token: tokens[0] })).body;
    await k.call("POST", "/me/sign-out-others", { token: tokens[0] });
    expect((await k.call("POST", "/contributors/claim", { json: { code }, ip: "198.51.100.50" })).status).toBe(404);
    const fresh = (await k.call("GET", "/me/transfer-code", { token: tokens[0] })).body.code;
    expect((await k.call("POST", "/contributors/claim", { json: { code: fresh }, ip: "198.51.100.51" })).status).toBe(200);
    expect(k.app.repo.countDeviceTokens(me.id)).toBe(2);
  });
  test("it needs a token; the admin token is not one", async () => {
    const k = makeApp();
    expect((await k.call("POST", "/me/sign-out-others", {})).status).toBe(401);
    expect((await k.call("POST", "/me/sign-out-others", { admin: true })).status).toBe(401);
    expect((await k.call("GET", "/me/sign-out-others", {})).status).toBe(405);
  });
});

describe("a refusal does not leave the request body on the wire", () => {
  // Bun answers a request before its body has arrived; a client that then reuses the connection gets a confusing
  // 400/431 for its NEXT request (reproduced with Bun's fetch against a bare Bun.serve). The service takes the
  // unread body off the connection before it replies. The real-socket version of this is in contrib-server.test.js.
  /** A counted body: `chunks` pieces of `size` bytes, with the Content-Length a real server would see. */
  const counted = (chunks, size) => {
    const seen = { pulled: 0, closed: false, cancelled: false };
    const stream = new ReadableStream({
      pull(c) { if (seen.pulled < chunks) { c.enqueue(new Uint8Array(size)); seen.pulled++; } else { seen.closed = true; c.close(); } },
      cancel() { seen.cancelled = true; },
    });
    return { stream, seen, headers: { "content-length": String(chunks * size), "content-type": "multipart/form-data; boundary=XYZ" } };
  };
  test("a request refused before its body was read (no token, a limit) still has the whole body read and discarded first", async () => {
    const k = makeApp();
    const body = counted(40, 4096);
    const r = await k.call("POST", "/submissions", { raw: body.stream, headers: body.headers });
    expect([r.status, r.body.error]).toEqual([401, "unauthorized"]);
    expect(body.seen.pulled).toBe(40);
    expect(body.seen.closed).toBe(true);
    // the same for a limit decided before the upload is read: the daily count of a contributor
    const j = makeApp({ config: { dailyLimit: 1, ipDailyLimit: 1 } });
    const me = await j.newContributor();
    expect((await j.submit(me, {})).status).toBe(201);
    const second = counted(25, 8192);
    const limited = await j.call("POST", "/submissions", { token: me.token, raw: second.stream, headers: second.headers });
    expect([limited.status, limited.body.error]).toEqual([429, "daily_limit"]);
    expect(second.seen.closed).toBe(true);
  });
  test("a body that is announced as too large is refused at once and is not read at all", async () => {
    const k = makeApp({ config: { maxPhotos: 1, maxPhotoMb: 0.1, maxShotMb: 0.1 } });
    const me = await k.newContributor();
    const body = counted(1, 1);
    const r = await k.call("POST", "/submissions", { token: me.token, raw: body.stream, headers: { ...body.headers, "content-length": String(50 * MB) } });
    expect([r.status, r.body.error]).toEqual([413, "payload_too_large"]);
    expect(body.seen.pulled).toBeLessThanOrEqual(1); // a stream fills its first slot by itself; nothing was read on top of that
    expect(body.seen.closed).toBe(false);
  });
  test("a refused request whose body stalls does not hold the answer back: the slow-upload rules end the wait and the stream is cancelled", async () => {
    const k = makeApp({ config: { uploadGraceS: 0.05, uploadMinKbps: 100 } });
    const g = gated(new Uint8Array(100_000), 1000);
    const t0 = Date.now();
    const r = await k.call("POST", "/submissions", { raw: g.stream, headers: { "content-length": "100000", "content-type": "multipart/form-data; boundary=XYZ" } });
    expect([r.status, r.body.error]).toEqual([401, "unauthorized"]); // the answer is still the refusal, not a timeout
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(g.cancelled).toBe(true);
  });
  test("requests without a body are untouched, and an upload that was read is not read twice", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    expect((await k.call("GET", "/me", { token: me.token })).status).toBe(200);
    expect((await k.submit(me, {})).status).toBe(201);
    const empty = await k.call("POST", "/contributors", { json: {} });
    expect(empty.status).toBe(201);
  });
});
