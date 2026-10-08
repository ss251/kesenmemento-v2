// [contrib] PNG tEXt chunks (ui/pngmeta.js): the CRC, writing the pose into a photo-mode PNG, reading it back, and photo mode itself.
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import sharp from "sharp";
import * as THREE from "three";
import {
  PNG_SIG, POSE_KEY, crc32, validKeyword, textChunk, insertTextChunk, readTextChunks, readPngPose, embedTextInBlob, embedTextInDataUrl,
} from "../src/anime/ui/pngmeta.js";
import { poseToJson, capturePose, queryToPose, poseToQuery } from "../src/anime/core/pose.js";
import { takePhoto } from "../src/anime/ui/photo.js";

const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const u8 = (b) => new Uint8Array(b);
/** A small synthetic PNG (a gradient, no real photo): sharp makes a valid one. */
async function png(w = 24, h = 16) {
  const raw = Buffer.alloc(w * h * 3); for (let i = 0; i < w * h; i++) { raw[i * 3] = (i * 7) & 255; raw[i * 3 + 1] = (i * 3) & 255; raw[i * 3 + 2] = 200; }
  return u8(await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer());
}
const pose = { enu: [120.5, 30.25, -60.13], latlon: [38.9065, 141.5764], heading: 327, pitch: -12, fov: 55, mode: "walk", at: "2026-10-05T03:04:05.678Z", appVersion: "0.1.0+abc1234", layoutVersion: "v1.deadbeef", timePreset: "yugata", season: "autumn", viewport: { w: 1440, h: 900, dpr: 2 } };

