// [ui-c2] UI lane C, round 2, row 2: phone-safe photo mode (mobile review F1, T1; the UI round notes (ui-c2, not included)).
//   - ONE field-of-view function for the screen and the photo (core/fov.js, ctx.fovFor)
//   - a phone shoots 1920 px on the long side at the screen's aspect; a desktop keeps 4K (photoSize(1) is still 3840 x 2160)
//   - a phone gets a card; its button opens the share sheet (the download when it cannot); 保存しました only after that has resolved
//   - the PNG keeps its klc-pose chunk; the sizes, the aspect and the field of view are always restored
// The real-browser numbers (footprint on the phone tier, the FOV of the picture against the screen) are in tools/anime/ui-c2-check.mjs (through the machine gate).
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import sharp from "sharp";
import * as THREE from "three";
import { makeDom } from "./lib/mini-dom.js";
import { fovFor, horizontalFov } from "../src/anime/core/fov.js";
import { photoSize, photoSizeFor, photoIsPhone, takePhoto, PHONE_LONG_SIDE } from "../src/anime/ui/photo.js";
import { deliverPhoto, canShareFile, createPhotoCard, openPhotoCard, photoText, dataUrlToBlob, PHOTO_CSS, SHARE_TITLE } from "../src/anime/ui/photo-share.js";
import { readPngPose } from "../src/anime/ui/pngmeta.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const u8 = (b) => new Uint8Array(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function png(w = 40, h = 22) {
  const raw = Buffer.alloc(w * h * 3); for (let i = 0; i < w * h; i++) { raw[i * 3] = (i * 7) & 255; raw[i * 3 + 1] = (i * 3) & 255; raw[i * 3 + 2] = 200; }
  return u8(await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer());
}

