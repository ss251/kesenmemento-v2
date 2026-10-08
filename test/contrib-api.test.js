// [contrib] The report backend's client (ui/contrib-api.js) against a MOCKED fetch (and a fake XMLHttpRequest for the upload): the exact
// requests it makes, the multipart report, both spellings of the backend's JSON, and every failure turning into the right ContribError.
import { describe, test, expect } from "bun:test";
import {
  PREFIX, ContribError, messageKey, explainError, retryAfterSeconds, isLocalHost, normalizeBase, resolveApiBase, normalizeSub, normalizeMe, normalizeBoard, normalizeTransfer, normalizeConfig,
  buildSubmissionForm, errorFromResponse, xhrRequest, createApi,
} from "../src/anime/ui/contrib-api.js";
import { CONTRIB_API, createAccounts, createT, safeStorage, KEYS, STRINGS } from "../src/anime/ui/contrib-lib.js";
import { poseToJson } from "../src/anime/core/pose.js";

const BASE = "http://127.0.0.1:8988";
const pose = { enu: [120.5, 30.25, -60.13], latlon: [38.9065, 141.5764], heading: 327, pitch: -12, fov: 55, mode: "walk", at: "2026-10-05T03:04:05.678Z", appVersion: "dev", layoutVersion: "dev", timePreset: "yugata", season: "autumn", viewport: { w: 1440, h: 900, dpr: 2 } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** A recording fetch: handler(url, init, i) -> Response | throws. */
function mock(handler) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, ...init }); return handler(url, init, calls.length - 1); };
  return { fetch, calls };
}
/** An API with a fresh storage-backed login; `login` pre-seeds an account. */
function api(handler, { login = true, XMLHttpRequest = undefined } = {}) {
  const ls = mem(), accounts = createAccounts(safeStorage({ localStorage: ls }), BASE);
  if (login) accounts.set({ id: "u1", token: "u1.secret" });
  const m = mock(handler);
  return { api: createApi({ base: BASE, accounts, fetch: m.fetch, XMLHttpRequest, now: () => 1_700_000_000_000 }), calls: m.calls, accounts, ls };
}

describe("which backend: the default, or ?contribApi= when it is usable", () => {
  test("isLocalHost: loopback and private LAN addresses only", () => {
    for (const h of ["localhost", "127.0.0.1", "127.9.9.9", "::1", "[::1]", "10.0.0.5", "192.168.1.20", "172.16.0.1", "172.31.255.255", "169.254.1.1", "mac.local", "LOCALHOST"]) expect([h, isLocalHost(h)]).toEqual([h, true]);
    for (const h of ["example.com", "8.8.8.8", "172.32.0.1", "172.15.0.1", "192.169.1.1", "11.0.0.1", "evil-localhost.com", "contrib.example", "", null]) expect([h, isLocalHost(h)]).toEqual([h, false]);
  });
  test("normalizeBase: https anywhere, http only on a local host, no credentials, no trailing slash", () => {
    expect(normalizeBase("https://api.example.com/")).toBe("https://api.example.com");
    expect(normalizeBase("https://api.example.com/contrib/")).toBe("https://api.example.com/contrib");
    expect(normalizeBase("http://127.0.0.1:8988")).toBe("http://127.0.0.1:8988"); expect(normalizeBase("http://localhost:8988/")).toBe("http://localhost:8988");
    expect(normalizeBase("  https://a.example.com  ")).toBe("https://a.example.com");
    for (const bad of ["http://api.example.com", "ftp://x.example.com", "javascript:alert(1)", "https://user:pw@api.example.com", "https://a.example.com/#x", "not a url", "", null, "//a.example.com"]) expect([bad, normalizeBase(bad)]).toEqual([bad, null]);
  });
  test("resolveApiBase: the default is empty; ?contribApi= when it is usable; a rejected one falls back and says so", () => {
    expect(CONTRIB_API).toBe("");
    expect(resolveApiBase("")).toEqual({ base: "", custom: false, host: "", local: false, rejected: "" });
    expect(resolveApiBase("?lang=en")).toMatchObject({ base: "", custom: false, host: "" });
    expect(resolveApiBase("?contribApi=http://127.0.0.1:8988")).toEqual({ base: "http://127.0.0.1:8988", custom: true, host: "127.0.0.1:8988", local: true, rejected: "" });
    expect(resolveApiBase("?contribApi=https%3A%2F%2Fapi.example.com%2F")).toEqual({ base: "https://api.example.com", custom: true, host: "api.example.com", local: false, rejected: "" });
    expect(resolveApiBase("?contribApi=http://api.example.com")).toMatchObject({ base: "", custom: false, rejected: "http://api.example.com" });
    expect(resolveApiBase("?contribApi=/")).toMatchObject({ base: "", custom: false, rejected: "/" });   // a relative override is not a backend
    expect(resolveApiBase("?contribApi=https://b.example/", { fallback: "https://b.example" })).toMatchObject({ base: "https://b.example", custom: false });   // the default spelled out is not "custom"
    expect(resolveApiBase("?contribApi=x", { fallback: "https://b.example" }).base).toBe("https://b.example");
  });
  test("no backend: fetch and XMLHttpRequest are never called, for an empty base or a relative one", async () => {
    let fetches = 0, xhrs = 0;
    const fetch = async () => { fetches++; return json({}); };
    class XHR { open() { xhrs++; } send() { xhrs++; } setRequestHeader() {} }
    const accounts = createAccounts(safeStorage({ localStorage: mem() }), "");
    accounts.set({ id: "u", token: "t" });
    const quiet = async (p) => { try { return await p; } catch (e) { expect(e).toBeInstanceOf(ContribError); expect(e.code).toBe("unconfigured"); return e; } };
    for (const base of ["", "/api/contrib/v1", "api"]) {
      const api = createApi({ base, accounts, fetch, XMLHttpRequest: XHR });
      expect(await api.health()).toBe(false); expect(await api.config()).toBeNull();
      await quiet(api.me()); await quiet(api.leaderboard()); await quiet(api.transferCode()); await quiet(api.claim("K7M2X9QP4A"));
      await quiet(api.createContributor({ nickname: "さくら" })); await quiet(api.updateProfile({ nickname: "あ" }));
      await quiet(api.submit({ consent: true, pose, kind: "issue", category: "sign", note: "x", lang: "ja", photos: [] }, { onProgress() {} }));
      const erased = await quiet(api.deleteMe()); expect(erased.code).toBe("unconfigured");
    }
    expect(fetches).toBe(0); expect(xhrs).toBe(0); expect(accounts.get().token).toBe("t");   // a refused delete did not forget the login, and did not call the server
  });
  test("?contribApi= is the base the client calls", async () => {
    const got = resolveApiBase("?contribApi=https://api.example.com");
    expect(got).toMatchObject({ base: "https://api.example.com", custom: true, host: "api.example.com" });
    let url = "";
    const accounts = createAccounts(safeStorage({ localStorage: mem() }), got.base);
    const api = createApi({ base: got.base, accounts, fetch: async (u) => { url = String(u); return json([]); } });
    await api.leaderboard();
    expect(url).toBe("https://api.example.com/api/contrib/v1/leaderboard?limit=20");
  });
});

