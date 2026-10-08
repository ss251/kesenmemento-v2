// [perf] Does a change show? Renders the same shot-mode frame with and without a toggle in the same page and compares the pixels.
// window.__abdiff(name) -> { pixels, changed (any channel off by more than 2), maxDiff, meanDiff, toggled } for the current view.
// Toggles:
//   singlepass  forceSinglePass on every transparent double-sided material (three.js draws those twice a frame, back faces then front,
//               bumping the material's version twice per draw: a program check and its garbage each time)
//   ndsort      the outline pre-pass sorted by program variant first (instanced, batched, skinned, vertex colours), then as before: fewer
//               variant switches of the one override material, each of which makes three.js rebuild its program parameters
(() => {
  if (window.__abdiff) return 'again';
  const ctx = window.__ctx, r = ctx.renderer, gl = r.getContext(), P = ctx.pipeline;
  const variant = (o, g) => (o.isInstancedMesh ? 1 : 0) | (o.isSkinnedMesh ? 2 : 0) | (o.isBatchedMesh ? 64 : 0) | (g && g.attributes.color ? (g.attributes.color.itemSize === 4 ? 8 : 4) : 0) | (o.isInstancedMesh && o.instanceColor ? 16 : 0) | (g && g.morphAttributes && g.morphAttributes.position ? 32 : 0);
  const T = {
    singlepass: {
      on() { const ms = new Set(); ctx.scene.traverse((o) => { const m = o.material; for (const x of Array.isArray(m) ? m : m ? [m] : []) if (x.transparent && x.side === 2 && !x.forceSinglePass) ms.add(x); }); for (const m of ms) m.forceSinglePass = true; this.ms = ms; return ms.size; },
      off() { for (const m of this.ms || []) m.forceSinglePass = false; },
    },
    ndsort: {
      on() { const s0 = r.setOpaqueSort.bind(r); this.s0 = s0; let n = 0; r.setOpaqueSort = (fn) => { if (fn) { n++; return s0((a, b) => (variant(a.object, a.geometry) - variant(b.object, b.geometry)) || fn(a, b)); } return s0(fn); }; return 'wrapped'; },
      off() { if (this.s0) r.setOpaqueSort = this.s0; },
    },
  };
  const W = r.domElement.width, H = r.domElement.height;
  const read = () => { const px = new Uint8Array(W * H * 4); P.render(ctx.scene, ctx.camera, ctx.sunDir, ctx.time); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  window.__abdiff = (name) => {
    const t = T[name]; if (!t) throw new Error('no toggle ' + name);
    read(); const a = read();   // twice: the first frame after a pose can still settle (shadow map, culling)
    const toggled = t.on();
    read(); const b = read();
    t.off();
    const c = read();   // and back: A again, to see the noise floor
    let changed = 0, maxDiff = 0, sum = 0, noise = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (d > 2) changed++; if (d > maxDiff) maxDiff = d; sum += d;
      const e = Math.max(Math.abs(a[i] - c[i]), Math.abs(a[i + 1] - c[i + 1]), Math.abs(a[i + 2] - c[i + 2])); if (e > 2) noise++;
    }
    return { pixels: W * H, changed, noiseChanged: noise, maxDiff, meanDiff: +(sum / (W * H)).toFixed(4), toggled };
  };
  return 'ok';
})();
