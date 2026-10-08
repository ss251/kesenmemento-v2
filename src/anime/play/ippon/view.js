// [play:ippon] The angler's view. Port rail, the pole, the line, the arc onto the deck.
// Draws: gulls 3, particles 1, fish 1, crew 1. Kit sparks are the shared play draw.
// One matrix, one quaternion, no per-frame allocation.

import * as THREE from 'three';
import { buildGulls } from '../../world/harbor/gulls.js';
import { fx } from '../kit/fx.js';
import { buildKatsuoGeo } from './fish-geo.js';
import { buildCrewGeo, HAND, TIP, LIFT_RAD } from './crew-geo.js';
import { catchPathInto, createFlight, flyStep, poleDeg, hoseVelocity, hoseAt, streakWorld } from './logic.js';
import { lazyWorld } from '../kit/lazy.js';

const NP = 96;
const NF = 61;
const CREW = 8;
const DECK = 60;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _w = new THREE.Vector3();
const _look = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _nose = new THREE.Vector3(1, 0, 0);
const _yawQ = new THREE.Quaternion();
const _rollQ = new THREE.Quaternion();
const _mouth = new THREE.Vector3(2.15, -1.2, 0);
const _path = { u: 0, x: 0, y: 0, z: 0, onDeck: false };
const _path2 = { u: 0, x: 0, y: 0, z: 0, onDeck: false };
const _park = { x: 0, y: 0, z: 0 };
const _land = { x: 0, y: 0, z: 0 };
// Under the bloom soft-knee (1.05 − 0.5). White here becomes a ball.
const _foam = new THREE.Color(0.40, 0.48, 0.50);
const _mist = new THREE.Color(0.46, 0.44, 0.36);
const _sun = new THREE.Color(0.48, 0.46, 0.38);
const _silver = new THREE.Color(0.42, 0.46, 0.50);
const _sardine = new THREE.Color(0.36, 0.40, 0.44);
const _basis = new THREE.Matrix4();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();
const HEIGHTS = [0.96, 1, 1.04, 0.98];
const uLure = { value: new THREE.Vector3(2.1, -1.2, 0) };

function chain(mat, tag, edit) {
  // [mobile-play] once per material: the view is built again for each trip on a phone, and ctx.mat.toon hands back the same
  // cached material, so a second chain would declare the attributes twice (a program that does not compile)
  const done = mat.userData.ipponChain || (mat.userData.ipponChain = []);
  if (done.includes(tag)) return;
  done.push(tag);
  const base = mat.onBeforeCompile;
  const ck = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (sh, r) => {
    base(sh, r);
    edit(sh);
  };
  mat.customProgramCacheKey = () => ck() + tag;
  mat.defines = { ...(mat.defines || {}), USE_CUSTOM: '' };
}

function fishMat(ctx) {
  const mat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.02, name: 'ippon-fish' });
  chain(mat, '|ippon-fish', (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLand;\nvarying float vLand;\nvarying vec3 vLp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLand = aLand;\n  vLp = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLand;\nvarying vec3 vLp;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  float along = clamp((vLp.x + 0.28) / 0.56, 0.0, 1.0);
  float band = abs(fract(along * 7.0) - 0.5);
  float upper = smoothstep(-0.012, 0.028, vLp.y);
  float flank = smoothstep(0.002, 0.014, abs(vLp.z));
  float bars = (1.0 - vLand) * upper * flank * (1.0 - smoothstep(0.045, 0.16, band));
  float stripe = abs(fract(vLp.z * 42.0 + vLp.x * 1.5) - 0.5);
  float lower = smoothstep(0.008, -0.02, vLp.y);
  float belly = vLand * lower * (1.0 - smoothstep(0.018, 0.07, stripe));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.45, 0.55, 0.72), bars);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.14, 0.24), belly);`);
  });
  return mat;
}

function crewMat(ctx, base) {
  const mat = base || ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.015, name: 'ippon-crew' });
  mat.name = 'ippon-crew';
  mat.skinning = false;
  const lift = LIFT_RAD.toFixed(4);
  const hx = HAND.x.toFixed(3);
  const hy = HAND.y.toFixed(3);
  const hz = HAND.z.toFixed(3);
  const tx = TIP.x.toFixed(3);
  const ty = TIP.y.toFixed(3);
  const tz = TIP.z.toFixed(3);
  chain(mat, '|ippon-crew', (sh) => {
    sh.uniforms.uLure = uLure;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec3 uLure;
attribute float aPart;
attribute float aLift;
attribute float aHide;
attribute float aLineOn;
attribute float aAlong;
attribute float aSide;
attribute float aVar;
attribute float aPick;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  if (abs(aVar - aPick) > 0.5) {
    transformed = vec3(0.0);
  } else if (aHide > 0.5 && aPart < 1.5) {
    transformed = vec3(0.0);
  } else if (aPart > 0.5) {
    vec3 hand = vec3(${hx}, ${hy}, ${hz});
    float ang = aLift * ${lift};
    float c = cos(ang);
    float s = sin(ang);
    vec3 tip = vec3(${tx}, ${ty}, ${tz}) - hand;
    tip = vec3(tip.x * c - tip.y * s, tip.x * s + tip.y * c, tip.z) + hand;
    if (aPart > 2.5) {
      if (aLineOn < 0.5) transformed = vec3(0.0);
      else {
        vec3 p = mix(tip, uLure, clamp(aAlong, 0.0, 1.0));
        transformed = p + vec3(0.0, aSide, 0.0);
      }
    } else {
      vec3 d = transformed - hand;
      d = vec3(d.x * c - d.y * s, d.x * s + d.y * c, d.z);
      transformed = hand + d;
    }
  }`);
  });
  return mat;
}

