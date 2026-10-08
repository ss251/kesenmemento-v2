// Contributor backend: the admin API and the admin page's static serving, in-process.
import { describe, test as bunTest, expect } from "bun:test";
// a loaded machine (the gate runs tests at background priority) is many times slower than an idle one: generous per-test timeout
const test = (name, fn) => bunTest(name, fn, 60_000);
import { makeApp, ADMIN_TOKEN, API } from "../tools/contrib/testkit.mjs";
import { synthJpeg, synthHeic, synthScreenshot } from "../tools/contrib/synth.mjs";
import { ADMIN_CSP } from "../server/contrib/ui.js";

const A = "/admin";
const get = (k, path, o = {}) => k.call("GET", `${A}${path}`, { admin: true, ...o });

/** A small world: three contributors, six submissions in different states. */
async function world(start) {
  const k = makeApp({ start });
  const sakura = await k.newContributor({ nickname: "Sakura", crewNo: "1234-5678-9012-34" });
  const taro = await k.newContributor({ nickname: "Taro" });
  const mei = await k.newContributor({ nickname: "=cmd|' /C calc'!A0", crewNo: "0000-1111-2222-33" });
  const mk = async (who, f) => { k.clock.advance(60_000); return (await k.submit(who, f)).body.id; };
  const s1 = await mk(sakura, { kind: "issue", category: "sign", note: "sign is wrong" });
  const s2 = await mk(sakura, { category: "building", note: "roof color", photos: [await synthJpeg({ lat: 38.9065, lon: 141.5752, heading: 90, takenAt: "2026:10:04 14:23:05", offset: "+09:00", make: "Acme", model: "Cam" }), await synthJpeg({ seed: 3 })] });
  const s3 = await mk(taro, { kind: "issue", category: "road", note: "paint missing" });
  const s4 = await mk(taro, { category: "shop", note: "shop front", photos: [await synthHeic({ lat: 38.9, lon: 141.575 })] });
  const s5 = await mk(mei, { kind: "issue", category: "other", note: "100%_done" });
  const s6 = await mk(mei, { kind: "issue", category: "landmark", note: "lighthouse" });
  return { k, sakura, taro, mei, ids: { s1, s2, s3, s4, s5, s6 } };
}

describe("admin authentication", () => {
  const routes = [
    ["GET", "/submissions"], ["GET", "/submissions/aaaaaaaaaaaaaaaa"], ["POST", "/submissions/aaaaaaaaaaaaaaaa"], ["DELETE", "/submissions/aaaaaaaaaaaaaaaa"],
    ["POST", "/submissions/mark-used"], ["POST", "/contributors/abcdefgh12345678"], ["DELETE", "/contributors/abcdefgh12345678"], ["GET", "/files/submissions/2026/10/aaaaaaaa/photo-1.jpg"],
    ["GET", "/export/crew.csv"], ["GET", "/export/submissions.json"], ["GET", "/stats"], ["GET", "/audit"],
  ];
  test("every admin route refuses a missing, wrong or contributor token with the same 401", async () => {
    const { k, sakura } = await world();
    for (const [method, path] of routes) {
      for (const o of [{}, { admin: "wrong-token-wrong-token-wrong-token" }, { token: sakura.token }, { admin: ADMIN_TOKEN.slice(0, -1) }, { admin: ADMIN_TOKEN + "x" }]) {
        const r = await k.call(method, `${A}${path}`, { ...o, json: method === "POST" ? {} : undefined, ip: `198.51.100.${Math.floor(Math.random() * 200) + 1}` });
        expect([method, path, r.status]).toEqual([method, path, 401]);
        expect(r.headers.get("www-authenticate")).toContain("Bearer");
        expect(r.body.error).toBe("unauthorized");
      }
    }
  });
  test("the admin token opens them; it is not a contributor token", async () => {
    const { k } = await world();
    for (const path of ["/submissions", "/stats", "/audit", "/export/crew.csv", "/export/submissions.json"]) expect((await get(k, path)).status).toBe(200);
    expect((await k.call("GET", "/me", { admin: true })).status).toBe(401);
    expect((await k.call("POST", "/submissions", { admin: true, form: await k.form({}) })).status).toBe(401);
  });
  test("ten wrong tokens from one network lock guessing out for 15 minutes, but the correct token still passes (nobody can lock the real admin out); other networks are unaffected", async () => {
    const { k } = await world();
    const bad = (ip) => k.call("GET", `${A}/stats`, { admin: "wrong-token-wrong-token-wrong-token", ip });
    for (let i = 0; i < 10; i++) expect((await bad("203.0.113.7")).status).toBe(401);
    const locked = await bad("203.0.113.7");
    expect([locked.status, locked.body.error]).toEqual([429, "admin_locked"]);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(800);
    expect((await get(k, "/stats", { ip: "203.0.113.7" })).status).toBe(200); // the right token from the locked network works: a stranger sharing the address cannot lock the admin out
    expect((await bad("203.0.113.7")).status).toBe(429); // while guessing stays blocked
    expect((await get(k, "/stats", { ip: "203.0.113.8" })).status).toBe(200);
    k.clock.advance(15 * 60_000 + 1);
    expect((await bad("203.0.113.7")).status).toBe(401); // the window passed: counted again from zero
  });
  test("failed attempts leave no trace of what was tried in the audit table or the logs", async () => {
    const { k } = await world();
    const guess = "my-secret-guess-" + "z".repeat(20);
    await k.call("GET", `${A}/stats`, { admin: guess });
    expect(JSON.stringify(k.app.db.query("SELECT * FROM audit").all())).not.toContain(guess);
    expect(k.lines.join("\n")).not.toContain(guess);
  });
});

