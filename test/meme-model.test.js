// [meme] The 3D メメ (src/anime/play/avatar/meme-model.js): builds headless on every tier and never throws, carries the
// walker's API, stands 1.15 m on the sheet's colours, keeps his proportions (nothing is ever scaled), walks and runs on
// planted boots at the walker's own cadence, and holds his budgets (at or under the previous walker's on every tier).
import { describe, test, expect } from 'bun:test';
import * as THREE from 'three';
import {
  build, buildMeme, memeGait, MEME_HEIGHT, MEME_SCALE, MEME_U, MEME_COLORS, MEME_SHADES, MEME_LINE, MEME_SPEED, MEME_GAIT, MEME_QUALITIES,
  MEME_POSES, MEME_TONE, EXPRESSIONS,
} from '../src/anime/play/avatar/meme-model.js';
// The walker's cadence driver (play/avatar/index.js gaitCadence: the model's gait().rate, held to its CADENCE clamp). Read
// through the module namespace: another lane is renaming the avatar's walker, and this test must not break on a rename.
import * as AVATAR from '../src/anime/play/avatar/index.js';
const CADENCE = AVATAR.CADENCE || { min: 1.6, max: 5.5 };
const gaitCadence = AVATAR.gaitCadence || ((model, speed, run) => {
  if (!model || !(speed > 0.05)) return undefined;
  const g = model.gait(speed, run), c = Number.isFinite(g.rate) ? g.rate : speed * g.stance / g.travel;
  return Math.min(CADENCE.max, Math.max(CADENCE.min, c));
});
/** Place the root as the walker does (pose.js placeCharacterRoot: a yaw, order YZX, scale 1). */
const placeRoot = (root, yaw) => { root.position.set(0, 0, 0); root.rotation.order = 'YZX'; root.rotation.set(0, yaw, 0); };

/** The pinned budgets (triangles of the body pass, of the line pass; draw calls). */
const PINNED = { high: { triangles: 5721, line: 3476 }, phone: { triangles: 2668, line: 1632 } };
/** the previous walker, measured at 2d60dce (its model since removed): his budgets per tier,
 *  his speeds and the cycle rates they needed. */
const PREV = { high: { triangles: 5817, line: 4466, drawn: 10283 }, phone: { triangles: 2687, line: 1894, drawn: 4581 }, drawCalls: 2,
  speed: { walk: 1.5, run: 3.0 }, hz: { walk: 4.118, run: 5.521 } };
const meshes = (m) => { const out = []; m.root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
/** Skinned (posed) positions of the body, in the root's frame. */
function posed(m) {
  m.root.updateMatrixWorld(true); m.skeleton.update();
  const p = m.mesh.geometry.attributes.position, v = new THREE.Vector3(), out = [];
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); m.mesh.applyBoneTransform(i, v); out.push(v.clone()); }
  return out;
}
const key = (r, g, b) => [r, g, b].map((x) => Math.round(x * 1000)).join(',');
const lin = (hex) => { const c = new THREE.Color(hex); return key(c.r, c.g, c.b); };
const PALETTE = new Map(Object.entries(MEME_COLORS).map(([k, hex]) => [lin(hex), k]));
const FACE_BONES = new Set(['eyeOpenR', 'eyeOpenL', 'eyeShutR', 'eyeShutL', 'eyeWinkR', 'mouthSmile', 'mouthOpen', 'mouthO']);
const finite = (m) => m.skeleton.bones.every((b) => [...b.position.toArray(), ...b.quaternion.toArray(), ...b.scale.toArray()].every(Number.isFinite));
const DEG = Math.PI / 180;

