// [v3:town] vendored from Sakuragaoka Station src/world/street/furniture.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Street module — standalone sign posts, sign plates, convex traffic mirrors, guardrails, cones, bollards.
import * as THREE from 'three';
import { MeshBuilder } from './street_mesh.js';
import { SIGN, uvOf } from './street_textures.js';

const TAU = Math.PI * 2;

/** Extruded convex plate from a 2D outline (metres, plate faces +Z). frontUV(x,y)->[u,v]; backUV likewise. */
export function plateGeometry(outline, frontUV, backUV, th = 0.014) {
  const b = new MeshBuilder();
  const n = outline.length;
  let cx = 0, cy = 0; for (const [x, y] of outline) { cx += x; cy += y; } cx /= n; cy /= n;
  const z1 = th / 2, z0 = -th / 2, F = [0, 0, 1], B = [0, 0, -1];
  const fc = b.vert(cx, cy, z1, ...frontUV(cx, cy), F);
  const fi = outline.map(([x, y]) => b.vert(x, y, z1, ...frontUV(x, y), F));
  for (let i = 0; i < n; i++) b.tri(fc, fi[i], fi[(i + 1) % n], F);
  const bc = b.vert(cx, cy, z0, ...backUV(cx, cy), B);
  const bi = outline.map(([x, y]) => b.vert(x, y, z0, ...backUV(x, y), B));
  for (let i = 0; i < n; i++) b.tri(bc, bi[i], bi[(i + 1) % n], B);
  const g = uvOf(SIGN.back, 0.5, 0.5);
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outline[i], [x1, y1] = outline[(i + 1) % n];
    let nx = y1 - y0, ny = -(x1 - x0); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if (nx * ((x0 + x1) / 2 - cx) + ny * ((y0 + y1) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    const N = [nx, ny, 0];
    const a = b.vert(x0, y0, z1, g[0], g[1], N), c = b.vert(x1, y1, z1, g[0], g[1], N), d = b.vert(x1, y1, z0, g[0], g[1], N), e = b.vert(x0, y0, z0, g[0], g[1], N);
    b.quad(a, c, d, e, N);
  }
  return b.geometry();
}
const bboxUV = (cell, outline) => {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of outline) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return (x, y) => uvOf(cell, (x - x0) / (x1 - x0), (y - y0) / (y1 - y0));
};
const backGrey = () => { const g = uvOf(SIGN.back, 0.5, 0.5); return () => g; };
export const OUTLINE = {
  circle: (r, seg = 28) => Array.from({ length: seg }, (_, i) => [Math.cos(i / seg * TAU) * r, Math.sin(i / seg * TAU) * r]),
  rect: (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]],
  diamond: (a) => [[0, -a], [a, 0], [0, a], [-a, 0]],
  // inverted equilateral triangle with side s, centroid at the origin
  triDown: (s) => { const H = s * Math.sqrt(3) / 2; return [[-s / 2, H / 3], [0, -2 * H / 3], [s / 2, H / 3]]; },
};

