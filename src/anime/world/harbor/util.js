// [v3:harbor] Small shared helpers for the harbour kit (geometry between points, lines, poses, labels).
import * as THREE from 'three';

const _up = new THREE.Vector3(0, 1, 0);
const _geoCache = new Map();
function openCyl(seg) { const k = 'oc' + seg; if (!_geoCache.has(k)) _geoCache.set(k, new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1, false).translate(0, 0.5, 0)); return _geoCache.get(k); }

/** A cylinder of radius r from a to b (arrays or Vector3, parent-local). */
export function bar(parent, a, b, r, mat, seg = 6) {
  const A = Array.isArray(a) ? new THREE.Vector3(...a) : a, B = Array.isArray(b) ? new THREE.Vector3(...b) : b;
  const d = new THREE.Vector3().subVectors(B, A); const len = d.length();
  const m = new THREE.Mesh(openCyl(seg), mat);
  m.scale.set(r * 2, len, r * 2);
  m.quaternion.setFromUnitVectors(_up, d.normalize());
  m.position.copy(A);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * Lines (rigging, poles, ropes, railings) for an object built in a local group.
 * Static objects use ctx.wires (screen-space ribbons: never alias, one draw call); dynamic ones get thin cylinders.
 * Call after the group has its final transform.
 */
export function makeLiner(ctx, group, dynamic = false) {
  const tmp = new THREE.Vector3();
  const cylMats = new Map();
  return {
    line(points, { width = 0.03, color = '#3a3640', minR = 0.02 } = {}) {
      if (!dynamic) {
        group.updateWorldMatrix(true, false);
        const pts = points.map((p) => (Array.isArray(p) ? tmp.set(p[0], p[1], p[2]) : tmp.copy(p)).clone().applyMatrix4(group.matrixWorld));
        ctx.wires.add(pts, { width, color });
      } else {
        let m = cylMats.get(color); if (!m) cylMats.set(color, (m = ctx.mat.toon(color, { paint: 0 })));
        for (let i = 0; i < points.length - 1; i++) bar(group, points[i], points[i + 1], Math.max(minR, width / 2), m, 4);
      }
    },
  };
}

/** Sagging rope points between a and b. */
export function sagPts(a, b, sag, n = 10) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]); }
  return out;
}

/** Group placed at a pose {x, y, z, rotY} (Sakura convention: local +Z = forward). */
export function poseGroup(pose = {}, name = '') {
  const g = new THREE.Group(); g.name = name;
  g.position.set(pose.x || 0, pose.y || 0, pose.z || 0); g.rotation.y = pose.rotY || 0;
  return g;
}

/** Frame between two XZ points: {x, z, len, rotY (local +Z runs a->b), dir:[dx,dz], nrm:[nx,nz] (left of a->b)} */
export function segFrame(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  return { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, len, rotY: Math.atan2(ux, uz), dir: [ux, uz], nrm: [uz, -ux] };
}

export const FONT = {
  sans: '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
  serif: '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
  round: '"Zen Maru Gothic", "Noto Sans JP", sans-serif',
  brush: '"Yuji Syuku", "Noto Serif JP", serif',
  hand: '"Yusei Magic", "Zen Maru Gothic", sans-serif',
};

/** Painted-name texture (boat names, signs). Transparent background unless bg is set. */
export function textTex(ctx, text, { w = 512, h = 128, color = '#2b2a33', bg = null, font = FONT.serif, weight = 900, size = 0.7, stroke = null, key } = {}) {
  return ctx.tex.draw(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    let s = h * size; g.font = `${weight} ${s}px ${font}`;
    while (s > 8 && g.measureText(text).width > w * 0.94) { s -= 2; g.font = `${weight} ${s}px ${font}`; }
    if (stroke) { g.lineWidth = s * 0.12; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(text, w / 2, h * 0.54); }
    g.fillText(text, w / 2, h * 0.54);
  }, { key: key || `htxt|${text}|${w}|${h}|${color}|${bg}|${weight}|${size}|${stroke}` });
}

/** Vertical text texture (shrine banners, 幟). */
export function vTextTex(ctx, text, { w = 128, h = 512, color = '#2b2a33', bg = '#f2ece0', font = FONT.brush, weight = 700, border = null, key } = {}) {
  return ctx.tex.draw(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = w * 0.06; g.strokeRect(w * 0.05, w * 0.05, w * 0.9, h - w * 0.1); }
    const chars = [...text]; const s = Math.min(w * 0.72, (h * 0.86) / chars.length);
    g.fillStyle = color; g.font = `${weight} ${s}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    chars.forEach((c, i) => g.fillText(c, w / 2, h * 0.07 + s * (i + 0.5) * (h * 0.86 / (s * chars.length))));
  }, { key: key || `hvtxt|${text}|${w}|${h}|${color}|${bg}` });
}

/** Plane geometry with UVs in tiles of `tile` metres (so one wrapping texture fits any size).
 *  facing: 'up' (XZ plane, w along x, d along z) or 'side' (faces +X: w along z, h along y). */
export function metricPlane(w, d, tile = 4, facing = 'up', seg = 1) {
  const g = new THREE.PlaneGeometry(w, d, seg, seg);
  if (facing === 'up') g.rotateX(-Math.PI / 2); else g.rotateY(Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (facing === 'up') uv.setXY(i, p.getX(i) / tile, -p.getZ(i) / tile);
    else uv.setXY(i, -p.getZ(i) / tile, p.getY(i) / tile);
  }
  return g;
}

/**
 * ctx.mat.toon / ctx.mat.decal with a texture map, cached by texture uuid. Why: the core material cache keys with
 * JSON.stringify(opts, replacer), and JSON.stringify calls Texture.toJSON() BEFORE the replacer sees it, which
 * serialises the whole canvas (toDataURL, ~5 ms for 512 px) on EVERY call, even on a cache hit. This helper keeps
 * the texture out of the key (unique `name` instead) and assigns .map afterwards.
 */
const _mapMats = new WeakMap();
export function mapMat(ctx, kind, color, map, opts = {}) {
  let c = _mapMats.get(ctx); if (!c) _mapMats.set(ctx, (c = new Map()));
  const key = `${kind}|${color}|${map.uuid}|${JSON.stringify(opts)}`;
  if (c.has(key)) return c.get(key);
  const o = { ...opts, name: 'hmap|' + map.uuid };
  if (kind === 'decal') o.transparent = opts.transparent ?? true;
  const m = kind === 'decal' ? ctx.mat.decal(color, o) : ctx.mat.toon(color, o);
  m.map = map; m.needsUpdate = true;
  c.set(key, m);
  return m;
}
