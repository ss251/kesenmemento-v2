// [contrib] The pure parts of the report sheet (ui/contrib-lib.js): クルーNo. validation, claim codes, photos, the form check, the draft and the
// anonymous login in storage, status and points copy, the screenshot size, the keyboard inset, the transfer link, and the strings.
import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  CONTRIB_API, CONTRIB_CONTACT, CATEGORIES, KINDS, POINTS, LIMITS, SHOT, createT, STRINGS, checkCrewNo, isValidCrewNo, maskCrewNo, cleanNickname, nicknameProblem, checkClaimCode,
  groupCode, photoProblem, validateReport, clampNote, effectiveLimits, effectivePoints, mbText, safeStorage, KEYS, loadDraft, saveDraft, clearDraft, loadProfile, saveProfile, createAccounts, statusOf, versionLabel,
  pointsOf, fmtDate, countdown, waitText, newIdempotencyKey, shotSize, thumbSize, keyboardInset, claimUrl, claimFromSearch,
} from "../src/anime/ui/contrib-lib.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
/** A localStorage that works (a Map) or one that always throws (private mode). */
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const store = (ls = mem()) => safeStorage({ localStorage: ls });
const file = (name, type, size = 1000) => ({ name, type, size });

describe("クルーNo.: exactly 14 digits, dashes and full-width digits accepted, optional", () => {
  test("14 digits are valid, with or without dashes, spaces and the Japanese hyphens", () => {
    for (const s of ["12345678901234", "1234-5678-9012-34", "1234 5678 9012 34", "1234-5678-9012-34 ", "1234‐5678‑9012‒34", "1234−5678−9012−34", "1234ー5678ー9012ー34", "1234_5678_9012_34", " 12345678901234\n"]) {
      expect([s, checkCrewNo(s)]).toEqual([s, { ok: true, digits: "12345678901234", error: null }]);
    }
  });
  test("full-width digits (a Japanese keyboard) are read as digits", () => {
    expect(checkCrewNo("１２３４５６７８９０１２３４")).toEqual({ ok: true, digits: "12345678901234", error: null });
    expect(checkCrewNo("１２３４－５６７８－９０１２－３４").digits).toBe("12345678901234");
  });
  test("empty is fine (the number is optional)", () => {
    for (const s of ["", "  ", null, undefined, "---", " - "]) expect(checkCrewNo(s)).toEqual({ ok: true, digits: "", error: null });
  });
  test("anything else is refused with the reason: letters or symbols ('chars'), too few or too many digits ('length')", () => {
    expect(checkCrewNo("1234-5678-9012-3A").error).toBe("chars");
    expect(checkCrewNo("abcdefghijklmn").error).toBe("chars");
    expect(checkCrewNo("1234 5678 9012 34!").error).toBe("chars");
    expect(checkCrewNo("1234567890123")).toMatchObject({ ok: false, error: "length", digits: "1234567890123" });   // 13
    expect(checkCrewNo("123456789012345")).toMatchObject({ ok: false, error: "length" });                         // 15
    expect(checkCrewNo("1")).toMatchObject({ ok: false, error: "length" });
    expect(isValidCrewNo("12345678901234")).toBe(true); expect(isValidCrewNo("123")).toBe(false); expect(isValidCrewNo("")).toBe(true);
  });
  test("maskCrewNo keeps only the last four digits", () => {
    expect(maskCrewNo("12345678901234")).toBe("••••••••••1234"); expect(maskCrewNo("")).toBe(""); expect(maskCrewNo(null)).toBe("");
  });
});

