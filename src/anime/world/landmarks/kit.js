// [v4:landmarks-B] Shared building kit for the civic landmarks (city hall, station, museum, hospitals, schools, temples,
// 大島): facades whose windows glow at night (life's window registry), walls straight up from any footprint, flat roofs
// with parapets, gable / hip / 入母屋 roofs over an oriented box, footings down to the terrain, colliders, signs.
// Geometry helpers that already exist in harbor/lmkit.js (landmarks-A) are reused, not copied.
import * as THREE from 'three';
import { windowGlow } from '../life/lights.js';
import { openRing, signedArea, offsetRing, capGeo, obbOf, quadsGeo, prismWalls } from '../harbor/lmkit.js';
import { vTextTex, mapMat, FONT } from '../harbor/util.js';
import { nightMat } from '../harbor/lights.js';

export { openRing, signedArea, offsetRing, capGeo, obbOf, quadsGeo, prismWalls, vTextTex, mapMat, FONT, nightMat };

/**
 * A one-line text texture, like harbor/util.js textTex but with the font size solved in one measurement (the harbour
 * helper shrinks the size 2 px at a time, and each measureText of a Japanese web font costs milliseconds in Chrome:
 * a long sign took ~100 measurements).
 */
export function textTex(ctx, text, { w = 512, h = 128, color = '#2b2a33', bg = null, font = FONT.serif, weight = 900, size = 0.7, stroke = null, key } = {}) {
  return ctx.tex.draw(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    let s = h * size; g.font = `${weight} ${s}px ${font}`;
    const m = g.measureText(text).width;
    if (m > w * 0.94) { s = Math.max(8, Math.floor(s * (w * 0.94) / m)); g.font = `${weight} ${s}px ${font}`; }
    if (stroke) { g.lineWidth = s * 0.12; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(text, w / 2, h * 0.54); }
    g.fillText(text, w / 2, h * 0.54);
  }, { key: key || `lmBtxt|${text}|${w}|${h}|${color}|${bg}|${weight}|${size}|${stroke}|${font}` });
}

/** A group at the world origin added as static scenery (merged by material after the build), with a kit on it. */
export function group(ctx, name) { const g = new THREE.Group(); g.name = name; ctx.addStatic(g); return { g, k: ctx.kit(g) }; }

/** World point of a local (lx along the OBB's short side w, lz along its long side d) in an obbOf() frame. */
export function obbPt(o, lx, lz) { return [o.cx + lx * o.uz + lz * o.ux, o.cz - lx * o.ux + lz * o.uz]; }

/** Rectangle ring (world) of an OBB, optionally grown by g metres. Local x ∈ ±w/2, z ∈ ±d/2. */
export function obbRing(o, g = 0, w = o.w, d = o.d) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => obbPt(o, a * (w / 2 + g), b * (d / 2 + g)));
}

/** An oriented box frame from a centre, a bearing of the long side (rotY) and sizes. */
export function frame(cx, cz, w, d, rotY) { return { cx, cz, w, d, rotY, ux: Math.sin(rotY), uz: Math.cos(rotY) }; }

/** Lowest / highest terrain under a ring (vertices, edge midpoints and the centroid). */
export function groundSpan(L, poly) {
  const P = openRing(poly); let lo = Infinity, hi = -Infinity, cx = 0, cz = 0;
  const s = (x, z) => { const h = L.heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); };
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s(a[0], a[1]); s((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); cx += a[0] / P.length; cz += a[1] / P.length; }
  s(cx, cz);
  return { lo, hi, mid: L.heightAt(cx, cz), cx, cz };
}

export function centroid(poly) { const P = openRing(poly); let x = 0, z = 0; for (const p of P) { x += p[0]; z += p[1]; } return [x / P.length, z / P.length]; }
export function ringArea(poly) { return Math.abs(signedArea(openRing(poly))); }
export function inRing(x, z, poly) {
  let c = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) { const [xi, zi] = poly[i], [xk, zk] = poly[k]; if ((zi > z) !== (zk > z) && x < ((xk - xi) * (z - zi)) / (zk - zi) + xi) c = !c; }
  return c;
}

