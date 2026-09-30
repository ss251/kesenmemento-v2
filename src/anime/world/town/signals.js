// [v4:town-accuracy] Traffic signals, crossings and route shields on the real streets (V3-SPEC section 10), from
// OpenStreetMap (highway=traffic_signals, highway=crossing, road ref / name; © OpenStreetMap contributors, ODbL):
//   * every signalised junction of the hero and mid zones gets Japanese signals: a grey steel pole on the kerb of each
//     arm with a cantilever arm and a horizontal LED head (青 / 黄 / 赤) facing the traffic across the junction, and a
//     pedestrian head (立ち止まる人 / 歩く人) facing across the arm's zebra; the main axis shows 青, the side streets 赤;
//   * OSM crossings away from junctions get their zebra (白い横断歩道, 0.45 m bars at 0.9 m pitch, 4 m long);
//   * numbered roads carry their route shield every ~300 m and after each junction: 国道 (blue おにぎり shield) and
//     県道 (blue hexagon), e.g. 県道26号 気仙沼唐桑線, 県道218号 大島浪板線, 国道284号 気仙沼街道.
// Pure helpers (junctionsFrom, signalJunctions, shieldKind) are tested in test/v4-town-accuracy.test.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { resample } from './common.js';

const nk = (p) => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
/** Road graph nodes (shared end points, the same keys as streets.js): Map key -> { x, z, arms: [{ road, end }] } */
export function junctionsFrom(roads) {
  const nodes = new Map();
  for (const r of roads) for (const [p, end] of [[r.pts[0], 0], [r.pts[r.pts.length - 1], 1]]) {
    const k = nk(p); let n = nodes.get(k);
    if (!n) nodes.set(k, (n = { x: p[0], z: p[1], arms: [] }));
    n.arms.push({ road: r, end });
  }
  return nodes;
}
/** OSM signal nodes -> the junctions they control (nearest node of degree >= 3 within `r` m; one entry per junction). */
export function signalJunctions(signals, nodes, r = 28) {
  const list = [...nodes.values()].filter((n) => n.arms.length >= 3);
  const out = new Map();
  for (const s of signals) {
    let best = null, bd = r;
    for (const n of list) { const d = Math.hypot(n.x - s.x, n.z - s.z); if (d < bd) { bd = d; best = n; } }
    if (best) out.set(best, (out.get(best) || 0) + 1);
  }
  return [...out.keys()];
}
const NATIONAL = new Set(['4', '6', '45', '284', '342', '343', '346', '398']);
/** The first numeric route ref of a road ('218', '26'), or null. */
export const refOf = (road) => { const r = String(road.ref || '').split(/[;,]/)[0].trim(); return /^\d{1,3}$/.test(r) ? r : null; };
/** '国道' | '県道' | null for a road with a numbered ref (Kesennuma's national routes: 45, 284, 346). */
export function shieldKind(road) {
  const ref = refOf(road); if (!ref) return null;
  return road.kind === 'national' || NATIONAL.has(ref) ? '国道' : '県道';
}

function shieldAtlas(ctx, list) {
  const C = 128, cols = 8, rows = Math.max(1, Math.ceil(list.length / cols));
  const tex = ctx.tex.draw(C * cols, C * rows, (g) => {
    list.forEach(({ kind, ref }, k) => {
      const x = (k % cols) * C, y = Math.floor(k / cols) * C, cx = x + C / 2;
      g.save(); g.translate(x, y);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff';
      if (kind === '国道') {
        // おにぎり: a rounded inverted triangle, white rim, blue field
        const P = (s) => { g.beginPath(); g.moveTo(C * 0.5, C * (0.97 - s)); g.bezierCurveTo(C * 0.2, C * (0.72 - s * 0.5), C * (0.02 + s), C * (0.38), C * (0.1 + s), C * (0.12 + s)); g.quadraticCurveTo(C * 0.5, C * (0.02 + s), C * (0.9 - s), C * (0.12 + s)); g.bezierCurveTo(C * (0.98 - s), C * 0.38, C * 0.8, C * (0.72 - s * 0.5), C * 0.5, C * (0.97 - s)); g.closePath(); };
        P(0); g.fill(); g.fillStyle = '#1d4f9c'; P(0.05); g.fill();
        g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `900 ${C * 0.13}px ${ctx.tex.FONTS.sans}`; g.fillText('国道', C / 2, C * 0.25);
        ctx.tex.fitText(g, String(ref), C / 2, C * 0.52, C * 0.62, C * 0.36, ctx.tex.FONTS.sans, 900);
        g.font = `700 ${C * 0.11}px ${ctx.tex.FONTS.en}`; g.fillText('ROUTE', C / 2, C * 0.74);
      } else {
        const hx = (s) => { g.beginPath(); const R = C * (0.47 - s); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; const px = C / 2 + Math.cos(a) * R, py = C / 2 + Math.sin(a) * R * 0.92; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); };
        hx(0); g.fill(); g.fillStyle = '#1d4f9c'; hx(0.045); g.fill();
        g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `900 ${C * 0.12}px ${ctx.tex.FONTS.sans}`; g.fillText('県道', C / 2, C * 0.27);
        ctx.tex.fitText(g, String(ref), C / 2, C * 0.56, C * 0.6, C * 0.34, ctx.tex.FONTS.sans, 900);
      }
      g.restore();
    });
  }, { key: 'town-route-shields', anisotropy: 8 });
  return { tex, rect: (k) => { const x = (k % cols) * C, y = Math.floor(k / cols) * C, W = C * cols, H = C * rows; return [x / W, 1 - (y + C) / H, (x + C) / W, 1 - y / H]; } };
}