describe("nickname and the transfer code", () => {
  test("a nickname is trimmed, tidy and at most 24 characters (code points)", () => {
    expect(cleanNickname("  さくら   ちゃん ")).toBe("さくら ちゃん");
    expect(cleanNickname("a\u0000b​c‮d")).toBe("abcd");
    expect(cleanNickname("Ａｂｃ")).toBe("Abc");   // NFKC
    expect(cleanNickname("x".repeat(40))).toBe("x".repeat(24));
    expect(Array.from(cleanNickname("😀".repeat(30))).length).toBe(24);
    expect(cleanNickname(null)).toBe(""); expect(cleanNickname(undefined)).toBe("");
  });
  test("a transfer code is 10 Crockford characters; case, spaces and dashes do not matter; O / I / L are read as 0 / 1 / 1 (like the backend), U is not a code character", () => {
    expect(checkClaimCode("abcde fghjk")).toEqual({ ok: true, code: "ABCDEFGHJK" });
    expect(checkClaimCode(" K7M2-X9QP4A ")).toEqual({ ok: true, code: "K7M2X9QP4A" });
    expect(checkClaimCode("ＫＩＭ２X9QP4A")).toEqual({ ok: true, code: "K1M2X9QP4A" });   // full-width, and the I is read as a 1
    expect(checkClaimCode("OIL0OIL0OI")).toEqual({ ok: true, code: "0110011001" });
    expect(checkClaimCode("k7qm2-xhd9p")).toEqual({ ok: true, code: "K7QM2XHD9P" });   // the example of the API doc
    for (const bad of ["", "ABC", "ABCDEFGHJKL", "ABCDE*GHJK", "UUUUUUUUUU", "ABCDEFGHJU", null, undefined, "あいうえおかきくけこ"]) expect([bad, checkClaimCode(bad).ok]).toEqual([bad, false]);
    expect(groupCode("K7M2X9QP4A")).toBe("K7M2X-9QP4A"); expect(groupCode("short")).toBe("short");   // written the way the backend writes it
  });
  test("a nickname with a link or an e-mail address is refused on the spot (the backend's own rule), anything else is fine", () => {
    for (const bad of ["http://x.com", "https://example.org/a", "www.example.jp", "shop.example.com", "me@example.com", "さくら@mail.example.co.jp"]) expect([bad, nicknameProblem(bad)]).toEqual([bad, "link"]);
    for (const good of ["さくら", "Sora_123", "ひろ ちゃん", "気仙沼.love", "v1.2", "😀😀", "", null]) expect([good, nicknameProblem(good)]).toEqual([good, null]);
  });
});

