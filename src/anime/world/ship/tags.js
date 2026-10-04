// [ship:acts] Catch-documentation tags for the game's bluefin (pure; tested in test/ship-acts.test.js).
//
// The real 第一昭福丸 tags every Atlantic bluefin with a blue strap tag carrying a serial number and an embedded chip:
// "FY2020 East Atlantic Bluefin / 7KFY-20-0001" with a QR sticker (Usui's slide 72, raw/ref/usufuku-slides/IMG_0954.jpg;
// source notes section 5). The game must never print that format: every tag it makes carries a DEMO- prefix, so a
// screenshot of the game can never be mistaken for, or collide with, a real catch record.
//
//   formatTag(1)        -> 'DEMO-7KFY-26-0001'   (yy = the fishing year, 26 = FY2026, the season of the demo day)
//   isDemoTag(s)        -> true only for the DEMO form, never for a real one
//   REAL_TAG_RE         -> the real form (call sign, 2-digit year, 4-digit serial), anchored

export const CALL_SIGN = '7KFY';
export const DEMO_PREFIX = 'DEMO-';
/** The real tag form, e.g. 7KFY-20-0001 (anchored: a DEMO tag can never match it). */
export const REAL_TAG_RE = /^7KFY-\d{2}-\d{4}$/;
/** The game's tag form, e.g. DEMO-7KFY-26-0001. */
export const DEMO_TAG_RE = /^DEMO-7KFY-\d{2}-\d{4}$/;
export const TAG_MAX = 9999;

/** n: serial 1..9999; yy: 2-digit fishing year (0..99). Throws on anything else (a tag is never guessed). */
export function formatTag(n, yy = 26) {
  if (!Number.isInteger(n) || n < 1 || n > TAG_MAX) throw new RangeError(`tag serial must be an integer 1..${TAG_MAX}, got ${n}`);
  if (!Number.isInteger(yy) || yy < 0 || yy > 99) throw new RangeError(`tag year must be an integer 0..99, got ${yy}`);
  const s = `${DEMO_PREFIX}${CALL_SIGN}-${String(yy).padStart(2, '0')}-${String(n).padStart(4, '0')}`;
  // belt and braces: the result is a demo tag and not a real one
  if (!DEMO_TAG_RE.test(s) || REAL_TAG_RE.test(s)) throw new Error('tag format invariant broken: ' + s);
  return s;
}

/** True only for a well-formed DEMO tag (and never for the real form, with or without whitespace). */
export function isDemoTag(s) {
  if (typeof s !== 'string') return false;
  return DEMO_TAG_RE.test(s) && !REAL_TAG_RE.test(s);
}

/** The serial number of a demo tag (or null). */
export function tagSerial(s) {
  if (!isDemoTag(s)) return null;
  return Number(s.slice(-4));
}