describe('build', () => {
  for (const q of MEME_QUALITIES) {
    test(`${q}: one group, a cel body and a navy line, both skinned to one skeleton; never throws`, () => {
      const m = build(THREE, { quality: q });
      expect(m).not.toBe(null);
      expect(m.root.isGroup).toBe(true);
      expect(m.root.name).toBe('meme');
      const ms = meshes(m);
      expect(ms.length).toBe(2);
      expect(ms.every((o) => o.isSkinnedMesh && o.skeleton === m.skeleton)).toBe(true);
      expect(m.hull.layers.mask).toBe(1 << 1);                 // LAYER_NO_OUTLINE: the world's edge pre-pass skips the line
      expect(m.mesh.material.vertexColors).toBe(true);
      expect(m.hull.material.side).toBe(THREE.BackSide);
      expect(m.hull.material.color.getHexString()).toBe(new THREE.Color(MEME_COLORS.navy).getHexString());
      for (const k of ['position', 'normal', 'skinIndex', 'skinWeight', 'hullW', 'hullN']) expect(m.hull.geometry.attributes[k]).toBe(m.mesh.geometry.attributes[k]);
      for (const a of Object.values(m.mesh.geometry.attributes)) for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) throw new Error('non-finite attribute');
      expect(m.mesh.castShadow).toBe(true); expect(m.mesh.receiveShadow).toBe(false);
      m.dispose();
    });
  }
  test('the API the walker drives (the characters registry calls build and these)', () => {
    const m = build(THREE, { quality: 'phone', mat: {}, calm: false });
    for (const f of ['setPose', 'update', 'dispose', 'setLift', 'setCalm', 'gait', 'poseAt', 'blink', 'setExpression']) expect(typeof m[f]).toBe('function');
    expect(m.mesh).toBeDefined();
    expect(typeof MEME_HEIGHT).toBe('number'); expect(MEME_SPEED.walk).toBeGreaterThan(0); expect(MEME_SPEED.run).toBeGreaterThan(MEME_SPEED.walk);
    expect(Object.keys(memeGait(1)).sort()).toEqual(['hz', 'rate', 'run', 'stance', 'travel']);
    expect(m.gait(1.3, 0)).toEqual(memeGait(1.3, 0));
    expect(m.setPose('auto')).toBe(true);
    m.dispose();
  });
  test('a bad build returns null instead of throwing, and quietly (build.lastError says why); an unknown quality builds high', () => {
    const said = [], err = console.error, warn = console.warn, log = console.log;
    console.error = console.warn = console.log = (...a) => said.push(a);
    try {
      expect(build(null)).toBe(null); expect(build.lastError).toBeInstanceOf(Error);
      expect(build({})).toBe(null);
      expect(build(THREE, { quality: 'potato' }).stats.quality).toBe('high'); expect(build.lastError).toBe(null);
      expect(build(THREE, null).stats.quality).toBe('high');
    } finally { console.error = err; console.warn = warn; console.log = log; }
    expect(said.length).toBe(0);
  });
});