describe("the JSON the backend sends, in either spelling", () => {
  test("normalizeSub reads camelCase and snake_case and tidies the values; the moderator's private note is never read", () => {
    const camel = normalizeSub({ id: "s1", createdAt: "2026-10-05T01:00:00Z", status: "used", kind: "fix", category: "sign", note: "看板", points: 20, photos: 2, reviewerNote: "private", usedVersion: "v1.2", usedAt: "2026-10-05T02:00:00Z" });
    const snake = normalizeSub({ id: "s1", created_at: "2026-10-05T01:00:00Z", status: "USED", kind: "fix", category: "sign", note: "看板", points: "20", photo_count: "2", reviewer_note: "private", used_version: "v1.2", used_at: "2026-10-05T02:00:00Z" });
    expect(camel).toEqual({ id: "s1", createdAt: "2026-10-05T01:00:00Z", status: "used", kind: "fix", category: "sign", note: "看板", points: 20, photos: 2, usedVersion: "v1.2", usedAt: "2026-10-05T02:00:00Z" });
    expect(snake).toEqual(camel); expect("reviewerNote" in camel).toBe(false);
    expect(normalizeSub({ id: 7, status: "weird", kind: "?" })).toMatchObject({ id: "7", status: "new", kind: "issue", category: "other", points: 0, photos: 0, usedVersion: "", usedAt: "" });
    expect(normalizeSub({ id: "n", usedVersion: null, usedAt: null, photos: 0 })).toMatchObject({ usedVersion: "", usedAt: "" });   // (the backend sends null until it is shipped)
    expect(normalizeSub(null)).toBeNull(); expect(normalizeSub("x")).toBeNull();
  });
  test("normalizeMe: profile, the points total (the server's, else the sum of accepted and used), newest first", () => {
    const subs = [
      { id: "a", created_at: "2026-10-01T00:00:00Z", status: "accepted", points: 5 },
      { id: "b", created_at: "2026-10-03T00:00:00Z", status: "used", points: 20, used_version: "1.2" },
      { id: "c", created_at: "2026-10-02T00:00:00Z", status: "new", points: 5 },
      { id: "d", created_at: "2026-10-04T00:00:00Z", status: "rejected", points: 5 },
    ];
    const a = normalizeMe({ contributorId: "u1", nickname: "さくら", crewNo: "1234-5678-9012-34", points: 25, accepted: 2, rank: 3, submissions: subs });
    expect(a).toMatchObject({ id: "u1", nickname: "さくら", crewNo: "12345678901234", points: 25, accepted: 2, rank: 3 });
    expect(a.submissions.map((s) => s.id)).toEqual(["d", "b", "c", "a"]);
    const b = normalizeMe({ id: "u1", nickname: "x", crew_no: null, points_total: "30", submissions: subs }); expect(b.points).toBe(30); expect(b.crewNo).toBe("");
    const c = normalizeMe({ id: "u1", submissions: subs }); expect(c.points).toBe(25);   // 5 + 20: pending and rejected do not count
    expect(normalizeMe({ profile: { contributorId: "p", nickname: "n", crewNo: "12345678901234" }, total: 7 })).toMatchObject({ id: "p", nickname: "n", crewNo: "12345678901234", points: 7, submissions: [] });
    expect(normalizeMe(null)).toEqual({ id: "", nickname: "", crewNo: "", points: 0, accepted: 0, rank: null, submissions: [] });
    expect(normalizeMe({ id: "u", submissions: subs }).accepted).toBe(2);   // counted from the reports when the server does not say
    expect(normalizeMe({ id: "u", rank: null }).rank).toBeNull(); expect(normalizeMe({ id: "u", rank: 0 }).rank).toBeNull(); expect(normalizeMe({ id: "u", rank: "2" }).rank).toBe(2);
    const real = normalizeMe({ contributorId: "NvshdE2otgXEa0kw", nickname: "そら", crewNo: "12345678901234", createdAt: "2026-10-05T04:08:21.855Z", banned: false, points: 20, pointsTotal: 20, accepted: 1, rank: 1,   // (the real backend's /me)
      submissions: [{ id: "wez6dx6rjpret02x", createdAt: "2026-10-05T04:08:21.905Z", status: "used", kind: "fix", category: "sign", note: "看板の位置がちがう", points: 20, photos: 1, reviewedAt: "2026-10-05T04:08:21.919Z", usedVersion: "v0.5.0", usedAt: "2026-10-05T04:08:21.920Z" }] });
    expect(real).toMatchObject({ id: "NvshdE2otgXEa0kw", points: 20, accepted: 1, rank: 1 }); expect(real.submissions[0]).toMatchObject({ status: "used", usedVersion: "v0.5.0", photos: 1 });
    expect(normalizeMe({ crewNo: "not a number" }).crewNo).toBe("");
  });
  test("normalizeBoard: an array, or an object that holds one; nickname, count, points and which row is mine; never a crew number", () => {
    const rows = [{ nickname: "さくら", accepted: 3, points: 35 }, { name: "Bob", accepted_count: "1", points: "5", me: true }, { points: 2 }, null, "x"];
    const want = [{ nickname: "さくら", accepted: 3, points: 35, me: false }, { nickname: "Bob", accepted: 1, points: 5, me: true }, { nickname: "—", accepted: 0, points: 2, me: false }];
    expect(normalizeBoard(rows)).toEqual(want); expect(normalizeBoard({ leaderboard: rows })).toEqual(want); expect(normalizeBoard({ items: rows })).toEqual(want);
    expect(normalizeBoard(null)).toEqual([]); expect(normalizeBoard({})).toEqual([]); expect(normalizeBoard({ rows: "no" })).toEqual([]);
    expect(Object.keys(normalizeBoard([{ nickname: "a", accepted: 1, points: 1, crewNo: "12345678901234" }])[0]).sort()).toEqual(["accepted", "me", "nickname", "points"]);   // never a crew number
    expect(normalizeBoard([{ nickname: "a", me: "yes" }, { nickname: "b", me: 1 }]).map((r) => r.me)).toEqual([false, false]);   // (only a real true marks a row)
  });
  test("normalizeTransfer: an ISO or epoch expiry, or a ttl; 15 minutes when the server says nothing", () => {
    const now = 1_700_000_000_000;
    expect(normalizeTransfer({ code: " K7M2X9QP4A ", expiresAt: "2026-10-05T03:15:00Z" }, now)).toEqual({ code: "K7M2X9QP4A", expiresAt: Date.parse("2026-10-05T03:15:00Z") });
    expect(normalizeTransfer({ code: "7XH6M-AS1FS", expiresAt: "2026-10-05T04:23:21.921Z", expiresInSeconds: 900 }, now)).toEqual({ code: "7XH6MAS1FS", expiresAt: Date.parse("2026-10-05T04:23:21.921Z") });   // the real backend writes the dash
    expect(normalizeTransfer({ code: "A", expires_at: 1_700_000_900 }, now).expiresAt).toBe(1_700_000_900_000);   // epoch seconds
    expect(normalizeTransfer({ code: "A", expiresAt: 1_700_000_900_000 }, now).expiresAt).toBe(1_700_000_900_000);   // epoch ms
    expect(normalizeTransfer({ transfer_code: "A", expires_in: 900 }, now)).toEqual({ code: "A", expiresAt: now + 900_000 });
    expect(normalizeTransfer({ code: "a", expiresInSeconds: 600 }, now)).toEqual({ code: "A", expiresAt: now + 600_000 });
    expect(normalizeTransfer({ code: "A" }, now).expiresAt).toBe(now + 15 * 60 * 1000);
    expect(normalizeTransfer({ code: "A", expiresAt: "junk" }, now).expiresAt).toBe(now + 15 * 60 * 1000);
    expect(normalizeTransfer(null, now)).toEqual({ code: "", expiresAt: now + 900_000 });
  });
});