/** [v4:integrate] The cycle of a signalised junction (seconds): the main axis (group 0) is green 0-25, amber 25-28, then
 * all red to 30; the cross axis (group 1) green 30-55, amber 55-58, all red to 60. Walkers crossing an arm of one axis go
 * with the other axis's green: walk for its first 18 s, the green figure flashes for 4 s, then red. */
export const SIGNAL_CYCLE = { period: 60, green: 25, amber: 3, walk: 18, flash: 4 };
/** junction offset in [0, 60) s, from its position (deterministic; neighbours do not switch together) */
export const signalOffset = (x, z) => (((Math.round(x * 10) * 73856093) ^ (Math.round(z * 10) * 19349663)) >>> 0) % SIGNAL_CYCLE.period;
/** lamp type (0 green 1 amber 2 red 3 walk-red 4 walk-green), group (0 main, 1 cross), offset, time -> lit (0 / 1).
 *  The shader in signalMaterial is this function, line for line. */
export function signalState(type, group, off, t) {
  const C = SIGNAL_CYCLE, half = C.period / 2;
  const u = ((t + off) % C.period + C.period) % C.period;
  const own = group === 0 ? u : (u + half) % C.period;          // time since this axis's green began
  const other = (own + half) % C.period;                          // time since the other axis's green began
  const green = own < C.green, amber = own >= C.green && own < C.green + C.amber;
  const walk = other < C.walk || (other < C.walk + C.flash && Math.floor(other * 2) % 2 === 0);
  const wred = !(other < C.walk + C.flash);
  return [green, amber, !green && !amber, wred, walk][type] ? 1 : 0;
}
function signalMaterial(ctx, offHex) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.4, 1.4), vertexColors: true, toneMapped: false });
  const uOff = { value: new THREE.Color(offHex) }, C = SIGNAL_CYCLE, f = (v) => v.toFixed(1);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = ctx.shared.uTime; sh.uniforms.uLensOff = uOff;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec3 aSig; uniform float uTime; varying float vLit;`).replace('#include <begin_vertex>', `#include <begin_vertex>
{ float u = mod(uTime + aSig.z, ${f(C.period)}); float own = aSig.y < 0.5 ? u : mod(u + ${f(C.period / 2)}, ${f(C.period)});
  float other = mod(own + ${f(C.period / 2)}, ${f(C.period)});
  float green = step(own, ${f(C.green)} - 0.0001), amber = step(${f(C.green)}, own) * step(own, ${f(C.green + C.amber)} - 0.0001);
  float walk = max(step(other, ${f(C.walk)} - 0.0001), step(other, ${f(C.walk + C.flash)} - 0.0001) * (1.0 - mod(floor(other * 2.0), 2.0)));
  float wred = 1.0 - step(other, ${f(C.walk + C.flash)} - 0.0001);
  float k = aSig.x; vLit = k < 0.5 ? green : k < 1.5 ? amber : k < 2.5 ? 1.0 - green - amber : k < 3.5 ? wred : walk; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uLensOff; varying float vLit;`).replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = mix(uLensOff, diffuseColor.rgb, vLit);`);
  };
  m.customProgramCacheKey = () => 'klc-signal-lamps';
  return m;
}