describe('the sheet: height, frame, colours', () => {
  test('1.15 m from the soles to the cowlick, within 1 cm; the soles on the ground; facing -Z, his right on +X', () => {
    const m = build(THREE, { quality: 'high' }), P = m.mesh.geometry.attributes.position;
    let top = -Infinity, bottom = Infinity;
    for (let i = 0; i < P.count; i++) { top = Math.max(top, P.getY(i)); bottom = Math.min(bottom, P.getY(i)); }
    expect(Math.abs(top - MEME_HEIGHT)).toBeLessThan(0.01);
    expect(Math.abs(bottom)).toBeLessThan(0.002);
    expect(MEME_SCALE * MEME_U).toBeCloseTo(MEME_HEIGHT, 9);
    // standing (idle, the breath at rest): still 1.15 m and on the ground
    m.poseAt('idle', 1.2);
    const p = posed(m), ys = p.map((v) => v.y);
    expect(Math.abs(Math.min(...ys))).toBeLessThan(0.01);
    expect(Math.abs(Math.max(...ys) - MEME_HEIGHT)).toBeLessThan(0.015);
    // where things are: the eyes in front (-Z), the backpack behind (+Z), the camera at his left front, the float at his right
    const col = m.mesh.geometry.attributes.color, at = (hex) => { const k = lin(hex), out = []; for (let i = 0; i < col.count; i++) if (key(col.getX(i), col.getY(i), col.getZ(i)) === k) out.push(p[i]); return out; };
    const mean = (a, c) => a.reduce((s, v) => s + v[c], 0) / a.length;
    expect(mean(at(MEME_COLORS.white).filter((v) => v.y > 0.7), 'z')).toBeLessThan(-0.15);   // the eyes' highlights
    expect(mean(at(MEME_COLORS.flap), 'z')).toBeGreaterThan(0.12);                         // the backpack's flap
    expect(mean(at(MEME_COLORS.float), 'x')).toBeGreaterThan(0.05);                        // the float charm, his right
    expect(mean(at(MEME_COLORS.float), 'z')).toBeGreaterThan(0.12);
    expect(mean(at(MEME_COLORS.teal).filter((v) => v.y < 0.45 && v.z < -0.1), 'z')).toBeLessThan(0);   // (the jacket's front)
    m.dispose();
  });
  test('only the sheet’s colours, each with its shade tone; the hachimaki is 朱 #DD4A2E and nothing else is', () => {
    for (const q of MEME_QUALITIES) {
      const m = build(THREE, { quality: q }), col = m.mesh.geometry.attributes.color, sh = m.mesh.geometry.attributes.memeShade, used = new Set();
      for (let i = 0; i < col.count; i++) {
        const k = PALETTE.get(key(col.getX(i), col.getY(i), col.getZ(i)));
        expect(k).toBeDefined();
        used.add(k);
        expect(key(sh.getX(i), sh.getY(i), sh.getZ(i))).toBe(lin(MEME_SHADES[k]));
      }
      // every colour of the sheet is on him (the phone keeps all of them too)
      expect([...used].sort()).toEqual(Object.keys(MEME_COLORS).sort());
      m.dispose();
    }
    expect(MEME_COLORS.red).toBe('#DD4A2E');
    expect(MEME_SHADES.red).toBe('#C43E26');     // the sheet's own far tail
    expect(MEME_SHADES.teal).toBe('#0F8592');    // the sheet's jacket in shade
  });
  test('the line is the sheet’s stroke at most (6 U, 12 mm); lineScale only thins it', () => {
    const max = MEME_LINE.outline * MEME_SCALE + 1e-7;
    for (const lineScale of [1, 4]) {
      const m = build(THREE, { quality: 'high', lineScale }), w = m.mesh.geometry.attributes.hullW;
      let hi = 0; for (let i = 0; i < w.count; i++) hi = Math.max(hi, w.getX(i));
      expect(hi).toBeLessThanOrEqual(max); expect(hi).toBeGreaterThan(max * 0.99);
      m.dispose();
    }
    const thin = build(THREE, { quality: 'high', lineScale: 0.5 }), w = thin.mesh.geometry.attributes.hullW;
    let hi = 0; for (let i = 0; i < w.count; i++) hi = Math.max(hi, w.getX(i));
    expect(hi).toBeCloseTo(MEME_LINE.outline * MEME_SCALE * 0.5, 6);
    thin.dispose();
  });
  test('two flat tones and no soft shadow on him: a flat ramp, the tone picked by the sun', () => {
    const m = build(THREE, { quality: 'phone' }), ramp = m.mesh.material.gradientMap;
    expect([...new Set(ramp.image.data)]).toEqual([255]);
    expect(ramp.minFilter).toBe(THREE.NearestFilter);
    let src = null; const sh = { vertexShader: THREE.ShaderLib.toon.vertexShader, fragmentShader: THREE.ShaderLib.toon.fragmentShader, uniforms: {} };
    m.mesh.material.onBeforeCompile(sh); src = sh.fragmentShader;
    expect(src).toContain('directionalLights[ 0 ].direction');
    expect(src).toContain('vMemeShade');
    expect(sh.vertexShader).toContain('memeShade');
    m.dispose();
  });
});

