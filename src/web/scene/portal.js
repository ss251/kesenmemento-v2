// The opening (V2-SPEC §2, package v2:portal-cinema): the photoreal Gaussian splat of the physical inner-bay model under a
// glass floor in a softly lit timber gallery -> a 3.5 s dive that hands off to the model massing at the same framing ->
// __RT.reveal.play({ duration: 6000 }) from Pier 7 -> the camera settles into stop 01 at golden hour.
//
// The gallery draws on its own canvas and WebGL context, stacked over the city canvas. Its last pass writes a
// premultiplied alpha mask, so the dissolve reveals the city canvas underneath: the opening never depends on the
// city's post chain, and the city streams its first view (tiles, massing) while the visitor is still in the gallery.
//
// One camera track, in city ENU metres, runs from the gallery pose to stop 01. The gallery is the same world at the
// model's scale (splats.json `enu`: enu = scale * gallery + translation), so the splat and the massing always share
// the framing. The splat is fully dissolved while the camera is still above DISSOLVE_MIN_H gallery metres.
import * as THREE from "three";
import { SplatMesh, SparkRenderer } from "@sparkjsdev/spark";
import { EffectComposer, RenderPass, EffectPass, ShaderPass, BloomEffect, DepthOfFieldEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect } from "postprocessing";
import { poseTrack, applyPose, tourEvents, smootherstep, getFly } from "./camera.js";

// ------------------------------------------------------------------ constants (pure, tested in test/v2-cinema.test.js)
export const GLASS_Y = 0.3;               // glass floor height above the model base (gallery metres); pit depth
export const DISSOLVE_MIN_H = 0.3;        // spec: the splat is gone before the camera drops below this (gallery metres)
export const PIER7 = [34.7, 2.2, 88.8];
export const DEFAULT_MAP = { scale: 299.6, translation: [101.2, 0, -13.6] };     // data/splats/splats.json model.enu

/** Timeline (s from the dive click). */
export const TIMELINE = {
  dive: 3.5,                               // gallery -> handoff
  dissolve: [2.05, 3.05],                  // gallery image -> city (smootherstep), ends before the handoff
  reveal: 6.0,                             // __RT.reveal.play duration
  settle: 4.2,                             // after the reveal, glide into stop 01
};

export const galleryToEnu = (p, m = DEFAULT_MAP) => [p[0] * m.scale + m.translation[0], p[1] * m.scale + m.translation[1], p[2] * m.scale + m.translation[2]];
export const enuToGallery = (p, m = DEFAULT_MAP) => [(p[0] - m.translation[0]) / m.scale, (p[1] - m.translation[1]) / m.scale, (p[2] - m.translation[2]) / m.scale];

/** Gallery-frame opening poses. idle: standing at the glass edge; handoff: just above the glass, facing Pier 7 / the bay. */
export const OPENING_DEFAULTS = {
  idle: { pos: [-1.45, 1.72, 3.5], look: [0.1, -0.22, 0.12], fov: 42 },
  sway: { yawDeg: 3.2, period: 26, bob: 0.012 },
  // city ENU (metres) keys after the dive; t is seconds from the click
  dive: [
    { t: 1.75, pos: [-395, 262, 450], look: [95, 4, 18] },
  ],
  handoff: { pos: [-190, 118, 268], look: [150, 2, -20], fov: 44 },
  reveal: [
    { t: 6.6, pos: [-265, 190, 370], look: [185, 6, -70], fov: 44 },
    { t: 9.5, pos: [-395, 330, 520], look: [260, 12, -210], fov: 46 },
  ],
};

/** Portal alpha (1 = gallery, 0 = city) at time t of the opening. */
export function dissolveAt(t, tl = TIMELINE) {
  if (t <= tl.dissolve[0]) return 1;
  if (t >= tl.dissolve[1]) return 0;
  return 1 - smootherstep((t - tl.dissolve[0]) / (tl.dissolve[1] - tl.dissolve[0]));
}

