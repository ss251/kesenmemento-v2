// Image bytes from LINE. sharp is not used.
//
// LINE already re-encodes uploads. We still drop JPEG APP1 (EXIF and XMP) and PNG eXIf chunks so a
// location tucked into the file does not sit on disk. We do not decode pixels, so this is not a
// re-encode to a new JPEG. Width and height are read from the image header when it has one.
// WebP is stored as LINE served it. GIF width and height come from the header.

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function isSof(marker) {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * Drop JPEG APP1 segments. Returns null when the bytes are not a JPEG.
 * @param {Buffer} buf
 * @returns {{ bytes: Buffer, w: number | null, h: number | null } | null}
 */
export function stripJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  let w = null;
  let h = null;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) {
      parts.push(buf.subarray(i));
      break;
    }
    const marker = buf[i + 1];
    if (marker === 0xd9) {
      parts.push(buf.subarray(i, i + 2));
      break;
    }
    if (marker === 0xda) {
      parts.push(buf.subarray(i));
      break;
    }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > buf.length) {
      parts.push(buf.subarray(i));
      break;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) {
      parts.push(buf.subarray(i));
      break;
    }
    if (isSof(marker) && len >= 7) {
      h = buf.readUInt16BE(i + 5);
      w = buf.readUInt16BE(i + 7);
    }
    if (marker !== 0xe1) parts.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return { bytes: Buffer.concat(parts), w, h };
}

/**
 * Drop a PNG eXIf chunk. Returns null when the bytes are not a PNG.
 * @param {Buffer} buf
 */
export function stripPng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
  const parts = [buf.subarray(0, 8)];
  let i = 8;
  let w = null;
  let h = null;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString("latin1");
    const end = i + 12 + len;
    if (end > buf.length) break;
    if (type === "IHDR" && len >= 8) {
      w = buf.readUInt32BE(i + 8);
      h = buf.readUInt32BE(i + 12);
    }
    if (type !== "eXIf") parts.push(buf.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return { bytes: Buffer.concat(parts), w, h };
}

function isWebp(buf) {
  return buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP";
}

function isGif(buf) {
  const head = buf.subarray(0, 6).toString("latin1");
  return head === "GIF87a" || head === "GIF89a";
}

/**
 * @param {Buffer | Uint8Array} input
 * @returns {{ bytes: Buffer, mime: string, w: number | null, h: number | null }}
 */
export function prepareImage(input) {
  const buf = Buffer.from(input);
  if (buf.length === 0) throw fail("not_image");
  if (buf.length > MAX_IMAGE_BYTES) throw fail("too_big");
  const jpeg = stripJpeg(buf);
  if (jpeg) return { bytes: jpeg.bytes, mime: "image/jpeg", w: jpeg.w, h: jpeg.h };
  const png = stripPng(buf);
  if (png) return { bytes: png.bytes, mime: "image/png", w: png.w, h: png.h };
  if (isWebp(buf)) return { bytes: buf, mime: "image/webp", w: null, h: null };
  if (isGif(buf) && buf.length >= 10) {
    return { bytes: buf, mime: "image/gif", w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }
  throw fail("not_image");
}

/** A 1×1 JPEG with an APP1 EXIF payload, for tests and the local simulator. */
export function sampleJpeg({ exif = true, w = 1, h = 1 } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (exif) {
    const payload = Buffer.from("Exif\0\0FAKEGPS", "latin1");
    const seg = Buffer.alloc(4 + payload.length);
    seg[0] = 0xff;
    seg[1] = 0xe1;
    seg.writeUInt16BE(payload.length + 2, 2);
    payload.copy(seg, 4);
    parts.push(seg);
  }
  const sof = Buffer.alloc(19);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(11, 2);
  sof[4] = 8;
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  sof[9] = 1;
  sof[10] = 1;
  sof[11] = 0x11;
  sof[12] = 0;
  parts.push(sof.subarray(0, 13));
  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0xff, 0xd9]));
  return Buffer.concat(parts);
}