describe("listing", () => {
  test("a page of submissions with totals, newest first", async () => {
    const { k, ids } = await world();
    const r = await get(k, "/submissions");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 6, limit: 25, offset: 0 });
    expect(r.headers.get("x-total-count")).toBe("6");
    expect(r.body.items.map((i) => i.id)).toEqual([ids.s6, ids.s5, ids.s4, ids.s3, ids.s2, ids.s1]);
    expect(r.body.items[0]).toMatchObject({ status: "new", kind: "issue", category: "landmark", note: "lighthouse", photoCount: 0, hasScreenshot: true, location: { source: "pose" }, contributor: { nickname: "=cmd|' /C calc'!A0", banned: false } });
    expect(r.body.items[4]).toMatchObject({ photoCount: 2, kind: "fix", location: { source: "photo" } });
    expect(r.body.items[4].thumbUrl).toMatch(/^\/api\/contrib\/v1\/admin\/files\/submissions\/2026\/10\/[a-z0-9]{16}\/screenshot\.thumb\.jpg$/);
  });
  test("it never exposes a crew number", async () => {
    const { k } = await world();
    const dump = JSON.stringify((await get(k, "/submissions")).body);
    expect(dump).not.toMatch(/1234-?5678|12345678901234|00001111222233/);
  });
  test("filters: status, kind, category, contributor and a search over id, nickname and note", async () => {
    const { k, ids, taro } = await world();
    await k.review(ids.s1, { status: "accepted" });
    await k.review(ids.s3, { status: "rejected" });
    const q = async (query) => (await get(k, `/submissions${query}`)).body;
    expect((await q("?status=new")).total).toBe(4);
    expect((await q("?status=accepted")).items.map((i) => i.id)).toEqual([ids.s1]);
    expect((await q("?status=rejected")).items.map((i) => i.id)).toEqual([ids.s3]);
    expect((await q("?status=all")).total).toBe(6);
    expect((await q("?status=")).total).toBe(6);
    expect((await q("?kind=fix")).items.map((i) => i.id)).toEqual([ids.s4, ids.s2]);
    expect((await q("?category=road")).items.map((i) => i.id)).toEqual([ids.s3]);
    expect((await q(`?contributor=${taro.id}`)).total).toBe(2);
    expect((await q("?q=roof")).items.map((i) => i.id)).toEqual([ids.s2]);
    expect((await q("?q=taro")).total).toBe(2);
    expect((await q(`?q=${ids.s5.slice(0, 10)}`)).items.map((i) => i.id)).toEqual([ids.s5]);
    expect((await q("?q=" + encodeURIComponent("100%_"))).items.map((i) => i.id)).toEqual([ids.s5]); // % and _ are literal
    expect((await q("?q=" + encodeURIComponent("%"))).total).toBe(1);
    expect((await q("?status=new&kind=issue&category=other")).items.map((i) => i.id)).toEqual([ids.s5]);
  });
  test("paging and sorting: limit 1..100, offset, oldest first", async () => {
    const { k, ids } = await world();
    const page = await get(k, "/submissions?limit=2&offset=2");
    expect(page.body).toMatchObject({ total: 6, limit: 2, offset: 2 });
    expect(page.body.items.map((i) => i.id)).toEqual([ids.s4, ids.s3]);
    expect((await get(k, "/submissions?limit=2&sort=oldest")).body.items.map((i) => i.id)).toEqual([ids.s1, ids.s2]);
    expect((await get(k, "/submissions?limit=0")).body.limit).toBe(1);
    expect((await get(k, "/submissions?limit=1000")).body.limit).toBe(100);
    expect((await get(k, "/submissions?limit=x&offset=y")).body).toMatchObject({ limit: 25, offset: 0 });
    expect((await get(k, "/submissions?offset=99")).body.items).toEqual([]);
  });
  test("bad filter values are a 400", async () => {
    const { k } = await world();
    for (const [query, error] of [["?status=pending", "invalid_status"], ["?kind=bug", "invalid_kind"], ["?category=bridge", "invalid_category"], ["?contributor=a/b", "invalid_contributor"]]) {
      const r = await get(k, `/submissions${query}`);
      expect([query, r.status, r.body.error]).toEqual([query, 400, error]);
    }
  });
});

describe("detail", () => {
  test("the full record: pose, client info, screenshot, photos with EXIF and ENU and URLs, and the contributor with a masked crew number", async () => {
    const { k, ids, sakura } = await world();
    const r = await get(k, `/submissions/${ids.s2}`);
    expect(r.status).toBe(200);
    const d = r.body;
    expect(d).toMatchObject({ id: ids.s2, status: "new", kind: "fix", category: "building", note: "roof color", points: 0, reviewerNote: null, reviewedAt: null, usedVersion: null });
    expect(d.pose).toMatchObject({ enu: [12, 1.6, -34], latlon: [38.9063, 141.5751], heading: 120, mode: "walk" });
    expect(d.client).toMatchObject({ consent: { given: true }, screenshot: { mime: "image/jpeg", width: 800, height: 450 } });
    expect(d.screenshot).toMatchObject({ mime: "image/jpeg", url: `${API}/admin/files/submissions/2026/10/${ids.s2}/screenshot.jpg` });
    expect(d.photos).toHaveLength(2);
    expect(d.photos[0]).toMatchObject({ n: 1, mime: "image/jpeg", width: 640, height: 480, takenAt: "2026-10-04T14:23:05+09:00", url: `${API}/admin/files/submissions/2026/10/${ids.s2}/photo-1.jpg`, previewUrl: `${API}/admin/files/submissions/2026/10/${ids.s2}/photo-1.preview.jpg` });
    expect(d.photos[0].lat).toBeCloseTo(38.9065, 6);
    expect(d.photos[0].enu.x).toBeCloseTo((d.photos[0].lon - 141.575) * 86744, 9);
    expect(d.photos[0].exif).toMatchObject({ make: "Acme", model: "Cam" });
    expect(d.photos[1].enu).toBeNull();
    expect(d.contributor).toMatchObject({ id: sakura.id, nickname: "Sakura", banned: false, hasCrewNo: true, crewNoMasked: "••••••••••1234", submissions: 2, accepted: 0, points: 0 });
    expect(JSON.stringify(d)).not.toContain("12345678901234");
  });
  test("a HEIC without a preview has previewUrl null; unknown or malformed ids are 404", async () => {
    const { k, ids } = await world();
    const d = (await get(k, `/submissions/${ids.s4}`)).body;
    expect(d.photos[0]).toMatchObject({ mime: "image/heic", previewKey: null, previewUrl: null, width: null });
    for (const id of ["nosuchid12345678", "short", "UPPERCASE1234567", "a/b", "..", "a".repeat(41)]) expect([id, (await get(k, `/submissions/${encodeURIComponent(id)}`)).status]).toEqual([id, 404]);
  });
});