// ------------------------------------------------------------------------------------------------------------ the frame
describe("photoSize / photoSizeFor", () => {
  test("a desktop keeps 4K: photoSize(1) is still 3840 x 2160, whatever the window aspect", () => {
    expect(photoSize(1)).toEqual({ w: 3840, h: 2160 });
    expect(photoSize(0.5)).toEqual({ w: 1920, h: 1080 });
    for (const aspect of [0.46, 1, 1.6, 2.4, NaN]) expect(photoSizeFor(1, { phone: false, aspect })).toEqual({ w: 3840, h: 2160 });
    expect(photoSizeFor(0.5)).toEqual({ w: 1920, h: 1080 });
    expect(photoSizeFor()).toEqual({ w: 3840, h: 2160 });
  });
  test("the old photo: the portrait 88 degrees rendered into a 16:9 frame was about 120 degrees across (the finding); at the screen's aspect it is the screen's 48", () => {
    const a = 390 / 844;
    expect(horizontalFov(88, 16 / 9)).toBeGreaterThan(119); expect(horizontalFov(88, 16 / 9)).toBeLessThan(121);
    const { w, h } = photoSizeFor(1, { phone: true, aspect: a });
    expect(Math.abs(horizontalFov(fovFor(w / h), w / h) - horizontalFov(fovFor(a), a))).toBeLessThan(0.01);
  });
  test("a phone: 1920 px on the long side at the screen's own aspect, portrait or landscape", () => {
    expect(PHONE_LONG_SIDE).toBe(1920);
    expect(photoSizeFor(1, { phone: true, aspect: 390 / 844 })).toEqual({ w: 887, h: 1920 });
    expect(photoSizeFor(1, { phone: true, aspect: 844 / 390 })).toEqual({ w: 1920, h: 887 });
    expect(photoSizeFor(1, { phone: true, aspect: 1 })).toEqual({ w: 1920, h: 1920 });
    expect(photoSizeFor(1, { phone: true, aspect: 375 / 667 })).toEqual({ w: 1079, h: 1920 });
    expect(photoSizeFor(1, { phone: true, aspect: 430 / 932 })).toEqual({ w: 886, h: 1920 });
    // the picture has the screen's aspect (to the pixel)
    for (const a of [390 / 844, 844 / 390, 820 / 1180, 1366 / 1024]) { const s = photoSizeFor(1, { phone: true, aspect: a }); expect(Math.abs(s.w / s.h - a)).toBeLessThan(1 / 1000); }
  });
  test("a phone's picture is about a fifth of 4K's pixels (the +945 MB of footprint scales with them)", () => {
    const p = photoSizeFor(1, { phone: true, aspect: 390 / 844 }), d = photoSize(1);
    expect((p.w * p.h) / (d.w * d.h)).toBeLessThan(0.21);
    expect((p.w * p.h) / (d.w * d.h)).toBeGreaterThan(0.2);
    for (const a of [0.2, 0.46, 1, 2.16, 5]) { const s = photoSizeFor(1, { phone: true, aspect: a }); expect(Math.max(s.w, s.h)).toBe(1920); expect(s.w * s.h).toBeLessThanOrEqual(1920 * 1920); }
  });
  test("scale applies to the long side; a bad aspect falls back to 16:9; the frame never collapses", () => {
    expect(photoSizeFor(0.5, { phone: true, aspect: 390 / 844 })).toEqual({ w: 444, h: 960 });
    for (const aspect of [0, -1, NaN, Infinity, undefined]) expect(photoSizeFor(1, { phone: true, aspect })).toEqual({ w: 1920, h: 1080 });
    expect(photoSizeFor(0.001, { phone: true, aspect: 0.01 }).w).toBeGreaterThanOrEqual(8);
  });
  test("a phone is the phone tier or a coarse primary pointer", () => {
    expect(photoIsPhone({ quality: { phone: true } })).toBe(true);
    expect(photoIsPhone({ quality: { phone: false } }, { matchMedia: (q) => ({ matches: q === "(pointer: coarse)" }) })).toBe(true);
    expect(photoIsPhone({ quality: { phone: false } }, { matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(photoIsPhone({ quality: { phone: false } }, { matchMedia: () => { throw new Error("no"); } })).toBe(false);
    expect(photoIsPhone({}, {})).toBe(false);
    expect(photoIsPhone(null)).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------------------------ the share sheet
const fileOf = async (name = "kesennuma-1200-hiru.png") => new File([await png()], name, { type: "image/png" });
describe("deliverPhoto: the share sheet first, the download when it cannot", () => {
  let doc, anchors;
  beforeEach(() => { const dom = makeDom(); doc = dom.document; anchors = []; const orig = doc.createElement; doc.createElement = (t) => { const e = orig(t); if (t === "a") anchors.push(e); return e; }; });
  test("navigator.share is called with the PNG as a file BEFORE the function's first await (iOS needs the user gesture)", async () => {
    const calls = [];
    const nav = { canShare: (d) => { calls.push(["canShare", d.files.length]); return true; }, share: (d) => { calls.push(["share", d.files[0].name, d.files[0].type, d.title]); return Promise.resolve(); } };
    const f = await fileOf();
    const p = deliverPhoto(f, { nav, doc });
    expect(calls).toEqual([["canShare", 1], ["share", "kesennuma-1200-hiru.png", "image/png", SHARE_TITLE]]);   // (both ran synchronously)
    expect(await p).toBe("shared");
    expect(anchors.length).toBe(0);   // nothing was downloaded
  });
  test("the share sheet dismissed (AbortError) is 'cancelled': nothing is downloaded, nothing is saved", async () => {
    const nav = { canShare: () => true, share: () => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })) };
    expect(await deliverPhoto(await fileOf(), { nav, doc })).toBe("cancelled");
    expect(anchors.length).toBe(0);
  });
  test("a share that fails any other way (NotAllowedError, DataError) falls back to the download", async () => {
    for (const name of ["NotAllowedError", "DataError", "TypeError"]) {
      anchors.length = 0;
      const nav = { canShare: () => true, share: () => Promise.reject(Object.assign(new Error("x"), { name })) };
      expect(await deliverPhoto(await fileOf(), { nav, doc })).toBe("downloaded");
      expect(anchors.length).toBe(1); expect(anchors[0].download).toBe("kesennuma-1200-hiru.png"); expect(String(anchors[0].href)).toMatch(/^blob:/);
    }
  });
  test("a browser that cannot share files (no share, no canShare, canShare false or throwing) downloads", async () => {
    for (const nav of [undefined, null, {}, { share: () => Promise.resolve() }, { canShare: () => true }, { canShare: () => false, share: () => Promise.resolve() }, { canShare: () => { throw new Error("x"); }, share: () => Promise.resolve() }]) {
      anchors.length = 0;
      expect(canShareFile(nav, await fileOf())).toBe(false);
      expect(await deliverPhoto(await fileOf(), { nav, doc })).toBe("downloaded");
      expect(anchors.length).toBe(1);
    }
  });
  test("a download that cannot even start is 'failed'", async () => {
    const bad = { createElement: () => { throw new Error("no DOM"); }, body: {} };
    expect(await deliverPhoto(await fileOf(), { nav: null, doc: bad })).toBe("failed");
  });
  test("a data URL becomes a PNG Blob", async () => {
    const b = await png(); const url = "data:image/png;base64," + Buffer.from(b).toString("base64");
    const blob = dataUrlToBlob(url);
    expect(blob.type).toBe("image/png"); expect(u8(await blob.arrayBuffer())).toEqual(b);
    expect(() => dataUrlToBlob("nope")).toThrow();
  });
});

// ------------------------------------------------------------------------------------------------------------ photo mode with a fake app
describe("takePhoto: the frame, the field of view, the card, the saved note", () => {
  // photo mode needs a document, window, Event, dispatchEvent and a frame clock: stand-ins for the length of each test only (a global left behind would break the test files that run after this one)
  const KEYS = ["window", "document", "dispatchEvent", "Event", "requestAnimationFrame"], saved = {};
  let dom, anchors;
  beforeEach(() => {
    for (const k of KEYS) saved[k] = { had: k in globalThis, value: globalThis[k] };
    dom = makeDom(); anchors = [];
    const orig = dom.document.createElement; dom.document.createElement = (t) => { const e = orig(t); if (t === "a") anchors.push(e); return e; };
    globalThis.window ??= globalThis; globalThis.document = dom.document; globalThis.dispatchEvent = () => true; globalThis.Event ??= class { constructor(t) { this.type = t; } };
    globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
  });
  afterEach(() => { openPhotoCard()?.close(); for (const k of KEYS) { if (saved[k].had) globalThis[k] = saved[k].value; else delete globalThis[k]; } });

  /** A renderer / pipeline / canvas that make a real PNG and record what the pipeline saw at render time. */
  async function fakeApp({ phone = false, w = 1440, h = 900, withToBlob = true, fovPin = null, renderFails = false, pad = null, toBlobMode = "ok" } = {}) {
    const bytes = await png(40, 22), seen = [], sizes = [], log = [], shootingAt = [];
    const camera = new THREE.PerspectiveCamera(fovPin ?? fovFor(w / h), w / h, 0.1, 3000);
    camera.position.set(10, 20, -30); camera.rotation.set(0.1, 0.5, 0, "YXZ");
    const canvas = { toBlob: (cb) => { shootingAt.push(["toBlob", ctx.shooting]); setTimeout(() => { shootingAt.push(["toBlob done", ctx.shooting]); cb(new Blob([bytes], { type: "image/png" })); }, 5); }, toDataURL: () => "data:image/png;base64," + Buffer.from(bytes).toString("base64") };
    if (!withToBlob) delete canvas.toBlob;
    else if (toBlobMode === "null") canvas.toBlob = (cb) => { shootingAt.push(["toBlob", ctx.shooting]); setTimeout(() => cb(null), 2); };   // (iOS Safari under memory pressure)
    else if (toBlobMode === "never") canvas.toBlob = () => { shootingAt.push(["toBlob", ctx.shooting]); };
    const ctx = {
      quality: { phone },
      renderer: { setSize: (...a) => sizes.push(["r", ...a]), domElement: canvas },
      pipeline: { setSize: (...a) => sizes.push(["p", ...a]), size: { x: 1, y: 1 }, render() { shootingAt.push(["render", ctx.shooting]); if (renderFails) throw new Error("out of memory"); seen.push({ aspect: camera.aspect, fov: camera.fov }); log.push("render"); } },
      camera, scene: {}, sunDir: {}, time: 0, pad,
      services: { time: { preset: "hiru", clock: () => "12:00" }, season: { id: "summer" } },
    };
    if (fovPin !== null) ctx.fovFor = (a) => fovPin;   // (what main.js does with ?fov= / a ?cam= link)
    return { ctx, seen, sizes, log, bytes, camera, shootingAt, T: { clock: () => "12:00", preset: "hiru" } };
  }
  const notes = () => { const n = []; return { n, note: (m, ms) => n.push(m), text: { saving: "SAVING", saved: "SAVED" } }; };
  const tap = (card, act) => dom.fire(card.el.querySelector(`[data-a="${act}"]`), "click", { detail: 1 });

  test("a desktop: 4K, the screen's rule for the frame's aspect, everything restored, a download, and 保存しました after the download (the old behaviour)", async () => {
    const A = await fakeApp({ w: 1440, h: 900 }), { n, ...o } = notes(); const order = [];
    o.note = (m) => { order.push(m); n.push(m); };
    A.camera.fov = 55; A.camera.aspect = 1.6;
    const res = await takePhoto(A.ctx, A.T, { ...o, lang: "ja" });
    expect(res.w).toBe(3840); expect(res.h).toBe(2160); expect(res.phone).toBe(false); expect(res.name).toBe("kesennuma-1200-hiru.png");
    expect(A.sizes).toEqual([["r", 3840, 2160, false], ["p", 3840, 2160, 1]]);
    expect(A.seen).toEqual([{ aspect: 3840 / 2160, fov: 55 }]);
    expect(A.camera.aspect).toBe(1.6); expect(A.camera.fov).toBe(55);   // the screen's own values are back (resize() would set them again in the real app)
    expect(anchors.length).toBe(1); expect(anchors[0].download).toBe(res.name);
    expect(n).toEqual(["SAVING", "SAVED"]);   // the saving note, then (after the download started) the saved note
    expect(openPhotoCard()).toBeNull(); expect(res.delivery).toBeUndefined();
    expect(dom.document.body.classList.contains("klc-photo")).toBe(false);
    expect(window.__lastPhoto.w).toBe(3840); expect(window.__lastPhoto.phone).toBe(false);
  });
  test("a desktop window in portrait: the 16:9 photo gets the 16:9 frame's field of view (55), not the window's 88 (that was the ~120 degree picture); the pose says so; the window's fov is back after", async () => {
    const A = await fakeApp({ w: 600, h: 1000 });
    expect(A.camera.fov).toBe(88);
    const res = await takePhoto(A.ctx, A.T, { noDownload: true });
    expect([res.w, res.h]).toEqual([3840, 2160]);
    expect(A.seen[0].fov).toBe(55); expect(res.fov).toBe(55); expect(res.pose.fov).toBe(55);
    expect(A.camera.fov).toBe(88); expect(A.camera.aspect).toBeCloseTo(0.6, 5);
  });
  test("a pinned field of view (?fov=, a ?cam= link) is honoured in the photo exactly as on the screen", async () => {
    const A = await fakeApp({ w: 390, h: 844, fovPin: 62 });
    const res = await takePhoto(A.ctx, A.T, { noDownload: true });
    expect(A.seen[0].fov).toBe(62); expect(res.pose.fov).toBe(62); expect(A.camera.fov).toBe(62);
  });
  test("a phone: 1920 px on the long side at the screen's aspect, at the screen's field of view; the camera, the renderer and the body class are restored", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844 });
    const screenFov = A.camera.fov, screenAspect = A.camera.aspect;
    expect(screenFov).toBe(88);
    const res = await takePhoto(A.ctx, A.T, { noDownload: true });
    expect([res.w, res.h]).toEqual([887, 1920]); expect(res.phone).toBe(true);
    expect(A.sizes).toEqual([["r", 887, 1920, false], ["p", 887, 1920, 1]]);
    expect(A.seen.length).toBe(1);
    expect(A.seen[0].fov).toBe(screenFov);   // the screen's rule at the screen's aspect: the same field of view
    expect(Math.abs(A.seen[0].aspect - screenAspect)).toBeLessThan(0.001);
    expect(Math.abs(horizontalFov(A.seen[0].fov, A.seen[0].aspect) - horizontalFov(screenFov, screenAspect))).toBeLessThan(0.01);   // 48 degrees across, as on the screen
    expect(A.camera.aspect).toBe(screenAspect); expect(A.camera.fov).toBe(screenFov);
    expect(dom.document.body.classList.contains("klc-photo")).toBe(false);
    expect(openPhotoCard()).toBeNull();   // a tool asked for the bytes only: no card, no download
    expect(anchors.length).toBe(0);
  });
  test("a phone in landscape: 1920 x 887 at 55 degrees", async () => {
    const A = await fakeApp({ phone: true, w: 844, h: 390 });
    const res = await takePhoto(A.ctx, A.T, { noDownload: true });
    expect([res.w, res.h]).toEqual([1920, 887]); expect(A.seen[0].fov).toBe(55);
  });
  test("the PNG keeps its klc-pose chunk, taken from the camera BEFORE the frame changed, with the picture's field of view", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844 });
    const res = await takePhoto(A.ctx, A.T, { data: true, noDownload: true });
    const got = readPngPose(u8(Buffer.from(res.url.slice(22), "base64")));
    expect(got).toEqual(res.pose);
    expect(got.enu).toEqual([10, 20, -30]); expect(got.fov).toBe(88); expect(got.mode).toBe("walk"); expect(got.timePreset).toBe("hiru"); expect(got.season).toBe("summer");
    expect(res.bytes).toBe(res.url.length);
  });
  test("a phone: the card is up before the render (it says 撮影中… itself: no HUD note), shows the picture, and 保存しました waits for the share sheet to resolve", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844 }), { n, ...o } = notes();
    o.note = (m) => n.push(m);
    let cardAtRender = null; const render = A.ctx.pipeline.render; A.ctx.pipeline.render = () => { const c = openPhotoCard(); cardAtRender = c && { open: c.el.dataset.open, state: c.el.dataset.state, attached: c.el.isConnected }; render(); };
    let resolveShare, shared = null;
    const nav = { canShare: () => true, share: (d) => { shared = d; return new Promise((r) => { resolveShare = r; }); } };
    const res = await takePhoto(A.ctx, A.T, { ...o, lang: "ja", env: { nav } });
    expect(cardAtRender).toEqual({ open: "1", state: "capturing", attached: true });   // the card was up (撮影中…, faded in) while the pipeline rendered
    expect(n).toEqual([]);   // no saving note on a phone (it would say 4K), no saved note yet
    const card = openPhotoCard();
    expect(card.el.dataset.state).toBe("ready"); expect(card.el.dataset.open).toBe("1");
    expect(card.el.querySelector("h2").textContent).toContain("撮影中…");   // (all three headings are in the markup, CSS shows one)
    expect(card.el.querySelector('[data-a="save"]').textContent).toBe("保存・共有");
    expect(card.el.querySelector("img").src).toMatch(/^blob:/);
    expect(card.el.querySelector(".pic").style["--klc-photo-r"]).toBe("0.4620");   // the preview box takes the photo's shape (887 / 1920) from the first moment: no jump when the picture arrives
    expect(res.delivery).toBeInstanceOf(Promise);
    expect(anchors.length).toBe(0);   // nothing is saved by itself
    // the visitor taps 保存・共有: the share sheet opens with the PNG, and nothing is said until it resolves
    tap(card, "save");
    expect(shared.files.length).toBe(1); expect(shared.files[0].name).toBe("kesennuma-1200-hiru.png"); expect(shared.files[0].type).toBe("image/png"); expect(shared.title).toBe(SHARE_TITLE);
    await sleep(10); expect(n).toEqual([]); expect(card.el.dataset.open).toBe("1");   // the sheet is open: still no 保存しました
    resolveShare();
    expect(await res.delivery).toBe("shared");
    expect(n).toEqual(["SAVED"]);   // only now
    expect(card.el.dataset.open).toBe("0");   // the card goes
    // the shared file is the PNG with the pose in it
    const bytes = u8(await shared.files[0].arrayBuffer());
    expect(readPngPose(bytes)).toEqual(res.pose);
  });
  test("the share sheet dismissed: the card stays, nothing is said; 閉じる closes it, still nothing is said", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844 }), { n, ...o } = notes(); o.note = (m) => n.push(m);
    let rejectShare;
    const nav = { canShare: () => true, share: () => new Promise((_, j) => { rejectShare = j; }) };
    const res = await takePhoto(A.ctx, A.T, { ...o, env: { nav } });
    const card = openPhotoCard(); tap(card, "save");
    rejectShare(Object.assign(new Error("dismissed"), { name: "AbortError" }));
    await sleep(10);
    expect(card.el.dataset.open).toBe("1"); expect(card.el.dataset.state).toBe("ready"); expect(n).toEqual([]);
    tap(card, "save");   // another try is allowed (the button works again)
    await sleep(5);
    tap(card, "close");
    expect(await res.delivery).toBe("closed");
    expect(n).toEqual([]);
  });
  test("a browser without share-with-files: the button says 保存 and downloads the PNG; 保存しました follows the download", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844 }), { n, ...o } = notes(); o.note = (m) => n.push(m);
    const res = await takePhoto(A.ctx, A.T, { ...o, env: { nav: {} } });
    const card = openPhotoCard();
    expect(card.el.querySelector('[data-a="save"]').textContent).toBe("保存");
    tap(card, "save");
    expect(await res.delivery).toBe("downloaded");
    expect(anchors.length).toBe(1); expect(anchors[0].download).toBe(res.name);
    expect(n).toEqual(["SAVED"]);
  });
  test("a share that fails (not a dismissal) falls back to the download and then says saved", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844 }), { n, ...o } = notes(); o.note = (m) => n.push(m);
    const nav = { canShare: () => true, share: () => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })) };
    const res = await takePhoto(A.ctx, A.T, { ...o, env: { nav } });
    tap(openPhotoCard(), "save");
    expect(await res.delivery).toBe("downloaded");
    expect(anchors.length).toBe(1); expect(n).toEqual(["SAVED"]);
  });
  test("English: the card speaks English when the HUD does", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844 });
    await takePhoto(A.ctx, A.T, { lang: "en", env: { nav: { canShare: () => true, share: () => Promise.resolve() } } });
    const card = openPhotoCard();
    expect(card.el.querySelector("h2").textContent).toContain("Your photo is ready");
    expect(card.el.querySelector('[data-a="save"]').textContent).toBe("Save or share");
    expect(card.el.querySelector('[data-a="close"]').textContent).toBe("Close");
    expect(card.el.getAttribute("lang")).toBe("en");
  });
  test("the card is a dialog, takes the pad aside while it is up and gives it back, and Escape closes it", async () => {
    const calls = []; const pad = { suppress: (r, on) => calls.push([r, on]) };
    const A = await fakeApp({ phone: true, w: 390, h: 844, pad });
    const res = await takePhoto(A.ctx, A.T, { env: { nav: {} } });
    const card = openPhotoCard();
    expect(card.el.getAttribute("role")).toBe("dialog"); expect(card.el.getAttribute("aria-modal")).toBe("true");
    expect(calls).toEqual([["photo-card", true]]);
    dom.fire(dom.document, "keydown", { code: "Escape", key: "Escape" });
    expect(await res.delivery).toBe("closed");
    expect(calls).toEqual([["photo-card", true], ["photo-card", false]]);
    await sleep(300); expect(dom.document.getElementById("klc-photo")).toBeNull();   // the element is gone after its fade
    expect(openPhotoCard()).toBeNull();
  });
  test("only one card: the next photo closes the old card; the card's CSS is injected once", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844 });
    const r1 = await takePhoto(A.ctx, A.T, { env: { nav: {} } });
    const first = openPhotoCard();
    const r2 = await takePhoto(A.ctx, A.T, { env: { nav: {} } });
    expect(await r1.delivery).toBe("closed"); expect(openPhotoCard()).not.toBe(first); expect(r2.delivery).toBeInstanceOf(Promise);
    expect(dom.document.querySelectorAll("style").filter((s) => s.id === "klc-photo-css").length).toBe(1);
  });
  test("the main loop draws nothing while a photo is rendered and encoded (ctx.shooting), on a phone and on a desktop, and draws again after", async () => {
    for (const phone of [true, false]) {
      const A = await fakeApp({ phone, w: phone ? 390 : 1440, h: phone ? 844 : 900 });
      expect(A.ctx.shooting).toBeUndefined();
      await takePhoto(A.ctx, A.T, { noDownload: true });
      expect(A.shootingAt).toEqual([["render", true], ["toBlob", true], ["toBlob done", true]]);   // (true from before the resize to after the PNG is encoded)
      expect(A.ctx.shooting).toBe(false);
    }
    const F = await fakeApp({ phone: true, w: 390, h: 844, renderFails: true });
    await expect(takePhoto(F.ctx, F.T, { env: { nav: {} } })).rejects.toThrow("out of memory");
    expect(F.ctx.shooting).toBe(false);   // (a failed photo does not leave the loop stopped)
    const main = read("src/anime/main.js"), blk = main.match(/if \(ctx\.shooting\) \{([^}]*)\}\s*else if \(planet\.active\) planet\.render\(simT\); else pipeline\.render\(scene, camera, sunDir, simT\);/);
    expect(blk).not.toBeNull();
    expect(blk[1]).not.toMatch(/render\(/);   // the skipped branch draws nothing (a render moved into it would pass a looser pin)
  });
  test("hold('encoded') (a tool's sampler) runs after the PNG is encoded and before the sizes are restored", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844 });
    const at = [];
    const res = await takePhoto(A.ctx, A.T, { noDownload: true, hold: async (stage) => { at.push({ stage, sizes: A.sizes.length, aspect: A.camera.aspect, shooting: A.ctx.shooting, klc: dom.document.body.classList.contains("klc-photo") }); await sleep(2); } });
    expect(at).toEqual([{ stage: "encoded", sizes: 2, aspect: 887 / 1920, shooting: true, klc: true }]);
    expect(res.w).toBe(887); expect(A.camera.aspect).toBeCloseTo(390 / 844, 10);
  });
  test("a second tap while the first photo renders is the same photo: one render, one result (three buffers of this size on a phone are the crash)", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844 });
    const a = takePhoto(A.ctx, A.T, { noDownload: true }), b = takePhoto(A.ctx, A.T, { noDownload: true });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(rb); expect(A.seen.length).toBe(1);
    const c = await takePhoto(A.ctx, A.T, { noDownload: true });   // (and afterwards a new photo is a new render)
    expect(c).not.toBe(ra); expect(A.seen.length).toBe(2);
  });
  test("a render that fails (out of memory): the card says so with a close button, the error reaches the caller, and the camera and the body class are restored", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844, renderFails: true });
    const sa = A.camera.aspect, sf = A.camera.fov;
    await expect(takePhoto(A.ctx, A.T, { env: { nav: {} } })).rejects.toThrow("out of memory");
    const card = openPhotoCard();
    expect(card.el.dataset.state).toBe("failed");
    expect(A.camera.aspect).toBe(sa); expect(A.camera.fov).toBe(sf);
    expect(dom.document.body.classList.contains("klc-photo")).toBe(false);
    tap(card, "close"); expect(await card.done).toBe("closed");
    // and the next photo works (the in-flight slot was released)
    A.ctx.pipeline.render = () => {}; const ok = await takePhoto(A.ctx, A.T, { noDownload: true }); expect(ok.w).toBe(887);
  });
  test("toBlob answers null (iOS Safari under memory pressure): the card says so, the error reaches the caller, nothing is left stopped, and the next photo works", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844, toBlobMode: "null" });
    const sa = A.camera.aspect, sf = A.camera.fov;
    await expect(takePhoto(A.ctx, A.T, { env: { nav: {} } })).rejects.toThrow("the canvas gave no image");
    expect(openPhotoCard().el.dataset.state).toBe("failed");
    expect(A.ctx.shooting).toBe(false); expect(A.camera.aspect).toBe(sa); expect(A.camera.fov).toBe(sf);
    expect(dom.document.body.classList.contains("klc-photo")).toBe(false);
    openPhotoCard().close();
    A.ctx.renderer.domElement.toBlob = (cb) => cb(new Blob([A.bytes], { type: "image/png" }));
    expect((await takePhoto(A.ctx, A.T, { noDownload: true })).w).toBe(887);   // (the in-flight slot was released)
  });
  test("toBlob never answers: after the encode timeout the loop is released, the camera is back, the card says so, and the next photo works (a stuck encode used to leave ctx.shooting set for good)", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844, toBlobMode: "never" });
    const sa = A.camera.aspect, sf = A.camera.fov;
    const t0 = performance.now();
    await expect(takePhoto(A.ctx, A.T, { env: { nav: {} }, encodeTimeout: 40 })).rejects.toThrow("the PNG encode did not answer");
    expect(performance.now() - t0).toBeGreaterThanOrEqual(35);
    expect(openPhotoCard().el.dataset.state).toBe("failed");
    expect(A.ctx.shooting).toBe(false); expect(A.camera.aspect).toBe(sa); expect(A.camera.fov).toBe(sf);
    openPhotoCard().close();
    A.ctx.renderer.domElement.toBlob = (cb) => cb(new Blob([A.bytes], { type: "image/png" }));
    expect((await takePhoto(A.ctx, A.T, { noDownload: true })).w).toBe(887);
    expect(read("src/anime/ui/photo.js")).toContain("export const ENCODE_TIMEOUT_MS = 20000;");
  });
  test("the card's fade is a transition: its closed state is computed (a style flush) after it is attached and before the open state is set", async () => {
    const reads = [];
    Object.defineProperty(dom.El.prototype, "offsetWidth", { configurable: true, get() { reads.push({ id: this.id, open: this.getAttribute("data-open"), connected: this.isConnected }); return 0; } });
    try {
      const A = await fakeApp({ phone: true, w: 390, h: 844 });
      await takePhoto(A.ctx, A.T, { env: { nav: {} } });
      expect(reads.find((r) => r.id === "klc-photo")).toEqual({ id: "klc-photo", open: "0", connected: true });
      expect(openPhotoCard().el.dataset.open).toBe("1");   // (and then it opened)
    } finally { delete dom.El.prototype.offsetWidth; }
    expect(read("src/anime/ui/photo-share.js")).toContain("void el.offsetWidth;");
  });
  test("a download fallback keeps its object URL for a minute (iOS may ask before it takes the file)", () => {
    expect(read("src/anime/ui/photo-share.js")).toContain("downloadHref(href, file.name, doc, { revokeAfter: 60000 });");
  });
  test("a canvas that cannot toBlob (an old browser): the data URL path still gives the phone a card", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844, withToBlob: false });
    const res = await takePhoto(A.ctx, A.T, { env: { nav: {} } });
    expect(openPhotoCard().el.dataset.state).toBe("ready");
    expect(res.bytes).toBeGreaterThan(50);
  });
  test("tools keep working: data + noDownload on the phone tier returns the data URL, with no card and no download", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844 });
    const res = await takePhoto(A.ctx, A.T, { scale: 0.5, data: true, noDownload: true });
    expect([res.w, res.h]).toEqual([444, 960]); expect(res.url.startsWith("data:image/png;base64,")).toBe(true);
    expect(openPhotoCard()).toBeNull(); expect(anchors.length).toBe(0);
  });
  test("data: true without noDownload on a phone keeps the old behaviour (a download of the data URL, no card)", async () => {
    const A = await fakeApp({ phone: true, w: 390, h: 844 });
    const res = await takePhoto(A.ctx, A.T, { data: true });
    expect(openPhotoCard()).toBeNull(); expect(anchors.length).toBe(1); expect(String(anchors[0].href)).toMatch(/^data:image\/png/); expect(res.url).toBeTruthy();
  });
  test("no renderer, no pipeline or no camera: null, as before", async () => {
    expect(await takePhoto({ pipeline: {}, camera: {} }, null)).toBeNull();
    expect(await takePhoto({ renderer: {}, camera: {} }, null)).toBeNull();
    expect(await takePhoto({ renderer: {}, pipeline: {} }, null)).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------------------ strings, CSS and the HUD's handler
describe("the card's strings, its CSS and the HUD handler", () => {
  test("both languages carry the same keys, and a missing language or key falls back to Japanese", () => {
    const D = JSON.parse(read("data/ui-photo-i18n.json"));
    expect(Object.keys(D.en).sort()).toEqual(Object.keys(D.ja).sort());
    for (const k of Object.keys(D.ja)) { expect(D.ja[k].length).toBeGreaterThan(0); expect(D.en[k].length).toBeGreaterThan(0); }
    expect(photoText("fr")).toEqual(D.ja); expect(photoText()).toEqual(D.ja); expect(photoText("en").save).toBe("Save or share");
    // the phone's strings must not claim 4K (the picture is 1920 px)
    expect(JSON.stringify(D)).not.toMatch(/4K/i);
  });
  test("the card sits above the HUD (z 3..6), the story card (38) and the ship UI (40), below the report sheet (60) and the reload card (90)", () => {
    expect(PHOTO_CSS).toMatch(/#klc-photo\{[^}]*z-index:45/);
    expect(read("src/anime/core/survive.js")).toMatch(/#klc-lost\{[^}]*z-index:90/);
  });
  test("the preview box is sized from the photo's ratio and the room the screen leaves (not a fixed height): a tall phone, a phone on its side and a tablet all get a box of the photo's shape", () => {
    expect(PHOTO_CSS).toMatch(/#klc-photo \.pic\{[^}]*aspect-ratio:var\(--klc-photo-r,1\.7778\)/);
    expect(PHOTO_CSS).toContain("width:min(100%,calc(min(70vh,100vh - 190px)*var(--klc-photo-r,1.7778)));width:min(100%,calc(min(70dvh,100dvh - 190px)*var(--klc-photo-r,1.7778)))");   // (a vh fallback first, then dvh)
    expect(PHOTO_CSS).toContain("width:min(100%,calc((100dvh - 170px)*var(--klc-photo-r,1.7778)))");   // a phone on its side
    expect(PHOTO_CSS).not.toMatch(/#klc-photo \.pic\{[^}]*[^-]height:/);
  });
  test("only opacity and transform move; reduced motion removes the transitions; every button is 44 px tall with a press state", () => {
    expect(PHOTO_CSS).not.toMatch(/transition:[^;}]*(width|height|top|left|margin|padding|background|box-shadow)/);
    expect(PHOTO_CSS).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[^}]*transition:none/);
    expect(PHOTO_CSS).toMatch(/#klc-photo button\{min-height:44px/);
    expect(PHOTO_CSS).toMatch(/#klc-photo button:active\{transform:scale\(\.97\)\}/);
    expect(PHOTO_CSS).not.toMatch(/:hover/);   // (no hover rule: a tap on a phone must not leave a sticky hover)
    expect(PHOTO_CSS).toContain("env(safe-area-inset-bottom)");
    expect(PHOTO_CSS).toContain("100dvh");
  });
  test("the HUD's photo() hands the note, the language and the two strings to photo.js, catches a failure, and never rebuilds the HUD", () => {
    const hud = read("src/anime/ui/hud.js");
    const a = hud.indexOf("async function photo(scale = 1, o = {})"), b = hud.indexOf("el.addEventListener('click'", a);
    const fn = hud.slice(a, b);
    expect(fn).toContain("takePhoto(ctx, T, { ...o, scale, lang: I.lang, note, text: { saving: I.t('v3.photo.saving'), saved: I.t('v3.photo.saved') } })");
    expect(fn).toContain("catch (e)");
    expect(fn).not.toMatch(/\brender\(/);   // (row 5: a click never calls render())
    expect(fn).not.toContain("v3.photo.saved'));\n    return res");   // (the unconditional 保存しました after the render is gone)
    expect(hud).toContain("import { takePhoto } from './photo.js';");   // (the import line is untouched: lane A's rows edit the imports above it)
  });
  test("photo.js keeps the 4K desktop frame and the contrib-pose ordering the older tests pin", () => {
    const photo = read("src/anime/ui/photo.js");
    expect(photo).toContain("export function photoSize(scale = 1) { return { w: Math.round(3840 * scale), h: Math.round(2160 * scale) }; }");
    expect(photo.indexOf("capturePose(ctx)")).toBeLessThan(photo.indexOf("r.setSize(W, H, false)"));
    expect(photo.indexOf("embedTextInBlob(blob, POSE_KEY, json)")).toBeGreaterThan(photo.indexOf("dispatchEvent(new Event('resize'))"));
    expect(photo).not.toMatch(/Math\.random\(/);
    expect(photo).not.toMatch(/Date\.now\(|new Date\(/);   // (nothing visible in a shot frame reads the wall clock)
  });
  test("main.js: ctx.fovFor is the pinned field of view or the screen's rule, and the photo's rule is that same function", () => {
    const main = read("src/anime/main.js"), photo = read("src/anime/ui/photo.js");
    expect(main).toContain("ctx.fovFor = (aspect) => fovPin ?? fovFor(aspect);");
    expect(main.indexOf("ctx.fovFor = ")).toBeLessThan(main.indexOf("function resize()"));
    expect(main).toContain("camera.fov = ctx.fovFor(camera.aspect);");
    expect(photo).toContain("cam.fov = ctx.fovFor ? ctx.fovFor(cam.aspect) : fovFor(cam.aspect);");
  });
});
