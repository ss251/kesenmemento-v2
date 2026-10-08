// [play] The golden bonito, 0.9 m long, built from the title logo's カツオ
// (tools/anime/title-logo.mjs, FISH: torpedo body, crescent tail, first
// dorsal, two finlets, the belly stripes, the eye and the gill line).
//
// It reads as gold treasure, not a balloon:
// - a toon gold ramp from a key light fixed to the camera (upper left), so the
//   form turns by day and at night: deep amber #A86A00, 山吹 #F8B500, pale
//   highlight #FFE38A;
// - a reflected-light rim on the shadow side, and a crisp white glint band
//   (a strip-light reflection) that slides along the body as it spins;
// - the logo's belly stripes and gill line engraved in deep amber;
// - a 紺 #223A70 inverted hull, about 2.4 CSS px wide at any distance;
// - it floats 0.15 m over a soft contact shadow and a gold ring on the ground,
//   so the eye places it on the quay, at its real size.
// The mesh ignores the scene lights (yoru stays gold) and its output stays at
// or below 0.98, so bloom cannot turn it into a ball. One instanced draw; the
// shadow and the ring are a second.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const CHARM_LEN = 0.9;
export const CHARM_SHADOW = '#A86A00';
export const CHARM_GOLD = '#F8B500';
export const CHARM_GOLD_HI = '#FFE38A';
export const CHARM_NAVY = '#223A70';
/** Clear air between the lowest point of the fish and the ring on the ground (m). */
export const CHARM_GAP = 0.15;
/** The bob, peak to peak (m), on a 1.8 s sine. */
export const CHARM_BOB = 0.1;
/** The ring's radius on the ground (m). */
export const CHARM_RING = 0.62;

// The logo's fish, SVG units (y down), nose at +x. 112 long from the tail tip to the snout.
export const LOGO_FISH = {
  body: 'M-44 0C-36 -10 -16 -16 8 -15C26 -14 40 -8 49 -1.5C51 0 51 2 49 3.5C40 10 24 14 6 14C-16 14 -34 9 -44 0Z',
  tail: 'M-43 0C-50 -7 -57 -17 -61 -25C-54 -22 -48 -14 -44 -7C-47 -15 -49 -22 -49 -27C-44 -19 -42 -10 -41 -2C-44 6 -50 16 -57 23C-50 21 -45 13 -42 5Z',
  fin: 'M-6 -13C-2 -23 6 -28 13 -29C11 -22 9 -17 9 -14Z',
  finlets: ['M-30 -10L-27 -13L-25 -9.5Z', 'M-21 -12L-18 -15L-16 -11.5Z'],
  eye: { x: 37, y: -3.5, r: 3.6, pupil: 2.1, glint: 0.75 },
};
const LOGO_X0 = -61;
const LOGO_X1 = 51;
const S = CHARM_LEN / (LOGO_X1 - LOGO_X0);
// The geometry is centred on the body's middle: logo x = -5, logo y = 0.
const CX = (LOGO_X0 + LOGO_X1) / 2;
const CY = 0;
/** Lowest point of the fish below its origin (m): the lower tail lobe, logo y = 23. */
export const CHARM_DROP = (23 - CY) * S;

const VERT = /* glsl */`
  attribute float mark;
  attribute vec3 hn;
  uniform float uLinePx;
  uniform float uViewH;
  varying float vMark;
  varying vec3 vNv;
  varying vec3 vLocal;
  varying vec3 vView;
  varying vec3 vVL;
  void main() {
    vMark = mark;
    vLocal = position;
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vec3 wn = mat3(m) * normal;
    if (mark > 0.5 && mark < 1.5) {
      // The hull: pushed out along the welded normal by about uLinePx CSS pixels.
      vec4 vp0 = viewMatrix * wp;
      float mPerPx = 2.0 * max(-vp0.z, 0.05) / (projectionMatrix[1][1] * max(uViewH, 1.0));
      float k = length(m[0].xyz);
      float w = clamp(uLinePx * mPerPx, 0.0035 * k, 0.03 * k);
      wp.xyz += normalize(mat3(m) * hn) * w;
    }
    vec4 vp = viewMatrix * wp;
    vView = vp.xyz;
    vNv = mat3(viewMatrix) * wn;
    // The way to the camera in the fish's own frame (rotation and uniform scale: the transpose is enough).
    vVL = transpose(mat3(m)) * (cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * vp;
  }`;