/** The full opening track in ENU, from the gallery pose (t = 0) to stop 01 (t = dive + reveal + settle). */
export function openingTrack({ stop, map = DEFAULT_MAP, opening = OPENING_DEFAULTS, from = null, tl = TIMELINE }) {
  const g = from ?? opening.idle;
  const T1 = tl.dive, T2 = tl.dive + tl.reveal, T3 = T2 + tl.settle;
  const keys = [
    { t: 0, pos: galleryToEnu(g.pos, map), look: galleryToEnu(g.look, map), fov: g.fov },
    ...opening.dive.map((k) => ({ ...k, t: k.t })),
    { t: T1, ...opening.handoff },
    ...opening.reveal.map((k) => ({ ...k, t: k.t <= T1 ? T1 + 0.5 : Math.min(k.t, T2) })),
    { t: T3, pos: stop.cam.pos, look: stop.cam.look, fov: stop.cam.fov ?? 42 },
  ];
  const tr = poseTrack(keys);
  tr.times = { handoff: T1, revealEnd: T2, end: T3 };
  return tr;
}

// ------------------------------------------------------------------ textures
function canvasTex(w, h, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** Smoked-oak planks (2048 px = 4 m): per-plank tone, streaky grain, bevel shadow. Returns [color, roughness]. */
function oak() {
  const R = rng(7), W = 2048, rows = 22, rowH = W / rows, planks = [];
  for (let r = 0; r < rows; r++) { let x = -R() * 600; while (x < W) { const L = 500 + R() * 700; planks.push({ r, x, L, tone: R(), hue: R() }); x += L; } }
  const color = canvasTex(W, W, (ctx) => {
    ctx.fillStyle = "#3b281b"; ctx.fillRect(0, 0, W, W);
    for (const p of planks) {
      const y = p.r * rowH, base = 58 + p.tone * 26;
      ctx.fillStyle = `rgb(${base + 12 + p.hue * 6},${base - 2},${base - 16})`; ctx.fillRect(p.x, y, p.L, rowH);
      for (let g = 0; g < 26; g++) {                                   // grain streaks, slightly wavy
        const gy = y + 2 + R() * (rowH - 4), a = 0.05 + R() * 0.1, dark = R() < 0.6;
        ctx.strokeStyle = dark ? `rgba(30,18,10,${a})` : `rgba(170,120,80,${a * 0.6})`; ctx.lineWidth = 0.6 + R() * 1.8;
        ctx.beginPath(); ctx.moveTo(p.x, gy);
        for (let x = p.x; x < p.x + p.L; x += 40) ctx.lineTo(x, gy + Math.sin(x * 0.004 + g) * 2.5 + (R() - 0.5) * 0.8);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(10,6,3,0.75)"; ctx.fillRect(p.x, y, 2.5, rowH);               // butt joint
    }
    for (let r = 0; r <= rows; r++) { ctx.fillStyle = "rgba(8,5,3,0.8)"; ctx.fillRect(0, r * rowH - 1.5, W, 3); }
  }, { repeat: [3, 3] });
  const rough = canvasTex(512, 512, (ctx) => {
    ctx.fillStyle = "rgb(118,118,118)"; ctx.fillRect(0, 0, 512, 512);
    for (const p of planks) { const v = 95 + p.tone * 60; ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(p.x / 4, (p.r * rowH) / 4, p.L / 4, rowH / 4); }
    for (let r = 0; r <= rows; r++) { ctx.fillStyle = "rgb(230,230,230)"; ctx.fillRect(0, (r * rowH) / 4 - 0.5, 512, 1); }
  }, { srgb: false, repeat: [3, 3] });
  return [color, rough];
}
function softDot() {
  return canvasTex(64, 64, (ctx) => { const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,0.45)"); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); });
}

// ------------------------------------------------------------------ the gallery
/**
 * Build the gallery around the model splat. Frame: gallery metres, model base plane y = 0, model centred, -z north,
 * glass floor flush with the timber floor at y = GLASS_Y. -> { scene, camera, splat, focusAt(p), setLang, stats }
 */
async function buildGallery({ renderer, src }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0907);
  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 60);
  const G = GLASS_Y, W = src.width, D = src.depth;
  const PW = W + 0.42, PD = D + 0.42;                         // pit opening (glass) around the model
  const RW = 12, RD = 9.6, RH = 3.4;                          // room

  // floor with the pit cut out
  const [oakC, oakR] = oak();
  const shape = new THREE.Shape([[-RW / 2, -RD / 2], [RW / 2, -RD / 2], [RW / 2, RD / 2], [-RW / 2, RD / 2]].map(([x, z]) => new THREE.Vector2(x, z)));
  shape.holes.push(new THREE.Path([[-PW / 2, -PD / 2], [-PW / 2, PD / 2], [PW / 2, PD / 2], [PW / 2, -PD / 2]].map(([x, z]) => new THREE.Vector2(x, z))));
  const floorGeo = new THREE.ShapeGeometry(shape); floorGeo.rotateX(Math.PI / 2);
  { const p = floorGeo.attributes.position, uv = floorGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4); }
  const floorMat = new THREE.MeshStandardMaterial({ map: oakC, roughnessMap: oakR, roughness: 0.58, metalness: 0, envMapIntensity: 0.35, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(floorGeo, floorMat); floor.position.y = G; floor.receiveShadow = true; scene.add(floor);

  // pit: charcoal walls, black base, a warm LED cove just under the glass
  const pitMat = new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 0.8 });
  const pit = new THREE.Mesh(new THREE.BoxGeometry(PW, G + 0.02, PD), pitMat); pit.geometry.translate(0, (G + 0.02) / 2 - 0.02, 0);
  pit.material.side = THREE.BackSide; scene.add(pit);
  const cove = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.66, 0.36).multiplyScalar(2.1), toneMapped: false });
  for (const [w, d, x, z] of [[PW - 0.02, 0.012, 0, -PD / 2 + 0.008], [PW - 0.02, 0.012, 0, PD / 2 - 0.008], [0.012, PD - 0.02, -PW / 2 + 0.008, 0], [0.012, PD - 0.02, PW / 2 - 0.008, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), cove); m.position.set(x, G - 0.035, z); scene.add(m);
  }
  const pitGlow = new THREE.PointLight(0xffc88a, 1.4, 3.2, 2); pitGlow.position.set(0, G - 0.06, 0); scene.add(pitGlow);

  // bronze frame around the glass, the glass itself (additive reflection layer + a whisper of tint)
  const bronze = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.32, metalness: 0.9 });
  for (const [w, d, x, z] of [[PW + 0.06, 0.03, 0, -PD / 2 - 0.015], [PW + 0.06, 0.03, 0, PD / 2 + 0.015], [0.03, PD, -PW / 2 - 0.015, 0], [0.03, PD, PW / 2 + 0.015, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), bronze); b.position.set(x, G + 0.004, z); scene.add(b);
  }
  const glassGeo = new THREE.PlaneGeometry(PW, PD).rotateX(-Math.PI / 2);
  // Glass: analytic mirror of the ceiling light slots (reflect the view ray off y = G, hit the ceiling plane, test the
  // slot strips) with Schlick Fresnel, plus a faint reflected room glow. Crisp and exact where an env map is blurry.
  const SLOTS_Z = [-2.9, -0.95, 0.95, 2.9];
  const glassMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCeil: { value: G + RH - 0.006 }, uSlots: { value: new THREE.Vector4(...SLOTS_Z) }, uHalfLen: { value: (RW - 2.4) / 2 }, uHalfW: { value: 0.025 },
      uColor: { value: new THREE.Color(1.0, 0.86, 0.68).multiplyScalar(2.4) }, uRoom: { value: new THREE.Color(0.55, 0.36, 0.2) },
      uBox: { value: new THREE.Vector2(RW / 2 - 0.06, RD / 2 - 0.06) }, uFloor: { value: G }, uWall: { value: new THREE.Color(0.62, 0.38, 0.2) } },
    vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uCeil, uHalfLen, uHalfW, uFloor; uniform vec4 uSlots; uniform vec3 uColor, uRoom, uWall; uniform vec2 uBox; varying vec3 vW;
      void main(){
        vec3 V = normalize(vW - cameraPosition), R = reflect(V, vec3(0.0, 1.0, 0.0));
        float fres = 0.04 + 0.96 * pow(1.0 - clamp(-V.y, 0.0, 1.0), 5.0);
        vec3 c = uRoom * 0.05 * fres;
        if (R.y > 0.0) {
          // nearest exit of the reflected ray from the room box: ceiling, or one of the louvered walls
          float tc = (uCeil - vW.y) / R.y;
          float tx = R.x > 0.0 ? (uBox.x - vW.x) / R.x : R.x < 0.0 ? (-uBox.x - vW.x) / R.x : 1e9;
          float tz = R.z > 0.0 ? (uBox.y - vW.z) / R.z : R.z < 0.0 ? (-uBox.y - vW.z) / R.z : 1e9;
          float t = min(tc, min(tx, tz));
          vec3 H = vW + R * t;
          float blur = 0.004 + 0.003 * t;
          if (t == tc) {
            float d = min(min(abs(H.z - uSlots.x), abs(H.z - uSlots.y)), min(abs(H.z - uSlots.z), abs(H.z - uSlots.w)));
            float line = (1.0 - smoothstep(uHalfW, uHalfW + blur, d)) * (1.0 - smoothstep(uHalfLen - 0.05, uHalfLen + 0.05, abs(H.x)));
            c += uColor * line * fres;
          } else {
            float u = (t == tx) ? H.z : H.x;                              // along the wall
            float slat = smoothstep(0.30, 0.30 + blur * 12.0, abs(fract(u / 0.105) - 0.5) * 2.0);   // gaps between slats read dark
            float h = (H.y - uFloor) / (uCeil - uFloor);
            float wash = 0.10 + 1.2 * smoothstep(0.35, 0.95, h) * (1.0 - smoothstep(0.97, 1.0, h));   // bright band under the wall-washers
            c += uWall * (1.0 - slat * 0.7) * wash * fres * 0.38;
          }
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const glassRefl = new THREE.Mesh(glassGeo, glassMat);
  glassRefl.position.y = G + 0.001; glassRefl.renderOrder = 9999; scene.add(glassRefl);   // after the splat, or Spark's blend hides it
  const glassTint = new THREE.Mesh(glassGeo, new THREE.MeshBasicMaterial({ color: 0x0c1a1a, transparent: true, opacity: 0.12, depthWrite: false }));
  glassTint.position.y = G + 0.0008; glassTint.renderOrder = 9998; scene.add(glassTint);

  // walls: dark backing + vertical cedar louvers (instanced), ceiling with linear light slots
  const backing = new THREE.MeshStandardMaterial({ color: 0x120e0b, roughness: 0.95 });
  const wall = (w, h, pos, rotY) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), backing); m.position.set(...pos); m.rotation.y = rotY; scene.add(m); };
  wall(RW, RH, [0, G + RH / 2, -RD / 2], 0); wall(RW, RH, [0, G + RH / 2, RD / 2], Math.PI);
  wall(RD, RH, [-RW / 2, G + RH / 2, 0], Math.PI / 2); wall(RD, RH, [RW / 2, G + RH / 2, 0], -Math.PI / 2);
  const slatGeo = new THREE.BoxGeometry(0.045, RH - 0.02, 0.075);
  const slatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.66 });
  const pitch = 0.105, R = rng(11), slatSpots = [];
  for (let x = -RW / 2 + 0.2; x <= RW / 2 - 0.2; x += pitch) slatSpots.push([x, -RD / 2 + 0.06, 0], [x, RD / 2 - 0.06, 0]);
  for (let z = -RD / 2 + 0.2; z <= RD / 2 - 0.2; z += pitch) slatSpots.push([-RW / 2 + 0.06, z, 1], [RW / 2 - 0.06, z, 1]);
  const slats = new THREE.InstancedMesh(slatGeo, slatMat, slatSpots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  slatSpots.forEach(([a, b, side], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side ? Math.PI / 2 : 0);
    m4.compose(new THREE.Vector3(side ? b : a, G + RH / 2, side ? a : b), q, new THREE.Vector3(1, 1, 1)); slats.setMatrixAt(i, m4);
    const v = 0.85 + R() * 0.3; slats.setColorAt(i, col.setRGB(0.55 * v, 0.34 * v, 0.19 * v, THREE.SRGBColorSpace));
  });
  scene.add(slats);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0d0b09, roughness: 0.9 }));
  ceil.position.y = G + RH; scene.add(ceil);
  const slotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.68).multiplyScalar(2.4), toneMapped: false });
  for (const z of [-2.9, -0.95, 0.95, 2.9]) { const s = new THREE.Mesh(new THREE.BoxGeometry(RW - 2.4, 0.01, 0.05), slotMat); s.position.set(0, G + RH - 0.006, z); scene.add(s); }

  // light: soft warm downlight pools on the timber, wall-washers grazing the louvers, a cool whisper of fill
  scene.add(new THREE.HemisphereLight(0xcfd6e0, 0x2a1d12, 0.22));
  const spot = (pos, target, intensity, angle, penumbra, color = 0xffd2a0, shadow = false) => {
    const s = new THREE.SpotLight(color, intensity, 14, angle, penumbra, 2); s.position.set(...pos); s.target.position.set(...target);
    if (shadow) { s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0005; s.shadow.radius = 4; }
    scene.add(s, s.target); return s;
  };
  for (const [x, z] of [[-PW / 2 - 0.9, -PD / 2 - 0.7], [PW / 2 + 0.9, -PD / 2 - 0.7], [-PW / 2 - 0.9, PD / 2 + 0.8], [PW / 2 + 0.9, PD / 2 + 0.8], [0, PD / 2 + 1.5], [0, -PD / 2 - 1.4], [-2.4, -3.4], [2.4, -3.4], [0, -3.6]]) spot([x, G + RH - 0.1, z], [x, G, z], 13, 0.52, 1.0);
  for (let x = -RW / 2 + 1.2; x < RW / 2 - 1; x += 1.9) spot([x, G + RH - 0.15, -RD / 2 + 0.55], [x, G + 0.4, -RD / 2 + 0.08], 22, 0.42, 0.9, 0xffc98e);
  for (let z = -RD / 2 + 1.3; z < RD / 2 - 1; z += 2.1) { spot([RW / 2 - 0.55, G + RH - 0.15, z], [RW / 2 - 0.08, G + 0.4, z], 18, 0.42, 0.9, 0xffc98e); spot([-RW / 2 + 0.55, G + RH - 0.15, z], [-RW / 2 + 0.08, G + 0.4, z], 18, 0.42, 0.9, 0xffc98e); }
  spot([1.6, G + RH - 0.1, 1.2], [0, 0, 0], 10, 0.55, 1, 0xfff0dc);

  // dust motes drifting in the light above the model (deterministic)
  const N = 520, dpos = new Float32Array(N * 3), seeds = [], DR = rng(23);
  for (let i = 0; i < N; i++) seeds.push([(DR() - 0.5) * (PW + 1.2), G + 0.05 + DR() * 1.25, (DR() - 0.5) * (PD + 1.2), DR() * 6.28, 0.3 + DR() * 0.7]);
  const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(dpos, 3)),
    new THREE.PointsMaterial({ map: softDot(), size: 0.0065, sizeAttenuation: true, color: new THREE.Color(1.0, 0.86, 0.66), transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false; scene.add(dust);
  const updateDust = (t) => {
    for (let i = 0; i < N; i++) { const s = seeds[i]; dpos[i * 3] = s[0] + Math.sin(t * 0.07 * s[4] + s[3]) * 0.25; dpos[i * 3 + 1] = s[1] + Math.sin(t * 0.05 + s[3] * 2) * 0.12 + ((t * 0.006 * s[4]) % 0.4); dpos[i * 3 + 2] = s[2] + Math.cos(t * 0.06 * s[4] + s[3]) * 0.25; }
    dust.geometry.attributes.position.needsUpdate = true;
  };

  // room reflections: PMREM of the room from the pit centre (before the splat is added)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = scene;
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.05, 30, cubeRT); cubeCam.position.set(0, G + 1.5, 1.6);   // viewer height: what the floor mirrors
  glassRefl.visible = glassTint.visible = dust.visible = false; cubeCam.update(renderer, envScene);
  glassRefl.visible = glassTint.visible = dust.visible = true;
  scene.environment = pmrem.fromCubemap(cubeRT.texture).texture; scene.environmentIntensity = 1;
  cubeRT.dispose(); pmrem.dispose();

  // the model splat
  const spark = new SparkRenderer({ renderer }); scene.add(spark);
  const splat = new SplatMesh(src.paged ? { url: src.url, paged: true } : { url: src.url, fileType: src.fileType ?? "ply" });
  await splat.initialized;
  if (src.transform?.position) splat.position.fromArray(src.transform.position);
  if (src.transform?.quaternion) splat.quaternion.fromArray(src.transform.quaternion);
  if (src.transform?.scale != null) splat.scale.setScalar(src.transform.scale);
  scene.add(splat);

  function setLang() { /* the gallery carries no text; the DOM title is localised by the UI */ }
  return { scene, camera, splat, spark, updateDust, setLang, pit: { PW, PD } };
}