/** Convex traffic-mirror face: stylised fish-eye street reflection (toon bands), view-parallax, fog. */
function mirrorMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uSkyTop: { value: new THREE.Color('#86b7e6') }, uSkyLow: { value: new THREE.Color('#dfe9f1') },
      uRoad: { value: new THREE.Color('#6f7178') }, uRoadFar: { value: new THREE.Color('#9a9ba2') },
      uB1: { value: new THREE.Color('#eee0c6') }, uB2: { value: new THREE.Color('#c3d2dc') }, uB3: { value: new THREE.Color('#f1c1d0') },
      uRoof: { value: new THREE.Color('#58657a') }, uLine: { value: new THREE.Color('#ecebe5') },
    }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vW; varying vec3 vN; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uSkyTop, uSkyLow, uRoad, uRoadFar, uB1, uB2, uB3, uRoof, uLine;
      varying vec3 vW; varying vec3 vN; varying vec2 vUv;
      float h1(float x){ return fract(sin(x * 127.1 + 3.7) * 43758.5453); }
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r2 = dot(p, p);
        vec3 N = normalize(vN);
        vec3 Rt = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-4, 0.0, 1e-4));
        vec3 Up = cross(N, Rt);
        vec3 V = normalize(cameraPosition - vW);
        vec2 par = vec2(dot(V, Rt), dot(V, Up));
        vec2 q = p * (1.0 + 0.5 * r2) + par * 0.55;
        float hz = -0.18 + 0.28 * q.x * q.x;
        vec3 col;
        if (q.y > hz) {
          float t = clamp((q.y - hz) / 1.3, 0.0, 1.0);
          col = mix(uSkyLow, uSkyTop, smoothstep(0.05, 0.85, t));
          float cx = q.x * 3.0 + 11.0; float bx = floor(cx);
          float bh = hz + 0.16 + 0.42 * h1(bx);
          float side = step(0.22, abs(q.x));
          if (q.y < bh + 0.06 && side > 0.5 && q.y > bh) col = uRoof;
          if (q.y < bh && side > 0.5) { float k = h1(bx + 5.3); col = k < 0.4 ? uB1 : (k < 0.75 ? uB2 : uB3); col *= 0.93 + 0.07 * step(0.5, fract(cx)); }
        } else {
          float d = hz - q.y;
          col = mix(uRoadFar, uRoad, smoothstep(0.0, 0.7, d));
          float px = q.x / max(d, 0.03);
          float e = smoothstep(0.16, 0.05, abs(abs(px) - 1.9));
          float dash = step(0.5, fract(0.55 / max(d, 0.03))) * smoothstep(0.14, 0.04, abs(px));
          col = mix(col, uLine, max(e, dash) * 0.85);
        }
        col = mix(col, col * vec3(0.74, 0.77, 0.9), smoothstep(0.5, 1.0, r2));
        float s = dot(p, normalize(vec2(-0.72, 0.69)));
        col += vec3(1.0) * smoothstep(0.07, 0.0, abs(s - 0.5)) * 0.45 * (1.0 - smoothstep(0.75, 1.0, r2));
        col += vec3(1.0) * smoothstep(0.035, 0.0, abs(s - 0.64)) * 0.3 * (1.0 - smoothstep(0.75, 1.0, r2));
        col *= 0.86;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
    fog: true,
  });
}