/**
 * Walls of a prism over a ring with facade UVs: u = metres along the perimeter / tu (one texture cell per tu metres),
 * v = (y − yRef) / tv (one cell per storey). y0 / y1 are numbers or (x, z) → y. Faces point outward.
 */
export function wallGeo(poly, y0, y1, { tu = 3.6, tv = 3.6, yRef = null, skip = null } = {}) {
  const P = openRing(poly), sign = Math.sign(signedArea(P)) || 1;
  const Y0 = typeof y0 === 'function' ? y0 : () => y0, Y1 = typeof y1 === 'function' ? y1 : () => y1;
  const ref = yRef ?? (typeof y0 === 'number' ? y0 : 0);
  const pos = [], uv = [], nrm = [];
  let u = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05 || (skip && skip(i, a, b, len))) { u += len; continue; }
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const n = sign > 0 ? [dz / len, -dx / len] : [-dz / len, dx / len];
    // snap each wall's u start to a whole cell so windows never straddle a corner
    const u0 = Math.ceil(u / tu - 1e-6) * tu + (len % tu) / 2;
    const q = [[a[0], Y0(a[0], a[1]), a[1], u0], [b[0], Y0(b[0], b[1]), b[1], u0 + len], [b[0], Y1(b[0], b[1]), b[1], u0 + len], [a[0], Y1(a[0], a[1]), a[1], u0]];
    const tri = (i0, i1, i2) => { for (const v of [q[i0], q[i1], q[i2]]) { pos.push(v[0], v[1], v[2]); uv.push(v[3] / tu, (v[1] - ref) / tv); nrm.push(n[0], 0, n[1]); } };
    if (-dz * n[0] + dx * n[1] > 0) { tri(0, 1, 2); tri(0, 2, 3); } else { tri(0, 2, 1); tri(0, 3, 2); }
    u = u0 + len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// ------------------------------------------------------------------------------------------------ facade materials
const FAC_CACHE = new WeakMap();
/**
 * A cel facade: one repeating texture cell (tu × tv metres) painted by `draw(g, W, H)`, whose window rectangle
 * `win` = [x0, y0, x1, y1] (fractions of the cell, y up) darkens and glows warm at night through life's window
 * registry (lit fraction `lit`). Materials are cached by `key`, so equal facades batch together.
 */
export function facadeMat(ctx, key, { draw, win = [0.2, 0.3, 0.8, 0.85], lit = 0.4, W = 128, H = 128, paint = 0.03 } = {}) {
  let cache = FAC_CACHE.get(ctx); if (!cache) FAC_CACHE.set(ctx, (cache = new Map()));
  if (cache.has(key)) return cache.get(key);
  const tex = ctx.tex.draw(W, H, (g, w, h) => draw(g, w, h), { key: 'lmB-fac-' + key, repeat: [1, 1] });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4; tex.needsUpdate = true;
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, map: tex, gradientMap: ctx.mat.gradientMap });
  const Wg = windowGlow(ctx);
  const seed = (hash(key) % 997) / 997;
  m.onBeforeCompile = (sh) => {
    Wg.patch(sh);
    sh.uniforms.uLmWin = { value: new THREE.Vector4(...win) };
    sh.uniforms.uLmLit = { value: lit };
    sh.uniforms.uLmSeed = { value: seed };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLmUV; varying vec3 vLmW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n vLmUV = uv; vLmW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLmUV; varying vec3 vLmW; uniform vec4 uLmWin; uniform float uLmLit, uLmSeed;')
      .replace('void main() {', 'void main() {\n vec3 lmGlow = vec3(0.0);')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 f = fract(vLmUV); vec2 cid = floor(vLmUV);
          float inW = step(uLmWin.x, f.x) * step(f.x, uLmWin.z) * step(uLmWin.y, f.y) * step(f.y, uLmWin.w);
          float nightK = klcWindowNight();
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.32, inW * nightK);
          vec3 cell = vec3(cid.x + floor(vLmW.x * 0.01) * 17.0, cid.y, uLmSeed * 131.0 + floor(vLmW.z * 0.01));
          float dist = length(vLmW - cameraPosition);
          lmGlow = klcWindowGlow(cell, uLmLit) * inW * (1.0 - smoothstep(2400.0, 4600.0, dist));
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += lmGlow;');
  };
  m.customProgramCacheKey = () => 'lmB-fac';
  m.name = 'lmB-fac|' + key;
  cache.set(key, m);
  return m;
}

