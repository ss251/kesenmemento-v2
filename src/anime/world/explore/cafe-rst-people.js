// [cafe-rst] The people of café RST: the town's own anime figures (life/characters, the Sakuragaoka Station kit that every townsperson is
// built from: painted faces, hair, outfits), not stand-ins. They are invented people, never likenesses of anyone in the shop or its video:
// a barista behind the counter, a woman on a counter stool, a man at the street window, a woman at the dining table. Each is a seeded
// look from the cast's own presets with an outfit chosen for the room, posed by the cast's driver (planted-foot leg IK, arm IK to the
// counter), breathing, blinking and looking about; the room's warm lift is on their materials too.
//
// Cost (measured in test/cafe-rst.test.js): one skinned mesh each (about 5.6 k triangles), one 512 px atlas each (two for the barista, who
// blinks), so about 22 k triangles and 6.7 MB of phone texture for the four; they update only while the camera is within 30 m.
import * as THREE from 'three';
import { Human } from '../life/characters/human.js';
import { Driver, rotMul } from '../life/characters/anim.js';
import { LOOKS } from '../life/cast.js';
import * as gear from '../life/characters/gear.js';

/** The cast: where each sits or stands (room frame, metres), which way they face (room direction), the pose, what they look at (room x, y,
 *  height) and a footprint (x0, x1, y0, y1) for the layout record. */
export const PEOPLE = Object.freeze([
  { id: 'barista', x: 1.05, y: 3.3, face: [1, 0], pose: 'counter', look: [2.35, 3.2, 1.3], note: [0.8, 1.3, 3.05, 3.55] },
  { id: 'customer-stool', x: 2.35, y: 3.2, face: [-1, 0], pose: 'stool', look: [1.05, 3.3, 1.55], note: [2.1, 2.65, 2.95, 3.45] },
  { id: 'customer-window', x: 4.55, y: 1.05, face: [0, -1], pose: 'window', look: [4.55, -6, 1.5], note: [4.3, 4.8, 0.8, 1.3] },
  { id: 'customer-table', x: 6.0, y: 5.0, face: [0, -1], pose: 'chair', look: [5.7, 4.2, 0.85], note: [5.7, 6.3, 4.7, 5.3] },
]);

// The seated poses: seat top, foot height above the floor (rail 0.29 for the counter stools), how far forward the feet and the hands go
// (metres at the figure's scale), the forward lean of the spine and the height of the surface the hands rest on.
export const SIT = {
  stool: { seat: 0.745, rail: 0.29, footZ: 0.3, lean: 0.3, top: 1.03, reach: 0.45 },       // the counter stools (rebar rail at 0.29, counter top 1.0)
  window: { seat: 0.665, rail: 0, footZ: 0.24, lean: 0.2, top: 0.89, reach: 0.44 },          // the window stools (counter top 0.86)
  chair: { seat: 0.47, rail: 0, footZ: 0.4, lean: 0.14, top: 0.75, reach: 0.36, back: 0 },            // the dining chairs (table 0.72)
};

