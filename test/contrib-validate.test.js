// Contributor backend: input validation (every parser returns {ok, value} or {ok: false, error, message}).
import { describe, test, expect } from "bun:test";
import {
  normalizeCrewNo, maskCrewNo, cleanNickname, defaultNickname, cleanNote, cleanReviewerNote, parseCategory, parseKind, parseStatus, parseLang,
  isConsent, parsePoints, parseVersion, parseIntParam, parsePose, parseDateRange, parseRangeBound, normalizeTransferCode, formatTransferCode,
} from "../server/contrib/validate.js";
import { latLonToEnu } from "../server/contrib/geo.js";

const ZWSP = String.fromCodePoint(0x200b), RLO = String.fromCodePoint(0x202e), BOM = String.fromCodePoint(0xfeff);
const err = (r) => (r.ok ? null : r.error);

describe("クルーNo.", () => {
  test("exactly 14 digits; dashes, spaces and full-width digits are accepted and normalised away", () => {
    expect(normalizeCrewNo("12345678901234")).toEqual({ ok: true, value: "12345678901234" });
    expect(normalizeCrewNo("1234-5678-9012-34").value).toBe("12345678901234");
    expect(normalizeCrewNo(" 1234 5678 9012 34 ").value).toBe("12345678901234");
    expect(normalizeCrewNo("１２３４－５６７８－９０１２－３４").value).toBe("12345678901234");
    expect(normalizeCrewNo("1234‐5678‐9012‐34").value).toBe("12345678901234"); // U+2010 hyphen
    expect(normalizeCrewNo("1234ー5678ー9012ー34").value).toBe("12345678901234"); // prolonged-sound mark typed as a dash
    expect(normalizeCrewNo("00001234567890").value).toBe("00001234567890"); // leading zeros are kept
  });
  test("absent or blank means no number", () => {
    for (const v of [null, undefined, "", "   "]) expect(normalizeCrewNo(v)).toEqual({ ok: true, value: null });
  });
  test("anything else is invalid_crew_no: wrong length, letters, numbers, objects", () => {
    for (const v of ["1234567890123", "123456789012345", "1234-5678-9012-3x", "abcdefghijklmn", "---", 12345678901234, {}, [], true]) {
      expect(err(normalizeCrewNo(v))).toBe("invalid_crew_no");
    }
  });
  test("a masked form keeps only the last four digits", () => {
    expect(maskCrewNo("12345678901234")).toBe("••••••••••1234");
    expect(maskCrewNo(null)).toBeNull();
    expect(maskCrewNo("123")).toBeNull();
  });
});

describe("nickname", () => {
  test("trimmed, whitespace collapsed, NFC, any script", () => {
    expect(cleanNickname("  Sakura   Kesen  ").value).toBe("Sakura Kesen");
    expect(cleanNickname("さくら").value).toBe("さくら");
    expect(cleanNickname("e" + String.fromCodePoint(0x301)).value).toBe(String.fromCodePoint(0xe9)); // NFC composes
    expect(cleanNickname("ｶﾀｶﾅ").value).toBe("ｶﾀｶﾅ"); // not folded: NFC only
  });
  test("control, zero-width and bidi-override characters are removed", () => {
    expect(cleanNickname(`a${ZWSP}b${RLO}c${BOM}d\u0007e`).value).toBe("abcde");
    expect(cleanNickname(`${ZWSP}${RLO}`)).toEqual({ ok: true, value: null }); // nothing left: use the default
  });
  test("24 characters at most, counted as characters (an emoji is one)", () => {
    expect(cleanNickname("a".repeat(24)).ok).toBe(true);
    expect(err(cleanNickname("a".repeat(25)))).toBe("invalid_nickname");
    expect(cleanNickname("😀".repeat(24)).ok).toBe(true);
    expect(err(cleanNickname("😀".repeat(25)))).toBe("invalid_nickname");
    expect(cleanNickname("あ".repeat(24)).ok).toBe(true);
  });
  test("links and e-mail addresses are refused (the leaderboard is public)", () => {
    for (const bad of ["http://evil.example", "https://x", "www.spam", "buy at shop.com", "me@example.org", "a.b@c.jp"]) expect(err(cleanNickname(bad))).toBe("invalid_nickname");
    expect(cleanNickname("Mr. Sakura").ok).toBe(true);
    expect(cleanNickname("@sakura_kesen").ok).toBe(true);
  });
  test("blank means the generated default; non-strings are refused", () => {
    for (const v of [null, undefined, "", "  "]) expect(cleanNickname(v)).toEqual({ ok: true, value: null });
    for (const v of [5, {}, [], true]) expect(err(cleanNickname(v))).toBe("invalid_nickname");
  });
  test("the default nickname is Guest- plus four letters or digits of the id", () => {
    expect(defaultNickname("RjiUV-PGrrGXER_K")).toBe("Guest-RJIU");
    expect(defaultNickname("-_")).toBe("Guest-0000");
    expect(defaultNickname("abcd1234")).toMatch(/^Guest-[A-Z0-9]{4}$/);
  });
});

