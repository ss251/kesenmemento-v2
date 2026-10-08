// Contributor backend: the image pipeline.
//
//   sniffImage      magic bytes decide what a file is (the client's content-type and file name are never trusted)
//   inspectImage    decodability, pixel size and EXIF orientation via sharp
//   makePreview     1,280 px JPEG with all metadata stripped (the only form of a photo an admin page shows by default)
//   makeThumb       small JPEG for the admin list
//   readExif        EXIF through exifr: GPS, time, heading, camera, lens (a fixed whitelist: no serial numbers or owner names)
//
// HEIC: the prebuilt sharp binary has no HEVC decoder, so an iPhone photo usually cannot be decoded here. The
// original is kept, `preview` comes back null with a note, and the EXIF (which exifr reads from the HEIC
// container directly) is still extracted.
import sharp from "sharp";
import exifr from "exifr";
import { latLonToEnu, isUsableLatLon } from "./geo.js";

// libvips caches decoded operations; a long-running service with large uploads is better off without it
sharp.cache(false);

/**
 * Default largest image (in pixels) sharp will decode: 64 megapixels. A phone photo is at most about 50 MP, and
 * the 15 MB file limit rules out anything much bigger that is not a decompression bomb. MAX_IMAGE_MP overrides it
 * (the app passes config.maxPixels as `opts.maxPixels`).
 */
export const MAX_PIXELS = 64_000_000;

/** @typedef {{type: "jpeg" | "png" | "webp" | "heic", mime: string, ext: string}} ImageKind */

/** @type {Record<string, ImageKind>} */
export const KINDS = Object.freeze({
  jpeg: { type: "jpeg", mime: "image/jpeg", ext: "jpg" },
  png: { type: "png", mime: "image/png", ext: "png" },
  webp: { type: "webp", mime: "image/webp", ext: "webp" },
  heic: { type: "heic", mime: "image/heic", ext: "heic" },
});

const HEIC_MAJOR = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);
const HEIF_GENERIC = new Set(["mif1", "msf1"]);
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const ascii = (b, from, to) => String.fromCharCode(...b.subarray(from, to));

/**
 * Identify an image by its first bytes. JPEG, PNG, WebP and HEIC are recognised; everything else (GIF, SVG, AVIF,
 * PDF, HTML disguised with an image name...) is null.
 * @param {Uint8Array} b
 * @returns {ImageKind | null}
 */
export function sniffImage(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return KINDS.jpeg;
  if (PNG_SIG.every((v, i) => b[i] === v)) return KINDS.png;
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return KINDS.webp;
  if (ascii(b, 4, 8) === "ftyp") {
    const major = ascii(b, 8, 12);
    if (HEIC_MAJOR.has(major)) return KINDS.heic;
    if (HEIF_GENERIC.has(major)) {
      // a generic HEIF container is HEIC only when it lists an HEVC brand among its compatible brands
      const size = Math.min(b.length, (b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]) >>> 0 || 0, 512);
      for (let i = 16; i + 4 <= size; i += 4) if (HEIC_MAJOR.has(ascii(b, i, i + 4))) return KINDS.heic;
    }
  }
  return null;
}

/**
 * Cheap structural check of a HEIF container, used because a HEIC often cannot be decoded here: walk the
 * top-level boxes (size + four-character type) and require a well-formed `ftyp`, `meta` and `mdat`. Garbage that
 * merely starts with the `ftypheic` signature fails; a genuine iPhone file passes whether or not it can be decoded.
 * @param {Uint8Array} b
 */
export function heicStructureOk(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pos = 0;
  const seen = new Set();
  for (let n = 0; n < 64 && pos + 8 <= b.length; n++) {
    let size = dv.getUint32(pos);
    const type = ascii(b, pos + 4, pos + 8);
    if (!/^[\x20-\x7e]{4}$/.test(type)) return false;
    if (size === 1) { if (pos + 16 > b.length) return false; size = Number(dv.getBigUint64(pos + 8)); }
    else if (size === 0) size = b.length - pos;
    if (size < 8 || pos + size > b.length) return false;
    seen.add(type);
    pos += size;
    if (pos === b.length) break;
  }
  return pos === b.length && seen.has("ftyp") && seen.has("meta") && seen.has("mdat");
}

