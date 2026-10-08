import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { THIRD, chaseOwns, createChaseState, damp1, desiredCam, follow, liftBoom, pathBlocked, placeChase, solveBoom } from '../src/anime/play/avatar/camera.js';
import { bodyOccupy, walkerShown } from '../src/anime/play/avatar/shown.js';
import { armHandoff, blendHandoff, createHandoff } from '../src/anime/play/avatar/handoff.js';
import { nextView, viewId, viewLabelKey, VIEW_CYCLE } from '../src/anime/play/avatar/view.js';
import { DEFAULT_ID, loadCharacter, pickerIds } from '../src/anime/play/avatar/characters.js';
import { LOOKS, PREF_KEY, readPrefs, writePrefs } from '../src/anime/play/avatar/prefs.js';
import { boxHit, inAwing, inBody, outsidePhoneKit } from '../src/anime/play/avatar/boxes.js';
import { clipOf, cycleLength, easeAngle, easeScalar, footAmp, gaitPhase, characterPose, characterTurnLean, BODY_BOB, LEAN_MAX, landBob, landSquash, placeCharacterRoot, plantMatch, stepPhase, turnLean, wrapPi } from '../src/anime/play/avatar/pose.js';
import { classifySurface, footstep, characterCadence, stepSpacing, stepTick, surfaceKind } from '../src/anime/play/avatar/steps.js';

describe('third-person boom', () => {
  test('an open boom stays 4.5 m behind, a shoulder to the right, the look 1.6 m up', () => {
    const want = desiredCam(0, 0, 0, 0, {});
    const dist = Math.hypot(want.x - want.tx, want.y - want.ty, want.z - want.tz);
    expect(dist).toBeCloseTo(THIRD.dist, 5);
    expect(want.ty).toBeCloseTo(THIRD.height, 5);
    expect(want.tx).toBeCloseTo(THIRD.shoulder, 5);
    expect(want.z).toBeGreaterThan(3);
    const solved = solveBoom({ x: want.tx, y: want.ty, z: want.tz }, want, null, null, {});
    expect(solved.dist).toBeCloseTo(THIRD.dist, 2);
  });

  test('a wall behind the walker shortens the boom, and a narrow alley that is open behind does not', () => {
    const want = desiredCam(0, 0, 0, 0, {});
    const from = { x: want.tx, y: want.ty, z: want.tz };
    const wall = solveBoom(from, want, (x, y, z) => z > 1.2, () => 0, {});
    expect(wall.dist).toBeLessThan(1.3);
    expect(wall.dist).toBeGreaterThan(0.2);
    expect(wall.z).toBeLessThanOrEqual(1.2 + 1e-6);
    const alley = solveBoom(from, want, (x, y, z) => Math.abs(x) > 0.7, () => 0, {});
    expect(alley.dist).toBeGreaterThan(4.2);
  });

  test('a colonnade column on the boom stops the camera in front of it', () => {
    const want = desiredCam(2, 0, 0, 0, {});
    const from = { x: want.tx, y: want.ty, z: want.tz };
    const column = (x, y, z) => Math.hypot(x - want.tx, z - (want.tz + 1.6)) < 0.35 && y > 0.4 && y < 4;
    const solved = solveBoom(from, want, column, () => 0, {});
    expect(solved.dist).toBeLessThan(1.8);
    expect(solved.dist).toBeGreaterThan(0.3);
  });

  test('the follow eases and never eases into a wall', () => {
    const st = createChaseState();
    const out = { x: 0, v: 0 };
    damp1(0, 0, 4.5, 0, 1 / THIRD.tau, out);
    expect(out.x).toBe(4.5);
    st.ready = true;
    follow(st, { x: 4, y: 2, z: 1, dist: 4 }, 0.12, 1 / THIRD.tau, false);
    expect(st.x).toBeGreaterThan(1);
    expect(st.x).toBeLessThan(4);
    const placed = placeChase(createChaseState(), 0, 0, 0, 0, 0.5, (x, y, z) => z > 0.6, () => 0, false);
    expect(placed.z).toBeLessThanOrEqual(0.65);
  });

  test('a lintel stops the rise, a stair blocks the boom, and a thin wall is not eased through', () => {
    const want = desiredCam(0, 0, 0, 0, {});
    const from = { x: want.tx, y: want.ty, z: want.tz };
    const solved = solveBoom(from, want, (x, y, z) => z > 1.05, () => 0, {});
    const lintel = (x, y, z) => y > 2.05 && z > 0.4 && z < 1.3;
    liftBoom(solved, lintel, () => 0);
    expect(solved.y).toBeLessThan(2.08);
    expect(solved.dist).toBeLessThan(1.3);
    const stair = placeChase(createChaseState(), 0, 0, 0, 0, 0, null, (x, z) => (z > 0.7 ? 3.2 : 0), true);
    expect(stair.z).toBeLessThan(0.85);
    expect(stair.y).toBeGreaterThanOrEqual(0.2);
    const gullCam = { dist: 3.4, height: 0.55, pitch: -18 * Math.PI / 180, shoulder: 0.15, tau: 0.16, boomStep: 0.25, boomMin: 0.7, boomRadius: 0.16, hide: 0.35 };
    const gull = placeChase(createChaseState(), 0, 30, 0, 0, 0, null, () => 0, true, gullCam);
    expect(gull.ty).toBeCloseTo(30.55, 2);
    const thin = (x, y, z) => z > 1.15 && z < 1.45;
    expect(pathBlocked(0.3, 2.2, 2.4, 0.3, 2.1, 0.4, thin, () => 0)).toBe(true);
    const st = createChaseState();
    st.ready = true; st.x = 0.35; st.y = 1.7; st.z = 1.55;
    placeChase(st, 0, 0, 0, 0, 0.25, thin, () => 0, false);
    expect(st.z).toBeLessThan(1.2);
  });

  test('the chase owns the camera only while walking in third person', () => {
    const chase = () => {};
    expect(chaseOwns({ fly: false, person: 'third', chase })).toBe(true);
    expect(chaseOwns({ fly: true, person: 'third', chase })).toBe(false);
    expect(chaseOwns({ fly: false, person: 'first', chase })).toBe(false);
    expect(chaseOwns({ fly: false, person: 'third' })).toBe(false);
    expect(chaseOwns(null)).toBe(false);
  });
});

