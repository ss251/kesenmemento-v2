// [v3:foundation] First-look anime blocks for mid / far lots: instanced bodies (wall colour, painted window bands
// from world position, a darker plinth) + instanced roofs (gable / hip prisms from Sakura's far town, flat caps),
// coloured per lot from the layout. One draw call per part.
import * as THREE from 'three';
import { unitGable, unitHip } from './far.js';
import { windowGlow } from '../life/lights.js';   // [v3:life] night windows

function blockMaterial(ctx) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ctx.mat.gradientMap });
  const W = windowGlow(ctx);   // [v3:life]
  m.onBeforeCompile = (sh) => {
    W.patch(sh);   // [v3:life] klcWindowGlow / klcWindowNight
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBw; varying vec3 vBn; varying float vBase;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        { vec4 pw = vec4(transformed, 1.0); vec3 nn = objectNormal;
          #ifdef USE_INSTANCING
            pw = instanceMatrix * pw; nn = mat3(instanceMatrix) * nn;
          #endif
          vBw = (modelMatrix * pw).xyz; vBn = normalize(mat3(modelMatrix) * nn);
          vec4 b0 = vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
            b0 = instanceMatrix * b0;
          #endif
          vBase = (modelMatrix * b0).y; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBw; varying vec3 vBn; varying float vBase;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 n = normalize(vBn);
          float vert = 1.0 - step(0.5, abs(n.y));
          float u = dot(vBw.xz, normalize(vec2(-n.z, n.x) + 1e-5));
          float y = vBw.y - vBase;
          float fl = fract((y - 0.6) / 2.9);
          float win = step(0.38, fl) * step(fl, 0.8) * step(0.18, fract(u / 2.4)) * step(fract(u / 2.4), 0.78) * step(1.2, y);
          float dist = length(vBw - cameraPosition);
          win *= 1.0 - smoothstep(900.0, 2600.0, dist);
          vec3 glass = mix(vec3(0.36, 0.43, 0.55), vec3(0.62, 0.7, 0.78), smoothstep(0.55, 0.8, fl));
          glass *= 1.0 - 0.75 * klcWindowNight();   // [v3:life] dark glass at night
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * vert * 0.85);
          diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.5, y)) * 0.25 * vert;
          vec3 klcCell = vec3(floor(u / 2.4), floor((y - 0.6) / 2.9), floor(vBase * 13.0 + dot(floor(vBw.xz / 9.0), vec2(1.7, 3.1))));   // [v3:life]
          klcGlow = klcWindowGlow(klcCell, 0.55) * win * vert * (1.0 - smoothstep(1800.0, 3200.0, dist));   // [v3:life]
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += klcGlow;')   // [v3:life]
      .replace('void main() {', 'void main() {\n vec3 klcGlow = vec3(0.0);');   // [v3:life]
  };
  m.customProgramCacheKey = () => 'klc-block-w';   // [v3:life] night windows
  return m;
}

export function buildBlocks(ctx, lots, { maxDist = 5000, centre } = {}) {
  const list = lots.filter((l) => Math.hypot(l.obb.cx - centre.cx, l.obb.cz - centre.cz) < maxDist && l.obb.w > 1.5 && l.obb.d > 1.5);
  const body = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const gable = unitGable(), hip = unitHip();
  const cap = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bodyMat = blockMaterial(ctx), roofMat = ctx.mat.toon('#ffffff', { paint: 0.05 });
  const count = { gable: 0, hip: 0, flat: 0 };
  // small buildings read as pitched-roof houses from the air (most of Kesennuma); big / tall ones keep flat roofs
  const shapeOf = (l) => (l.height > 11 || l.kind === 'factory' || (l.roof.shape === 'flat' && l.area > 260) ? 'flat' : l.roof.shape === 'hip' ? 'hip' : 'gable');
  const DARK = ['#4d6457', '#56677a', '#3e4a63', '#6a5448', '#4a4f58', '#7b8691', '#8e4540', '#4a78a0'];
  const roofCol = (l, sh) => { const c = l.roof.color; if (sh !== 'flat' && (c === '#d8dbd6' || c === '#b9bab4' || c === '#7b8691')) return DARK[l.seed % DARK.length]; return c; };
  for (const l of list) count[shapeOf(l)]++;
  const bodies = new THREE.InstancedMesh(body, bodyMat, list.length);
  const roofs = { gable: new THREE.InstancedMesh(gable, roofMat, Math.max(1, count.gable)), hip: new THREE.InstancedMesh(hip, roofMat, Math.max(1, count.hip)), flat: new THREE.InstancedMesh(cap, roofMat, Math.max(1, count.flat)) };
  const fill = { gable: 0, hip: 0, flat: 0 };
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  list.forEach((l, i) => {
    const o = l.obb;
    const h = Math.max(2.6, l.height);
    const base = l.groundY - 0.6;
    Q.setFromAxisAngle(Y, o.rotY);
    P.set(o.cx, base, o.cz); S.set(Math.max(1, o.w - 0.25), h + 0.6, Math.max(1, o.d - 0.25));
    bodies.setMatrixAt(i, M4.compose(P, Q, S));
    bodies.setColorAt(i, col.set(l.wall));
    const sh = shapeOf(l), k = fill[sh]++;
    if (sh === 'flat') {
      P.set(o.cx, base + h + 0.6, o.cz); S.set(o.w - 0.1, 0.35, o.d - 0.1);
    } else {
      // ridge along the longer side: the unit roofs have their ridge along local x
      const along = o.w >= o.d;
      const q2 = new THREE.Quaternion().setFromAxisAngle(Y, o.rotY + (along ? 0 : Math.PI / 2));
      Q.copy(q2);
      const L = Math.max(o.w, o.d), D = Math.min(o.w, o.d);
      P.set(o.cx, base + h + 0.6, o.cz); S.set(L - 0.25, Math.min(3.2, D * 0.32), D - 0.25);
    }
    roofs[sh].setMatrixAt(k, M4.compose(P, Q, S));
    roofs[sh].setColorAt(k, col.set(roofCol(l, sh)));
  });
  const g = new THREE.Group(); g.name = 'klc-blocks';
  for (const m of [bodies, roofs.gable, roofs.hip, roofs.flat]) {
    m.count = m === bodies ? list.length : fill[Object.keys(roofs).find((k) => roofs[k] === m)];
    m.castShadow = true; m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    g.add(m);
  }
  ctx.add(g);
  return { count: list.length };
}
