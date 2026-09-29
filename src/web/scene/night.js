// Night props (spec §1): road lines that glow sodium at night (and read as the model's pale roads by day in model
// mode), quay floodlights at the fish market and Pier 7, and the Kanae bridge outlined by a dotted emissive line.
import * as THREE from "three";
import { llToEnu } from "../../core/geo.js";
import { NIGHT, MODEL_LOOK } from "../config.js";

export function createNight({ roads, heightAt }) {
  const group = new THREE.Group(); group.name = "night";
  // roads
  let roadLines = null;
  if (roads?.lines?.length) {
    const seg = [];
    for (const line of roads.lines) for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 25));
      for (let k = 0; k < n; k++) {                         // subdivide so lines follow the terrain
        const t0 = k / n, t1 = (k + 1) / n;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        seg.push(x0, heightAt(x0, z0) + 0.7, z0, x1, heightAt(x1, z1) + 0.7, z1);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    roadLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0, depthWrite: false }));
    roadLines.name = "roads"; roadLines.frustumCulled = false; group.add(roadLines);
  }
  // floodlights
  const floods = NIGHT.floods.map(([lat, lon]) => {
    const e = llToEnu(lat, lon), y = heightAt(e.x, e.z) + 18;
    const light = new THREE.PointLight(NIGHT.flood, 0, 420, 2); light.position.set(e.x, y, e.z); group.add(light);
    return { light, pos: new THREE.Vector3(e.x, y, e.z) };
  });
  const glowGeo = new THREE.BufferGeometry().setFromPoints(floods.map((f) => f.pos));
  const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({ color: new THREE.Color(NIGHT.flood).multiplyScalar(3), size: 5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
  glow.frustumCulled = false; group.add(glow);
  // Kanae bridge dotted outline: deck, the two towers and their fan cables (same geometry as scene/bridges.js)
  const [a, b] = NIGHT.kanae, pts = [];
  const L = Math.hypot(b.x - a.x, b.z - a.z), deckY = 36.8;
  const at = (t) => [a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t];
  for (let s = 0; s <= L; s += 8) { const [x, z] = at(s / L); pts.push(new THREE.Vector3(x, deckY, z)); }
  for (const t of [0.25, 0.75]) {
    const [x, z] = at(t);
    for (let y = deckY + 6; y <= 105; y += 7) pts.push(new THREE.Vector3(x, y, z));
    for (let k = 1; k <= 7; k++) for (const dir of [-1, 1]) {
      const [cx, cz] = at(t + dir * k * 0.032);
      for (let u = 0.12; u < 1; u += 0.14) pts.push(new THREE.Vector3(x + (cx - x) * u, 100 + (deckY - 100) * u, z + (cz - z) * u));
    }
  }
  const bridge = new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.PointsMaterial({ color: new THREE.Color(0xfff0d0).multiplyScalar(2.2), size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
  bridge.frustumCulled = false; bridge.name = "kanae-dots"; group.add(bridge);

  const _c = new THREE.Color();
  function update(night, model) {
    if (roadLines) {
      const day = model ? 0.55 : 0;
      roadLines.material.opacity = Math.max(day * (1 - night), night * 0.75);
      roadLines.material.color.copy(_c.set(MODEL_LOOK.road)).lerp(new THREE.Color(0xffb066).multiplyScalar(2.2), night);
      roadLines.visible = roadLines.material.opacity > 0.01;
    }
    for (const f of floods) f.light.intensity = night * 3500;
    glow.material.opacity = night; glow.visible = night > 0.01;
    bridge.material.opacity = night; bridge.visible = night > 0.01;
  }
  return { group, update };
}