describe("notes", () => {
  test("CRLF becomes LF, control characters go, newlines and tabs stay, the result is trimmed", () => {
    expect(cleanNote("  line1\r\nline2\rline3\u0000\u0007 \t ").value).toBe("line1\nline2\nline3");
    expect(cleanNote(`a${ZWSP}b`).value).toBe("ab");
    expect(cleanNote(null)).toEqual({ ok: true, value: "" });
    expect(cleanNote(undefined).value).toBe("");
  });
  test("2,000 characters at most (code points), and a clear error code", () => {
    expect(cleanNote("a".repeat(2000)).ok).toBe(true);
    expect(err(cleanNote("a".repeat(2001)))).toBe("note_too_long");
    expect(cleanNote("😀".repeat(2000)).ok).toBe(true);
    expect(err(cleanNote("😀".repeat(2001)))).toBe("note_too_long");
    expect(err(cleanNote(42))).toBe("note_too_long");
  });
  test("reviewer notes are limited to 1,000", () => {
    expect(cleanReviewerNote("x".repeat(1000)).ok).toBe(true);
    expect(cleanReviewerNote("x".repeat(1001)).ok).toBe(false);
  });
});

describe("enums and scalars", () => {
  test("category: the six spec values, default other", () => {
    for (const c of ["building", "road", "shop", "sign", "landmark", "other"]) expect(parseCategory(c)).toEqual({ ok: true, value: c });
    expect(parseCategory(undefined).value).toBe("other");
    expect(parseCategory("").value).toBe("other");
    expect(err(parseCategory("bridge"))).toBe("invalid_category");
    expect(err(parseCategory("Building"))).toBe("invalid_category");
  });
  test("kind: issue or fix, absent is null so the caller can infer it", () => {
    expect(parseKind("issue").value).toBe("issue");
    expect(parseKind("fix").value).toBe("fix");
    expect(parseKind(undefined).value).toBeNull();
    expect(parseKind("").value).toBeNull();
    expect(err(parseKind("bug"))).toBe("invalid_kind");
  });
  test("status: new, accepted, used, rejected", () => {
    for (const s of ["new", "accepted", "used", "rejected"]) expect(parseStatus(s).ok).toBe(true);
    expect(err(parseStatus("pending"))).toBe("invalid_status");
    expect(err(parseStatus(undefined))).toBe("invalid_status");
  });
  test("lang is a short language tag, lower-cased", () => {
    expect(parseLang("ja").value).toBe("ja");
    expect(parseLang("EN-us").value).toBe("en-us");
    expect(parseLang(undefined).value).toBeNull();
    for (const bad of ["japanese", "j", "ja_JP", "<script>", "1234"]) expect(err(parseLang(bad))).toBe("invalid_lang");
  });
  test("consent accepts 1, true, on, yes and nothing else", () => {
    for (const v of ["1", "true", "TRUE", "on", "yes", true, 1, " 1 "]) expect(isConsent(v)).toBe(true);
    for (const v of ["0", "false", "", "no", "2", null, undefined, false, 0, "maybe"]) expect(isConsent(v)).toBe(false);
  });
  test("points are integers from 0 to 10,000; numeric strings are accepted; absent is null", () => {
    expect(parsePoints(10).value).toBe(10);
    expect(parsePoints("25").value).toBe(25);
    expect(parsePoints(0).value).toBe(0);
    expect(parsePoints(undefined).value).toBeNull();
    for (const bad of [-1, 10001, 1.5, "1.5", "abc", NaN, Infinity, {}, [], true]) expect(err(parsePoints(bad))).toBe("invalid_points");
  });
  test("version is a release tag or commit: 1-64 safe characters", () => {
    for (const ok of ["v0.5.0", "2026-10-12", "df15fdd", "release/2026.10", "v1.2.3+build.5"]) expect(parseVersion(ok).value).toBe(ok);
    expect(parseVersion("  v1  ").value).toBe("v1");
    expect(parseVersion(undefined).value).toBeNull();
    expect(parseVersion("").value).toBeNull();
    expect(parseVersion("v1\n").value).toBe("v1"); // trailing whitespace from a shell substitution is trimmed
    for (const bad of ["v 1", "-x", "a".repeat(65), "x;rm", "v1/../x y", {}, 5]) expect(err(parseVersion(bad))).toBe("invalid_version");
  });
  test("integer query parameters fall back to the default and clamp", () => {
    expect(parseIntParam("20", 5, 1, 100)).toBe(20);
    expect(parseIntParam("500", 5, 1, 100)).toBe(100);
    expect(parseIntParam("-4", 5, 1, 100)).toBe(1);
    expect(parseIntParam("abc", 5, 1, 100)).toBe(5);
    expect(parseIntParam(undefined, 5, 1, 100)).toBe(5);
    expect(parseIntParam("7.9", 5, 1, 100)).toBe(7);
  });
});

