// [play:courses] The gates in the town.
// Draws: banded rings, start banners + flag arches, buoys (dock edges share
// that mesh), and one light beam that is shown only for the next gate.
// Instanced. The beam is hidden (count 0) until a run, so an idle frame does
// not pay for it. Nothing is allocated after the first frame.

import * as THREE from 'three';
import DATA from '../../../../data/play/courses.json';
import STR from '../../../../data/play-i18n.json';
import { RING, TAIRYO, MEDAL_HEX, gateOpacity, PASS_MS } from './logic.js';
import { lazyWorld } from '../kit/lazy.js';

const COURSES = DATA.courses;
const RED = new THREE.Color(TAIRYO[0]);
const WHITE = new THREE.Color(TAIRYO[1]);
const AI = new THREE.Color(TAIRYO[2]);
const GOLD = new THREE.Color(MEDAL_HEX.gold);
const NAVY = new THREE.Color(MEDAL_HEX.rim);

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _z = new THREE.Vector3(0, 0, 1);
const _n = new THREE.Vector3();
const _x = new THREE.Vector3(1, 0, 0);
const _y = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();

function face(nx, ny, nz, q) {
  const len = Math.hypot(nx, ny, nz) || 1;
  _n.set(nx / len, ny / len, nz / len);
  if (_n.z > 0.9999) q.identity();
  else if (_n.z < -0.9999) q.setFromAxisAngle(_x, Math.PI);
  else q.setFromUnitVectors(_z, _n);
  return q;
}

function concat(parts) {
  let count = 0;
  for (const part of parts) count += part.geom.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const rim = new Float32Array(count);
  const page = new Float32Array(count);
  const partA = new Float32Array(count);
  const band = new Float32Array(count);
  let o = 0;
  for (const part of parts) {
    const g = part.geom;
    const n = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array, o * 3);
    nrm.set(g.getAttribute('normal').array, o * 3);
    const u = g.getAttribute('uv');
    if (u) uv.set(u.array, o * 2);
    rim.fill(part.rim || 0, o, o + n);
    page.fill(part.page || 0, o, o + n);
    partA.fill(part.part || 0, o, o + n);
    if (part.band === 'y' && u) {
      for (let i = 0; i < n; i++) band[o + i] = u.getY(i);
    } else band.fill(part.band || 0, o, o + n);
    o += n;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geom.setAttribute('aRim', new THREE.BufferAttribute(rim, 1));
  geom.setAttribute('aPage', new THREE.BufferAttribute(page, 1));
  geom.setAttribute('aPart', new THREE.BufferAttribute(partA, 1));
  geom.setAttribute('aBand', new THREE.BufferAttribute(band, 1));
  return geom;
}

const BANDS = /* glsl */`
vec3 klcRed = vec3(${RED.r.toFixed(4)}, ${RED.g.toFixed(4)}, ${RED.b.toFixed(4)});
vec3 klcWhite = vec3(${WHITE.r.toFixed(4)}, ${WHITE.g.toFixed(4)}, ${WHITE.b.toFixed(4)});
vec3 klcAi = vec3(${AI.r.toFixed(4)}, ${AI.g.toFixed(4)}, ${AI.b.toFixed(4)});
vec3 klcGold = vec3(${GOLD.r.toFixed(4)}, ${GOLD.g.toFixed(4)}, ${GOLD.b.toFixed(4)});
vec3 klcNavy = vec3(${NAVY.r.toFixed(4)}, ${NAVY.g.toFixed(4)}, ${NAVY.b.toFixed(4)});
// 紅白: the festival red and white of a Japanese event (紅白幕). Red, white and blue thirds read as a national flag.
vec3 klcCloth(float b) {
  return fract(b) < 0.5 ? klcRed : klcWhite;
}
`;