describe('walker visibility', () => {
  const chase = () => {};
  const onFoot = { fly: false, person: 'third', chase, gull: false };

  test('third person on foot is shown; the fish, gull, boat, car, race and ship hide him, and leaving brings him back', () => {
    expect(walkerShown(onFoot, {})).toBe(true);
    expect(walkerShown(onFoot, { swim: true })).toBe(false);
    expect(walkerShown(onFoot, { gull: true })).toBe(false);
    expect(walkerShown(onFoot, { drive: true })).toBe(false);
    expect(walkerShown(onFoot, { sail: true })).toBe(false);
    expect(walkerShown(onFoot, { race: true })).toBe(false);
    expect(walkerShown(onFoot, { voyage: true })).toBe(false);
    expect(walkerShown({ ...onFoot, gull: true }, {})).toBe(false);
    expect(walkerShown({ ...onFoot, fly: true }, {})).toBe(false);
    expect(walkerShown({ ...onFoot, person: 'first' }, {})).toBe(false);
    expect(walkerShown(onFoot, null)).toBe(true);
    expect(walkerShown(null, { swim: true })).toBe(false);
    // a walk into the dive is still third person with fly false: he stays off while the fish is the body
    expect(walkerShown(onFoot, { swim: true })).toBe(false);
    expect(walkerShown(onFoot, { swim: false })).toBe(true);
  });

  test('bodyOccupy reads the dive, the gull, the boat, the car, the race and the ship', () => {
    const ctx = {
      services: {
        swim: { active: true },
        play: { gull: { active: false } },
        explore: { drive: { active: false } },
        sail: { active: false },
        playCar: { race: { phase: 'idle' } },
        ship: { voyage: { active: false } },
      },
    };
    expect(bodyOccupy(ctx)).toMatchObject({ swim: true, gull: false, drive: false, sail: false, race: false, voyage: false });
    expect(walkerShown(onFoot, bodyOccupy(ctx))).toBe(false);
    ctx.services.swim.active = false;
    expect(walkerShown(onFoot, bodyOccupy(ctx))).toBe(true);
    ctx.services.play.gull.active = true;
    expect(bodyOccupy(ctx).gull).toBe(true);
    ctx.services.play.gull.active = false;
    ctx.services.explore.drive.active = true;
    expect(bodyOccupy(ctx).drive).toBe(true);
    ctx.services.explore.drive.active = false;
    ctx.services.sail.active = true;
    expect(bodyOccupy(ctx).sail).toBe(true);
    ctx.services.sail.active = false;
    ctx.services.playCar.race.phase = 'run';
    expect(bodyOccupy(ctx).race).toBe(true);
    ctx.services.playCar.race.phase = 'count';
    expect(bodyOccupy(ctx).race).toBe(true);
    ctx.services.playCar.race.phase = 'idle';
    expect(bodyOccupy(ctx).race).toBe(false);
    ctx.services.ship.voyage.active = true;
    expect(bodyOccupy(ctx).voyage).toBe(true);
    ctx.services.ship.voyage.active = false;
    expect(walkerShown(onFoot, bodyOccupy(ctx))).toBe(true);
  });
});