export function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** The standard painter for a facade cell: wall, a window with frame / sill / sky-tinted glass, optional mullions. */
export function paintWindow({ wall, frame = '#e8eae6', glass = ['#5d7390', '#a9bccb'], sill = null, mull = 0, band = null, curtain = null, win }) {
  return (g, W, H) => {
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    if (band) { g.fillStyle = band.c; g.fillRect(0, H * (1 - band.y1), W, H * (band.y1 - band.y0)); }
    const [x0, y0, x1, y1] = win, X0 = x0 * W, X1 = x1 * W, Y0 = (1 - y1) * H, Y1 = (1 - y0) * H;
    g.fillStyle = frame; g.fillRect(X0 - 2, Y0 - 2, X1 - X0 + 4, Y1 - Y0 + 4);
    const gr = g.createLinearGradient(0, Y0, 0, Y1); gr.addColorStop(0, glass[0]); gr.addColorStop(1, glass[1]);
    g.fillStyle = gr; g.fillRect(X0 + 1, Y0 + 1, X1 - X0 - 2, Y1 - Y0 - 2);
    if (curtain) { g.fillStyle = curtain; g.fillRect(X0 + 1, Y0 + 1, (X1 - X0) * 0.22, (Y1 - Y0) * 0.8); }
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(X0 + 3, Y0 + 3, (X1 - X0) * 0.18, 2);
    g.fillStyle = frame;
    for (let i = 1; i <= mull; i++) g.fillRect(X0 + (X1 - X0) * i / (mull + 1) - 1, Y0, 2.5, Y1 - Y0);
    if (sill) { g.fillStyle = sill; g.fillRect(X0 - 4, Y1 + 1, X1 - X0 + 8, 3); }
  };
}

/** Flat roof over a ring at y: the roof slab (colour `roof`) and a parapet `par` metres high (wall-coloured top). */
export function flatRoof(k, poly, y, roofMat, parMat, par = 0.8, inset = 0.25) {
  k.mesh(capGeo(poly, y + 0.02, { tile: 3 }), roofMat);
  if (par > 0) {
    k.mesh(prismWalls(poly, y, y + par, { tile: 3 }), parMat);
    const inner = offsetRing(poly, -inset);
    const g = prismWalls(inner, y, y + par, { tile: 3 }); flipFaces(g); k.mesh(g, parMat);
    // coping: a thin ring cap on the parapet
    k.mesh(capGeo(poly, y + par, { tile: 3, holes: [inner] }), parMat);
  }
}

/** Reverse the winding (and normals) of a non-indexed geometry: inner faces of parapets. */
export function flipFaces(g) {
  const p = g.attributes.position.array, u = g.attributes.uv?.array, n = g.attributes.normal?.array;
  for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t; }
  if (u) for (let i = 0; i < u.length; i += 6) for (let c = 0; c < 2; c++) { const t = u[i + 2 + c]; u[i + 2 + c] = u[i + 4 + c]; u[i + 4 + c] = t; }
  if (n) for (let i = 0; i < n.length; i++) n[i] = -n[i];
  g.attributes.position.needsUpdate = true;
  return g;
}

/**
 * A pitched roof over an oriented box: 'gable' (ridge along the long side d), 'hip', or 'irimoya' (hip below a
 * small gable, the temple roof). `pitch` = rise per metre of run, `over` = eave overhang. Returns { roof, gables }
 * geometries: the roof planes and (for gable / irimoya) the triangular gable ends to be drawn in the wall material.
 */
