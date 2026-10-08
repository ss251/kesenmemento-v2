// Contributor backend: input validation and normalisation.
//
// Every function here is pure. A parser returns `{ ok: true, value }` or `{ ok: false, error, message }`, where
// `error` is a stable machine code (listed in docs/contrib/API.md) and `message` is a short English sentence for
// developers. Nothing in this file touches the network or the database.
import { CATEGORIES, KINDS, STATUSES } from "./config.js";
import { cpLength, stripUnsafeChars, clamp } from "./util.js";
import { latLonToEnu, enuToLatLon } from "./geo.js";

const ok = (value) => ({ ok: true, value });
const bad = (error, message) => ({ ok: false, error, message });

export const NICKNAME_MAX = 24;
export const NOTE_MAX = 2000;
export const REVIEWER_NOTE_MAX = 1000;
export const POINTS_MAX = 10000;

// --------------------------------------------------------------------------------------------------- crew number

// hyphen-likes people type or paste: ASCII, U+2010..2015, minus sign, prolonged-sound mark (full and half width)
const CREW_SEPARATORS = /[\s\-\u2010-\u2015\u2212\u30FC\uFF70\uFF0D]/g;

/**
 * Normalise a クルーNo.: exactly 14 digits, dashes and spaces accepted, full-width digits accepted.
 * `null`, `undefined` and blank mean "no number" and give `{ ok: true, value: null }`.
 * @param {unknown} input
 * @returns {{ok: true, value: string | null} | {ok: false, error: string, message: string}}
 */
export function normalizeCrewNo(input) {
  if (input === null || input === undefined) return ok(null);
  if (typeof input !== "string" || input.length > 200) return bad("invalid_crew_no", "crewNo must be a string of 14 digits");
  const trimmed = stripUnsafeChars(input.normalize("NFKC")).trim();
  if (trimmed === "") return ok(null);
  const digits = trimmed.replace(CREW_SEPARATORS, "");
  if (!/^[0-9]{14}$/.test(digits)) return bad("invalid_crew_no", "crewNo must be exactly 14 digits (dashes allowed)");
  return ok(digits);
}

/** "12345678901234" -> "••••••••••••34": enough for a reviewer to see a number was given, not enough to use it. */
export function maskCrewNo(crewNo) {
  return typeof crewNo === "string" && crewNo.length === 14 ? "•".repeat(10) + crewNo.slice(-4) : null;
}

// ------------------------------------------------------------------------------------------------------ nickname

const NICKNAME_BLOCK = /(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|net|org|jp|info|xyz|ru|cn)\b|\S+@\S+\.\S+)/i;

/**
 * Clean a nickname for the public leaderboard: NFC, no control or bidi characters, collapsed spaces, at most
 * 24 characters, no links or e-mail addresses. Blank means "use the generated default" (`value: null`).
 * @param {unknown} input
 */
export function cleanNickname(input) {
  if (input === null || input === undefined) return ok(null);
  if (typeof input !== "string") return bad("invalid_nickname", "nickname must be a string");
  if (input.length > NICKNAME_MAX * 8) return bad("invalid_nickname", `nickname must be at most ${NICKNAME_MAX} characters`); // before any normalising work
  const s = stripUnsafeChars(input.normalize("NFC")).replace(/\s+/g, " ").trim();
  if (s === "") return ok(null);
  if (cpLength(s) > NICKNAME_MAX) return bad("invalid_nickname", `nickname must be at most ${NICKNAME_MAX} characters`);
  if (NICKNAME_BLOCK.test(s)) return bad("invalid_nickname", "nickname must not contain a link or an e-mail address");
  return ok(s);
}

/** The nickname given to a contributor who chose none: Guest-XXXX from the id (letters and digits only). */
export function defaultNickname(contributorId) {
  const tail = String(contributorId).replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase().padEnd(4, "0");
  return `Guest-${tail}`;
}

// ------------------------------------------------------------------------------------------------- free text

