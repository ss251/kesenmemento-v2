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

  // skipjack laid out on blue sheets (auction rows): a painted decal on the apron
  const fishTex = ctx.tex.draw(512, 256, (x, w, h) => {
    x.fillStyle = '#3d6fb0'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#35609a'; for (let i = 0; i < 6; i++) x.fillRect(0, i * 43, w, 3);
    for (let row = 0; row < 6; row++) for (let i = 0; i < 9; i++) {
      const cx = 30 + i * 54 + (row % 2) * 12, cy = 22 + row * 43;
      x.save(); x.translate(cx, cy); x.rotate((row % 2 ? 0.08 : -0.08));
      x.fillStyle = '#2f3a57'; x.beginPath(); x.ellipse(0, -2, 24, 8, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#d7dde6'; x.beginPath(); x.ellipse(0, 3, 21, 5, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#6d7b97'; x.lineWidth = 1.5; for (let j = -1; j <= 1; j++) { x.beginPath(); x.moveTo(-12, 3 + j * 2.2); x.lineTo(14, 3 + j * 2.2); x.stroke(); }
      x.fillStyle = '#2f3a57'; x.beginPath(); x.moveTo(-24, -1); x.lineTo(-33, -8); x.lineTo(-33, 6); x.fill();
      x.restore();
    }
  }, { key: 'fix-unload-fish' });
  const fishM = mapMat(ctx, 'decal', '#ffffff', fishTex, { transparent: false });
  for (const [x, z, rot] of [[-7.2, -6, 0], [-7.2, 1.5, 0], [-11.5, -2.5, 0.02]]) {
    const p = k.plane(3.2, 6.4, fishM, [x, top + 0.02, z], [-Math.PI / 2, 0, Math.PI / 2 + rot]); p.receiveShadow = true;
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
    const fish = ctx.mat.toon('#56627e', { paint: 0 });
    for (let i = 0; i < 4; i++) { const t = -len / 2 + 0.9 + i * 1.4; k.mesh(G_FISH(), fish, [cx + Math.cos(ang) * t, cy + 0.24 + Math.sin(ang) * t, -1.2 + (i % 2 ? 0.1 : -0.1)], [0, 0, ang], [3.4, 1, 1.1]); }
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
  // crew spots (life seats workers here): at the conveyor, the fish rows, the tubs, the scale, by the boxes
  const crew = [
    [-2.4, -2.0, 90, 'work'], [-2.6, -0.2, 110, 'work'], [-6.2, -3.5, 180, 'bend'], [-8.4, -1.2, 0, 'bend'],
    [-5.6, 4.6, 200, 'carry'], [-9.0, 5.2, -60, 'watch'], [-10.3, 1.8, 40, 'write'], [-4.2, -9.8, 150, 'carry'],
  ].map(([x, z, yawDeg, pose]) => { const w = toW(x, top, z); return { x: w.x, y: top, z: w.z, rotY: g.rotation.y + yawDeg * Math.PI / 180, pose }; });
  if (ctx.physics?.addBox) {
    const c1 = toW(-3.6, 0, -8.6); ctx.physics.addBox(c1.x, c1.z, 1.8, 10.4, g.rotation.y, top, top + 1.8);
    const c2 = toW(-14.8, 0, -7.6); ctx.physics.addBox(c2.x, c2.z, 0.8, 6.2, g.rotation.y, top, top + 2.0);
    for (const f of fls) { const w = new THREE.Vector3(); f.getWorldPosition(w); ctx.physics.addBox(w.x, w.z, 1.3, 3.4, f.rotation.y + g.rotation.y, top, top + 2.4); }
  }
  return { crew, at: { x: best.px, z: best.pz }, rotY: g.rotation.y };
}

let _fish = null, _hose = null;
function G_FISH() { return _fish || (_fish = new THREE.SphereGeometry(0.1, 8, 6)); }
function G_HOSE() { return _hose || (_hose = new THREE.TorusGeometry(0.45, 0.035, 5, 18)); }

function forklift(ctx, M, color, load) {
  const g = new THREE.Group(); g.name = 'forklift-parked';
  const k = ctx.kit(g);
  const body = ctx.mat.toon(color, { paint: 0.03 }), dark = ctx.mat.toon('#3f414b', { paint: 0 });
  k.rbox(1.1, 0.8, 2.2, 0.12, body, [0, 0.75, -0.2]);
  k.rbox(1.05, 0.7, 0.6, 0.12, body, [0, 1.0, -1.2]);
  k.box(0.5, 0.1, 0.5, dark, [0, 1.25, -0.3]);
  for (const x of [-0.5, 0.5]) for (const z of [-0.8, 0.5]) k.box(0.06, 1.2, 0.06, dark, [x, 1.75, z]);
  k.box(1.1, 0.06, 1.4, dark, [0, 2.35, -0.15]);
  for (const x of [-0.35, 0.35]) k.box(0.1, 2.4, 0.12, dark, [x, 1.3, 1.05]);
  for (const x of [-0.3, 0.3]) k.box(0.1, 0.05, 1.1, dark, [x, 0.42, 1.6]);
  if (load === 'tub') tub(k, M, 0, 0.45, 1.65, 0);
  else { k.box(1.1, 0.12, 1.0, ctx.mat.toon('#8a6446', { paint: 0.06 }), [0, 0.5, 1.65]); boxStack(k, M, -0.25, 0.56, 1.65, { n: 4, color: 'blue', rotY: Math.PI / 2 }); boxStack(k, M, 0.28, 0.56, 1.65, { n: 3, color: 'blue', rotY: Math.PI / 2 }); }
  const wg = G_WHEEL();
  for (const x of [-0.55, 0.55]) for (const z of [0.7, -1.0]) k.mesh(wg, dark, [x, 0.3, z]);
  return g;
}
let _wheel = null;
function G_WHEEL() { return _wheel || (_wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).rotateZ(Math.PI / 2)); }
void FONT;