export function pitchedRoof(o, y, { kind = 'gable', pitch = 0.5, over = 0.6, gableOver = null, th = 0.18, along = 'd' } = {}) {
  const alongD = along === 'd';
  const W = (alongD ? o.w : o.d) / 2 + over, D = (alongD ? o.d : o.w) / 2 + (gableOver ?? over);
  const P = (a, b, h) => { const [x, z] = alongD ? obbPt(o, a, b) : obbPt(o, b, a); return [x, y + h, z]; };
  const rise = W * pitch;
  const quads = [], gtri = [];
  const up = [0, 1, 0];
  if (kind === 'gable') {
    quads.push([P(-W, -D, 0), P(-W, D, 0), P(0, D, rise), P(0, -D, rise), up]);
    quads.push([P(W, -D, 0), P(W, D, 0), P(0, D, rise), P(0, -D, rise), up]);
    const Dw = D - (gableOver ?? over), Ww = W - over;
    gtri.push([P(-Ww, -Dw, over * pitch), P(Ww, -Dw, over * pitch), P(0, -Dw, rise)], [P(-Ww, Dw, over * pitch), P(Ww, Dw, over * pitch), P(0, Dw, rise)]);
  } else {
    const hipIn = kind === 'irimoya' ? W * 0.55 : W;   // how far the hip ends run in along the ridge
    const rD = Math.max(0.3, D - hipIn);
    quads.push([P(-W, -D, 0), P(-W, D, 0), P(0, rD, rise), P(0, -rD, rise), up]);
    quads.push([P(W, -D, 0), P(W, D, 0), P(0, rD, rise), P(0, -rD, rise), up]);
    // hip ends as triangles (degenerate quads)
    quads.push([P(-W, D, 0), P(W, D, 0), P(0, rD, rise), P(0, rD, rise), up]);
    quads.push([P(-W, -D, 0), P(W, -D, 0), P(0, -rD, rise), P(0, -rD, rise), up]);
    if (kind === 'irimoya') {
      // the small gable (妻) above the hips: a vertical triangle set back on each end
      const gy = rise * 0.45, gw = W * (1 - 0.45);
      gtri.push([P(-gw, -rD, gy), P(gw, -rD, gy), P(0, -rD, rise)], [P(-gw, rD, gy), P(gw, rD, gy), P(0, rD, rise)]);
    }
  }
  const roof = quadsGeo(quads, 2);
  // a thickness band along the eaves (fascia), so the roof reads as a slab from below
  const f = [];
  const ring = [P(-W, -D, 0), P(W, -D, 0), P(W, D, 0), P(-W, D, 0)];
  for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i + 1) % 4]; const c = [(a[0] + b[0]) / 2 - (o.cx), 0, (a[2] + b[2]) / 2 - (o.cz)]; f.push([a, b, [b[0], b[1] - th, b[2]], [a[0], a[1] - th, a[2]], c]); }
  const fascia = quadsGeo(f, 2);
  const gables = gtri.length ? triGeo(gtri) : null;
  return { roof, gables, fascia, rise, W, D };
}

/** Triangles [[a, b, c], ...] → double-sided-safe geometry (both windings). */
export function triGeo(tris) {
  const pos = [];
  for (const [a, b, c] of tris) pos.push(...a, ...b, ...c, ...a, ...c, ...b);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = []; for (let i = 0; i < pos.length / 3; i++) uv.push(pos[i * 3] / 3.6, pos[i * 3 + 1] / 3.6);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Wall colliders along a ring (the player cannot walk through the building), from y0 to y1. */
export function colliders(ctx, poly, y0, y1, th = 0.5) {
  const ph = ctx.physics; if (!ph?.addBox) return;
  const P = openRing(poly), sign = Math.sign(signedArea(P)) || 1;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.4) continue;
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, n = sign > 0 ? [uz, -ux] : [-uz, ux];
    const parts = Math.max(1, Math.ceil(len / 18));
    for (let j = 0; j < parts; j++) { const s = (j + 0.5) * len / parts; ph.addBox(a[0] + ux * s - n[0] * th / 2, a[1] + uz * s - n[1] * th / 2, th, len / parts + th, Math.atan2(ux, uz), y0, y1); }
  }
}

