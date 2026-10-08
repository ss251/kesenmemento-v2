// [play:underwater] Life: schools of イワシ (instanced boids), passing アイナメ and メバル, and ミズクラゲ.
// The school nearest the fish is the one that steps; each fish banks into its turns and flashes silver as it does.
// Four draws (school, アイナメ, メバル, ミズクラゲ). No allocation per frame.

import * as THREE from 'three';
import { fishGeometry, fishMaterial, LOOKS } from './fish.js';
import { stepSchool, stepPasser, turnFlash } from './logic.js';
import { swimU } from './fog.js';

// The jelly is a basic material (no lighting), so it carries a small copy of the water's colour itself.
const SWIM_JELLY_DECL = /* glsl */`
uniform vec3 uSwimNearJ, uSwimMidJ;
uniform float uSwimLightJ;
vec3 sw_jellyFog(float camY) { return mix(uSwimNearJ, uSwimMidJ, smoothstep(0.0, 7.0, -camY)) * uSwimLightJ; }
`;

const HOMES = [
  { x: 366, y: -2.1, z: 4, r: 6 },
  { x: 185.5, y: -2.3, z: 14.5, r: 5 },
  { x: 1626, y: -4.4, z: 3650, r: 8 },
  { x: 1700, y: -4.2, z: 7520, r: 8 },
];

function makeSchool(n, home, seed) {
  const a = {
    n,
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
    vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
    yaw: new Float32Array(n), roll: new Float32Array(n), flash: new Float32Array(n),
  };
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const head = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const ang = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * home.r * 0.45;
    a.x[i] = home.x + Math.cos(ang) * rad;
    a.z[i] = home.z + Math.sin(ang) * rad;
    a.y[i] = home.y + (rnd() - 0.5) * 0.9;
    // the school starts already swimming one way, as a school does
    a.vx[i] = -Math.sin(head) * 1.2 + (rnd() - 0.5) * 0.3;
    a.vz[i] = -Math.cos(head) * 1.2 + (rnd() - 0.5) * 0.3;
    a.yaw[i] = Math.atan2(-a.vx[i], -a.vz[i]);
  }
  return { a, home };
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function fishMesh(ctx, species, n, look, key) {
  const beat = { value: 0 };
  const amp = { value: 0.3 };
  const mat = fishMaterial(ctx, { beat, amp, look, cacheKey: key });
  const mesh = new THREE.InstancedMesh(fishGeometry(species), mat, n);
  mesh.name = key;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.count = n;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.visible = false;
  ctx.noBatch(mesh);
  ctx.noOutline(mesh);
  ctx.add(mesh);
  return { mesh, beat, amp };
}

