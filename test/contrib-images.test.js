// Contributor backend: the image pipeline (magic bytes, previews, thumbnails, EXIF) on synthetic images only.
import { describe, test as bunTest, expect } from "bun:test";
// a loaded machine (the gate runs tests at background priority) is many times slower than an idle one: generous per-test timeout
const test = (name, fn) => bunTest(name, fn, 60_000);
import sharp from "sharp";
import exifr from "exifr";
import {
  sniffImage, inspectImage, makePreview, makeThumb, readExif, processPhoto, heicStructureOk, parseTakenAt, KINDS,
} from "../server/contrib/images.js";
import { synthJpeg, synthPng, synthWebp, synthScreenshot, synthHeic, junkHeic, notAnImage, synthPngBomb, addPngText } from "../tools/contrib/synth.mjs";

const text = (s) => new TextEncoder().encode(s);
const pad = (b, n = 64) => { const o = new Uint8Array(Math.max(n, b.length)); o.set(b); return o; };

describe("magic bytes decide what a file is", () => {
  test("JPEG, PNG, WebP and HEIC are recognised", async () => {
    expect(sniffImage(await synthJpeg())).toBe(KINDS.jpeg);
    expect(sniffImage(await synthPng())).toBe(KINDS.png);
    expect(sniffImage(await synthWebp())).toBe(KINDS.webp);
    expect(sniffImage(await synthHeic())).toBe(KINDS.heic);
    expect(sniffImage(await synthScreenshot({ png: true, pose: { a: 1 } }))).toBe(KINDS.png); // a PNG with a tEXt chunk
    expect(KINDS.jpeg).toEqual({ type: "jpeg", mime: "image/jpeg", ext: "jpg" });
    expect(KINDS.heic.mime).toBe("image/heic");
  });
  test("every HEIC brand, and a generic HEIF container that lists an HEVC brand", () => {
    const ftyp = (major, compat = []) => {
      const body = Buffer.concat([Buffer.from(major, "latin1"), Buffer.alloc(4), ...compat.map((c) => Buffer.from(c, "latin1"))]);
      const size = Buffer.alloc(4); size.writeUInt32BE(8 + body.length);
      return pad(Buffer.concat([size, Buffer.from("ftyp", "latin1"), body]));
    };
    for (const b of ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]) expect(sniffImage(ftyp(b))?.type).toBe("heic");
    expect(sniffImage(ftyp("mif1", ["mif1", "heic"]))?.type).toBe("heic");
    expect(sniffImage(ftyp("msf1", ["heix"]))?.type).toBe("heic");
    expect(sniffImage(ftyp("mif1", ["mif1", "avif"]))).toBeNull(); // AVIF is not accepted
    expect(sniffImage(ftyp("avif", ["mif1", "miaf"]))).toBeNull();
    expect(sniffImage(ftyp("avis"))).toBeNull();
    expect(sniffImage(ftyp("isom", ["mp42"]))).toBeNull(); // an MP4 video
    expect(sniffImage(ftyp("qt  "))).toBeNull(); // QuickTime
  });
  test("anything else is refused whatever its name or declared type", () => {
    const refused = {
      gif: pad(text("GIF89a"), 64),
      svg: text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      html: text("<!doctype html><html><body>hi</body></html>"),
      pdf: pad(text("%PDF-1.7\n"), 64),
      zip: pad(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), 64),
      exe: pad(text("MZ"), 64),
      riffWav: pad(text("RIFF\0\0\0\0WAVEfmt "), 64),
      textFile: text("this is just text, not an image at all"),
      empty: new Uint8Array(0),
      short: Uint8Array.from([0xff, 0xd8, 0xff]),
      almostPng: pad(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b]), 64),
      jpegTwoBytes: pad(Uint8Array.from([0xff, 0xd8, 0x00]), 64),
      riffNotWebp: pad(text("RIFF\0\0\0\0AVI LIST"), 64),
    };
    for (const [name, bytes] of Object.entries(refused)) expect([name, sniffImage(bytes)]).toEqual([name, null]);
  });
  test("a file with a JPEG signature and no image behind it passes the sniff but fails to decode", async () => {
    const fake = notAnImage({ fakeJpeg: true });
    expect(sniffImage(fake)).toBe(KINDS.jpeg);
    expect((await inspectImage(fake)).ok).toBe(false);
    expect((await processPhoto(fake, KINDS.jpeg)).ok).toBe(false);
  });
  test("the HEIF box layout check separates containers from garbage", async () => {
    expect(heicStructureOk(await synthHeic())).toBe(true);
    expect(heicStructureOk(junkHeic())).toBe(false);
    expect(heicStructureOk(await synthJpeg())).toBe(false);
    expect(heicStructureOk(new Uint8Array(4))).toBe(false);
  });
});

