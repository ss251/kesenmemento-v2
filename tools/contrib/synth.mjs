// Synthetic images for the contributor backend's tests, smoke test and demos.
//
// Nothing here is a real photograph: scenes are drawn from SVG shapes, and every EXIF value (camera, position,
// time) is made up by the caller. Used by test/contrib-*.test.js and tools/contrib/smoke.sh.
//
//   import { synthJpeg, synthScreenshot, synthHeic } from "../../tools/contrib/synth.mjs";
//   const jpg = await synthJpeg({ lat: 38.9065, lon: 141.5752, takenAt: "2026:10:04 14:23:05", offset: "+09:00" });
//
// CLI (writes a file, prints nothing else):
//   env -u NODE_OPTIONS bun tools/contrib/synth.mjs photo out.jpg [lat lon]      JPEG with GPS EXIF
//   env -u NODE_OPTIONS bun tools/contrib/synth.mjs screenshot out.png            1600x900 PNG with a klc-pose chunk
import sharp from "sharp";
import { enuToLatLon } from "../../server/contrib/geo.js";

/** Degrees as the EXIF rational triple sharp's withExif expects: "D/1 M/1 S/1000000". */
export function dmsRational(deg) {
  const a = Math.abs(deg), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
  return `${d}/1 ${m}/1 ${Math.round(s * 1e6)}/1000000`; // 1e-6 arc-second: about 3e-5 m
}