describe("what the backend announces in GET /health", () => {
  test("normalizeConfig: the limits and the default points, as the operator configured them", () => {
    const real = { ok: true, service: "kesennuma-contrib", version: "1.0.0", storage: "disk", time: "2026-10-05T04:08:21.852Z",   // (the real backend, API.md)
      limits: { maxPhotos: 6, maxPhotoBytes: 15728640, maxScreenshotBytes: 8388608, maxNoteChars: 2000, dailyLimit: 20 }, points: { issue: 5, fix: 20 } };
    expect(normalizeConfig(real)).toEqual({ limits: { photos: 6, photoBytes: 15728640, shotBytes: 8388608, note: 2000 }, points: { issue: 5, fix: 20 } });
    expect(normalizeConfig({ limits: { max_photos: 3, max_photo_bytes: "5242880" }, points: { issue: "7", fix: 30 } })).toEqual({ limits: { photos: 3, photoBytes: 5242880, shotBytes: null, note: null }, points: { issue: 7, fix: 30 } });
  });
  test("an older backend says nothing there; garbage is ignored number by number", () => {
    for (const raw of [null, undefined, "x", [], {}, { ok: true }, { limits: "no", points: 5 }]) expect(normalizeConfig(raw)).toEqual({ limits: null, points: null });
    expect(normalizeConfig({ limits: { maxPhotos: 0, maxPhotoBytes: -1, maxScreenshotBytes: 1.5, maxNoteChars: "many" }, points: { issue: null, fix: "" } })).toEqual({ limits: { photos: null, photoBytes: null, shotBytes: null, note: null }, points: { issue: null, fix: null } });
  });
  test("config(): GET /health with no login and no custom header (a simple request: no preflight); null when the service does not answer", async () => {
    const t = api(() => json({ ok: true, limits: { maxPhotos: 4 }, points: { issue: 6, fix: 25 } }), { login: false });
    expect(await t.api.config()).toEqual({ limits: { photos: 4, photoBytes: null, shotBytes: null, note: null }, points: { issue: 6, fix: 25 } });
    expect(t.calls[0].url).toBe(`${BASE}${PREFIX}/health`); expect(t.calls[0].method).toBe("GET"); expect(t.calls[0].headers).toEqual({ accept: "application/json" });
    expect(await api(() => json({ ok: false }, 503)).api.config()).toBeNull(); expect(await api(() => { throw new TypeError("offline"); }).api.config()).toBeNull();
    expect(await api(() => new Response("<html>", { status: 200 })).api.config()).toBeNull();
  });
});

