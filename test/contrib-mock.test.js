// [contrib] The in-memory backend (tools/anime/contrib-mock-api.mjs) and, through it, the client's whole contract over real HTTP: the contract scenario that also
// runs against the real backend (tools/anime/contrib-contract.mjs), then the rules the mock enforces one by one (error codes, limits, CORS, admin).
// In-process only (a Bun.serve on port 8987 and fetch; no child process).
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import sharp from "sharp";
import { startMock, sniff, crewNo, cleanNick, claimCode, PREFIX, DEFAULTS } from "../tools/anime/contrib-mock-api.mjs";
import { runContract } from "../tools/anime/contrib-contract.mjs";
import { createApi, ContribError } from "../src/anime/ui/contrib-api.js";
import { createAccounts, safeStorage } from "../src/anime/ui/contrib-lib.js";

const PORT = 8987, BASE = `http://127.0.0.1:${PORT}`, ADMIN = DEFAULTS.adminToken;
const pose = { enu: [120.5, 30.25, -60.13], latlon: [38.9065, 141.5764], heading: 327, pitch: -12, fov: 55, mode: "walk", at: "2026-10-05T03:04:05.678Z", appVersion: "dev", layoutVersion: "dev", timePreset: "yugata", season: "autumn", viewport: { w: 1440, h: 900, dpr: 2 } };
let mock;
const LIMITS = { maxPhotoMB: 1, maxShotMB: 1, dailyLimit: 40 };   // (1 MB keeps the size tests small; 40 reports a day is plenty for the rule tests)
beforeAll(() => { mock = startMock({ port: PORT, limits: LIMITS }); });
afterAll(() => mock.stop());
beforeEach(() => mock.reset());

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const client = () => { const accounts = createAccounts(safeStorage({ localStorage: mem() }), BASE); return { api: createApi({ base: BASE, accounts }), accounts }; };
const jpeg = async (w = 64, h = 36) => new Blob([await sharp({ create: { width: w, height: h, channels: 3, background: "#6fa8dc" } }).jpeg().toBuffer()], { type: "image/jpeg" });
const photo = async (name = "IMG_0001.JPG", fmt = "jpeg") => new File([await sharp({ create: { width: 48, height: 32, channels: 3, background: "#cc8844" } })[fmt]().toBuffer()], name, { type: `image/${fmt}` });
const fields = async (o = {}) => ({ pose, kind: "issue", category: "sign", note: "看板が1m右です", lang: "ja", consent: true, screenshot: await jpeg(), photos: [], ...o });
const raw = (path, init = {}) => fetch(BASE + path, init);
const post = (path, body, headers = {}) => raw(PREFIX + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const admin = (path, init = {}) => raw(PREFIX + path, { ...init, headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json", ...(init.headers || {}) } });
const review = (id, body) => admin(`/admin/submissions/${id}`, { method: "POST", body: JSON.stringify(body) });
const bearer = (api) => ({ authorization: "Bearer " + api.accounts.get().token });
/** A multipart report by hand: [status, error code, body]. */
async function send(api, o = {}, { headers = {}, files = [] } = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ pose: JSON.stringify(pose), kind: "issue", category: "sign", note: "x", lang: "ja", consent: "1", ...o })) if (v !== undefined) fd.append(k, v);
  for (const [k, f] of files) fd.append(k, f, f.name);
  const r = await raw(PREFIX + "/submissions", { method: "POST", headers: { ...bearer(api), ...headers }, body: fd });
  const j = await r.json(); return [r.status, j.error, j];
}