const FRAG = /* glsl */`
  uniform vec3 uShadow;
  uniform vec3 uGold;
  uniform vec3 uHi;
  uniform vec3 uNavy;
  uniform vec3 uDeep;
  uniform vec3 uLogo;
  varying float vMark;
  varying vec3 vNv;
  varying vec3 vLocal;
  varying vec3 vView;
  varying vec3 vVL;
  float lineAt(float d, float w) {
    float aa = fwidth(d) + 1e-4;
    return 1.0 - smoothstep(w - aa, w + aa, abs(d));
  }
  void main() {
    if (vMark > 0.5 && vMark < 1.5) {
      if (gl_FrontFacing) discard;
      gl_FragColor = vec4(uNavy, 1.0);
      return;
    }
    if (vMark > 1.5 && vMark < 2.5) { gl_FragColor = vec4(uNavy, 1.0); return; }
    if (vMark > 2.5 && vMark < 3.5) { gl_FragColor = vec4(0.98, 0.98, 0.96, 1.0); return; }
    if (vMark > 3.5) { gl_FragColor = vec4(uHi, 1.0); return; }
    vec3 N = normalize(vNv);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(-vView);
    // Key light fixed to the camera, upper left: the form turns the same by day and at night.
    vec3 L = normalize(vec3(-0.38, 0.86, 0.34));
    float ndl = dot(N, L);
    float aa = fwidth(ndl) + 1e-3;
    // 山吹 carries the body; the pale highlight is a narrow cap on the back, the deep amber the belly.
    float lit = smoothstep(0.08 - aa, 0.08 + aa, ndl);
    float hi = smoothstep(0.80 - aa, 0.80 + aa, ndl);
    vec3 col = mix(uShadow, uGold, lit);
    col = mix(col, uHi, hi);
    // Reflected light: a gold rim on the shadow side, so the dark half reads as metal, not a hole.
    float fres = 1.0 - clamp(dot(N, V), 0.0, 1.0);
    float rim = smoothstep(0.55, 0.63, fres) * (1.0 - lit);
    col = mix(col, uGold, rim * 0.9);
    // The logo's engraving: two belly stripes and the gill line (logo units, y down).
    float lx = vLocal.x / uLogo.x + uLogo.y;
    float ly = -(vLocal.y / uLogo.x) + uLogo.z;
    float sA = (lx > -30.0 && lx < 30.0) ? lineAt(ly - (8.2 - 0.0034 * (lx - 3.0) * (lx - 3.0)), 1.1) : 0.0;
    float sB = (lx > -24.0 && lx < 26.0) ? lineAt(ly - (10.6 - 0.0034 * (lx - 2.0) * (lx - 2.0)), 1.1) : 0.0;
    float gill = (ly > -7.0 && ly < 7.0) ? lineAt(lx - (30.7 - 0.024 * ly * ly), 0.9) : 0.0;
    float engr = max(max(sA, sB), gill);
    col = mix(col, uDeep, engr * 0.92);
    // The glint band: two crisp white slashes across the upper flank. Their place along the body follows the
    // angle the camera sees the fish from, so they slide from the tail to the snout as it spins (a strip light
    // in the gold), and from any side some of the band is in view.
    vec3 vl = normalize(vVL);
    float u = clamp(-vl.x / max(length(vl.xz), 1e-3), -1.0, 1.0);
    float d = vLocal.x + vLocal.y * 0.62 - u * 0.34;
    float b1 = lineAt(d, 0.026);
    float b2 = lineAt(d - 0.07, 0.008);
    // On the body only: under the back line (the dorsal stays gold) and ahead of the tail stock.
    float onBody = smoothstep(-0.075, -0.02, vLocal.y) * (1.0 - smoothstep(0.085, 0.105, vLocal.y)) * smoothstep(-0.36, -0.3, vLocal.x);
    float band = max(b1, b2) * onBody * (1.0 - engr);
    col = mix(col, vec3(0.98, 0.97, 0.93), band);
    gl_FragColor = vec4(min(col, vec3(0.98)), 1.0);
  }`;