/** sharp options shared by every decode: hostile-input limits and tolerant of harmless warnings. */
const decodeOpts = (maxPixels = MAX_PIXELS) => ({ failOn: "error", limitInputPixels: maxPixels, sequentialRead: true });

/** Display dimensions after EXIF orientation (orientations 5-8 swap width and height). */
function orientedSize(meta) {
  const { width, height, orientation } = meta;
  if (!width || !height) return { width: null, height: null };
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

/**
 * Read the header of an image with sharp.
 * @param {Uint8Array} bytes
 * @param {{maxPixels?: number}} [opts]
 * @returns {Promise<{ok: true, width: number | null, height: number | null, orientation: number | null, format: string | undefined} | {ok: false, reason: string}>}
 */
export async function inspectImage(bytes, { maxPixels } = {}) {
  try {
    const meta = await sharp(bytes, decodeOpts(maxPixels)).metadata();
    return { ok: true, ...orientedSize(meta), orientation: meta.orientation ?? null, format: meta.format };
  } catch (e) {
    return { ok: false, reason: shortReason(e) };
  }
}

/** First line of an error message, bounded: libvips errors can run to dozens of lines. */
function shortReason(e) {
  return String(e?.message ?? e).split("\n")[0].replace(/[\u0000-\u001F]/g, " ").slice(0, 160);
}

/**
 * JPEG preview, longest edge `maxEdge`, orientation applied, colour converted to sRGB, every metadata block
 * (EXIF, GPS, ICC, XMP) removed. A transparent PNG is flattened onto white.
 * @param {Uint8Array} bytes
 * @param {number} [maxEdge]
 * @param {number} [quality]
 * @param {{maxPixels?: number}} [opts]
 * @returns {Promise<{ok: true, bytes: Buffer, width: number, height: number} | {ok: false, reason: string}>}
 */
export async function makePreview(bytes, maxEdge = 1280, quality = 82, { maxPixels } = {}) {
  try {
    const { data, info } = await sharp(bytes, decodeOpts(maxPixels))
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, bytes: data, width: info.width, height: info.height };
  } catch (e) {
    return { ok: false, reason: shortReason(e) };
  }
}

/** Small list thumbnail (360 px wide by default). Same guarantees as makePreview. */
export const makeThumb = (bytes, edge = 360, opts = {}) => makePreview(bytes, edge, 70, opts);

// ---------------------------------------------------------------------------------------------------- EXIF

const EXIF_PICK = [
  "Make", "Model", "LensModel", "Software", "Orientation",
  "DateTimeOriginal", "CreateDate", "OffsetTimeOriginal", "OffsetTime", "OffsetTimeDigitized",
  "FocalLength", "FocalLengthIn35mmFormat", "FNumber", "ExposureTime", "ISO",
  "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef", "GPSAltitude", "GPSAltitudeRef",
  "GPSImgDirection", "GPSImgDirectionRef", "GPSDateStamp", "GPSTimeStamp", "GPSHPositioningError",
  "latitude", "longitude",
];

const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const textOrNull = (v, max = 64) => {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
  return s ? s.slice(0, max) : null;
};
const firstByte = (v) => (v && typeof v === "object" ? v[0] : v);

/** [degrees, minutes, seconds] or a plain number to signed decimal degrees. */
function dmsToDegrees(v, ref, negativeRefs) {
  let deg = null;
  if (Array.isArray(v) && v.length >= 2 && v.every((x) => typeof x === "number" && Number.isFinite(x))) deg = v[0] + v[1] / 60 + (v[2] ?? 0) / 3600;
  else if (typeof v === "number" && Number.isFinite(v)) deg = v;
  if (deg === null) return null;
  return typeof ref === "string" && negativeRefs.includes(ref.trim().toUpperCase()) ? -Math.abs(deg) : deg;
}

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

