// [v3:town] vendored from Sakuragaoka Station src/world/props/common.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Shared helpers for the props module: floor sampling, placement groups, geometry utilities.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { fitFontSize } from '../../../core/textures.js';   // [v4:polish1]

export const DEG = Math.PI / 180;

export function makeHelpers(ctx) {
  const { L, physics } = ctx;

  /** Floor height at (x,z): terrain, or a walkable surface an earlier module registered (≤ +0.4 m). */
  function floorAt(x, z) {
    const h = L.heightAt(x, z);
    let g = h;
    try { g = physics.groundHeight(x, z, h + 0.05); } catch (e) { g = h; }
    if (!Number.isFinite(g) || g > h + 0.4) g = h;
    return g;
  }
  /** min / max floor under an oriented footprint (w along local x, d along local z). */
  function footprint(cx, cz, w, d, rotY = 0) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    let mn = Infinity, mx = -Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const lx = a * w / 2, lz = b * d / 2;
      const y = floorAt(cx + lx * c + lz * s, cz - lx * s + lz * c);
      if (y < mn) mn = y; if (y > mx) mx = y;
    }
    return { min: mn, max: mx };
  }
  /** local (lx,lz) in a frame (cx,cz,rotY) -> world {x,z} */
  function toWorld(cx, cz, rotY, lx, lz) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    return { x: cx + lx * c + lz * s, z: cz - lx * s + lz * c };
  }
  /** Static group at a world position/rotation. */
  function place(x, y, z, rotY = 0, parent = null) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY;
    if (parent) parent.add(g); else ctx.addStatic(g);
    return g;
  }
  return { floorAt, footprint, toWorld, place };
}

// ------------------------------------------------------------------ geometry utilities

/** Remap a geometry's 0..1 UVs into a canvas-pixel rectangle of an atlas (x0,y0 from the top). */
export function cellUV(geo, x0, y0, w, h, W, H) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, (x0 + u * w) / W, 1 - (y0 + (1 - v) * h) / H);
  }
  uv.needsUpdate = true;
  return geo;
}
/** Point every UV of a geometry at one atlas pixel (flat colour swatch). */
export function solidUV(geo, px, py, W, H) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, px / W, 1 - py / H);
  uv.needsUpdate = true;
  return geo;
}
/** Make every geometry non-indexed with position/normal/uv only, then merge. */
export function mergeAll(geos) {
  const list = geos.map((g) => {
    let n = g.index ? g.toNonIndexed() : g.clone();
    if (!n.attributes.normal) n.computeVertexNormals();
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    n.clearGroups();
    return n;
  });
  const out = mergeGeoms(list);
  for (const g of list) g.dispose();
  return out;
}
function mergeGeoms(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
/** Transform helper: returns geo after translate/rotate (Euler xyz) in place. */
export function xf(geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = null) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])), scale ? new THREE.Vector3(...scale) : new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(m);
  return geo;
}
/** A back side for a single-sided sheet (flag, card): flipped normals + winding, u mirrored so text reads right from behind. */
export function backSide(geo, offset = 0.0015) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i += 3) {
    for (const k of ['position', 'normal', 'uv']) {
      const a = g.attributes[k], s = a.itemSize;
      for (let j = 0; j < s; j++) { const t = a.array[(i + 1) * s + j]; a.array[(i + 1) * s + j] = a.array[(i + 2) * s + j]; a.array[(i + 2) * s + j] = t; }
    }
  }
  for (let i = 0; i < n.count; i++) {
    n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    p.setXYZ(i, p.getX(i) - n.getX(i) * -offset, p.getY(i) - n.getY(i) * -offset, p.getZ(i) - n.getZ(i) * -offset);
    uv.setX(i, 1 - uv.getX(i));
  }
  return g;
}
/** Box geometry bent along x: y += bend(xNorm) where xNorm in [-1,1]. */
export function bentBox(w, h, d, seg, bend) {
  const g = new THREE.BoxGeometry(w, h, d, seg, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + bend(p.getX(i) / (w / 2)));
  g.computeVertexNormals();
  return g;
}
export function rboxGeo(w, h, d, r, seg = 2) { return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)); }