describe("crc32", () => {
  test("the standard check value and the empty input", () => {
    expect(crc32(ascii("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(ascii("IEND"))).toBe(0xae426082);   // the CRC every PNG ends with
  });
  test("it chains: crc32(b, crc32(a)) is the crc32 of a followed by b", () => {
    const a = ascii("tEXt"), b = ascii("klc-pose\0{}"), ab = new Uint8Array([...a, ...b]);
    expect(crc32(b, crc32(a))).toBe(crc32(ab));
  });
});

describe("textChunk", () => {
  test("length, type, keyword NUL text, CRC", () => {
    const c = textChunk("klc-pose", "{}");
    expect(c.length).toBe(12 + 8 + 1 + 2);
    expect(new DataView(c.buffer).getUint32(0)).toBe(8 + 1 + 2);
    expect(String.fromCharCode(...c.subarray(4, 8))).toBe("tEXt");
    expect(String.fromCharCode(...c.subarray(8, 16))).toBe("klc-pose"); expect(c[16]).toBe(0); expect(String.fromCharCode(c[17], c[18])).toBe("{}");
    expect(new DataView(c.buffer).getUint32(c.length - 4)).toBe(crc32(c.subarray(4, c.length - 4)));
  });
  test("keywords: 1-79 printable Latin-1, no edge or doubled spaces", () => {
    for (const ok of ["klc-pose", "a", "Comment", "x".repeat(79), "two words"]) expect(validKeyword(ok)).toBe(true);
    for (const bad of ["", " lead", "trail ", "two  spaces", "x".repeat(80), "nul\0", "tab\t", "気", null, 5]) expect([bad, validKeyword(bad)]).toEqual([bad, false]);
    expect(() => textChunk("", "x")).toThrow();
  });
  test("text is Latin-1 only (the pose JSON is escaped to ASCII before it gets here)", () => {
    expect(() => textChunk("k", "気仙沼")).toThrow(/Latin-1/);
    expect(() => textChunk("k", "café")).not.toThrow();
    expect(() => textChunk("k", poseToJson({ n: "気仙沼" }))).not.toThrow();
  });
  test("pad3 pads with spaces until the chunk is a multiple of 3 bytes (its base64 then has no padding)", () => {
    for (let n = 0; n < 12; n++) { const c = textChunk("klc-pose", "x".repeat(n), { pad3: true }); expect(c.length % 3).toBe(0); expect(c.length - textChunk("klc-pose", "x".repeat(n)).length).toBeLessThan(3); }
  });
});

describe("insertTextChunk / readTextChunks: the PNG still decodes and the pose comes back", () => {
  test("the pose round-trips, the CRC checks out, the picture is unchanged", async () => {
    const src = await png(), json = poseToJson(pose);
    const out = insertTextChunk(src, POSE_KEY, json);
    expect(out.length).toBe(src.length + textChunk(POSE_KEY, json).length);
    expect([...out.subarray(0, 8)]).toEqual([...PNG_SIG]);
    const chunks = readTextChunks(out);
    expect(chunks).toEqual([{ key: "klc-pose", text: json, crcOk: true }]);
    expect(readPngPose(out)).toEqual(pose);
    // a real decoder agrees: same size, same pixels
    const a = await sharp(src).raw().toBuffer({ resolveWithObject: true }), b = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect(b.info.width).toBe(a.info.width); expect(b.info.height).toBe(a.info.height); expect(Buffer.compare(a.data, b.data)).toBe(0);
  });
  test("the chunk sits right after IHDR (before IDAT), as the PNG spec allows", async () => {
    const out = insertTextChunk(await png(), POSE_KEY, "{}");
    expect(String.fromCharCode(...out.subarray(12, 16))).toBe("IHDR"); expect(String.fromCharCode(...out.subarray(37, 41))).toBe("tEXt");
  });
  test("a chunk with the same key is replaced, other keys stay", async () => {
    let out = insertTextChunk(await png(), "Software", "klc");
    out = insertTextChunk(out, POSE_KEY, '{"a":1}');
    out = insertTextChunk(out, POSE_KEY, '{"a":2}');
    expect(readTextChunks(out).map((c) => [c.key, c.text]).sort()).toEqual([["Software", "klc"], [POSE_KEY, '{"a":2}']]);
    expect(readPngPose(out)).toEqual({ a: 2 });
  });
  test("a tampered chunk fails its CRC and readPngPose refuses it", async () => {
    const out = insertTextChunk(await png(), POSE_KEY, '{"a":1}');
    out[8 + 8 + 9 + 3 + 29] ^= 0xff;   // (the 4th byte of the text: the chunk starts at 33; +8 header, +9 key and NUL)
    const c = readTextChunks(out).find((x) => x.key === POSE_KEY);
    expect(c.crcOk).toBe(false); expect(readPngPose(out)).toBeNull();
  });
  test("a PNG without the chunk, text that is not JSON, and a truncated file are handled", async () => {
    const src = await png();
    expect(readTextChunks(src)).toEqual([]); expect(readPngPose(src)).toBeNull();
    expect(readPngPose(insertTextChunk(src, POSE_KEY, "not json"))).toBeNull();
    const cut = insertTextChunk(src, POSE_KEY, "{}").subarray(0, 50);   // ends inside the first chunks
    expect(() => readTextChunks(cut)).not.toThrow();
  });
  test("what is not a PNG is refused", () => {
    expect(() => insertTextChunk(u8(100), "k", "v")).toThrow(/not a PNG/);
    expect(() => readTextChunks(ascii("GIF89a" + "x".repeat(60)))).toThrow(/not a PNG/);
    const bad = new Uint8Array(60); bad.set(PNG_SIG); expect(() => readTextChunks(bad)).toThrow(/IHDR/);
    expect(() => readTextChunks("nope")).toThrow();
  });
});

describe("the Blob and the data URL paths (what photo mode uses)", () => {
  test("embedTextInBlob adds the chunk without touching the pixel bytes", async () => {
    const src = await png(64, 48), blob = new Blob([src], { type: "image/png" });
    const out = await embedTextInBlob(blob, POSE_KEY, poseToJson(pose));
    expect(out.type).toBe("image/png"); expect(out.size).toBe(blob.size + textChunk(POSE_KEY, poseToJson(pose)).length);
    const bytes = u8(await out.arrayBuffer());
    expect(readPngPose(bytes)).toEqual(pose);
    expect(Buffer.compare(Buffer.from(bytes.subarray(0, 33)), Buffer.from(src.subarray(0, 33)))).toBe(0);   // signature + IHDR untouched
    expect(Buffer.compare(Buffer.from(bytes.subarray(bytes.length - (src.length - 33))), Buffer.from(src.subarray(33)))).toBe(0);   // everything after IHDR is the original, byte for byte
    const m = await sharp(Buffer.from(bytes)).metadata(); expect([m.width, m.height]).toEqual([64, 48]);
  });
  test("a non-PNG Blob is refused", async () => {
    await expect(embedTextInBlob(new Blob([new Uint8Array(100)]), "k", "v")).rejects.toThrow(/not a PNG/);
    await expect(embedTextInBlob(new Blob([]), "k", "v")).rejects.toThrow();
  });
  test("embedTextInDataUrl splices into the base64 (33 bytes = 44 characters) and decodes to a valid PNG for every text length", async () => {
    const src = await png(), url = "data:image/png;base64," + Buffer.from(src).toString("base64");
    for (const n of [0, 1, 2, 3, 4, 5, 17, 200]) {
      const text = '{"a":"' + "x".repeat(n) + '"}', out = embedTextInDataUrl(url, POSE_KEY, text);
      const bytes = u8(Buffer.from(out.slice(22), "base64"));
      const got = readTextChunks(bytes).find((c) => c.key === POSE_KEY);
      expect(got.crcOk).toBe(true); expect(JSON.parse(got.text)).toEqual({ a: "x".repeat(n) });   // (trailing spaces from the padding parse away)
      expect((await sharp(Buffer.from(bytes)).metadata()).width).toBe(24);
    }
    expect(() => embedTextInDataUrl("data:image/jpeg;base64,AAAA", "k", "v")).toThrow(/PNG data URL/);
    expect(() => embedTextInDataUrl("data:image/png;base64," + Buffer.from("not a png at all, not at all!!").toString("base64"), "k", "v")).toThrow(/not a PNG/);
  });
  test("a 4K-sized PNG: embedding is a slice around the new chunk (fast, no copy of the pixels)", async () => {
    const big = await sharp({ create: { width: 3840, height: 2160, channels: 3, background: "#6fa8dc" } }).png({ compressionLevel: 1 }).toBuffer();
    const t0 = performance.now(), out = await embedTextInBlob(new Blob([big], { type: "image/png" }), POSE_KEY, poseToJson(pose)), ms = performance.now() - t0;
    expect(out.size).toBe(big.length + textChunk(POSE_KEY, poseToJson(pose)).length);
    expect(ms).toBeLessThan(500);
    expect(readPngPose(u8(await out.arrayBuffer()))).toEqual(pose);
  });
});

describe("photo mode (ui/photo.js) puts the pose in the PNG", () => {
  // photo mode needs a document, window, Event and dispatchEvent: stand-ins for the length of each test only (a global left behind would break the test files that run after this one)
  const KEYS = ["window", "document", "dispatchEvent", "Event"], saved = {};
  beforeEach(() => { for (const k of KEYS) saved[k] = { had: k in globalThis, value: globalThis[k] }; });
  afterEach(() => { for (const k of KEYS) { if (saved[k].had) globalThis[k] = saved[k].value; else delete globalThis[k]; } });
  /** A renderer / pipeline / canvas that produce a real PNG, and a document that records the class on <body>. */
  async function fakeApp({ withBlob = true } = {}) {
    const bytes = await png(40, 22), log = [];
    globalThis.window ??= globalThis;
    globalThis.document = { body: { classList: { add: (c) => log.push("+" + c), remove: (c) => log.push("-" + c) }, appendChild() {} }, createElement: () => ({ click() {}, remove() {}, set href(v) { log.push("href"); } }) };
    globalThis.dispatchEvent = () => true; globalThis.Event ??= class { constructor(t) { this.type = t; } };
    const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 3000); camera.position.set(10, 20, -30); camera.rotation.set(0.1, 0.5, 0, "YXZ");
    const canvas = { toBlob: (cb) => cb(new Blob([bytes], { type: "image/png" })), toDataURL: () => "data:image/png;base64," + Buffer.from(bytes).toString("base64") };
    if (!withBlob) delete canvas.toBlob;
    const sizes = [];
    const ctx = { renderer: { setSize: (...a) => sizes.push(["r", ...a]), domElement: canvas }, pipeline: { setSize: (...a) => sizes.push(["p", ...a]), size: { x: 1, y: 1 }, render() { log.push("render"); } }, camera, scene: {}, sunDir: {}, time: 0,
      services: { time: { preset: "hiru", clock: () => "12:00" }, season: { id: "summer" } } };
    return { ctx, log, sizes, T: { clock: () => "12:00", preset: "hiru" } };
  }
  test("the saved Blob carries klc-pose, taken before the renderer was resized", async () => {
    const { ctx, log, T } = await fakeApp();
    const res = await takePhoto(ctx, T, { noDownload: true });
    expect(res.w).toBe(3840); expect(res.h).toBe(2160); expect(res.name).toBe("kesennuma-1200-hiru.png");
    expect(res.pose.mode).toBe("walk"); expect(res.pose.timePreset).toBe("hiru"); expect(res.pose.season).toBe("summer");
    expect(res.pose.enu).toEqual([10, 20, -30]); expect(res.pose.heading).toBe(round2(norm360(-0.5 * 180 / Math.PI)));
    expect(log.indexOf("+klc-photo")).toBeLessThan(log.indexOf("render")); expect(log.indexOf("render")).toBeLessThan(log.indexOf("-klc-photo"));
    expect(window.__lastPhoto.pose).toEqual(res.pose);
    expect(queryToPose(poseToQuery(res.pose)).enu).toEqual([10, 20, -30]);
  });
  test("the data URL path (tools) carries it too, and res.bytes counts the chunk", async () => {
    const { ctx, T } = await fakeApp();
    const res = await takePhoto(ctx, T, { data: true, noDownload: true });
    const got = readPngPose(u8(Buffer.from(res.url.slice(22), "base64")));
    expect(got).toEqual(res.pose); expect(res.bytes).toBe(res.url.length);
  });
  test("a camera that has no pose does not stop the photo", async () => {
    const { ctx, T } = await fakeApp();
    ctx.camera = { ...ctx.camera, quaternion: undefined, position: undefined, aspect: 1, updateProjectionMatrix() {} };
    const res = await takePhoto(ctx, T, { data: true, noDownload: true });
    expect(res.pose).toBeNull(); expect(res.url.startsWith("data:image/png")).toBe(true);
  });
});
const norm360 = (a) => ((a % 360) + 360) % 360;
const round2 = (v) => Math.round(v * 100) / 100;