describe('view cycle', () => {
  test('歩く（3人称） → 歩く（1人称） → 飛ぶ, and the button names the next one', () => {
    expect(VIEW_CYCLE).toEqual(['walk3', 'walk1', 'fly']);
    expect(viewId('drone', 'third')).toBe('fly');
    expect(viewId('walk', 'third')).toBe('walk3');
    expect(viewId('walk', 'first')).toBe('walk1');
    expect(nextView('fly')).toBe('walk3');
    expect(nextView('walk3')).toBe('walk1');
    expect(nextView('walk1')).toBe('fly');
    expect(viewLabelKey(nextView('fly'))).toBe('play.avatar.view.walk3');
    expect(viewLabelKey(nextView('walk3'))).toBe('play.avatar.view.walk1');
    expect(viewLabelKey(nextView('walk1'))).toBe('play.avatar.view.fly');
  });
});

describe('character slot', () => {
  test('meme is the default and loads, the original figure is the quiet fallback, and the picker offers both', async () => {
    expect(DEFAULT_ID).toBe('meme');
    const errors = [];
    const orig = console.error;
    console.error = (...a) => { errors.push(a); };
    let meme = null;
    try {
      meme = await loadCharacter('meme', THREE, { quality: 'phone' });
      expect(await loadCharacter('original', THREE, {})).toBeNull();
      expect(await loadCharacter('no-such-character', THREE, {})).toBeNull();
      expect(await pickerIds()).toEqual(['meme', 'original']);
    } finally { console.error = orig; }
    expect(errors).toEqual([]);
    expect(meme && meme.root).toBeTruthy();
    meme.dispose?.();
  });
});