describe("errors: an HTTP status becomes a ContribError with the right code", () => {
  test("the status table", () => {
    const table = [[400, "validation", false], [422, "validation", false], [401, "auth", false], [403, "auth", false], [404, "not_found", false], [410, "not_found", false], [413, "too_large", false], [415, "type", false],
      [429, "rate", true], [500, "server", true], [502, "server", true], [503, "server", true], [418, "unknown", false], [302, "unknown", false]];
    for (const [status, code, retryable] of table) { const e = errorFromResponse(status, null); expect([status, e.code, e.retryable, e.status]).toEqual([status, code, retryable, status]); expect(e).toBeInstanceOf(ContribError); expect(e).toBeInstanceOf(Error); }
  });
  test("a 403 that says banned is banned; the message and the retry-after travel along", () => {
    expect(errorFromResponse(403, { error: "banned" }).code).toBe("banned"); expect(errorFromResponse(403, { code: "contributor_banned" }).code).toBe("banned"); expect(errorFromResponse(403, { error: "nope" }).code).toBe("auth");
    const e = errorFromResponse(429, { error: "too many reports today" }, "3600"); expect(e.message).toBe("too many reports today"); expect(e.detail.retryAfter).toBe("3600"); expect(e.retryAfterSeconds).toBe(3600);
  });
  test("the real backend's { error: code, message }: the code is kept as `reason`, the sentence is the message, the status picks the code", () => {
    const e = errorFromResponse(400, { error: "invalid_nickname", message: "nickname must not contain a link or an e-mail address" });
    expect([e.code, e.reason, e.message, e.status]).toEqual(["validation", "invalid_nickname", "nickname must not contain a link or an e-mail address", 400]);
    const d = errorFromResponse(429, { error: "daily_limit", message: "daily limit" }, "5400"); expect([d.code, d.reason, d.retryable, d.retryAfterSeconds]).toEqual(["daily", "daily_limit", false, 5400]);
    const r = errorFromResponse(429, { error: "rate_limited", message: "slow down" }, "30"); expect([r.code, r.reason, r.retryable]).toEqual(["rate", "rate_limited", true]);
    expect(errorFromResponse(403, { error: "origin_not_allowed", message: "x" }).code).toBe("origin"); expect(errorFromResponse(403, { error: "banned", message: "x" }).code).toBe("banned");
    expect(errorFromResponse(409, { error: "too_many_devices", message: "x" }).code).toBe("devices"); expect(errorFromResponse(409, { error: "other", message: "x" }).code).toBe("unknown");
    expect(errorFromResponse(404, { error: "code_not_found", message: "x" })).toMatchObject({ code: "not_found", reason: "code_not_found" });
    expect(errorFromResponse(503, { error: "server_busy", message: "x" }, "3")).toMatchObject({ code: "server", reason: "server_busy", retryable: true });
    expect(errorFromResponse(415, { error: "invalid_image", message: "x", field: "photos", index: 0 })).toMatchObject({ code: "type", reason: "invalid_image" });
    expect(errorFromResponse(500, "<html>").reason).toBe(""); expect(errorFromResponse(500, null).reason).toBe("");
  });
  test("retryAfterSeconds: seconds, an HTTP date, or nothing", () => {
    expect(retryAfterSeconds("120")).toBe(120); expect(retryAfterSeconds(30)).toBe(30); expect(retryAfterSeconds("0")).toBe(0); expect(retryAfterSeconds(null)).toBeNull(); expect(retryAfterSeconds("")).toBeNull(); expect(retryAfterSeconds("soon")).toBeNull();
    expect(retryAfterSeconds("Mon, 05 Oct 2026 04:10:00 GMT", Date.parse("2026-10-05T04:08:00Z"))).toBe(120); expect(retryAfterSeconds("Mon, 05 Oct 2026 04:00:00 GMT", Date.parse("2026-10-05T04:08:00Z"))).toBe(0);
  });
  test("every error has plain words in both languages (messageKey); the backend's own codes that have words of their own use them", () => {
    for (const code of ["network", "timeout", "aborted", "rate", "daily", "devices", "origin", "too_large", "type", "validation", "auth", "banned", "server", "bad_response", "not_found", "unknown"]) {
      const k = messageKey(new ContribError(code)); expect([code, k]).toEqual([code, "contrib.err." + code]); expect(STRINGS.ja[k]).toBeTruthy(); expect(STRINGS.en[k]).toBeTruthy();
    }
    for (const reason of ["empty_submission", "invalid_nickname", "invalid_crew_no", "fix_needs_photos", "server_busy"]) {
      const k = messageKey(new ContribError("validation", "", { reason })); expect([reason, k]).toEqual([reason, "contrib.err." + reason]); expect(STRINGS.ja[k]).toBeTruthy(); expect(STRINGS.en[k]).toBeTruthy();
    }
    expect(messageKey(new ContribError("validation", "", { reason: "invalid_pose" }))).toBe("contrib.err.validation");   // no words of its own: the status says enough
    expect(messageKey({ code: "weird" })).toBe("contrib.err.unknown"); expect(messageKey(null)).toBe("contrib.err.unknown");
  });
  test("explainError: a daily limit says when to come back (Retry-After), in the sheet's language", () => {
    const ja = createT(() => "ja"), en = createT(() => "en");
    const e = errorFromResponse(429, { error: "daily_limit", message: "x" }, "5400");
    expect(explainError(e, ja)).toBe("今日はたくさん送ってくれてありがとう！ 約2時間あとに、また送れます。"); expect(explainError(e, en)).toBe("Thanks for sending so many today! You can send again in about 2 h.");
    expect(explainError(errorFromResponse(429, { error: "daily_limit", message: "x" }, null), en)).toContain("about 1 h");   // (no header: an hour)
    expect(explainError(errorFromResponse(429, { error: "daily_limit", message: "x" }, "90"), ja)).toContain("2分");
    expect(explainError(errorFromResponse(500, null), ja)).toBe(STRINGS.ja["contrib.err.server"]); expect(explainError(new ContribError("network"), en)).toBe(STRINGS.en["contrib.err.network"]);
    expect(explainError(errorFromResponse(400, { error: "invalid_nickname", message: "x" }), en)).toBe(STRINGS.en["contrib.err.invalid_nickname"]);
  });
});