describe("pose", () => {
  const full = { enu: [12.5, 1.6, -34], latlon: [38.9063, 141.5751], heading: 120, pitch: -3, fov: 60, mode: "walk", at: "2026-10-04T05:23:05.000Z", appVersion: "0.1.0", layoutVersion: "v6", timePreset: "noon", season: "autumn", viewport: { w: 390, h: 844, dpr: 3 } };

  test("a full pose from the app is kept as is", () => {
    const r = parsePose(full);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual(full);
  });
  test("a JSON string is accepted (multipart form fields are strings)", () => {
    expect(parsePose(JSON.stringify(full)).value.mode).toBe("walk");
    expect(err(parsePose("{nope"))).toBe("invalid_pose");
    expect(err(parsePose("x".repeat(9000)))).toBe("invalid_pose");
  });
  test("a missing latlon is computed from enu with the app's frame, and the other way round", () => {
    const a = parsePose({ enu: [86.744, 2, 111.014] }).value;
    expect(a.latlon[0]).toBeCloseTo(38.906 - 0.001, 9);
    expect(a.latlon[1]).toBeCloseTo(141.575 + 0.001, 9);
    const b = parsePose({ latlon: [38.9065, 141.5752] }).value;
    const e = latLonToEnu(38.9065, 141.5752);
    expect(b.enu[0]).toBeCloseTo(e.x, 9);
    expect(b.enu[2]).toBeCloseTo(e.z, 9);
    expect(b.enu[1]).toBe(0);
  });
  test("it needs enu or latlon, and they must be numbers in range", () => {
    expect(err(parsePose({}))).toBe("invalid_pose");
    expect(err(parsePose({ heading: 10 }))).toBe("invalid_pose");
    for (const bad of [{ enu: [1, 2] }, { enu: ["a", 1, 2] }, { enu: [NaN, 1, 2] }, { enu: [2e6, 0, 0] }, { enu: "x" }, { latlon: [91, 0] }, { latlon: [0, 181] }, { latlon: [1] }, { latlon: ["x", "y"] }]) {
      expect(err(parsePose(bad))).toBe("invalid_pose");
    }
    for (const bad of [null, [], 5, true]) expect(err(parsePose(bad))).toBe("invalid_pose");
  });
  test("heading wraps into [0, 360); pitch is clamped to [-90, 90]; fov must be in (0, 180]", () => {
    expect(parsePose({ ...full, heading: 370 }).value.heading).toBe(10);
    expect(parsePose({ ...full, heading: -90 }).value.heading).toBe(270);
    expect(parsePose({ ...full, heading: 360 }).value.heading).toBe(0);
    expect(parsePose({ ...full, pitch: -90.00000000000001 }).value.pitch).toBe(-90);
    expect(parsePose({ ...full, pitch: 91 }).value.pitch).toBe(90);
    expect(err(parsePose({ ...full, pitch: 200 }))).toBe("invalid_pose");
    expect(err(parsePose({ ...full, fov: 0 }))).toBe("invalid_pose");
    expect(err(parsePose({ ...full, fov: 181 }))).toBe("invalid_pose");
    expect(parsePose({ ...full, fov: 180 }).ok).toBe(true);
    expect(err(parsePose({ ...full, heading: "north" }))).toBe("invalid_pose");
  });
  test("mode is a short word; `at` is a plausible time; text fields are short", () => {
    expect(parsePose({ ...full, mode: "Drone" }).value.mode).toBe("drone");
    expect(err(parsePose({ ...full, mode: "walk; DROP TABLE" }))).toBe("invalid_pose");
    expect(parsePose({ ...full, at: Date.UTC(2026, 9, 4) }).value.at).toBe("2026-10-04T00:00:00.000Z");
    expect(err(parsePose({ ...full, at: "yesterday" }))).toBe("invalid_pose");
    expect(err(parsePose({ ...full, at: 12 }))).toBe("invalid_pose");
    expect(err(parsePose({ ...full, appVersion: "v".repeat(65) }))).toBe("invalid_pose");
  });
  test("viewport and unknown keys survive only as small primitives", () => {
    const r = parsePose({ ...full, viewport: [390, 844], extraNote: "hello", flag: true, nested: { a: 1 }, nul: null, "bad key!": 1 }).value;
    expect(r.viewport).toEqual([390, 844]);
    expect(r.extraNote).toBe("hello");
    expect(r.flag).toBe(true);
    expect(r.nested).toBeUndefined();
    expect(r.nul).toBeUndefined();
    expect(r["bad key!"]).toBeUndefined();
    expect(parsePose({ ...full, viewport: { a: { deep: 1 }, b: 2 } }).value.viewport).toEqual({ b: 2 }); // nested objects are dropped
  });
});