/**
 * EXIF capture time as an ISO-8601 string that keeps the camera's wall-clock reading.
 * The zone comes from OffsetTimeOriginal when present; otherwise it is derived from the GPS UTC time stamp when
 * that agrees with the clock to within a few minutes; otherwise the string has no zone (a naive local time).
 * @returns {{takenAt: string, zone: "exif-offset" | "gps" | "unknown"} | null}
 */
export function parseTakenAt(raw) {
  const dt = typeof raw.DateTimeOriginal === "string" ? raw.DateTimeOriginal : typeof raw.CreateDate === "string" ? raw.CreateDate : null;
  const m = dt && EXIF_DATE.exec(dt);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const c = new Date(asUtc);
  if (y < 1990 || y > 2100 || c.getUTCMonth() !== mo - 1 || c.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null;
  const local = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;

  const off = [raw.OffsetTimeOriginal, raw.OffsetTime, raw.OffsetTimeDigitized].find((o) => typeof o === "string" && /^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(o.trim()));
  if (off) return { takenAt: local + off.trim(), zone: "exif-offset" };

  // GPS date/time are UTC: the gap to the camera's clock is the zone offset, in multiples of 15 minutes
  const gd = typeof raw.GPSDateStamp === "string" ? /^(\d{4}):(\d{2}):(\d{2})$/.exec(raw.GPSDateStamp.trim()) : null;
  const gt = Array.isArray(raw.GPSTimeStamp) && raw.GPSTimeStamp.length === 3 && raw.GPSTimeStamp.every((x) => typeof x === "number") ? raw.GPSTimeStamp : null;
  if (gd && gt) {
    const gpsUtc = Date.UTC(+gd[1], +gd[2] - 1, +gd[3], gt[0], gt[1], Math.floor(gt[2]));
    const diffMin = (asUtc - gpsUtc) / 60000;
    const snapped = Math.round(diffMin / 15) * 15;
    if (Math.abs(diffMin - snapped) <= 3 && Math.abs(snapped) <= 14 * 60) {
      const sign = snapped < 0 ? "-" : "+", a = Math.abs(snapped);
      return { takenAt: `${local}${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`, zone: "gps" };
    }
  }
  return { takenAt: local, zone: "unknown" };
}

/**
 * @typedef {object} PhotoExif
 * @property {Record<string, unknown>} exif sanitised, whitelisted summary stored as `exif_json`
 * @property {number | null} lat
 * @property {number | null} lon
 * @property {number | null} enuX
 * @property {number | null} enuZ
 * @property {string | null} takenAt
 * @property {number | null} heading degrees clockwise from north, [0, 360)
 */

/**
 * Parse the EXIF of an image (JPEG, PNG, WebP, HEIC, TIFF) into the fields the survey uses. Never throws: a file
 * without EXIF, or with damaged EXIF, gives empty fields.
 * Only a fixed whitelist is kept: GPS, capture time, heading, orientation, camera make/model/lens, focal length,
 * exposure. Serial numbers, owner names, maker notes, thumbnails and XMP are not read at all.
 * @param {Uint8Array} bytes
 * @returns {Promise<PhotoExif>}
 */
export async function readExif(bytes) {
  const empty = { exif: {}, lat: null, lon: null, enuX: null, enuZ: null, takenAt: null, heading: null };
  let raw;
  try {
    raw = await exifr.parse(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
      tiff: true, ifd0: true, exif: true, gps: true, interop: false, ifd1: false,
      makerNote: false, userComment: false, xmp: false, icc: false, iptc: false, jfif: false, ihdr: false,
      mergeOutput: true, translateKeys: true, translateValues: false, reviveValues: false, sanitize: true,
      silentErrors: true, pick: EXIF_PICK,
    });
  } catch {
    return empty;
  }
  if (!raw || typeof raw !== "object") return empty;

  const exif = {};
  const make = textOrNull(raw.Make), model = textOrNull(raw.Model), lens = textOrNull(raw.LensModel, 80), software = textOrNull(raw.Software);
  if (make) exif.make = make;
  if (model) exif.model = model;
  if (lens) exif.lens = lens;
  if (software) exif.software = software;
  const orientation = numOrNull(raw.Orientation);
  if (orientation) exif.orientation = orientation;
  for (const [key, name] of [["focalLengthMm", "FocalLength"], ["focalLength35mm", "FocalLengthIn35mmFormat"], ["fNumber", "FNumber"], ["exposureS", "ExposureTime"], ["iso", "ISO"]]) {
    const v = numOrNull(raw[name]);
    if (v !== null) exif[key] = v;
  }

  const t = parseTakenAt(raw);
  if (t) { exif.takenAt = t.takenAt; exif.takenAtZone = t.zone; }

  let lat = dmsToDegrees(raw.GPSLatitude, raw.GPSLatitudeRef, ["S"]);
  let lon = dmsToDegrees(raw.GPSLongitude, raw.GPSLongitudeRef, ["W"]);
  if (lat === null || lon === null) { lat = numOrNull(raw.latitude); lon = numOrNull(raw.longitude); }
  let enuX = null, enuZ = null, heading = null;
  if (lat !== null && lon !== null && isUsableLatLon(lat, lon)) {
    const e = latLonToEnu(lat, lon);
    enuX = e.x; enuZ = e.z;
    const gps = { lat, lon };
    const alt = numOrNull(raw.GPSAltitude);
    if (alt !== null) gps.altM = firstByte(raw.GPSAltitudeRef) === 1 ? -Math.abs(alt) : alt;
    const hd = numOrNull(raw.GPSImgDirection);
    if (hd !== null && hd >= 0 && hd <= 360) {
      heading = hd % 360;
      gps.headingDeg = heading;
      const ref = textOrNull(raw.GPSImgDirectionRef, 1);
      if (ref) gps.headingRef = ref.toUpperCase();
    }
    const acc = numOrNull(raw.GPSHPositioningError);
    if (acc !== null && acc >= 0) gps.accuracyM = acc;
    exif.gps = gps;
    exif.enu = { x: enuX, z: enuZ };
  } else {
    lat = null; lon = null;
    // a heading can exist without a position (compass only)
    const hd = numOrNull(raw.GPSImgDirection);
    if (hd !== null && hd >= 0 && hd <= 360) heading = hd % 360;
  }
  return { exif, lat, lon, enuX, enuZ, takenAt: t?.takenAt ?? null, heading };
}

