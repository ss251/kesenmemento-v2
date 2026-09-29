// Building massing from data/buildings/{city,core}.mesh.bin: one MeshStandardMaterial for both files.
// Photo look: warm white walls and grey roofs with ±6% jitter (spec §1). Model look: white walls, roofs coloured by
// sampling the ortho at each footprint and snapping to the model palette (ADDENDUM). Night: WINDOW emissive bands on
// the 35% of buildings marked lit (by footprint hash).
import * as THREE from "three";
import { hash01 } from "../../core/geo.js";
import { parseMeshBin, cullTrianglesInBox } from "../lib/meshbin.js";
import { attributeVertices, pointInPoly } from "../lib/attribution.js";
import { roofColour } from "../lib/palette.js";
import { chainCompile } from "./atmosphere.js";
import { BUILDING, MODEL_LOOK } from "../config.js";

const lin = (c) => c.map((v) => Math.pow(v, 2.2));             // palette is sRGB; vertex attributes are linear
const GREY = lin([0.64, 0.65, 0.66]);
function roofSampleForFeature(f, sample) {
  let x = 0, z = 0; for (const p of f.poly) { x += p[0]; z += p[1]; } x /= f.poly.length; z /= f.poly.length;
  const pts = [[x, z]]; for (let i = 0; i < f.poly.length && pts.length < 7; i++) pts.push([(f.poly[i][0] * 0.4 + x * 0.6), (f.poly[i][1] * 0.4 + z * 0.6)]);
  const acc = [0, 0, 0]; let n = 0;
  for (const [px, pz] of pts) { if (!pointInPoly(f.poly, px, pz)) continue; const c = sample(px, pz); if (c) { acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; n++; } }
  return n ? acc.map((v) => v / n) : null;
}

/** KLA1 (P2 *.attr.bin): u32 magic 'KLA1', u32 vertCount, u8 roof[V] (palette index), u8 flags[V] (1 lit, 2 roof, 4 gable end). */
export function parseAttr(buffer) {
  const u8 = new Uint8Array(buffer), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x4b4c4131) throw new Error("attr.bin: bad magic");
  const V = dv.getUint32(4, true);
  return { vertCount: V, roof: u8.subarray(8, 8 + V), flags: u8.subarray(8 + V, 8 + 2 * V) };
}

function geometryFromAttr(mesh, attr, palette) {
  const vc = mesh.vertCount, roof = new Float32Array(vc * 3), info = new Float32Array(vc * 3), uvy = new Float32Array(vc);
  const pal = palette.map((c) => lin(c));
  for (let v = 0; v < vc; v++) {
    uvy[v] = mesh.uv[v * 2 + 1];
    roof.set(pal[attr.roof[v]] ?? GREY, v * 3);
    const x = mesh.pos[v * 3], z = mesh.pos[v * 3 + 2];
    info[v * 3] = attr.flags[v] & 1 ? 1 : 0;
    info[v * 3 + 1] = hash01(`${Math.floor(x / 24)},${Math.floor(z / 24)},${attr.roof[v]}`) * 2 - 1;
  }
  return finishGeometry(mesh, roof, info, uvy);
}