describe('poses (never a scale: his proportions stay the sheet’s)', () => {
  test('setPose forces each pose, auto hands it back, an unknown pose is ignored (no throw)', () => {
    const m = build(THREE, { quality: 'phone' });
    for (const p of MEME_POSES) { expect(m.setPose(p)).toBe(true); expect(m.update(1 / 60)).toBe(p); expect(m.pose).toBe(p); }
    expect(m.setPose('dance')).toBe(false);
    expect(m.pose).toBe('fall');
    m.setPose('auto');
    const settle = (inp) => { let r; for (let i = 0; i < 60; i++) r = m.update(1 / 60, inp); return r; };
    expect(settle({ speed: 0 })).toBe('idle');
    expect(settle({ speed: MEME_SPEED.walk })).toBe('walk');
    expect(settle({ speed: MEME_SPEED.run, run: 1 })).toBe('run');
    expect(settle({ speed: 3.5 })).toBe('run');           // by speed, when the walker gives no run flag
    expect(settle({ speed: 0, onGround: false, vy: 3 })).toBe('jump');
    expect(settle({ speed: 0, onGround: false, vy: -2 })).toBe('fall');
    expect(settle({ speed: 0, onGround: true })).toBe('idle');
    m.dispose();
  });
  test('no part is ever scaled, in every pose and through a long, rough run (the face swaps its drawings only)', () => {
    const m = build(THREE, { quality: 'phone' });
    const check = () => {
      expect(m.root.scale.toArray()).toEqual([1, 1, 1]);
      for (const b of m.skeleton.bones) if (!FACE_BONES.has(b.name)) expect(Math.abs(b.scale.x - 1) + Math.abs(b.scale.y - 1) + Math.abs(b.scale.z - 1)).toBeLessThan(1e-9);
    };
    for (const p of MEME_POSES) { m.poseAt(p, 0.8); check(); }
    m.setPose('auto');
    let vy = 0;
    for (let i = 0; i < 1200; i++) {
      const t = i / 60, speed = 3.4 * (0.5 + 0.5 * Math.sin(t)), air = i % 240 > 200;
      vy = air ? vy - 9.81 / 60 : 3.4;
      m.update(1 / 60, { speed, onGround: !air, vy, run: speed > 2 ? 1 : 0 });
      if (i % 40 === 0) check();
    }
    m.dispose();
  });
  test('the poses differ where they should: the walk bends the knee, the run leans and pumps, the jump tucks with the arms up, the fall reaches out', () => {
    const m = build(THREE, { quality: 'phone' }), B = m.bones, ang = (a, b) => (a.angleTo(b) * 180) / Math.PI;
    const snap = () => Object.fromEntries(['legR', 'shinR', 'spine', 'pelvis', 'armR', 'armL', 'foreR', 'head'].map((n) => [n, B[n].quaternion.clone()]));
    m.poseAt('idle', 1); const idle = snap();
    let knee = 0; m.poseAt('walk', 1); const hz = m.cadence;
    for (let i = 0; i < 16; i++) { m.poseAt('walk', 1 + i / 16 / hz); knee = Math.max(knee, ang(B.shinR.quaternion, idle.shinR)); }
    expect(hz).toBeGreaterThan(2.5); expect(knee).toBeGreaterThan(30);
    m.poseAt('run', 1.05); const run = snap();
    const lean = (q) => { const v = new THREE.Vector3(0, 1, 0).applyQuaternion(q); return Math.atan2(-v.z, v.y) / DEG; };   // + forward
    expect(lean(B.pelvis.quaternion.clone().multiply(run.spine))).toBeGreaterThan(8);   // he leans into the run
    expect(ang(run.foreR, idle.foreR)).toBeGreaterThan(55);                              // the elbows bent, pumping
    // the jump: knees up (tuck) and both hands above the shoulders (arms up)
    m.poseAt('jump', 0.4);
    expect(ang(B.shinR.quaternion, idle.shinR)).toBeGreaterThan(60);
    const hand = new THREE.Vector3(), shoulder = new THREE.Vector3();
    m.root.updateMatrixWorld(true);
    for (const n of ['R', 'L']) { B['fore' + n].getWorldPosition(hand); B['arm' + n].getWorldPosition(shoulder); expect(hand.y).toBeGreaterThan(shoulder.y); }
    // the fall: the arms out to the sides, the legs reaching down
    m.poseAt('fall', 0.4);
    const out = new THREE.Vector3(0, -1, 0).applyQuaternion(B.armR.quaternion);
    expect(Math.abs(Math.atan2(out.x, -out.y) / DEG)).toBeGreaterThan(60);
    expect(ang(B.shinR.quaternion, idle.shinR)).toBeLessThan(30);
    m.dispose();
  });
  test('the landing squashes by pose (the pelvis dips, the knees take it) and springs back; nothing scales', () => {
    const m = build(THREE, { quality: 'phone' });
    m.poseAt('idle', 1); m.setPose('auto');
    const y0 = m.bones.pelvis.position.y;
    for (let i = 0; i < 30; i++) m.update(1 / 60, { speed: 0, onGround: false, vy: -4 });
    let low = Infinity;
    for (let i = 0; i < 40; i++) { m.update(1 / 60, { speed: 0, onGround: true, vy: 0 }); low = Math.min(low, m.bones.pelvis.position.y); }
    expect(y0 - low).toBeGreaterThan(0.012);                 // >= 1.2 cm down into the squash
    for (let i = 0; i < 90; i++) m.update(1 / 60, { speed: 0, onGround: true, vy: 0 });
    expect(Math.abs(m.bones.pelvis.position.y - y0)).toBeLessThan(0.003);   // back up
    m.dispose();
  });
  test('the feet stay on the ground standing and walking; deterministic poses', () => {
    const m = build(THREE, { quality: 'phone' });
    for (const [p, t] of [['idle', 1], ['walk', 1], ['walk', 1.1], ['walk', 1.2]]) {
      m.poseAt(p, t);
      expect(Math.abs(Math.min(...posed(m).map((v) => v.y)))).toBeLessThan(0.02);
    }
    const grab = () => m.skeleton.bones.map((b) => [...b.quaternion.toArray(), ...b.position.toArray()]);
    m.poseAt('run', 1.37); const a = grab(); m.poseAt('walk', 0.5); m.poseAt('run', 1.37);
    expect(grab()).toEqual(a);
    m.dispose();
  });
  test('the sheet’s faces: にこっ, the blink (ほっ), the jump’s 見つけた and the fall’s おっ, one drawing at a time', () => {
    const m = build(THREE, { quality: 'high' }), B = m.bones, on = (b) => b.scale.x > 0.5;
    m.poseAt('idle', 0.5);
    expect(on(B.eyeR) && on(B.eyeL) && on(B.mouthSmile)).toBe(true);
    expect(on(B.eyeShutR) || on(B.eyeWinkR) || on(B.mouthOpen) || on(B.mouthO)).toBe(false);
    m.blink(0.2); expect(on(B.eyeShutR) && on(B.eyeShutL) && !on(B.eyeR)).toBe(true);
    m.poseAt('jump', 0.4); expect(on(B.eyeWinkR) && on(B.eyeL) && on(B.mouthOpen) && !on(B.mouthSmile)).toBe(true);
    m.poseAt('fall', 0.4); expect(on(B.mouthO) && !on(B.mouthSmile)).toBe(true);
    expect(on(B.eyeR) || on(B.eyeL) || on(B.eyeShutL)).toBe(false);   // おっ's own round eyes (on the same swap) replace them
    for (const e of EXPRESSIONS) { m.setExpression(e); expect([B.mouthSmile, B.mouthOpen, B.mouthO].filter(on).length).toBe(1); }
    // a held face holds its eyes too (no blink in a still), whatever the timers say
    m.setExpression('smile'); m.setPose('auto');
    for (let i = 0; i < 60 * 8; i++) { m.update(1 / 60, { speed: 0 }); expect(on(B.eyeR) && on(B.eyeL)).toBe(true); }
    m.setExpression(null);
    // blinks every 2.4-5.6 s; none with blink: false
    m.setPose('auto'); m.poseAt('idle', 0.1);
    let blinks = 0, was = false;
    for (let i = 0; i < 60 * 30; i++) { m.update(1 / 60, { speed: 0.6 }); const s = on(B.eyeShutL); if (s && !was) blinks++; was = s; }
    expect(blinks).toBeGreaterThanOrEqual(5); expect(blinks).toBeLessThanOrEqual(16);
    const still = build(THREE, { quality: 'phone', blink: false });
    for (let i = 0; i < 60 * 12; i++) { still.update(1 / 60); expect(on(still.bones.eyeShutL)).toBe(false); }
    m.dispose(); still.dispose();
  });
});