describe("the anonymous login: POST /contributors and the transfer code", () => {
  test("createContributor sends the nickname and the クルーNo. as digits, no token, no credentials, and keeps what comes back", async () => {
    const t = api(() => json({ contributorId: "abc", token: "abc.sekret" }, 201), { login: false });
    const r = await t.api.createContributor({ nickname: "  さくら  ", crewNo: "1234-5678-9012-34" });
    expect(r).toEqual({ id: "abc", token: "abc.sekret" });
    const c = t.calls[0];
    expect(c.url).toBe(`${BASE}${PREFIX}/contributors`); expect(c.method).toBe("POST");
    expect(JSON.parse(c.body)).toEqual({ nickname: "さくら", crewNo: "12345678901234" });
    expect(c.headers["content-type"]).toBe("application/json"); expect(c.headers.accept).toBe("application/json"); expect(c.headers.authorization).toBeUndefined();
    expect(c.credentials).toBe("omit"); expect(c.cache).toBe("no-store");
    expect(t.accounts.get()).toMatchObject({ id: "abc", token: "abc.sekret" });
    expect(t.ls.getItem(KEYS.account)).toContain("abc.sekret");
  });
  test("nothing to say is an empty object; a bad クルーNo. is left out (the form checks it first)", async () => {
    const t = api(() => json({ contributorId: "abc", token: "abc.s" }), { login: false });
    await t.api.createContributor(); await t.api.createContributor({ nickname: "", crewNo: "123" });
    expect(JSON.parse(t.calls[0].body)).toEqual({}); expect(JSON.parse(t.calls[1].body)).toEqual({});
  });
  test("an answer without a token is bad_response and nothing is stored; snake_case ids are read", async () => {
    const t = api(() => json({ contributorId: "abc" }), { login: false });
    await expect(t.api.createContributor()).rejects.toMatchObject({ code: "bad_response", retryable: true }); expect(t.accounts.get()).toBeNull();
    const u = api(() => json({ contributor_id: "zz", token: "zz.s" }), { login: false }); expect(await u.api.createContributor()).toEqual({ id: "zz", token: "zz.s" });
  });
  test("ensureAccount reuses the login, or makes one", async () => {
    const a = api(() => json({}), { login: true }); expect(await a.api.ensureAccount()).toMatchObject({ id: "u1", token: "u1.secret" }); expect(a.calls.length).toBe(0);
    const b = api(() => json({ contributorId: "n", token: "n.s" }), { login: false }); expect(await b.api.ensureAccount({ nickname: "x" })).toEqual({ id: "n", token: "n.s" }); expect(b.calls.length).toBe(1);
  });
  test("transferCode: GET with the token, 10-character code and its expiry", async () => {
    const t = api(() => json({ code: "K7M2X-9QP4A", expiresAt: "2026-10-05T03:15:00Z", expiresInSeconds: 900 }));
    expect(await t.api.transferCode()).toEqual({ code: "K7M2X9QP4A", expiresAt: Date.parse("2026-10-05T03:15:00Z") });   // (the dash the backend writes is only for reading)
    expect(t.calls[0].url).toBe(`${BASE}${PREFIX}/me/transfer-code`); expect(t.calls[0].method).toBe("GET"); expect(t.calls[0].headers.authorization).toBe("Bearer u1.secret");
    await expect(api(() => json({ expiresAt: 1 })).api.transferCode()).rejects.toMatchObject({ code: "bad_response" });
    await expect(api(() => json({}), { login: false }).api.transferCode()).rejects.toMatchObject({ code: "auth" });
  });
  test("claim: the code normalised, the new login replaces this device's; a wrong code is not_found and the old login stays", async () => {
    const t = api(() => json({ contributorId: "old-owner", token: "old-owner.tok" }));
    expect(await t.api.claim("k7m2-x9qp4a")).toEqual({ id: "old-owner", token: "old-owner.tok" });
    expect(t.calls[0].url).toBe(`${BASE}${PREFIX}/contributors/claim`); expect(t.calls[0].method).toBe("POST"); expect(JSON.parse(t.calls[0].body)).toEqual({ code: "K7M2X9QP4A" });
    expect(t.calls[0].headers.authorization).toBeUndefined();   // the claim is made by the code alone
    expect(t.accounts.get()).toMatchObject({ id: "old-owner", token: "old-owner.tok" });
    const bad = api(() => json({ error: "no such code" }, 404)); await expect(bad.api.claim("AAAAAAAAAA")).rejects.toMatchObject({ code: "not_found" });
    expect(bad.accounts.get()).toMatchObject({ id: "u1", token: "u1.secret" });
    const none = api(() => json({})); await expect(none.api.claim("short")).rejects.toMatchObject({ code: "validation" }); expect(none.calls.length).toBe(0);
    await expect(none.api.claim("UUUUUUUUUU")).rejects.toMatchObject({ code: "validation", reason: "code_malformed" }); expect(none.calls.length).toBe(0);   // (U is not a code character: no request, no wasted try: the backend lets 5 through an hour)
    const oil = api(() => json({ contributorId: "o", token: "o.t" })); await oil.api.claim("o1l0-o1l0o1"); expect(JSON.parse(oil.calls[0].body)).toEqual({ code: "0110011001" });   // O, I, L are read as 0, 1, 1
  });
  test("the claim's failures keep the backend's reason: wrong, expired and used codes are one code_not_found; too many tries is rate; a full account is devices", async () => {
    const run = (status, error) => api(() => json({ error, message: "x" }, status), { login: false }).api.claim("ABCDEFGHJK");
    await expect(run(404, "code_not_found")).rejects.toMatchObject({ code: "not_found", reason: "code_not_found", status: 404 });
    await expect(run(400, "code_malformed")).rejects.toMatchObject({ code: "validation", reason: "code_malformed" });
    await expect(run(429, "rate_limited")).rejects.toMatchObject({ code: "rate", retryable: true });
    await expect(run(409, "too_many_devices")).rejects.toMatchObject({ code: "devices" });
    await expect(run(403, "banned")).rejects.toMatchObject({ code: "banned" });
  });
  test("forget clears the login", () => { const t = api(() => json({})); t.api.forget(); expect(t.accounts.get()).toBeNull(); });
});

