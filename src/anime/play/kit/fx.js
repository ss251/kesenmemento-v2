// [play] One draw for every spark, ripple, glint and shell. Slots 0..51 are
// the charm stars (written each step, never aged). The rest are bursts.
// Typed arrays back the instance attributes, so a frame does not allocate.
//
// Bloom (renderer bright-pass, threshold 1.05, knee 0.5) turns a large soft
// sprite into a ball. Particles stay crisp, at or below BLOOM_MAX, and never
// wider than 24 CSS pixels. Alpha falls as a sprite approaches that cap.

import * as THREE from 'three';
import { createSim, pinRange, rnd, emit, writePin, stepSim, KIND_DISC, KIND_RING, KIND_STAR, KIND_STREAK, KIND_GLINT, BLOOM_MAX, STAR_MAX, STAR_PX } from './particles.js';
import { onPlayTick } from './runtime.js';
import { sfx } from './sfx.js';
import { planShells, boomDelay, FW_PALETTE } from './fireworks.js';

const GLINTS = 52;
const CAP = 720;
const MAX_PX = 24;

// Linear colours. A sparkle star is drawn 紺-edged with a pale core, so it reads on the sunlit quay and at night.
const GOLD = [0.94, 0.46, 0.0]; // 山吹 #F8B500
const SPARK = [1.0, 0.77, 0.25]; // #FFE38A
const SPLASH = [0, 163 / 255, 175 / 255];
const RING = [0.55, 0.72, 0.82];
const AKANE = [183 / 255, 40 / 255, 46 / 255];
const KINARI = [0.90, 0.88, 0.82];
const CONFETTI = [GOLD, SPARK, SPLASH, AKANE, KINARI];

const PRESET = {
  gold: { n: 18, life: 0.62, speed: 2.6, grav: 3.0, scale: 0.042, grow: 0.1, kind: KIND_STAR, col: GOLD },
  spark: { n: 12, life: 0.45, speed: 1.8, grav: 1.1, scale: 0.032, grow: 0, kind: KIND_STAR, col: SPARK },
  splash: { n: 14, life: 0.45, speed: 2.6, grav: 6, scale: 0.05, grow: 0.05, kind: KIND_STREAK, col: SPLASH },
  confetti: { n: 20, life: 0.8, speed: 2.8, grav: 2.4, scale: 0.04, grow: 0, kind: KIND_STAR, col: null },
  ring: { n: 1, life: 0.85, speed: 0, grav: 0, scale: 1.5, grow: 2.2, kind: KIND_RING, col: RING },
};