describe('turning on the spot', () => {
  test('when the walker turns him standing still, he steps in place (no boots pivoting on the ground); not in calm', () => {
    const lift = (calm) => {
      const m = build(THREE, { quality: 'phone', calm }), p = new THREE.Vector3();
      m.poseAt('idle', 1); m.setPose('auto');
      let yaw = 0, hi = 0;
      for (let i = 0; i < 120; i++) {
        m.update(1 / 60, { speed: 0 }); yaw += 2.8 / 60; placeRoot(m.root, yaw);
        if (i > 30) { m.root.updateMatrixWorld(true); m.bones.footL.getWorldPosition(p); hi = Math.max(hi, p.y); }
      }
      m.dispose(); return hi;
    };
    const ankle = (140 - 52 - 54) * MEME_SCALE;
    expect(lift(false) - ankle).toBeGreaterThan(0.015);   // the boots come off the ground
    expect(lift(true) - ankle).toBeLessThan(0.004);       // reduced motion: he just turns
  });
});

describe('the gait the walker drives (cadence in, gait() out): no slide', () => {
  test('memeGait: travel is the planted boot’s sweep; hz = speed x stance / travel; small steps when slow', () => {
    expect(memeGait(0).travel).toBe(0); expect(memeGait(0).hz).toBe(0);
    const w = memeGait(MEME_SPEED.walk, 0), r = memeGait(MEME_SPEED.run, 1);
    expect(w.travel).toBeCloseTo(0.2351, 3); expect(r.travel).toBeCloseTo(0.2566, 3);
    expect(w.stance).toBe(MEME_GAIT.walk.stance); expect(r.stance).toBe(MEME_GAIT.run.stance);
    for (const g of [w, r]) expect(g.hz).toBeCloseTo((g === w ? MEME_SPEED.walk : MEME_SPEED.run) * g.stance / g.travel, 9);
    expect(memeGait(0.4, 0).travel).toBeLessThan(w.travel * 0.6);   // a slow walk takes small steps
    expect(memeGait(0.4, 0).hz).toBeGreaterThan(1.6);                // ... at a cadence that still reads
    expect(memeGait(MEME_SPEED.walk, 1).run).toBe(1);
    expect(memeGait(MEME_SPEED.run).run).toBe(1);                    // by speed: the run is chosen above 2.9 m/s
    expect(memeGait(MEME_SPEED.walk).run).toBe(0);
  });
  test('at MEME_SPEED the readable ceiling never bites (rate = hz) and the walker’s clamp holds it (1.6-5.5): planted boots', () => {
    const m = build(THREE, { quality: 'phone' });
    for (const [v, run] of [[MEME_SPEED.walk, 0], [MEME_SPEED.run, 1]]) {
      const g = memeGait(v, run), c = gaitCadence(m, v, run);
      expect(g.rate).toBe(g.hz);
      expect(c).toBeGreaterThan(CADENCE.min); expect(c).toBeLessThanOrEqual(CADENCE.max);
      expect(Math.abs(c - g.hz)).toBeLessThan(1e-9);
    }
    // and they are 3.2 and 4.8 cycles a second: calmer than the previous walker's 4.1 / 5.5 at his 1.5 / 3.0
    expect(memeGait(MEME_SPEED.walk, 0).hz).toBeCloseTo(3.21, 1); expect(memeGait(MEME_SPEED.run, 1).hz).toBeCloseTo(4.77, 1);
    expect(memeGait(MEME_SPEED.walk, 0).hz).toBeLessThan(PREV.hz.walk);
    expect(memeGait(MEME_SPEED.run, 1).hz).toBeLessThan(PREV.hz.run);
    // the registry's speeds for a loaded character (CHARACTER_SPEED 1.5 / 3.0): his feet stay planted there too
    for (const [v, run] of [[PREV.speed.walk, 0], [PREV.speed.run, 1]]) { const g = memeGait(v, run); expect(g.rate).toBe(g.hz); expect(gaitCadence(m, v, run)).toBeCloseTo(g.hz, 9); }
    m.dispose();
  });
  for (const [name, v, run] of [['walk', MEME_SPEED.walk, 0], ['run', MEME_SPEED.run, 1], ['slow walk', 0.7, 0]]) {
    test(`${name} at ${v} m/s with the walker's cadence: the planted boot sweeps back at his speed (no slide), never sideways`, () => {
      const m = build(THREE, { quality: 'phone' }), dt = 1 / 240, p = new THREE.Vector3(), cadence = gaitCadence(m, v, run);
      m.setPose('auto');
      for (let i = 0; i < 480; i++) m.update(dt, { speed: v, cadence, run });
      const xs = [], ys = [], zs = [];
      for (let i = 0; i < Math.ceil(240 / cadence) + 2; i++) { m.update(dt, { speed: v, cadence, run }); m.root.updateMatrixWorld(true); m.bones.footR.getWorldPosition(p); xs.push(p.x); ys.push(p.y); zs.push(p.z); }
      // the planted stretch: the ankle within 1.2 cm of its lowest
      const lo = Math.min(...ys), vz = [], vx = [];
      for (let i = 1; i < ys.length; i++) if (ys[i] < lo + 0.012 && ys[i - 1] < lo + 0.012) { vz.push((zs[i] - zs[i - 1]) / dt); vx.push(Math.abs(xs[i] - xs[i - 1]) / dt); }
      expect(vz.length).toBeGreaterThanOrEqual(5);
      const mean = vz.reduce((a, b) => a + b, 0) / vz.length;
      expect(Math.abs(mean - v) / v).toBeLessThan(0.1);                      // backward (+Z) at his own speed: in the world it stays put
      expect(vx.reduce((a, b) => a + b, 0) / vx.length).toBeLessThan(0.12);  // and does not skate sideways
      m.dispose();
    });
  }
});