describe("my reports and the profile", () => {
  test("me(): GET /me with the Bearer token, normalised", async () => {
    const t = api(() => json({ contributorId: "u1", nickname: "さくら", crewNo: null, points: 5, accepted: 1, rank: 4, submissions: [{ id: "s1", created_at: "2026-10-05T00:00:00Z", status: "accepted", kind: "issue", category: "sign", points: 5 }] }));
    const me = await t.api.me();
    expect(me).toMatchObject({ id: "u1", nickname: "さくら", crewNo: "", points: 5, accepted: 1, rank: 4 }); expect(me.submissions).toHaveLength(1);
    expect(t.calls[0].url).toBe(`${BASE}${PREFIX}/me`); expect(t.calls[0].method).toBe("GET"); expect(t.calls[0].headers.authorization).toBe("Bearer u1.secret");
  });
  test("no login on this device is an auth error without touching the network", async () => {
    const t = api(() => json({}), { login: false }); await expect(t.api.me()).rejects.toMatchObject({ code: "auth" }); expect(t.calls.length).toBe(0);
  });
  test("a 401 means the token is gone: it is forgotten here too, whichever call found out (a 403 is not a 401: the login stays)", async () => {
    for (const call of [(a) => a.me(), (a) => a.updateProfile({ nickname: "x" }), (a) => a.transferCode(), (a) => a.submit({ pose, kind: "issue", category: "sign", note: "", consent: true })]) {
      const t = api(() => json({ error: "unknown token" }, 401)); await expect(call(t.api)).rejects.toMatchObject({ code: "auth", status: 401 }); expect(t.accounts.get()).toBeNull();
    }
    const banned = api(() => json({ error: "banned" }, 403)); await expect(banned.api.me()).rejects.toMatchObject({ code: "banned" }); expect(banned.accounts.get()).not.toBeNull();
  });
  test("updateProfile: PATCH with only the keys given; '' removes the クルーNo. (null); a bad one never leaves the device", async () => {
    const t = api(() => json({ contributorId: "u1", nickname: "新", crewNo: "12345678901234", points: 0 }));
    await t.api.updateProfile({ nickname: "  新  " }); await t.api.updateProfile({ crewNo: "1234-5678-9012-34" }); await t.api.updateProfile({ crewNo: "" }); await t.api.updateProfile({ nickname: "a", crewNo: undefined });
    expect(t.calls.map((c) => c.method)).toEqual(["PATCH", "PATCH", "PATCH", "PATCH"]); expect(t.calls[0].url).toBe(`${BASE}${PREFIX}/me`);
    expect(JSON.parse(t.calls[0].body)).toEqual({ nickname: "新" }); expect(JSON.parse(t.calls[1].body)).toEqual({ crewNo: "12345678901234" });
    expect(JSON.parse(t.calls[2].body)).toEqual({ crewNo: null }); expect(JSON.parse(t.calls[3].body)).toEqual({ nickname: "a" });
    expect(t.calls[0].headers.authorization).toBe("Bearer u1.secret");
    await expect(t.api.updateProfile({ crewNo: "123" })).rejects.toMatchObject({ code: "validation" }); expect(t.calls.length).toBe(4);
  });
  test("leaderboard: GET with a clamped limit; no login needed; with one the token goes along so the server can mark my row", async () => {
    const t = api(() => json([{ nickname: "さくら", accepted: 3, points: 35 }]), { login: false });
    expect(await t.api.leaderboard()).toEqual([{ nickname: "さくら", accepted: 3, points: 35, me: false }]);
    await t.api.leaderboard(5); await t.api.leaderboard(0); await t.api.leaderboard(999);
    expect(t.calls.map((c) => c.url.split("?")[1])).toEqual(["limit=20", "limit=5", "limit=20", "limit=100"]);
    expect(t.calls.every((c) => c.headers.authorization === undefined && c.method === "GET")).toBe(true);
    const u = api(() => json([{ nickname: "さくら", accepted: 3, points: 35, me: true }]));
    expect((await u.api.leaderboard())[0].me).toBe(true); expect(u.calls[0].headers.authorization).toBe("Bearer u1.secret");
  });
  test("a leaderboard call whose token the server refuses is repeated without it, and the login is NOT forgotten (only a call that needs the login forgets it)", async () => {
    const t = api((url, init) => (init.headers.authorization ? json({ error: "unauthorized", message: "x" }, 401) : json([{ nickname: "a", accepted: 1, points: 5 }])));
    expect(await t.api.leaderboard()).toEqual([{ nickname: "a", accepted: 1, points: 5, me: false }]);
    expect(t.calls.map((c) => !!c.headers.authorization)).toEqual([true, false]); expect(t.accounts.get()).not.toBeNull();
  });
  test("deleteMe: DELETE /me?confirm=1 with the token, then this device forgets the login; a login the server no longer knows is already deleted", async () => {
    const t = api(() => json({ ok: true, deletedFiles: 6 }));
    expect(await t.api.deleteMe()).toEqual({ deletedFiles: 6 });
    expect(t.calls[0].url).toBe(`${BASE}${PREFIX}/me?confirm=1`); expect(t.calls[0].method).toBe("DELETE"); expect(t.calls[0].headers.authorization).toBe("Bearer u1.secret"); expect(t.accounts.get()).toBeNull();
    const gone = api(() => json({ error: "unauthorized", message: "x" }, 401)); expect(await gone.api.deleteMe()).toEqual({ deletedFiles: 0 }); expect(gone.accounts.get()).toBeNull();
    const down = api(() => json({ error: "internal", message: "x" }, 500)); await expect(down.api.deleteMe()).rejects.toMatchObject({ code: "server" }); expect(down.accounts.get()).not.toBeNull();   // a failure keeps the login: nothing was erased
    const none = api(() => json({}), { login: false }); expect(await none.api.deleteMe()).toEqual({ deletedFiles: 0 }); expect(none.calls.length).toBe(0);
  });
  test("health: true on 200, false on anything else", async () => {
    expect(await api(() => json({ ok: true })).api.health()).toBe(true); expect(await api(() => json({}, 503)).api.health()).toBe(false);
    expect(await api(() => { throw new TypeError("offline"); }).api.health()).toBe(false);
  });
});