function hook(mat, lightExtra, fragExtra, key, dropMap) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (prev) prev(shader);
    shader.uniforms.uGlow = uGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRim;\nattribute float aPage;\nattribute float aPart;\nattribute float aBand;\nattribute float aNext;\nattribute float aFade;\nattribute float aKind;\nvarying float vRim;\nvarying float vPage;\nvarying float vPart;\nvarying float vBand;\nvarying float vNext;\nvarying float vFade;\nvarying float vKind;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRim = aRim;\nvPage = aPage;\nvPart = aPart;\nvBand = aBand;\nvNext = aNext;\nvFade = aFade;\nvKind = aKind;\nvLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying float vRim;\nvarying float vPage;\nvarying float vPart;\nvarying float vBand;\nvarying float vNext;\nvarying float vFade;\nvarying float vKind;\nvarying vec3 vLocal;\n' + BANDS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + fragExtra)
      .replace('#include <opaque_fragment>', lightExtra + '\n#include <opaque_fragment>');
    if (dropMap) shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '// sampled above');
  };
  mat.customProgramCacheKey = () => key;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.side = THREE.DoubleSide;
  return mat;
}

const uGlow = { value: 1 };

const BEAM_LIGHT = /* glsl */`
if (vRim > 1.5) {
  outgoingLight = mix(vec3(1.0, 0.98, 0.9), klcGold, clamp(vLocal.y / 48.0, 0.0, 1.0)) * (0.55 + 0.45 * uGlow);
} else if (vRim > 0.75 && vRim < 1.5 && vNext > 0.5) {
  outgoingLight = klcGold * uGlow;
}
`;

function instanceAttrs(geom, count) {
  const next = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  const kind = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  fade.array.fill(1);
  geom.setAttribute('aNext', next);
  geom.setAttribute('aFade', fade);
  geom.setAttribute('aKind', kind);
  return { next, fade, kind };
}

function addMesh(ctx, geom, mat, count, name) {
  const mesh = new THREE.InstancedMesh(geom, mat, Math.max(1, count));
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.count = count;
  mesh.renderOrder = 3;
  const attrs = instanceAttrs(geom, Math.max(1, count));
  ctx.add(mesh);
  ctx.noOutline(mesh);
  return { mesh, ...attrs };
}

function bannerTexture(lang) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = TAIRYO[0];
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = TAIRYO[1];
  g.fillRect(8, 8, 240, 112);
  g.fillStyle = MEDAL_HEX.rim;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const word = (STR[lang] || STR.ja)['play.course.banner'];
  let size = 64;
  g.font = `700 ${size}px "Zen Maru Gothic", "Noto Sans JP", sans-serif`;
  while (g.measureText(word).width > 220 && size > 28) {
    size -= 2;
    g.font = `700 ${size}px "Zen Maru Gothic", "Noto Sans JP", sans-serif`;
  }
  g.fillText(word, 128, 66);
  // The right half is a 大漁旗, the flag Kesennuma's boats fly coming home: a 藍 field, white 青海波 along the foot and a
  // 山吹 カツオ. (Five horizontal red / white / blue bands read as the Thai flag.)
  g.fillStyle = TAIRYO[2];
  g.fillRect(256, 0, 256, 128);
  g.strokeStyle = TAIRYO[1];
  g.lineWidth = 2.5;
  for (let row = 0; row < 3; row++) {
    const y = 128 - row * 13;
    for (let x = 256 + (row % 2 ? 12 : 0); x < 512 + 24; x += 24) {
      for (const r of [12, 8, 4]) { g.beginPath(); g.arc(x, y, r, Math.PI, 2 * Math.PI); g.stroke(); }
    }
  }
  // the カツオ: a torpedo body, a crescent tail, a dorsal fin and an eye; 山吹 with a 紺 outline
  g.save();
  g.translate(384, 50);
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(-62, 0);
  g.bezierCurveTo(-40, -22, 28, -24, 52, -4);
  g.lineTo(70, -20); g.lineTo(64, 0); g.lineTo(70, 20); g.lineTo(52, 4);
  g.bezierCurveTo(28, 24, -40, 22, -62, 0);
  g.closePath();
  g.fillStyle = MEDAL_HEX.gold; g.fill();
  g.lineWidth = 4; g.strokeStyle = MEDAL_HEX.rim; g.stroke();
  g.beginPath(); g.moveTo(-8, -18); g.lineTo(6, -32); g.lineTo(16, -17); g.closePath();
  g.fillStyle = MEDAL_HEX.gold; g.fill(); g.stroke();
  g.fillStyle = TAIRYO[1];
  g.beginPath(); g.arc(-44, -3, 5, 0, 2 * Math.PI); g.fill();
  g.fillStyle = MEDAL_HEX.rim;
  g.beginPath(); g.arc(-44, -3, 2.4, 0, 2 * Math.PI); g.fill();
  g.restore();
  // a 茜 border round the whole flag, like the edge of a real 大漁旗
  g.strokeStyle = TAIRYO[0];
  g.lineWidth = 8;
  g.strokeRect(260, 4, 248, 120);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#FBFAF5';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = MEDAL_HEX.rim;
  g.lineWidth = 22;
  g.strokeRect(14, 14, 484, 228);
  const chevron = (x0) => {
    g.beginPath();
    g.moveTo(x0, 46);
    g.lineTo(x0 + 168, 128);
    g.lineTo(x0, 210);
    g.closePath();
    g.fillStyle = '#B7282E';
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = MEDAL_HEX.rim;
    g.stroke();
  };
  chevron(56);
  chevron(196);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function storeBase(mesh, index) {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(index, m);
  return m;
}