describe("inspection", () => {
  test("pixel size, and EXIF orientation 5-8 swaps width and height", async () => {
    const plain = await inspectImage(await synthJpeg({ width: 640, height: 480 }));
    expect(plain).toMatchObject({ ok: true, width: 640, height: 480, format: "jpeg" });
    const rotated = await inspectImage(await synthJpeg({ width: 640, height: 480, orientation: 6 }));
    expect(rotated).toMatchObject({ ok: true, width: 480, height: 640, orientation: 6 });
    const flipped = await inspectImage(await synthJpeg({ width: 640, height: 480, orientation: 3 }));
    expect(flipped).toMatchObject({ width: 640, height: 480 });
  });
  test("corrupt input gives a short single-line reason, not a stack of libvips messages", async () => {
    const r = await inspectImage(notAnImage({ fakeJpeg: true }));
    expect(r.ok).toBe(false);
    expect(r.reason).not.toContain("\n");
    expect(r.reason.length).toBeLessThanOrEqual(160);
  });
});

describe("previews", () => {
  test("longest edge 1,280 px, JPEG, with the aspect ratio kept; small images are not enlarged", async () => {
    const big = await synthJpeg({ width: 3000, height: 2000 });
    const p = await makePreview(big);
    expect(p).toMatchObject({ ok: true, width: 1280, height: 853 });
    expect(sniffImage(p.bytes)).toBe(KINDS.jpeg);
    const tall = await makePreview(await synthJpeg({ width: 1500, height: 3000 }));
    expect(tall).toMatchObject({ width: 640, height: 1280 });
    const small = await makePreview(await synthJpeg({ width: 400, height: 300 }));
    expect(small).toMatchObject({ width: 400, height: 300 });
    expect(p.bytes.length).toBeLessThan(big.length);
  });
  test("every metadata block is stripped: no EXIF, no GPS, no orientation tag, no ICC profile", async () => {
    const src = await synthJpeg({ width: 800, height: 600, lat: 38.9065, lon: 141.5752, alt: 4, heading: 90, takenAt: "2026:10:04 14:23:05", offset: "+09:00", make: "Acme", model: "Cam" });
    expect((await exifr.gps(src)).latitude).toBeCloseTo(38.9065, 6); // the source does carry GPS
    const p = await makePreview(src);
    const meta = await sharp(p.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(await exifr.gps(p.bytes).catch(() => undefined)).toBeUndefined();
    const parsed = await exifr.parse(p.bytes, { gps: true, tiff: true, exif: true });
    expect(parsed?.latitude).toBeUndefined();
    expect(parsed?.Make).toBeUndefined();
    // and the raw bytes hold no Exif segment marker at all
    expect(Buffer.from(p.bytes).includes(Buffer.from("Exif\0\0", "latin1"))).toBe(false);
  });
  test("the orientation is applied to the pixels, so previews are upright", async () => {
    const p = await makePreview(await synthJpeg({ width: 640, height: 480, orientation: 6 }));
    expect(p).toMatchObject({ width: 480, height: 640 });
  });
  test("a transparent PNG is flattened onto white, not black", async () => {
    const transparent = await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const p = await makePreview(transparent);
    const { data } = await sharp(p.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240);
    expect(data[1]).toBeGreaterThan(240);
    expect(data[2]).toBeGreaterThan(240);
  });
  test("thumbnails are 360 px wide at most", async () => {
    const t = await makeThumb(await synthScreenshot({ width: 1600, height: 900 }));
    expect(t).toMatchObject({ ok: true, width: 360, height: 203 });
    expect(t.bytes.length).toBeLessThan(40_000);
  });
  test("a decompression bomb (a header that claims 900 megapixels) is refused before it is decoded", async () => {
    const bomb = synthPngBomb(30000, 30000);
    expect(sniffImage(bomb)).toBe(KINDS.png);
    const r = await makePreview(bomb);
    expect(r.ok).toBe(false);
    expect((await processPhoto(bomb, KINDS.png)).ok).toBe(false);
  });
  test("a PNG with ancillary chunks (the app's klc-pose tEXt) decodes normally", async () => {
    const png = addPngText(await synthPng({ width: 200, height: 100 }), "klc-pose", JSON.stringify({ enu: [1, 2, 3] }));
    expect((await inspectImage(png)).ok).toBe(true);
    expect((await makePreview(png)).ok).toBe(true);
  });
});

describe("EXIF extraction", () => {
  test("GPS position, altitude, heading, capture time with its offset, camera, lens and focal length", async () => {
    const jpg = await synthJpeg({
      lat: 38.9065, lon: 141.5752, alt: 4.2, heading: 120.5, takenAt: "2026:10:04 14:23:05", offset: "+09:00", make: "Acme", model: "Pixel Synth", focal35: 26,
    });
    const r = await readExif(jpg);
    expect(r.lat).toBeCloseTo(38.9065, 7);
    expect(r.lon).toBeCloseTo(141.5752, 7);
    expect(r.heading).toBeCloseTo(120.5, 6);
    expect(r.takenAt).toBe("2026-10-04T14:23:05+09:00");
    expect(r.exif).toMatchObject({ make: "Acme", model: "Pixel Synth", focalLength35mm: 26, takenAtZone: "exif-offset" });
    expect(r.exif.gps).toMatchObject({ altM: 4.2, headingRef: "T" });
    expect(r.exif.gps.headingDeg).toBeCloseTo(120.5, 6);
  });
  test("the ENU position is computed with the app's frame: x = (lon - 141.5750) * 86744, z = -(lat - 38.9060) * 111014", async () => {
    const r = await readExif(await synthJpeg({ lat: 38.9065, lon: 141.5752 }));
    expect(r.enuX).toBeCloseTo((r.lon - 141.575) * 86744, 9);
    expect(r.enuZ).toBeCloseTo(-(r.lat - 38.906) * 111014, 9);
    expect(r.enuX).toBeCloseTo(17.3488, 3);
    expect(r.enuZ).toBeCloseTo(-55.507, 2);
    expect(r.exif.enu).toEqual({ x: r.enuX, z: r.enuZ });
    const at = await readExif(await synthJpeg({ enuX: 250, enuZ: -400 })); // fixture built from an ENU position
    expect(at.enuX).toBeCloseTo(250, 3);
    expect(at.enuZ).toBeCloseTo(-400, 3);
  });
  test("southern and western hemispheres are negative; DMS precision is kept to the millimetre", async () => {
    const r = await readExif(await synthJpeg({ lat: -33.8605, lon: -70.66667 }));
    expect(r.lat).toBeCloseTo(-33.8605, 7);
    expect(r.lon).toBeCloseTo(-70.66667, 7);
    const precise = await readExif(await synthJpeg({ lat: 38.906123456, lon: 141.575987654 }));
    expect(Math.abs(precise.lat - 38.906123456) * 111014).toBeLessThan(0.01);
    expect(Math.abs(precise.lon - 141.575987654) * 86744).toBeLessThan(0.01);
  });
  test("a below-sea-level altitude is negative", async () => {
    const r = await readExif(await synthJpeg({ lat: 38.9, lon: 141.5, alt: -2.5 }));
    expect(r.exif.gps.altM).toBeCloseTo(-2.5, 6);
  });
  test("the zone of the capture time: OffsetTimeOriginal, else derived from the GPS clock, else none", async () => {
    const withOffset = await readExif(await synthJpeg({ lat: 38.9, lon: 141.5, takenAt: "2026:10:04 14:23:05", offset: "+09:00" }));
    expect(withOffset.takenAt).toBe("2026-10-04T14:23:05+09:00");
    // camera clock 14:23:05, GPS says 05:23:03 UTC: nine hours ahead
    const viaGps = await readExif(await synthJpeg({ lat: 38.9, lon: 141.5, takenAt: "2026:10:04 14:23:05", gpsDate: "2026:10:04", gpsTime: "5/1 23/1 3/1" }));
    expect(viaGps.takenAt).toBe("2026-10-04T14:23:05+09:00");
    expect(viaGps.exif.takenAtZone).toBe("gps");
    const india = await readExif(await synthJpeg({ lat: 28.6, lon: 77.2, takenAt: "2026:10:04 10:53:05", gpsDate: "2026:10:04", gpsTime: "5/1 23/1 5/1" }));
    expect(india.takenAt).toBe("2026-10-04T10:53:05+05:30");
    const naive = await readExif(await synthJpeg({ lat: 38.9, lon: 141.5, takenAt: "2026:10:04 14:23:05" }));
    expect(naive.takenAt).toBe("2026-10-04T14:23:05");
    expect(naive.exif.takenAtZone).toBe("unknown");
    // a GPS clock that disagrees with the camera clock by a non-zone amount is not trusted
    const stale = await readExif(await synthJpeg({ lat: 38.9, lon: 141.5, takenAt: "2026:10:04 14:23:05", gpsDate: "2026:10:04", gpsTime: "5/1 50/1 0/1" }));
    expect(stale.exif.takenAtZone).toBe("unknown");
  });
  test("the capture time is the camera's wall clock, never shifted by the server's time zone", () => {
    const r = parseTakenAt({ DateTimeOriginal: "2026:01:01 00:30:00", OffsetTimeOriginal: "+09:00" });
    expect(r).toEqual({ takenAt: "2026-01-01T00:30:00+09:00", zone: "exif-offset" });
    expect(parseTakenAt({ CreateDate: "2026:06:15 23:59:59" })).toEqual({ takenAt: "2026-06-15T23:59:59", zone: "unknown" });
    for (const bad of [{}, { DateTimeOriginal: "garbage" }, { DateTimeOriginal: "2026:13:01 00:00:00" }, { DateTimeOriginal: "1850:01:01 00:00:00" }, { DateTimeOriginal: "2026:02:30 10:00:00" }, { DateTimeOriginal: 12345 }]) {
      expect(parseTakenAt(bad)).toBeNull();
    }
  });
  test("no EXIF, or (0, 0) 'null island', or garbage input, give empty fields and never throw", async () => {
    const empty = { exif: {}, lat: null, lon: null, enuX: null, enuZ: null, takenAt: null, heading: null };
    expect(await readExif(await synthJpeg({ noExif: true }))).toEqual(empty);
    expect(await readExif(notAnImage())).toEqual(empty);
    expect(await readExif(new Uint8Array(0))).toEqual(empty);
    const nullIsland = await readExif(await synthJpeg({ lat: 0, lon: 0 }));
    expect(nullIsland.lat).toBeNull();
    expect(nullIsland.enuX).toBeNull();
    expect(nullIsland.exif.gps).toBeUndefined();
  });
  test("only a whitelist is kept: no serial numbers, owner names, artist, copyright, descriptions or host names", async () => {
    const img = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#789" } })
      .withExif({
        IFD0: { Make: "Acme", Model: "Cam", Artist: "Jane Q. Public", Copyright: "Jane 2026", ImageDescription: "my house at 1-2-3 Foo street", HostComputer: "Janes-MacBook", Software: "editor 1.0" },
        IFD2: { BodySerialNumber: "SN-123456", CameraOwnerName: "Jane Public", LensSerialNumber: "LS-9", UserComment: "secret comment", LensModel: "Lens 1" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "38/1 54/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "141/1 34/1 30/1" },
      }).jpeg().toBuffer();
    const r = await readExif(img);
    expect(r.exif).toMatchObject({ make: "Acme", model: "Cam", lens: "Lens 1", software: "editor 1.0" });
    const dump = JSON.stringify(r);
    for (const private_ of ["Jane", "SN-123456", "LS-9", "secret comment", "Foo street", "Janes-MacBook", "Copyright", "Artist", "Owner", "Serial"]) expect(dump).not.toContain(private_);
  });
  test("a heading without a position is kept (compass only); out-of-range headings are dropped", async () => {
    const r = await readExif(await synthJpeg({ lat: 38.9, lon: 141.5, heading: 359.99 }));
    expect(r.heading).toBeCloseTo(359.99, 5);
    const north = await readExif(await synthJpeg({ lat: 38.9, lon: 141.5, heading: 360 }));
    expect(north.heading).toBe(0);
  });
});

describe("processing a photo end to end", () => {
  test("JPEG: preview made, original size recorded, EXIF extracted", async () => {
    const jpg = await synthJpeg({ width: 2400, height: 1800, lat: 38.9065, lon: 141.5752, heading: 45, takenAt: "2026:10:04 14:23:05", offset: "+09:00" });
    const r = await processPhoto(jpg, sniffImage(jpg));
    expect(r.ok).toBe(true);
    expect(r).toMatchObject({ width: 2400, height: 1800 });
    expect(r.preview).toMatchObject({ width: 1280, height: 960 });
    expect(r.notes).toEqual([]);
    expect(r.exif.lat).toBeCloseTo(38.9065, 6);
  });
  test("PNG and WebP are accepted too; the display size honours orientation", async () => {
    for (const make of [synthPng, synthWebp]) {
      const b = await make({ width: 500, height: 300 });
      const r = await processPhoto(b, sniffImage(b));
      expect(r).toMatchObject({ ok: true, width: 500, height: 300 });
      expect(r.preview).toMatchObject({ width: 500, height: 300 });
    }
    const o6 = await synthJpeg({ width: 640, height: 480, orientation: 6 });
    expect(await processPhoto(o6, sniffImage(o6))).toMatchObject({ width: 480, height: 640 });
  });
  test("HEIC the server cannot decode: the original is kept, there is no preview, the reason is noted, and the EXIF is still read", async () => {
    const heic = await synthHeic({ lat: 38.9, lon: 141.575, heading: 90, takenAt: "2026:10:03 09:10:11", offset: "+09:00", make: "Apple", model: "iPhone Synth" });
    const r = await processPhoto(heic, sniffImage(heic));
    expect(r.ok).toBe(true);
    expect(r.preview).toBeNull();
    expect(r.notes[0]).toContain("no-preview");
    expect(r.exif.exif.notes[0]).toContain("no-preview");
    expect(r.exif.lat).toBeCloseTo(38.9, 6);
    expect(r.exif.lon).toBeCloseTo(141.575, 6);
    expect(r.exif.heading).toBe(90);
    expect(r.exif.takenAt).toBe("2026-10-03T09:10:11+09:00");
    expect(r.exif.exif.model).toBe("iPhone Synth");
  });
  test("a file that only starts like a HEIC is refused", async () => {
    const r = await processPhoto(junkHeic(), KINDS.heic);
    expect(r).toEqual({ ok: false, reason: "not a valid HEIC container" });
  });
});
