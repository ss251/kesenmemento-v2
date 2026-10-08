// [contrib] The picture parts of the report sheet: the screenshot of the view (one more frame read back in the same task, scaled to at most
// 1600 px wide, JPEG) and the small thumbnails of the photos the visitor picks. Both are careful about phone memory:
//   - no render target changes size and no texture is created (the frame is drawn at the canvas's own size, then scaled in a 2D canvas),
//   - every canvas that was made is shrunk to 0 x 0 as soon as its pixels are encoded (iOS keeps a canvas's backing store until it is),
//   - the preview in the sheet is a separate ~480 px JPEG, so a second large image is never decoded for display,
//   - a picked photo is decoded at thumbnail size (createImageBitmap resizeWidth) one at a time, never as a full-size <img>.
// The 1600 px blob goes to the backend; release() drops it and revokes the preview URL.
import { SHOT, LIMITS, shotSize, thumbSize } from './contrib-lib.js';

/** canvas.toBlob as a promise (null when the browser cannot encode it). */
export function toBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') return resolve(null);
    try { canvas.toBlob((b) => resolve(b || null), type, quality); } catch { resolve(null); }
  });
}
/** Give a canvas's memory back now (a 0 x 0 canvas holds no backing store). */
export function freeCanvas(c) { if (c) { try { c.width = 0; c.height = 0; } catch { /* nothing to free */ } } }

/**
 * Capture the view the visitor is looking at, as a report screenshot. ctx: the app context (renderer, pipeline, camera, scene, sunDir, time, sky).
 * -> { blob (JPEG <= 8 MB), w, h, bytes, thumb (blob URL of a ~480 px JPEG), thumbW, thumbH, release() }. Throws when nothing can be read.
 * It must run synchronously from the click that opens the sheet: the WebGL drawing buffer is not preserved across frames, so the frame is drawn
 * again and read back in this same task (photo mode does the same).
 */
export async function captureView(ctx, { doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null, URLApi = typeof URL !== 'undefined' ? URL : null } = {}) {
  const r = ctx?.renderer, pipe = ctx?.pipeline, cam = ctx?.camera;
  if (!r || !pipe || !cam || !doc) throw new Error('no renderer to read');
  const src = r.domElement;
  ctx.sky?.update?.(ctx.time, cam);
  pipe.render(ctx.scene, cam, ctx.sunDir, ctx.time);   // the frame the visitor sees, drawn again at the same size (no resize, no new target)
  const sw = src.width || src.clientWidth, sh = src.height || src.clientHeight;
  if (!(sw > 0 && sh > 0)) throw new Error('the canvas is empty');
  const { w, h } = shotSize(sw, sh, { dpr: win?.devicePixelRatio || 1 });
  const big = doc.createElement('canvas'), small = doc.createElement('canvas');
  try {
    big.width = w; big.height = h;
    const g = big.getContext('2d', { alpha: false });
    if (!g) throw new Error('no 2d canvas');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, w, h);
    const th = thumbSize(w, h);
    small.width = th.w; small.height = th.h;
    small.getContext('2d', { alpha: false }).drawImage(big, 0, 0, th.w, th.h);
    let q = SHOT.quality, blob = await toBlob(big, 'image/jpeg', q);
    for (let i = 0; blob && blob.size > LIMITS.shotBytes && i < 3; i++) { q -= 0.15; blob = await toBlob(big, 'image/jpeg', q); }   // (a 1600 px frame is far under 8 MB; this is a guard)
    const thumbBlob = await toBlob(small, 'image/jpeg', SHOT.thumbQuality);
    if (!blob || !blob.size) throw new Error('the browser could not encode the screenshot');
    const url = thumbBlob && URLApi?.createObjectURL ? URLApi.createObjectURL(thumbBlob) : '';
    let live = true;
    const out = {
      blob, w, h, bytes: blob.size, thumb: url, thumbW: th.w, thumbH: th.h,
      /** Drop the blob and the preview URL (the sheet calls it when it closes or the report is sent). */
      release() { if (!live) return; live = false; if (url) try { URLApi.revokeObjectURL(url); } catch { /* gone already */ } out.blob = null; out.thumb = ''; },
    };
    return out;
  } finally { freeCanvas(big); freeCanvas(small); }
}

/**
 * A thumbnail URL for a picked photo (JPEG, `width` px wide), or '' when the browser cannot decode it (HEIC outside Safari): the tile then
 * shows its file type instead. The photo is decoded at thumbnail size and closed again; the original File is never read into memory here.
 */
export async function makeThumb(file, { doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null, URLApi = typeof URL !== 'undefined' ? URL : null, width = 160 } = {}) {
  if (!doc || !win?.createImageBitmap || !URLApi?.createObjectURL) return '';
  let bmp = null, c = null;
  try {
    bmp = await win.createImageBitmap(file, { resizeWidth: width, resizeQuality: 'medium', imageOrientation: 'from-image' });
    const k = Math.min(1, width / (bmp.width || width));
    c = doc.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d', { alpha: false }).drawImage(bmp, 0, 0, c.width, c.height);
    const b = await toBlob(c, 'image/jpeg', 0.7);
    return b ? URLApi.createObjectURL(b) : '';
  } catch { return ''; } finally { try { bmp?.close?.(); } catch { /* ok */ } freeCanvas(c); }
}
