// Contributor backend: small shared helpers (random ids, hashing, constant-time compare, time, text).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** Crockford base32 without I, L, O, U: unambiguous when read aloud or copied by hand. */
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Random identifier of `bytes` random bytes in base64url. Never starts with "-" or "_" so it is safe as a
 * file name and as a command-line argument.
 * @param {number} [bytes]
 */
export function randomId(bytes = 12) {
  for (;;) {
    const s = randomBytes(bytes).toString("base64url");
    if (/^[A-Za-z0-9]/.test(s)) return s;
  }
}

/**
 * Random string of `n` Crockford base32 characters (5 bits each). Rejection-free: 256 is a multiple of 32.
 * @param {number} n
 * @param {boolean} [lower] lower-case output (used for ids that appear in file names and URLs)
 */
export function randomBase32(n, lower = false) {
  const b = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += CROCKFORD[b[i] & 31];
  return lower ? s.toLowerCase() : s;
}

/** True for a string that can be a contributor id or token secret (base64url, bounded length). */
export function isBase64Url(s, min = 8, max = 128) {
  return typeof s === "string" && s.length >= min && s.length <= max && BASE64URL.test(s);
}

/** HMAC-SHA256 of `message` keyed by `key`, as lower-case hex. */
export function hmacHex(key, message) {
  return createHmac("sha256", key).update(message).digest("hex");
}

/** SHA-256 of a string as a Buffer (fixed 32 bytes: compare these, never the raw strings). */
export function sha256(s) {
  return createHash("sha256").update(String(s)).digest();
}

/** Constant-time equality of two hex strings of the same length. False (not an exception) on a length mismatch. */
export function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || a.length % 2) return false;
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Constant-time equality of two arbitrary strings: both are hashed to 32 bytes first so length does not leak. */
export function safeEqualStr(a, b) {
  return timingSafeEqual(sha256(a), sha256(b));
}

/** ISO-8601 UTC timestamp with milliseconds; lexicographic order equals chronological order. */
export function iso(ms) {
  return new Date(ms).toISOString();
}

/** Remove control characters (keeping \n and \t only when `keepNewlines`) and bidi / zero-width formatting marks. */
export function stripUnsafeChars(s, keepNewlines = false) {
  // C0/C1 controls, DEL, zero-width and bidi override/isolate marks, BOM, line/paragraph separators
  const re = keepNewlines
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g
    : /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
  return s.replace(re, "");
}

/** Length in Unicode code points (what a person counts as characters; emoji count once). */
export function cpLength(s) {
  let n = 0;
  for (const _ of s) n++; // eslint-disable-line no-unused-vars
  return n;
}

/** First `n` code points of `s`. */
export function cpSlice(s, n) {
  let out = "", i = 0;
  for (const ch of s) { if (i++ >= n) break; out += ch; }
  return out;
}

/** JSON.parse that returns `fallback` instead of throwing. */
export function parseJson(text, fallback = null) {
  if (typeof text !== "string" || !text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

/** Promise-friendly sleep (tests inject a clock instead of using this). */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `n` clamped into [lo, hi]. */
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Create a private data directory (mode 0700). When this call creates a new top-level directory (the ./.contrib
 * default under a checkout, say) it also drops a `.gitignore` containing `*` there, so a database, uploads or
 * personal photos can never be committed by accident.
 * @param {string} dir
 */
export function makeDataDir(dir) {
  const created = mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (created) {
    try { writeFileSync(join(created, ".gitignore"), "*\n", { flag: "wx" }); } catch { /* exists or read-only: fine */ }
  }
}