/** A recognisable street-ish scene drawn from SVG rectangles; `seed` varies the colours between images. */
function sceneSvg(width, height, seed = 0) {
  const hue = (seed * 47) % 360;
  const bld = (i) => {
    const w = Math.round(width * (0.08 + ((i * 7 + seed) % 5) * 0.02)), h = Math.round(height * (0.25 + ((i * 13 + seed) % 6) * 0.07));
    const x = Math.round(i * (width / 7) + ((i * 11) % 9)), y = Math.round(height * 0.7 - h);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="hsl(${(hue + i * 25) % 360},35%,${38 + (i % 3) * 8}%)"/>` +
      `<rect x="${x + 6}" y="${y + 8}" width="${Math.max(4, w - 12)}" height="${Math.max(4, Math.round(h * 0.12))}" fill="hsl(50,80%,80%)"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${200 + (seed % 30)},70%,70%)"/><stop offset="1" stop-color="hsl(${30 + (seed % 20)},60%,85%)"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/>
    <circle cx="${Math.round(width * 0.82)}" cy="${Math.round(height * 0.18)}" r="${Math.round(height * 0.07)}" fill="#ffe9a8"/>
    ${Array.from({ length: 7 }, (_, i) => bld(i)).join("")}
    <rect y="${Math.round(height * 0.7)}" width="${width}" height="${Math.round(height * 0.3)}" fill="#59606b"/>
    <rect x="0" y="${Math.round(height * 0.84)}" width="${width}" height="${Math.max(2, Math.round(height * 0.012))}" fill="#f2f2f2"/>
  </svg>`;
}

/**
 * @typedef {object} SynthOptions
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [seed] colour variation
 * @property {number} [lat] with `lon`: writes GPS EXIF
 * @property {number} [lon]
 * @property {number} [enuX] alternative to lat/lon: an ENU position of the app's frame
 * @property {number} [enuZ]
 * @property {number} [alt] metres
 * @property {number} [heading] GPSImgDirection, degrees
 * @property {"T" | "M"} [headingRef]
 * @property {string} [takenAt] EXIF form "YYYY:MM:DD HH:MM:SS" (camera wall-clock)
 * @property {string} [offset] OffsetTimeOriginal such as "+09:00"
 * @property {string} [gpsDate] GPSDateStamp "YYYY:MM:DD"
 * @property {string} [gpsTime] GPSTimeStamp "H/1 M/1 S/1"
 * @property {string} [make]
 * @property {string} [model]
 * @property {number} [focal35] FocalLengthIn35mmFilm
 * @property {number} [orientation] EXIF orientation 1-8
 * @property {boolean} [noExif] write no EXIF at all
 */

/** @param {SynthOptions} o */
function exifFor(o) {
  const IFD0 = {}, IFD2 = {}, IFD3 = {};
  if (o.make !== null) IFD0.Make = o.make ?? "SynthCam";
  if (o.model !== null) IFD0.Model = o.model ?? "SC-1 (synthetic)";
  if (o.takenAt) IFD2.DateTimeOriginal = o.takenAt;
  if (o.offset) IFD2.OffsetTimeOriginal = o.offset;
  if (o.focal35) IFD2.FocalLengthIn35mmFilm = String(o.focal35);
  let { lat, lon } = o;
  if (lat === undefined && o.enuX !== undefined) ({ lat, lon } = enuToLatLon(o.enuX, o.enuZ ?? 0));
  if (lat !== undefined && lon !== undefined) {
    IFD3.GPSLatitudeRef = lat < 0 ? "S" : "N";
    IFD3.GPSLatitude = dmsRational(lat);
    IFD3.GPSLongitudeRef = lon < 0 ? "W" : "E";
    IFD3.GPSLongitude = dmsRational(lon);
    if (o.alt !== undefined) { IFD3.GPSAltitudeRef = o.alt < 0 ? "1" : "0"; IFD3.GPSAltitude = `${Math.round(Math.abs(o.alt) * 100)}/100`; }
    if (o.heading !== undefined) { IFD3.GPSImgDirectionRef = o.headingRef ?? "T"; IFD3.GPSImgDirection = `${Math.round(o.heading * 100)}/100`; }
    if (o.gpsDate) IFD3.GPSDateStamp = o.gpsDate;
    if (o.gpsTime) IFD3.GPSTimeStamp = o.gpsTime;
  }
  const out = {};
  if (Object.keys(IFD0).length) out.IFD0 = IFD0;
  if (Object.keys(IFD2).length) out.IFD2 = IFD2;
  if (Object.keys(IFD3).length) out.IFD3 = IFD3;
  return out;
}

/** @param {SynthOptions} o */
function pipeline(o, format) {
  let img = sharp(Buffer.from(sceneSvg(o.width ?? 640, o.height ?? 480, o.seed ?? 0)));
  const ex = o.noExif ? {} : exifFor(o);
  if (Object.keys(ex).length) img = img.withExif(ex);
  if (o.orientation && !o.noExif) img = img.withMetadata({ orientation: o.orientation });
  return format === "png" ? img.png() : format === "webp" ? img.webp({ quality: 80 }) : img.jpeg({ quality: 80 });
}

/**
 * libexif (behind sharp's withExif) cannot write GPSAltitudeRef = 1, so a below-sea-level fixture is patched: the
 * GPS IFD entry (tag 0x0005, BYTE, count 1) is found by its signature and its value byte set to 1.
 */
function markBelowSeaLevel(jpg) {
  const sig = Buffer.from([0x05, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // little-endian IFD entry
  const i = jpg.indexOf(sig);
  if (i >= 0) jpg[i + 8] = 1;
  return jpg;
}

/** JPEG with optional EXIF (GPS, time, camera, orientation). @param {SynthOptions} [o] @returns {Promise<Buffer>} */
export async function synthJpeg(o = {}) {
  const jpg = await pipeline(o, "jpeg").toBuffer();
  return o.alt !== undefined && o.alt < 0 && !o.noExif ? markBelowSeaLevel(jpg) : jpg;
}
/** PNG (sharp writes PNG EXIF when given). @param {SynthOptions} [o] */
export const synthPng = (o = {}) => pipeline({ noExif: true, ...o }, "png").toBuffer();
/** WebP. @param {SynthOptions} [o] */
export const synthWebp = (o = {}) => pipeline(o, "webp").toBuffer();

// ------------------------------------------------------------------------------------------------ PNG tEXt

let CRC_TABLE = null;
export function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Insert a tEXt chunk (key, latin-1 text) after IHDR, the way the app's photo mode embeds `klc-pose`. */
export function addPngText(png, key, text) {
  const data = Buffer.concat([Buffer.from(key, "latin1"), Buffer.from([0]), Buffer.from(text, "latin1")]);
  const type = Buffer.from("tEXt", "latin1");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  const at = 8 + 4 + 4 + 13 + 4; // signature + IHDR chunk
  return Buffer.concat([png.subarray(0, at), len, type, data, crc, png.subarray(at)]);
}

/**
 * What the app's report sheet uploads as `screenshot`: a 1,600 px wide view. JPEG by default; `png: true` adds a
 * `klc-pose` tEXt chunk with the pose JSON, like the app's photo mode.
 * @param {{width?: number, height?: number, seed?: number, png?: boolean, pose?: object}} [o]
 */
export async function synthScreenshot({ width = 1600, height = 900, seed = 3, png = false, pose } = {}) {
  const base = sharp(Buffer.from(sceneSvg(width, height, seed)));
  if (!png) return base.jpeg({ quality: 78 }).toBuffer();
  const buf = await base.png().toBuffer();
  return pose ? addPngText(buf, "klc-pose", JSON.stringify(pose)) : buf;
}

// ------------------------------------------------------------------------------------------------- HEIC

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(8 + body.length), Buffer.from(type, "latin1"), body]); };
const full = (type, ver, flags, ...parts) => box(type, Buffer.from([ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts);

/**
 * A minimal HEIC container: an `ftyp heic` box, a `meta` box listing an HEVC image item and an Exif item, and an
 * `mdat` with placeholder image data plus the real EXIF block of a synthetic JPEG. There are no HEVC pixels, so
 * sharp cannot decode it (exactly what happens with an iPhone photo on a build without an HEVC decoder), but
 * exifr reads the EXIF from it like from a real HEIC.
 * @param {SynthOptions} [o] EXIF content, as for synthJpeg
 * @returns {Promise<Buffer>}
 */
export async function synthHeic(o = {}) {
  const jpg = await synthJpeg({ width: 64, height: 48, ...o });
  const i = jpg.indexOf(Buffer.from("Exif\0\0", "latin1"));
  const tiff = i < 0 ? Buffer.alloc(0) : jpg.subarray(i + 6, i - 2 + jpg.readUInt16BE(i - 2));
  const exifItem = Buffer.concat([u32(6), Buffer.from("Exif\0\0", "latin1"), tiff]);
  const imgItem = Buffer.alloc(32, 0x42);
  const ftyp = box("ftyp", Buffer.from("heic", "latin1"), u32(0), Buffer.from("heic", "latin1"), Buffer.from("mif1", "latin1"));
  const hdlr = full("hdlr", 0, 0, u32(0), Buffer.from("pict", "latin1"), Buffer.alloc(12), Buffer.from("\0"));
  const pitm = full("pitm", 0, 0, u16(1));
  const infe = (id, type) => full("infe", 2, 0, u16(id), u16(0), Buffer.from(type, "latin1"), Buffer.from("\0"));
  const iinf = full("iinf", 0, 0, u16(2), infe(1, "hvc1"), infe(2, "Exif"));
  const ent = (id, off, len) => Buffer.concat([u16(id), u16(0), u16(1), u32(off), u32(len)]);
  const meta = (a, b) => box("meta", Buffer.from([0, 0, 0, 0]), hdlr, pitm, iinf, full("iloc", 0, 0, Buffer.from([0x44, 0x00]), u16(2), ent(1, a, imgItem.length), ent(2, b, exifItem.length)));
  const start = ftyp.length + meta(0, 0).length + 8;
  return Buffer.concat([ftyp, meta(start, start + imgItem.length), box("mdat", imgItem, exifItem)]);
}

/** A file that starts like a HEIC but holds no image at all. */
export const junkHeic = () => Buffer.concat([u32(24), Buffer.from("ftypheic", "latin1"), Buffer.alloc(120, 7)]);

/** Bytes that are not an image, behind a header the caller may fake: `fakeJpeg` prefixes the JPEG signature. */
export function notAnImage({ fakeJpeg = false, size = 2048 } = {}) {
  const b = Buffer.alloc(size, 0x41);
  if (fakeJpeg) Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(b);
  return b;
}


/** A PNG whose header claims `width` x `height` pixels but holds no pixel data: a decompression-bomb stand-in. */
export function synthPngBomb(width = 30000, height = 30000) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, "latin1");
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0; // 8-bit grey
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])), chunk("IEND", Buffer.alloc(0))]);
}

// -------------------------------------------------------------------------------------------------- CLI

if (import.meta.main) {
  const [kind, out, a, b] = process.argv.slice(2);
  if (!kind || !out || !["photo", "screenshot"].includes(kind)) {
    console.error("usage: bun tools/contrib/synth.mjs photo <out.jpg> [lat lon] | screenshot <out.png>");
    process.exit(2);
  }
  const buf = kind === "photo"
    ? await synthJpeg({ lat: a ? Number(a) : 38.9065, lon: b ? Number(b) : 141.5752, alt: 4.2, heading: 120, takenAt: "2026:10:04 14:23:05", offset: "+09:00", focal35: 26, seed: 5 })
    : await synthScreenshot({ png: true, pose: { enu: [12, 1.6, -34], latlon: [38.9063, 141.5751], heading: 120, pitch: -3, fov: 60, mode: "walk" } });
  await Bun.write(out, buf);
}
