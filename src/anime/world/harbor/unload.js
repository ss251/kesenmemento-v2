// [v3:fix] The skipjack unloading scene beside the hero arrival berth (V3-SPEC wow frame 3: "a skipjack boat unloading:
// fish boxes, forklifts, people in rubber aprons"). On the market apron next to the central arrival slot (the berth
// point nearest HB = (669, 847), where today's first katsuo boats tie up): rows of blue fish-box stacks, tubs, two
// parked forklifts with loads, a conveyor from the boat's rail, skipjack laid out on blue sheets for the auction, a
// weighing scale and hoses. It publishes crew spots (market.crew) where life puts eight workers in rubber aprons.
import * as THREE from 'three';
import { hmats, boxStack, tub } from './props.js';
import { FONT, mapMat } from './util.js';

export const UNLOAD_AT = { x: 669, z: 847 };

export function buildUnloadScene(ctx, market, opts = {}) {
  const M = hmats(ctx);
  const r = ctx.rng('unload-scene');
  // the market berth whose quay edge passes nearest the hero slot
  let best = null;
  for (const b of market?.berths || []) {
    const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    const t = Math.max(0, Math.min(l, (UNLOAD_AT.x - b.a[0]) * ux + (UNLOAD_AT.z - b.a[1]) * uz));
    const px = b.a[0] + ux * t, pz = b.a[1] + uz * t, d = Math.hypot(UNLOAD_AT.x - px, UNLOAD_AT.z - pz);
    if (!best || d < best.d) best = { d, px, pz, ux, uz, top: b.top ?? 1.8 };
  }
  if (!best || best.d > 60) return null;
  // frame: +X toward the water (the side the boat is on), +Z along the quay
  let nx = best.uz, nz = -best.ux;
  if ((UNLOAD_AT.x - best.px) * nx + (UNLOAD_AT.z - best.pz) * nz < 0) { nx = -nx; nz = -nz; }
  const g = new THREE.Group(); g.name = 'unload-scene';
  g.position.set(best.px, 0, best.pz);
  g.rotation.y = Math.atan2(-nz, nx);   // local +X -> (nx, nz)
  ctx.addStatic(g); g.updateMatrixWorld(true);
  const k = ctx.kit(g), top = best.top;
  const toW = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
  // sanity: local +X really points at the water
  { const w = toW(6, 0, 0); if (!ctx.L.isWater(w.x, w.z)) { g.rotation.y += Math.PI; g.updateMatrixWorld(true); } }

  // skipjack laid out on blue sheets (auction rows)
  // [v3:polish3] real 3D fish (the painted decal read as pale grey ovals on a blue mat: the silver belly covered the dark
  // back): per sheet 60 instanced skipjack, 0.65 m long, lying on their side in five columns, a navy back, a silver
  // belly with the dark lengthwise stripes of 鰹, a white eye and a forked tail
  const sheetTex = ctx.tex.draw(256, 128, (x, w, h) => {
    x.fillStyle = '#3d6fb0'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#34609c'; for (let i = 1; i < 4; i++) x.fillRect(0, i * h / 4 - 1, w, 2);   // folds
    x.fillStyle = 'rgba(255,255,255,0.10)'; for (let i = 0; i < 7; i++) x.fillRect(12 + i * 37, 0, 6, h);   // wet sheen
  }, { key: 'fix-unload-sheet' });
  const sheetM = mapMat(ctx, 'toon', '#ffffff', sheetTex, { paint: 0.02 });
  const fishM = skipjackMaterial(ctx);
  const tailM = ctx.mat.toon('#1f2a48', { paint: 0, side: 'double' });
  const sheets = [[-7.2, -6, 0], [-7.2, 1.5, 0], [-11.5, -2.5, 0.02]];
  const PER = 60, fishN = sheets.length * PER;
  const bodyI = new THREE.InstancedMesh(G_FISH_BODY(), fishM, fishN), tailI = new THREE.InstancedMesh(G_FISH_TAIL(), tailM, fishN);
  bodyI.name = 'unload-skipjack'; tailI.name = 'unload-skipjack-tails';
  {
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Qs = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), tint = new THREE.Color();
    let n = 0;
    for (const [sx, sz, rot] of sheets) {
      const p = k.plane(6.4, 3.2, sheetM, [sx, top + 0.02, sz], [-Math.PI / 2, 0, rot]); p.receiveShadow = true;
      for (let c = 0; c < 5; c++) for (let j = 0; j < 12; j++) {
        const fx = sx - 2.5 + c * 1.25 + r.range(-0.04, 0.04), fz = sz - 1.32 + j * 0.24 + r.range(-0.02, 0.02);
        const flip = c % 2 ? Math.PI : 0;   // heads alternate by column, like a real auction row
        // lying on its side (flank up): roll 90 deg about the long axis, then a small yaw jitter
        Q.setFromEuler(E.set(0, flip - rot + r.range(-0.07, 0.07), 0)); Qs.setFromEuler(E.set(Math.PI / 2, 0, 0)); Q.multiply(Qs);
        const sc = r.range(0.9, 1.08);
        P.set(fx, top + 0.02 + 0.075 * sc, fz); S.set(sc, sc, sc);
        M4.compose(P, Q, S); bodyI.setMatrixAt(n, M4); tailI.setMatrixAt(n, M4);
        bodyI.setColorAt(n, tint.setScalar(r.range(0.88, 1.0)));
        n++;
      }
    }
    for (const m of [bodyI, tailI]) { m.instanceMatrix.needsUpdate = true; m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m); }
    if (bodyI.instanceColor) bodyI.instanceColor.needsUpdate = true;
  }
  // blue box stacks: two rows along the quay, some white and orange
  for (let i = 0; i < 9; i++) boxStack(k, M, -3.2 - (i % 2) * 0.8, top, -13 + i * 1.1, { n: r.int(3, 7), color: i % 5 === 3 ? 'white' : 'blue', rotY: r.range(-0.08, 0.08), lean: 0.02 });
  for (let i = 0; i < 6; i++) boxStack(k, M, -14.8, top, -10 + i * 0.95, { n: r.int(4, 8), color: i === 2 ? 'orange' : 'blue', rotY: r.range(-0.06, 0.06), lean: 0.02 });
  // tubs with ice and fish (a white rim reads as ice)
  for (let i = 0; i < 5; i++) tub(k, M, -4.4 - (i % 2) * 1.6, top, 6 + i * 1.5, r.range(-0.1, 0.1));
  // conveyor from the boat's rail down to the apron
  {
    const frame = ctx.mat.toon('#d5d8d4', { paint: 0.02 }), belt = ctx.mat.toon('#4a4e58', { paint: 0 });
    const len = 6.5, ang = -0.26, cx = 0.6, cy = top + 1.5;
    k.box(len, 0.22, 0.8, frame, [cx, cy, -1.2], [0, 0, ang]);
    k.box(len, 0.05, 0.62, belt, [cx, cy + 0.13, -1.2], [0, 0, ang]);
    for (const s of [-0.36, 0.36]) k.box(0.08, 1.2, 0.08, frame, [-2.1, top + 0.6, -1.2 + s]);
    for (let i = 0; i < 4; i++) {   // [v3:polish3] the same skipjack riding the belt, upright
      const t = -len / 2 + 0.9 + i * 1.4, at = [cx + Math.cos(ang) * t, cy + 0.2 + Math.sin(ang) * t, -1.2 + (i % 2 ? 0.1 : -0.1)];
      k.mesh(G_FISH_BODY(), fishM, at, [0, 0, ang]); k.mesh(G_FISH_TAIL(), tailM, at, [0, 0, ang]);
    }
  }
  // a platform scale (はかり) with a digital head, hoses, a pallet
  {
    const steel = ctx.mat.toon('#aeb5bb', { paint: 0.02 }), dark = ctx.mat.toon('#3f414b', { paint: 0 });
    k.box(1.5, 0.1, 1.5, steel, [-9.8, top + 0.05, 6.2]);
    k.box(0.08, 1.1, 0.08, steel, [-10.5, top + 0.6, 6.9]);
    k.box(0.5, 0.35, 0.12, ctx.mat.emissive('#b9f2c4', 0.95), [-10.5, top + 1.25, 6.9]);
    k.box(0.56, 0.4, 0.1, dark, [-10.5, top + 1.25, 6.84]);
    tub(k, M, -9.8, top + 0.1, 6.2, 0.05);
    const hose = ctx.mat.toon('#e9c24a', { paint: 0 });
    for (let i = 0; i < 3; i++) k.mesh(G_HOSE(), hose, [-6.5, top + 0.04, -12 + i * 0.1], [Math.PI / 2, 0, 0], [1 - i * 0.18, 1 - i * 0.18, 1]);
    k.box(1.2, 0.14, 1.0, ctx.mat.toon('#8a6446', { paint: 0.06 }), [-12.4, top + 0.07, 5.2]);
    boxStack(k, M, -12.4, top + 0.14, 5.2, { n: 5, color: 'blue' });
  }
  // two parked forklifts, mid-task (one carrying a tub, one with a pallet of boxes)
  const fls = [];
  for (const [x, z, rot, col, load] of [[-7.5, 10.8, Math.PI * 0.95, '#e38b2f', 'tub'], [-11.8, -9.5, Math.PI * 0.35, '#e9c24a', 'boxes']]) {
    const f = forklift(ctx, M, col, load);
    f.position.set(x, top, z); f.rotation.y = rot; g.add(f); fls.push(f);
  }
  // [v3:polish] a warm fill under the canopy (the ceiling lamps + light bounced off the wet apron): the unloading
  // frame was flat grey in the canopy's shade. One point light, no shadows, off on the low tier.
  if (ctx.quality?.name !== 'low' && opts.fill !== false) {
    const fill = new THREE.PointLight('#ffd7a8', 14, 22, 0.8);
    const fp = toW(-7, top + 3.6, -2); fill.position.copy(fp); fill.castShadow = false; fill.name = 'unload-fill';
    ctx.scene.add(fill);
  }
  // crew spots (life seats workers here): at the conveyor, the fish rows, the tubs, the scale, by the boxes
  const crew = [
    [-2.4, -2.0, 90, 'work'], [-2.6, -0.2, 110, 'work'], [-6.2, -3.5, 180, 'bend'], [-8.4, -1.2, 0, 'bend'],
    [-5.6, 4.6, 200, 'carry'], [-9.0, 5.2, -60, 'watch'], [-10.3, 1.8, 40, 'write'], [-5.4, -9.8, 150, 'carry'],
  ].map(([x, z, yawDeg, pose]) => { const w = toW(x, top, z); return { x: w.x, y: top, z: w.z, rotY: g.rotation.y + yawDeg * Math.PI / 180, pose }; });
  if (ctx.physics?.addBox) {
    const c1 = toW(-3.6, 0, -8.6); ctx.physics.addBox(c1.x, c1.z, 1.8, 10.4, g.rotation.y, top, top + 1.8);
    const c2 = toW(-14.8, 0, -7.6); ctx.physics.addBox(c2.x, c2.z, 0.8, 6.2, g.rotation.y, top, top + 2.0);
    for (const f of fls) { const w = new THREE.Vector3(); f.getWorldPosition(w); ctx.physics.addBox(w.x, w.z, 1.3, 3.4, f.rotation.y + g.rotation.y, top, top + 2.4); }
  }
  return { crew, at: { x: best.px, z: best.pz }, rotY: g.rotation.y };
}

