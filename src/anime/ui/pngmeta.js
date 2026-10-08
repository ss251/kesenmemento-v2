// [contrib] PNG tEXt chunks: photo mode writes the camera pose into its PNG (key "klc-pose") so a saved photo still knows where it was
// taken; the reader is for the round-trip test and for tools (tools/contrib/pull.mjs can read a pose back out of a shared photo).
//
//   crc32(bytes, prev = 0)                       CRC-32 (PNG / zlib), chainable
//   textChunk(key, text, { pad3 })               a complete tEXt chunk (length, type, data, CRC) as a Uint8Array
//   insertTextChunk(png, key, text)              Uint8Array -> Uint8Array: the chunk goes right after IHDR (an old chunk with that key is replaced)
//   readTextChunks(png) -> [{ key, text, crcOk }]   every tEXt chunk, in file order
//   readPngPose(png) -> object | null            the parsed "klc-pose" JSON
//   embedTextInBlob(blob, key, text) -> Blob     no copy of the pixels: Blob.slice around a new chunk (a 4K PNG is 10 MB or more)
//   embedTextInDataUrl(url, key, text) -> string the same for a data:image/png;base64 URL
//
// tEXt is Latin-1 by the PNG spec: the pose JSON is escaped to ASCII (core/pose.js poseToJson) before it gets here.
export const PNG_SIG = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
export const POSE_KEY = 'klc-pose';
const IHDR_END = 33;   // signature (8) + IHDR chunk (4 length + 4 type + 13 data + 4 CRC)

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

/** CRC-32 of `bytes`; pass the previous result as `prev` to continue over more data (crc32(b, crc32(a)) == crc32(a ++ b)). */
export function crc32(bytes, prev = 0) {
  let c = (prev ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
function latin1(s, what) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c > 255) throw new Error(`PNG tEXt ${what} is Latin-1 only (character U+${c.toString(16).toUpperCase().padStart(4, '0')})`); out[i] = c; }
  return out;
}
const u32 = (v) => Uint8Array.of(v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const readU32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** A PNG keyword: 1-79 Latin-1 characters, no NUL, no leading, trailing or doubled spaces. */
export function validKeyword(key) {
  return typeof key === 'string' && key.length >= 1 && key.length <= 79 && /^[\x20-\x7e\xa1-\xff]+$/.test(key) && !/^ | $|  /.test(key);
}

/**
 * A complete tEXt chunk. `pad3` pads the text with trailing spaces until the chunk's length is a multiple of 3, so that its base64 has no
 * padding and can be spliced into the middle of a base64 string (JSON ignores trailing spaces).
 */
export function textChunk(key, text, { pad3 = false } = {}) {
  if (!validKeyword(key)) throw new Error('PNG tEXt keyword must be 1-79 printable Latin-1 characters: ' + JSON.stringify(key));
  text = String(text);
  if (pad3) while ((12 + key.length + 1 + text.length) % 3) text += ' ';
  const data = new Uint8Array(key.length + 1 + text.length);
  data.set(latin1(key, 'keyword'), 0); data.set(latin1(text, 'text'), key.length + 1);
  const type = ascii('tEXt');
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0); out.set(type, 4); out.set(data, 8); out.set(u32(crc32(data, crc32(type))), 8 + data.length);
  return out;
}

function checkPng(png) {
  if (!(png instanceof Uint8Array) || png.length < IHDR_END + 12) throw new Error('not a PNG (too short)');
  for (let i = 0; i < 8; i++) if (png[i] !== PNG_SIG[i]) throw new Error('not a PNG (bad signature)');
  if (readU32(png, 8) !== 13 || String.fromCharCode(png[12], png[13], png[14], png[15]) !== 'IHDR') throw new Error('not a PNG (IHDR must come first)');
}

/** Walk the chunks: [{ type, start, end, dataStart, dataEnd }] up to and including IEND (a truncated file just stops). */
function chunks(png) {
  const out = [];
  let o = 8;
  while (o + 12 <= png.length) {
    const len = readU32(png, o), end = o + 12 + len;
    if (end > png.length) break;
    const type = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7]);
    out.push({ type, start: o, end, dataStart: o + 8, dataEnd: o + 8 + len });
    o = end;
    if (type === 'IEND') break;
  }
  return out;
}

/** Every tEXt chunk of a PNG: [{ key, text, crcOk }]. */
export function readTextChunks(png) {
  checkPng(png);
  const dec = new TextDecoder('latin1');
  const out = [];
  for (const c of chunks(png)) {
    if (c.type !== 'tEXt') continue;
    const data = png.subarray(c.dataStart, c.dataEnd), z = data.indexOf(0);
    if (z < 1) continue;
    const crcOk = readU32(png, c.dataEnd) === crc32(data, crc32(ascii('tEXt')));
    out.push({ key: dec.decode(data.subarray(0, z)), text: dec.decode(data.subarray(z + 1)), crcOk });
  }
  return out;
}

/** The PNG with a tEXt chunk added right after IHDR. A chunk that already has this keyword is dropped first. */
export function insertTextChunk(png, key, text, opts = {}) {
  checkPng(png);
  const chunk = textChunk(key, text, opts), dec = new TextDecoder('latin1');
  const parts = [png.subarray(0, IHDR_END), chunk];
  let from = IHDR_END;
  for (const c of chunks(png)) {
    if (c.start < IHDR_END || c.type !== 'tEXt') continue;
    const data = png.subarray(c.dataStart, c.dataEnd), z = data.indexOf(0);
    if (z >= 1 && dec.decode(data.subarray(0, z)) === key) { parts.push(png.subarray(from, c.start)); from = c.end; }
  }
  parts.push(png.subarray(from));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** The pose a photo carries (parsed "klc-pose" JSON), or null when it has none or it is not JSON. */
export function readPngPose(png) {
  const c = readTextChunks(png).find((x) => x.key === POSE_KEY && x.crcOk);
  if (!c) return null;
  try { return JSON.parse(c.text); } catch { return null; }
}

/** A PNG Blob with the chunk added. Only the first 33 bytes are read; the pixel data is shared with the original through Blob.slice. */
export async function embedTextInBlob(blob, key, text) {
  const head = new Uint8Array(await blob.slice(0, IHDR_END).arrayBuffer());
  const probe = new Uint8Array(IHDR_END + 12); probe.set(head);   // (checkPng wants room for a following chunk header)
  checkPng(probe);
  return new Blob([blob.slice(0, IHDR_END), textChunk(key, text), blob.slice(IHDR_END)], { type: 'image/png' });
}

const toBase64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x2000) s += String.fromCharCode(...bytes.subarray(i, i + 0x2000)); return btoa(s); };

/** A data:image/png;base64 URL with the chunk added (the first 33 bytes are exactly 44 base64 characters, so the splice needs no re-encoding). */
export function embedTextInDataUrl(url, key, text) {
  const m = /^data:image\/png;base64,/.exec(url);
  if (!m) throw new Error('not a PNG data URL');
  const b64 = url.slice(m[0].length), head = atob(b64.slice(0, 44));
  const probe = new Uint8Array(IHDR_END + 12); for (let i = 0; i < IHDR_END; i++) probe[i] = head.charCodeAt(i);
  checkPng(probe);
  return m[0] + b64.slice(0, 44) + toBase64(textChunk(key, text, { pad3: true })) + b64.slice(44);
}
