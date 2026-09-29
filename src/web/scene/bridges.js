// The two landmark bridges as simple massing (they are not in the building footprints):
//  - Kanae Ohashi (Kesennuma Bay Crossing Bridge): cable-stayed, main span ~360 m, two towers; axis from the
//    landmarks.json verification points (config NIGHT.kanae).
//  - Kesennuma Oshima Ohashi: steel arch ~300 m; axis = the shortest water crossing through the OSM centre,
//    read from the terrain grid (land = h > 1 m), so it follows real data instead of a guessed bearing.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { llToEnu } from "../../core/geo.js";
import { NIGHT } from "../config.js";

export const OSHIMA_CENTER = [38.87875, 141.60625];

/** Shortest water crossing through (x, z): -> { a, b, dir, span } or null. */
export function waterCrossing(heightAt, x, z, { maxHalf = 900, step = 5, land = 1.0 } = {}) {
  let best = null;
  for (let deg = 0; deg < 180; deg += 3) {
    const t = (deg * Math.PI) / 180, dx = Math.sin(t), dz = -Math.cos(t);
    const run = (sgn) => { let d = 0; while (d < maxHalf && heightAt(x + sgn * dx * d, z + sgn * dz * d) <= land) d += step; return d; };
    const p = run(1), n = run(-1);
    if (p >= maxHalf || n >= maxHalf) continue;
    const span = p + n;
    if (span > 40 && (!best || span < best.span)) best = { span, dir: [dx, dz], a: [x - dx * (n + 40), z - dz * (n + 40)], b: [x + dx * (p + 40), z + dz * (p + 40)] };
  }
  return best;
}

function beam(a, b, y0, y1, w, h) {             // box from a to b (xz), centre line rising y0 -> y1
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const g = new THREE.BoxGeometry(w, h, L);
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(a[0], y0, a[1]), new THREE.Vector3(b[0], y1, b[1]), new THREE.Vector3(0, 1, 0));
  m.setPosition((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2);
  return g.applyMatrix4(m);
}

export function createBridges({ heightAt, atm }) {
  const group = new THREE.Group(); group.name = "bridges";
  const mat = new THREE.MeshStandardMaterial({ color: 0xdedbd4, roughness: 0.6, metalness: 0.1 });
  atm?.shadowMaterial(mat);
  const cableMat = new THREE.LineBasicMaterial({ color: 0xcfcac2, transparent: true, opacity: 0.7 });
  const out = { group, kanae: null, oshima: null };

  // Kanae: deck 720 m at 35 m, towers 105 m at +-180 m, fan cables
  {
    const [A, B] = NIGHT.kanae, a = [A.x, A.z], b = [B.x, B.z], deckY = 35;
    const parts = [beam(a, b, deckY, deckY, 22, 3.2)];
    const cables = [];
    for (const tt of [0.25, 0.75]) {
      const tx = a[0] + (b[0] - a[0]) * tt, tz = a[1] + (b[1] - a[1]) * tt;
      parts.push(new THREE.BoxGeometry(4, 105, 6).translate(tx, 52.5, tz));
      for (let k = 1; k <= 7; k++) for (const s of [-1, 1]) {
        const u = tt + s * k * 0.032, cx = a[0] + (b[0] - a[0]) * u, cz = a[1] + (b[1] - a[1]) * u;
        cables.push(tx, 100, tz, cx, deckY + 1.5, cz);
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.Float32BufferAttribute(cables, 3));
    group.add(new THREE.LineSegments(cg, cableMat));
    out.kanae = { a, b, deckY, towers: [0.25, 0.75] };
  }
  // Oshima: arch over the shortest crossing
  {
    const c = llToEnu(...OSHIMA_CENTER), cr = waterCrossing(heightAt, c.x, c.z);
    if (cr) {
      const { a, b } = cr, deckY = 28, rise = 48, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const parts = [beam(a, b, deckY, deckY, 16, 2.6)];
      const n = [-cr.dir[1], cr.dir[0]], hang = [];
      for (const off of [-7, 7]) {
        const pts = [];
        for (let i = 0; i <= 40; i++) {
          const t = i / 40, x = a[0] + (b[0] - a[0]) * (0.08 + 0.84 * t) + n[0] * off, z = a[1] + (b[1] - a[1]) * (0.08 + 0.84 * t) + n[1] * off;
          pts.push(new THREE.Vector3(x, deckY + rise * 4 * t * (1 - t), z));
          if (i % 4 === 0 && i && i < 40) hang.push(x, deckY, z, x, deckY + rise * 4 * t * (1 - t), z);
        }
        parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 1.6, 6, false).toNonIndexed());
      }
      const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
      const hg = new THREE.BufferGeometry(); hg.setAttribute("position", new THREE.Float32BufferAttribute(hang, 3));
      group.add(new THREE.LineSegments(hg, cableMat));
      out.oshima = { a, b, deckY, span: L };
    }
  }
  return out;
}