let _fishB = null, _fishT = null, _hose = null;
/** Skipjack body, 0.65 m long along X (head +X), 0.18 m deep along Y (back +Y), 0.15 m thick: the sphere's UV v runs
 *  back -> belly and u round the body (u 0.5 = the snout), which skipjackMaterial's texture paints. */
function G_FISH_BODY() { return _fishB || (_fishB = new THREE.SphereGeometry(0.1, 14, 10).scale(3.25, 0.9, 0.75)); }
/** Forked tail + a small dorsal fin (flat, double sided), in the same fish frame. */
function G_FISH_TAIL() {
  if (_fishT) return _fishT;
  const v = [
    -0.3, 0, 0, -0.43, 0.12, 0, -0.38, 0, 0,  -0.3, 0, 0, -0.38, 0, 0, -0.43, -0.12, 0,   // the fork
    0.02, 0.085, 0, -0.1, 0.085, 0, -0.06, 0.15, 0,                                   // first dorsal fin
  ];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
  return (_fishT = g);
}
function skipjackMaterial(ctx) {
  const tex = ctx.tex.draw(128, 64, (x, w, h) => {
    // canvas top = the sphere's north pole = the fish's back
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#141b33'); gr.addColorStop(0.42, '#1c2440'); gr.addColorStop(0.5, '#56607a'); gr.addColorStop(0.56, '#aeb8c8'); gr.addColorStop(1, '#c9d1dc');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#3a4666'; x.lineWidth = 2.5;   // the lengthwise belly stripes of 鰹
    for (const y of [0.64, 0.73, 0.82]) { x.beginPath(); x.moveTo(0, y * h); x.lineTo(w, y * h); x.stroke(); }
    // eyes just behind the snout on both flanks (u 0.5 +- 0.055), a white dot with a dark pupil
    for (const u of [0.445, 0.555]) { x.fillStyle = '#ffffff'; x.beginPath(); x.arc(u * w, 0.46 * h, 2.6, 0, Math.PI * 2); x.fill(); x.fillStyle = '#10131f'; x.beginPath(); x.arc(u * w, 0.46 * h, 1.2, 0, Math.PI * 2); x.fill(); }
  }, { key: 'polish3-skipjack' });
  return mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0 });
}
function G_HOSE() { return _hose || (_hose = new THREE.TorusGeometry(0.45, 0.035, 5, 18)); }