export function buildSignals(ctx, { roads, lotIdx, roadIdx, detail, hero, low = false }) {
  const L = ctx.L;
  const nodes = junctionsFrom(roads);
  const sigJ = signalJunctions((L.SIGNALS || []).filter((s) => detail(s.x, s.z)), nodes);
  const parts = { pole: [], head: [], lens: [], blue: [], amber: [], red: [], pedR: [], pedB: [], plate: [] };
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  const add = (key, geo, x, y, z, rotY, rx = 0) => { E.set(rx, rotY, 0, 'YXZ'); Q.setFromEuler(E); M4.compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(1, 1, 1)); const g = geo.clone().applyMatrix4(M4); g.deleteAttribute('uv'); parts[key].push(g); return g; };
  // [v4:integrate] the lamps run a real cycle: every lens is a lamp tagged (lamp, phase group, junction offset); the
  // shader lights the one the cycle wants (signalState), so the junction's two axes take turns and the walk signals follow
  const lamp = (key, type, group, off, geo, x, y, z, rotY) => { const g = add(key, geo, x, y, z, rotY); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = type; a[i * 3 + 1] = group; a[i * 3 + 2] = off; } g.setAttribute('aSig', new THREE.BufferAttribute(a, 3)); };
  const G = {
    pole: new THREE.CylinderGeometry(0.1, 0.12, 1, 8).translate(0, 0.5, 0),
    arm: new THREE.CylinderGeometry(0.06, 0.07, 1, 6).rotateZ(Math.PI / 2),
    head: new THREE.BoxGeometry(1.3, 0.46, 0.2), visor: new THREE.BoxGeometry(0.34, 0.05, 0.22),
    lens: new THREE.CylinderGeometry(0.14, 0.14, 0.03, 14).rotateX(Math.PI / 2),
    ped: new THREE.BoxGeometry(0.34, 0.72, 0.18), pedLens: new THREE.BoxGeometry(0.24, 0.24, 0.02),
  };
  const stripes = { p: [], i: [] };
  const zebra = (x, z, tx, tz, halfW) => {   // bars across the carriageway, 4 m long along the road
    const nx = -tz, nz = tx;
    for (let o = -halfW + 0.45; o <= halfW - 0.45; o += 0.9) {
      const cx = x + nx * o, cz = z + nz * o;
      const b = stripes.p.length / 3;
      for (const [u, v] of [[-0.225, -2], [0.225, -2], [0.225, 2], [-0.225, 2]]) { const px = cx + nx * u + tx * v, pz = cz + nz * u + tz * v; stripes.p.push(px, L.heightAt(px, pz) + 0.075, pz); }
      stripes.i.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
  };
  let heads = 0, peds = 0, junctions = 0;
  for (const n of sigJ) {
    const arms = n.arms.filter((a) => a.road.width >= 3.5);
    if (arms.length < 3) continue;
    junctions++;
    const jOff = signalOffset(n.x, n.z);
    // main axis: the widest arm's direction
    const dirOf = (a) => { const pts = a.end ? a.road.pts.slice().reverse() : a.road.pts; const S = resample(pts, 1); const p = S[Math.min(S.length - 1, 6)]; return [p.x - n.x, p.z - n.z]; };
    const wid = arms.slice().sort((a, b) => b.road.width - a.road.width)[0], md = dirOf(wid), ml = Math.hypot(...md) || 1;
    const R = Math.max(...arms.map((a) => a.road.width)) / 2 * 1.1 + 0.4;
    for (const a of arms) {
      const d = dirOf(a), dl = Math.hypot(...d) || 1, tx = d[0] / dl, tz = d[1] / dl;   // out along the arm
      const nx = -tz, nz = tx, hw = a.road.width / 2;
      const onMain = Math.abs((tx * md[0] + tz * md[1]) / ml) > 0.7;
      // zebra on the arm (mid-zone junctions: streets.js draws the hero ones)
      if (!hero(n.x, n.z) || a.road.width < 7) zebra(n.x + tx * (R + 3.2), n.z + tz * (R + 3.2), tx, tz, hw - 0.3);
      // the pole on the kerb to the left of traffic leaving the junction along this arm (left-hand traffic: the
      // far-side signal for drivers coming the other way), 1 m behind the kerb line
      for (const side of [1, -1]) {
        const px = n.x + tx * (R + 0.8) + nx * side * (hw + 0.9), pz = n.z + tz * (R + 0.8) + nz * side * (hw + 0.9);
        if (lotIdx?.at(px, pz, 0.3) || L.shoreDist(px, pz) > -1 || (roadIdx?.covering(px, pz, 0.1, null) || []).some((o) => o !== a.road && o.width > 3)) continue;
        const gy = L.heightAt(px, pz) + 0.1, rot = Math.atan2(-tx, -tz);   // heads face back across the junction
        const H0 = 5.2;
        add('pole', G.pole.clone().scale(1, H0 + 0.6, 1), px, gy, pz, 0);
        const armL = Math.min(hw + 0.9 - 1.0, 5.5), ax = px - nx * side * armL / 2, az = pz - nz * side * armL / 2;
        if (armL > 0.6) add('pole', G.arm.clone().scale(armL, 1, 1), ax, gy + H0 + 0.25, az, Math.atan2(nz * side, -nx * side));
        const hx = px - nx * side * Math.max(0.6, armL - 0.2), hz = pz - nz * side * Math.max(0.6, armL - 0.2);
        const hrot = rot;   // +z of the head faces the drivers coming across the junction (they travel along +t)
        add('head', G.head, hx, gy + H0, hz, hrot);
        const fwd = [Math.sin(hrot), Math.cos(hrot)], rgt = [Math.cos(hrot), -Math.sin(hrot)];
        [-0.4, 0, 0.4].forEach((o, k) => {
          const lx = hx + rgt[0] * o + fwd[0] * 0.11, lz = hz + rgt[1] * o + fwd[1] * 0.11;
          lamp(['blue', 'amber', 'red'][k], k, onMain ? 0 : 1, jOff, G.lens, lx, gy + H0, lz, hrot);
          add('head', G.visor, lx + fwd[0] * 0.04, gy + H0 + 0.17, lz + fwd[1] * 0.04, hrot);
        });
        heads++;
        // pedestrian head facing across the arm's crossing (toward the other kerb)
        const prot = Math.atan2(-nx * side, -nz * side);
        const qx = px + tx * 0.25, qz = pz + tz * 0.25;
        add('head', G.ped, qx, gy + 2.75, qz, prot);
        const pf = [Math.sin(prot) * 0.1, Math.cos(prot) * 0.1];
        // red figure above, green (blue) below; the walkers crossing this arm go with the other axis's green
        lamp('pedR', 3, onMain ? 0 : 1, jOff, G.pedLens, qx + pf[0], gy + 2.75 + 0.17, qz + pf[1], prot);
        lamp('pedB', 4, onMain ? 0 : 1, jOff, G.pedLens, qx + pf[0], gy + 2.75 - 0.17, qz + pf[1], prot);
        peds++;
        break;   // one pole per arm
      }
    }
  }
  // OSM crossings away from signalised junctions (marked / zebra)
  let xings = 0;
  for (const c of L.CROSSINGS || []) {
    if (!detail(c.x, c.z) || c.kind === 'rail' || c.kind === 'unmarked') continue;
    const road = L.roadById?.(c.roadId); if (!road || road.width < 3) continue;
    if (sigJ.some((n) => Math.hypot(n.x - c.x, n.z - c.z) < 25)) continue;
    // road tangent at the crossing
    let best = null, bd = 1e9;
    for (let i = 1; i < road.pts.length; i++) { const a = road.pts[i - 1], b = road.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((c.x - a[0]) * dx + (c.z - a[1]) * dz) / l2)), d = Math.hypot(c.x - a[0] - dx * t, c.z - a[1] - dz * t); if (d < bd) { bd = d; const l = Math.sqrt(l2); best = { x: a[0] + dx * t, z: a[1] + dz * t, tx: dx / l, tz: dz / l }; } }
    if (!best || bd > 6) continue;
    zebra(best.x, best.z, best.tx, best.tz, road.width / 2 - 0.3); xings++;
  }
  // route shields
  const refRoads = roads.filter((r) => shieldKind(r) && r.width >= 4);
  const uniq = []; const keyOf = (r) => shieldKind(r) + refOf(r);
  for (const r of refRoads) if (!uniq.some((u) => u.kind + u.ref === keyOf(r))) uniq.push({ kind: shieldKind(r), ref: refOf(r) });
  const atlas = uniq.length ? shieldAtlas(ctx, uniq) : null;
  const shieldQ = { p: [], u: [], i: [] };
  let shields = 0;
  const placed = [];
  for (const r of refRoads) {
    const S = resample(r.pts, 2); if (S.length < 8) continue;
    const len = S[S.length - 1].s;
    const k = uniq.findIndex((u) => u.kind + u.ref === keyOf(r));
    for (let s = Math.min(40, len / 2); s < len - 10; s += 300) {
      const p = S.find((q) => q.s >= s); if (!p) break;
      const nx = -p.tz, nz = p.tx, off = r.width / 2 + 0.8;
      const px = p.x + nx * off, pz = p.z + nz * off;   // left kerb (driving along +t, left-hand traffic)
      if (placed.some((q) => Math.hypot(q[0] - px, q[1] - pz) < 120 && q[2] === k)) continue;
      if (lotIdx?.at(px, pz, 0.3) || L.shoreDist(px, pz) > -1 || !detail(px, pz)) continue;
      placed.push([px, pz, k]);
      const gy = L.heightAt(px, pz) + 0.05, rot = Math.atan2(-p.tx, -p.tz);   // faces the drivers coming along +t
      add('pole', new THREE.CylinderGeometry(0.035, 0.035, 2.9, 6).translate(0, 1.45, 0), px, gy, pz, 0);
      const rc = atlas.rect(k), f = [Math.sin(rot) * 0.017, Math.cos(rot) * 0.017], rg = [Math.cos(rot) * 0.31, -Math.sin(rot) * 0.31];
      const b = shieldQ.p.length / 3;
      for (const [u, v, uu, vv] of [[-1, -1, rc[0], rc[1]], [1, -1, rc[2], rc[1]], [1, 1, rc[2], rc[3]], [-1, 1, rc[0], rc[3]]]) { shieldQ.p.push(px + f[0] + rg[0] * u, gy + 2.6 + v * 0.31, pz + f[1] + rg[1] * u); shieldQ.u.push(uu, vv); }
      shieldQ.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
      shields++;
    }
  }
  // meshes: the steel and housings in one vertex-coloured mesh, the lit lamps in one emissive mesh (2 draw calls)
  const root = new THREE.Group(); root.name = 'town-signals';
  const COL = { pole: '#a3a9ae', head: '#7d848b', lens: '#3d4148', plate: '#e9ecef', blue: '#35d6b0', amber: '#f2b134', red: '#ff4a3a', pedR: '#ff4a3a', pedB: '#35d6b0' };
  const solid = [], lit = [], cc = new THREE.Color();
  for (const [k, list] of Object.entries(parts)) for (const g of list) {
    cc.set(COL[k]); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    (['blue', 'amber', 'red', 'pedR', 'pedB'].includes(k) ? lit : solid).push(g.index ? g.toNonIndexed() : g);
  }
  if (solid.length) { const m = new THREE.Mesh(mergeGeometries(solid), ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.02 })); m.castShadow = true; m.receiveShadow = true; m.name = 'signal-steel'; root.add(m); }
  if (lit.length) {   // self-lit LED lamps (unlit basic material, 1.4x so they bloom a little), cycling (signalMaterial)
    const m = new THREE.Mesh(mergeGeometries(lit), signalMaterial(ctx, COL.lens)); m.name = 'signal-lamps'; root.add(m);
    ctx.noBatch?.(m);   // its per-lamp attribute must survive: the static batcher merges by material and drops it
  }
  if (stripes.i.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(stripes.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(stripes.p.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); g.setIndex(stripes.i);
    // orient every bar to face up
    const P = g.attributes.position.array, I = g.index.array;
    for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; const ny = (P[b * 3 + 2] - P[a * 3 + 2]) * (P[c * 3] - P[a * 3]) - (P[b * 3] - P[a * 3]) * (P[c * 3 + 2] - P[a * 3 + 2]); if (ny < 0) { I[t + 1] = c; I[t + 2] = b; } }
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, ctx.mat.toon('#f0f0ea', { paint: 0.01, polygonOffset: -2 })); m.receiveShadow = true; m.name = 'signal-zebras'; root.add(m);
  }
  if (shieldQ.i.length && atlas) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(shieldQ.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(shieldQ.u, 2)); g.setIndex(shieldQ.i); g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, ctx.mat.toon('#ffffff', { map: atlas.tex, paint: 0.0, side: 'double', alphaTest: 0.4 })); m.name = 'route-shields'; root.add(m);
    ctx.noOutline(m);
  }
  ctx.addStatic(root);
  return { junctions, heads, peds, crossings: xings, shields, shieldTypes: uniq.map((u) => u.kind + u.ref) };
}