function toWorld(lx, ly, lz, ship, out) {
  const sy = Math.sin(ship.yaw);
  const cy = Math.cos(ship.yaw);
  out.set(ship.x + cy * lx + sy * lz, ly + (ship.y || 0), ship.z - sy * lx + cy * lz);
  return out;
}

function hash(i, t) {
  const x = Math.sin(i * 12.9898 + t * 0.17) * 43758.5453;
  return x - Math.floor(x);
}

export function createView(ctx, stations, { phone = false, reduced = false } = {}) {
  const centers = [[0, 8, 0], [40, 10, 0], [0, 9, 40]];
  // the birds over the schools: built with the trip (they circle 0.9-1.45 km outside the bay mouth, where the town only ever
  // saw them as specks under a pixel); placeBirds moves the centers they follow either way
  let gulls = null;

  const pool = [];
  for (let i = 0; i < NP; i++) {
    pool.push({ on: 0, hold: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, sc: 0.3, kind: 0, px: 5, thin: 2 });
  }

  // [mobile-play] The trip's own meshes (the spray, the mist, the deck fish, the crew and the angler) are built when a trip
  // starts (behind the hub's title card: prepare()) and on a phone freed when it ends. Deploy #5 built them at startup and
  // drew them every frame at zero scale: three custom programs and their shadow passes in every phone's start view. The
  // birds over the schools and the 一本釣り体験 flag over the moored boat are part of the town and stay.
  let parts = null, mist = null, fish = null, aLand = null, crew = null, crewGeo = null;
  let liftA = null, hideA = null, lineA = null, pickA = null;
  const trip = lazyWorld(ctx, 'ippon', (w) => {
    const t = {};
    t.gulls = buildGulls(w, {
      flocks: centers.map((c) => ({ center: c, radius: phone ? 18 : 28, count: phone ? 10 : 16, height: 10 })),
      seed: 'ippon-birds',
    });
    if (t.gulls.birds) {
      for (const b of t.gulls.birds) {
        if (b.kind === 'fly') { b._ippon = 1; b._h0 = b.h; if (reduced) b.v = 0; }
      }
    }
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, vertexColors: false,
    });
    pMat.defines = { USE_UV: '' };
    pMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
         float axis = abs(vUv.y - 0.5) * 2.0;
         float capA = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
         diffuseColor.a *= (1.0 - smoothstep(0.15, 0.92, axis)) * capA;
         diffuseColor.rgb = min(diffuseColor.rgb, vec3(0.50));`,
      );
    };
    pMat.customProgramCacheKey = () => 'ippon-streak';
    t.parts = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), pMat, NP);
    t.parts.frustumCulled = false;
    t.parts.name = 'ippon:spray';
    t.parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    w.add(t.parts);
    try { ctx.noOutline(t.parts); } catch { /* headless */ }

    let mistMap = null;
    try {
      mistMap = ctx.tex?.draw ? ctx.tex.draw(128, 128, (g) => {
        g.clearRect(0, 0, 128, 128);
        const rad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
        rad.addColorStop(0, 'rgba(255,255,255,0.85)');
        rad.addColorStop(0.45, 'rgba(255,255,255,0.28)');
        rad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rad;
        g.fillRect(0, 0, 128, 128);
      }, { key: 'ippon-mist-soft' }) : null;
    } catch { mistMap = null; }
    const mistMat = new THREE.MeshBasicMaterial({
      map: mistMap || null, color: new THREE.Color(0.50, 0.50, 0.46), transparent: true, opacity: mistMap ? 0.12 : 0,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: true,
    });
    t.mist = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), mistMat);
    t.mist.name = 'ippon:mist';
    t.mist.frustumCulled = false;
    t.mist.visible = false;
    t.mist.rotation.x = -Math.PI / 2;
    w.add(t.mist);
    try { ctx.noOutline(t.mist); } catch { /* headless */ }

    const fishGeo = buildKatsuoGeo();
    t.aLand = new THREE.InstancedBufferAttribute(new Float32Array(NF), 1);
    fishGeo.setAttribute('aLand', t.aLand);
    t.fish = new THREE.InstancedMesh(fishGeo, fishMat(ctx), NF);
    t.fish.frustumCulled = false;
    t.fish.name = 'ippon:fish';
    t.fish.castShadow = true;
    t.fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    w.add(t.fish);

    const built = buildCrewGeo(ctx);
    t.crewGeo = built.geo;
    t.liftA = new Float32Array(CREW + 1);
    t.hideA = new Float32Array(CREW + 1);
    t.lineA = new Float32Array(CREW + 1);
    t.lineA[CREW] = 1;
    t.hideA[CREW] = 1;
    t.pickA = new Float32Array(CREW + 1);
    for (let i = 0; i < CREW; i++) t.pickA[i] = i % 4;
    t.crewGeo.setAttribute('aLift', new THREE.InstancedBufferAttribute(t.liftA, 1));
    t.crewGeo.setAttribute('aPick', new THREE.InstancedBufferAttribute(t.pickA, 1));
    t.crewGeo.setAttribute('aHide', new THREE.InstancedBufferAttribute(t.hideA, 1));
    t.crewGeo.setAttribute('aLineOn', new THREE.InstancedBufferAttribute(t.lineA, 1));
    t.crew = new THREE.InstancedMesh(t.crewGeo, crewMat(ctx, built.mat), CREW + 1);
    t.crew.frustumCulled = false;
    t.crew.name = 'ippon:crew';
    t.crew.castShadow = true;
    t.crew.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    w.add(t.crew);
    try { ctx.noOutline(t.crew); } catch { /* headless */ }
    // nothing of the trip shows until the first update places it
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < NP; i++) t.parts.setMatrixAt(i, zero);
    for (let i = 0; i < NF; i++) t.fish.setMatrixAt(i, zero);
    for (let i = 0; i <= CREW; i++) t.crew.setMatrixAt(i, zero);
    return t;
  });
  function bindTrip(t) {
    ({ gulls, parts, mist, fish, aLand, crew, crewGeo, liftA, hideA, lineA, pickA } = t || {});
  }

  let flag = null;
  try {
    const tex = ctx.tex?.draw ? ctx.tex.draw(256, 128, (g) => {
      g.clearRect(0, 0, 256, 128);
      g.fillStyle = '#223A70';
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = '#FBFAF5';
      g.fillRect(10, 10, 236, 108);
      g.fillStyle = '#223A70';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 40px "Zen Maru Gothic", "Noto Sans JP", sans-serif';
      g.fillText('一本釣り', 128, 46);
      g.fillText('体験', 128, 88);
    }, { key: 'ippon-flag' }) : null;
    if (tex) {
      flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: true,
      }));
      flag.name = 'ippon:flag';
      flag.frustumCulled = false;
      ctx.add(flag);
      try { ctx.noOutline(flag); } catch { /* headless */ }
    }
  } catch { /* a missing tex still leaves the boat */ }

  const stand = stations.eye.y - 1.62;
  catchPathInto(1, 3.2, stand, _land);
  const slideU = new Float32Array(DECK);
  const flapA = new Float32Array(DECK);
  for (let i = 0; i < DECK; i++) slideU[i] = 1;
  const prevLift = new Float32Array(CREW);
  const cheers = [
    { on: 0, life: 0, k: 0, x: 0, y: 0, z: 0, sx: 0, sy: 0 },
    { on: 0, life: 0, k: 0, x: 0, y: 0, z: 0, sx: 0, sy: 0 },
    { on: 0, life: 0, k: 0, x: 0, y: 0, z: 0, sx: 0, sy: 0 },
    { on: 0, life: 0, k: 0, x: 0, y: 0, z: 0, sx: 0, sy: 0 },
  ];

  const fly = createFlight();
  let sprayAcc = 0;
  let boilAcc = 0;
  let baitAcc = 0;
  let rippleAcc = 0;
  let pan = 0;
  let dip = 0;
  let poleU = 0;
  let tookDeck = 0;
  let cheerN = 0;
  const cam = ctx.camera;
  const feetY = stand;

  function spawn(kind, x, y, z, vx, vy, vz, px, thin, max) {
    for (let i = 52; i < NP; i++) {
      const p = pool[i];
      if (p.on) continue;
      p.on = 1; p.hold = 0; p.kind = kind; p.x = x; p.y = y; p.z = z;
      p.vx = vx; p.vy = vy; p.vz = vz; p.px = px; p.thin = thin; p.life = 0; p.max = max;
      return;
    }
  }

  const hoses = [];
  {
    const nz = stations.nozzles;
    const tmp = [];
    for (let i = 0; i < nz.length; i++) if (nz[i][3] > 0) tmp.push(i);
    tmp.sort((a, b) => Math.abs(nz[a][2] - stations.eye.z) - Math.abs(nz[b][2] - stations.eye.z));
    for (let i = 0; i < 3 && i < tmp.length; i++) hoses.push(tmp[i]);
  }

  // The arc the angler sees: three hoses nearest the station, landing in a ring around the lure.
  function paintArcs(ship, on) {
    const nz = stations.nozzles;
    for (let i = 4; i < 52; i++) pool[i].on = 0;
    mist.visible = false;
    if (!on) return;
    let slot = 4;
    let landX = 0, landZ = 0, lands = 0;
    for (let h = 0; h < hoses.length; h++) {
      const q = nz[hoses[h]];
      const ang = h * 2.15 + 0.4;
      const tx = stations.eye.x + 5.15 + Math.cos(ang) * 0.85;
      const tz = stations.eye.z + Math.sin(ang) * 0.7;
      const ty = 0.06;
      const hv = hoseVelocity(q[0], q[1], q[2], tx, ty, tz);
      const steps = 16;
      let has = 0, px0 = 0, py0 = 0, pz0 = 0;
      for (let s = 0; s < steps; s++) {
        const t = ((s + 0.45) / steps) * hv.T;
        const at = hoseAt(q[0], q[1], q[2], hv, t);
        toWorld(at.x, Math.max(0.05, at.y), at.z, ship, _w);
        const p = pool[slot++];
        if (!p) break;
        const splash = s >= steps - 2;
        p.on = 1; p.hold = 1; p.kind = 6;
        p.x = _w.x; p.y = Math.max(0.06, _w.y); p.z = _w.z;
        p.life = 0; p.max = 1;
        p.px = splash ? 4 : 6;
        p.thin = splash ? 2.4 : 2;
        if (has) { p.vx = _w.x - px0; p.vy = _w.y - py0; p.vz = _w.z - pz0; }
        else { p.vx = 0.2; p.vy = 0.35; p.vz = 0.02; }
        px0 = _w.x; py0 = _w.y; pz0 = _w.z; has = 1;
        if (splash) { landX += _w.x; landZ += _w.z; lands++; }
      }
    }
    if (lands) {
      mist.visible = true;
      mist.position.set(landX / lands, 0.18, landZ / lands);
      mist.rotation.set(-Math.PI / 2, ship.yaw || 0, 0);
    }
  }

  function placeBirds(schools, n, hot) {
    const diving = hot > 0.32;
    for (let i = 0; i < 3; i++) {
      const s = i < n ? schools[i] : null;
      if (!s) continue;
      centers[i][0] = s.x;
      centers[i][1] = diving ? 2.8 : 8;
      centers[i][2] = s.z;
    }
    if (!gulls || !gulls.birds || reduced) return;
    const dive = diving ? Math.min(1, 0.88 + hot * 0.12) : 0;
    for (const b of gulls.birds) {
      if (!b._ippon) continue;
      b.dive = dive;
      if (b._R0 == null) b._R0 = b.R;
      b.R = diving ? Math.max(4.2, b._R0 * 0.2) : b._R0;
      b.spread = diving ? 0.38 : 1;
    }
  }

  function park(slot) {
    const col = slot % 6;
    const row = (slot / 6) | 0;
    _park.x = _land.x - 0.35 - col * 0.22;
    _park.y = _land.y - 0.06 - col * 0.035;
    _park.z = _land.z - 0.3 - row * 0.4;
  }

  function deckAt(slot, u) {
    park(slot);
    const e = u < 1 ? u * u * (3 - 2 * u) : 1;
    _path2.x = _land.x + (_park.x - _land.x) * e;
    _path2.y = _land.y + (_park.y - _land.y) * e;
    _path2.z = _land.z + (_park.z - _land.z) * e;
  }

  function setFov(n) {
    if (!cam || cam.fov === n) return;
    cam.fov = n;
    cam.updateProjectionMatrix();
  }

  function aim(st, au) {
    if (!cam) return;
    const ship = st.ship;
    const look = st.look || '';
    if (look === 'deck') {
      setFov(48);
      toWorld(stations.eye.x - 4.2, stand + 3.6, stations.eye.z - 1.2, ship, _p);
      cam.position.copy(_p);
      toWorld(stations.eye.x + _land.x, stand + 0.2, stations.eye.z + _land.z - 1.2, ship, _look);
      cam.lookAt(_look);
      return;
    }
    if (look === 'spray') {
      setFov(52);
      toWorld(stations.eye.x + 0.6, stand + 1.9, stations.eye.z + 2.8, ship, _p);
      cam.position.copy(_p);
      toWorld(stations.eye.x + 5.1, 0.9, stations.eye.z, ship, _look);
      cam.lookAt(_look);
      return;
    }
    if (look === 'nabura') {
      setFov(52);
      const s = st.schools[st.near | 0] || st.schools[0];
      if (s) {
        cam.position.set(s.x + 10, 2.05, s.z + 7.5);
        cam.lookAt(s.x - 1.5, 0.2, s.z - 0.5);
      }
      return;
    }
    if (look === 'actions' || look === 'coach-bait' || look === 'coach-spray' || look === 'coach-pole') {
      setFov(52);
      toWorld(stations.eye.x + 0.5, stand + 2.15, stations.eye.z + 1.4, ship, _p);
      cam.position.copy(_p);
      toWorld(stations.eye.x + 5.6, 0.7, stations.eye.z + 0.1, ship, _look);
      cam.lookAt(_look);
      return;
    }
    if (look === 'crew') {
      setFov(50);
      toWorld(stations.eye.x + 2.8, stand + 2.4, stations.eye.z - 7.5, ship, _p);
      cam.position.copy(_p);
      toWorld(stations.eye.x + 0.2, stand + 1.15, stations.eye.z + 2, ship, _look);
      cam.lookAt(_look);
      return;
    }
    const poling = st.phase === 'pole' || st.phase === 'swing' || fly.on || look === 'pov' || look === 'apex' || look === 'swing';
    if (!(st.ownCam && poling) && look !== 'pov' && look !== 'apex') { setFov(50); return; }
    setFov(look === 'apex' ? 36 : 62);
    // Eyes on the port rail, the pole in front, the horizon high so the water fills the view.
    const apex = look === 'apex';
    const ex = stations.eye.x + (apex ? 0.55 : 0.12);
    const ey = stand + (apex ? 1.42 : 1.58);
    const ez = stations.eye.z + (apex ? 0.35 : -0.55);
    toWorld(ex, ey, ez, ship, _p);
    cam.position.copy(_p);
    const lureX = stations.eye.x + 5.4;
    const lureY = 0.72 - dip * 0.35;
    const lureZ = stations.eye.z + 0.08;
    const fx = stations.eye.x + _path.x;
    const fy = _path.y + 0.35;
    const fz = stations.eye.z + _path.z;
    const p = look === 'apex' ? 1 : pan;
    toWorld(lureX + (fx - lureX) * p, lureY + (fy - lureY) * p, lureZ + (fz - lureZ) * p, ship, _look);
    cam.lookAt(_look);
  }

  function projectCheers() {
    if (!cam) return;
    cam.updateMatrixWorld();
    const w = typeof window !== 'undefined' ? window.innerWidth : 1600;
    const h = typeof window !== 'undefined' ? window.innerHeight : 900;
    for (let i = 0; i < 4; i++) {
      const c = cheers[i];
      if (c.life <= 0) { c.on = 0; continue; }
      _p.set(c.x, c.y, c.z).project(cam);
      c.sx = (_p.x * 0.5 + 0.5) * w;
      c.sy = (-_p.y * 0.5 + 0.5) * h;
      if (c.sy > h * 0.72) c.sy = h * 0.36;
      c.on = _p.z < 1 ? 1 : 0;
    }
  }

  /** The 一本釣り体験 flag over the boat (moored or at sea), out of the way of the angler's own shots. */
  function placeFlag(st, ship) {
    if (!flag) return;
    const hideFlag = st.look === 'pov' || st.look === 'apex' || st.look === 'swing' || st.look === 'spray' || st.look === 'catch' || st.look === 'stamp' || st.look === 'crew' || st.look === 'actions' || (st.look && st.look.indexOf('coach-') === 0) || st.phase === 'pole' || st.phase === 'swing';
    flag.visible = !hideFlag;
    if (!hideFlag) {
      toWorld(-1.6, stand + 5.4, stations.eye.z * 0.35, ship, _p);
      flag.position.copy(_p);
      _e.set(0, (ship.yaw || 0) + Math.PI * 0.5, 0);
      flag.rotation.copy(_e);
    }
  }

  /** [mobile-play] The screen's own field of view (main.js: ctx.fovFor) once the trip is over. The view used to set 50
   *  degrees every frame even ashore, which on a portrait phone (88 by the screen's rule) narrowed the town to ~24 across. */
  function restoreFov() {
    if (!cam || typeof ctx.fovFor !== 'function') return;
    const f = ctx.fovFor(cam.aspect);
    if (Number.isFinite(f) && Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
  }

  let wasNeed = false;
  function update(st, dt) {
    tookDeck = 0;
    const ship = st.ship;
    const n = st.nSchools || 0;
    const hot = st.nabura || 0;
    const d = dt > 0 ? dt : 0;
    placeBirds(st.schools, n, hot);

    // [mobile-play] the trip's meshes exist while a trip (or a shot of one) needs them; ashore only the flag moves
    const need = !!(st.aboard || st.previewArc > 0 || st.look || fly.on);
    if (need && !parts) bindTrip(trip.ensure());
    if (!need && wasNeed) {
      trip.leave();
      if (!trip.built) bindTrip(null);
      restoreFov();
      for (const c of cheers) { c.life = 0; c.on = 0; }   // (a cheer still up when the trip ended must not stay on screen)
    }
    wasNeed = need;
    if (trip.root && !trip.warming) trip.root.visible = need;
    if (!need || !parts) { placeFlag(st, ship); return; }

    pool[0].on = 0;
    pool[1].on = 0;

    if (!(d > 0) && st.aboard) {
      for (let i = 52; i < NP; i++) pool[i].on = 0;
      let placed = 0;
      const room = NP - 52;
      if (hot > 0.28 && n) {
        const s = st.schools[st.near | 0] || st.schools[0];
        for (let k = 0; k < 10 && placed < room; k++) {
          const p = pool[52 + placed];
          const a = k * 0.7;
          const splash = k % 4 === 0;
          p.on = 1; p.kind = splash ? 5 : 4; p.hold = 0;
          p.x = s.x + Math.cos(a) * (0.6 + (k % 5) * 0.7);
          p.y = splash ? 0.28 : 0.1;
          p.z = s.z + Math.sin(a) * (0.6 + (k % 5) * 0.7);
          p.vx = Math.cos(a); p.vy = splash ? 1.4 : 0; p.vz = Math.sin(a);
          p.px = splash ? 4 : 6; p.thin = 2; p.life = 0.05; p.max = 1;
          placed++;
        }
      }
      if (hot > 0.4 && placed < room) {
        toWorld(stations.bait.x, stations.bait.y + 0.35, stations.bait.z, ship, _w);
        for (let k = 0; k < 6 && placed < room; k++) {
          const t = 0.08 + k * 0.045;
          const p = pool[52 + placed];
          p.on = 1; p.kind = 2; p.hold = 0;
          p.x = _w.x + 2.4 * t; p.y = _w.y + 3.2 * t - 7 * t * t; p.z = _w.z + (k - 2.5) * 0.16;
          p.vx = 2.4; p.vy = 3.2 - 14 * t; p.vz = (k - 2.5) * 0.3;
          p.px = 5; p.thin = 2; p.life = 0.1; p.max = 1;
          placed++;
        }
      }
    }

    if (d > 0 && st.aboard) {
      sprayAcc += d;
      boilAcc += d;
      baitAcc += d;
      const sprayEvery = 0.07;
      if (st.spray && sprayAcc > sprayEvery && hoses.length) {
        sprayAcc = 0;
        const q = stations.nozzles[hoses[(st.t * 5) % hoses.length | 0]];
        const ang = st.t * 2.4;
        const tx = stations.eye.x + 4.6 + Math.cos(ang) * 1.15;
        const tz = stations.eye.z + Math.sin(ang) * 0.9;
        const hv = hoseVelocity(q[0], q[1], q[2], tx, 0.08, tz);
        const sy = Math.sin(ship.yaw), cy = Math.cos(ship.yaw);
        const wx = cy * hv.vx + sy * hv.vz;
        const wz = -sy * hv.vx + cy * hv.vz;
        toWorld(q[0], q[1], q[2], ship, _w);
        spawn(0, _w.x, _w.y, _w.z, wx, hv.vy, wz, 5, 2, hv.T);
        spawn(0, _w.x, _w.y + 0.04, _w.z, wx * 0.9, hv.vy * 0.72, wz * 0.9, 4, 2, hv.T * 0.8);
      }
      const chum = st.baitPulse || (hot > 0.45 && baitAcc > 0.28);
      if (chum) {
        if (!st.baitPulse) baitAcc = 0;
        toWorld(stations.bait.x, stations.bait.y + 0.35, stations.bait.z, ship, _w);
        const nFish = st.baitPulse ? 8 : 3;
        for (let k = 0; k < nFish; k++) {
          spawn(2, _w.x, _w.y, _w.z, 1.8 + hash(k, st.t) * 1.6, 3.1 + hash(k + 3, st.t) * 0.8, (k - 3) * 0.28, 5, 2, 0.8);
        }
      }
      const boilEvery = 0.24 - hot * 0.14;
      const boilScale = hot * (st.spray ? 1 : 0.45);
      if (boilScale > 0.2 && boilAcc > boilEvery && n) {
        boilAcc = 0;
        const s = st.schools[st.near | 0] || st.schools[0];
        const flashes = 4 + ((boilScale * 10) | 0);
        for (let k = 0; k < flashes; k++) {
          const a = hash(k, st.t) * 6.28;
          const rad = hash(k + 2, st.t) * 5.5;
          const splash = k % 4 === 0;
          spawn(splash ? 5 : 4, s.x + Math.cos(a) * rad, splash ? 0.3 : 0.12, s.z + Math.sin(a) * rad, Math.cos(a), splash ? 1.6 : 0, Math.sin(a), splash ? 4 : 6, 2, 0.38);
        }
      }
      rippleAcc += d;
      if (hot > 0.4 && rippleAcc > 0.45 && n) {
        rippleAcc = 0;
        const s = st.schools[st.near | 0] || st.schools[0];
        _w.set(s.x, 0.2, s.z);
        fx.ripple(_w, { radius: 1.6 + hot * 2.4 });
      }
      for (let i = 52; i < NP; i++) {
        const p = pool[i];
        if (!p.on || p.hold || p.life < 0) continue;
        p.life += d;
        if (p.life > p.max) { p.on = 0; continue; }
        p.x += p.vx * d; p.y += p.vy * d; p.z += p.vz * d;
        const g = p.kind === 1 ? 0.6 : p.kind === 4 ? 0 : (p.kind === 0 || p.kind === 6) ? 9 : 7;
        p.vy -= g * d;
        if (p.y < 0.08 && p.kind !== 3) p.on = 0;
      }
    }

    paintArcs(ship, !!(st.spray && st.aboard));

    const vh = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 900;
    const fov = cam && cam.fov ? cam.fov : 52;
    for (let i = 0; i < NP; i++) {
      const p = pool[i];
      if (!p.on) { _m.makeScale(0, 0, 0); parts.setMatrixAt(i, _m); continue; }
      const cx = cam ? cam.position.x : p.x;
      const cy = cam ? cam.position.y : p.y + 4;
      const cz = cam ? cam.position.z : p.z + 4;
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const dist = Math.hypot(dx, dy, dz) || 4;
      if (dist < 0.22) { _m.makeScale(0, 0, 0); parts.setMatrixAt(i, _m); continue; }
      const len = streakWorld(dist, fov, vh, p.px || 5, 24);
      const wid = streakWorld(dist, fov, vh, p.thin || 2, 6);
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      if (p.kind === 4 || sp < 0.02) {
        _e.set(-Math.PI / 2, p.x * 0.17 + i * 0.4, 0);
        _q.setFromEuler(_e);
      } else {
        _dir.set(p.vx, p.vy, p.vz).multiplyScalar(1 / sp);
        _up.set(0, 1, 0);
        if (Math.abs(_dir.dot(_up)) > 0.92) _up.set(1, 0, 0);
        _side.crossVectors(_dir, _up);
        if (_side.lengthSq() < 1e-8) _side.set(1, 0, 0);
        _side.normalize();
        _up.crossVectors(_side, _dir).normalize();
        _basis.makeBasis(_dir, _up, _side);
        _q.setFromRotationMatrix(_basis);
      }
      _p.set(p.x, Math.max(0.05, p.y), p.z);
      _s.set(Math.max(len, 0.003), Math.max(wid, 0.0015), 1);
      _m.compose(_p, _q, _s);
      parts.setMatrixAt(i, _m);
      if (parts.setColorAt) {
        const tint = p.kind === 2 ? _sardine : p.kind === 4 ? _silver : p.kind === 6 ? _sun : p.kind === 1 ? _mist : _foam;
        parts.setColorAt(i, tint);
      }
    }
    parts.instanceMatrix.needsUpdate = true;
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;

    const preview = st.previewArc > 0;
    if (st.flyStart) {
      fly.on = 1; fly.u = 0; fly.hold = 0; fly.held = 0; fly.phase = 'air';
      fly.h = st.perfect ? 4.05 : 3.15;
      fly.first = st.firstCatch ? 1 : 0;
    }
    if (!preview && fly.on) {
      const was = fly.phase;
      flyStep(fly, reduced ? 1 : d, { first: !!fly.first && !reduced, reduced: !!reduced });
      if (was !== 'deck' && fly.phase === 'deck') {
        tookDeck = 1;
        const slot = (st.fishN - 1) % DECK;
        if (slot < 0) { /* none */ } else { slideU[slot] = 0; flapA[slot] = reduced ? 0 : 0.45; }
        toWorld(stations.eye.x + _land.x, _land.y, stations.eye.z + _land.z, ship, _w);
        fx.burst(_w, 'splash', { count: 12 });
      }
    }
    const au = preview ? st.previewArc : (fly.on ? fly.u : 0);
    const h = preview ? 3.6 : fly.h;
    catchPathInto(au, h, stand, _path);
    const showFly = fly.on || preview;

    const wantPan = (showFly && au > 0.12) || st.look === 'apex' ? 1 : 0;
    if (!(d > 0) || reduced) pan = wantPan;
    else pan += (wantPan - pan) * Math.min(1, d / (wantPan ? 0.16 : 0.35));
    const wantDip = st.phase === 'swing' && !showFly ? 1 : 0;
    if (!(d > 0) || reduced) dip = wantDip;
    else dip += (wantDip - dip) * Math.min(1, d / 0.1);
    let wantPole = 0;
    if (showFly) wantPole = au;
    else if (st.phase === 'swing') wantPole = -0.2;
    if (!(d > 0) || reduced) poleU = wantPole;
    else poleU += (wantPole - poleU) * Math.min(1, d * 8);

    const deckCount = Math.min(DECK, Math.max(0, (st.fishN | 0) - (showFly ? 1 : 0)));
    for (let i = 0; i < NF; i++) {
      if (i === 0 && showFly) {
        toWorld(stations.eye.x + _path.x, _path.y, stations.eye.z + _path.z, ship, _p);
        catchPathInto(Math.min(1, au + 0.05), h, stand, _path2);
        // The mouth stays on the line: the nose points back at the pole until the barbless hook lets go.
        if (au < 0.78) _dir.set(_path.x - _path2.x, _path.y - _path2.y, _path.z - _path2.z);
        else _dir.set(_path2.x - _path.x, _path2.y - _path.y, _path2.z - _path.z);
        if (_dir.lengthSq() < 1e-6) _dir.set(1, 0.2, 0);
        _dir.normalize();
        _mouth.set(_path.x + _dir.x * 0.26, _path.y - feetY + _dir.y * 0.26, _path.z + _dir.z * 0.26);
        _q.setFromUnitVectors(_nose, _dir);
        _rollQ.setFromAxisAngle(_nose, 0.72);
        _q.multiply(_rollQ);
        _e.set(0, ship.yaw, 0);
        _yawQ.setFromEuler(_e);
        _q.premultiply(_yawQ);
        _s.set(1, 1, 1);
        _m.compose(_p, _q, _s);
        fish.setMatrixAt(0, _m);
        aLand.setX(0, 0);
        continue;
      }
      const slot = i - 1;
      if (slot < 0 || slot >= deckCount) {
        _m.makeScale(0, 0, 0);
        fish.setMatrixAt(i, _m);
        aLand.setX(i, 1);
        continue;
      }
      if (d > 0 && !reduced) {
        if (slideU[slot] < 1) slideU[slot] = Math.min(1, slideU[slot] + d / 0.85);
        if (flapA[slot] > 0) flapA[slot] -= d;
      } else if (!showFly && st.fishN > 0) slideU[slot] = 1;
      deckAt(slot, slideU[slot]);
      const bob = flapA[slot] > 0 ? Math.sin(st.t * 28 + slot) * 0.08 * flapA[slot] : 0;
      toWorld(stations.eye.x + _path2.x, _path2.y + bob, stations.eye.z + _path2.z, ship, _p);
      _e.set(bob * 1.4, ship.yaw + slot * 0.35, flapA[slot] > 0 ? Math.sin(st.t * 32 + slot) * 0.5 : 0.15);
      _q.setFromEuler(_e);
      _s.set(1, 1, 1);
      _m.compose(_p, _q, _s);
      fish.setMatrixAt(i, _m);
      aLand.setX(i, 1);
    }
    fish.instanceMatrix.needsUpdate = true;
    aLand.needsUpdate = true;

    if (st.look === 'outbound' || st.look === 'mouth' || st.look === 'cast') {
      for (let i = 0; i < 4; i++) cheers[i].life = 0;
    }
    const working = hot > 0.45 && (st.phase === 'pole' || st.phase === 'swing' || st.phase === 'work' || st.look === 'crew');
    const cycle = 2.15;
    for (let i = 0; i < CREW; i++) {
      const c = stations.crew[i];
      const show = (st.aboard || preview || st.look === 'crew' || st.look === 'deck') && c;
      if (!show) { _m.makeScale(0, 0, 0); crew.setMatrixAt(i, _m); continue; }
      toWorld(c.x, c.y, c.z, ship, _p);
      _e.set(0, ship.yaw, 0);
      _q.setFromEuler(_e);
      const sc = HEIGHTS[i % 4];
      _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      crew.setMatrixAt(i, _m);
      let lift = 0;
      if (working && !reduced) {
        const ph = (st.t + i * 0.37) % cycle;
        if (ph < 0.7) lift = Math.sin((ph / 0.7) * Math.PI);
      }
      if (lift > 0.82 && prevLift[i] <= 0.82 && ((i + ((st.t / cycle) | 0)) % 3) === 0) {
        const b = cheers[cheerN % 4];
        cheerN++;
        b.life = 0.9; b.on = 1; b.k = i % 2;
        toWorld(c.x, c.y + 1.85, c.z, ship, _w);
        b.x = _w.x; b.y = _w.y; b.z = _w.z;
      }
      prevLift[i] = lift;
      liftA[i] = lift;
    }
    const showSelf = st.aboard || preview || st.look === 'pov' || st.look === 'apex' || st.look === 'swing';
    if (!showSelf) { _m.makeScale(0, 0, 0); crew.setMatrixAt(CREW, _m); }
    else {
      toWorld(stations.eye.x, feetY, stations.eye.z, ship, _p);
      _e.set(0, ship.yaw, 0);
      _q.setFromEuler(_e);
      _s.set(1, 1, 1);
      _m.compose(_p, _q, _s);
      crew.setMatrixAt(CREW, _m);
      liftA[CREW] = poleU < 0 ? poleU : poleU;
    }
    crew.instanceMatrix.needsUpdate = true;
    crewGeo.getAttribute('aLift').needsUpdate = true;

    const follow = showFly && au > 0.02 && au < 0.78;
    if (follow) uLure.value.copy(_mouth);
    else uLure.value.set(2.7, 0.15 - feetY - dip * 0.3, 0);

    for (let i = 0; i < 4; i++) if (cheers[i].life > 0) cheers[i].life = Math.max(0, cheers[i].life - (reduced ? 1 : d));
    aim(st, au);
    if (st.kick > 0 && cam) {
      _side.set(1, 0, 0).applyQuaternion(cam.quaternion);
      cam.position.addScaledVector(_side, 0.055 * st.kick);
      cam.position.y += 0.028 * st.kick;
    }
    placeFlag(st, ship);
    projectCheers();
  }

  return {
    update, placeBirds, centers, cheers,
    get tookDeck() { return tookDeck; },
    get flying() { return fly.on; },
    /** [mobile-play] the trip's meshes: built and warmed behind the hub's title card */
    prepare: () => trip.prepare(),
    get ready() { return trip.ready; },
    trip,
  };
}
