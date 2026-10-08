// [contrib] The screenshot capture and the photo thumbnails (ui/contrib-shot.js) with fake canvases: the frame is drawn before it is read, the size is
// right, every canvas ends at 0 x 0 (also when something fails half way), the blob and its preview URL are released, and a photo is decoded at thumbnail size.
import { describe, test, expect } from "bun:test";
import { toBlob, freeCanvas, captureView, makeThumb } from "../src/anime/ui/contrib-shot.js";
import { LIMITS, SHOT } from "../src/anime/ui/contrib-lib.js";

/** A document that makes fake canvases (tracked) and a renderer that logs what happens to it, in order. */
function rig({ srcW = 1440, srcH = 900, dpr = 2, sizeAt = () => 4000, failBlob = false } = {}) {
  const log = [], canvases = [], urls = new Set();
  const doc = { createElement(tag) {
    const c = { tag, width: 0, height: 0 };
    c.getContext = () => ({ drawImage: (src, ...a) => log.push(["draw", src === ctx.renderer.domElement ? "webgl" : "canvas", ...a]), imageSmoothingEnabled: false, imageSmoothingQuality: "low" });
    c.toBlob = (cb, type, q) => queueMicrotask(() => { log.push(["toBlob", c.width, c.height, type, q]); cb(failBlob ? null : new Blob([new Uint8Array(sizeAt(q, c))], { type })); });
    canvases.push(c); return c;
  } };
  const URLApi = { createObjectURL: (b) => { const u = "blob:fake/" + urls.size + "-" + b.size; urls.add(u); return u; }, revokeObjectURL: (u) => { urls.delete(u); log.push(["revoke", u]); } };
  const ctx = { renderer: { domElement: { width: srcW, height: srcH } }, pipeline: { render: () => log.push(["render"]) }, camera: {}, scene: {}, sunDir: {}, time: 1.5, sky: { update: () => log.push(["sky"]) } };
  return { doc, win: { devicePixelRatio: dpr }, URLApi, ctx, log, canvases, urls };
}

describe("toBlob / freeCanvas", () => {
  test("toBlob resolves null when the browser cannot encode (no toBlob, a throw, a null blob)", async () => {
    expect(await toBlob({}, "image/jpeg", 0.8)).toBeNull();
    expect(await toBlob({ toBlob() { throw new Error("tainted"); } }, "image/jpeg", 0.8)).toBeNull();
    expect(await toBlob({ toBlob: (cb) => cb(null) }, "image/jpeg", 0.8)).toBeNull();
    const b = await toBlob({ toBlob: (cb, t, q) => cb(new Blob(["x"], { type: t })) }, "image/jpeg", 0.8); expect(b.type).toBe("image/jpeg");
  });
  test("freeCanvas shrinks a canvas to nothing and never throws", () => {
    const c = { width: 800, height: 600 }; freeCanvas(c); expect([c.width, c.height]).toEqual([0, 0]);
    expect(() => freeCanvas(null)).not.toThrow(); expect(() => freeCanvas({ set width(v) { throw new Error("locked"); } })).not.toThrow();
  });
});

