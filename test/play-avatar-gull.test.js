import { describe, expect, test } from 'bun:test';
import { GULL, gullState, gullStep, wingPose } from '../src/anime/play/gull/flight.js';
import { canPerch, nearestPerch, readPerch } from '../src/anime/play/gull/perch.js';
import { flockStep, makeFlock } from '../src/anime/play/gull/boids.js';
import { createPuff, emitPuff, puffAlive, stepPuff } from '../src/anime/play/gull/feathers.js';
import { windGain } from '../src/anime/play/gull/voice.js';
import { gullModeSpec, lookoutPerch, nextCoach, readGullRecord, writeGullRecord } from '../src/anime/play/gull/mode.js';

const open = { floor: () => 0 };

describe('ウミネコ flight', () => {
  test('a level glide holds 11 m/s and sinks at 1.2 m/s', () => {
    const st = gullState(0, 40, 0, 0);
    let sink = 0;
    const y0 = st.y;
    for (let i = 0; i < 60; i++) {
      gullStep(st, {}, 1 / 60, open);
      sink += -st.vy / 60;
    }
    expect(st.speed).toBeCloseTo(GULL.glideSpeed, 1);
    expect(st.vy).toBeCloseTo(-GULL.glideSink, 1);
    expect(y0 - st.y).toBeCloseTo(GULL.glideSink, 1);
    expect(sink).toBeCloseTo(GULL.glideSink, 1);
  });

  test('a dive reaches the 28 m/s cap and a pull-up trades that speed for height', () => {
    const sky = { floor: () => -500 };
    const st = gullState(0, 80, 0, 0);
    for (let i = 0; i < 60 * 8; i++) gullStep(st, { pitch: -1 }, 1 / 60, sky);
    expect(st.speed).toBe(GULL.maxSpeed);
    expect(st.pitch).toBeLessThan(-0.8);
    const diving = st.speed;
    for (let i = 0; i < 90 && st.pitch < 0.25; i++) gullStep(st, { pitch: 1 }, 1 / 60, sky);
    const speed = st.speed, y = st.y;
    for (let i = 0; i < 50; i++) gullStep(st, { pitch: 1 }, 1 / 60, sky);
    expect(st.pitch).toBeGreaterThan(0.25);
    expect(st.y).toBeGreaterThan(y);
    expect(st.speed).toBeLessThan(speed);
    expect(st.speed).toBeLessThan(diving);
  });

  test('a flap adds lift and speed, then waits out the cooldown', () => {
    const st = gullState(0, 30, 0, 0);
    gullStep(st, { flap: true }, 1 / 60, open);
    expect(st.flapped).toBe(true);
    expect(st.speed).toBeGreaterThan(GULL.glideSpeed);
    expect(st.vy).toBeGreaterThan(1);
    const cd = st.flapCd;
    gullStep(st, { flap: true }, 1 / 60, open);
    expect(st.flapped).toBe(false);
    expect(st.flapCd).toBeLessThan(cd);
    st.flapCd = 0;
    gullStep(st, { flap: true }, 1 / 60, open);
    expect(st.flapped).toBe(true);
  });

  test('a stall drops the nose and recovers, and the sea is a skim, never a crash', () => {
    const st = gullState(0, 12, 0, 0);
    st.speed = 2;
    st.pitch = 0.4;
    for (let i = 0; i < 180; i++) gullStep(st, { pitch: 1 }, 1 / 60, open);
    expect(st.speed).toBeGreaterThan(GULL.stall);
    expect(st.y).toBeGreaterThan(0.4);
    const dive = gullState(0, 3, 0, 0);
    dive.speed = 28;
    dive.pitch = -1.1;
    for (let i = 0; i < 90; i++) gullStep(dive, { pitch: -1 }, 1 / 60, open);
    expect(dive.y).toBeGreaterThanOrEqual(GULL.skim - 1e-6);
    expect(dive.vy).toBeGreaterThanOrEqual(0);
  });

  test('a solid in front stops the step', () => {
    const st = gullState(0, 10, 0, 0);
    const x0 = st.x, z0 = st.z;
    gullStep(st, {}, 1 / 60, { floor: () => 0, solid: () => true });
    expect(st.x).toBe(x0);
    expect(st.z).toBe(z0);
  });

  test('banking turns, and wings flap, glide and flare', () => {
    const st = gullState(0, 20, 0, 0);
    const yaw = st.yaw;
    for (let i = 0; i < 40; i++) gullStep(st, { bank: 1 }, 1 / 60, open);
    expect(Math.abs(st.roll)).toBeGreaterThan(0.5);
    expect(Math.abs(st.roll)).toBeLessThanOrEqual(GULL.bankMax + 1e-6);
    expect(st.yaw).not.toBeCloseTo(yaw, 2);
    st.flapT = GULL.flapWindow * 0.5;
    expect(wingPose(st, false).flap).toBeGreaterThan(0.5);
    st.flapT = 0; st.agl = 10; st.vy = -0.1;
    expect(wingPose(st, false).flap).toBeLessThan(0.2);
    st.agl = 1; st.vy = -2;
    expect(wingPose(st, false).flare).toBeGreaterThan(0.4);
    st.perched = true;
    expect(wingPose(st, true).flap).toBe(0);
  });

  test('a landing flare noses up and bleeds a dive before the ground', () => {
    const st = gullState(0, 2.1, 0, 0);
    st.speed = 18;
    st.pitch = -0.55;
    st.vy = -2.2;
    const p0 = st.pitch;
    for (let i = 0; i < 12; i++) gullStep(st, {}, 1 / 60, { floor: () => 0 });
    expect(st.flaring).toBe(true);
    expect(st.pitch).toBeGreaterThan(p0);
    expect(st.y).toBeGreaterThan(GULL.skim);
    const near = gullState(0, 12, 0, 0);
    near.speed = 10;
    gullStep(near, {}, 1 / 60, { floor: () => 0, perch: { x: 2, y: 11, z: 0, d: 3, ok: true } });
    expect(near.flaring).toBe(true);
    expect(wingPose(near, false).flare).toBeGreaterThan(0.7);
  });
});