describe("date ranges (JST days)", () => {
  const JST = 9 * 3600 * 1000;
  test("a plain date is a Japan Standard Time day: from is 00:00 JST, to covers that whole day", () => {
    expect(new Date(parseRangeBound("2026-10-05", "from")).toISOString()).toBe("2026-10-04T15:00:00.000Z");
    expect(new Date(parseRangeBound("2026-10-05", "to")).toISOString()).toBe("2026-10-05T15:00:00.000Z"); // exclusive bound = next midnight JST
    const r = parseDateRange("2026-10-01", "2026-10-07");
    expect(r.value).toEqual({ fromIso: "2026-09-30T15:00:00.000Z", toIso: "2026-10-07T15:00:00.000Z" });
  });
  test("a timestamp with an offset or Z is that instant; without one it is read as JST", () => {
    expect(new Date(parseRangeBound("2026-10-05T10:30:00+09:00", "from")).toISOString()).toBe("2026-10-05T01:30:00.000Z");
    expect(new Date(parseRangeBound("2026-10-05T10:30:00Z", "from")).toISOString()).toBe("2026-10-05T10:30:00.000Z");
    expect(new Date(parseRangeBound("2026-10-05T10:30", "from")).toISOString()).toBe("2026-10-05T01:30:00.000Z");
    expect(new Date(parseRangeBound("2026-10-05T10:30:00-05:00", "from")).toISOString()).toBe("2026-10-05T15:30:00.000Z");
    expect(new Date(parseRangeBound("2026-10-05T10:30:00.5+0900", "from")).toISOString()).toBe("2026-10-05T01:30:00.500Z");
    // "to" is inclusive for the caller, so the exclusive bound is one millisecond later
    expect(parseRangeBound("2026-10-05T10:30:00Z", "to") - parseRangeBound("2026-10-05T10:30:00Z", "from")).toBe(1);
  });
  test("it never depends on the machine's time zone", () => {
    const t = parseRangeBound("2026-01-01", "from");
    expect(t).toBe(Date.UTC(2025, 11, 31, 15, 0, 0));
    expect(t % (24 * 3600 * 1000)).toBe(15 * 3600 * 1000);
    expect(JST).toBe(32400000);
  });
  test("impossible dates and ranges are refused; both bounds are optional", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "2026-10-05T25:00", "tomorrow", "2026/10/05", "20261005"]) expect(err(parseDateRange(bad, null))).toBe("invalid_range");
    expect(err(parseDateRange("2026-10-07", "2026-10-01"))).toBe("invalid_range");
    expect(parseDateRange(null, null).value).toEqual({ fromIso: null, toIso: null });
    expect(parseDateRange("", "").value).toEqual({ fromIso: null, toIso: null });
    expect(parseDateRange("2026-10-05", "2026-10-05").ok).toBe(true);
    expect(parseDateRange("2026-10-05", undefined).value.toIso).toBeNull();
  });
});

describe("transfer codes", () => {
  test("ten Crockford characters; case, spaces, dashes and look-alikes (O/I/L) are forgiven", () => {
    expect(normalizeTransferCode("K7QM2-XHD9P").value).toBe("K7QM2XHD9P");
    expect(normalizeTransferCode("k7qm2 xhd9p").value).toBe("K7QM2XHD9P");
    expect(normalizeTransferCode(" k7qm-2xhd-9p ").value).toBe("K7QM2XHD9P");
    expect(normalizeTransferCode("OIL0OIL0OI").value).toBe("0110011001");
    expect(normalizeTransferCode("ＫＱ７Ｍ２ＸＨＤ９Ｐ").value).toBe("KQ7M2XHD9P");
  });
  test("anything else is code_malformed", () => {
    for (const bad of ["", "K7QM2", "K7QM2XHD9PX", "K7QM2-XHD9U", "K7QM2-XHD9!", 12345, null, undefined, {}]) expect(err(normalizeTransferCode(bad))).toBe("code_malformed");
  });
  test("a code is shown in two groups of five", () => {
    expect(formatTransferCode("K7QM2XHD9P")).toBe("K7QM2-XHD9P");
  });
});
