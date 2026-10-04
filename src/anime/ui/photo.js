// [v3:life] Photo mode: a 16:9 3840x2160 PNG (4K UHD) at scale 1, rendered off-screen through the full pipeline
// (outlines, bloom, grading, light leak) whatever the window shape. The UI is never in it (only the canvas is read).
//   const r = await takePhoto(ctx, T, { scale, data, noDownload })  ->  { w, h, bytes, name, url? }
//   photoSize(scale) -> { w, h }
export function photoSize(scale = 1) { return { w: Math.round(3840 * scale), h: Math.round(2160 * scale) }; }

export async function takePhoto(ctx, T, o = {}) {
  const r = ctx.renderer, pipe = ctx.pipeline, cam = ctx.camera, sky = ctx.sky;
  if (!r || !pipe || !cam) return null;
  const { w: W, h: H } = photoSize(o.scale ?? 1);
  const aspect0 = cam.aspect;
  let url = null, blob = null;
  document.body.classList.add('klc-photo');   // [v7:pad] the touch pad steps aside while the photo is taken
  try {
    r.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
    pipe.setSize(W, H, 1); ctx.wires?.setResolution?.(pipe.size.x, pipe.size.y);
    sky?.update?.(ctx.time, cam);
    pipe.render(ctx.scene, cam, ctx.sunDir, ctx.time);
    // read back in the same task as the render (the drawing buffer is not preserved across frames)
    if (o.data || !r.domElement.toBlob) url = r.domElement.toDataURL('image/png');
    else blob = await new Promise((res) => r.domElement.toBlob(res, 'image/png'));
  } finally {
    document.body.classList.remove('klc-photo');
    cam.aspect = aspect0; cam.updateProjectionMatrix();
    dispatchEvent(new Event('resize'));
  }
  const clock = T?.clock ? T.clock().replace(':', '') : 'photo';
  const name = `kesennuma-${clock}-${T?.preset || 'photo'}.png`;
  const href = blob ? URL.createObjectURL(blob) : url;
  if (!o.noDownload) { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  if (blob) setTimeout(() => URL.revokeObjectURL(href), 4000);
  const res = { w: W, h: H, bytes: blob ? blob.size : url.length, name };
  if (o.data) res.url = url;
  if (typeof window !== 'undefined') window.__lastPhoto = { w: W, h: H, bytes: res.bytes, name };
  return res;
}