describe("reviewing", () => {
  test("accept, reject, used and back to new; the response is the updated record", async () => {
    const { k, ids } = await world();
    const accepted = await k.review(ids.s1, { status: "accepted", points: 12, reviewerNote: "Verified." });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ id: ids.s1, status: "accepted", points: 12, reviewerNote: "Verified.", reviewedAt: new Date(k.clock.now()).toISOString() });
    const rejected = await k.review(ids.s1, { status: "rejected" });
    expect(rejected.body).toMatchObject({ status: "rejected", points: 0, reviewerNote: "Verified." }); // the note is kept unless replaced
    const again = await k.review(ids.s1, { status: "new", reviewerNote: "" });
    expect(again.body).toMatchObject({ status: "new", points: 0, reviewerNote: null, reviewedAt: null });
  });
  test("default points: 5 for an issue, 20 for a fix; explicit points (even 0) win", async () => {
    const { k, ids } = await world();
    expect((await k.review(ids.s1, { status: "accepted" })).body.points).toBe(5);
    expect((await k.review(ids.s2, { status: "accepted" })).body.points).toBe(20);
    expect((await k.review(ids.s3, { status: "accepted", points: 0 })).body.points).toBe(0);
    expect((await k.review(ids.s4, { status: "accepted", points: "35" })).body.points).toBe(35);
  });
  test("used stores the release and the time; the version is optional on this call for compatibility", async () => {
    const { k, ids } = await world();
    await k.review(ids.s2, { status: "accepted" });
    k.clock.advance(3600_000);
    const used = await k.review(ids.s2, { status: "used", version: "v0.5.0" });
    expect(used.body).toMatchObject({ status: "used", usedVersion: "v0.5.0", usedAt: new Date(k.clock.now()).toISOString(), points: 20 });
    const noVersion = await k.review(ids.s1, { status: "used" });
    expect(noVersion.status).toBe(200);
    expect(noVersion.body).toMatchObject({ status: "used", usedVersion: null });
    const back = await k.review(ids.s2, { status: "accepted" });
    expect(back.body).toMatchObject({ usedVersion: null, usedAt: null });
    expect((await k.review(ids.s2, { status: "accepted", version: "v9" })).body.usedVersion).toBeNull(); // a version only means something with used
  });
  test("reviewed_at is when the decision was first made: it does not move when points change or the item is marked used", async () => {
    const { k, ids } = await world();
    const first = (await k.review(ids.s1, { status: "accepted", points: 5 })).body.reviewedAt;
    k.clock.advance(86400_000);
    expect((await k.review(ids.s1, { status: "accepted", points: 9 })).body.reviewedAt).toBe(first);
    expect((await k.review(ids.s1, { status: "used", version: "v1" })).body.reviewedAt).toBe(first);
    expect((await k.review(ids.s1, { status: "rejected" })).body.reviewedAt).not.toBe(first);
  });
  test("invalid input is a 400 with a code and changes nothing; unknown submissions are 404", async () => {
    const { k, ids } = await world();
    const bad = async (json) => { const r = await k.review(ids.s1, json); return [r.status, r.body.error]; };
    expect(await bad({})).toEqual([400, "invalid_status"]);
    expect(await bad({ status: "pending" })).toEqual([400, "invalid_status"]);
    expect(await bad({ status: "accepted", points: -1 })).toEqual([400, "invalid_points"]);
    expect(await bad({ status: "accepted", points: 10001 })).toEqual([400, "invalid_points"]);
    expect(await bad({ status: "accepted", points: 1.5 })).toEqual([400, "invalid_points"]);
    expect(await bad({ status: "used", version: "v 1" })).toEqual([400, "invalid_version"]);
    expect(await bad({ status: "accepted", reviewerNote: "x".repeat(1001) })).toEqual([400, "note_too_long"]);
    expect((await k.review("nosuchsub1234567", { status: "accepted" })).status).toBe(404);
    expect((await get(k, `/submissions/${ids.s1}`)).body.status).toBe("new");
    expect((await k.call("POST", `${A}/submissions/${ids.s1}`, { admin: true, raw: "x", headers: { "content-type": "text/plain" } })).status).toBe(415);
  });
  test("accepted and used points feed the leaderboard and /me; rejected and new work earns nothing", async () => {
    const { k, ids, sakura } = await world();
    await k.review(ids.s1, { status: "accepted", points: 10 });
    await k.review(ids.s2, { status: "used", points: 30, version: "v1" });
    await k.review(ids.s3, { status: "rejected", points: 99 });
    expect((await k.call("GET", "/leaderboard")).body).toEqual([{ nickname: "Sakura", accepted: 2, points: 40 }]);
    expect((await k.call("GET", "/me", { token: sakura.token })).body).toMatchObject({ points: 40, accepted: 2, rank: 1 });
  });
  test("every review is audited with who did it (the page URI-encodes the reviewer's name), what changed, and no personal data", async () => {
    const { k, ids } = await world();
    await k.call("POST", `${A}/submissions/${ids.s1}`, { admin: true, headers: { "x-admin-name": encodeURIComponent("テスト管理者") }, json: { status: "accepted", points: 8, reviewerNote: "private reason for the contributor" } });
    await k.call("POST", `${A}/submissions/${ids.s1}`, { admin: true, json: { status: "used", version: "v0.5.0" } });
    const log = (await get(k, "/audit")).body.items;
    expect(log.map((e) => [e.actor, e.action, e.target])).toEqual([["admin", "submission.review", ids.s1], ["admin:テスト管理者", "submission.review", ids.s1]]);
    expect(log[1].detail).toEqual({ from: "new", to: "accepted", points: [0, 8], noteChanged: true });
    expect(log[0].detail).toMatchObject({ from: "accepted", to: "used", version: "v0.5.0" });
    expect(JSON.stringify(log)).not.toContain("private reason");
    expect(JSON.stringify(log)).not.toContain("Sakura");
  });
  test("the reviewer name is bounded, stripped of markup, and falls back to plain admin", async () => {
    const { k, ids } = await world();
    const as = async (name) => { await k.call("POST", `${A}/submissions/${ids.s1}`, { admin: true, headers: name === null ? {} : { "x-admin-name": name }, json: { status: "new" } }); return (await get(k, "/audit")).body.items[0].actor; };
    expect(await as("Aki <script>alert(1)</script>")).toBe("admin:Aki scriptalert(1)/script");
    expect((await as("x".repeat(100))).length).toBe("admin:".length + 32);
    expect(await as("   ")).toBe("admin");
    expect(await as(null)).toBe("admin");
    expect(await as("%E0%A4%A")).toMatch(/^admin:/); // not valid percent-encoding: used as sent, never an error
  });
});