describe('looks and clips', () => {
  test('prefs stay out of the kit store and only accept the three looks', () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    expect(readPrefs(storage).look).toBe('navy');
    expect(readPrefs(storage).model).toBe('meme');
    writePrefs(storage, { look: 'asagi', model: 'original' });
    expect(storage.getItem(PREF_KEY)).toContain('asagi');
    expect(readPrefs(storage)).toEqual({ look: 'asagi', model: 'original' });
    writePrefs(storage, { look: 'nope', model: 'gone' });
    expect(readPrefs(storage).look).toBe('navy');
    expect(readPrefs(storage).model).toBe('meme');
    expect(LOOKS).toEqual(['navy', 'kinari', 'asagi']);
  });

  test('clips: idle, walk, run, jump, fall, land, turn; a custom character rests land and turn on idle', () => {
    expect(clipOf(0, true, 0, 0, 0)).toBe('idle');
    expect(clipOf(1.2, true, 0, 0, 0)).toBe('walk');
    expect(clipOf(6, true, 0, 0, 0)).toBe('run');
    expect(clipOf(0, false, 2, 0, 0)).toBe('jump');
    expect(clipOf(0, false, -2, 0, 0)).toBe('fall');
    expect(clipOf(0, true, 0, 0.1, 0)).toBe('land');
    expect(clipOf(0, true, 0, 0, 0.8)).toBe('turn');
    expect(characterPose('land')).toBe('idle');
    expect(characterPose('turn')).toBe('idle');
    expect(characterPose('run')).toBe('run');
    expect(Math.abs(wrapPi(Math.PI * 3))).toBeCloseTo(Math.PI, 5);
    const mid = easeAngle(0, Math.PI / 2, 0.1, 0.1);
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(Math.PI / 2);
    expect(plantMatch(1.4)).toBeCloseTo(0, 5);
    expect(plantMatch(6.2)).toBeCloseTo(0, 5);
    expect(cycleLength(6)).toBeGreaterThan(cycleLength(1.2));
    expect(footAmp(6)).toBeGreaterThan(footAmp(1.2));
    const phase = stepPhase(0, 1.6, 1, 1.62 / 1.58);
    expect(phase).toBeCloseTo(gaitPhase(1.6, 1.6), 5);
    expect(turnLean(0)).toBe(0);
    expect(turnLean(2)).toBeLessThan(0);
    expect(turnLean(8)).toBe(-0.22);
    const sq = landSquash(0.2, 0.2, { y: 1, xz: 1 });
    expect(sq.y).toBeLessThan(0.9);
    expect(sq.xz).toBeGreaterThan(1);
    expect(landSquash(0, 0.2, sq).y).toBe(1);
  });
});

describe('camera handoff', () => {
  test('a mode change spends the jump instead of cutting', () => {
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(0, 2, 6);
    cam.lookAt(0, 1.6, 0);
    const h = createHandoff();
    armHandoff(h, cam, 0.4);
    cam.position.set(0, 1.7, 1.2);
    cam.lookAt(0, 1.6, 0);
    blendHandoff(h, cam, 1 / 60);
    expect(cam.position.z).toBeGreaterThan(5);
    for (let i = 0; i < 50; i++) {
      cam.position.set(0, 1.7, 1.2);
      cam.lookAt(0, 1.6, 0);
      blendHandoff(h, cam, 1 / 60);
    }
    expect(h.on).toBe(false);
    expect(cam.position.z).toBeCloseTo(1.2, 1);
    armHandoff(h, cam, 0);
    expect(h.on).toBe(false);
  });
});

describe('footsteps', () => {
  test('deck is wood, the beach is sand, the street is asphalt, and a step lands on distance', () => {
    expect(surfaceKind({ deck: true, sand: true })).toBe('wood');
    expect(surfaceKind({ sand: true })).toBe('sand');
    expect(surfaceKind({})).toBe('asphalt');
    const world = { heightAt: () => 1, shoreDist: () => -4, isWater: () => false };
    expect(classifySurface(0, 0, 2.2, world)).toBe('wood');
    expect(classifySurface(0, 0, 1.05, world)).toBe('sand');
    expect(classifySurface(0, 0, 7.05, { heightAt: () => 7, shoreDist: () => -80, isWater: () => false })).toBe('asphalt');
    const st = { acc: 0, hit: false };
    stepTick(st, 3, 0.2, true);
    expect(st.hit).toBe(false);
    stepTick(st, 3, 0.2, true);
    expect(st.hit).toBe(true);
    stepTick(st, 3, 0.1, false);
    expect(st.acc).toBe(0);
    expect(characterCadence(1.4)).toBeGreaterThan(2);
    expect(stepSpacing(1.4, 'meme')).toBeLessThan(stepSpacing(1.4, 'original'));
    expect(stepSpacing(0, 'original')).toBe(0);
    const a = footstep(8000, 'asphalt'), w = footstep(8000, 'wood'), s = footstep(8000, 'sand');
    const energy = (b) => b.reduce((n, x) => n + x * x, 0);
    expect(energy(a)).toBeGreaterThan(0.01);
    expect(energy(w)).not.toBeCloseTo(energy(a), 2);
    expect(s.length).toBeGreaterThan(a.length);
  });
});