/** Resolve the model splat from data/splats/splats.json (P3 contract) -> { url, paged, transform, width, depth, map } | null. */
export async function resolvePortalSplat(fetchJson = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } }) {
  const j = await fetchJson("data/splats/splats.json"), m = j?.model;
  if (m?.rad || m?.load?.url) {
    return { url: m.load?.url ?? "data/splats/" + m.rad, paged: m.load?.paged ?? true, transform: m.transform, width: m.widthMetres ?? 3.06, depth: m.depthMetres ?? 1.76,
      map: m.enu?.scale ? { scale: m.enu.scale, translation: m.enu.translation ?? [0, 0, 0] } : DEFAULT_MAP, title: m.title, portal: m.portal ?? null };
  }
  return null;
}

// ------------------------------------------------------------------ dissolve (the last pass: premultiplied alpha over the city)
const DissolveShader = {
  uniforms: { inputBuffer: { value: null }, uMix: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D inputBuffer; uniform float uMix, uTime; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main(){
      vec4 g = texture2D(inputBuffer, vUv);
      vec3 col = g.rgb; float a = 1.0;
      if (uMix < 0.999) {
        vec2 asp = vec2(uRes.x / uRes.y, 1.0);
        vec2 c = (vUv - vec2(0.5, 0.5)) * asp;
        vec2 q = vUv * asp;
        float grain = n(q * 90.0) * 0.5 + n(q * 31.0) * 0.3 + n(q * 11.0) * 0.2;   // fine, paper-like
        float k = length(c) / 1.02 + (grain - 0.5) * 0.055;
        float edge = (1.0 - uMix) * 1.18 - 0.05;               // the city opens from the centre of the model outward
        a = smoothstep(edge - 0.006, edge + 0.01, k);
        float live = smoothstep(0.0, 0.06, 1.0 - uMix) * smoothstep(0.0, 0.08, uMix);
        float rim = exp(-pow((k - edge) / 0.0075, 2.0)) * live;           // thin hot line
        float halo = exp(-pow((k - edge) / 0.045, 2.0)) * live;           // soft light spilling from it
        vec3 warm = vec3(1.0, 0.851, 0.627);                   // #ffd9a0
        col = col * (1.0 + halo * 0.35 * a) + warm * (rim * 1.1 + halo * 0.18);
        a = clamp(max(a, rim * 0.95 + halo * 0.22), 0.0, 1.0);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
      gl_FragColor = vec4(gl_FragColor.rgb * a, a);
    }`,
};

// ------------------------------------------------------------------ the opening director
/**
 * Start the opening. Creates the gallery canvas over the city canvas, loads the model splat, parks the city camera at
 * the handoff framing (so the first city view streams in while the gallery shows) and waits for dive().
 *   params: portal=hold (gallery only) | at:<s> (freeze the opening at s seconds after the click, QA) | mix:<0..1> (v1)
 *   hooks: { onDive, onEnd, setHours } — UI callbacks and the clock fallback while __RT.setTime is a placeholder.
 * -> { state, dive(), skip(), seek(t), setLang(l), dispose() } also published as __RT.opening.
 */
export async function startOpening({ RT = globalThis.__RT, cityCanvas = document.getElementById("gl"), stops, tour = null, golden = 17 + 5 / 60, param = "1", hooks = {}, opening = OPENING_DEFAULTS, tier = null }) {
  const fly = getFly();
  const gcam = new URLSearchParams(globalThis.location?.search ?? "").get("gcam")?.split(",").map(Number);
  if (gcam?.length >= 6 && gcam.every(Number.isFinite)) opening = { ...opening, idle: { pos: gcam.slice(0, 3), look: gcam.slice(3, 6), fov: gcam[6] || opening.idle.fov } };
  const src = await resolvePortalSplat();
  if (!src || !fly || !stops?.length) return null;
  const map = src.map;

  // canvas + renderer (own context; alpha for the dissolve)
  const canvas = document.createElement("canvas");
  canvas.id = "portal-gl";
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", zIndex: "2", pointerEvents: "none", display: "block" });
  cityCanvas?.after(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance", stencil: false });
  const dpr = Math.min(devicePixelRatio || 1, tier?.name === "low" ? 1 : 1.75);
  renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const gal = await buildGallery({ renderer, src });
  const { scene, camera } = gal;

  // post: render -> depth of field + mipmap bloom -> AgX + vignette -> dissolve (alpha) to screen
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: Math.min(4, renderer.capabilities.maxSamples) });
  composer.addPass(new RenderPass(scene, camera));
  const dof = new DepthOfFieldEffect(camera, { focusDistance: 2.8, focusRange: 1.6, bokehScale: 3.2, resolutionScale: 0.5 });
  const bloom = new BloomEffect({ mipmapBlur: true, intensity: 0.85, luminanceThreshold: 0.72, luminanceSmoothing: 0.25, radius: 0.72 });
  composer.addPass(new EffectPass(camera, dof, bloom));
  composer.addPass(new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX }), new VignetteEffect({ offset: 0.32, darkness: 0.62 })));
  const dissolveMat = new THREE.ShaderMaterial({ ...DissolveShader, uniforms: THREE.UniformsUtils.clone(DissolveShader.uniforms), depthTest: false, depthWrite: false });
  const dissolve = new ShaderPass(dissolveMat, "inputBuffer");
  composer.addPass(dissolve);

  // state
  const S = { state: "gallery", t0: null, t: -1, frozen: null, idleT: 0, revealStarted: false, revealDone: false, ended: false, last: performance.now(), raf: 0, disposed: false };
  const stop0 = stops[0];
  const goldenH = typeof golden === "function" ? golden() : golden;
  let track = openingTrack({ stop: stop0, map, opening });
  const safe = (f) => { try { return f(); } catch { return undefined; } };        // __RT hooks may still be placeholders that throw
  const pub = RT ? (RT.opening = {}) : {};

  // city side: model look at reveal 0, golden hour, camera parked on the handoff framing
  safe(() => RT.reveal.set(0));
  const hoursSet = (h) => { try { RT.setTime(h); } catch { hooks.setHours?.(h); } };
  hoursSet(goldenH);
  const handoffPose = track(track.times.handoff);
  fly.setRails(() => handoffPose, { name: "opening-park", clampGround: false });

  function idlePose(t) {
    const sw = opening.sway, a = Math.sin((t / sw.period) * Math.PI * 2) * sw.yawDeg * (Math.PI / 180);
    const p = opening.idle.pos, l = opening.idle.look;
    const dx = p[0] - l[0], dz = p[2] - l[2];
    return { pos: [l[0] + dx * Math.cos(a) - dz * Math.sin(a), p[1] + Math.sin((t / sw.period) * Math.PI * 4) * sw.bob, l[2] + dx * Math.sin(a) + dz * Math.cos(a)], look: l.slice(), fov: opening.idle.fov };
  }
  function galleryPose(enuPose) { return { pos: enuToGallery(enuPose.pos, map), look: enuToGallery(enuPose.look, map), fov: enuPose.fov }; }

  function frameGallery(p, dt) {
    applyPose(camera, p);
    const focus = Math.hypot(p.look[0] - p.pos[0], p.look[1] - p.pos[1], p.look[2] - p.pos[2]);
    dof.cocMaterial.focusDistance = focus;
    dof.cocMaterial.focusRange = Math.max(0.4, focus * 0.95);
    dof.bokehScale = THREE.MathUtils.clamp(focus * 0.55, 0.8, 2.6);
    gal.updateDust(S.idleT);
    composer.render(dt);
  }

  function startReveal() {
    if (S.revealStarted) return; S.revealStarted = true;
    tourEvents.emit("reveal:start", { center: PIER7, duration: TIMELINE.reveal * 1000 });
    const done = () => { if (!S.revealDone) { S.revealDone = true; tourEvents.emit("reveal:end", {}); } };
    if (S.frozen != null) return;                               // QA freeze: reveal driven by seek()
    let p = null; try { p = RT.reveal.play({ duration: TIMELINE.reveal * 1000 }); } catch { p = null; }
    if (p?.then) p.then(done, done); else setTimeout(done, TIMELINE.reveal * 1000);
  }
  function revealProgress(t) { return smootherstep((t - TIMELINE.dive) / TIMELINE.reveal); }

  function finish() {
    if (S.ended) return; S.ended = true; S.state = "done";
    tourEvents.emit("opening:end", {});
    if (tour) tour.goto(0, { instant: true }); else fly.setRails(null);
    hooks.onEnd?.();
    dispose();
  }

  const times = [];                                              // gallery frame times (ms), rolling median -> __RT.opening.frameMs
  function step(now) {
    if (S.disposed) return;
    const dt = Math.min(0.1, (now - S.last) / 1000); S.last = now;
    S.idleT += dt;
    times.push(dt * 1000); if (times.length > 180) times.shift();
    if (times.length > 20 && times.length % 10 === 0) { const so = [...times].sort((a, b) => a - b); pub.frameMs = +so[so.length >> 1].toFixed(2); pub.frameP90 = +so[Math.floor(so.length * 0.9)].toFixed(2); }
    if (S.state === "gallery") { frameGallery(idlePose(S.idleT), dt); pub.t = -1; }
    else if (S.state === "dive" || S.state === "reveal" || S.state === "settle") {
      const t = S.frozen ?? (now - S.t0) / 1000; S.t = t; pub.t = t;
      const p = track(Math.min(t, track.times.end));
      const mix = mixOverride ?? dissolveAt(t);
      dissolveMat.uniforms.uMix.value = mix; dissolveMat.uniforms.uTime.value = t;
      if (mix > 0) { canvas.style.visibility = "visible"; frameGallery(galleryPose(p), dt); }
      else if (canvas.style.visibility !== "hidden") { canvas.style.visibility = "hidden"; tourEvents.emit("opening:handoff", { t }); }
      if (t >= TIMELINE.dive && S.state === "dive") { S.state = "reveal"; startReveal(); }
      if (S.frozen != null && t >= TIMELINE.dive) safe(() => RT.reveal.set(revealProgress(t)));
      if (S.state === "reveal" && t >= track.times.revealEnd) S.state = "settle";
      if (S.frozen == null && t >= track.times.end) { finish(); return; }
    }
    pub.state = S.state;
    S.raf = requestAnimationFrame(step);
  }

  /** The visitor pressed 模型の中へ. The track starts from the current idle pose so the move begins without a jump. */
  function dive() {
    if (S.state !== "gallery") return;
    const g = idlePose(S.idleT);
    track = openingTrack({ stop: stop0, map, opening, from: g });
    S.state = "dive"; S.t0 = performance.now();
    fly.setRails(() => track(Math.min((S.frozen ?? (performance.now() - S.t0) / 1000), track.times.end)), { name: "opening", clampGround: false });
    tourEvents.emit("opening:dive", { duration: TIMELINE.dive });
    hooks.onDive?.();
  }
  /** Freeze the opening at t seconds after the click (QA stills). t < 0 shows the gallery. */
  function seek(t) {
    if (t < 0) { S.state = "gallery"; S.frozen = null; return; }
    S.frozen = t; if (S.state === "gallery") { track = openingTrack({ stop: stop0, map, opening, from: idlePose(0) }); S.idleT = 0; S.state = "dive"; S.t0 = performance.now(); fly.setRails(() => track(Math.min(S.frozen ?? 0, track.times.end)), { name: "opening", clampGround: false }); }
    S.state = t < TIMELINE.dive ? "dive" : t < track.times.revealEnd ? "reveal" : "settle";
    if (t >= TIMELINE.dive) { S.revealStarted = true; safe(() => RT.reveal.set(revealProgress(t))); } else safe(() => RT.reveal.set(0));
  }
  function skip() { S.frozen = null; safe(() => RT.reveal.set(1)); if (S.state === "gallery") hooks.onDive?.(); finish(); }
  function resize() { renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); dissolveMat.uniforms.uRes.value.set(innerWidth * dpr, innerHeight * dpr); }
  addEventListener("resize", resize); resize();
  function dispose() {
    if (S.disposed) return; S.disposed = true; cancelAnimationFrame(S.raf); removeEventListener("resize", resize);
    try { gal.splat.dispose?.(); composer.dispose(); renderer.dispose(); renderer.forceContextLoss(); } catch { /* ignore */ }
    canvas.remove();
  }

  /** Dev/QA: change the idle gallery framing live (gallery metres). */
  const setIdle = (idle) => { opening = { ...opening, idle: { ...opening.idle, ...idle } }; };
  let mixOverride = null;
  /** QA: force the dissolve (1 = gallery only, 0 = city only, null = timeline). */
  const debugMix = (m) => { mixOverride = m; };
  Object.assign(pub, { state: S.state, t: -1, dive, skip, seek, setIdle, debugMix, setLang: gal.setLang, times: { ...TIMELINE, end: track.times.end }, toJSON() { return { state: S.state, t: S.t, frameMs: pub.frameMs ?? null }; } });
  tourEvents.emit("opening:gallery", {});
  // params
  if (param.startsWith("at:")) seek(+param.slice(3) || 0);
  else if (param.startsWith("mix:")) seek(TIMELINE.dissolve[0] + (1 - THREE.MathUtils.clamp(+param.slice(4) || 0.5, 0, 1)) * (TIMELINE.dissolve[1] - TIMELINE.dissolve[0]));
  S.last = performance.now(); S.raf = requestAnimationFrame(step);
  return { get state() { return S.state; }, get t() { return S.t; }, dive, skip, seek, setLang: gal.setLang, dispose, canvas, splat: gal.splat, scene, camera, map };
}