const SHADOW_VERT = /* glsl */`
  attribute float mark;
  varying float vMark;
  varying vec2 vXZ;
  void main() {
    vMark = mark;
    vXZ = position.xz;
    vec4 local = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
    #endif
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * local;
  }`;

// mark 0: the contact shadow; mark 1: the ring, two gold lines with a soft fill between them.
const SHADOW_FRAG = /* glsl */`
  uniform vec3 uGold;
  uniform float uRing;
  varying float vMark;
  varying vec2 vXZ;
  void main() {
    float r = length(vXZ);
    if (vMark < 0.5) {
      float u = r / 0.42;
      float a = (1.0 - smoothstep(0.15, 1.0, u)) * 0.5;
      if (a < 0.02) discard;
      gl_FragColor = vec4(0.09, 0.08, 0.16, a);
      return;
    }
    float aa = fwidth(r) + 1e-4;
    float outer = 1.0 - smoothstep(0.011 - aa, 0.011 + aa, abs(r - uRing));
    float inner = 1.0 - smoothstep(0.006 - aa, 0.006 + aa, abs(r - (uRing - 0.075)));
    float fill = smoothstep(uRing - 0.2, uRing - 0.04, r) * (1.0 - smoothstep(uRing - 0.01, uRing + 0.04, r)) * 0.16;
    float a = max(max(outer * 0.92, inner * 0.7), fill);
    if (a < 0.02) discard;
    gl_FragColor = vec4(uGold, a);
  }`;

// ---- logo paths -> THREE.Shape (M, C, L, Z, absolute; y flipped to y up)
function shapeOf(d) {
  const s = new THREE.Shape();
  const tok = d.match(/[MCLZ]|-?\d*\.?\d+/g);
  let i = 0;
  let cmd = '';
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[MCLZ]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M') { const x = num(), y = num(); s.moveTo(x, -y); cmd = 'L'; }
    else if (cmd === 'L') { const x = num(), y = num(); s.lineTo(x, -y); }
    else if (cmd === 'C') { const a = num(), b = num(), c = num(), e = num(), x = num(), y = num(); s.bezierCurveTo(a, -b, c, -e, x, -y); }
    else if (cmd === 'Z') { s.closePath(); }
  }
  return s;
}

/** The body outline as a dense polygon, logo units, y up. */
function bodyOutline() {
  return shapeOf(LOGO_FISH.body).getSpacedPoints(240);
}

function sectionAt(pts, x) {
  let top = -Infinity;
  let bot = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
    const t = (x - a.x) / (b.x - a.x);
    const y = a.y + (b.y - a.y) * t;
    if (y > top) top = y;
    if (y < bot) bot = y;
  }
  if (!Number.isFinite(top) || top - bot < 0.05) return null;
  return { top, bot };
}

const ROUND = 0.62; // half-width over half-depth: a skipjack is a round fish