/**
 * Clean free text (a note): NFC, no control characters except newline and tab, CRLF folded to LF, trimmed.
 * @param {unknown} input
 * @param {number} max maximum length in Unicode code points
 * @param {string} errorCode
 * @param {string} label
 */
export function cleanText(input, max, errorCode, label) {
  if (input === null || input === undefined) return ok("");
  if (typeof input !== "string") return bad(errorCode, `${label} must be a string`);
  // refuse an absurd text before normalising it: a 99 MB "note" must not cost the event loop seconds
  if (input.length > max * 8 + 64) return bad(errorCode, `${label} must be at most ${max} characters`);
  const s = stripUnsafeChars(input.normalize("NFC").replace(/\r\n?/g, "\n"), true).trim();
  if (cpLength(s) > max) return bad(errorCode, `${label} must be at most ${max} characters`);
  return ok(s);
}

export const cleanNote = (input) => cleanText(input, NOTE_MAX, "note_too_long", "note");
export const cleanReviewerNote = (input) => cleanText(input, REVIEWER_NOTE_MAX, "note_too_long", "reviewerNote");

// ---------------------------------------------------------------------------------------------------- enums

/** @param {unknown} v @param {string} [def] */
export function parseCategory(v, def = "other") {
  if (v === undefined || v === null || v === "") return ok(def);
  return typeof v === "string" && CATEGORIES.includes(v) ? ok(v) : bad("invalid_category", `category must be one of ${CATEGORIES.join(", ")}`);
}

/** @param {unknown} v @returns {{ok: true, value: string | null} | {ok: false, error: string, message: string}} null when absent */
export function parseKind(v) {
  if (v === undefined || v === null || v === "") return ok(null);
  return typeof v === "string" && KINDS.includes(v) ? ok(v) : bad("invalid_kind", `kind must be one of ${KINDS.join(", ")}`);
}

/** @param {unknown} v */
export function parseStatus(v) {
  return typeof v === "string" && STATUSES.includes(v) ? ok(v) : bad("invalid_status", `status must be one of ${STATUSES.join(", ")}`);
}

/** A language tag such as "ja" or "en" (BCP 47 shape, lower-cased); blank is `null`. */
export function parseLang(v) {
  if (v === undefined || v === null || v === "") return ok(null);
  if (typeof v !== "string" || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(v)) return bad("invalid_lang", "lang must be a language tag such as ja or en");
  return ok(v.toLowerCase());
}

/** `consent=1` (also "true", "on", "yes", boolean true): anything else is a refusal. */
export function isConsent(v) {
  if (v === true || v === 1) return true;
  return typeof v === "string" && /^(?:1|true|on|yes)$/i.test(v.trim());
}

/**
 * Points for a review: an integer from 0 to 10000. Strings of digits are accepted (form fields).
 * `undefined` / `null` give `{ value: null }` so the caller can apply a default.
 */
export function parsePoints(v) {
  if (v === undefined || v === null || v === "") return ok(null);
  const n = typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > POINTS_MAX) return bad("invalid_points", `points must be an integer from 0 to ${POINTS_MAX}`);
  return ok(n);
}

/** A release tag or commit (v0.5.0, 2026-10-12, df15fdd, release/2026.10): 1-64 safe characters. */
export function parseVersion(v) {
  if (v === undefined || v === null || v === "") return ok(null);
  if (typeof v !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._+@/-]{0,63}$/.test(v.trim())) return bad("invalid_version", "version must be 1-64 characters: letters, digits and . _ + @ / -");
  return ok(v.trim());
}

/** Query-string integer with default and bounds; garbage falls back to the default. */
export function parseIntParam(v, def, min, max) {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? clamp(Math.trunc(n), min, max) : def;
}

// ----------------------------------------------------------------------------------------------------- pose

const POSE_MODES = /^[a-z][a-z0-9_-]{0,23}$/i;
const PRIMITIVE_KEYS = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

