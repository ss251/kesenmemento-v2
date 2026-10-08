// [v3:life] Photo mode: a 16:9 3840x2160 PNG (4K UHD) at scale 1, rendered off-screen through the full pipeline
// (outlines, bloom, grading, light leak) whatever the window shape. The UI is never in it (only the canvas is read).
// [ui-c2] On a PHONE (the phone tier, or a coarse pointer) the same pipeline renders 1920 px on the long side at the SCREEN's aspect (mobile review F1: 4K on an iPhone tab took +945 MB of
// footprint and was a crash risk; the 16:9 frame also kept the portrait camera, so the picture was ~120 degrees across against 48 on the screen). The camera's field of view comes from the
// ONE function the screen uses (core/fov.js, ctx.fovFor), so the picture shows what the screen shows. A phone then gets a card (ui/photo-share.js) whose button opens the share sheet
// (navigator.share with the PNG; the download when it cannot); 保存しました is said only after that has resolved. A desktop is unchanged: the PNG goes straight to Downloads.
// [contrib] The camera pose goes into the PNG as a tEXt chunk with the key "klc-pose" (ui/pngmeta.js, core/pose.js: x, y, z, latlon,
// heading, pitch, fov, mode, time, season, build), so a photo that is shared later still says where in the town it was taken.
//   const r = await takePhoto(ctx, T, { scale, data, noDownload, lang, note, text, hold, encodeTimeout })
//       ->  { w, h, bytes, name, pose, fov, phone, url?, delivery? }
//   hold('encoded')  (tools) awaited after the PNG is encoded, while the renderer, the pipeline and the camera are still at the photo's size: a sampler reads the working set of the photo there
//   encodeTimeout  ms to wait for the browser's PNG encode (default ENCODE_TIMEOUT_MS): a canvas that never answers must not leave the main loop stopped
//   delivery  (a phone, with the card): a promise that resolves once with 'shared' | 'downloaded' | 'closed' when the visitor has saved the picture or closed the card
//   note(text, ms) is the HUD's note line; text = { saving, saved } its strings: photo.js says them (the saving note before the render, the saved note after the delivery)
//   photoSize(scale) -> { w, h }                          the desktop frame
//   photoSizeFor(scale, { phone, aspect }) -> { w, h }    the frame for this device
import { capturePose, poseToJson, round } from '../core/pose.js';
import { embedTextInBlob, embedTextInDataUrl, POSE_KEY } from './pngmeta.js';
import { fovFor } from '../core/fov.js';
import { afterPaint } from '../core/paint.js';
import { createPhotoCard, downloadHref, dataUrlToBlob } from './photo-share.js';

export function photoSize(scale = 1) { return { w: Math.round(3840 * scale), h: Math.round(2160 * scale) }; }

/** [ui-c2] The long side of a phone photo at scale 1 (px). A quarter of 4K's pixels at 16:9, a fifth at a phone's 9:19.5. */
export const PHONE_LONG_SIDE = 1920;
/** [ui-c2] How long to wait for canvas.toBlob (ms): iOS Safari answers null under memory pressure and a lost context may never answer; ctx.shooting must not stay set for either. */
export const ENCODE_TIMEOUT_MS = 20000;

/** The frame for a device: a desktop's 4K (photoSize), a phone's 1920 px on the long side at the screen's own aspect (width / height). */
export function photoSizeFor(scale = 1, { phone = false, aspect = 16 / 9 } = {}) {
  if (!phone) return photoSize(scale);
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const long = Math.max(16, Math.round(PHONE_LONG_SIDE * scale));
  return a >= 1 ? { w: long, h: Math.max(8, Math.round(long / a)) } : { w: Math.max(8, Math.round(long * a)), h: long };
}

/** A phone for photo purposes: the phone tier (core/tier.js forces it on every touch device with a small screen, an iPad in desktop mode included) or a coarse primary pointer. */
export function photoIsPhone(ctx, env = {}) {
  if (ctx?.quality?.phone) return true;
  try { return !!(env.matchMedia ?? globalThis.matchMedia)?.call(globalThis, '(pointer: coarse)')?.matches; } catch { return false; }
}

let inflight = null;   // a second tap (or P) while the first photo is rendering gets the same photo, not a second render: three buffers of this size on a phone are the crash this row removes

/**
 * Take the photo. Never throws away a half-resized renderer: the sizes, the aspect and the field of view are always restored.
 * `o.noDownload` (tools): the PNG comes back and nothing else happens (no download, no card). `o.data`: a data URL comes back in `res.url` (and, without noDownload, is downloaded as before).
 */
export async function takePhoto(ctx, T, o = {}) {
  const r = ctx.renderer, pipe = ctx.pipeline, cam = ctx.camera;
  if (!r || !pipe || !cam) return null;
  if (inflight) return inflight;
  const run = shoot(ctx, T, o);
  const mine = run.finally(() => { if (inflight === mine) inflight = null; });
  inflight = mine;
  return mine;
}