export function createWorld(ctx) {
  const base = ctx.mat.toon('#ffffff', { side: 'double', transparent: true, depthWrite: false, opacity: 1 });

  const rings = [];
  for (const course of COURSES) {
    course.gates.forEach((g, i) => { if (g.kind === 'ring') rings.push({ course, i, g }); });
  }

  const gates = [];
  for (const course of COURSES) {
    const st = course.start;
    const fx = course.mode === 'sail' ? Math.sin(st.yaw) : -Math.sin(st.yaw);
    const fz = course.mode === 'sail' ? Math.cos(st.yaw) : -Math.cos(st.yaw);
    // The old gate was 3.2× and 12 m ahead, so the countdown was a wall of cloth.
    // Fly: a wide banner below the eye, so 「3」 sits in the sky and the town shows under the cloth.
    const ahead = course.mode === 'fly' ? 32 : course.mode === 'sail' ? 26 : 16;
    const y = course.mode === 'sail' ? 8 : course.mode === 'fly' ? st.y - 11 : st.y + 2.4;
    gates.push({
      course, start: true, kind: 0,
      x: st.x + fx * ahead, y, z: st.z + fz * ahead,
      nx: -fx, ny: 0, nz: -fz,
    });
  }
  const flags = [];
  for (const course of COURSES) {
    course.gates.forEach((g, i) => {
      if (g.kind === 'flag') flags.push({ course, i, g, kind: 1, x: g.x, y: g.y, z: g.z, nx: g.nx, ny: 0, nz: g.nz });
    });
  }
  const gateItems = gates.concat(flags);

  const post = new THREE.CylinderGeometry(0.16, 0.18, 7.2, 7).toNonIndexed();
  post.translate(0, -2.2, 0);
  const postL = post.clone(); postL.translate(-7.2, 0, 0);
  const postR = post.clone(); postR.translate(7.2, 0, 0);
  const cloth = new THREE.PlaneGeometry(13.6, 2.6).toNonIndexed();
  cloth.translate(0, 0.85, 0);
  // A second cloth faces the other way. gl_FrontFacing did not un-mirror the
  // back, so each direction is a front face with the words the right way around.
  const clothBack = cloth.clone();
  clothBack.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
  clothBack.translate(0, 0, -0.04);
  const archR = 6.2;
  const arch = new THREE.TorusGeometry(archR, 0.5, 10, 28, Math.PI).toNonIndexed();
  const archRim = new THREE.TorusGeometry(archR + 0.18, 0.11, 8, 28, Math.PI).toNonIndexed();
  const archPost = new THREE.CylinderGeometry(0.18, 0.22, 2.6, 7).toNonIndexed();
  archPost.translate(0, -1.3, 0);
  const archPL = archPost.clone(); archPL.translate(-archR, 0, 0);
  const archPR = archPost.clone(); archPR.translate(archR, 0, 0);
  const gateGeom = concat([
    { geom: postL, rim: 0, part: 0 },
    { geom: postR, rim: 0, part: 0 },
    { geom: cloth, rim: 1, page: 0, part: 0 },
    { geom: clothBack, rim: 1, page: 0, part: 0 },
    { geom: archPL, rim: 0, part: 1 },
    { geom: archPR, rim: 0, part: 1 },
    { geom: arch, rim: 0.4, part: 1, band: 'y' },
    { geom: archRim, rim: 1, part: 1 },
  ]);
  post.dispose(); postL.dispose(); postR.dispose(); cloth.dispose(); clothBack.dispose();
  arch.dispose(); archRim.dispose(); archPost.dispose(); archPL.dispose(); archPR.dispose();

  let lang = 'ja';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'ja') lang = q;
  } catch (e) { /* tests */ }
  const gateMat = base.clone();
  gateMat.map = bannerTexture(lang);
  hook(gateMat, BEAM_LIGHT, /* glsl */`
if (abs(vPart - vKind) > 0.25) discard;
if (vPart > 0.5) {
  if (vRim > 0.75) {
    if (vNext < 0.5) discard;
    diffuseColor.rgb = klcGold;
  } else if (vRim > 0.2) {
    diffuseColor.rgb = klcCloth(vBand * 3.0);
  } else {
    diffuseColor.rgb = klcNavy;
  }
  diffuseColor.a = vFade;
} else if (vRim > 0.5) {
#ifdef USE_MAP
  vec2 uv = vMapUv;
  diffuseColor *= texture2D(map, uv);
#endif
  diffuseColor.a = vFade;
} else {
  diffuseColor.rgb = klcNavy;
  diffuseColor.a = vFade;
}
`, 'play-courses-gate4', true);
  gateMat.side = THREE.FrontSide;
  const gateMesh = addMesh(ctx, gateGeom, gateMat, gateItems.length, 'play-gates');
  gateItems.forEach((g, n) => {
    face(g.nx, g.ny, g.nz, _q);
    _p.set(g.x, g.y, g.z);
    const sc = !g.start ? 1 : g.course.mode === 'fly' ? 2 : g.course.mode === 'sail' ? 1.8 : 1.6;
    _s.set(sc, sc, sc);
    gateMesh.mesh.setMatrixAt(n, _m.compose(_p, _q, _s));
    _s.set(1, 1, 1);
    gateMesh.mesh.setColorAt(n, WHITE);
    gateMesh.kind.setX(n, g.kind);
    g.slot = n;
    g.base = storeBase(gateMesh.mesh, n);
  });
  gateMesh.mesh.instanceMatrix.needsUpdate = true;
  if (gateMesh.mesh.instanceColor) gateMesh.mesh.instanceColor.needsUpdate = true;

  const buoys = [];
  for (const course of COURSES) {
    course.gates.forEach((g, i) => {
      if (g.kind !== 'buoy') return;
      const side = g.side || 1;
      buoys.push({
        course, i, g, corner: false,
        x: g.x, y: 0, z: g.z,
        nx: g.nx, nz: g.nz, side,
      });
    });
  }
  const dock = COURSES.find((c) => c.mode === 'sail').gates.find((g) => g.kind === 'dock');
  const bowX = Math.sin(dock.yaw), bowZ = Math.cos(dock.yaw);
  const stX = -Math.cos(dock.yaw), stZ = Math.sin(dock.yaw);
  const corners = [];
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    corners.push({
      corner: true,
      x: dock.x + bowX * dock.halfL * a + stX * dock.halfW * b,
      y: 0.6,
      z: dock.z + bowZ * dock.halfL * a + stZ * dock.halfW * b,
    });
  }
  const buoyItems = buoys.concat(corners);
  const edgeSpec = [
    { along: 'bow', sign: 1, index: buoys.length },
    { along: 'bow', sign: -1, index: buoys.length + 1 },
    { along: 'stbd', sign: 1, index: buoys.length + 2 },
    { along: 'stbd', sign: -1, index: buoys.length + 3 },
  ];

  // [mobile-play] The rings, the buoys and the beam: built when a course is armed (or warmed quietly when the visitor comes
  // near a start line, so the countdown never waits for a program), shown while it runs, and on a phone freed after it.
  // The town keeps only the three start banners (the gate mesh's first slots). Deploy #5 built and drew every ring, flag
  // and buoy of all three courses from startup.
  const extra = lazyWorld(ctx, 'courses', (w, root) => { root.visible = false; return buildExtra(w); });   // (shown by arm())
  function buildExtra(w) {
    const torus = new THREE.TorusGeometry(RING.major, RING.tube, 12, 36).toNonIndexed();
    const rim = new THREE.TorusGeometry(RING.major + 0.22, 0.12, 8, 36).toNonIndexed();
    const ringGeom = concat([
      { geom: torus, rim: 0, band: 'y' },
      { geom: rim, rim: 1 },
    ]);
    torus.dispose(); rim.dispose();
    const ringMat = base.clone();
    hook(ringMat, BEAM_LIGHT, /* glsl */`
  if (vRim > 0.5) {
    if (vNext < 0.5) discard;
    diffuseColor.rgb = klcGold;
    diffuseColor.a = vFade;
  } else {
    diffuseColor.rgb = klcCloth(vBand * 3.0);
    diffuseColor.a = vFade;
  }
  `, 'play-courses-ring2');
    const ringMesh = addMesh(w, ringGeom, ringMat, rings.length, 'play-rings');
    rings.forEach((r, n) => {
      face(r.g.nx, r.g.ny, r.g.nz, _q);
      _p.set(r.g.x, r.g.y, r.g.z);
      ringMesh.mesh.setMatrixAt(n, _m.compose(_p, _q, _s));
      ringMesh.mesh.setColorAt(n, WHITE);
      r.slot = n;
      r.base = storeBase(ringMesh.mesh, n);
    });
    ringMesh.mesh.instanceMatrix.needsUpdate = true;
    if (ringMesh.mesh.instanceColor) ringMesh.mesh.instanceColor.needsUpdate = true;

    const body = new THREE.CylinderGeometry(0.72, 0.98, 2.5, 12).toNonIndexed();
    body.translate(0, 1.35, 0);
    const mast = new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6).toNonIndexed();
    mast.translate(0, 3.15, 0);
    const cap = new THREE.SphereGeometry(0.36, 8, 6).toNonIndexed();
    cap.scale(1, 0.7, 1);
    cap.translate(0, 2.55, 0);
    const collar = new THREE.TorusGeometry(0.92, 0.09, 6, 18).toNonIndexed();
    collar.rotateX(Math.PI / 2);
    collar.translate(0, 2.72, 0);
    const flag = new THREE.PlaneGeometry(3.6, 2.0).toNonIndexed();
    flag.translate(2.15, 3.55, 0);
    const edge = new THREE.BoxGeometry(1, 0.18, 0.18).toNonIndexed();
    const buoyGeom = concat([
      { geom: body, rim: 0, part: 0, band: 'y' },
      { geom: mast, rim: 0.28, part: 0 },
      { geom: cap, rim: 0.36, part: 0 },
      { geom: collar, rim: 1, part: 0 },
      { geom: flag, rim: 0.55, part: 0 },
      { geom: edge, rim: 0, part: 1 },
    ]);
    body.dispose(); mast.dispose(); cap.dispose(); collar.dispose(); flag.dispose(); edge.dispose();
    const buoyMat = base.clone();
    buoyMat.map = flagTexture();
    hook(buoyMat, BEAM_LIGHT, /* glsl */`
  if (abs(vPart - vKind) > 0.25) discard;
  if (vKind > 0.5) {
    diffuseColor.rgb = klcGold;
    diffuseColor.a = 1.0;
  } else if (vRim > 0.75) {
    if (vNext < 0.5) discard;
    diffuseColor.rgb = klcGold;
    diffuseColor.a = vFade;
  } else if (vRim > 0.45) {
  #ifdef USE_MAP
    diffuseColor *= texture2D(map, vMapUv);
  #endif
    diffuseColor.a = vFade;
  } else if (vRim > 0.32) {
    diffuseColor.rgb = klcWhite;
    diffuseColor.a = vFade;
  } else if (vRim > 0.2) {
    diffuseColor.rgb = klcNavy;
    diffuseColor.a = vFade;
  } else {
    float f = fract(vBand * 4.0);
    diffuseColor.rgb = f < 0.5 ? klcRed : klcWhite;
    diffuseColor.a = vFade;
  }
  `, 'play-courses-buoy2', true);
    const buoyMesh = addMesh(w, buoyGeom, buoyMat, buoyItems.length, 'play-buoys');
    buoyItems.forEach((b, n) => {
      if (b.corner) {
        _q.identity();
        _p.set(b.x, b.y, b.z);
        _s.set(1, 1, 1);
      } else {
        const fx = b.nz * b.side;
        const fz = -b.nx * b.side;
        _x.set(fx, 0, fz);
        if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
        _x.normalize();
        _z.set(-b.nx, 0, -b.nz);
        if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
        _z.normalize();
        _y.set(0, 1, 0);
        _m.makeBasis(_x, _y, _z);
        _q.setFromRotationMatrix(_m);
        _p.set(b.x, b.y, b.z);
        _s.set(1, 1, 1);
      }
      buoyMesh.mesh.setMatrixAt(n, _m.compose(_p, _q, _s));
      _s.set(1, 1, 1);
      buoyMesh.mesh.setColorAt(n, WHITE);
      buoyMesh.kind.setX(n, b.corner ? 1 : 0);
      b.slot = n;
      b.base = storeBase(buoyMesh.mesh, n);
    });
    buoyMesh.mesh.instanceMatrix.needsUpdate = true;
    if (buoyMesh.mesh.instanceColor) buoyMesh.mesh.instanceColor.needsUpdate = true;

    edgeSpec.forEach((e) => {
      if (e.along === 'bow') {
        _p.set(dock.x + stX * dock.halfW * e.sign, 0.6, dock.z + stZ * dock.halfW * e.sign);
        _s.set(dock.halfL * 2, 1, 1);
        _q.setFromAxisAngle(_y, Math.atan2(bowX, bowZ));
      } else {
        _p.set(dock.x + bowX * dock.halfL * e.sign, 0.6, dock.z + bowZ * dock.halfL * e.sign);
        _s.set(dock.halfW * 2, 1, 1);
        _q.setFromAxisAngle(_y, Math.atan2(stX, stZ));
      }
      buoyMesh.mesh.setMatrixAt(e.index, _m.compose(_p, _q, _s));
      _s.set(1, 1, 1);
      corners[e.index - buoys.length].base = storeBase(buoyMesh.mesh, e.index);
    });
    buoyMesh.mesh.instanceMatrix.needsUpdate = true;

    const beamGeom = new THREE.PlaneGeometry(8, 64).toNonIndexed();
    beamGeom.translate(0, 32, 0);
    const beamJoined = concat([{ geom: beamGeom, rim: 2 }]);
    beamGeom.dispose();
    const beamMat = new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, depthWrite: false, opacity: 1,
      blending: THREE.NormalBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
    });
    beamMat.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = uGlow;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying vec3 vLocal;')
        .replace('#include <opaque_fragment>', /* glsl */`
  {
    float edge = smoothstep(4.0, 0.15, abs(vLocal.x));
    float up = clamp(vLocal.y / 64.0, 0.0, 1.0);
    float foot = smoothstep(0.0, 0.1, up);
    float a = edge * edge * foot * mix(0.7, 0.0, up) * (0.75 + 0.25 * uGlow);
    if (a < 0.02) discard;
    outgoingLight = mix(vec3(${GOLD.r.toFixed(4)}, ${GOLD.g.toFixed(4)}, ${GOLD.b.toFixed(4)}), vec3(1.0, 0.97, 0.86), up);
    gl_FragColor = vec4(outgoingLight, a);
  }
  `);
    };
    beamMat.customProgramCacheKey = () => 'play-courses-beam';
    const beam = new THREE.InstancedMesh(beamJoined, beamMat, 1);
    beam.name = 'play-beam';
    beam.frustumCulled = false;
    beam.count = 0;
    beam.visible = false;
    beam.renderOrder = 2;
    w.add(beam);
    ctx.noOutline(beam);
    return { ringMesh, buoyMesh, beam };
  }

  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeCourse = null;
  let activeIndex = -1;
  const pulse = { mesh: null, index: -1, base: null };
  const burst = { mesh: null, fade: null, index: -1, base: null, t0: -1, rest: 0.25 };

  function writeFade(group, items, mesh) {
    let nextN = -1;
    for (let n = 0; n < items.length; n++) {
      const it = items[n];
      if (it.corner || it.start) {
        mesh.fade.setX(it.slot, 1);
        mesh.next.setX(it.slot, 0);
        continue;
      }
      const on = !!(activeCourse && it.course.id === activeCourse);
      const fade = !activeCourse ? 1 : (on ? gateOpacity(it.i, activeIndex) : 0.25);
      const next = on && it.i === activeIndex ? 1 : 0;
      mesh.fade.setX(it.slot, fade);
      mesh.next.setX(it.slot, next);
      if (!(burst.t0 >= 0 && burst.mesh === mesh.mesh && burst.index === it.slot)) {
        mesh.mesh.setMatrixAt(it.slot, it.base);
      }
      if (next) nextN = n;
    }
    mesh.fade.needsUpdate = true;
    mesh.next.needsUpdate = true;
    mesh.mesh.instanceMatrix.needsUpdate = true;
    return nextN;
  }

  let beamX = 0, beamY = 0, beamZ = 0, beamSc = 1;
  /** The rings, buoys and beam (null until a course is armed or a start line is near). */
  const X = () => extra.parts;
  function aimBeam() {
    const beam = X()?.beam;
    if (!beam) return;
    const cam = ctx.camera;
    const dx = cam ? cam.position.x - beamX : 0;
    const dz = cam ? cam.position.z - beamZ : 1;
    _q.setFromAxisAngle(_y, Math.atan2(dx, dz));
    _p.set(beamX, beamY, beamZ);
    _s.set(1, beamSc, 1);
    beam.setMatrixAt(0, _m.compose(_p, _q, _s));
    _s.set(1, 1, 1);
    beam.instanceMatrix.needsUpdate = true;
  }
  function placeBeam(item, height) {
    const beam = X()?.beam;
    if (!beam) return;
    if (!item) { beam.visible = false; beam.count = 0; return; }
    beamSc = height / 64;
    beamX = item.x != null ? item.x : item.g.x;
    beamY = (item.y != null ? item.y : item.g.y) + (beamSc < 0.5 ? 2.8 : 0);
    beamZ = item.z != null ? item.z : item.g.z;
    aimBeam();
    beam.count = 1;
    beam.visible = true;
  }

  function paintAll() {
    const P = X();
    const nr = P ? writeFade(rings, rings, P.ringMesh) : -1;
    const nf = writeFade(flags, flags, gateMesh);
    if (P) writeFade(buoys, buoys, P.buoyMesh);
    for (let n = 0; n < gates.length; n++) {
      gateMesh.fade.setX(gates[n].slot, 1);
      gateMesh.next.setX(gates[n].slot, 0);
    }
    gateMesh.fade.needsUpdate = true;
    gateMesh.next.needsUpdate = true;
    // [mobile-play] idle, the town shows the three start banners (the first slots); an armed course shows every flag too
    gateMesh.mesh.count = activeCourse ? gateItems.length : gates.length;
    pulse.mesh = null; pulse.index = -1; pulse.base = null;
    let beamItem = null;
    let beamH = 64;
    if (nr >= 0) {
      pulse.mesh = P.ringMesh.mesh; pulse.index = rings[nr].slot; pulse.base = rings[nr].base;
      beamItem = rings[nr];
    } else if (nf >= 0) {
      pulse.mesh = gateMesh.mesh; pulse.index = flags[nf].slot; pulse.base = flags[nf].base;
      beamItem = flags[nf];
      beamH = 36;
    } else if (activeCourse && P) {
      const b = buoys.find((it) => it.course.id === activeCourse && it.i === activeIndex);
      if (b) {
        pulse.mesh = P.buoyMesh.mesh; pulse.index = b.slot; pulse.base = b.base;
        beamItem = b;
        beamH = 28;
      }
    }
    placeBeam(beamItem, beamH);
  }

  function findVisual(courseId, gateIndex) {
    const P = X();
    if (P) for (let n = 0; n < rings.length; n++) if (rings[n].course.id === courseId && rings[n].i === gateIndex) return { mesh: P.ringMesh.mesh, fade: P.ringMesh.fade, item: rings[n] };
    for (let n = 0; n < flags.length; n++) if (flags[n].course.id === courseId && flags[n].i === gateIndex) return { mesh: gateMesh.mesh, fade: gateMesh.fade, item: flags[n] };
    if (P) for (let n = 0; n < buoys.length; n++) if (buoys[n].course.id === courseId && buoys[n].i === gateIndex) return { mesh: P.buoyMesh.mesh, fade: P.buoyMesh.fade, item: buoys[n] };
    return null;
  }

  /** The rings and buoys of every course: built (and drawn) while one is armed, else hidden; freed on a phone once the
   *  visitor is away from every start line (near(): run.js reports the nearest start each idle step). */
  function arm() {
    if (!extra.built) extra.ensure();
    if (extra.root) extra.root.visible = true;
  }
  const WARM_R = 90, FREE_R = 200;

  const tick = (t) => {
    uGlow.value = reduce ? 1 : 0.72 + 0.28 * Math.sin(t * 2.15);
    if (X()?.beam?.visible) aimBeam();
    if (pulse.mesh && pulse.index >= 0 && !(burst.t0 >= 0 && burst.mesh === pulse.mesh && burst.index === pulse.index)) {
      const s = reduce ? 1 : 1 + Math.sin(t * 2.15) * 0.045;
      _s.set(s, s, s);
      pulse.mesh.setMatrixAt(pulse.index, _m.copy(pulse.base).scale(_s));
      _s.set(1, 1, 1);
      pulse.mesh.instanceMatrix.needsUpdate = true;
    }
    if (!(burst.t0 >= 0)) return;
    const k = Math.min(1, (t - burst.t0) / PASS_MS);
    const sc = reduce ? 1 : 1 + 0.3 * k;
    _s.set(sc, sc, sc);
    burst.mesh.setMatrixAt(burst.index, _m.copy(burst.base).scale(_s));
    _s.set(1, 1, 1);
    burst.fade.setX(burst.index, 1 + (burst.rest - 1) * k);
    burst.mesh.instanceMatrix.needsUpdate = true;
    burst.fade.needsUpdate = true;
    if (k >= 1) {
      burst.t0 = -1;
      burst.fade.setX(burst.index, burst.rest);
      burst.mesh.setMatrixAt(burst.index, burst.base);
      burst.fade.needsUpdate = true;
      burst.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  paintAll();

  return {
    courses: COURSES,
    starts: gates.filter((g) => g.start).map((g) => ({ id: g.course.id, mode: g.course.mode, x: g.x, y: g.y, z: g.z })),
    setRun(courseId, gateIndex) {
      arm();
      activeCourse = courseId;
      activeIndex = gateIndex;
      paintAll();
    },
    clearRun() {
      activeCourse = null;
      activeIndex = -1;
      burst.t0 = -1;
      paintAll();
      if (extra.root && !extra.warming) extra.root.visible = false;   // (kept built: a retry starts at once; near() frees it)
    },
    /** [mobile-play] the hub's title card: build and warm the rings and buoys before start() */
    prepare: () => extra.prepare(),
    /** [mobile-play] the nearest start line is d metres away (an idle step): warm the course quietly when near, free it far away */
    near(d) {
      if (activeCourse) return;
      if (d < WARM_R) { if (!extra.built) extra.prepare({ warm: false }).then(() => { if (!activeCourse && extra.root) extra.root.visible = false; }); }
      else if (d > FREE_R && extra.built && !extra.warming) extra.leave();
    },
    extra,
    pass(courseId, gateIndex, t) {
      const hit = findVisual(courseId, gateIndex);
      if (!hit) return;
      burst.mesh = hit.mesh;
      burst.fade = hit.fade;
      burst.index = hit.item.slot;
      burst.base = hit.item.base;
      burst.t0 = t;
      burst.rest = 0.25;
      hit.fade.setX(hit.item.slot, 1);
    },
    tick,
  };
}
