// Terrain: two meshes (city grid with a hole under the core, detailed core grid), ortho-draped for the photo look,
// and a model-mode shading derived from the same ortho (pale board, green where the photo is vegetated, contours).
import * as THREE from "three";
import { sampleGrid } from "../../core/geo.js";
import { chainCompile } from "./atmosphere.js";
import { MODEL_LOOK } from "../config.js";

function gridGeometry(grid, stride, ortho, hole) {
  const { meta, heights } = grid, W = meta.width, H = meta.height;
  const cols = Math.floor((W - 1) / stride) + 1, rows = Math.floor((H - 1) / stride) + 1;
  const pos = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2);
  const ow = ortho ? ortho.width * ortho.dx : 1, oh = ortho ? ortho.height * ortho.dz : 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const gi = r * stride * W + c * stride, i = r * cols + c;
    const x = meta.x0 + c * stride * meta.dx, z = meta.z0 + r * stride * meta.dz;
    const h = heights[gi]; pos[i * 3] = x; pos[i * 3 + 1] = Number.isFinite(h) ? h : 0; pos[i * 3 + 2] = z;
    if (ortho) { uv[i * 2] = (x - ortho.x0) / ow; uv[i * 2 + 1] = (z - ortho.z0) / oh; }
  }
  const idx = new Uint32Array((cols - 1) * (rows - 1) * 6); let n = 0;
  const inHole = (i) => hole && pos[i * 3] > hole[0] && pos[i * 3] < hole[2] && pos[i * 3 + 2] > hole[1] && pos[i * 3 + 2] < hole[3];
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    if (inHole(a) && inHole(b) && inHole(d) && inHole(e)) continue;
    idx[n++] = a; idx[n++] = d; idx[n++] = b; idx[n++] = b; idx[n++] = d; idx[n++] = e;   // CCW seen from +y
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx.subarray(0, n), 1));
  g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

function terrainMaterial(atm, map, uniforms, name) {
  const m = new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.96, metalness: 0 });
  atm.shadowMaterial(m);
  chainCompile(m, (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vWPos; uniform float uModel; uniform vec3 uSand, uForest, uRoad;`)
      .replace("#include <map_fragment>", `
      #ifdef USE_MAP
        vec4 tc = texture2D(map, vMapUv);
      #else
        vec4 tc = vec4(0.35, 0.4, 0.3, 1.0);
      #endif
      vec3 photo = tc.rgb;
      if (uModel > 0.001) {
        float lum = dot(tc.rgb, vec3(0.2126, 0.7152, 0.0722));
        float veg = smoothstep(0.004, 0.03, tc.g - max(tc.r, tc.b) * 1.02) * smoothstep(0.6, 3.0, vWPos.y);
        float sat = max(tc.r, max(tc.g, tc.b)) - min(tc.r, min(tc.g, tc.b));
        float road = smoothstep(0.16, 0.3, lum) * (1.0 - smoothstep(0.03, 0.08, sat)) * (1.0 - veg);
        vec3 board = mix(uSand, uRoad, road) * (0.96 + 0.08 * smoothstep(0.02, 0.2, lum));
        vec3 mcol = mix(board, uForest * (0.9 + 0.3 * smoothstep(0.02, 0.12, lum)), veg);
        float ch = vWPos.y / 10.0;
        float line = 1.0 - smoothstep(0.0, fwidth(ch) * 1.3, abs(fract(ch + 0.5) - 0.5));
        mcol *= 1.0 - 0.13 * line * step(5.0, vWPos.y);
        photo = mix(photo, mcol, uModel);
      }
      diffuseColor.rgb *= photo;`);
  }, "terrain-" + name);
  return m;
}

export async function createTerrain({ atm, grids, orthos, tier }) {
  const group = new THREE.Group(); group.name = "terrain";
  const uniforms = {
    uModel: { value: 0 },
    uSand: { value: new THREE.Color(MODEL_LOOK.terrain) }, uForest: { value: new THREE.Color(MODEL_LOOK.forest) }, uRoad: { value: new THREE.Color(MODEL_LOOK.road) },
  };
  const meshes = {};
  const core = grids.core, city = grids.city;
  let hole = null;
  if (core && city) {
    const m = core.meta, pad = city.meta.dx * tier.cityStep / city.meta.dx;
    hole = [m.x0 + pad, m.z0 + pad, m.x0 + (m.width - 1) * m.dx - pad, m.z0 + (m.height - 1) * m.dz - pad];
  }
  for (const [name, grid] of [["city", city], ["core", core]]) {
    if (!grid) continue;
    const step = name === "core" ? tier.coreStep : tier.cityStep;
    const stride = Math.max(1, Math.round(step / grid.meta.dx));
    const o = orthos[name];
    const geo = gridGeometry(grid, stride, o?.meta, name === "city" ? hole : null);
    const mat = terrainMaterial(atm, o?.texture ?? null, uniforms, name);
    if (name === "city") { mat.polygonOffset = true; mat.polygonOffsetFactor = 2; mat.polygonOffsetUnits = 4; }
    const mesh = new THREE.Mesh(geo, mat); mesh.name = "terrain-" + name;
    mesh.receiveShadow = true; mesh.castShadow = name === "core";
    group.add(mesh); meshes[name] = mesh;
  }
  const heightAt = (x, z) => {
    if (core) { const v = sampleGrid(core.heights, core.meta, x, z); if (Number.isFinite(v)) return v; }
    if (city) { const v = sampleGrid(city.heights, city.meta, x, z); if (Number.isFinite(v)) return v; }
    return 0;
  };
  const triangles = Object.values(meshes).reduce((s, m) => s + m.geometry.index.count / 3, 0);
  return { group, meshes, uniforms, heightAt, triangles, setModel: (v) => (uniforms.uModel.value = v) };
}

/** Ortho texture + metadata for one bbox name; also returns a small canvas sampler for roof colours / trees. */
export async function loadOrtho(url, meta, renderer) {
  if (!url || !meta) return null;
  const img = await new Promise((res, rej) => { const i = new Image(); i.decoding = "async"; i.onload = () => res(i); i.onerror = rej; i.src = url; }).catch(() => null);
  if (!img) return null;
  const texture = new THREE.Texture(img);
  texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.needsUpdate = true;
  // CPU copy for roof colours / tree scatter, only built if a fallback path asks for it (real data ships both)
  const S = Math.min(2048, img.naturalWidth); let px = null;
  const pixels = () => {
    if (px) return px;
    const cv = document.createElement("canvas"); cv.width = cv.height = S;
    const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, S, S);
    return (px = cx.getImageData(0, 0, S, S).data);
  };
  const ex = meta.width * meta.dx, ez = meta.height * meta.dz;
  /** sRGB 0..1 colour at ENU (x, z), or null outside. */
  const sample = (x, z) => {
    const u = (x - meta.x0) / ex, v = (z - meta.z0) / ez;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return null;
    const o = (Math.floor(v * S) * S + Math.floor(u * S)) * 4, px = pixels();
    return [px[o] / 255, px[o + 1] / 255, px[o + 2] / 255];
  };
  return { texture, meta, sample, image: img };
}