/** The body: elliptic sections along the logo outline, welded, smooth normals. */
function bodyGeometry() {
  const pts = bodyOutline();
  const A = 22;
  const xs = [];
  const n = 36;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    // Denser at both ends, where the outline turns fastest.
    const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
    xs.push(-43.6 + e * (50.8 + 43.6));
  }
  const rows = [];
  for (const x of xs) {
    const s = sectionAt(pts, x);
    if (s) rows.push({ x, cy: (s.top + s.bot) / 2, ry: (s.top - s.bot) / 2 });
  }
  const pos = [];
  const idx = [];
  for (const r of rows) {
    for (let a = 0; a < A; a++) {
      const t = (a / A) * Math.PI * 2;
      pos.push(r.x, r.cy + Math.cos(t) * r.ry, Math.sin(t) * r.ry * ROUND);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let a = 0; a < A; a++) {
      const b = (a + 1) % A;
      const v00 = i * A + a, v01 = i * A + b, v10 = (i + 1) * A + a, v11 = (i + 1) * A + b;
      idx.push(v00, v01, v10, v01, v11, v10);
    }
  }
  const tail = pos.length / 3;
  pos.push(-44, rows[0].cy, 0);
  const nose = pos.length / 3;
  const last = rows[rows.length - 1];
  pos.push(51, last.cy, 0);
  const lr = (rows.length - 1) * A;
  for (let a = 0; a < A; a++) {
    const b = (a + 1) % A;
    idx.push(tail, b, a);
    idx.push(nose, lr + a, lr + b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, rows };
}

function halfWidthAt(rows, x, y) {
  let best = rows[0];
  for (const r of rows) if (Math.abs(r.x - x) < Math.abs(best.x - x)) best = r;
  const v = (y - best.cy) / (best.ry || 1);
  return best.ry * ROUND * Math.sqrt(Math.max(0, 1 - v * v));
}

function fin(d, depth) {
  const g = new THREE.ExtrudeGeometry(shapeOf(d), { depth, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -depth * 0.5);
  return g;
}

function pectoral(rows, side) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(-7, -2.5, -13, -6.5);
  s.quadraticCurveTo(-6, -4.2, 1.5, -2.2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: false, curveSegments: 5 });
  g.translate(0, 0, -0.45);
  // Tip the fin out from the flank (its lower edge lifts away from the body).
  g.rotateX(-side * 0.62);
  const x = 26, y = 0.5;
  g.translate(x, y, side * (halfWidthAt(rows, x, y) - 0.4));
  return g;
}

function eyeParts(rows, side) {
  const E = LOGO_FISH.eye;
  const x = E.x, y = -E.y;
  const z = halfWidthAt(rows, x, y);
  const ring = new THREE.SphereGeometry(E.r, 12, 6);
  ring.scale(1, 1, 0.3);
  ring.translate(x, y, side * (z - 0.25));
  const pupil = new THREE.SphereGeometry(E.pupil, 10, 6);
  pupil.scale(1, 1, 0.42);
  pupil.translate(x + 0.8, y, side * (z + 0.55));
  const glint = new THREE.SphereGeometry(E.glint, 6, 4);
  glint.scale(1, 1, 0.5);
  glint.translate(x + 1.6, y + 0.8, side * (z + 1.35));
  return [ring, pupil, glint];
}

function plain(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

function markOf(geo, mark) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n);
  a.fill(mark);
  geo.setAttribute('mark', new THREE.BufferAttribute(a, 1));
  return geo;
}

/** Normals averaged over every vertex at the same spot, so the hull closes over fin edges. */
function weldedNormals(geo) {
  const p = geo.attributes.position.array;
  const nrm = geo.attributes.normal.array;
  const acc = new Map();
  const key = (i) => Math.round(p[i] * 400) + ',' + Math.round(p[i + 1] * 400) + ',' + Math.round(p[i + 2] * 400);
  for (let i = 0; i < p.length; i += 3) {
    const k = key(i);
    let a = acc.get(k);
    if (!a) { a = [0, 0, 0]; acc.set(k, a); }
    a[0] += nrm[i]; a[1] += nrm[i + 1]; a[2] += nrm[i + 2];
  }
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const a = acc.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i] = a[0] / l; out[i + 1] = a[1] / l; out[i + 2] = a[2] / l;
  }
  geo.setAttribute('hn', new THREE.BufferAttribute(out, 3));
  return geo;
}

/** Back to an indexed mesh: the instanced draw shades each unique vertex once. */
function indexed(geo) {
  const g = mergeVertices(geo, 1e-5);
  if (g !== geo) geo.dispose();
  return g;
}