describe("marking releases in bulk (POST /admin/submissions/mark-used)", () => {
  test("accepted items become used with the version and time; others are reported", async () => {
    const { k, ids } = await world();
    await k.review(ids.s1, { status: "accepted" }); await k.review(ids.s2, { status: "accepted" });
    await k.review(ids.s3, { status: "rejected" });
    await k.review(ids.s5, { status: "used", version: "v0.1.0" });
    k.clock.advance(7 * 86400_000);
    const r = await k.call("POST", `${A}/submissions/mark-used`, { admin: true, json: { ids: [ids.s1, ids.s2, ids.s3, ids.s4, ids.s5, "ghostghost1234567"], version: "v0.2.0" } });
    expect(r.status).toBe(200);
    expect(r.body.version).toBe("v0.2.0");
    expect(r.body.updated).toEqual([ids.s1, ids.s2]);
    expect(r.body.skipped).toEqual([{ id: ids.s3, reason: "not_accepted" }, { id: ids.s4, reason: "not_accepted" }, { id: ids.s5, reason: "already_used" }]);
    expect(r.body.notFound).toEqual(["ghostghost1234567"]);
    const d = (await get(k, `/submissions/${ids.s1}`)).body;
    expect(d).toMatchObject({ status: "used", usedVersion: "v0.2.0", usedAt: new Date(k.clock.now()).toISOString() });
    expect((await get(k, `/submissions/${ids.s5}`)).body.usedVersion).toBe("v0.1.0"); // bulk never overwrites another release
    expect((await k.call("POST", `${A}/submissions/mark-used`, { admin: true, json: { ids: [ids.s1], version: "v0.2.0" } })).body.skipped).toEqual([{ id: ids.s1, reason: "unchanged" }]);
  });
  test("contributors see the release in /me", async () => {
    const { k, ids, sakura } = await world();
    await k.review(ids.s1, { status: "accepted" });
    await k.call("POST", `${A}/submissions/mark-used`, { admin: true, json: { ids: [ids.s1], version: "v0.3.0" } });
    const mine = (await k.call("GET", "/me", { token: sakura.token })).body.submissions.find((s) => s.id === ids.s1);
    expect(mine).toMatchObject({ status: "used", usedVersion: "v0.3.0" });
    expect(mine.usedAt).toBe(new Date(k.clock.now()).toISOString());
  });
  test("the version is required; ids must be a non-empty list of submission ids, at most 500, duplicates folded", async () => {
    const { k, ids } = await world();
    const post = async (json) => { const r = await k.call("POST", `${A}/submissions/mark-used`, { admin: true, json }); return [r.status, r.body.error]; };
    expect(await post({ ids: [ids.s1] })).toEqual([400, "version_required"]);
    expect(await post({ ids: [ids.s1], version: "bad version" })).toEqual([400, "invalid_version"]);
    expect(await post({ version: "v1" })).toEqual([400, "invalid_ids"]);
    expect(await post({ ids: [], version: "v1" })).toEqual([400, "invalid_ids"]);
    expect(await post({ ids: "abc", version: "v1" })).toEqual([400, "invalid_ids"]);
    expect(await post({ ids: [5], version: "v1" })).toEqual([400, "invalid_ids"]);
    expect(await post({ ids: ["../etc"], version: "v1" })).toEqual([400, "invalid_ids"]);
    expect(await post({ ids: Array(501).fill(ids.s1), version: "v1" })).toEqual([400, "invalid_ids"]);
    await k.review(ids.s1, { status: "accepted" });
    const dup = await k.call("POST", `${A}/submissions/mark-used`, { admin: true, json: { ids: [ids.s1, ids.s1, ids.s1], version: "v1" } });
    expect(dup.body.updated).toEqual([ids.s1]);
  });
  test("it is audited per item and once for the batch", async () => {
    const { k, ids } = await world();
    await k.review(ids.s1, { status: "accepted" }); await k.review(ids.s2, { status: "accepted" });
    await k.call("POST", `${A}/submissions/mark-used`, { admin: true, json: { ids: [ids.s1, ids.s2, ids.s3], version: "v0.9.0" } });
    const log = (await get(k, "/audit?limit=10")).body.items;
    expect(log[0]).toMatchObject({ action: "submissions.mark_used", detail: { version: "v0.9.0", requested: 3, updated: 2, skipped: 1, notFound: 0 } });
    expect(log.filter((e) => e.action === "submission.used").map((e) => e.target).sort()).toEqual([ids.s1, ids.s2].sort());
  });
});