function finishGeometry(mesh, roof, info, uvy) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(mesh.pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(mesh.nrm, 3));
  g.setAttribute("aUvY", new THREE.BufferAttribute(uvy, 1));
  g.setAttribute("aRoof", new THREE.BufferAttribute(roof, 3));
  g.setAttribute("aInfo", new THREE.BufferAttribute(info, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

function buildGeometry(mesh, features, sample) {
  const vc = mesh.vertCount, roof = new Float32Array(vc * 3), info = new Float32Array(vc * 3), uvy = new Float32Array(vc);
  for (let i = 0; i < vc; i++) uvy[i] = mesh.uv[i * 2 + 1];
  const fidx = features ? attributeVertices(mesh, features) : new Int32Array(vc).fill(-1);
  const perFeature = new Map();
  const featureAttrs = (i) => {
    let a = perFeature.get(i); if (a) return a;
    const f = features[i], id = f.id ?? String(i);
    const s = roofSampleForFeature(f, sample);
    a = { roof: s ? lin(roofColour(...s)) : GREY, lit: f.lit ?? hash01(id) < BUILDING.litShare, jitter: hash01(id + "j") * 2 - 1, h: f.h ?? 0 };
    perFeature.set(i, a); return a;
  };
  let matched = 0;
  for (let v = 0; v < vc; v++) {
    const fi = fidx[v]; if (fi < 0) continue; matched++;
    const a = featureAttrs(fi);
    roof.set(a.roof, v * 3); info[v * 3] = a.lit ? 1 : 0; info[v * 3 + 1] = a.jitter; info[v * 3 + 2] = a.h;
  }
  if (matched < vc) {                                               // unmatched: per-triangle centroid sampling
    const { pos, idx } = mesh;
    for (let t = 0; t < idx.length; t += 3) {
      const v0 = idx[t]; if (fidx[v0] >= 0) continue;
      const a = v0 * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const x = (pos[a] + pos[b] + pos[c]) / 3, z = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
      const key = `${Math.round(x / 14)},${Math.round(z / 14)}`, s = sample(x, z);
      const col = s ? lin(roofColour(...s)) : GREY, lit = hash01(key) < BUILDING.litShare ? 1 : 0, j = hash01(key + "j") * 2 - 1;
      for (const v of [idx[t], idx[t + 1], idx[t + 2]]) { roof.set(col, v * 3); info[v * 3] = lit; info[v * 3 + 1] = j; }
    }
  }
  return { geometry: finishGeometry(mesh, roof, info, uvy), matched };
}

export function buildingMaterial(atm, uniforms) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
  atm.shadowMaterial(m);
  chainCompile(m, (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader.replace("#include <common>", `#include <common>
      attribute vec3 aRoof; attribute vec3 aInfo; attribute float aUvY;
      varying vec3 vRoof; varying vec3 vInfo; varying float vUvY; varying vec3 vWPos; varying vec3 vWNrm;`)
      .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
      vRoof = aRoof; vInfo = aInfo; vUvY = aUvY;
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vRoof; varying vec3 vInfo; varying float vUvY; varying vec3 vWPos; varying vec3 vWNrm;
      uniform float uModel, uNight, uWinI; uniform vec3 uWall, uRoofC, uMWall, uWin; uniform vec4 uHide;
      float bh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
      if (uHide.w > 0.5 && distance(vWPos.xz, uHide.xy) < uHide.z) discard;
      float isRoof = step(0.6, abs(vWNrm.y));
      float jit = 1.0 + vInfo.y * ${BUILDING.jitter.toFixed(3)};
      vec3 photoC = mix(uWall, uRoofC, isRoof) * jit;
      vec3 modelC = mix(uMWall * (1.0 + vInfo.y * 0.02), vRoof, isRoof);
      diffuseColor.rgb *= mix(photoC, modelC, uModel);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      if (uNight > 0.001 && vInfo.x > 0.5) {
        vec3 wn = normalize(vec3(vWNrm.x, 0.0, vWNrm.z));
        float s = dot(vWPos.xz, vec2(-wn.z, wn.x));
        vec2 cell = vec2(s / 3.6, vWPos.y / 3.2);
        vec2 f = fract(cell);
        float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.78);
        float on = step(0.35, bh(floor(cell) + vInfo.y * 17.0));
        vec2 fw = fwidth(cell);
        win = mix(win * on, 0.2, smoothstep(0.35, 0.8, max(fw.x, fw.y)));
        float wall = (1.0 - step(0.6, abs(vWNrm.y))) * step(0.06, vUvY) * step(vUvY, 0.96);
        totalEmissiveRadiance += uWin * uWinI * uNight * win * wall;
      }`);
  }, "buildings");
  return m;
}

export async function createBuildings({ atm, files, features, sampleFor, coreBox, palette }) {
  const group = new THREE.Group(); group.name = "buildings";
  const uniforms = {
    uModel: { value: 0 }, uNight: { value: 0 }, uWinI: { value: BUILDING.windowI },
    uWall: { value: new THREE.Color(BUILDING.wall) }, uRoofC: { value: new THREE.Color(BUILDING.roof) },
    uMWall: { value: new THREE.Color(MODEL_LOOK.wall) }, uWin: { value: new THREE.Color(BUILDING.window) },
    uHide: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  const material = buildingMaterial(atm, uniforms);
  const stats = { triangles: 0, matched: 0, verts: 0, files: [] };
  for (const { name, buffer, attrBuffer } of files) {
    if (!buffer) continue;
    let mesh = parseMeshBin(buffer);
    let attr = null;
    if (attrBuffer && palette) { try { attr = parseAttr(attrBuffer); if (attr.vertCount !== mesh.vertCount) attr = null; } catch { attr = null; } }
    // P2's city file already excludes the core; only fixture-style files that repeat the core get culled
    if (!attr && name === "city" && coreBox && files.some((f) => f.name === "core" && f.buffer)) mesh = cullTrianglesInBox(mesh, coreBox);
    const { geometry, matched } = attr ? { geometry: geometryFromAttr(mesh, attr, palette), matched: mesh.vertCount } : buildGeometry(mesh, features, sampleFor);
    const m = new THREE.Mesh(geometry, material); m.name = "buildings-" + name;
    m.castShadow = m.receiveShadow = true; group.add(m);
    stats.triangles += mesh.idx.length / 3; stats.matched += matched; stats.verts += mesh.vertCount; stats.files.push(name);
  }
  return { group, uniforms, material, stats };
}