/** 0.9 m, centred on the body. mark 0 gold, 1 hull, 2 pupil (紺), 3 catch-light, 4 eye ring. */
export function charmGeometry() {
  const { geo: body, rows } = bodyGeometry();
  const parts = [
    plain(body),
    plain(fin(LOGO_FISH.tail, 1.6)),
    plain(fin(LOGO_FISH.fin, 1.3)),
    ...LOGO_FISH.finlets.map((d) => plain(fin(d, 1.0))),
    plain(pectoral(rows, 1)),
    plain(pectoral(rows, -1)),
  ];
  let solid = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  solid.translate(-CX, -CY, 0);
  solid.scale(S, S, S);
  weldedNormals(solid);
  markOf(solid, 0);
  solid = indexed(solid);
  const hull = solid.clone();
  markOf(hull, 1);
  const extra = [];
  for (const side of [1, -1]) {
    const [ring, pupil, glint] = eyeParts(rows, side);
    extra.push(markOf(plain(ring), 4), markOf(plain(pupil), 2), markOf(plain(glint), 3));
  }
  for (let i = 0; i < extra.length; i++) {
    const g = extra[i];
    g.translate(-CX, -CY, 0);
    g.scale(S, S, S);
    g.setAttribute('hn', g.attributes.normal.clone());
    extra[i] = indexed(g);
  }
  const geo = mergeGeometries([hull, solid, ...extra]);
  hull.dispose();
  solid.dispose();
  for (const g of extra) g.dispose();
  geo.computeBoundingSphere();
  return geo;
}

export function charmMaterial() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uShadow: { value: new THREE.Color(CHARM_SHADOW) },
      uGold: { value: new THREE.Color(CHARM_GOLD) },
      uHi: { value: new THREE.Color(CHARM_GOLD_HI) },
      uNavy: { value: new THREE.Color(CHARM_NAVY) },
      // The engraving: the spec's deep amber, a step darker so it still reads in the shadow band.
      uDeep: { value: new THREE.Color('#A86A00').multiplyScalar(0.62) },
      uLogo: { value: new THREE.Vector3(S, CX, CY) },
      uLinePx: { value: 2.8 },
      uViewH: { value: 900 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  mat.name = 'play-katsuo';
  return mat;
}

/** A soft contact shadow and a gold ring, in the XZ plane. mark 0 disc, 1 ring. */
export function charmShadowGeometry() {
  const disc = new THREE.CircleGeometry(0.42, 28);
  disc.rotateX(-Math.PI / 2);
  const ring = new THREE.RingGeometry(CHARM_RING - 0.22, CHARM_RING + 0.05, 48, 1);
  ring.rotateX(-Math.PI / 2);
  markOf(disc, 0);
  markOf(ring, 1);
  const geo = mergeGeometries([disc, ring]);
  disc.dispose();
  ring.dispose();
  return geo;
}

export function charmShadowMaterial() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uGold: { value: new THREE.Color(CHARM_GOLD) },
      uRing: { value: CHARM_RING },
    },
    vertexShader: SHADOW_VERT,
    fragmentShader: SHADOW_FRAG,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  mat.name = 'play-katsuo-shadow';
  return mat;
}

/** Where the disc sits. Walk and drive: on the pavement (the spot is chest height). */
export function charmShadowY(spot) {
  if (!spot) return 0;
  if (spot.mode === 'fly') return spot.y - 0.42;
  if (spot.mode === 'sail') return 0.22;
  if (spot.mode === 'swim') return spot.y - 0.05;
  return spot.y - 1.08;
}

/**
 * The fish's resting centre. On foot and by car it floats CHARM_GAP over its
 * ring (so the eye reads it on the ground, at 0.9 m, not as a blimp at eye
 * level). Drone, boat and swim spots keep the designed height.
 */
export function charmCentreY(spot) {
  if (!spot) return 0;
  if (spot.mode === 'walk' || spot.mode === 'drive' || !spot.mode) return charmShadowY(spot) + CHARM_GAP + CHARM_DROP + CHARM_BOB * 0.5;
  return spot.y;
}