async function shoot(ctx, T, o) {
  const r = ctx.renderer, pipe = ctx.pipeline, cam = ctx.camera, sky = ctx.sky;
  const phone = photoIsPhone(ctx, o.env);
  const aspect0 = cam.aspect, fov0 = cam.fov;
  const { w: W, h: H } = photoSizeFor(o.scale ?? 1, { phone, aspect: aspect0 });
  const say = (m, ms) => { try { if (m) o.note?.(m, ms); } catch { /* the HUD note is a courtesy */ } };
  // A phone with nobody asking for the bytes (not a tool): the card is up BEFORE the render blocks the thread, so the tap is answered at once (it says 撮影中… itself); a desktop keeps the note.
  let card = null;
  if (phone && !o.noDownload && !o.data) {
    try { card = createPhotoCard({ lang: o.lang, pad: ctx.pad, env: o.env }).show({ w: W, h: H }); } catch (e) { card = null; }
  }
  if (!card) say(o.text?.saving, 4000);
  if (card || o.note) await afterPaint();   // the note / the card is on the glass before the heavy task starts

  let url = null, blob = null, pose = null, fovUsed = cam.fov;
  try { pose = capturePose(ctx); } catch (e) { /* a camera without a pose: the photo is still saved, just without the chunk */ }
  document.body.classList.add('klc-photo');   // [v7:pad] the touch pad steps aside while the photo is taken
  ctx.shooting = true;   // [ui-c2] main.js frame() draws nothing until the photo is done: while the PNG is encoded the loop used to render a full frame at the photo's size every tick (a dozen 4K frames on a desktop)
  // [mobile-perf] the photo's pixels are W x H whatever the screen's canvas ratio: on a phone the canvas is 2 device px per CSS px now (main.js), and
  // setSize at that ratio would make a 3840 px canvas, the 4K buffers this photo path was built to avoid
  const pr0 = typeof r.getPixelRatio === 'function' ? r.getPixelRatio() : 1;
  try {
    if (pr0 !== 1) r.setPixelRatio(1);
    r.setSize(W, H, false); cam.aspect = W / H;
    cam.fov = ctx.fovFor ? ctx.fovFor(cam.aspect) : fovFor(cam.aspect);   // [ui-c2] the screen's own rule for this frame (a phone's frame has the screen's aspect, so the same angle as on screen)
    cam.updateProjectionMatrix(); fovUsed = cam.fov;
    pipe.setSize(W, H, 1); ctx.wires?.setResolution?.(pipe.size.x, pipe.size.y);
    sky?.update?.(ctx.time, cam);
    pipe.render(ctx.scene, cam, ctx.sunDir, ctx.time);
    // read back in the same task as the render (the drawing buffer is not preserved across frames)
    if (o.data || !r.domElement.toBlob) url = r.domElement.toDataURL('image/png');
    else blob = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('photo: the PNG encode did not answer')), o.encodeTimeout ?? ENCODE_TIMEOUT_MS);
      r.domElement.toBlob((b) => { clearTimeout(t); res(b); }, 'image/png');
    });
    if (!blob && !url) throw new Error('photo: the canvas gave no image');   // (toBlob answers null under memory pressure: the card must say so, not wait forever)
    if (o.hold) await o.hold('encoded');   // (not between the render and the readback: the browser clears an unpreserved drawing buffer when the task ends)
  } catch (e) {
    card?.fail();   // the card says so and keeps a close button; the error still reaches the caller
    throw e;
  } finally {
    ctx.shooting = false;
    document.body.classList.remove('klc-photo');
    cam.aspect = aspect0; cam.fov = fov0; cam.updateProjectionMatrix();
    if (pr0 !== 1) { r.setSize(1, 1, false); r.setPixelRatio(pr0); }   // [mobile-perf] the ratio back on a tiny canvas (never the photo's size at 2x); resize() sizes it
    dispatchEvent(new Event('resize'));
  }
  // [contrib] the pose chunk, after the camera is restored: a Blob is wrapped with Blob.slice (the 10 MB of pixels are not copied)
  if (pose) {
    pose.fov = round(fovUsed, 2);   // [ui-c2] the picture's own field of view (a portrait window's 88 degrees are not the 16:9 frame's)
    try {
      const json = poseToJson(pose);
      if (blob) blob = await embedTextInBlob(blob, POSE_KEY, json);
      else if (url) url = embedTextInDataUrl(url, POSE_KEY, json);
    } catch (e) { console.warn('photo: no pose chunk', e); }
  }
  const clock = T?.clock ? T.clock().replace(':', '') : 'photo';
  const name = `kesennuma-${clock}-${T?.preset || 'photo'}.png`;
  const bytes = blob ? blob.size : url.length;
  const res = { w: W, h: H, bytes, name, pose, fov: round(fovUsed, 2), phone };
  if (o.data) res.url = url;
  if (typeof window !== 'undefined') window.__lastPhoto = { w: W, h: H, bytes, name, pose, fov: res.fov, phone };

  if (card) {
    // a phone: the card shows the picture; its button shares it (the download when it cannot). The visitor's choice is `res.delivery`; 保存しました only after it.
    try {
      await card.ready({ blob: blob ?? dataUrlToBlob(url), name });
      res.delivery = card.done;
      card.done.then((how) => { if (how === 'shared' || how === 'downloaded') say(o.text?.saved); });
    } catch (e) { card.fail(); throw e; }
    return res;
  }
  const href = blob ? URL.createObjectURL(blob) : url;
  if (!o.noDownload) downloadHref(href, name, document, { revokeAfter: 0 });
  if (blob) setTimeout(() => URL.revokeObjectURL(href), 4000);
  say(o.text?.saved);
  return res;
}