export function createLife(ctx) {
  const phone = !!ctx.quality?.phone;
  const per = phone ? 34 : 60;
  const schools = HOMES.map((h, i) => makeSchool(per, h, 1000 + i * 97));
  const total = per * schools.length;
  // イワシ, about 15 cm (the body is 1.3 units long)
  const school = fishMesh(ctx, 'iwashi', total, LOOKS.iwashi, 'swim-school');
  school.amp.value = phone ? 0.22 : 0.3;
  school.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3).fill(1), 3);
  school.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const SC = 0.115;

  const write = (sc, base) => {
    const a = sc.a;
    const col = school.mesh.instanceColor;
    for (let i = 0; i < a.n; i++) {
      const pitch = Math.atan2(a.vy[i], Math.hypot(a.vx[i], a.vz[i]) + 1e-4) * 0.8;
      _e.set(pitch, a.yaw[i], a.roll[i]);
      _q.setFromEuler(_e);
      _p.set(a.x[i], a.y[i], a.z[i]);
      _s.set(SC, SC, SC);
      school.mesh.setMatrixAt(base + i, _m.compose(_p, _q, _s));
      const f = 1 + a.flash[i] * 1.1;
      _c.setRGB(f, f, f);
      col.setXYZ(base + i, _c.r, _c.g, _c.b);
    }
  };
  let base = 0;
  for (const sc of schools) { write(sc, base); base += per; }
  school.mesh.instanceMatrix.needsUpdate = true;
  school.mesh.instanceColor.needsUpdate = true;

  // passers: two アイナメ (about 40 cm) and two メバル (about 26 cm) on their own loops
  const passers = {
    ainame: [
      { t: 0.4, w: 0.16, cx: 1620, cy: -4.4, cz: 3660, r: 14, x: 0, y: 0, z: 0, yaw: 0 },
      { t: 1.2, w: 0.13, cx: 352, cy: -3.2, cz: 6, r: 11, x: 0, y: 0, z: 0, yaw: 0 },
    ],
    mebaru: [
      { t: 2.1, w: 0.11, cx: 1606, cy: -6.4, cz: 3640, r: 8, x: 0, y: 0, z: 0, yaw: 0 },
      { t: 0.7, w: 0.12, cx: 392, cy: -3.4, cz: 26, r: 7, x: 0, y: 0, z: 0, yaw: 0 },
    ],
  };
  const ainame = fishMesh(ctx, 'ainame', 2, LOOKS.ainame, 'swim-ainame');
  const mebaru = fishMesh(ctx, 'mebaru', 2, LOOKS.mebaru, 'swim-mebaru');
  const writePassers = (list, m, sc) => {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      _e.set(0, p.yaw, 0);
      _q.setFromEuler(_e);
      _p.set(p.x, p.y, p.z);
      _s.set(sc, sc, sc);
      m.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    m.mesh.instanceMatrix.needsUpdate = true;
  };
  for (const k of ['ainame', 'mebaru']) for (const p of passers[k]) stepPasser(p, 0);
  writePassers(passers.ainame, ainame, 0.3);
  writePassers(passers.mebaru, mebaru, 0.2);

  const jellies = createJellies(ctx, phone ? 5 : 9);
  const beat = { value: 0 };
  let active = 0;
  return {
    mesh: school.mesh, jellies, beat, amp: school.amp, ainame: ainame.mesh, mebaru: mebaru.mesh,
    meshes: [school.mesh, ainame.mesh, mebaru.mesh],
    step(dt, player, moving) {
      beat.value += dt * (moving ? 7 : 2.2);
      school.beat.value += dt * 9;
      ainame.beat.value += dt * 5.5;
      mebaru.beat.value += dt * 6.5;
      if (!(dt > 0) || !player) return;
      let best = 0, bestD = Infinity;
      for (let i = 0; i < schools.length; i++) {
        const h = schools[i].home;
        const d = (h.x - player.x) ** 2 + (h.z - player.z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      active = best;
      const sc = schools[best];
      if (bestD < 140 * 140) {
        stepSchool(sc.a, dt, sc.home, player);
        turnFlash(sc.a, dt);
      }
      write(sc, best * per);
      school.mesh.instanceMatrix.needsUpdate = true;
      school.mesh.instanceColor.needsUpdate = true;
      for (const k of ['ainame', 'mebaru']) for (const p of passers[k]) stepPasser(p, dt);
      writePassers(passers.ainame, ainame, 0.3);
      writePassers(passers.mebaru, mebaru, 0.2);
    },
    setVisible(on) {
      school.mesh.visible = on; ainame.mesh.visible = on; mebaru.mesh.visible = on;
      jellies.mesh.visible = on;
    },
    get active() { return active; },
  };
}

// ミズクラゲ: a clear bell with a scalloped rim, the four pale gonad rings on top, and a fringe of short tentacles.
// It pulses and drifts on the shader; translucent, its rim a little brighter (never a glow ball).
function jellyGeometry() {
  const P = [], U = [], I = [];
  const seg = 16, rings = 6;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const a = t * Math.PI * 0.5;
    for (let j = 0; j <= seg; j++) {
      const b = (j / seg) * Math.PI * 2;
      const scal = 1 + (r === rings ? 0.06 * Math.cos(b * 8) : 0);
      const rad = Math.sin(a) * 0.42 * scal;
      P.push(Math.cos(b) * rad, Math.cos(a) * 0.24 - 0.02 * t, Math.sin(b) * rad);
      U.push(j / seg, t);
    }
  }
  for (let r = 0; r < rings; r++) for (let j = 0; j < seg; j++) {
    const a = r * (seg + 1) + j, b = a + seg + 1;
    I.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // the fringe: a short skirt under the rim, drawn as streaks
  const f0 = P.length / 3;
  for (const y of [-0.02, -0.2]) for (let j = 0; j <= seg; j++) {
    const b = (j / seg) * Math.PI * 2;
    const rr = y < -0.1 ? 0.36 : 0.43;
    P.push(Math.cos(b) * rr, y, Math.sin(b) * rr);
    U.push(j / seg, y < -0.1 ? 2 : 1.5);
  }
  for (let j = 0; j < seg; j++) { const a = f0 + j, b = a + seg + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

function createJellies(ctx, n) {
  const geo = jellyGeometry();
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#dff1f2'),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  mat.name = 'swim-jelly';
  const time = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uSwimNearJ = swimU.uSwimNear;
    shader.uniforms.uSwimMidJ = swimU.uSwimMid;
    shader.uniforms.uSwimLightJ = swimU.uSwimLight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vJUv;\nvarying vec3 vJW;\nvarying vec3 vJN;\nvarying float vJId;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float id = float(gl_InstanceID);
        vJId = id;
        vJUv = uv;
        float pulse = sin(uTime * 1.25 + id * 1.7);
        float open = smoothstep(-0.3, 0.9, pulse);
        float rim = smoothstep(0.4, 1.0, uv.y);
        transformed.xz *= mix(0.86, 1.12, open) * (1.0 + rim * 0.08 * open);
        transformed.y *= mix(1.12, 0.8, open);
        if (uv.y > 1.2) transformed.xz *= 0.92 + 0.08 * sin(uTime * 2.0 + uv.x * 40.0 + id);
        float drift = uTime * 0.12 + id;
        transformed.x += sin(drift) * 0.7;
        transformed.z += cos(drift * 0.8) * 0.7;
        transformed.y += sin(drift * 0.55) * 0.35;`)
      .replace('#include <project_vertex>', `
        vec4 jw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          jw = instanceMatrix * jw;
        #endif
        jw = modelMatrix * jw;
        vJW = jw.xyz;
        vJN = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * jw;
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vJUv;\nvarying vec3 vJW;\nvarying vec3 vJN;\nvarying float vJId;\n' + SWIM_JELLY_DECL)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        vec3 jv = normalize(cameraPosition - vJW);
        float edge = 1.0 - abs(dot(normalize(vJN), jv));
        float a;
        vec3 col = diffuseColor.rgb;
        if (vJUv.y > 1.2) {
          // the fringe: thin streaks
          float st = smoothstep(0.6, 0.95, sin(vJUv.x * 160.0));
          a = st * 0.38;
        } else {
          a = 0.16 + 0.32 * smoothstep(0.3, 0.95, edge);
          // four gonad rings round the top (pale 藤色 #BBA1CB toward white)
          vec2 q = vec2(cos(vJUv.x * 6.2832), sin(vJUv.x * 6.2832)) * vJUv.y;
          float ring = 0.0;
          for (int k = 0; k < 4; k++) {
            float ang = float(k) * 1.5708 + 0.785;
            vec2 c = vec2(cos(ang), sin(ang)) * 0.24;
            float d = abs(length(q - c) - 0.095);
            ring = max(ring, 1.0 - smoothstep(0.012, 0.03, d));
          }
          col = mix(col, vec3(0.78, 0.66, 0.84), ring * 0.85);
          a = max(a, ring * 0.7);
        }
        // the water still sits between us and it
        float jd = length(cameraPosition - vJW);
        float jk = 1.0 - exp(-pow(jd * 0.075, 1.55));
        vec3 jFog = sw_jellyFog(cameraPosition.y);
        gl_FragColor = vec4(mix(col * uSwimLightJ, jFog, jk), a * (1.0 - jk * 0.85));`);
  };
  mat.customProgramCacheKey = () => 'swim-jelly-3';
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'swim-jelly';
  mesh.frustumCulled = false;
  mesh.count = n;
  mesh.renderOrder = 3;
  const spots = [
    [396, -2.6, 36], [352, -2.2, -6], [220, -3, 40], [500, -2.4, 120],
    [1590, -4.5, 3624], [1650, -3.6, 3672], [1540, -3.2, 3920],
    [1680, -3.5, 7480], [300, -1.9, 4], [640, -4, 200], [1720, -5, 4000],
  ];
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const p = spots[i % spots.length];
    const s = 0.8 + (i % 3) * 0.2;
    m.makeScale(s, s, s).setPosition(p[0], p[1], p[2]);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = false;
  ctx.noBatch(mesh);
  ctx.noOutline(mesh);
  ctx.add(mesh);
  return {
    mesh, time,
    step(dt) { time.value += dt; },
  };
}