const VERT = /* glsl */`
  attribute vec4 iData;
  attribute vec4 iStyle;
  attribute vec4 iExtra;
  uniform vec3 uCam;
  uniform float uFov;
  uniform float uH;
  uniform float uMaxPx;
  uniform float uHideGlint;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vKind;
  varying float vFade;
  void main() {
    float sc = iStyle.w;
    if (sc < 0.001 || (uHideGlint > 0.5 && iData.w > 3.5)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vFade = 0.0; return; }
    vUv = uv;
    vKind = iData.w;
    vCol = iStyle.rgb;
    vec3 p = iData.xyz;
    float dist = max(length(uCam - p), 0.35);
    float mPerPx = 2.0 * tan(uFov * 0.5) * dist / max(uH, 1.0);
    float px = sc / max(mPerPx, 1e-5);
    // Rings stay a world-sized ripple. Stars, streaks and droplets cap at uMaxPx.
    // The collectible glint may flash larger: it is normal-blended and never crosses the knee.
    float capped = step(0.5, abs(vKind - 1.0));
    bool star = vKind > 1.5 && vKind < 2.5;
    float capPx = vKind > 3.5 ? 42.0 : (star ? ${STAR_PX.toFixed(1)} : uMaxPx);
    float lim = mix(1.0, min(1.0, capPx / max(px, 0.001)), capped);
    sc *= lim;
    // Stars are 紺-edged, so they keep full alpha; everything else thins as it nears the cap.
    vFade = star ? 1.0 : mix(1.0, mix(1.0, 0.4, smoothstep(10.0, uMaxPx, px)), capped);
    vec3 wp;
    if (vKind > 2.5 && vKind < 3.5) {
      // A thin streak, 2–6 px wide (PLAY-UI-STYLE). A comet (iExtra.w = tail seconds) is as long as the way it covers in that time.
      vec3 vel = iExtra.xyz;
      float sp = length(vel);
      vec3 dir = sp > 0.05 ? vel / sp : vec3(0.0, 1.0, 0.0);
      vec3 side = normalize(cross(dir, uCam - p) + 1e-4);
      float trail = iExtra.w > 0.0 ? max(sp * iExtra.w, mPerPx * 10.0) : max(sc * 4.2, mPerPx * 36.0);
      float wide = clamp(sc * 0.16, mPerPx * 2.0, mPerPx * 5.0);
      wp = p - dir * (position.y + 0.5) * trail + side * position.x * wide;
    } else if (vKind > 0.5 && vKind < 1.5) {
      wp = p + vec3(position.x, 0.0, position.y) * sc;
    } else {
      vec3 f = normalize(uCam - p);
      vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), f) + 1e-4);
      vec3 up = cross(f, side);
      vec2 q = position.xy;
      if (star) {
        // Each star twinkles: its own angle, turning a little while it flies.
        float h = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
        float a = h * 6.2832 + uTime * (h - 0.5) * 5.0;
        q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
      }
      wp = p + (side * q.x + up * q.y) * sc;
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    if (vKind > 1.5 && vKind < 2.5) gl_Position.z -= 0.0025 * gl_Position.w;
  }`;

const FRAG = /* glsl */`
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vKind;
  varying float vFade;
  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    float r = length(c);
    float drop = 1.0 - smoothstep(0.28, 0.42, r);
    float ring = 1.0 - smoothstep(0.06, 0.16, abs(r - 0.72));
    float ax = abs(c.x), ay = abs(c.y);
    float dstar = min(ax, ay) * 3.2 + max(ax, ay) * 0.72;
    float star = 1.0 - smoothstep(0.52, 0.74, dstar);
    float core = 1.0 - smoothstep(0.0, 0.16, r);
    // Head at vUv.y = 0: a bright tip and a tail that thins and fades.
    float head = 1.0 - vUv.y;
    float streak = (1.0 - smoothstep(0.45, 0.95, abs(c.x))) * smoothstep(0.0, 0.22, head) * mix(0.18, 1.0, head * head);
    float a = drop;
    vec3 col = min(vCol, vec3(${BLOOM_MAX.toFixed(2)}));
    if (vKind > 2.5) {
      a = streak;
      float hot = smoothstep(0.62, 0.96, head);
      vec3 tip = vCol * (${STAR_MAX.toFixed(2)} / max(max(vCol.r, vCol.g), max(vCol.b, 1e-3)));
      col = mix(col, mix(tip, vec3(${STAR_MAX.toFixed(2)}), 0.35), hot);
    }
    else if (vKind > 1.5) {
      // A crisp 4-point star: 紺 edge, gold body, a pale core. Under the bloom threshold, never a ball.
      float body = 1.0 - smoothstep(0.50, 0.56, dstar);
      float edge = 1.0 - smoothstep(0.68, 0.74, dstar);
      float hot = 1.0 - smoothstep(0.05, 0.24, r);
      vec3 gold = vCol * (${STAR_MAX.toFixed(2)} / max(max(vCol.r, vCol.g), max(vCol.b, 1e-3)));
      col = mix(vec3(0.016, 0.042, 0.162), gold, body);
      col = mix(col, vec3(${STAR_MAX.toFixed(2)}), hot * body);
      a = edge;
    }
    else if (vKind > 0.5) a = ring;
    a *= vFade;
    if (a < 0.04) discard;
    gl_FragColor = vec4(col, a);
  }`;