/** Pentagon (house-shaped) prism: ema plaque. Front face (+z) UV -> front rect, back/sides -> back rect (atlas px). */
export function emaGeo(w, h, t, front, back, W, H) {
  const sh = h * 0.72; // shoulder height
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, -h / 2 + sh], [0, h / 2], [-w / 2, -h / 2 + sh]];
  const pos = [], nor = [], uvs = [];
  const fu = (x, y, r) => [(r[0] + (x / w + 0.5) * r[2]) / W, 1 - (r[1] + (0.5 - y / h) * r[3]) / H];
  const tri = (a, b, c, z, nz, r, flipU) => {
    for (const q of (nz > 0 ? [a, b, c] : [a, c, b])) {
      pos.push(q[0], q[1], z); nor.push(0, 0, nz);
      const uv = fu(flipU ? -q[0] : q[0], q[1], r); uvs.push(uv[0], uv[1]);
    }
  };
  // fan triangulation (convex)
  for (let i = 1; i < 4; i++) { tri(pts[0], pts[i], pts[i + 1], t / 2, 1, front, false); tri(pts[0], pts[i], pts[i + 1], -t / 2, -1, back, true); }
  // sides
  const cu = (back[0] + back[2] / 2) / W, cv = 1 - (back[1] + back[3] / 2) / H;
  for (let i = 0; i < 5; i++) {
    const a = pts[i], b = pts[(i + 1) % 5];
    const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey), nx = ey / l, ny = -ex / l;
    const quad = [[a[0], a[1], t / 2], [b[0], b[1], t / 2], [b[0], b[1], -t / 2], [a[0], a[1], t / 2], [b[0], b[1], -t / 2], [a[0], a[1], -t / 2]];
    for (const q of quad) { pos.push(...q); nor.push(nx, ny, 0); uvs.push(cu, cv); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/** Wavy cloth sheet (flag) w×h facing +z, hanging from the top-left corner region. */
export function waveSheet(w, h, amp = 0.03, waves = 1.3, seed = 0) {
  const g = new THREE.PlaneGeometry(w, h, 10, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const u = x / w + 0.5, v = 0.5 - y / h;
    p.setZ(i, amp * Math.sin((u * waves + seed) * Math.PI * 2) * (0.4 + 0.6 * u) + amp * 0.35 * Math.sin((v * 1.5 + seed * 0.7) * Math.PI * 2) * u);
  }
  g.computeVertexNormals();
  return g;
}

/** Simple rounded-rect path helper for canvas. */
export function rr(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
/** 5-petal sakura flower on canvas. */
export function sakuraFlower(g, x, y, r, fill, center) {
  g.save(); g.translate(x, y); g.fillStyle = fill;
  for (let i = 0; i < 5; i++) {
    g.save(); g.rotate(i * Math.PI * 2 / 5);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-r * 0.55, -r * 0.35, -r * 0.5, -r * 0.95, -r * 0.12, -r);
    g.lineTo(0, -r * 0.84); g.lineTo(r * 0.12, -r);
    g.bezierCurveTo(r * 0.5, -r * 0.95, r * 0.55, -r * 0.35, 0, 0);
    g.fill(); g.restore();
  }
  if (center) { g.fillStyle = center; g.beginPath(); g.arc(0, 0, r * 0.22, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
/** Draw vertical Japanese text centered at x from y (canvas) with per-char size. */
export function vtext(g, text, x, y, size, font, weight = 700, gap = 1.04, color = null) {
  if (color) g.fillStyle = color;
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = 'center'; g.textBaseline = 'top';
  let yy = y;
  for (const ch of text) {
    if (ch === 'ー' || ch === '〜' || ch === '～') { g.save(); g.translate(x, yy + size / 2); g.rotate(Math.PI / 2); g.textBaseline = 'middle'; g.fillText(ch, 0, 0); g.restore(); }
    else g.fillText(ch, x, yy);
    yy += size * gap;
  }
  return yy;
}
/** Fit & draw a single line. */
export function ftext(g, text, x, y, maxW, size, font, weight = 700, color = null, align = 'center', base = 'middle') {
  if (color) g.fillStyle = color;
  g.textAlign = align; g.textBaseline = base;
  const s = fitFontSize(g, text, maxW, size, font, weight, 6);   // [v4:polish1] one cached measurement
  g.fillText(text, x, y);
  return s;
}