describe("photos and the whole form", () => {
  test("photoProblem: a supported type under 15 MB is fine; HEIC with no MIME type counts by its extension", () => {
    for (const f of [file("a.jpg", "image/jpeg"), file("b.PNG", "image/png"), file("c.webp", "image/webp"), file("d.heic", "image/heic"), file("e.HEIC", ""), file("f.heif", "application/octet-stream"), file("g.jpeg", "image/jpeg", LIMITS.photoBytes)]) expect([f.name, photoProblem(f)]).toEqual([f.name, null]);
    expect(photoProblem(file("a.gif", "image/gif"))).toBe("type"); expect(photoProblem(file("a.pdf", "application/pdf"))).toBe("type"); expect(photoProblem(file("noext", ""))).toBe("type");
    expect(photoProblem(file("a.jpg", "image/jpeg", LIMITS.photoBytes + 1))).toBe("size");
    expect(photoProblem(file("a.jpg", "image/jpeg", 0))).toBe("empty"); expect(photoProblem(null)).toBe("empty");
  });
  const ok = { kind: "issue", category: "sign", note: "看板が1m右です", consent: true, photos: [], crewNo: "" };
  test("a minimal report: kind, category and consent", () => {
    expect(validateReport(ok)).toEqual({ ok: true, errors: {} });
    expect(validateReport({ ...ok, note: "" }).ok).toBe(true);   // the note is optional
  });
  test("what is missing is named", () => {
    expect(validateReport({ ...ok, category: "" }).errors).toEqual({ category: "required" });
    expect(validateReport({ ...ok, category: "castle" }).errors).toEqual({ category: "required" });
    expect(validateReport({ ...ok, kind: "x" }).errors).toEqual({ kind: "required" });
    expect(validateReport({ ...ok, consent: false }).errors).toEqual({ consent: "required" });
    expect(validateReport({ ...ok, note: "x".repeat(2001) }).errors).toEqual({ note: "long" });
    expect(validateReport({ ...ok, crewNo: "123" }).errors).toEqual({ crewNo: "length" });
    expect(validateReport({ kind: "issue" }).errors).toEqual({ category: "required", consent: "required" });
  });
  test("a nickname with a link is named; a missing screenshot with nothing else to send is an empty report (the backend's empty_submission)", () => {
    expect(validateReport({ ...ok, nickname: "http://x.com" }).errors).toEqual({ nickname: "link" });
    expect(validateReport({ ...ok, nickname: "そら" }).ok).toBe(true);
    expect(validateReport({ ...ok, note: "", hasShot: false }).errors).toEqual({ note: "empty" });
    expect(validateReport({ ...ok, note: "  ", hasShot: false }).errors).toEqual({ note: "empty" });
    expect(validateReport({ ...ok, note: "", hasShot: false, photos: [file("a.jpg", "image/jpeg")] }).ok).toBe(true);   // a photo is something
    expect(validateReport({ ...ok, note: "x", hasShot: false }).ok).toBe(true);
    expect(validateReport({ ...ok, note: "", hasShot: true }).ok).toBe(true); expect(validateReport({ ...ok, note: "" }).ok).toBe(true);   // (unknown counts as "there is one")
  });
  test("a fix needs at least one photo; six at most; each one valid", () => {
    expect(validateReport({ ...ok, kind: "fix" }).errors).toEqual({ photos: "needed" });
    expect(validateReport({ ...ok, kind: "fix", photos: [file("a.jpg", "image/jpeg")] }).ok).toBe(true);
    expect(validateReport({ ...ok, photos: Array.from({ length: 7 }, (_, i) => file(`${i}.jpg`, "image/jpeg")) }).errors).toEqual({ photos: "many" });
    expect(validateReport({ ...ok, photos: Array.from({ length: 6 }, (_, i) => file(`${i}.jpg`, "image/jpeg")) }).ok).toBe(true);
    expect(validateReport({ ...ok, photos: [file("a.gif", "image/gif")] }).errors).toEqual({ photos: "type" });
    expect(validateReport({ ...ok, photos: [file("a.jpg", "image/jpeg", LIMITS.photoBytes + 1)] }).errors).toEqual({ photos: "size" });
  });
  test("the limits match the backend's spec: 6 photos, 15 MB a photo, 8 MB a screenshot, 2,000 characters, 14 digits", () => {
    expect(LIMITS).toMatchObject({ photos: 6, photoBytes: 15 * 1048576, shotBytes: 8 * 1048576, note: 2000, crewDigits: 14, codeLen: 10 });
    expect(CATEGORIES).toEqual(["building", "road", "shop", "sign", "landmark", "other"]); expect(KINDS).toEqual(["issue", "fix"]);
    expect(POINTS).toEqual({ issue: 5, fix: 20 });
    expect(CONTRIB_API).toBe("");
    expect(clampNote("x".repeat(3000)).length).toBe(2000);
  });
});