/** Seeded looks from the cast's presets with an outfit for the room (the cast's own spec shapes: life/cast.js LOOKS). */
function specs(ctx) {
  const r = ctx.rng('cafe-rst-people');
  const sneaker = (color) => ({ color, sole: '#d3cec6', type: 'sneaker' });
  const out = {};
  { const s = LOOKS.townMan(r, 1);       // the barista: rolled shirtsleeves, a dark apron
    Object.assign(s, { key: 'cafe-barista', seed: 931, height: 1.72, props: [], variants: ['open', 'blink'] });
    s.outfit = { top: 'shirt', topColor: '#dde6ee', collar: '#dde6ee', rolled: true, tucked: true, bottom: 'trousers', bottomColor: '#2f3340', belt: '#3b3a40',
      apron: { color: '#4b3427', strap: '#3a281d', hem: 0.42 }, shoes: sneaker('#35353b') };
    out.barista = s; }
  { const s = LOOKS.townWoman(r, 0);     // the woman on the counter stool: a sweater and trousers
    Object.assign(s, { key: 'cafe-guest-a', seed: 932, height: 1.58, props: [], variants: ['open'] });
    s.outfit = { top: 'sweater', topColor: '#9db4a0', band: '#8ba28e', bottom: 'trousers', bottomColor: '#6f7f95', belt: '#5a4a44', shoes: sneaker('#e4e1db') };   // sage: a beige sweater reads as bare skin from behind
    out['customer-stool'] = s; }
  { const s = LOOKS.townMan(r, 2);       // the man at the window: a knit and glasses
    Object.assign(s, { key: 'cafe-guest-b', seed: 933, height: 1.74, props: [(hh) => gear.glasses(hh, { color: '#5b4a46' })], variants: ['open'] });
    s.outfit = { top: 'sweater', topColor: '#8fa6bf', band: '#7f95ad', shirtCollar: '#eeebe4', bottom: 'trousers', bottomColor: '#4c5566', shoes: sneaker('#e4e1db') };
    out['customer-window'] = s; }
  { const s = LOOKS.townWoman(r, 2);     // the woman at the table: long hair, a blouse
    Object.assign(s, { key: 'cafe-guest-c', seed: 934, height: 1.6, props: [], variants: ['open'] });
    s.outfit = { top: 'blouse', topColor: '#f1ece2', collar: '#f1ece2', tucked: true, bottom: 'trousers', bottomColor: '#8c7b6b', belt: '#5a4a44', shoes: sneaker('#e4e1db') };
    out['customer-table'] = s; }
  return out;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();

/**
 * Build and register the people. `F` is the room's placement frame (F.g the group, turned to the room), `FY` the floor's height, `warm`
 * the room's self-light colour (the same lift as every toon surface of the room). Returns { people, pose(p, t, dt), update, world } for
 * the tests; the per-frame update is registered on the context.
 */
export function buildCafePeople(ctx, F, { FY, warm }) {
  const sp = specs(ctx), people = [];
  const world = (x, y, z, out = new THREE.Vector3()) => out.set(x, FY + z, -y).applyMatrix4(F.g.matrixWorld);   // room (x, y, height) -> world
  const rotY = ([dx, dy]) => Math.atan2(dx, -dy);                  // the figure's front (+z) toward the room direction
  for (const c of PEOPLE) {
    const spec = sp[c.id], h = new Human(ctx, spec), d = new Driver(ctx, h, { seed: spec.seed });
    h.group.traverse((o) => { o.userData.dynamic = true; o.userData.noBatch = true; if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    for (const m of Object.values(h.mats)) m.emissive.set(warm);
    F.g.add(h.group);
    people.push({ ...c, spec, h, d, rot: rotY(c.face) });
  }

  /** Pose one person at time t (deterministic in t; dt only eases the head). */
  function pose(p, t, dt) {
    const { h, d } = p, k = h.P.k, ank = h.P.ankle, fx = h.P.hipJx * 1.12, sw = Math.sin(t * 0.33 + p.spec.seed);
    d.place(p.x, FY, -p.y, p.rot); d.reset();
    const look = world(...p.look, _d);
    let handL, handR, poleL, poleR;
    if (p.pose === 'counter') {                                     // behind the counter: weight on one leg, leaning to the top, one hand on a cup, one on the top
      d.stand({ hx: 0.012 * sw, hrz: 0.014 * sw, stance: 1.2, footL: [fx, ank, 0.03 * k], footR: [-fx * 1.1, ank, -0.03 * k] });
      d.breathe(t); rotMul(h.b.spine, 0.1, 0, 0.012 * sw);
      h.group.updateMatrixWorld(true);
      handR = d.W(-0.14 * k, 1.045, (0.36 + 0.025 * Math.sin(t * 0.9)) * k, _a); poleR = d.W(-0.42 * k, 1.0, -0.04 * k, _b);
      handL = d.W(0.17 * k, 1.045, 0.33 * k, _c); poleL = d.W(0.44 * k, 1.0, -0.04 * k, _e);
      look.lerp(d.W(-0.1 * k, 1.0, 0.35 * k, _f), (0.5 + 0.5 * Math.sin(t * 0.4 + 1.3)) * 0.55);   // now and then a glance down at the work
    } else {                                                        // seated: the pelvis on the seat, the thighs forward, the feet on the rail or the floor
      const s = SIT[p.pose], footY = s.rail ? s.rail + ank : ank, footZ = s.footZ * k;
      d.stand({ hy: s.seat + 0.1 * k - h.P.hip, hz: -(s.back ?? 0.05) * k, hx: 0.008 * sw, stance: 1.12, footL: [fx, footY, footZ], footR: [-fx, footY, footZ - 0.02], kneeL: [0.03, 1.0], kneeR: [-0.03, 1.0] });
      d.breathe(t); rotMul(h.b.spine, s.lean, 0, 0.01 * sw);
      h.group.updateMatrixWorld(true);
      handR = d.W(-0.13 * k, s.top, s.reach * k, _a); poleR = d.W(-0.4 * k, s.top - 0.05, 0.05 * k, _b);
      handL = d.W(0.16 * k, s.top, (s.reach - 0.04) * k, _c); poleL = d.W(0.42 * k, s.top - 0.05, 0.05 * k, _e);
      if (p.pose === 'chair') look.lerp(d.W(0, s.top + 0.02, 0.5 * k, _f), 0.6 + 0.4 * Math.sin(t * 0.3));   // reading the table
    }
    d.armIK('R', handR, poleR); d.armIK('L', handL, poleL);
    d.lookAt(look, dt, { speed: 2, maxYaw: 1.0 });
    if (p.spec.variants.includes('blink')) d.blink(t);
  }

  const centre = new THREE.Vector3();
  function update(dt, t) {
    const cam = ctx.camera; if (!cam || !F.g.parent?.visible) return;
    F.g.updateWorldMatrix(true, false);
    if (cam.position.distanceTo(world(5.0, 3.0, 1.0, centre)) > 30) return;
    for (const p of people) pose(p, t, dt);
  }
  F.g.updateWorldMatrix(true, false);
  for (const p of people) pose(p, 0, 0);
  ctx.onUpdate(update);
  return { people, pose, update, world };
}