const UO_SHOP = {
  kind: 'shop', groundY: 2.4, height: 9,
  obb: { cx: -96.14, cz: -66.1, w: 11.62, d: 9.86, rotY: 1.866 },
};
const HERO = { cx: 180, cz: -20, r: 380 };

describe('building boxes on the boom', () => {
  const loc = { lx: 0, lz: 0 };

  test('魚町 on the phone stops the boom before the shop and its awning', () => {
    expect(outsidePhoneKit(UO_SHOP, HERO)).toBe(true);
    const feetY = 2.4;
    const yaw = Math.PI / 2;
    const want = desiredCam(-96, feetY, -72, yaw, {});
    const from = { x: want.tx, y: want.ty, z: want.tz };
    const phone = (x, y, z) => boxHit([UO_SHOP], x, y, z, { phone: true, hero: HERO }, loc);
    expect(phone(want.x, want.y, want.z)).toBe(true);
    const solved = solveBoom(from, want, phone, () => feetY, {});
    expect(solved.dist).toBeLessThan(0.5);
    expect(inBody(UO_SHOP, solved.x, solved.y, solved.z, loc)).toBe(false);
    expect(inAwing(UO_SHOP, solved.x, solved.y, solved.z, loc)).toBe(false);
    const open = Math.PI * 0.75;
    const wide = desiredCam(-96, feetY, -72, open, {});
    const held = solveBoom({ x: wide.tx, y: wide.ty, z: wide.tz }, wide, phone, () => feetY, {});
    expect(held.dist).toBeGreaterThan(4.2);
    expect(phone(held.x, held.y, held.z)).toBe(false);
  });

  test('a desktop interior and a carpark are not a solid body', () => {
    expect(inBody(UO_SHOP, -96, 4, -70, loc)).toBe(true);
    expect(boxHit([UO_SHOP], -96, 4, -70, { phone: false, hero: HERO }, loc)).toBe(false);
    const park = { kind: 'carpark', groundY: 2.4, height: 0.2, obb: UO_SHOP.obb };
    expect(inBody(park, -96, 3, -70, loc)).toBe(false);
  });
});

describe('character root pose', () => {
  test('the lean stays inside 6° and the landing is a 4 cm dip', () => {
    expect(characterTurnLean(0)).toBe(0);
    expect(characterTurnLean(8)).toBeCloseTo(-LEAN_MAX, 6);
    expect(Math.abs(characterTurnLean(8))).toBeLessThan(0.11);
    expect(landBob(0, 0.2)).toBe(0);
    expect(landBob(0.1, 0.2)).toBeCloseTo(-BODY_BOB, 5);
    expect(landBob(0.2, 0.2)).toBeCloseTo(0, 5);
    const root = {
      position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      rotation: { order: 'XYZ', set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      scale: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    };
    placeCharacterRoot(root, 1, 2, 3, 0.4, 1, -1);
    expect(root.rotation.order).toBe('YZX');
    expect(root.rotation.y).toBeCloseTo(0.4, 5);
    expect(root.rotation.z).toBeCloseTo(LEAN_MAX, 5);
    expect(root.position.y).toBeCloseTo(2 - BODY_BOB, 5);
    expect(root.scale.x).toBe(1);
    expect(root.scale.y).toBe(1);
    const eased = easeScalar(0, LEAN_MAX, 0.18, 0.18);
    expect(eased).toBeGreaterThan(LEAN_MAX * 0.5);
    expect(eased).toBeLessThan(LEAN_MAX);
    expect(easeScalar(0.02, 0.04, 0, 0.18)).toBe(0.04);
  });
});