describe("storage: the draft, the profile and the anonymous login never throw and never leak across backends", () => {
  test("safeStorage survives a storage that throws (private mode) or is missing", () => {
    const bad = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
    for (const s of [safeStorage({ localStorage: bad }), safeStorage({}), safeStorage(null), safeStorage({ get localStorage() { throw new Error("blocked"); } })]) {
      expect(s.get("k")).toBeNull(); expect(s.set("k", "v")).toBe(false); expect(() => s.del("k")).not.toThrow();
    }
  });
  test("a draft keeps the text (kind, category, note, クルーNo.), expires after 30 days, ignores garbage", () => {
    const s = store(), now = 1_700_000_000_000;
    saveDraft(s, { kind: "fix", category: "road", note: "道が1本ちがう", crewNo: "1234-5678-9012-34" }, now);
    expect(loadDraft(s, now + 1000)).toEqual({ kind: "fix", category: "road", note: "道が1本ちがう", crewNo: "1234-5678-9012-34" });
    expect(loadDraft(s, now + LIMITS.drafts + 1)).toBeNull();
    clearDraft(s); expect(loadDraft(s, now)).toBeNull();
    s.set(KEYS.draft, "not json"); expect(loadDraft(s, now)).toBeNull();
    s.set(KEYS.draft, JSON.stringify({ v: 2, at: now })); expect(loadDraft(s, now)).toBeNull();
    s.set(KEYS.draft, JSON.stringify({ v: 1, at: now, kind: "weird", category: "castle", note: "x".repeat(5000), crewNo: 7 }));
    expect(loadDraft(s, now)).toEqual({ kind: "issue", category: "", note: "x".repeat(2000), crewNo: "" });
  });
  test("an empty draft is not stored (and removes the old one); consent and photos are never in a draft", () => {
    const ls = mem(), s = store(ls), now = 1_700_000_000_000;
    saveDraft(s, { kind: "issue", category: "sign", note: "", crewNo: "" }, now); expect(ls._m.size).toBe(1);
    saveDraft(s, { kind: "issue", category: "", note: "", crewNo: "" }, now); expect(ls._m.size).toBe(0);
    saveDraft(s, { kind: "issue", category: "sign", note: "x", crewNo: "", consent: true, photos: [file("a.jpg", "image/jpeg")] }, now);
    const raw = JSON.parse(ls.getItem(KEYS.draft)); expect(Object.keys(raw).sort()).toEqual(["at", "category", "crewNo", "kind", "note", "v"]);
  });
  test("the profile remembers a clean nickname and a valid クルーNo.", () => {
    const s = store();
    expect(loadProfile(s)).toEqual({ nickname: "", crewNo: "" });
    saveProfile(s, { nickname: "  さくら ", crewNo: "1234-5678-9012-34" }); expect(loadProfile(s)).toEqual({ nickname: "さくら", crewNo: "12345678901234" });
    saveProfile(s, { nickname: "a", crewNo: "oops" }); expect(loadProfile(s)).toEqual({ nickname: "a", crewNo: "" });
  });
  test("the login is kept per backend: a token is never offered to another server", () => {
    const ls = mem(), s = store(ls), a = createAccounts(s, "https://a.example"), b = createAccounts(s, "http://127.0.0.1:8988");
    expect(a.get()).toBeNull();
    a.set({ id: "u1", token: "u1.secretA" }); b.set({ id: "u2", token: "u2.secretB" });
    expect(a.get()).toMatchObject({ id: "u1", token: "u1.secretA" }); expect(b.get()).toMatchObject({ id: "u2", token: "u2.secretB" });
    a.clear(); expect(a.get()).toBeNull(); expect(b.get()).toMatchObject({ id: "u2", token: "u2.secretB" });
    b.clear(); expect(ls._m.has(KEYS.account)).toBe(false);
    ls.setItem(KEYS.account, JSON.stringify({ "https://a.example": { id: 5 } })); expect(a.get()).toBeNull();   // a record without a token is no login
  });
  test("the login remembers what the server last heard about the nickname and the クルーNo. (so a change is sent once); a new login starts with none", () => {
    const s = store(), a = createAccounts(s, "https://a.example");
    a.set({ id: "u1", token: "u1.s" }); expect(a.get()).toEqual({ id: "u1", token: "u1.s", profile: null });
    a.setProfile({ nickname: "  さくら ", crewNo: "1234-5678-9012-34" }); expect(a.get().profile).toEqual({ nickname: "さくら", crewNo: "12345678901234" });
    a.setProfile({ nickname: "x", crewNo: "oops" }); expect(a.get().profile).toEqual({ nickname: "x", crewNo: "" });
    a.set({ id: "u2", token: "u2.s" }); expect(a.get().profile).toBeNull();
    createAccounts(s, "https://b.example").setProfile({ nickname: "no login there" }); expect(createAccounts(s, "https://b.example").get()).toBeNull();   // (nothing to attach it to)
  });
});