describe("the report: a multipart POST /submissions", () => {
  const shot = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: "image/jpeg" });
  const photos = [new File([new Uint8Array([0xff, 0xd8, 0xff, 1])], "IMG_0001.JPG", { type: "image/jpeg" }), new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "street.png", { type: "image/png" })];
  const fields = { pose, kind: "fix", category: "sign", note: "看板が1m右です", lang: "ja", consent: true, screenshot: shot, photos };

  test("the form has the spec's fields: pose (JSON), kind, category, note, lang, consent=1, screenshot, photos", () => {
    const fd = buildSubmissionForm(fields);
    expect([...fd.keys()]).toEqual(["pose", "kind", "category", "note", "lang", "consent", "screenshot", "photos", "photos"]);
    expect(fd.get("pose")).toBe(poseToJson(pose)); expect(JSON.parse(fd.get("pose"))).toEqual(pose);
    expect(fd.get("kind")).toBe("fix"); expect(fd.get("category")).toBe("sign"); expect(fd.get("note")).toBe("看板が1m右です"); expect(fd.get("lang")).toBe("ja"); expect(fd.get("consent")).toBe("1");
    const s = fd.get("screenshot"); expect(s.name).toBe("screenshot.jpg"); expect(s.type).toBe("image/jpeg"); expect(s.size).toBe(7);
    const p = fd.getAll("photos"); expect(p.map((f) => [f.name, f.type])).toEqual([["IMG_0001.JPG", "image/jpeg"], ["street.png", "image/png"]]);
  });
  test("the limits in force shape the form: at most that many photos, the note clamped to that length", () => {
    const lim = { photos: 1, note: 10 }, nine = Array.from({ length: 9 }, (_, i) => new File(["x"], `${i}.jpg`, { type: "image/jpeg" }));
    const fd = buildSubmissionForm({ ...fields, note: "x".repeat(40), photos: nine }, undefined, lim); expect(fd.getAll("photos")).toHaveLength(1); expect(fd.get("note")).toHaveLength(10);
    const def = buildSubmissionForm({ ...fields, photos: nine }); expect(def.getAll("photos")).toHaveLength(6);
  });
  test("submit({ limits }) passes them to the form", async () => {
    const t = api(() => json({ id: "s", status: "new" }, 201)); const many = Array.from({ length: 4 }, (_, i) => new File(["x"], `${i}.jpg`, { type: "image/jpeg" }));
    await t.api.submit({ ...fields, photos: many }, { limits: { photos: 2, note: 2000 } }); expect(t.calls[0].body.getAll("photos")).toHaveLength(2);
  });
  test("the originals go up untouched (EXIF stays: nothing re-encodes a photo)", async () => {
    const p = buildSubmissionForm(fields).getAll("photos");
    expect([...new Uint8Array(await p[0].arrayBuffer())]).toEqual([0xff, 0xd8, 0xff, 1]);
  });
  test("consent is required; a missing screenshot and no photos are fine; lang is ja or en; the note is clamped; at most 6 photos", () => {
    expect(() => buildSubmissionForm({ ...fields, consent: false })).toThrow(ContribError);
    const bare = buildSubmissionForm({ pose, kind: "issue", category: "road", note: "", lang: "fr", consent: true });
    expect([...bare.keys()]).toEqual(["pose", "kind", "category", "note", "lang", "consent"]); expect(bare.get("lang")).toBe("ja");
    expect(buildSubmissionForm({ ...fields, lang: "en" }).get("lang")).toBe("en");
    expect(buildSubmissionForm({ ...fields, note: "x".repeat(3000) }).get("note").length).toBe(2000);
    expect(buildSubmissionForm({ ...fields, photos: Array.from({ length: 9 }, (_, i) => new File(["x"], `${i}.jpg`, { type: "image/jpeg" })) }).getAll("photos")).toHaveLength(6);
    expect(buildSubmissionForm({ ...fields, pose: poseToJson(pose) }).get("pose")).toBe(poseToJson(pose));   // (a JSON string is passed through)
    expect(/^[\x20-\x7e]*$/.test(buildSubmissionForm({ ...fields, pose: { ...pose, note: "気仙沼" } }).get("pose"))).toBe(true);
  });
  test("submit() through fetch: Bearer token, FormData body, no hand-written content-type (the runtime sets the boundary), { id, status }", async () => {
    const t = api(() => json({ id: "sub_1", status: "new", kind: "fix", photos: 2, createdAt: "2026-10-05T04:08:21.905Z" }, 201));
    expect(await t.api.submit(fields)).toEqual({ id: "sub_1", status: "new", replayed: false });
    const c = t.calls[0];
    expect(c.url).toBe(`${BASE}${PREFIX}/submissions`); expect(c.method).toBe("POST"); expect(c.headers.authorization).toBe("Bearer u1.secret");
    expect(c.headers["content-type"]).toBeUndefined(); expect(c.body).toBeInstanceOf(FormData); expect(c.credentials).toBe("omit");
    expect(c.headers["idempotency-key"]).toBeUndefined();   // (only when asked for)
  });
  test("an Idempotency-Key goes along as a header, on fetch and on XMLHttpRequest; a replayed answer says so", async () => {
    const t = api((url, init) => json({ id: "sub_1", status: "new", replayed: init.headers["idempotency-key"] === "again-0001" || undefined }, init.headers["idempotency-key"] === "again-0001" ? 200 : 201));
    expect(await t.api.submit(fields, { idempotencyKey: "first-0001" })).toEqual({ id: "sub_1", status: "new", replayed: false });
    expect(await t.api.submit(fields, { idempotencyKey: "again-0001" })).toEqual({ id: "sub_1", status: "new", replayed: true });
    expect(t.calls.map((c) => c.headers["idempotency-key"])).toEqual(["first-0001", "again-0001"]);
    const X = fakeXhr((x) => setTimeout(() => { x.status = 201; x.responseText = JSON.stringify({ id: "s", status: "new" }); x.onload(); }, 0));
    await api(() => json({}), { XMLHttpRequest: X }).api.submit(fields, { onProgress() {}, idempotencyKey: "xhr-key-01" }); expect(X.made[0].headers["idempotency-key"]).toBe("xhr-key-01");
  });
  test("submit() without a login is an auth error and sends nothing; an answer without an id is bad_response", async () => {
    const a = api(() => json({}), { login: false }); await expect(a.api.submit(fields)).rejects.toMatchObject({ code: "auth" }); expect(a.calls.length).toBe(0);
    await expect(api(() => json({ status: "new" })).api.submit(fields)).rejects.toMatchObject({ code: "bad_response" });
  });
  test("the failures of a submit: 413 too_large, 415 type, 429 rate (retryable), 400 validation, 5xx server, 403 banned", async () => {
    for (const [status, code, retry] of [[413, "too_large", false], [415, "type", false], [429, "rate", true], [400, "validation", false], [503, "server", true], [403, "banned", false]]) {
      const t = api(() => json(status === 403 ? { error: "banned" } : { error: "x" }, status));
      await expect(t.api.submit(fields)).rejects.toMatchObject({ code, status, retryable: retry });
    }
  });
  test("the real backend's refusals of a submit keep their reason (what the sheet explains): daily_limit, fix_needs_photos, empty_submission, invalid_image, photo_too_large", async () => {
    const run = (status, error, h = {}) => api(() => json({ error, message: "x" }, status, h)).api.submit(fields);
    await expect(run(429, "daily_limit", { "retry-after": "7200" })).rejects.toMatchObject({ code: "daily", reason: "daily_limit", retryable: false, retryAfterSeconds: 7200 });
    await expect(run(400, "fix_needs_photos")).rejects.toMatchObject({ code: "validation", reason: "fix_needs_photos" });
    await expect(run(400, "empty_submission")).rejects.toMatchObject({ code: "validation", reason: "empty_submission" });
    await expect(run(415, "invalid_image")).rejects.toMatchObject({ code: "type", reason: "invalid_image" });
    await expect(run(413, "photo_too_large")).rejects.toMatchObject({ code: "too_large", reason: "photo_too_large" });
    await expect(run(503, "server_busy", { "retry-after": "5" })).rejects.toMatchObject({ code: "server", reason: "server_busy", retryable: true });
  });
});