describe("captureView", () => {
  test("one more frame is drawn (sky first) and read in the same call, then scaled to 1600 on a retina desktop: a JPEG blob plus a small preview URL", async () => {
    const r = rig(); const shot = await captureView(r.ctx, r);
    expect(r.log.slice(0, 3).map((e) => e[0])).toEqual(["sky", "render", "draw"]);   // (the drawing buffer is read right after the render)
    expect(r.log[2]).toEqual(["draw", "webgl", 0, 0, 1600, 1000]);
    expect([shot.w, shot.h]).toEqual([1600, 1000]); expect(shot.blob.type).toBe("image/jpeg"); expect(shot.bytes).toBe(4000);
    expect([shot.thumbW, shot.thumbH]).toEqual([384, 240]); expect(shot.thumb).toMatch(/^blob:fake\//); expect(r.urls.size).toBe(1);
    const enc = r.log.filter((e) => e[0] === "toBlob"); expect(enc.map((e) => [e[1], e[2], e[3], e[4]])).toEqual([[1600, 1000, "image/jpeg", SHOT.quality], [384, 240, "image/jpeg", SHOT.thumbQuality]]);
  });
  test("every canvas it made ends 0 x 0, and release() drops the blob and revokes the preview (once)", async () => {
    const r = rig(); const shot = await captureView(r.ctx, r);
    expect(r.canvases).toHaveLength(2); for (const c of r.canvases) expect([c.width, c.height]).toEqual([0, 0]);
    shot.release(); expect(shot.blob).toBeNull(); expect(shot.thumb).toBe(""); expect(r.urls.size).toBe(0);
    shot.release(); expect(r.log.filter((e) => e[0] === "revoke")).toHaveLength(1);
  });
  test("a phone canvas is not blown up: 390 x 844 at DPR 3 becomes 780 x 1688 (twice its canvas), a short side is kept in proportion", async () => {
    const r = rig({ srcW: 390, srcH: 844, dpr: 3 }); const shot = await captureView(r.ctx, r);
    expect([shot.w, shot.h]).toEqual([780, 1688]); expect([shot.thumbW, shot.thumbH]).toEqual([111, 240]);
    const w = rig({ srcW: 844, srcH: 390, dpr: 3 }); expect((await captureView(w.ctx, w)).w).toBe(1600);
    const d = rig({ srcW: 1440, srcH: 900, dpr: 1 }); expect((await captureView(d.ctx, d)).w).toBe(1440);
  });
  test("an oversize JPEG is encoded again at lower quality (a guard: a 1600 px frame is far below 8 MB)", async () => {
    const r = rig({ sizeAt: (q, c) => (c.width > 1000 && q > 0.6 ? LIMITS.shotBytes + 1000 : 5000) });
    const shot = await captureView(r.ctx, r);
    const qs = r.log.filter((e) => e[0] === "toBlob" && e[1] === 1600).map((e) => e[4]);
    expect(qs.length).toBeGreaterThan(1); expect(qs[0]).toBe(SHOT.quality); expect(qs.at(-1)).toBeLessThanOrEqual(0.6 + 1e-9); expect(shot.bytes).toBe(5000);
  });
  test("when the browser cannot encode it throws and still frees every canvas (nothing leaks on the failure path)", async () => {
    const r = rig({ failBlob: true });
    await expect(captureView(r.ctx, r)).rejects.toThrow(/could not encode/);
    expect(r.canvases).toHaveLength(2); for (const c of r.canvases) expect([c.width, c.height]).toEqual([0, 0]); expect(r.urls.size).toBe(0);
  });
  test("no renderer, no document, an empty canvas: it throws before it makes anything", async () => {
    const r = rig({ srcW: 0, srcH: 0 });
    await expect(captureView(r.ctx, r)).rejects.toThrow(/empty/); expect(r.canvases).toHaveLength(0);
    await expect(captureView({}, r)).rejects.toThrow(/no renderer/); await expect(captureView(rig().ctx, { doc: null, win: {} })).rejects.toThrow(/no renderer/);
  });
  test("it needs no new texture: nothing in the renderer or the pipeline is resized or created", async () => {
    const r = rig(); const touched = []; const guard = (name) => () => touched.push(name);
    r.ctx.renderer.setSize = guard("renderer.setSize"); r.ctx.pipeline.setSize = guard("pipeline.setSize"); r.ctx.camera.updateProjectionMatrix = guard("camera.updateProjectionMatrix");
    await captureView(r.ctx, r); expect(touched).toEqual([]);
  });
});

describe("makeThumb: a picked photo is decoded at thumbnail size, one bitmap at a time, then closed", () => {
  const mk = (bmp, fail = false) => {
    const r = rig(); const calls = [];
    r.win.createImageBitmap = async (file, o) => { calls.push([file.name, o]); if (fail) throw new Error("cannot decode"); return bmp; };
    return { r, calls };
  };
  test("createImageBitmap is asked for a 160 px wide copy (EXIF orientation applied); the bitmap is closed and the working canvas is 0 x 0; the URL is a small JPEG", async () => {
    const closed = []; const { r, calls } = mk({ width: 160, height: 90, close: () => closed.push(1) });
    const url = await makeThumb({ name: "IMG_1.JPG" }, r);
    expect(calls).toEqual([["IMG_1.JPG", { resizeWidth: 160, resizeQuality: "medium", imageOrientation: "from-image" }]]);
    expect(closed).toHaveLength(1); expect(url).toMatch(/^blob:fake\//); expect(r.canvases).toHaveLength(1); expect([r.canvases[0].width, r.canvases[0].height]).toEqual([0, 0]);
    expect(r.log.find((e) => e[0] === "toBlob").slice(1, 4)).toEqual([160, 90, "image/jpeg"]);
  });
  test("a bitmap larger than asked (a browser that ignores resizeWidth) is scaled down in the canvas", async () => {
    const { r } = mk({ width: 4000, height: 3000, close() {} }); await makeThumb({ name: "big.jpg" }, r);
    expect(r.log.find((e) => e[0] === "toBlob").slice(1, 3)).toEqual([160, 120]);
  });
  test("a photo the browser cannot decode (HEIC outside Safari) gives '' and the tile shows its type; no createImageBitmap at all gives '' too", async () => {
    const { r } = mk(null, true); expect(await makeThumb({ name: "IMG.HEIC" }, r)).toBe(""); expect(r.urls.size).toBe(0);
    const r2 = rig(); expect(await makeThumb({ name: "a.jpg" }, r2)).toBe(""); expect(r2.canvases).toHaveLength(0);
    const r3 = rig(); r3.win.createImageBitmap = async () => ({ width: 10, height: 10, close() {} }); r3.URLApi = null; expect(await makeThumb({ name: "a.jpg" }, r3)).toBe("");
  });
  test("a bitmap is closed even when drawing it fails", async () => {
    const closed = []; const { r } = mk({ width: 160, height: 90, close: () => closed.push(1) }); r.doc.createElement = () => ({ width: 0, height: 0, getContext: () => { throw new Error("no 2d"); } });
    expect(await makeThumb({ name: "a.jpg" }, r)).toBe(""); expect(closed).toHaveLength(1);
  });
});