describe("image sniffing, crew numbers, nicknames and codes: the backend's own input rules", () => {
  test("sniff: JPEG, PNG, WebP and HEIC by their first bytes, nothing else", async () => {
    expect(sniff(new Uint8Array(await (await jpeg()).arrayBuffer()))).toBe("jpeg");
    expect(sniff(new Uint8Array(await (await photo("a.png", "png")).arrayBuffer()))).toBe("png");
    expect(sniff(new Uint8Array(await (await photo("a.webp", "webp")).arrayBuffer()))).toBe("webp");
    expect(sniff(Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]))).toBe("heic");
    for (const b of [[], [1, 2, 3], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0], [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]]) expect(sniff(Uint8Array.from(b))).toBeNull();
  });
  test("crewNo: 14 digits (dashes and full-width digits ok), null when empty, false when wrong", () => {
    expect(crewNo("1234-5678-9012-34")).toBe("12345678901234"); expect(crewNo("１２３４５６７８９０１２３４")).toBe("12345678901234"); expect(crewNo(null)).toBeNull(); expect(crewNo("")).toBeNull(); expect(crewNo("  ")).toBeNull();
    expect(crewNo("123")).toBe(false); expect(crewNo("1234567890123a")).toBe(false); expect(crewNo(12345678901234)).toBe(false);
  });
  test("cleanNick: tidy, at most 24 characters, no links or e-mail addresses, blank means the default", () => {
    expect(cleanNick("  さくら   ちゃん ")).toEqual({ ok: true, value: "さくら ちゃん" }); expect(cleanNick("")).toEqual({ ok: true, value: null }); expect(cleanNick(null)).toEqual({ ok: true, value: null });
    expect(cleanNick("x".repeat(25)).ok).toBe(false); expect(cleanNick("😀".repeat(24)).ok).toBe(true); expect(cleanNick("😀".repeat(25)).ok).toBe(false);
    for (const bad of ["http://x.com", "www.example.jp", "a.example.com", "me@example.com"]) expect([bad, cleanNick(bad).ok]).toEqual([bad, false]);
    expect(cleanNick(5).ok).toBe(false); expect(cleanNick("a\u0000b‮c")).toEqual({ ok: true, value: "abc" });
  });
  test("claimCode: Crockford, case / space / dash free, O I L read as 0 1 1, no U", () => {
    expect(claimCode("k7qm2-xhd9p")).toBe("K7QM2XHD9P"); expect(claimCode(" K7QM2 XHD9P ")).toBe("K7QM2XHD9P"); expect(claimCode("OIL0OIL0OI")).toBe("0110011001");
    for (const bad of ["UUUUUUUUUU", "short", "K7QM2XHD9PX", "", null, 5]) expect([bad, claimCode(bad)]).toEqual([bad, null]);
  });
});