/**
 * Everything the submission pipeline needs to know about one uploaded photo.
 * @param {Uint8Array} bytes
 * @param {ImageKind} kind from sniffImage
 * @param {{maxPixels?: number}} [opts]
 * @returns {Promise<{ok: true, width: number | null, height: number | null, preview: {bytes: Buffer, width: number, height: number} | null, exif: PhotoExif, notes: string[]} | {ok: false, reason: string}>}
 */
export async function processPhoto(bytes, kind, opts = {}) {
  const notes = [];
  const info = await inspectImage(bytes, opts);
  let preview = null;
  let width = info.ok ? info.width : null, height = info.ok ? info.height : null;
  if (kind.type === "heic") {
    if (!heicStructureOk(bytes)) return { ok: false, reason: "not a valid HEIC container" };
    // sharp may or may not have an HEVC decoder (the prebuilt one has none): try, and degrade gracefully
    const p = info.ok ? await makePreview(bytes, 1280, 82, opts) : { ok: false, reason: info.reason };
    if (p.ok) preview = { bytes: p.bytes, width: p.width, height: p.height };
    else notes.push("no-preview: this HEIC could not be decoded on the server; the original is kept");
  } else {
    if (!info.ok) return { ok: false, reason: info.reason };
    const p = await makePreview(bytes, 1280, 82, opts);
    if (!p.ok) return { ok: false, reason: p.reason };
    preview = { bytes: p.bytes, width: p.width, height: p.height };
  }
  const exif = await readExif(bytes);
  if (notes.length) exif.exif.notes = notes;
  return { ok: true, width, height, preview, exif, notes };
}