describe('secondary motion (springs at a fixed step: framerate free)', () => {
  /** the left tail's tip relative to its knot (the run's lean carries the whole head forward: measure from the knot) */
  const tailTip = (m) => { const s = m.springs.find((q) => q.name === 'tailL'); return s.x[2].clone().sub(s.anchor); };
  test('the tails hang on the back of his head standing, stream behind him running, and float in a jump', () => {
    const m = build(THREE, { quality: 'phone' });
    const back = (v) => Math.atan2(v.z, -v.y) / DEG, spread = (v) => Math.atan2(Math.abs(v.x), -v.y) / DEG;
    m.poseAt('idle', 3); const idle = tailTip(m);
    m.poseAt('run', 3); const run = tailTip(m);
    expect(back(idle)).toBeLessThan(26);                 // standing: hanging down the back of his head (the sheet's back view)
    expect(spread(idle)).toBeGreaterThan(6);             // splayed out from the knot, not straight down
    expect(idle.y).toBeLessThan(-0.25);
    expect(back(run)).toBeGreaterThan(back(idle) + 12);  // running: laid back by the air (the sheet's profile draws them flying)
    expect(run.z - idle.z).toBeGreaterThan(0.05);
    // a jump: the frame falls with him, so the tails float (they rise against him)
    m.poseAt('idle', 2); m.setPose('auto');
    for (let i = 0; i < 30; i++) m.update(1 / 60, { speed: 0 });
    const before = tailTip(m).y;
    let vy = 3.4; for (let i = 0; i < 20; i++) { m.update(1 / 60, { speed: 0, onGround: false, vy }); vy -= 9.81 / 60; }
    expect(tailTip(m).y).toBeGreaterThan(before + 0.01);
    m.dispose();
  });
  test('the same motion at 30, 60 and 144 fps ends within a centimetre (fixed substeps)', () => {
    const tips = [];
    for (const fps of [30, 60, 144]) {
      const m = build(THREE, { quality: 'phone' });
      m.poseAt('idle', 0.5); m.setPose('auto');
      const n = Math.round(4 * fps);
      for (let i = 0; i < n; i++) { const t = i / fps, s = t < 2 ? 3.4 : 0; m.update(1 / fps, { speed: s, run: 1, cadence: memeGait(s, 1).rate }); }
      tips.push(tailTip(m)); m.dispose();
    }
    expect(tips[0].distanceTo(tips[2])).toBeLessThan(0.012);
    expect(tips[1].distanceTo(tips[2])).toBeLessThan(0.006);
  });
  test('calm (reduced motion): the tails barely move when he starts and stops; the breeze is gone', () => {
    const swing = (calm) => {
      const m = build(THREE, { quality: 'phone', calm });
      m.poseAt('idle', 2); m.setPose('auto');
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < 360; i++) { const s = i < 120 ? 3.4 : 0; m.update(1 / 60, { speed: s, run: 1 }); if (i > 125) { const z = tailTip(m).z; lo = Math.min(lo, z); hi = Math.max(hi, z); } }
      m.dispose(); return hi - lo;
    };
    expect(swing(true)).toBeLessThan(swing(false) * 0.6);
  });
  test('turning while running swings the tails outward (the root’s yaw, as the walker places him)', () => {
    const tips = (rate) => {
      const m = build(THREE, { quality: 'phone' });
      m.poseAt('run', 2); m.setPose('auto');
      let yaw = 0; const r = [0, 0];
      for (let i = 0; i < 120; i++) {
        m.update(1 / 60, { speed: 3.4, run: 1 }); yaw += rate / 60; placeRoot(m.root, yaw);
        if (i >= 60) m.springs.filter((q) => q.name.startsWith('tail')).forEach((q, k) => { r[k] += q.x[2].clone().sub(q.anchor).x / 60; });   // the mean over the last second (the run's bob swings them)
      }
      m.dispose(); return r;
    };
    const straight = tips(0), left = tips(2.5), right = tips(-2.5);
    // turning left (+yaw), the frame's centripetal pull throws both tails out to his right (+X); turning right, to his left
    for (let k = 0; k < 2; k++) { expect(left[k] - straight[k]).toBeGreaterThan(0.01); expect(right[k] - straight[k]).toBeLessThan(-0.01); }
  });
});