/** A finite number, optionally parsed from a numeric string. */
function num(v) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Short printable string without control characters; null when absent or not a string. */
function shortStr(v, max) {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = stripUnsafeChars(String(v)).trim();
  return s && s.length <= max ? s : null;
}

/** Keep a small JSON value made only of primitives (used for `viewport` and unknown pose keys). */
function smallValue(v, depth = 0) {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") { const s = stripUnsafeChars(v).slice(0, 100); return s; }
  if (depth >= 1) return undefined;
  if (Array.isArray(v)) {
    const out = v.slice(0, 6).map((x) => smallValue(x, depth + 1)).filter((x) => x !== undefined);
    return out;
  }
  if (typeof v === "object") {
    const out = {};
    let n = 0;
    for (const [k, x] of Object.entries(v)) {
      if (n >= 10) break;
      if (!PRIMITIVE_KEYS.test(k)) continue;
      const s = smallValue(x, depth + 1);
      if (s !== undefined) { out[k] = s; n++; }
    }
    return out;
  }
  return undefined;
}

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * An ISO-8601 timestamp as epoch milliseconds. Without a zone designator it is UTC (never the machine's local
 * time, which `Date.parse` would use). NaN for anything else or an impossible date.
 * @param {string} s
 */
export function parseInstantUtc(s) {
  const m = INSTANT.exec(String(s).trim());
  if (!m) return NaN;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +m[4], +m[5]], sec = m[6] ? +m[6] : 0, ms = m[7] ? +m[7].padEnd(3, "0") : 0;
  if (h > 23 || mi > 59 || sec > 59) return NaN;
  const t = Date.UTC(y, mo - 1, d, h, mi, sec, ms);
  const c = new Date(t);
  if (c.getUTCFullYear() !== y || c.getUTCMonth() !== mo - 1 || c.getUTCDate() !== d) return NaN;
  const zone = m[8];
  if (!zone || zone.toUpperCase() === "Z") return t;
  const digits = zone.slice(1).replace(":", "");
  const offMin = +digits.slice(0, 2) * 60 + +digits.slice(2);
  if (+digits.slice(0, 2) > 14 || +digits.slice(2) > 59) return NaN;
  return t - (zone[0] === "-" ? -1 : 1) * offMin * 60000;
}

const KNOWN_POSE_KEYS = new Set(["enu", "latlon", "heading", "pitch", "fov", "mode", "at", "appVersion", "layoutVersion", "timePreset", "season", "viewport"]);

/**
 * Validate and normalise the camera pose the app sends with a report:
 * `{enu:[x,y,z], latlon:[lat,lon], heading, pitch, fov, mode, at, appVersion, layoutVersion, timePreset, season, viewport}`.
 * Whichever of `enu` / `latlon` is missing is computed from the other with the app's frame, so a stored pose
 * always has both. Heading is wrapped into [0, 360), pitch clamped to [-90, 90]; fov must be in (0, 180].
 * Unknown keys survive only as small primitives (the app may grow new fields).
 * @param {unknown} input an object, or a JSON string of one
 */