/** One straight wall collider from a to b (0.4 m thick). */
export function wallCollider(ctx, a, b, y0, y1, th = 0.4) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.2 || !ctx.physics?.addBox) return;
  ctx.physics.addBox((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, th, len, Math.atan2(b[0] - a[0], b[1] - a[1]), y0, y1);
}

/** A sign board: text on a coloured plate, facing rotY, centred at (x, y, z). */
export function sign(ctx, k, text, w, h, x, y, z, rotY, { color = '#2b2a33', bg = '#f2f0ea', font = FONT.sans, weight = 800, size = 0.66, depth = 0.12, frame = null } = {}) {
  const tex = textTex(ctx, text, { w: 1024, h: Math.max(64, Math.round(1024 * h / w)), color, bg, font, weight, size });
  const face = mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0 });
  const g = k.group([x, y, z], rotY);
  const kk = ctx.kit(g);
  kk.box(w + 0.06, h + 0.06, depth, ctx.mat.toon(frame || bg, { paint: 0 }), [0, 0, -depth / 2 - 0.005]);
  kk.plane(w, h, face, [0, 0, 0.004]);
  return g;
}

/** Vertical sign (縦書き), e.g. a gate name plate. */
export function vsign(ctx, k, text, w, h, x, y, z, rotY, { color = '#2b2a33', bg = '#f2ece0', font = FONT.serif, depth = 0.1 } = {}) {
  const tex = vTextTex(ctx, text, { w: 128, h: Math.round(128 * h / w), color, bg, font, weight: 800 });
  const g = k.group([x, y, z], rotY); const kk = ctx.kit(g);
  kk.box(w + 0.08, h + 0.08, depth, ctx.mat.toon('#5a4a3c', { paint: 0 }), [0, 0, -depth / 2 - 0.005]);
  kk.plane(w, h, mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0 }), [0, 0, 0.004]);
  return g;
}

/** Bearing (rotY) that faces from a toward b. */
export function faceTo(a, b) { return Math.atan2(b[0] - a[0], b[1] - a[1]); }

/** Longest edge of a ring: { a, b, len, ux, uz, n (outward normal) }. */
export function edges(poly) {
  const P = openRing(poly), sign = Math.sign(signedArea(P)) || 1, out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.05) continue;
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    out.push({ i, a, b, len, ux, uz, n: sign > 0 ? [uz, -ux] : [-uz, ux], mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  }
  return out;
}

/** A simple instanced tree clump (cel foliage balls on a trunk) for groves, school yards and hospital grounds. */
export function treeClump(ctx, k, x, y, z, s = 1, { leaf = '#5f8a4a', leafLit = '#7fa65a', trunk = '#6e5a48', conifer = false } = {}) {
  const tm = ctx.mat.toon(trunk, { paint: 0.02, name: 'lmB-tree-trunk' });   // named: the accuracy audit skips foliage
  k.cyl(0.18 * s, 0.26 * s, 3.2 * s, tm, [x, y + 1.6 * s, z], null, 6);
  if (conifer) {
    const lm = ctx.mat.toon(leaf, { paint: 0.08, name: 'lmB-tree-leaf' });
    for (let i = 0; i < 3; i++) k.cyl(0.05, (2.4 - i * 0.6) * s, 3.2 * s, lm, [x, y + (3.4 + i * 1.9) * s, z], null, 7);
    return;
  }
  const a = ctx.mat.toon(leaf, { paint: 0.08, name: 'lmB-tree-leaf' }), b = ctx.mat.toon(leafLit, { paint: 0.08, name: 'lmB-tree-leaf' });
  k.sphere(2.0 * s, a, [x, y + 4.4 * s, z], 7);
  k.sphere(1.5 * s, b, [x + 0.9 * s, y + 5.3 * s, z - 0.4 * s], 7);
  k.sphere(1.4 * s, a, [x - 1.0 * s, y + 4.9 * s, z + 0.6 * s], 7);
}