describe("the transport: network failures, timeouts, cancelling, odd answers", () => {
  test("a fetch that throws is a retryable network error", async () => {
    const t = api(() => { throw new TypeError("Failed to fetch"); });
    await expect(t.api.me()).rejects.toMatchObject({ code: "network", retryable: true, message: "Failed to fetch" });
  });
  test("a call that hangs times out (and its timer is cleared)", async () => {
    const t = api((url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))));
    await expect(t.api.request("GET", "/health", { timeoutMs: 30 })).rejects.toMatchObject({ code: "timeout", retryable: true });
  });
  test("cancelling stops the call: aborted, not retryable (and an already-aborted signal never calls fetch)", async () => {
    const t = api((url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))));
    const ctl = new AbortController(); const p = t.api.request("GET", "/health", { signal: ctl.signal }); setTimeout(() => ctl.abort(), 10);
    await expect(p).rejects.toMatchObject({ code: "aborted", retryable: false });
    const gone = new AbortController(); gone.abort(); const n = t.calls.length;
    await expect(t.api.request("GET", "/health", { signal: gone.signal })).rejects.toMatchObject({ code: "aborted" }); expect(t.calls.length).toBe(n);
  });
  test("a 2xx that is not JSON is bad_response; an empty 204 is fine; an error page with HTML is still the right status error", async () => {
    await expect(api(() => new Response("<html>oops</html>", { status: 200 })).api.me()).rejects.toMatchObject({ code: "bad_response" });
    expect((await api(() => new Response(null, { status: 204 })).api.request("GET", "/health")).body).toBeNull();
    await expect(api(() => new Response("<html>Bad gateway</html>", { status: 502 })).api.leaderboard()).rejects.toMatchObject({ code: "server", status: 502 });
  });
  test("the base may carry a path prefix; requests always go under /api/contrib/v1", async () => {
    const ls = mem(), accounts = createAccounts(safeStorage({ localStorage: ls }), "https://x.example/contrib"), m = mock(() => json([]));
    await createApi({ base: "https://x.example/contrib", accounts, fetch: m.fetch }).leaderboard();
    expect(m.calls[0].url).toBe("https://x.example/contrib/api/contrib/v1/leaderboard?limit=20");
  });
});

/** A fake XMLHttpRequest: records the call, then fires what the test scripts. */
function fakeXhr(script) {
  const made = [];
  class X {
    constructor() { this.headers = {}; this.upload = {}; this.status = 0; this.responseText = ""; made.push(this); }
    open(method, url, async) { this.method = method; this.url = url; this.async = async; }
    setRequestHeader(k, v) { this.headers[k.toLowerCase()] = v; }
    getResponseHeader(k) { return this.resHeaders?.[k.toLowerCase()] ?? null; }
    abort() { this.aborted = true; queueMicrotask(() => this.onabort?.()); }
    send(body) { this.body = body; script(this); }
  }
  X.made = made;
  return X;
}

describe("the upload with progress (XMLHttpRequest)", () => {
  const fields = { pose, kind: "issue", category: "sign", note: "x", lang: "ja", consent: true, photos: [] };
  test("progress events reach onProgress and the answer is parsed like any other", async () => {
    const X = fakeXhr((x) => { setTimeout(() => { x.upload.onprogress({ lengthComputable: true, loaded: 100, total: 400 }); x.upload.onprogress({ lengthComputable: false, loaded: 1, total: 0 }); x.upload.onprogress({ lengthComputable: true, loaded: 400, total: 400 }); x.status = 201; x.responseText = JSON.stringify({ id: "s9", status: "new" }); x.onload(); }, 0); });
    const t = api(() => json({}), { XMLHttpRequest: X }), seen = [];
    expect(await t.api.submit(fields, { onProgress: (l, n) => seen.push([l, n]) })).toEqual({ id: "s9", status: "new", replayed: false });
    expect(seen).toEqual([[100, 400], [400, 400]]); expect(t.calls.length).toBe(0);   // fetch was not used
    const x = X.made[0];
    expect(x.method).toBe("POST"); expect(x.url).toBe(`${BASE}${PREFIX}/submissions`); expect(x.async).toBe(true);
    expect(x.headers.authorization).toBe("Bearer u1.secret"); expect(x.headers["content-type"]).toBeUndefined(); expect(x.body).toBeInstanceOf(FormData);
    expect(x.withCredentials).toBe(false); expect(x.timeout).toBeGreaterThanOrEqual(120000);
  });
  test("without onProgress, fetch is used even when XMLHttpRequest exists", async () => {
    const X = fakeXhr(() => {}), t = api(() => json({ id: "s1" }), { XMLHttpRequest: X });
    await t.api.submit(fields); expect(t.calls.length).toBe(1); expect(X.made.length).toBe(0);
  });
  test("the failures: HTTP errors map like fetch's; network, timeout and cancel are their own codes", async () => {
    const mk = (fn) => fakeXhr((x) => setTimeout(() => fn(x), 0));
    const run = (X, opts = {}) => api(() => json({}), { XMLHttpRequest: X }).api.submit(fields, { onProgress() {}, ...opts });
    await expect(run(mk((x) => { x.status = 413; x.responseText = "{}"; x.onload(); }))).rejects.toMatchObject({ code: "too_large", status: 413 });
    await expect(run(mk((x) => { x.status = 429; x.resHeaders = { "retry-after": "60" }; x.responseText = "{}"; x.onload(); }))).rejects.toMatchObject({ code: "rate", retryable: true });
    await expect(run(mk((x) => { x.status = 200; x.responseText = "<html>"; x.onload(); }))).rejects.toMatchObject({ code: "bad_response" });
    await expect(run(mk((x) => x.onerror()))).rejects.toMatchObject({ code: "network", retryable: true });
    await expect(run(mk((x) => x.ontimeout()))).rejects.toMatchObject({ code: "timeout", retryable: true });
    const ctl = new AbortController();
    await expect(run(fakeXhr((x) => setTimeout(() => ctl.abort(), 5)), { signal: ctl.signal })).rejects.toMatchObject({ code: "aborted", retryable: false });
    const before = new AbortController(); before.abort(); const X2 = fakeXhr(() => {});
    await expect(run(X2, { signal: before.signal })).rejects.toMatchObject({ code: "aborted" }); expect(X2.made.length).toBe(0);
  });
  test("xhrRequest settles once even when events pile up", async () => {
    const X = fakeXhr((x) => setTimeout(() => { x.status = 200; x.responseText = "{}"; x.onload(); x.onerror(); x.ontimeout(); }, 0));
    const r = await xhrRequest(X, { method: "GET", url: "http://x", headers: {}, timeoutMs: 1000 }); expect(r.status).toBe(200);
  });
});