const GLINT_FRAG = /* glsl */`
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vKind;
  varying float vFade;
  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    vec2 q = abs(c);
    float ax = abs(c.x), ay = abs(c.y);
    float d = min(ax, ay) * 3.2 + max(ax, ay) * 0.78;
    float inner = 1.0 - smoothstep(0.58, 0.74, d);
    float outer = 1.0 - smoothstep(0.74, 0.90, d);
    vec3 gold = min(vCol, vec3(0.52, 0.32, 0.05));
    vec3 navy = vec3(0.07, 0.10, 0.26);
    vec3 col = mix(navy, gold, inner);
    float a = outer;
    if (a < 0.04) discard;
    gl_FragColor = vec4(col, a);
  }`;

const GLOW_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }`;

const GLOW_FRAG = /* glsl */`
  uniform vec3 uCol;
  uniform float uK;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    // The water catches the shell's colour: a wide, faint wash, never a disc.
    float a = pow(1.0 - smoothstep(0.0, 1.0, r), 2.0) * uK * 0.26;
    if (a < 0.02) discard;
    gl_FragColor = vec4(uCol, a);
  }`;

function xyz(p, out) {
  if (!p) return null;
  out.x = p.x; out.y = p.y || 0; out.z = p.z;
  return out;
}

const moteCSS = 'position:fixed;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;pointer-events:none;z-index:8;will-change:transform,opacity;background:#FFE38A;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);';
// The charm's glint: a 64 px box scaled to its size each step (transform only, no layout).
// A 山吹 four-point star with a 紺 edge and a white core; on the flash a long white cross and a gold ping ring open.
const glintCSS = 'position:fixed;left:0;top:0;width:64px;height:64px;margin:0;pointer-events:none;z-index:7;transform-origin:32px 32px;will-change:transform;';
const GLINT_SVG = '<svg viewBox="-32 -32 64 64" width="64" height="64" aria-hidden="true" style="display:block;overflow:visible">' +
  '<circle class="g-ping" r="27" fill="none" stroke="#F8B500" stroke-width="3.2" opacity="0"/>' +
  '<circle class="g-ping2" r="27" fill="none" stroke="#223A70" stroke-width="1.2" opacity="0" transform="scale(1.07)"/>' +
  // The flash cross reaches past the box (to 1.45x), so at 60 m the flare is a long キラッ, not a dot.
  '<path class="g-ray" opacity="0" d="M0-46L2.8-4.2L46 0L2.8 4.2L0 46L-2.8 4.2L-46 0L-2.8-4.2Z" fill="#FFFFFF" stroke="#223A70" stroke-width="1.8" stroke-linejoin="round"/>' +
  '<path d="M0-25C1.9-7.4 7.4-1.9 25 0C7.4 1.9 1.9 7.4 0 25C-1.9 7.4-7.4 1.9-25 0C-7.4-1.9-1.9-7.4 0-25Z" fill="#F8B500" stroke="#223A70" stroke-width="3.6" stroke-linejoin="round"/>' +
  '<path d="M0-15.5C1.2-4.6 4.6-1.2 15.5 0C4.6 1.2 1.2 4.6 0 15.5C-1.2 4.6-4.6 1.2-15.5 0C-4.6-1.2-1.2-4.6 0-15.5Z" fill="#FFE38A"/>' +
  '<circle r="4.2" fill="#FFFFFF"/></svg>';

export function mountFx(ctx) {
  const data = new Float32Array(CAP * 4);
  const style = new Float32Array(CAP * 4);
  const extra = new Float32Array(CAP * 4);
  const sim = createSim(CAP);
  pinRange(sim, GLINTS);
  let still = false;
  try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { still = false; }

  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const aData = new THREE.InstancedBufferAttribute(data, 4);
  const aStyle = new THREE.InstancedBufferAttribute(style, 4);
  const aExtra = new THREE.InstancedBufferAttribute(extra, 4);
  aData.setUsage(THREE.DynamicDrawUsage);
  aStyle.setUsage(THREE.DynamicDrawUsage);
  aExtra.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iData', aData);
  geo.setAttribute('iStyle', aStyle);
  geo.setAttribute('iExtra', aExtra);
  geo.instanceCount = CAP;

  const uCam = { value: new THREE.Vector3() };
  const uFov = { value: 0.96 };
  const uH = { value: 900 };
  const uTime = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCam, uFov, uH, uMaxPx: { value: MAX_PX }, uHideGlint: { value: 1 }, uTime },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false, // the 14 px glint must read at 60 m; occlusion is the ray in world.js, not the depth buffer
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide, // a streak's winding flips with the view; FrontSide culled the whole shell
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 4;
  mesh.name = 'play-fx';
  mesh.visible = false;
  if (ctx.noOutline) ctx.noOutline(mesh);
  if (ctx.noBatch) ctx.noBatch(mesh);
  ctx.add(mesh);

  const geoGlint = new THREE.InstancedBufferGeometry();
  geoGlint.index = base.index;
  geoGlint.setAttribute('position', base.attributes.position);
  geoGlint.setAttribute('uv', base.attributes.uv);
  geoGlint.setAttribute('iData', aData);
  geoGlint.setAttribute('iStyle', aStyle);
  geoGlint.setAttribute('iExtra', aExtra);
  geoGlint.instanceCount = GLINTS;
  const glintMat = new THREE.ShaderMaterial({
    uniforms: { uCam, uFov, uH, uMaxPx: { value: MAX_PX }, uHideGlint: { value: 0 }, uTime },
    vertexShader: VERT,
    fragmentShader: GLINT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const glintMesh = new THREE.Mesh(geoGlint, glintMat);
  glintMesh.frustumCulled = false;
  glintMesh.matrixAutoUpdate = false;
  glintMesh.renderOrder = 5;
  glintMesh.name = 'play-glint';
  glintMesh.visible = false; // the star is a DOM sprite: a mesh star under the bloom knee is too dim to read at 60 m in daylight, and a brighter mesh blooms
  if (ctx.noOutline) ctx.noOutline(glintMesh);
  if (ctx.noBatch) ctx.noBatch(glintMesh);
  ctx.add(glintMesh);

  const glowGeo = new THREE.CircleGeometry(1, 28);
  glowGeo.rotateX(-Math.PI / 2);
  const glowCol = { value: new THREE.Color(0.45, 0.30, 0.08) };
  const glowK = { value: 0 };
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uCol: glowCol, uK: glowK },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.frustumCulled = false;
  glow.name = 'play-fw-glow';
  glow.visible = false;
  glow.scale.set(52, 1, 52);
  glow.position.y = 0.35;
  glow.renderOrder = 2;
  if (ctx.noOutline) ctx.noOutline(glow);
  if (ctx.noBatch) ctx.noBatch(glow);
  ctx.add(glow);

  const at = { x: 0, y: 0, z: 0 };
  const fw = { on: 0, t: 0, end: 25, sent: 0, plan: null, cx: 156, cz: -33 };
  const BOOMS = 8;
  const boomAt = new Float64Array(BOOMS);
  const boomX = new Float32Array(BOOMS);
  const boomY = new Float32Array(BOOMS);
  const boomZ = new Float32Array(BOOMS);
  let boomCursor = 0;

  const MOTES = 8;
  const motes = [];
  for (let i = 0; i < MOTES; i++) {
    const node = document.createElement('div');
    node.style.cssText = moteCSS;
    node.hidden = true;
    document.body.appendChild(node);
    motes.push({ on: 0, t: 0, dur: 0.42, x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0, node, cb: null });
  }
  let moteCursor = 0;
  const proj = new THREE.Vector3();
  const glintNodes = [];
  const glintFlash = new Float32Array(GLINTS).fill(-1);
  const glintParts = [];
  for (let i = 0; i < GLINTS; i++) {
    const node = document.createElement('div');
    node.className = 'play-glint';
    node.style.cssText = glintCSS;
    node.innerHTML = GLINT_SVG;
    node.hidden = true;
    document.body.appendChild(node);
    glintNodes.push(node);
    glintParts.push({ ray: node.querySelector('.g-ray'), ping: node.querySelector('.g-ping'), ping2: node.querySelector('.g-ping2') });
  }

  function burstAt(x, y, z, kind, count, scale, over) {
    const preset = PRESET[kind] || PRESET.spark;
    const n = Math.max(1, Math.min(48, count || preset.n));
    const sc = scale > 0 ? scale : preset.scale;
    const speed = over && over.speed > 0 ? over.speed : preset.speed;
    for (let i = 0; i < n; i++) {
      const col = preset.col || CONFETTI[(rnd(sim) * CONFETTI.length) | 0];
      let vx = 0, vy = 0, vz = 0;
      let grav = over && over.grav != null ? over.grav : preset.grav;
      let grow = preset.grow;
      let life = over && over.life > 0 ? over.life : preset.life;
      if (!still && speed) {
        const th = rnd(sim) * Math.PI * 2;
        const u = rnd(sim) * 2 - 1;
        const sp = speed * (0.55 + rnd(sim) * 0.6);
        const ring = Math.sqrt(Math.max(0, 1 - u * u));
        vx = Math.cos(th) * ring * sp;
        vy = Math.abs(u) * sp * 0.65 + speed * 0.25;
        vz = Math.sin(th) * ring * sp;
      } else {
        grav = 0; grow = 0; life = 0.45;
      }
      emit(sim, data, style, x, y, z, vx, vy, vz, life, sc * (still ? 1.4 : 1), preset.kind, col[0], col[1], col[2], grav, grow, extra);
    }
  }

  function launchShell(sh) {
    const x = fw.cx + sh.ox;
    const y = sh.y;
    const z = fw.cz + sh.oz;
    const base = FW_PALETTE[sh.color] || FW_PALETTE[0];
    const n = still ? 36 : sh.n;
    const rad = sh.diam * 0.5;
    const life0 = sh.kind === 'kiku' ? 1.85 : 1.45;
    const speed0 = still ? 0 : rad / (life0 * 0.78);
    const grav = still ? 0 : (sh.kind === 'kiku' ? 2.2 : 8.4);
    const kind = sh.kind === 'kiku' && !still ? KIND_STREAK : KIND_STAR;
    const sc = sh.kind === 'kiku' ? 6.4 : 5.2;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const ycl = 1 - 2 * u;
      const ring = Math.sqrt(Math.max(0, 1 - ycl * ycl));
      const th = i * 2.399963 + rnd(sim) * 0.2;
      const sp = speed0 * (0.78 + rnd(sim) * 0.36);
      const vx = Math.cos(th) * ring * sp;
      let vy = ycl * sp;
      const vz = Math.sin(th) * ring * sp;
      if (sh.kind === 'botan') vy -= speed0 * 0.08;
      const white = rnd(sim) > 0.84;
      const col = white ? FW_PALETTE[3] : base;
      const life = still ? 1.4 : life0 * (0.82 + rnd(sim) * 0.28);
      const size = sc * (0.72 + rnd(sim) * 0.45);
      emit(sim, data, style, x, y, z, vx, vy, vz, life, size, kind, Math.min(col[0], BLOOM_MAX), Math.min(col[1], BLOOM_MAX), Math.min(col[2], BLOOM_MAX), grav, 0, extra, kind === KIND_STREAK ? 0.24 : 0);
    }
    const cam = ctx.camera?.position;
    let dist = 220;
    if (cam) dist = Math.hypot(cam.x - x, cam.y - y, cam.z - z);
    const slot = boomCursor++ % BOOMS;
    boomAt[slot] = fw.t + (still ? 0 : boomDelay(dist));
    boomX[slot] = x;
    boomY[slot] = y;
    boomZ[slot] = z;
    glow.position.x = x;
    glow.position.z = z;
    glowCol.value.setRGB(Math.min(base[0], 0.5), Math.min(base[1], 0.4), Math.min(base[2], 0.2));
    glowK.value = 1;
    glow.visible = true;
  }

  function stepMotes(dt) {
    for (let i = 0; i < MOTES; i++) {
      const m = motes[i];
      if (!m.on) continue;
      m.t += dt;
      const u = m.t / m.dur;
      if (u >= 1) {
        m.on = 0;
        m.node.hidden = true;
        const cb = m.cb; m.cb = null;
        if (cb) cb();
        continue;
      }
      const o = 1 - u;
      const x = o * o * m.x0 + 2 * o * u * m.cx + u * u * m.x1;
      const y = o * o * m.y0 + 2 * o * u * m.cy + u * u * m.y1;
      const s = still ? 1 : 1 - 0.35 * u;
      const fade = u > 0.72 ? (1 - u) / 0.28 : 1;
      m.node.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + s.toFixed(3) + ')';
      m.node.style.opacity = String(fade);
    }
  }

  function placeGlints() {
    const cam = ctx.camera;
    const w = (typeof window !== 'undefined' && window.innerWidth) || 1;
    const h = (typeof window !== 'undefined' && window.innerHeight) || 1;
    const fov = ((cam && cam.fov) || 55) * Math.PI / 180;
    const mPerPx = cam ? (2 * Math.tan(fov * 0.5) / h) : 0;
    for (let i = 0; i < GLINTS; i++) {
      const node = glintNodes[i];
      const p = i * 4;
      const sc = style[p + 3];
      if (!(sc > 0.001) || !cam) {
        if (!node.hidden) node.hidden = true;
        continue;
      }
      proj.set(data[p], data[p + 1], data[p + 2]).project(cam);
      if (proj.z > 1) {
        if (!node.hidden) node.hidden = true;
        continue;
      }
      const dist = Math.max(0.35, Math.hypot(cam.position.x - data[p], cam.position.y - data[p + 1], cam.position.z - data[p + 2]));
      let px = mPerPx > 0 ? sc / (mPerPx * dist) : 14;
      if (px < 4) {
        if (!node.hidden) node.hidden = true;
        continue;
      }
      if (px > 64) px = 64;
      const x = (proj.x * 0.5 + 0.5) * w;
      const y = (-proj.y * 0.5 + 0.5) * h;
      // 0 at the 14 px floor, 1 at the ~59 px flash: the cross and the ping open with it, and the star turns a little.
      const f = i < GLINTS - 2 ? Math.max(0, Math.min(1, (px - 16) / 40)) : 0;
      node.hidden = false;
      node.style.transform = 'translate3d(' + (x - 32).toFixed(1) + 'px,' + (y - 32).toFixed(1) + 'px,0) scale(' + (px / 64).toFixed(4) + ') rotate(' + (f * 14).toFixed(1) + 'deg)';
      const fq = Math.round(f * 20) / 20;
      if (glintFlash[i] !== fq) {
        glintFlash[i] = fq;
        const g = glintParts[i];
        g.ray.setAttribute('opacity', fq.toFixed(2));
        g.ray.setAttribute('transform', 'scale(' + (0.7 + 0.3 * fq).toFixed(3) + ')');
        g.ping.setAttribute('opacity', (fq * 0.95).toFixed(2));
        g.ping2.setAttribute('opacity', (fq * 0.8).toFixed(2));
      }
    }
  }

  onPlayTick((dt) => {
    if (fw.on && fw.plan) {
      fw.t += dt;
      while (fw.sent < fw.plan.length && fw.t >= fw.plan[fw.sent].t) launchShell(fw.plan[fw.sent++]);
      if (fw.t >= fw.end) fw.on = 0;
      for (let i = 0; i < BOOMS; i++) {
        if (boomAt[i] > 0 && fw.t >= boomAt[i]) {
          boomAt[i] = 0;
          if (!still) sfx.play('firework', { position: { x: boomX[i], y: boomY[i], z: boomZ[i] }, gain: 0.72 });
        }
      }
    }
    if (glowK.value > 0.02) glowK.value *= Math.exp(-dt * 0.55);
    else if (glow.visible) { glow.visible = false; glowK.value = 0; }
    stepSim(sim, data, style, dt, extra);
    stepMotes(dt);
    if (ctx.camera) {
      uCam.value.copy(ctx.camera.position);
      uFov.value = ((ctx.camera.fov || 55) * Math.PI) / 180;
    }
    uH.value = (typeof window !== 'undefined' && window.innerHeight) || 900;
    uTime.value += dt > 0 && dt < 0.1 ? dt : 0.016;
    placeGlints();
    let burst = 0;
    for (let i = GLINTS; i < sim.n; i++) if (sim.alive[i]) burst++;
    const show = burst > 0;
    if (mesh.visible !== show) mesh.visible = show;
    if (show) { aData.needsUpdate = true; aStyle.needsUpdate = true; aExtra.needsUpdate = true; }
  });

  fx.burst = (position, kind, o = {}) => {
    if (!xyz(position, at)) return;
    burstAt(at.x, at.y, at.z, kind || 'gold', o.count, o.scale);
  };
  fx.ripple = (position, o = {}) => {
    if (!xyz(position, at)) return;
    const radius = o.radius > 0 ? o.radius : 1.5;
    burstAt(at.x, at.y, at.z, 'ring', 1, radius);
  };
  fx.flyToHud = (position, elementOrSelector, o = {}) => {
    const done = o.onArrive;
    if (still || !xyz(position, at) || !ctx.camera) { if (done) done(); return; }
    proj.set(at.x, at.y, at.z).project(ctx.camera);
    if (proj.z > 1) { if (done) done(); return; }
    const w = window.innerWidth, h = window.innerHeight;
    const x0 = (proj.x * 0.5 + 0.5) * w;
    const y0 = (-proj.y * 0.5 + 0.5) * h;
    const el = typeof elementOrSelector === 'string' ? document.querySelector(elementOrSelector) : elementOrSelector;
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    const x1 = r ? r.left + r.width * 0.5 : 72;
    const y1 = r ? r.top + r.height * 0.5 : 88;
    const m = motes[moteCursor];
    moteCursor = (moteCursor + 1) % MOTES;
    m.on = 1; m.t = 0; m.dur = 0.42; m.cb = done || null;
    m.x0 = x0; m.y0 = y0; m.x1 = x1; m.y1 = y1;
    m.cx = (x0 + x1) * 0.5; m.cy = Math.min(y0, y1) - 72;
    m.node.hidden = false;
    m.node.style.opacity = '1';
  };
  fx.fireworks = (o = {}) => {
    const seconds = o.seconds > 0 ? o.seconds : 25;
    fw.on = 1;
    fw.t = 0;
    fw.sent = 0;
    fw.end = seconds;
    fw.plan = planShells({ seconds, count: still ? 5 : 7, seed: 0xA11CE });
    if (o.centre) { fw.cx = o.centre.x; fw.cz = o.centre.z; }
    boomAt.fill(0);
  };
  fx.glint = (i, x, y, z, scale, r = 1, g = 0.93, b = 0.55) => {
    if (i < 0 || i >= GLINTS) return;
    writePin(data, style, i, x, y, z, scale > 0 ? scale : 0, KIND_GLINT, Math.min(r, BLOOM_MAX), Math.min(g, BLOOM_MAX), Math.min(b, BLOOM_MAX));
  };
  fx.stats = () => ({ cap: CAP, glints: GLINTS, bloomMax: BLOOM_MAX, maxPx: MAX_PX, starMax: STAR_MAX, starPx: STAR_PX });
}

const noop = () => {};
export const fx = {
  burst: noop,
  ripple: noop,
  flyToHud: noop,
  fireworks: noop,
  glint: noop,
  stats() { return { cap: 0, glints: 0 }; },
};