export function parsePose(input) {
  let p = input;
  if (typeof p === "string") {
    if (p.length > 8192) return bad("invalid_pose", "pose is too large");
    try { p = JSON.parse(p); } catch { return bad("invalid_pose", "pose must be valid JSON"); }
  }
  if (p === null || typeof p !== "object" || Array.isArray(p)) return bad("invalid_pose", "pose must be a JSON object");

  const out = {};
  let enu = null, latlon = null;
  if (p.enu !== undefined && p.enu !== null) {
    if (!Array.isArray(p.enu) || p.enu.length !== 3) return bad("invalid_pose", "pose.enu must be [x, y, z]");
    const v = p.enu.map(num);
    if (v.some((n) => n === null)) return bad("invalid_pose", "pose.enu must contain numbers");
    const [x, y, z] = v;
    if (Math.abs(x) > 1e6 || Math.abs(z) > 1e6 || y < -1000 || y > 100000) return bad("invalid_pose", "pose.enu is out of range");
    enu = [x, y, z];
  }
  if (p.latlon !== undefined && p.latlon !== null) {
    if (!Array.isArray(p.latlon) || p.latlon.length !== 2) return bad("invalid_pose", "pose.latlon must be [lat, lon]");
    const v = p.latlon.map(num);
    if (v.some((n) => n === null) || Math.abs(v[0]) > 90 || Math.abs(v[1]) > 180) return bad("invalid_pose", "pose.latlon must be [lat, lon] in degrees");
    latlon = v;
  }
  if (!enu && !latlon) return bad("invalid_pose", "pose needs enu or latlon");
  if (enu && !latlon) { const { lat, lon } = enuToLatLon(enu[0], enu[2]); latlon = [lat, lon]; }
  if (!enu && latlon) { const { x, z } = latLonToEnu(latlon[0], latlon[1]); enu = [x, 0, z]; }
  out.enu = enu; out.latlon = latlon;

  if (p.heading !== undefined && p.heading !== null) {
    const h = num(p.heading);
    if (h === null || Math.abs(h) > 1e5) return bad("invalid_pose", "pose.heading must be a number of degrees");
    out.heading = ((h % 360) + 360) % 360;
  }
  if (p.pitch !== undefined && p.pitch !== null) {
    const v = num(p.pitch);
    if (v === null || Math.abs(v) > 180) return bad("invalid_pose", "pose.pitch must be a number of degrees");
    out.pitch = clamp(v, -90, 90);
  }
  if (p.fov !== undefined && p.fov !== null) {
    const v = num(p.fov);
    if (v === null || v <= 0 || v > 180) return bad("invalid_pose", "pose.fov must be a number of degrees in (0, 180]");
    out.fov = v;
  }
  if (p.mode !== undefined && p.mode !== null) {
    const m = shortStr(p.mode, 24);
    if (!m || !POSE_MODES.test(m)) return bad("invalid_pose", "pose.mode must be a short word such as walk, drive, fly, drone or sail");
    out.mode = m.toLowerCase();
  }
  if (p.at !== undefined && p.at !== null) {
    const t = typeof p.at === "number" ? p.at : typeof p.at === "string" ? parseInstantUtc(p.at) : NaN;
    if (!Number.isFinite(t) || t < Date.UTC(2020, 0, 1) || t > Date.UTC(2100, 0, 1)) return bad("invalid_pose", "pose.at must be an ISO timestamp or epoch milliseconds");
    out.at = new Date(t).toISOString();
  }
  for (const k of ["appVersion", "layoutVersion", "timePreset", "season"]) {
    if (p[k] === undefined || p[k] === null) continue;
    const s = shortStr(p[k], 64);
    if (s === null) return bad("invalid_pose", `pose.${k} must be a short string`);
    out[k] = s;
  }
  if (p.viewport !== undefined && p.viewport !== null) {
    const vp = smallValue(p.viewport);
    if (vp !== undefined) out.viewport = vp;
  }
  let extra = 0;
  for (const [k, v] of Object.entries(p)) {
    if (KNOWN_POSE_KEYS.has(k) || extra >= 12 || !PRIMITIVE_KEYS.test(k)) continue;
    if (v === null || typeof v === "object") continue;
    const s = smallValue(v);
    if (s !== undefined) { out[k] = s; extra++; }
  }
  return ok(out);
}

// ----------------------------------------------------------------------------------------------- date ranges

const JST_OFFSET_MS = 9 * 3600 * 1000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/** Epoch ms for a calendar date at 00:00 JST, or NaN for an impossible date such as 2026-02-30. */
function jstMidnight(y, m, d) {
  const t = Date.UTC(y, m - 1, d);
  const c = new Date(t);
  if (c.getUTCFullYear() !== y || c.getUTCMonth() !== m - 1 || c.getUTCDate() !== d) return NaN;
  return t - JST_OFFSET_MS;
}