describe('perches and the flock', () => {
  test('the nearest roof wins, and a slow bird close enough can perch and launch', () => {
    const out = nearestPerch([[0, 0, 0], { x: 3, y: 4, z: 0 }, [10, 2, 10]], 2.5, 4, 0, {});
    expect(out.ok).toBe(true);
    expect(out.x).toBe(3);
    expect(out.d).toBeCloseTo(0.5, 5);
    expect(readPerch([1, 2], {})).toBe(false);
    expect(canPerch(4, 2, GULL)).toBe(true);
    expect(canPerch(12, 2, GULL)).toBe(false);
    const st = gullState(3, 4, 0, 0);
    st.speed = 4;
    gullStep(st, { perch: true }, 1 / 60, { floor: () => 0, perch: { x: 3.2, y: 4, z: 0.2, ok: true } });
    expect(st.perched).toBe(true);
    expect(st.x).toBeCloseTo(3.2, 5);
    gullStep(st, { launch: true }, 1 / 60, open);
    expect(st.perched).toBe(false);
    expect(st.speed).toBeGreaterThan(GULL.stall);
    expect(st.vy).toBeGreaterThan(0);
  });

  test('two to four gulls settle beside the leader and hold still when motion is reduced', () => {
    expect(makeFlock(3).length).toBe(3);
    expect(makeFlock(8).length).toBe(4);
    expect(makeFlock(1).length).toBe(2);
    const birds = makeFlock(3);
    const lead = { x: 10, y: 8, z: -4, yaw: 0 };
    flockStep(birds, lead, 0.05, false);
    expect(birds[0].inn).toBeLessThan(0.2);
    flockStep(birds, lead, 2, false);
    for (const b of birds) {
      const d = Math.hypot(b.x - lead.x, b.z - lead.z);
      expect(d).toBeGreaterThan(1.5);
      expect(d).toBeLessThan(6);
      expect(Math.abs(b.x - lead.x)).toBeGreaterThan(1.2);
      expect(b.y).toBeGreaterThan(lead.y);
    }
    const ph = birds[0].ph;
    flockStep(birds, lead, 0.5, true);
    expect(birds[0].ph).toBe(ph);
    expect(birds[0].roll).toBe(0);
  });

  test('a flap sheds feathers and the wind rises with speed', () => {
    const puff = createPuff(10);
    emitPuff(puff, 0, 4, 0, 0);
    expect(puffAlive(puff)).toBe(6);
    const y0 = puff.slots[0].y;
    stepPuff(puff, 0.05);
    expect(puff.slots[0].y).not.toBe(y0);
    stepPuff(puff, 1);
    expect(puffAlive(puff)).toBe(0);
    expect(windGain(28, false)).toBeGreaterThan(windGain(11, false));
    expect(windGain(11, false)).toBeGreaterThan(windGain(0, true));
  });
});

describe('ウミネコになる', () => {
  test('the lookout faces the bay and the wings open from folded', () => {
    const spot = lookoutPerch(() => 40);
    const face = Math.atan2(156 - (-513), -33 - (-692.1));
    expect(spot.y).toBeCloseTo(40.3 + 1.55, 5);
    const fx = -Math.sin(spot.yaw), fz = -Math.cos(spot.yaw);
    expect(fx).toBeCloseTo(Math.sin(face), 5);
    expect(fz).toBeCloseTo(Math.cos(face), 5);
    const folded = wingPose({ perched: true, open: 0 }, false);
    expect(folded.flap).toBe(0);
    expect(folded.flare).toBe(0);
    const openW = wingPose({ perched: true }, false);
    expect(openW.flap).toBeCloseTo(0.05, 5);
    expect(openW.flare).toBeCloseTo(0.42, 5);
    expect(wingPose({ perched: true, open: 0 }, true).flap).toBe(0);
  });

  test('the hub card and the coach steps', () => {
    const mem = { bag: {}, getItem(k) { return this.bag[k] ?? null; }, setItem(k, v) { this.bag[k] = v; } };
    const spec = gullModeSpec(() => true, mem);
    expect(spec.id).toBe('gull');
    expect(spec.title.ja).toBe('ウミネコになる');
    expect(spec.hook.en).toBe('Look down on the harbour');
    expect(spec.minutes).toBe(3);
    expect(spec.stars).toBe(1);
    expect(spec.isNew()).toBe(true);
    writeGullRecord(mem, { played: true, flap: false, dive: false });
    expect(spec.isNew()).toBe(false);
    expect(readGullRecord(mem).played).toBe(true);
    expect(nextCoach('flap', 'flap')).toBe('dive');
    expect(nextCoach('dive', 'dive')).toBe('done');
    expect(nextCoach('flap', null)).toBe('flap');
    expect(nextCoach('done', 'flap')).toBe('done');
  });
});