describe("files (admin only, streamed)", () => {
  test("a stored file streams with its content type, length, a safe disposition and a locked-down CSP", async () => {
    const { k, ids } = await world();
    const d = (await get(k, `/submissions/${ids.s2}`)).body;
    for (const [url, type] of [[d.photos[0].previewUrl, "image/jpeg"], [d.photos[0].url, "image/jpeg"], [d.screenshot.url, "image/jpeg"], [d.screenshot.thumbUrl, "image/jpeg"]]) {
      const r = await k.call("GET", url, { admin: true });
      expect([url, r.status]).toEqual([url, 200]);
      expect(r.headers.get("content-type")).toBe(type);
      expect(Number(r.headers.get("content-length"))).toBe(r.body.length);
      expect(r.headers.get("content-disposition")).toMatch(/^inline; filename="[A-Za-z0-9._-]+"$/);
      expect(r.headers.get("cache-control")).toBe("private, max-age=300");
      expect(r.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });
  test("the original is byte for byte what was uploaded; the HEIC original is image/heic; ?download=1 asks the browser to save it", async () => {
    const { k, ids } = await world();
    const heic = (await get(k, `/submissions/${ids.s4}`)).body.photos[0];
    const r = await k.call("GET", `${heic.url}?download=1`, { admin: true });
    expect(r.headers.get("content-type")).toBe("image/heic");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="photo-1.heic"');
    expect(r.body.length).toBe(heic.bytes);
  });
  test("the slashes of a key may be sent raw or percent-encoded", async () => {
    const { k, ids } = await world();
    const key = `submissions/2026/10/${ids.s2}/photo-1.jpg`;
    const raw = await k.call("GET", `${API}/admin/files/${key}`, { admin: true });
    const encoded = await k.call("GET", `${API}/admin/files/${encodeURIComponent(key)}`, { admin: true });
    expect([raw.status, encoded.status]).toEqual([200, 200]);
    expect(raw.body.length).toBe(encoded.body.length);
    expect((await k.app.fetch(new Request(`http://contrib.test${API}/admin/files/${key}`, { method: "HEAD", headers: { authorization: `Bearer ${ADMIN_TOKEN}` } }))).status).toBe(200);
  });
  test("nothing outside the files this service wrote can be read: traversal, absolute paths, other keys and unknown files are 404", async () => {
    const { k, ids } = await world();
    const evil = [
      "../../../etc/passwd", "..%2f..%2f..%2fetc%2fpasswd", "%2e%2e/%2e%2e/etc/passwd", `submissions/2026/10/${ids.s1}/../../../../etc/passwd`, `submissions/2026/10/${ids.s1}/%2e%2e%2f%2e%2e%2fsecret`,
      "/etc/passwd", "%2Fetc%2Fpasswd", "submissions\\2026\\10\\x\\y.jpg", "health/probe.txt", "submissions/2026/10/aaaaaaaaaaaaaaaa/photo-1.jpg", `submissions/2026/10/${ids.s1}/photo-9.jpg`,
      `submissions/2026/10/${ids.s1}/.hidden`, `submissions/2026/10/${ids.s1}`, "submissions", "", "%00", `submissions/2026/10/${ids.s1}/screenshot.jpg%00.png`,
    ];
    for (const key of evil) {
      const r = await k.call("GET", `${API}/admin/files/${key}`, { admin: true });
      expect([key, r.status === 404 || r.status === 400]).toEqual([key, true]);
    }
    expect((await k.call("GET", `${API}/admin/files/submissions/2026/10/${ids.s1}/screenshot.jpg`, { admin: true })).status).toBe(200); // the real one still works
  });
  test("a file whose row was deleted is gone even if a stray copy remained in storage", async () => {
    const { k, ids } = await world();
    const key = `submissions/2026/10/${ids.s1}/screenshot.jpg`;
    await k.call("DELETE", `${A}/submissions/${ids.s1}`, { admin: true });
    await k.app.storage.put(key, new Uint8Array([1, 2, 3]));
    expect((await k.call("GET", `${API}/admin/files/${key}`, { admin: true })).status).toBe(404);
  });
});

describe("the crew-number CSV", () => {
  async function paid() {
    const w = await world(Date.UTC(2026, 9, 5, 3, 0, 0));
    const { k, ids } = w;
    await k.review(ids.s1, { status: "accepted", points: 10 });     // Sakura, Oct 5
    await k.review(ids.s2, { status: "accepted", points: 25 });     // Sakura, Oct 5
    k.clock.advance(3 * 86400_000);                                  // Oct 8 12:00 JST
    await k.review(ids.s5, { status: "accepted", points: 7 });      // Mei (formula nickname), Oct 8
    await k.review(ids.s3, { status: "accepted", points: 5 });      // Taro has no crew number
    await k.review(ids.s6, { status: "rejected" });
    return w;
  }
  test("starts with the UTF-8 BOM, CRLF lines, the header crew_no,nickname,points,accepted, one row per クルーNo. by points", async () => {
    const { k } = await paid();
    const r = await get(k, "/export/crew.csv");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="crew-2026-10-08.csv"');
    const raw = new Uint8Array(await (await k.app.fetch(new Request("http://contrib.test" + API + "/admin/export/crew.csv", { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } }))).arrayBuffer());
    expect([...raw.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = r.body.slice(1).split("\r\n");
    expect(lines[0]).toBe("crew_no,nickname,points,accepted");
    expect(lines.slice(1, 3)).toEqual(['="12345678901234",Sakura,35,2', `="00001111222233",'=cmd|' /C calc'!A0,7,1`]);
    expect(lines[3]).toBe(""); // Taro has no number: not listed
  });
  test("a nickname that is a spreadsheet formula is neutralised with a leading apostrophe", async () => {
    const { k } = await paid();
    const text = (await get(k, "/export/crew.csv")).body;
    expect(text).toContain(",'=cmd|' /C calc'!A0,");
    expect(text).not.toMatch(/,=cmd/);
  });
  test("excel=0 writes the bare 14 digits for scripts", async () => {
    const { k } = await paid();
    const lines = (await get(k, "/export/crew.csv?excel=0")).body.slice(1).split("\r\n");
    expect(lines[1]).toBe("12345678901234,Sakura,35,2");
    expect((await get(k, "/export/crew.csv?excel=false")).body).toContain("\r\n12345678901234,");
  });
  test("the range is by when the submission was reviewed, in JST days (from and to both inclusive)", async () => {
    const { k } = await paid();
    const csv = async (q) => (await get(k, `/export/crew.csv${q}`)).body.slice(1).split("\r\n").slice(1).filter(Boolean).map((l) => l.split(",")[1]);
    expect(await csv("?from=2026-10-05&to=2026-10-05")).toEqual(["Sakura"]);
    expect(await csv("?from=2026-10-06&to=2026-10-31")).toEqual(["'=cmd|' /C calc'!A0".replace(/^'/, "'")]);
    expect(await csv("?from=2026-10-08")).toEqual(["'=cmd|' /C calc'!A0".replace(/^'/, "'")]);
    expect(await csv("?to=2026-10-07")).toEqual(["Sakura"]);
    expect((await csv("")).length).toBe(2);
    expect(await csv("?from=2026-10-09")).toEqual([]);
    // Sakura's items were reviewed at 12:06 JST (03:06 UTC) on Oct 5: a timestamp with an offset is that exact instant
    expect(await csv("?from=2026-10-05T12:05:00%2B09:00&to=2026-10-05T12:07:00%2B09:00")).toEqual(["Sakura"]);
    expect(await csv("?from=2026-10-05T03:05:00Z&to=2026-10-05T03:07:00Z")).toEqual(["Sakura"]);
    expect(await csv("?from=2026-10-05T12:07:00%2B09:00&to=2026-10-06")).toEqual([]);
    expect(await csv("?from=2026-10-05T12:05&to=2026-10-05T12:07")).toEqual(["Sakura"]); // no offset: read as JST
  });
  test("a bad range is a 400", async () => {
    const { k } = await paid();
    for (const q of ["?from=yesterday", "?to=2026-13-40", "?from=2026-10-09&to=2026-10-01"]) {
      const r = await get(k, `/export/crew.csv${q}`);
      expect([q, r.status, r.body.error]).toEqual([q, 400, "invalid_range"]);
    }
  });
  test("banned contributors are not rewarded; two accounts with one number are one row", async () => {
    const { k, ids, sakura, mei } = await paid();
    await k.call("POST", `${A}/contributors/${mei.id}`, { admin: true, json: { banned: true } });
    expect((await get(k, "/export/crew.csv")).body.slice(1).split("\r\n").filter(Boolean)).toHaveLength(2); // header + Sakura
    await k.call("POST", `${A}/contributors/${mei.id}`, { admin: true, json: { banned: false } });
    const twin = await k.newContributor({ nickname: "Sakura Laptop", crewNo: "12345678901234" });
    const s = (await k.submit(twin, { note: "from the laptop" })).body.id;
    await k.review(s, { status: "accepted", points: 100 });
    const rows = (await get(k, "/export/crew.csv?excel=0")).body.slice(1).split("\r\n").filter(Boolean);
    expect(rows[1]).toBe("12345678901234,Sakura Laptop,135,3"); // merged; the nickname of the stronger account
    expect(rows).toHaveLength(3);
    void ids; void sakura;
  });
  test("every export is audited with its range and size, never its content", async () => {
    const { k } = await paid();
    await get(k, "/export/crew.csv?from=2026-10-01&to=2026-10-31");
    const entry = (await get(k, "/audit")).body.items.find((e) => e.action === "export.crew");
    expect(entry.detail).toEqual({ from: "2026-10-01", to: "2026-10-31", rows: 2, excel: true });
    expect(JSON.stringify(entry)).not.toMatch(/Sakura|1234/);
  });
});

describe("the pipeline feed (export/submissions.json)", () => {
  test("accepted submissions by default, with everything the survey tools need and no クルーNo.", async () => {
    const { k, ids } = await world();
    await k.review(ids.s2, { status: "accepted", points: 25, reviewerNote: "good one" });
    await k.review(ids.s1, { status: "used", points: 5, version: "v0.1.0" });
    const r = await get(k, "/export/submissions.json");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "accepted", count: 1 });
    expect(r.body.generatedAt).toBe(new Date(k.clock.now()).toISOString());
    const s = r.body.submissions[0];
    expect(s).toMatchObject({ id: ids.s2, status: "accepted", kind: "fix", category: "building", note: "roof color", lang: "en", points: 25, reviewerNote: "good one", contributor: { nickname: "Sakura" } });
    expect(s.pose).toMatchObject({ enu: [12, 1.6, -34], latlon: [38.9063, 141.5751], heading: 120 });
    expect(s.screenshot.url).toContain("/admin/files/");
    expect(s.photos).toHaveLength(2);
    expect(s.photos[0]).toMatchObject({ n: 1, mime: "image/jpeg", takenAt: "2026-10-04T14:23:05+09:00", exif: { make: "Acme" } });
    expect(s.photos[0].enu.x).toBeCloseTo((s.photos[0].lon - 141.575) * 86744, 9);
    expect(JSON.stringify(r.body)).not.toMatch(/crew|1234-?5678/i);
  });
  test("status filter (accepted, used, new, rejected, all) and a reviewed-date range", async () => {
    const { k, ids } = await world();
    await k.review(ids.s1, { status: "accepted" });
    k.clock.advance(2 * 86400_000);
    await k.review(ids.s2, { status: "accepted" });
    await k.review(ids.s3, { status: "rejected" });
    const ids_ = async (q) => (await get(k, `/export/submissions.json${q}`)).body.submissions.map((s) => s.id);
    expect(await ids_("")).toEqual([ids.s1, ids.s2]);
    expect(await ids_("?status=rejected")).toEqual([ids.s3]);
    expect((await ids_("?status=all")).length).toBe(6);
    expect(await ids_("?status=accepted&from=2026-10-07")).toEqual([ids.s2]);
    expect(await ids_("?status=accepted&to=2026-10-05")).toEqual([ids.s1]);
    for (const q of ["?status=pending", "?from=nope"]) expect((await get(k, `/export/submissions.json${q}`)).status).toBe(400);
  });
  test("it is audited", async () => {
    const { k } = await world();
    await get(k, "/export/submissions.json?status=all");
    expect((await get(k, "/audit")).body.items[0]).toMatchObject({ action: "export.feed", detail: { status: "all", count: 6 } });
  });
});

describe("moderation and privacy deletes", () => {
  test("ban and unban a contributor: they cannot submit while banned, and leave the leaderboard", async () => {
    const { k, ids, sakura } = await world();
    await k.review(ids.s1, { status: "accepted" });
    const ban = await k.call("POST", `${A}/contributors/${sakura.id}`, { admin: true, json: { banned: true } });
    expect(ban.body).toEqual({ id: sakura.id, nickname: "Sakura", banned: true });
    expect((await k.submit(sakura, {})).body.error).toBe("banned");
    expect((await k.call("GET", "/leaderboard")).body).toEqual([]);
    expect((await get(k, `/submissions/${ids.s1}`)).body.contributor.banned).toBe(true);
    expect((await get(k, "/submissions")).body.items.find((i) => i.id === ids.s1).contributor.banned).toBe(true);
    await k.call("POST", `${A}/contributors/${sakura.id}`, { admin: true, json: { banned: false } });
    expect((await k.submit(sakura, {})).status).toBe(201);
    expect((await get(k, "/audit")).body.items.map((e) => e.action)).toEqual(expect.arrayContaining(["contributor.ban", "contributor.unban"]));
  });
  test("reset an offensive nickname to the default; validate input; unknown contributors are 404", async () => {
    const { k, sakura } = await world();
    const r = await k.call("POST", `${A}/contributors/${sakura.id}`, { admin: true, json: { nickname: null } });
    expect(r.body.nickname).toMatch(/^Guest-[A-Z0-9]{4}$/);
    expect((await k.call("POST", `${A}/contributors/${sakura.id}`, { admin: true, json: { nickname: "Friendly Name" } })).body.nickname).toBe("Friendly Name");
    expect((await k.call("POST", `${A}/contributors/${sakura.id}`, { admin: true, json: { banned: "yes" } })).body.error).toBe("invalid_banned");
    expect((await k.call("POST", `${A}/contributors/${sakura.id}`, { admin: true, json: { nickname: "x".repeat(30) } })).body.error).toBe("invalid_nickname");
    expect((await k.call("POST", `${A}/contributors/doesnotexist1234`, { admin: true, json: { banned: true } })).status).toBe(404);
    expect((await k.call("POST", `${A}/contributors/bad$id`, { admin: true, json: { banned: true } })).status).toBe(404);
    expect((await get(k, "/audit")).body.items.some((e) => e.action === "contributor.nickname")).toBe(true);
  });
  test("deleting a submission removes its rows and files and leaves the rest", async () => {
    const { k, ids } = await world();
    const before = (await k.app.storage.list()).length;
    const r = await k.call("DELETE", `${A}/submissions/${ids.s2}`, { admin: true });
    expect(r.body).toEqual({ ok: true, deletedFiles: 2 + 2 * 2 });
    expect((await get(k, `/submissions/${ids.s2}`)).status).toBe(404);
    expect((await k.app.storage.list()).length).toBe(before - 6);
    expect((await k.app.storage.list()).some((f) => f.key.includes(ids.s2))).toBe(false);
    expect((await get(k, "/submissions")).body.total).toBe(5);
    expect((await k.call("DELETE", `${A}/submissions/${ids.s2}`, { admin: true })).status).toBe(404);
    expect((await get(k, "/audit")).body.items[0]).toMatchObject({ action: "submission.delete", target: ids.s2 });
  });
  test("erasing a contributor removes everything they sent; their token stops working", async () => {
    const { k, ids, sakura, taro } = await world();
    const r = await k.call("DELETE", `${A}/contributors/${sakura.id}`, { admin: true });
    expect(r.body.ok).toBe(true);
    expect(r.body.deletedFiles).toBe(2 + (2 + 4));
    expect((await k.call("GET", "/me", { token: sakura.token })).status).toBe(401);
    expect((await get(k, "/submissions")).body.items.map((i) => i.id).sort()).toEqual([ids.s3, ids.s4, ids.s5, ids.s6].sort());
    expect((await k.app.storage.list()).some((f) => f.key.includes(ids.s1) || f.key.includes(ids.s2))).toBe(false);
    expect((await k.call("GET", "/me", { token: taro.token })).status).toBe(200);
    expect((await k.call("DELETE", `${A}/contributors/${sakura.id}`, { admin: true })).status).toBe(404);
    expect((await get(k, "/audit")).body.items[0]).toMatchObject({ action: "contributor.delete", target: sakura.id });
  });
  test("if storage cannot delete the files the rows are still gone and the leftover count is reported", async () => {
    const { k, ids } = await world();
    k.app.storage.remove = async () => { throw new Error("storage down"); };
    const r = await k.call("DELETE", `${A}/submissions/${ids.s1}`, { admin: true });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, deletedFiles: 0 });
    expect((await get(k, "/audit")).body.items[0].detail).toMatchObject({ files: 2, leftover: 2 });
  });
});

describe("stats and the activity log", () => {
  test("counts per status and kind, contributors, banned, photos, crew numbers and the points defaults", async () => {
    const { k, ids, mei } = await world();
    await k.review(ids.s1, { status: "accepted" }); await k.review(ids.s3, { status: "rejected" }); await k.review(ids.s5, { status: "used", version: "v1" });
    await k.call("POST", `${A}/contributors/${mei.id}`, { admin: true, json: { banned: true } });
    const r = await get(k, "/stats");
    expect(r.body).toMatchObject({ byStatus: { new: 3, accepted: 1, used: 1, rejected: 1 }, newByKind: { issue: 1, fix: 2 }, contributors: 3, banned: 1, photos: 3, withCrewNo: 2, points: { issue: 5, fix: 20 } });
    expect(r.body.generatedAt).toBe(new Date(k.clock.now()).toISOString());
  });
  test("the log pages newest first", async () => {
    const { k, ids } = await world();
    for (let i = 0; i < 5; i++) { k.clock.advance(1000); await k.review(ids.s1, { status: i % 2 ? "new" : "accepted" }); }
    const p1 = (await get(k, "/audit?limit=2")).body;
    expect(p1).toMatchObject({ total: 5, limit: 2, offset: 0 });
    expect(p1.items).toHaveLength(2);
    const p3 = (await get(k, "/audit?limit=2&offset=4")).body;
    expect(p3.items).toHaveLength(1);
    expect(p1.items[0].at > p3.items[0].at).toBe(true);
    expect((await get(k, "/audit?limit=999")).body.limit).toBe(200);
  });
});

describe("the admin page (GET /admin)", () => {
  test("static page with the server's values injected, a strict CSP, and no caching", async () => {
    const k = makeApp({ config: { appUrl: "https://app.example/?look=photo", pointsFix: 30 } });
    const r = await k.call("GET", "/admin");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("content-security-policy")).toBe(ADMIN_CSP);
    expect(ADMIN_CSP).toContain("script-src 'self'");
    expect(ADMIN_CSP).toContain("default-src 'none'");
    expect(ADMIN_CSP).toContain("frame-ancestors 'none'");
    expect(ADMIN_CSP).not.toContain("unsafe-inline");
    expect(ADMIN_CSP).not.toContain("unsafe-eval");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("cache-control")).toBe("no-cache");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    const cfg = JSON.parse(/<script id="cfg" type="application\/json">([\s\S]*?)<\/script>/.exec(r.body)[1]);
    expect(cfg).toMatchObject({ api: "/api/contrib/v1", appUrl: "https://app.example/?look=photo", points: { issue: 5, fix: 30 }, version: "1.0.0", maxPhotos: 6 });
    expect(r.body).not.toContain("__CONFIG__");
    expect(JSON.stringify(cfg)).not.toContain(ADMIN_TOKEN); // the token never reaches the page
  });
  test("the page serves without a token (the data behind it does not)", async () => {
    const k = makeApp();
    expect((await k.call("GET", "/admin")).status).toBe(200);
    expect((await k.call("GET", "/admin/")).status).toBe(200);
    expect((await k.call("GET", "http://contrib.test/submissions")).status).toBe(404); // a public path that is not an API route
    expect((await k.call("GET", `${A}/submissions`)).status).toBe(401);
  });
  test("its scripts and styles are served with their types and the same policy; unknown assets are 404", async () => {
    const k = makeApp();
    for (const [file, type] of [["app.js", "text/javascript; charset=utf-8"], ["lib.js", "text/javascript; charset=utf-8"], ["app.css", "text/css; charset=utf-8"], ["icon.svg", "image/svg+xml"]]) {
      const r = await k.call("GET", `/admin/${file}`);
      expect([file, r.status, r.headers.get("content-type")]).toEqual([file, 200, type]);
      expect(r.headers.get("content-security-policy")).toBe(ADMIN_CSP);
      expect(r.body.length).toBeGreaterThan(10);
    }
    for (const bad of ["nope.js", "..%2f..%2fpackage.json", "index.html", "app.js.map", "app.js/extra"]) {
      const r = await k.app.fetch(new Request(`http://contrib.test/admin/${bad}`));
      expect([bad, r.status]).toEqual([bad, 404]);
    }
  });
  test("the page's API calls pass the origin check (same origin) and need the token", async () => {
    const k = makeApp();
    const r = await k.call("GET", `${A}/stats`, { admin: true, origin: "http://contrib.test" });
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("http://contrib.test");
  });
  test("a screenshot of a real flow: the admin sees what a contributor sent", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Flow" });
    const shot = await synthScreenshot({ width: 800, height: 450 });
    const { body } = await k.submit(me, { screenshot: shot, note: "end to end" });
    const detail = await get(k, `/submissions/${body.id}`);
    const file = await k.call("GET", detail.body.screenshot.url, { admin: true });
    expect(new Uint8Array(file.body)).toEqual(new Uint8Array(shot));
  });
});