/**
 * Parse one bound of a date range.
 *   "2026-10-05"                a calendar day in JST: start = 00:00 JST, end = the same day's last millisecond
 *   "2026-10-05T10:30" / "...:00+09:00" / "...Z"   an instant; without an offset it is read as JST
 * Never uses the machine's time zone.
 * @param {string} s
 * @param {"from" | "to"} edge
 * @returns {number} epoch milliseconds (an exclusive upper bound for "to"), or NaN when it does not parse
 */
export function parseRangeBound(s, edge) {
  const str = String(s).trim();
  let m = DATE_ONLY.exec(str);
  if (m) {
    const start = jstMidnight(+m[1], +m[2], +m[3]);
    return edge === "from" ? start : start + 24 * 3600 * 1000;
  }
  m = DATE_TIME.exec(str);
  if (!m) return NaN;
  const base = jstMidnight(+m[1], +m[2], +m[3]);
  if (Number.isNaN(base)) return NaN;
  const hh = +m[4], mm = +m[5], ss = m[6] ? +m[6] : 0, ms = m[7] ? +m[7].padEnd(3, "0") : 0;
  if (hh > 23 || mm > 59 || ss > 59) return NaN;
  let t = base + ((hh * 60 + mm) * 60 + ss) * 1000 + ms; // as if the clock reading were JST
  const zone = m[8];
  if (zone && zone.toUpperCase() === "Z") t += JST_OFFSET_MS;
  else if (zone) {
    const sign = zone[0] === "-" ? -1 : 1, digits = zone.slice(1).replace(":", "");
    const off = sign * ((+digits.slice(0, 2)) * 60 + +digits.slice(2)) * 60 * 1000;
    t += JST_OFFSET_MS - off;
  }
  return edge === "to" ? t + 1 : t; // "to" is inclusive for the caller, exclusive here
}

/**
 * Parse optional `from` / `to` query values into ISO strings usable in `reviewed_at >= ? AND reviewed_at < ?`.
 * @param {string | null | undefined} from
 * @param {string | null | undefined} to
 * @returns {{ok: true, value: {fromIso: string | null, toIso: string | null}} | {ok: false, error: string, message: string}}
 */
export function parseDateRange(from, to) {
  let fromIso = null, toIso = null;
  if (from !== null && from !== undefined && from !== "") {
    const t = parseRangeBound(from, "from");
    if (Number.isNaN(t)) return bad("invalid_range", "from must be YYYY-MM-DD or an ISO timestamp");
    fromIso = new Date(t).toISOString();
  }
  if (to !== null && to !== undefined && to !== "") {
    const t = parseRangeBound(to, "to");
    if (Number.isNaN(t)) return bad("invalid_range", "to must be YYYY-MM-DD or an ISO timestamp");
    toIso = new Date(t).toISOString();
  }
  if (fromIso && toIso && fromIso >= toIso) return bad("invalid_range", "from must be before to");
  return ok({ fromIso, toIso });
}

// ------------------------------------------------------------------------------------------ transfer codes

const CROCKFORD_MAP = { O: "0", I: "1", L: "1" };

/**
 * Normalise a transfer code typed by a person: upper-case, separators removed, O->0 and I/L->1 (Crockford),
 * full-width letters accepted. Valid codes are 10 characters of the Crockford alphabet.
 * @param {unknown} input
 */
export function normalizeTransferCode(input) {
  if (typeof input !== "string") return bad("code_malformed", "code must be a string");
  const s = stripUnsafeChars(input.normalize("NFKC")).toUpperCase().replace(/[\s\-_.]/g, "").replace(/[OIL]/g, (c) => CROCKFORD_MAP[c]);
  if (!/^[0-9A-HJKMNP-TV-Z]{10}$/.test(s)) return bad("code_malformed", "code must be 10 letters and digits, e.g. K7QM2-XHD9P");
  return ok(s);
}

/** "K7QM2XHD9P" -> "K7QM2-XHD9P" */
export function formatTransferCode(code) {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}