export function buildFurniture(ctx, root, tex, opts) {
  const { L, mat, physics } = ctx;
  const H = L.heightAt;
  const G = ctx.geo.G;
  // One vertex-coloured toon material (+ a double-sided twin) for every solid-colour part: posts, mirrors,
  // guardrails, cones, bollards — they all batch into one draw call per area.
  const VC = mat.toon('#ffffff', { vertexColors: true, paint: 0.03 });
  const VC2 = mat.toon('#ffffff', { vertexColors: true, paint: 0.03, side: 'double' });
  const COL = { steel: '#a8aeb3', steelDark: '#7b8289', orange: '#e5873c', white: '#e8e6df', coneRed: '#e8604a', coneWhite: '#eeece6', dark: '#4a4852', yellow: '#efc43a', delin: '#e8943f', red: '#d9564a' };
  const tintCache = new Map();
  function tint(geo, hex) {
    const key = geo.uuid + hex;
    if (tintCache.has(key)) return tintCache.get(key);
    const g = geo.clone();
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    tintCache.set(key, g);
    return g;
  }
  /** solid-colour part: geo (unit or sized), colour hex, pos, rot [rx,ry,rz], scale [sx,sy,sz], parent */
  function part(geo, hex, pos, rot, scale, parent = root, m = VC) {
    const mesh = new THREE.Mesh(tint(geo, hex), m);
    if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  const cylGeoCache = new Map();
  const taper = (rt, rb, h, seg) => { const k = [rt, rb, h, seg].join('|'); if (!cylGeoCache.has(k)) cylGeoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg)); return cylGeoCache.get(k); };
  const cyl = (r, h, hex, pos, seg = 10, parent = root) => part(G.cyl(seg), hex, pos, null, [r * 2, h, r * 2], parent);
  const cylT = (rt, rb, h, hex, pos, seg = 10, parent = root) => part(taper(rt, rb, h, seg), hex, pos, null, null, parent);
  const box = (w, h, d, hex, pos, rot, parent = root) => part(G.box(), hex, pos, rot, [w, h, d], parent);
  const signMat = mat.toon('#ffffff', { map: tex.signs, paint: 0.0 });
  const mirrorMat = mirrorMaterial();
  const plates = [];

  // --------------------------------------------------------------- plates
  function addPlate(geo, x, y, z, rotY, tilt = 0) {
    const m = new THREE.Mesh(geo, signMat);
    m.position.set(x, y, z); m.rotation.set(tilt, rotY, 0, 'YXZ');
    m.castShadow = true; m.receiveShadow = true; root.add(m); plates.push(m); return m;
  }
  const geoCache = new Map();
  function plateGeo(kind, cell, size, double = false) {
    const key = kind + '|' + (cell.x + ',' + cell.y) + '|' + size.join(',') + '|' + double;
    if (geoCache.has(key)) return geoCache.get(key);
    let out, front;
    if (kind === 'circle') { out = OUTLINE.circle(size[0]); front = bboxUV(cell, out); }
    else if (kind === 'rect') { out = OUTLINE.rect(size[0], size[1]); front = bboxUV(cell, out); }
    else if (kind === 'diamond') { out = OUTLINE.diamond(size[0]); front = bboxUV(cell, out); }
    else if (kind === 'tri') {
      const s = size[0], Hh = s * Math.sqrt(3) / 2; out = OUTLINE.triDown(s);
      front = (x, y) => uvOf(cell, (128 + x * (244 / s)) / 256, 1 - (14 + (Hh / 3 - y) * (228 / Hh)) / 256);
    }
    const back = double ? (x, y) => front(-x, y) : backGrey();
    const g = plateGeometry(out, front, back);
    geoCache.set(key, g);
    return g;
  }
  /** Galvanised post; returns top y. Plate list: [{kind, cell, size, y (above base), double, dx}] */
  function signPost(x, z, baseY, height, rotY, items, o = {}) {
    const r = o.r ?? 0.03;
    cyl(r, height + 0.05, o.col || COL.steel, [x, baseY + height / 2 - 0.025, z]);
    cyl(r + 0.006, 0.03, COL.steelDark, [x, baseY + height + 0.01, z]);
    cylT(r + 0.018, r + 0.024, 0.06, COL.steelDark, [x, baseY + 0.025, z]);
    const fx = Math.sin(rotY), fz = Math.cos(rotY);
    for (const it of items) {
      const off = r + 0.012 + (it.gap || 0);
      const lat = it.dx || 0; const rx = Math.cos(rotY), rz = -Math.sin(rotY);
      const px = x + fx * off + rx * lat, pz = z + fz * off + rz * lat, py = baseY + it.y;
      addPlate(plateGeo(it.kind, it.cell, it.size, it.double), px, py, pz, rotY, it.tilt || 0);
      // U-bolt clamps behind the plate
      if (!it.noClamp) for (const dy of it.clamps || [0]) {
        box(0.09, 0.028, 0.03, COL.steelDark, [x + fx * (r * 0.3), py + dy, z + fz * (r * 0.3)], [0, rotY, 0]);
      }
    }
    physics.addCylinder(x, z, r + 0.06, baseY - 0.2, baseY + height);
    return baseY + height;
  }

  // --------------------------------------------------------------- mirrors
  const faceGeo = new THREE.CircleGeometry(0.3, 28);
  const rimGeo = new THREE.TorusGeometry(0.303, 0.024, 6, 28);
  const backGeo = new THREE.SphereGeometry(0.315, 20, 5, 0, TAU, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 1, 0.28);
  const hoodGeo = new THREE.CylinderGeometry(0.335, 0.335, 0.13, 16, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, 0, 0.06);
  function mirrorHead(parent, pos, rotY, tilt = 0.07) {
    const g = new THREE.Group(); g.position.set(pos[0], pos[1], pos[2]); g.rotation.set(tilt, rotY, 0, 'YXZ'); parent.add(g);
    const face = new THREE.Mesh(faceGeo, mirrorMat); face.position.z = 0.014; face.receiveShadow = false; g.add(face);
    part(rimGeo, COL.orange, [0, 0, 0.012], null, null, g);
    part(backGeo, COL.orange, null, null, null, g);
    part(hoodGeo, COL.orange, null, null, null, g, VC2);
    part(G.box(), COL.orange, [0, 0, -0.16], null, [0.06, 0.06, 0.2], g);
    return g;
  }
  /** Curve mirror post. heads: [{yaw (relative), dx (lateral on a T-arm)}] */
  function curveMirror(x, z, rotY, heads = [{ yaw: 0, dx: 0 }], extra = [], baseY) {
    const base = baseY ?? H(x, z) + (opts.baseLift?.(x, z) || 0);
    const hTop = 3.05;
    cyl(0.038, hTop, COL.orange, [x, base + hTop / 2 - 0.02, z], 12);
    cyl(0.045, 0.035, COL.orange, [x, base + hTop, z], 12);
    cylT(0.07, 0.08, 0.06, COL.steelDark, [x, base + 0.02, z], 12);
    const g = new THREE.Group(); g.position.set(x, base, z); g.rotation.y = rotY; root.add(g);
    const yHead = 2.72;
    if (heads.length > 1) part(G.box(), COL.orange, [0, yHead + 0.05, 0.05], null, [1.0, 0.055, 0.055], g);
    for (const h of heads) mirrorHead(g, [h.dx || 0, yHead, 0.26], h.yaw || 0);
    // small municipal plate on the post
    const pl = new THREE.Mesh(plateGeo('rect', SIGN.pTown, [0.34, 0.085]), signMat); pl.position.set(0, 1.85, 0.047); pl.castShadow = true; g.add(pl); plates.push(pl);
    for (const it of extra) { const m = new THREE.Mesh(plateGeo(it.kind, it.cell, it.size, it.double), signMat); const ry = it.rotY || 0; m.position.set(Math.sin(ry) * 0.056, it.y, Math.cos(ry) * 0.056); m.rotation.y = ry; m.castShadow = true; g.add(m); plates.push(m); }
    physics.addCylinder(x, z, 0.12, base - 0.2, base + hTop);
  }

  // --------------------------------------------------------------- guardrail (white W-beam)
  const railProfile = (() => {
    const pts = [];
    const N = 12;
    for (let i = 0; i <= N; i++) { const v = -0.175 + 0.35 * i / N; const b = 0.034 * Math.pow(Math.sin(Math.PI * (v + 0.175) / 0.175), 2); pts.push([b, v]); }
    const back = pts.slice().reverse().map(([l, v]) => [l - 0.014, v]);
    return [...pts, ...back];
  })();
  function guardrail(a, b, roadDir, o = {}) {
    // a,b: [x,z]; roadDir: +1 if the road is on the left of a->b (i.e. along n=(-dz,dx)), -1 otherwise
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); const tx = dx / len, tz = dz / len;
    const nx = -tz * roadDir, nz = tx * roadDir; // toward the road
    const n = Math.max(1, Math.round(len / 2));
    const lift = o.lift || (() => 0);
    const rings = [];
    const beamY = 0.6;
    for (let i = -1; i <= n + 1; i++) {
      let f = i / n; let back = 0;
      if (i < 0) { f = -0.22 / len; back = -0.2; } else if (i > n) { f = 1 + 0.22 / len; back = -0.2; }
      const px = a[0] + dx * f + nx * back, pz = a[1] + dz * f + nz * back;
      rings.push({ x: px, z: pz, y: H(px, pz) + lift(px, pz) + beamY });
    }
    const B = new MeshBuilder(true);
    const P = railProfile.length, wc = new THREE.Color(COL.white), WC = [wc.r, wc.g, wc.b];
    const idx = rings.map((r) => railProfile.map(([l, v]) => B.vert(r.x + nx * l, r.y + v, r.z + nz * l, 0, 0, [0, 1, 0], WC)));
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < P; j++) {
      const j2 = (j + 1) % P;
      const [l0, v0] = railProfile[j], [l1, v1] = railProfile[j2];
      let ex = (v1 - v0), ey = -(l1 - l0); // outward in (l,v) plane
      const want = [nx * ex, ey, nz * ex];
      B.quad(idx[i][j], idx[i + 1][j], idx[i + 1][j2], idx[i][j2], want);
    }
    const m = B.mesh(VC, { cast: true, computeNormals: true }); root.add(m);
    for (let i = 0; i <= n; i++) {
      const f = i / n, px = a[0] + dx * f - nx * 0.085, pz = a[1] + dz * f - nz * 0.085, y = H(px, pz) + lift(px, pz);
      cyl(0.06, 0.86, COL.white, [px, y + 0.38, pz]);
      cyl(0.066, 0.025, COL.white, [px, y + 0.81, pz]);
      if (i % 3 === 1) box(0.07, 0.07, 0.012, COL.delin, [px + nx * 0.07, y + 0.78, pz + nz * 0.07], [0, Math.atan2(nx, nz), 0]);
    }
    { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; physics.addBox(mx - nx * 0.04, mz - nz * 0.04, 0.24, len + 0.3, Math.atan2(tx, tz), -5, Math.max(H(a[0], a[1]), H(b[0], b[1])) + lift(mx, mz) + 0.9); }
  }

  // --------------------------------------------------------------- traffic cone + cone bar
  const coneGeo = new THREE.CylinderGeometry(0.028, 0.13, 0.62, 14);
  const bandGeo1 = new THREE.CylinderGeometry(0.066, 0.086, 0.09, 14, 1, true);
  const bandGeo2 = new THREE.CylinderGeometry(0.098, 0.113, 0.07, 14, 1, true);
  function cone(x, z, y0) {
    box(0.36, 0.04, 0.36, COL.dark, [x, y0 + 0.02, z]);
    part(coneGeo, COL.coneRed, [x, y0 + 0.35, z]);
    part(bandGeo1, COL.coneWhite, [x, y0 + 0.47, z]);
    part(bandGeo2, COL.coneWhite, [x, y0 + 0.25, z]);
    physics.addCylinder(x, z, 0.2, y0 - 0.1, y0 + 0.7);
  }
  function coneBar(a, b, y) {
    const n = 8, dx = (b[0] - a[0]) / n, dz = (b[1] - a[1]) / n, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let i = 0; i < n; i++) {
      const m = part(G.cyl(10), i % 2 ? COL.dark : COL.yellow, [a[0] + dx * (i + 0.5), y, a[1] + dz * (i + 0.5)], null, [0.044, len / n, 0.044]);
      m.rotation.order = 'YXZ'; m.rotation.set(Math.PI / 2, Math.atan2(dx, dz), 0);
    }
  }
  function bollard(x, z, y0) {
    cyl(0.05, 0.82, COL.white, [x, y0 + 0.4, z], 12);
    part(G.sphere(10), COL.white, [x, y0 + 0.81, z], null, [0.104, 0.104, 0.104]);
    cyl(0.053, 0.07, COL.red, [x, y0 + 0.66, z], 12);
    cylT(0.08, 0.09, 0.04, COL.steelDark, [x, y0 + 0.02, z], 12);
    physics.addCylinder(x, z, 0.12, y0 - 0.1, y0 + 0.85);
  }

  return { signPost, curveMirror, guardrail, cone, coneBar, bollard, plateGeo, addPlate, part, box, cyl, COL, materials: { VC, signMat, mirrorMat } };
}