describe("the contract: the same scenario the real backend passes (tools/anime/contrib-contract.mjs), through the app's own client", () => {
  test("every step passes against the mock", async () => {
    mock.stop(); mock = startMock({ port: PORT });   // (the scenario sends a few reports and needs the real limits)
    const out = await runContract({ base: BASE, adminToken: ADMIN });
    expect(out.results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.detail}`)).toEqual([]);
    expect(out.passed).toBeGreaterThanOrEqual(40); expect(out.failed).toBe(0);
    mock.stop(); mock = startMock({ port: PORT, limits: LIMITS });
  });
});

describe("GET /health announces the limits and points (the real backend does since 3e7e425)", () => {
  test("what the operator configured: photos, photo and screenshot size, note length, daily limit, points; the client reads it (config()); setLimits changes it and the rules follow", async () => {
    const h = await (await raw(PREFIX + "/health")).json();
    expect(h).toMatchObject({ ok: true, limits: { maxPhotos: 6, maxPhotoBytes: 1048576, maxScreenshotBytes: 1048576, maxNoteChars: 2000, dailyLimit: 40 }, points: { issue: 5, fix: 20 } });   // (this mock runs with 1 MB photos)
    const { api } = client(); expect(await api.config()).toEqual({ limits: { photos: 6, photoBytes: 1048576, shotBytes: 1048576, note: 2000 }, points: { issue: 5, fix: 20 } });
    mock.setLimits({ maxPhotos: 2, pointsIssue: 9, pointsFix: 40 });
    expect((await api.config())).toMatchObject({ limits: { photos: 2 }, points: { issue: 9, fix: 40 } });
    await api.createContributor(); const three = await Promise.all([photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);
    expect((await send(api, {}, { files: three.map((p) => ["photos", p]) }))[1]).toBe("too_many_photos");   // the rules follow what /health said
    const s = await api.submit(await fields({ photos: [three[0]] })); expect((await (await review(s.id, { status: "accepted" })).json()).points).toBe(9);   // and so do the default points
    mock.setLimits({ maxPhotos: 6, pointsIssue: 5, pointsFix: 20 });
  });
});

describe("the flow, as the sheet lives it", () => {
  test("create, report with a screenshot and photos, see it pending, accept it, see the points and the rank, the board", async () => {
    const { api, accounts } = client();
    expect(await api.health()).toBe(true);
    await api.createContributor({ nickname: "さくら", crewNo: "1234-5678-9012-34" });
    expect(accounts.get().token).toMatch(/^[\w-]+\.[\w-]+$/);   // <id>.<secret>
    const sent = await api.submit(await fields({ kind: "fix", photos: [await photo("IMG_0001.JPG"), await photo("b.png", "png"), await photo("c.webp", "webp")] }), { onProgress() {} });
    expect(sent).toMatchObject({ status: "new", replayed: false }); expect(sent.id.length).toBeGreaterThan(6);
    let me = await api.me();
    expect(me).toMatchObject({ nickname: "さくら", crewNo: "12345678901234", points: 0, accepted: 0, rank: null });
    expect(me.submissions).toHaveLength(1); expect(me.submissions[0]).toMatchObject({ id: sent.id, status: "new", kind: "fix", category: "sign", points: 0, photos: 3, usedVersion: "" });
    expect((await review(sent.id, { status: "accepted", points: 20, reviewerNote: "private" })).status).toBe(200);
    me = await api.me(); expect(me).toMatchObject({ points: 20, accepted: 1, rank: 1 }); expect(me.submissions[0]).toMatchObject({ status: "accepted", points: 20 });
    expect(JSON.stringify(await (await raw(PREFIX + "/me", { headers: bearer(api) })).json())).not.toContain("private");   // the moderator's note never reaches the contributor
    await review(sent.id, { status: "used", version: "v0.2.0" });
    me = await api.me(); expect(me.submissions[0]).toMatchObject({ status: "used", usedVersion: "v0.2.0" }); expect(me.points).toBe(20);
    expect(await api.leaderboard()).toEqual([{ nickname: "さくら", accepted: 1, points: 20, me: true }]);
  });
  test("/me spells the shipped version usedVersion (as the real backend does); the client reads snake_case as well", async () => {
    const { api } = client(); await api.createContributor();
    const s = await api.submit(await fields()); await review(s.id, { status: "used", version: "1.2" });
    const mine = await api.request("GET", "/me", { auth: true });
    expect(mine.body.submissions[0].usedVersion).toBe("1.2"); expect(mine.body.submissions[0].used_version).toBeUndefined(); expect(mine.body.submissions[0].usedAt).toBeTruthy();
    const { normalizeMe } = await import("../src/anime/ui/contrib-api.js");
    expect(normalizeMe({ submissions: [{ ...mine.body.submissions[0], usedVersion: undefined, used_version: "1.2" }] }).submissions[0].usedVersion).toBe("1.2");
  });
  test("a report with no screenshot and no photos is fine when it has a note; the nickname defaults to Guest-XXXX; PATCH /me changes the profile and removes the crew number", async () => {
    const { api } = client(); await api.createContributor({ crewNo: "12345678901234" });
    await api.submit(await fields({ screenshot: undefined }));
    expect((await api.me()).nickname).toMatch(/^Guest-[A-Z0-9]{4}$/);
    const p = await api.updateProfile({ nickname: "ひろ", crewNo: "" }); expect(p).toMatchObject({ nickname: "ひろ", crewNo: "" });
    expect((await api.me()).crewNo).toBe("");
    await expect(api.updateProfile({ crewNo: "123" })).rejects.toMatchObject({ code: "validation" });
    expect((await api.updateProfile({ nickname: "" })).nickname).toMatch(/^Guest-/);
  });
  test("the leaderboard: nickname, accepted count and points (and my own row marked); ordered by points; pending and rejected do not count; no crew number", async () => {
    mock.seed();
    const { api } = client(); await api.createContributor({ nickname: "newbie", crewNo: "12345678901234" });
    const s = await api.submit(await fields()); await review(s.id, { status: "rejected" });
    await api.submit(await fields());   // still pending
    const rows = await api.leaderboard(3);
    expect(rows).toHaveLength(3); expect(rows[0]).toEqual({ nickname: "ひろ", accepted: 2, points: 40, me: false });   // 2 fixes x 20
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["accepted", "me", "nickname", "points"]);
    expect((await api.leaderboard()).some((r) => r.nickname === "newbie")).toBe(false);
    const wire = await (await raw(`${PREFIX}/leaderboard?limit=20`)).text(); expect(wire).not.toContain("12345678901234"); expect(wire).not.toContain("crew"); expect(wire).not.toContain('"me"');
  });
  test("the transfer code: 10 characters shown as XXXXX-XXXXX, 15 minutes, used once; the claimer gets a login for the same contributor; both devices keep working", async () => {
    const a = client(); await a.api.createContributor({ nickname: "さくら" });
    const s = await a.api.submit(await fields());
    const wire = await (await raw(PREFIX + "/me/transfer-code", { headers: bearer(a.api) })).json();
    expect(wire.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/); expect(wire.expiresInSeconds).toBe(900); expect(Date.parse(wire.expiresAt) - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
    const t = await a.api.transferCode();
    expect(t.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/); expect(t.expiresAt - Date.now()).toBeGreaterThan(14 * 60 * 1000);
    const b = client();
    await expect(b.api.claim("0000000000")).rejects.toMatchObject({ code: "not_found" });
    expect(await b.api.claim(t.code.toLowerCase().replace(/^(.{5})/, "$1-"))).toMatchObject({ id: expect.any(String), token: expect.any(String) });   // typed in lowercase with a dash
    expect((await b.api.me()).submissions.map((x) => x.id)).toEqual([s.id]);
    expect((await a.api.me()).nickname).toBe("さくら");   // the first device still works
    await expect(client().api.claim(t.code)).rejects.toMatchObject({ code: "not_found" });   // single use
    const t2 = await a.api.transferCode(), t3 = await a.api.transferCode();
    expect(t3.code).not.toBe(t2.code); await expect(client().api.claim(t2.code)).rejects.toMatchObject({ code: "not_found" });   // a new code replaces the old one
  });
  test("an expired code is not_found", async () => {
    mock.stop(); mock = startMock({ port: PORT, limits: { codeTtlMs: 30 } });
    const a = client(); await a.api.createContributor(); const t = await a.api.transferCode(); await Bun.sleep(60);
    await expect(client().api.claim(t.code)).rejects.toMatchObject({ code: "not_found" });
    mock.stop(); mock = startMock({ port: PORT, limits: LIMITS });
  });
  test("delete everything I sent: the reports, the files, the nickname and the number are gone, the leaderboard forgets me, every token of mine stops working", async () => {
    mock.seed();
    const a = client(); await a.api.createContributor({ nickname: "さくら2", crewNo: "12345678901234" });
    const s = await a.api.submit(await fields({ kind: "fix", photos: [await photo()] })); await review(s.id, { status: "accepted" });
    const files = mock.state.files.size, other = mock.state.submissions.size;
    expect(files).toBe(2);   // the photo and the screenshot (the seed has none)
    const b = client(); await b.api.claim((await a.api.transferCode()).code);
    expect((await raw(PREFIX + "/me", { method: "DELETE", headers: bearer(b.api) })).status).toBe(400);   // no confirm=1
    expect(await b.api.deleteMe()).toEqual({ deletedFiles: 2 });
    expect(mock.state.files.size).toBe(0); expect(mock.state.submissions.size).toBe(other - 1);
    await expect(a.api.me()).rejects.toMatchObject({ code: "auth", status: 401 });
    expect((await a.api.leaderboard()).some((r) => r.nickname === "さくら2")).toBe(false);
  });
});

describe("the rules the real backend enforces, as errors the sheet can explain ({ error: code, message })", () => {
  test("consent=1 is required; unknown category, kind or lang; the pose must be complete; the note is at most 2000; the kind defaults from the photos", async () => {
    const { api } = client(); await api.createContributor();
    expect((await send(api))[0]).toBe(201);
    expect((await send(api, { consent: undefined })).slice(0, 2)).toEqual([400, "consent_required"]); expect((await send(api, { consent: "0" }))[1]).toBe("consent_required"); expect((await send(api, { consent: "yes" }))[0]).toBe(201);
    expect((await send(api, { category: "castle" }))[1]).toBe("invalid_category"); expect((await send(api, { category: undefined }))[0]).toBe(201);   // (defaults to other)
    expect((await send(api, { kind: "wish" }))[1]).toBe("invalid_kind"); expect((await send(api, { lang: "x" }))[1]).toBe("invalid_lang");
    for (const bad of ["{", "[]", JSON.stringify({ ...pose, enu: [1, 2] }), JSON.stringify({ ...pose, fov: "wide" }), JSON.stringify({ ...pose, fov: 200 }), JSON.stringify({ ...pose, mode: "a b" }), JSON.stringify({ ...pose, season: "" })]) expect([bad, (await send(api, { pose: bad }))[1]]).toEqual([bad, "invalid_pose"]);
    expect((await send(api, { pose: JSON.stringify({ ...pose, season: null, timePreset: null }) }))[0]).toBe(201);   // (null is fine, an empty string is not: capturePose never sends one)
    expect((await send(api, { note: "x".repeat(2001) }))[1]).toBe("note_too_long");
    expect((await send(api, { kind: undefined }, { files: [["photos", await photo()]] }))[2]).toMatchObject({ kind: "fix", photos: 1 });   // kind defaults to fix with a photo, issue without
    expect((await send(api, { kind: undefined }))[2]).toMatchObject({ kind: "issue", photos: 0 });
    const r = await raw(PREFIX + "/submissions", { method: "POST", headers: { ...bearer(api), "content-type": "application/json" }, body: "{}" }); expect([r.status, (await r.json()).error]).toEqual([415, "unsupported_media_type"]);
  });
  test("a fix needs a photo; an empty report is refused; at most 6 photos; the types are checked by their bytes, not their names", async () => {
    const { api } = client(); await api.createContributor();
    expect((await send(api, { kind: "fix" })).slice(0, 2)).toEqual([400, "fix_needs_photos"]);
    expect((await send(api, { note: "" })).slice(0, 2)).toEqual([400, "empty_submission"]);
    const seven = await Promise.all(Array.from({ length: 7 }, (_, i) => photo(`${i}.jpg`)));
    const r7 = await send(api, {}, { files: seven.map((p) => ["photos", p]) });
    expect([r7[0], r7[1], r7[2].max]).toEqual([400, "too_many_photos", 6]);
    expect((await api.submit(await fields({ photos: seven.slice(0, 6) }))).status).toBe("new");
    const fake = new File([new TextEncoder().encode("MZ this is an exe pretending to be a photo")], "IMG_1.JPG", { type: "image/jpeg" });
    await expect(api.submit(await fields({ photos: [fake] }))).rejects.toMatchObject({ code: "type", reason: "invalid_image", status: 415 });
    const bad = await send(api, {}, { files: [["photos", await photo()], ["photos", fake]] }); expect(bad[2]).toMatchObject({ error: "invalid_image", field: "photos", index: 1 });
    const heic = new File([Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0])], "IMG_2.HEIC", { type: "" });
    expect((await api.submit(await fields({ kind: "fix", photos: [heic] }))).status).toBe("new");
    expect((await send(api, {}, { files: [["photo", await photo()]] }))[2].photos).toBe(1); expect((await send(api, {}, { files: [["photos[]", await photo()]] }))[2].photos).toBe(1);   // (the other field names the backend accepts)
  });
  test("size limits: a photo or a screenshot over its limit is 413 with its own code (the mock runs with 1 MB to keep the test small)", async () => {
    const { api } = client(); await api.createContributor();
    const big = new Uint8Array(1_200_000); big.set([0xff, 0xd8, 0xff, 0xe0]);
    await expect(api.submit(await fields({ photos: [new File([big], "big.jpg", { type: "image/jpeg" })] }))).rejects.toMatchObject({ code: "too_large", reason: "photo_too_large", status: 413 });
    await expect(api.submit(await fields({ screenshot: new Blob([big], { type: "image/jpeg" }) }))).rejects.toMatchObject({ code: "too_large", reason: "screenshot_too_large" });
    expect((await api.submit(await fields({ screenshot: new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0, 0, 0])], { type: "image/jpeg" }) }))).status).toBe("new");
    await expect(api.submit(await fields({ screenshot: new Blob([new TextEncoder().encode("GIF89a....")], { type: "image/jpeg" }) }))).rejects.toMatchObject({ code: "type" });
  });
  test("a daily limit per contributor: the 5th report of the day is 429 daily_limit with Retry-After (this mock runs with 4); another contributor is fine", async () => {
    mock.stop(); mock = startMock({ port: PORT, limits: { ...LIMITS, dailyLimit: 4 } });
    const { api } = client(); await api.createContributor();
    for (let i = 0; i < 4; i++) await api.submit(await fields());
    const e = await api.submit(await fields()).catch((x) => x);
    expect(e).toBeInstanceOf(ContribError); expect(e).toMatchObject({ code: "daily", reason: "daily_limit", status: 429, retryable: false }); expect(e.retryAfterSeconds).toBeGreaterThan(86000);
    const again = client(); await again.api.createContributor(); await again.api.submit(await fields());   // (the IP limit is 3x)
    mock.stop(); mock = startMock({ port: PORT, limits: LIMITS });
  });
  test("Idempotency-Key: a retry returns the first report (200, replayed, same id) and makes no second; the key is per contributor; a bad key is 400; no key means every call is new", async () => {
    const a = client(), b = client(); await a.api.createContributor(); await b.api.createContributor();
    const first = await send(a.api, {}, { headers: { "idempotency-key": "key-12345678" } }), again = await send(a.api, {}, { headers: { "idempotency-key": "key-12345678" } });
    expect([first[0], again[0], again[2].replayed, again[2].id === first[2].id]).toEqual([201, 200, true, true]); expect((await a.api.me()).submissions).toHaveLength(1);
    const res = await raw(PREFIX + "/submissions", { method: "POST", headers: { ...bearer(a.api), "idempotency-key": "key-12345678" }, body: (() => { const fd = new FormData(); fd.append("pose", JSON.stringify(pose)); fd.append("consent", "1"); fd.append("note", "x"); return fd; })() });
    expect(res.headers.get("idempotent-replayed")).toBe("true");
    const other = await send(b.api, {}, { headers: { "idempotency-key": "key-12345678" } }); expect([other[0], other[2].id === first[2].id]).toEqual([201, false]);
    expect((await send(a.api, {}, { headers: { "idempotency-key": "x" } }))[1]).toBe("invalid_idempotency_key");
    await send(a.api); await send(a.api); expect((await a.api.me()).submissions).toHaveLength(3);
  });
  test("a bad token is 401 unauthorized and the client forgets it; no token is 401; a banned contributor is 403 banned", async () => {
    const { api, accounts } = client(); await api.createContributor();
    const good = accounts.get().token; accounts.set({ id: "x", token: good.slice(0, -2) + "zz" });
    await expect(api.me()).rejects.toMatchObject({ code: "auth", status: 401, reason: "unauthorized" }); expect(accounts.get()).toBeNull();
    expect((await raw(PREFIX + "/me")).status).toBe(401);
    accounts.set({ id: "x", token: good }); const [c] = [...mock.state.contributors.values()]; c.banned = true;
    await expect(api.me()).rejects.toMatchObject({ code: "banned", status: 403 });
  });
  test("nickname and クルーNo. rules on /contributors and PATCH /me: invalid_nickname, invalid_crew_no, invalid_json, unsupported_media_type", async () => {
    const j = async (r) => [r.status, (await r.json()).error];
    expect(await j(await post("/contributors", { nickname: "x", crewNo: "123" }))).toEqual([400, "invalid_crew_no"]);
    expect(await j(await post("/contributors", { nickname: 5 }))).toEqual([400, "invalid_nickname"]); expect(await j(await post("/contributors", { nickname: "www.example.com" }))).toEqual([400, "invalid_nickname"]);
    expect((await post("/contributors", {})).status).toBe(201);
    expect(await j(await raw(PREFIX + "/contributors", { method: "POST", headers: { "content-type": "application/json" }, body: "[1]" }))).toEqual([400, "invalid_json"]);
    expect(await j(await raw(PREFIX + "/contributors", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }))).toEqual([400, "invalid_json"]);
    expect(await j(await raw(PREFIX + "/contributors", { method: "POST", body: "{}" }))).toEqual([415, "unsupported_media_type"]);
    const { api } = client(); await api.createContributor({ nickname: "a" });
    const patch = (b) => raw(PREFIX + "/me", { method: "PATCH", headers: { ...bearer(api), "content-type": "application/json" }, body: JSON.stringify(b) });
    expect(await j(await patch({ nickname: "http://x.com" }))).toEqual([400, "invalid_nickname"]); expect(await j(await patch({ crewNo: "1" }))).toEqual([400, "invalid_crew_no"]);
    expect((await (await patch({ nickname: null })).json()).nickname).toMatch(/^Guest-/); expect((await (await patch({ crewNo: "1234-5678-9012-34" })).json()).crewNo).toBe("12345678901234"); expect((await (await patch({ nickname: "ok" })).json()).crewNo).toBe("12345678901234");   // an omitted key is left alone
  });
  test("claim: 5 tries an hour per client (the rejected ones count): the 6th is 429 rate_limited with Retry-After; malformed is 400; a full account is 409 too_many_devices", async () => {
    mock.stop(); mock = startMock({ port: PORT, limits: { claimAttempts: 3, maxDevices: 2 } });
    const a = client(); await a.api.createContributor(); const code = (await a.api.transferCode()).code;
    const t = async (c) => { const r = await post("/contributors/claim", { code: c }); return [r.status, (await r.json()).error, r.headers.get("retry-after")]; };
    expect(await t("UUUUUUUUUU")).toEqual([400, "code_malformed", null]); expect((await t("ABCDEFGHJK"))[1]).toBe("code_not_found");
    expect((await t(code))[0]).toBe(200);   // the 3rd try: a second login (2 of 2 devices)
    const limited = await t(code); expect([limited[0], limited[1]]).toEqual([429, "rate_limited"]); expect(Number(limited[2])).toBeGreaterThan(3000);
    mock.stop(); mock = startMock({ port: PORT, limits: { maxDevices: 2 } });
    const c = client(); await c.api.createContributor();
    await client().api.claim((await c.api.transferCode()).code);   // the 2nd device
    const full = await post("/contributors/claim", { code: (await c.api.transferCode()).code }); expect([full.status, (await full.json()).error]).toEqual([409, "too_many_devices"]);
    mock.stop(); mock = startMock({ port: PORT, limits: LIMITS });
  });
});

describe("CORS, the admin routes, and the odds and ends", () => {
  test("a preflight from a local origin allows the methods and headers the client uses (Idempotency-Key, DELETE); a stranger's origin is 403 origin_not_allowed with no CORS headers", async () => {
    const ok = await raw(PREFIX + "/submissions", { method: "OPTIONS", headers: { origin: "http://127.0.0.1:8986", "access-control-request-method": "POST", "access-control-request-headers": "authorization,idempotency-key" } });
    expect(ok.status).toBe(204); expect(ok.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:8986");
    expect(ok.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type, Idempotency-Key, X-Admin-Name"); for (const m of ["PATCH", "DELETE", "GET", "POST"]) expect(ok.headers.get("access-control-allow-methods")).toContain(m);
    const no = await raw(PREFIX + "/submissions", { method: "OPTIONS", headers: { origin: "https://evil.example" } }); expect(no.status).toBe(403); expect(no.headers.get("access-control-allow-origin")).toBeNull(); expect((await no.json()).error).toBe("origin_not_allowed");
    const res = await raw(PREFIX + "/health", { headers: { origin: "https://evil.example" } }); expect(res.status).toBe(403); expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect((await raw(PREFIX + "/health")).status).toBe(200);   // (no Origin header: curl, a same-origin page)
    const m2 = startMock({ port: 8986, origins: ["https://app.example"] });
    try { const r = await fetch(`http://127.0.0.1:8986${PREFIX}/health`, { headers: { origin: "https://app.example" } }); expect(r.status).toBe(200); expect(r.headers.get("access-control-allow-origin")).toBe("https://app.example"); expect(r.headers.get("access-control-expose-headers")).toContain("Retry-After"); } finally { m2.stop(); }
  });
  test("every response is no-store JSON with a request id; unknown routes and methods are JSON errors in the same shape", async () => {
    const h = await raw(PREFIX + "/health"); expect(h.headers.get("cache-control")).toBe("no-store"); expect(h.headers.get("content-type")).toContain("application/json"); expect(h.headers.get("x-request-id")).toBeTruthy();
    expect((await raw(PREFIX + "/nope")).status).toBe(404); expect((await raw("/elsewhere")).status).toBe(404); expect(await (await raw(PREFIX + "/nope")).json()).toMatchObject({ error: "not_found", message: expect.any(String) });
    const { api } = client(); await api.createContributor();
    expect(await (await raw(PREFIX + "/me", { method: "PUT", headers: bearer(api) })).json()).toMatchObject({ error: "method_not_allowed" });
  });
  test("admin routes need the admin token (a contributor's token is not enough)", async () => {
    const { api } = client(); await api.createContributor();
    expect((await raw(PREFIX + "/admin/submissions")).status).toBe(401);
    expect((await raw(PREFIX + "/admin/submissions", { headers: bearer(api) })).status).toBe(401);
    expect((await raw(PREFIX + "/admin/submissions", { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await admin("/admin/submissions")).status).toBe(200);
  });
  test("admin list, detail with photo URLs and the stored files, review validation and the default points (5 for a report, 20 for a fix)", async () => {
    const { api } = client(); await api.createContributor({ nickname: "さくら" });
    const s = await api.submit(await fields({ photos: [await photo()] }));
    const list = await (await admin("/admin/submissions?status=new")).json();
    expect(list).toMatchObject({ total: 1, limit: 25, offset: 0 }); expect(list.items[0]).toMatchObject({ id: s.id, status: "new", kind: "issue", photoCount: 1, hasScreenshot: true, contributor: { nickname: "さくら", banned: false }, location: { lat: 38.9065, lon: 141.5764, source: "pose" } });
    expect((await (await admin("/admin/submissions?status=accepted")).json()).total).toBe(0); expect((await (await admin("/admin/submissions?kind=fix")).json()).total).toBe(0);
    const d = await (await admin(`/admin/submissions/${s.id}`)).json();
    expect(d.pose).toEqual(pose); expect(d.photos).toHaveLength(1); expect(d.photos[0]).toMatchObject({ n: 1, mime: "image/jpeg" }); expect(d.screenshot.url).toContain("/admin/files/submissions/");
    const f = await raw(d.photos[0].url, { headers: { authorization: `Bearer ${ADMIN}` } }); expect(f.status).toBe(200); expect(f.headers.get("content-type")).toBe("image/jpeg"); expect(sniff(new Uint8Array(await f.arrayBuffer()))).toBe("jpeg");
    expect((await raw(d.photos[0].url)).status).toBe(401);
    expect((await (await review(s.id, { status: "great" })).json()).error).toBe("invalid_status"); expect((await (await review(s.id, { status: "accepted", points: -1 })).json()).error).toBe("invalid_points"); expect((await (await review(s.id, { status: "used", version: "a b" })).json()).error).toBe("invalid_version");
    expect((await admin("/admin/submissions/nope")).status).toBe(404);
    expect((await (await review(s.id, { status: "accepted" })).json()).points).toBe(5);   // the default for a report
    const fix = await api.submit(await fields({ kind: "fix", photos: [await photo()] })); expect((await (await review(fix.id, { status: "accepted" })).json()).points).toBe(20);
    expect((await (await review(fix.id, { status: "rejected" })).json())).toMatchObject({ points: 0, status: "rejected" });
    expect((await (await admin(`/admin/submissions/${s.id}`, { method: "DELETE" })).json())).toEqual({ ok: true, deletedFiles: 2 }); expect((await admin(`/admin/submissions/${s.id}`)).status).toBe(404);
  });
  test("mark-used: only accepted reports, never over another release; the answer lists what happened", async () => {
    const { api } = client(); await api.createContributor();
    const [a, b, c] = [await api.submit(await fields()), await api.submit(await fields()), await api.submit(await fields())];
    await review(a.id, { status: "accepted" }); await review(b.id, { status: "used", version: "v1" });
    const mu = (body) => admin("/admin/submissions/mark-used", { method: "POST", body: JSON.stringify(body) });
    const r = await (await mu({ ids: [a.id, b.id, c.id, "nope"], version: "v2" })).json();
    expect(r).toEqual({ version: "v2", updated: [a.id], skipped: [{ id: b.id, reason: "already_used" }, { id: c.id, reason: "not_accepted" }], notFound: ["nope"] });
    expect((await (await mu({ ids: [a.id], version: "v2" })).json()).skipped).toEqual([{ id: a.id, reason: "unchanged" }]);
    expect((await (await mu({ ids: [a.id] })).json()).error).toBe("version_required"); expect((await (await mu({ ids: [], version: "v2" })).json()).error).toBe("invalid_ids");
  });
  test("crew.csv: UTF-8 with a BOM, CRLF, crew_no as =\"digits\" (Excel keeps all 14), nickname, points, accepted; only reviewed reports of people who gave a number; excel=0 for bare digits", async () => {
    const a = client(); await a.api.createContributor({ nickname: 'Mi"ka', crewNo: "1234-5678-9012-34" });
    const b = client(); await b.api.createContributor({ nickname: "no number" });
    const c = client(); await c.api.createContributor({ nickname: "=SUM(1)", crewNo: "99999999999999" });
    for (const x of [a, a, b, c]) { const s = await x.api.submit(await fields()); await review(s.id, { status: "accepted", points: 5 }); }
    const res = await admin("/admin/export/crew.csv"), bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);   // the BOM Excel needs (Response.text() would strip it)
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1)).toBe('crew_no,nickname,points,accepted\r\n="12345678901234","Mi""ka",10,2\r\n="99999999999999",\'=SUM(1),5,1\r\n');
    expect(new TextDecoder().decode(await (await admin("/admin/export/crew.csv?excel=0")).arrayBuffer())).toContain("\r\n12345678901234,");
    expect(new TextDecoder().decode(await (await admin("/admin/export/crew.csv?from=2099-01-01")).arrayBuffer())).toBe("crew_no,nickname,points,accepted\r\n");
    const js = await (await admin("/admin/export/submissions.json?status=accepted")).json(); expect(js).toMatchObject({ status: "accepted", count: 4 }); expect(js.submissions).toHaveLength(4);
  });
  test("/__mock: seed, state, reset", async () => {
    expect((await raw("/__mock/seed", { method: "POST" })).status).toBe(200);
    const st = await (await raw("/__mock/state")).json(); expect(st.contributors).toBe(5);
    await raw("/__mock/reset", { method: "POST" }); expect((await (await raw("/__mock/state")).json()).contributors).toBe(0);
    expect(new ContribError("x")).toBeInstanceOf(Error);
  });
});