function forklift(ctx, M, color, load) {
  const g = new THREE.Group(); g.name = 'forklift-parked';
  const k = ctx.kit(g);
  const body = ctx.mat.toon(color, { paint: 0.03 }), dark = ctx.mat.toon('#3f414b', { paint: 0 });
  k.rbox(1.1, 0.8, 2.2, 0.12, body, [0, 0.75, -0.2]);
  k.rbox(1.05, 0.7, 0.6, 0.12, body, [0, 1.0, -1.2]);
  // [v3:polish] a slim overhead guard (the 1.1 x 1.4 roof hid the mast: the forklift read as a black table), a grey
  // steel mast with cross bars and a carriage plate, and the load sitting on the fork tines
  const steel = ctx.mat.toon('#5d6370', { paint: 0.02 });
  // open overhead guard: rear posts upright, front posts raked forward, a slim frame with slats (never a solid plate)
  for (const x of [-0.42, 0.42]) {
    k.box(0.05, 1.2, 0.05, dark, [x, 1.75, -0.62]);
    k.box(0.05, 1.24, 0.05, dark, [x, 1.73, 0.26], [-0.2, 0, 0]);
    k.box(0.05, 0.05, 1.0, dark, [x, 2.35, -0.15]);
  }
  for (const z of [-0.6, -0.3, 0.0, 0.3]) k.box(0.9, 0.035, 0.05, dark, [0, 2.36, z]);
  // seat, steering column and wheel, a rear counterweight hump
  k.rbox(0.46, 0.14, 0.42, 0.05, dark, [0, 1.26, -0.4]); k.rbox(0.44, 0.42, 0.1, 0.04, dark, [0, 1.48, -0.64]);
  k.box(0.05, 0.5, 0.05, dark, [0, 1.35, 0.22], [-0.5, 0, 0]);
  k.mesh(G_HOSE(), dark, [0, 1.62, 0.1], [Math.PI / 2 - 0.5, 0, 0], [0.42, 0.42, 1.2]);
  k.rbox(1.1, 0.5, 0.45, 0.16, body, [0, 1.2, -1.28]);
  for (const x of [-0.35, 0.35]) k.box(0.1, 2.5, 0.12, steel, [x, 1.3, 1.05]);
  for (const y of [0.35, 1.5, 2.5]) k.box(0.8, 0.08, 0.1, steel, [0, y, 1.05]);
  k.box(0.8, 0.45, 0.06, steel, [0, 0.68, 1.14]);
  for (const x of [-0.3, 0.3]) k.box(0.1, 0.05, 1.1, dark, [x, 0.42, 1.6]);
  if (load === 'tub') tub(k, M, 0, 0.445, 1.6, 0);
  else { k.box(1.1, 0.12, 1.0, ctx.mat.toon('#8a6446', { paint: 0.06 }), [0, 0.505, 1.6]); boxStack(k, M, -0.25, 0.565, 1.6, { n: 4, color: 'blue', rotY: Math.PI / 2 }); boxStack(k, M, 0.28, 0.565, 1.6, { n: 3, color: 'blue', rotY: Math.PI / 2 }); }
  const wg = G_WHEEL();
  for (const x of [-0.55, 0.55]) for (const z of [0.7, -1.0]) k.mesh(wg, dark, [x, 0.3, z]);
  return g;
}
let _wheel = null;
function G_WHEEL() { return _wheel || (_wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).rotateZ(Math.PI / 2)); }
void FONT;