describe("how a report looks to its author: status, points, version, dates", () => {
  test("statusOf: new -> pending, accepted, rejected, used; a shipped version means used", () => {
    expect(statusOf({ status: "new" })).toBe("pending"); expect(statusOf({})).toBe("pending"); expect(statusOf(null)).toBe("pending");
    expect(statusOf({ status: "accepted" })).toBe("accepted"); expect(statusOf({ status: "rejected" })).toBe("rejected"); expect(statusOf({ status: "used" })).toBe("used");
    expect(statusOf({ status: "accepted", usedVersion: "v1.2" })).toBe("used"); expect(statusOf({ status: "rejected", usedVersion: "v1.2" })).toBe("rejected");
  });
  test("points show only once a moderator accepted the report", () => {
    expect(pointsOf({ status: "new", points: 5 })).toBe(0); expect(pointsOf({ status: "rejected", points: 5 })).toBe(0);
    expect(pointsOf({ status: "accepted", points: 5 })).toBe(5); expect(pointsOf({ status: "used", points: 20 })).toBe(20); expect(pointsOf({ status: "accepted", points: -3 })).toBe(0);
    expect(pointsOf({ status: "accepted", points: "x" })).toBe(0);
  });
  test("versionLabel: v1.2 whatever the spelling", () => {
    expect(versionLabel("1.2")).toBe("v1.2"); expect(versionLabel("v1.2")).toBe("v1.2"); expect(versionLabel("V1.2")).toBe("v1.2"); expect(versionLabel(" 0.1.0+abc1234 ")).toBe("v0.1.0+abc1234");
    expect(versionLabel("")).toBe(""); expect(versionLabel(null)).toBe("");
  });
  test("fmtDate (Japan time, short) and countdown (mm:ss, never negative)", () => {
    expect(fmtDate("2026-10-05T16:30:00Z", "ja")).toBe("10/6");   // 01:30 JST on the 6th
    expect(fmtDate("2026-10-05T03:00:00Z", "en")).toBe("10/5");
    expect(fmtDate("junk")).toBe("");
    expect(countdown(1_000_000 + 15 * 60 * 1000, 1_000_000)).toBe("15:00"); expect(countdown(1_000_000 + 61_000, 1_000_000)).toBe("1:01"); expect(countdown(1_000_000, 2_000_000)).toBe("0:00");
    expect(countdown(1_000_000 + 59_001, 1_000_000)).toBe("1:00");
  });
});

describe("the limits and points the backend announces (GET /health) on top of the built-in ones", () => {
  test("nothing announced: the built-in numbers (the backend's documented defaults)", () => {
    for (const cfg of [null, undefined, {}, { limits: null, points: null }, { limits: {}, points: {} }]) { expect(effectiveLimits(cfg)).toEqual(LIMITS); expect(effectivePoints(cfg)).toEqual(POINTS); }
  });
  test("announced numbers win, one by one; a number that is not sane keeps the built-in one", () => {
    const l = effectiveLimits({ limits: { photos: 3, photoBytes: 5 * 1048576, shotBytes: 4 * 1048576, note: 500 } });
    expect(l).toMatchObject({ photos: 3, photoBytes: 5 * 1048576, shotBytes: 4 * 1048576, note: 500, nickname: 24, crewDigits: 14, codeLen: 10 });
    expect(effectiveLimits({ limits: { photos: 0, photoBytes: 10, shotBytes: 1e12, note: 5 } })).toEqual(LIMITS);   // 0 photos, a 10-byte photo, a 1 TB screenshot, a 5-character note: all refused
    expect(effectiveLimits({ limits: { photos: 6.5, photoBytes: "15", note: null } })).toEqual(LIMITS); expect(effectiveLimits({ limits: { photos: 20 } }).photos).toBe(20); expect(effectiveLimits({ limits: { photos: 21 } }).photos).toBe(6);
    expect(effectivePoints({ points: { issue: 7, fix: 30 } })).toEqual({ issue: 7, fix: 30 }); expect(effectivePoints({ points: { issue: 7 } })).toEqual({ issue: 7, fix: 20 });
    expect(effectivePoints({ points: { issue: 0, fix: -3 } })).toEqual(POINTS); expect(effectivePoints({ points: { issue: 99999, fix: 1.5 } })).toEqual(POINTS);
  });
  test("mbText: the size limit in megabytes the way a person says it", () => {
    expect([mbText(15 * 1048576), mbText(8 * 1048576), mbText(7.5 * 1048576), mbText(5 * 1048576 + 1000), mbText(1048576 / 4)]).toEqual(["15", "8", "7.5", "5", "0.3"]);
  });
  test("photoProblem, validateReport and clampNote take the limits in force", () => {
    const big = file("a.jpg", "image/jpeg", 6 * 1048576), lim = effectiveLimits({ limits: { photos: 2, photoBytes: 5 * 1048576, note: 100 } });
    expect(photoProblem(big)).toBeNull(); expect(photoProblem(big, lim)).toBe("size");
    const ok = { kind: "issue", category: "sign", note: "x".repeat(101), consent: true, photos: [], crewNo: "" };
    expect(validateReport(ok).ok).toBe(true); expect(validateReport(ok, lim).errors).toEqual({ note: "long" });
    const three = Array.from({ length: 3 }, (_, i) => file(`${i}.jpg`, "image/jpeg")); expect(validateReport({ ...ok, note: "", photos: three }).ok).toBe(true); expect(validateReport({ ...ok, note: "", photos: three }, lim).errors).toEqual({ photos: "many" });
    expect(validateReport({ ...ok, note: "", photos: [big] }, lim).errors).toEqual({ photos: "size" });
    expect(clampNote("x".repeat(3000))).toHaveLength(2000); expect(clampNote("x".repeat(300), 100)).toHaveLength(100);
  });
});

