// Gaussian splats via Spark 2.2 (spec §2, §4, §7). Loads data/splats/{name}/ ({name}.rad paged LoD, falling back
// to {name}.ply) with its transform.json, and in the city shows a splat only inside its capture cone.
import * as THREE from "three";
import { SplatMesh } from "@sparkjsdev/spark";

async function exists(url) { try { const r = await fetch(url, { method: "HEAD" }); return r.ok; } catch { return false; } }

/** Resolve the files of splat `name` (data/ first, then fixtures/). -> { base, transform, url, kind } or null. */
export async function resolveSplat(name, roots = ["data/splats/", "fixtures/splats/"]) {
  for (const root of roots) {
    const base = `${root}${name}/`;
    let transform = null;
    try { const r = await fetch(base + "transform.json"); if (r.ok) transform = await r.json(); } catch { /* none */ }
    if (!transform) continue;
    for (const [file, kind] of [[`${name}.rad`, "rad"], [`${name}-lod.rad`, "rad"], [`${name}.ply`, "ply"], [transform.source, "ply"]]) {
      if (file && (await exists(base + file))) return { base, transform, url: base + file, kind, root };
    }
  }
  return null;
}

export async function loadSplat(info, { onProgress } = {}) {
  const opts = info.kind === "rad" ? { url: info.url, paged: true } : { url: info.url, fileType: "ply" };
  const mesh = new SplatMesh({ ...opts, onProgress });
  await mesh.initialized;
  return mesh;
}

export function applyTransform(obj, tr) {
  if (tr?.position) obj.position.fromArray(tr.position);
  if (tr?.quaternion) obj.quaternion.fromArray(tr.quaternion);
  if (tr?.scale != null) obj.scale.setScalar(tr.scale);
  obj.updateMatrixWorld(true);
}

/** City splats with capture cones: opacity ramps over 15 m at the cone radius; hides massing when > 0.8 opaque. */
export function createCitySplats({ buildings }) {
  const items = [];
  const group = new THREE.Group(); group.name = "city-splats";
  async function add(name) {
    const info = await resolveSplat(name);
    if (!info || info.transform.frame === "table" || !info.transform.cone) return null;   // cone-less splats are portal-only
    const mesh = await loadSplat(info);
    applyTransform(mesh, info.transform);
    mesh.opacity = 0; mesh.visible = false; group.add(mesh);
    const cone = info.transform.cone ?? { heading: 80, halfAngle: 40, radius: 60 };
    const item = { name, mesh, info, cone, center: new THREE.Vector3().fromArray(info.transform.position), opacity: 0 };
    items.push(item); return item;
  }
  const dir = new THREE.Vector3();
  function update(camera) {
    let hide = null;
    for (const it of items) {
      const d = Math.hypot(camera.position.x - it.center.x, camera.position.z - it.center.z);
      camera.getWorldDirection(dir);
      const heading = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
      let dh = Math.abs(((heading - it.cone.heading + 540) % 360) - 180);
      const inCone = 1 - THREE.MathUtils.smoothstep(dh, it.cone.halfAngle, it.cone.halfAngle + 25);
      const near = THREE.MathUtils.clamp((it.cone.radius + 15 - d) / 15, 0, 1);
      it.opacity = near * inCone; it.mesh.opacity = it.opacity; it.mesh.visible = it.opacity > 0.01;
      if (it.opacity > 0.8) hide = it;
    }
    const u = buildings?.uniforms?.uHide?.value;
    if (u) { if (hide) u.set(hide.center.x, hide.center.z, hide.cone.radius * 0.7, 1); else u.w = 0; }
  }
  return { group, add, update, items };
}