describe('robustness and budgets', () => {
  test('update() is stable for any dt in 0..0.1, odd inputs, and a long run (10 minutes)', () => {
    const m = build(THREE, { quality: 'phone' });
    m.setPose('auto');
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const inp of [undefined, null, {}, { speed: NaN, vy: Infinity }, { speed: -3 }, { cadence: -1 }, { cadence: NaN, run: NaN }]) { expect(() => m.update(1 / 60, inp)).not.toThrow(); }
    for (const dt of [0, -1, NaN, 0.5, 1e-6]) expect(() => m.update(dt, { speed: 1 })).not.toThrow();
    for (let i = 0; i < 36000; i++) {
      const dt = rnd() * 0.1, sp = rnd() < 0.1 ? 0 : 3.6 * rnd(), air = rnd() < 0.05;
      m.update(dt, { speed: sp, onGround: !air, vy: air ? 6 * (rnd() - 0.5) : 0, run: sp > 2 ? 1 : 0, cadence: memeGait(sp).rate });
      if (i % 3000 === 0) {
        expect(finite(m)).toBe(true);
        for (const s of m.springs) for (const x of s.x) { expect(Number.isFinite(x.x + x.y + x.z)).toBe(true); expect(x.length()).toBeLessThan(1.6); }
      }
    }
    expect(finite(m)).toBe(true);
    m.dispose();
  });
  test('bounds fit every pose (no wrong culling): arms up, the run, tails and charm swinging', () => {
    const m = build(THREE, { quality: 'phone' });
    for (const [p, t] of [['idle', 1], ['walk', 1.2], ['run', 1.1], ['run', 2.5], ['jump', 0.4], ['fall', 0.4]]) {
      m.poseAt(p, t);
      for (const v of posed(m)) expect(m.mesh.boundingSphere.distanceToPoint(v)).toBeLessThanOrEqual(0);
    }
    m.dispose();
  });
  test('dispose() frees the geometry and materials and takes him out of the scene', () => {
    const scene = new THREE.Scene(), m = build(THREE, { quality: 'phone' }), freed = [];
    scene.add(m.root);
    for (const o of [m.mesh.geometry, m.hull.geometry, m.mesh.material, m.hull.material]) o.addEventListener('dispose', () => freed.push(o));
    m.dispose();
    expect(freed.length).toBe(4);
    expect(m.root.parent).toBe(null);
  });
  test('setLift (night) lifts his own colour a little, clamped 0..1; setCalm toggles reduced motion', () => {
    const m = build(THREE, { quality: 'phone' }), u = m.mesh.material.userData.uLift;
    m.setLift(1); expect(u.value).toBeCloseTo(MEME_TONE.lift, 9);
    m.setLift(5); expect(u.value).toBeCloseTo(MEME_TONE.lift, 9);
    m.setLift(-1); expect(u.value).toBe(0);
    m.setLift(NaN); expect(u.value).toBe(0);
    m.setCalm(true); m.setCalm(false);
    m.dispose();
  });
  for (const q of MEME_QUALITIES) {
    test(`${q}: ${PINNED[q].triangles} + ${PINNED[q].line} line triangles in 2 draw calls, at or under the previous walker's on the same tier`, () => {
      const m = build(THREE, { quality: q });
      const tris = m.mesh.geometry.index.count / 3, line = m.hull.geometry.index.count / 3;
      expect(tris).toBe(m.stats.triangles); expect(line).toBe(m.stats.lineTriangles);
      expect(tris).toBe(PINNED[q].triangles); expect(line).toBe(PINNED[q].line);
      expect(m.stats.drawCalls).toBe(PREV.drawCalls); expect(meshes(m).length).toBe(2);
      expect(tris).toBeLessThanOrEqual(PREV[q].triangles);
      expect(line).toBeLessThanOrEqual(PREV[q].line);
      expect(tris + line).toBeLessThanOrEqual(PREV[q].drawn);
      expect(m.skeleton.bones.length).toBeLessThanOrEqual(32);
      m.dispose();
    });
  }
  test('phone is lighter than high; update() costs well under a millisecond', () => {
    const hi = build(THREE, { quality: 'high' }), ph = build(THREE, { quality: 'phone' });
    expect(ph.stats.triangles).toBeLessThan(hi.stats.triangles * 0.55);
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) ph.update(1 / 60, { speed: (i % 200) / 50, onGround: true, vy: 0 });
    expect((performance.now() - t0) / 600).toBeLessThan(0.5);
    hi.dispose(); ph.dispose();
  });
});