describe("waiting times and idempotency keys", () => {
  const t = createT(() => "ja"), te = createT(() => "en");
  test("waitText: minutes under an hour, about so many hours above (the Retry-After of a daily limit)", () => {
    expect(waitText(30, t)).toBe("1分"); expect(waitText(61, t)).toBe("2分"); expect(waitText(3599, t)).toBe("60分"); expect(waitText(3600, t)).toBe("約1時間"); expect(waitText(5400, t)).toBe("約2時間"); expect(waitText(7 * 3600 + 100, t)).toBe("約7時間");
    expect(waitText(0, t)).toBe("1分"); expect(waitText(undefined, t)).toBe("1分"); expect(waitText(125, te)).toBe("3 min"); expect(waitText(3 * 3600, te)).toBe("about 3 h");
  });
  test("newIdempotencyKey: 8 to 80 of letters, digits . _ : - (what the backend accepts); a UUID when the browser can, random bytes when it cannot, never the same twice", () => {
    const ok = (k) => /^[A-Za-z0-9._:-]{8,80}$/.test(k);
    const real = newIdempotencyKey(); expect(ok(real)).toBe(true); expect(newIdempotencyKey()).not.toBe(real);
    expect(newIdempotencyKey({ randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" })).toBe("123e4567-e89b-42d3-a456-426614174000");
    const bytes = newIdempotencyKey({ getRandomValues: (b) => { b.fill(171); return b; } }); expect(bytes).toBe("k-" + "ab".repeat(16)); expect(ok(bytes)).toBe(true);   // an insecure page has no randomUUID
    const none = newIdempotencyKey({}); expect(ok(none)).toBe(true); expect(newIdempotencyKey(null)).toMatch(/^k-[0-9a-f]{32}$/);
    expect(ok(newIdempotencyKey({ randomUUID() { throw new Error("insecure"); }, getRandomValues: (b) => b }))).toBe(true);
  });
  test("the contact for deletion requests is not set until the team has one (nothing is invented; a link cannot set it)", () => {
    expect(CONTRIB_CONTACT).toBe("");
  });
});

describe("the screenshot and the keyboard", () => {
  test("shotSize: up to 1600 wide, never blown up beyond the screen's own pixels (dpr up to 2), same aspect", () => {
    expect(shotSize(1440, 900, { dpr: 2 })).toEqual({ w: 1600, h: 1000 });        // desktop on a retina screen: the spec's 1,600
    expect(shotSize(1440, 900, { dpr: 1 })).toEqual({ w: 1440, h: 900 });          // a 1x desktop is not upscaled
    expect(shotSize(1920, 1080, { dpr: 1 })).toEqual({ w: 1600, h: 900 });         // a big window is brought down to 1600
    expect(shotSize(390, 844, { dpr: 3 })).toEqual({ w: 780, h: 1688 });           // a phone: its canvas x2, not x4
    expect(shotSize(844, 390, { dpr: 3 })).toEqual({ w: 1600, h: 739 });
    expect(shotSize(0, 0)).toEqual({ w: 1, h: 1 });   // (degenerate input still gives a positive size)
    const a = shotSize(1280, 720, { dpr: 1.5 }); expect(a.w / a.h).toBeCloseTo(16 / 9, 2);
    expect(SHOT.maxW).toBe(1600);
  });
  test("thumbSize: the preview is small (480 wide, 240 tall at most), never bigger than the picture", () => {
    expect(thumbSize(1600, 1000)).toEqual({ w: 384, h: 240 }); expect(thumbSize(780, 1688)).toEqual({ w: 111, h: 240 }); expect(thumbSize(100, 50)).toEqual({ w: 100, h: 50 });
  });
  test("keyboardInset: what the on-screen keyboard covers (a small gap is the URL bar, not a keyboard)", () => {
    expect(keyboardInset({ height: 520, offsetTop: 0 }, 844)).toBe(324);
    expect(keyboardInset({ height: 500, offsetTop: 40 }, 844)).toBe(304);
    expect(keyboardInset({ height: 800, offsetTop: 0 }, 844)).toBe(0); expect(keyboardInset(null, 844)).toBe(0); expect(keyboardInset({ height: 400 }, 0)).toBe(0);
  });
});

describe("the transfer link (the QR code carries it)", () => {
  test("claimUrl: this page with ?claim=CODE, nothing else kept, ?contribApi= only for a non-default backend", () => {
    expect(claimUrl("https://app.example/index.html?lang=en&cam=1,2,3,4,5,6#x", "K7M2X9QP4A")).toBe("https://app.example/index.html?claim=K7M2X9QP4A");
    expect(claimUrl("http://127.0.0.1:8986/", "K7M2X9QP4A", { api: "http://127.0.0.1:8988" })).toBe("http://127.0.0.1:8986/?claim=K7M2X9QP4A&contribApi=http%3A%2F%2F127.0.0.1%3A8988");
    expect(claimUrl("https://app.example/", "K7M2X9QP4A", { api: CONTRIB_API })).toBe("https://app.example/?claim=K7M2X9QP4A");
    expect(claimUrl("https://app.example/", "K7M2X9QP4A", { api: "" })).toBe("https://app.example/?claim=K7M2X9QP4A");   // no backend: the link does not grow a relative contribApi
  });
  test("claimFromSearch reads and validates ?claim=", () => {
    expect(claimFromSearch("?claim=k7m2-x9qp4a")).toBe("K7M2X9QP4A"); expect(claimFromSearch("?claim=short")).toBe(""); expect(claimFromSearch("?x=1")).toBe(""); expect(claimFromSearch("")).toBe("");
  });
});

describe("strings: Japanese and English have the same keys, no empty value, every key the code asks for exists", () => {
  const ja = STRINGS.ja, en = STRINGS.en;
  test("same keys in both languages; nothing empty; placeholders agree", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
    for (const k of Object.keys(ja)) {
      expect(typeof ja[k]).toBe("string"); expect(ja[k].trim().length).toBeGreaterThan(0); expect(en[k].trim().length).toBeGreaterThan(0);
      expect([k, (ja[k].match(/\{\w+\}/g) || []).sort()]).toEqual([k, (en[k].match(/\{\w+\}/g) || []).sort()]);
      expect(k.startsWith("contrib.")).toBe(true);
    }
  });
  test("Japanese is real Japanese; English has no kana", () => {
    for (const [k, v] of Object.entries(ja)) if (!/^contrib\.(note\.count|status\.pt)$/.test(k)) expect([k, /[぀-ヿ一-鿿]/.test(v)]).toEqual([k, true]);
    // (English may name 気仙沼地域戦略 and the クルーNo. in Japanese, as the backend's privacy text does)
    for (const [k, v] of Object.entries(en)) expect([k, /[぀-ヿ一-鿿]/.test(v.replace(/気仙沼地域戦略|クルーNo\./g, ""))]).toEqual([k, false]);
  });
  test("the spec's labels are exact", () => {
    expect(ja["contrib.open"]).toBe("修正を報告"); expect(en["contrib.open"]).toBe("Report a correction");
    expect(ja["contrib.closed"]).toBe("報告の受付は準備中です"); expect(en["contrib.closed"]).toBe("Reports are not open yet");
    expect(ja["contrib.tab.mine"]).toBe("マイ投稿"); expect(ja["contrib.tab.board"]).toBe("貢献ランキング");
    expect(ja["contrib.kind.issue"]).toBe("問題を報告"); expect(ja["contrib.kind.fix"]).toBe("現地の写真で直す");
    expect(ja["contrib.cat.building.ex"]).toContain("浮いている建物"); expect(ja["contrib.cat.sign.ex"]).toContain("看板の位置がちがう"); expect(ja["contrib.cat.road.ex"]).toContain("道がちがう");
    expect(ja["contrib.status.usedVersion"]).toBe("反映済み（{v}）"); expect(ja["contrib.xfer.title"]).toBe("別の端末に引き継ぐ"); expect(ja["contrib.claim.title"]).toBe("引き継ぎコードを入力");
    expect(ja["contrib.crew.hint"]).toContain("クルーカードアプリの乗組員証に表示される番号");
  });
  test("the points copy names about 5 for a report and 20 for a fix, and that it is pending until reviewed", () => {
    const t = createT(() => "ja");
    expect(t("contrib.points", { issue: POINTS.issue, fix: POINTS.fix })).toBe("採用されると、問題の報告は約5ポイント、現地の写真で直すと約20ポイント。確認が終わるまでは「確認待ち」です。");
    expect(createT(() => "en")("contrib.points", { issue: 5, fix: 20 })).toContain("Pending review");
  });
  test("the fix path says in one short line that on-the-spot photos carry their location", () => {
    expect(ja["contrib.kind.fix.desc"]).toContain("場所の情報"); expect(en["contrib.kind.fix.desc"]).toMatch(/location/); expect(ja["contrib.kind.fix.desc"].length).toBeLessThan(50);
  });
  test("every contrib.* key the sheet's source names exists (static scan of ui/contrib*.js)", () => {
    const need = new Set();
    for (const f of readdirSync(join(ROOT, "src/anime/ui")).filter((f) => /^contrib.*\.js$/.test(f))) {
      const src = read("src/anime/ui/" + f);
      for (const m of src.matchAll(/['"`](contrib\.[\w.]+)['"`]/g)) need.add(m[1]);
    }
    const missing = [...need].filter((k) => !(k in ja) && !/[.]$/.test(k));
    expect(missing).toEqual([]);   // (test/contrib-sheet.test.js also checks that the sheet really asks for them)
  });
  test("createT: the language getter, Japanese as the fallback, the key as the last resort, placeholders", () => {
    let lang = "ja"; const t = createT(() => lang);
    expect(t("contrib.close")).toBe("閉じる"); lang = "en"; expect(t("contrib.close")).toBe("Close");
    expect(t("contrib.sending", { pct: 42 })).toBe("Sending… 42%"); expect(t("contrib.nope")).toBe("contrib.nope");
    lang = "fr"; expect(t("contrib.close")).toBe("閉じる");
    expect(createT(() => "en", { ja: { a: "あ{n}" }, en: {} })("a", { n: 1 })).toBe("あ1");
  });
  test("the privacy text is the backend's (docs/contrib/PRIVACY.md, version 2026-10-05): the consent label, the summary, nine headed items; the contact is a placeholder, never a literal {{CONTACT}}", () => {
    expect(ja["contrib.consent"]).toBe("投稿内容と写真の取り扱い(プライバシー)に同意して送信します"); expect(en["contrib.consent"]).toBe("I agree to how my report and photos are handled (privacy) and want to send it");
    expect(ja["contrib.privacy.link"]).toBe("取り扱いの詳細"); expect(ja["contrib.privacy.title"]).toBe("投稿の取り扱いについて");
    expect(ja["contrib.privacy.summary"]).toBe("写真と撮影場所は公開されません。3Dの街を実際に近づけるためにだけ使います。");
    for (const l of [ja, en]) {
      const heads = Object.keys(l).filter((k) => /^contrib\.privacy\.s\d+\.h$/.test(k)), bodies = Object.keys(l).filter((k) => /^contrib\.privacy\.s\d+\.p$/.test(k));
      expect(heads).toHaveLength(9); expect(bodies).toHaveLength(9);
      const body = [...heads, ...bodies].map((k) => l[k]).join(" ");
      if (l === ja) for (const w of ["ニックネーム", "クルーNo.", "写真", "撮影位置", "公開しません", "顔", "ナンバー", "非独占的", "削除", "気仙沼地域戦略", "IPアドレスも保存しません", "16歳未満"]) expect([w, body.includes(w)]).toEqual([w, true]);
      else for (const w of ["nickname", "クルーNo.", "photos", "never published", "Faces", "number plates", "non-exclusive", "deletion", "気仙沼地域戦略", "do not store your IP address", "under 16"]) expect([w, body.toLowerCase().includes(w.toLowerCase())]).toEqual([w, true]);
      expect(l["contrib.privacy.contact"]).toContain("{contact}"); expect(JSON.stringify(l)).not.toContain("{{");
      expect(l["contrib.privacy.selfdel"].length).toBeGreaterThan(20);   // (the data can be deleted from マイ投稿 even before the team names a contact)
    }
  });
});
