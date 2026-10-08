import { describe, expect, test } from 'bun:test';
import {
  CAR, RACE, PEAK_SLIP, PEAK_MU, HAND_BRAKE_REAR, ASSIST_MAX, ASSIST_SLIP,
  lateralMu, lateralForce, counterSteer, carStep,
} from '../src/anime/world/explore/drive-model.js';

const DEG = Math.PI / 180;

describe('slip-angle grip', () => {
  test('peaks at about 8° and falls off after that', () => {
    const at0 = lateralMu(0);
    const below = Math.abs(lateralMu(4 * DEG));
    const peak = Math.abs(lateralMu(PEAK_SLIP));
    const slide = Math.abs(lateralMu(PEAK_SLIP + 16 * DEG));
    expect(at0).toBe(0);
    expect(peak).toBeCloseTo(PEAK_MU, 5);
    expect(peak).toBeGreaterThan(below);
    expect(slide).toBeLessThan(peak * 0.85);
    // a positive slip (sliding to the right) pushes the tyre back to the left
    expect(lateralMu(PEAK_SLIP)).toBeLessThan(0);
    expect(lateralMu(-PEAK_SLIP)).toBeGreaterThan(0);
  });
});

describe('handbrake', () => {
  test('rear lateral force drops to 35%', () => {
    const slip = PEAK_SLIP;
    const full = lateralForce(slip, 4200, 1);
    const held = lateralForce(slip, 4200, HAND_BRAKE_REAR);
    expect(HAND_BRAKE_REAR).toBe(0.35);
    expect(held).toBeCloseTo(full * 0.35, 6);
  });

  test('the lever steps the rear out: more slip than the same turn without it', () => {
    const input = { throttle: 0.4, steer: 1, counterSteer: false };
    let a = { x: 0, z: 0, yaw: 0, speed: 14, u: 14, steer: 0, vLat: 0, yawRate: 0 };
    let b = { ...a };
    const C = { ...CAR, vMax: 20, vBoost: 20 };
    for (let i = 0; i < 50; i++) {
      a = carStep(a, input, 1 / 60, C);
      b = carStep(b, { ...input, brake: true }, 1 / 60, C);
    }
    expect(Math.abs(b.slipR)).toBeGreaterThan(Math.abs(a.slipR));
    expect(Math.abs(b.slipR)).toBeGreaterThan(PEAK_SLIP * 0.5);
  });
});

describe('counter-steer assist', () => {
  test('bounded, opposing the yaw, and quiet until the rear slides', () => {
    expect(counterSteer(0, 1.2, 0.4, false)).toBe(0);
    expect(counterSteer(0, 1.2, ASSIST_SLIP * 0.5, true)).toBe(0);
    const add = counterSteer(0, 1.2, 0.35, true);
    expect(add).toBeLessThan(0);
    expect(Math.abs(add)).toBeLessThanOrEqual(ASSIST_MAX);
    expect(Math.abs(counterSteer(0, 40, 1, true))).toBeLessThanOrEqual(ASSIST_MAX);
    expect(counterSteer(0, -1.2, -0.35, true)).toBeGreaterThan(0);
    // already at full lock the way the assist wants: the player's hands win
    expect(counterSteer(1, -2, 0.5, true)).toBe(0);
    expect(counterSteer(-1, 2, 0.5, true)).toBe(0);
  });
});

describe('top speed', () => {
  test('street holds 40 km/h, boost 60, race 110', () => {
    let street = { x: 0, z: 0, yaw: 0, speed: 0, steer: 0 };
    for (let i = 0; i < 60 * 25; i++) street = carStep(street, { throttle: 1 }, 1 / 60);
    expect(street.speed).toBeGreaterThan(CAR.vMax * 0.9);
    expect(street.speed).toBeLessThanOrEqual(CAR.vMax + 1e-6);
    expect(street.speed * 3.6).toBeLessThan(50);

    let boost = { x: 0, z: 0, yaw: 0, speed: 0, steer: 0 };
    for (let i = 0; i < 60 * 25; i++) boost = carStep(boost, { throttle: 1, boost: true }, 1 / 60);
    expect(boost.speed).toBeGreaterThan(CAR.vBoost * 0.9);
    expect(boost.speed).toBeLessThanOrEqual(CAR.vBoost + 1e-6);
    expect(boost.speed).toBeGreaterThan(CAR.vMax + 1);

    let race = { x: 0, z: 0, yaw: 0, speed: 0, steer: 0 };
    for (let i = 0; i < 60 * 40; i++) race = carStep(race, { throttle: 1, boost: true }, 1 / 60, RACE);
    const kmh = race.speed * 3.6;
    expect(kmh).toBeGreaterThan(108);
    expect(race.speed).toBeLessThanOrEqual(RACE.vMax + 1e-6);
    expect(kmh).toBeLessThanOrEqual(110.05);
  });
});

describe('no tunnelling at race speed', () => {
  test('a thin wall stops the body even when one step is longer than the wall', () => {
    const wallX = 15, thick = 0.08;
    const hit = (x, z) => x >= wallX && x <= wallX + thick && z >= -6 && z <= 6;
    // yaw −π/2 faces east (+X). 110 km/h, a 1/30 s step moves about a metre — well past a 8 cm wall.
    let s = { x: 0, z: 0, yaw: -Math.PI / 2, speed: RACE.vMax, u: RACE.vMax, steer: 0, vLat: 0, yawRate: 0 };
    const dt = 1 / 30;
    let farthest = 0;
    for (let i = 0; i < 90; i++) {
      s = carStep(s, { throttle: 1 }, dt, RACE, null, hit);
      const nose = s.x + Math.cos(0) * CAR.radius;
      // facing +X, the nose is at x + radius
      const front = s.x + CAR.radius;
      if (front > farthest) farthest = front;
      expect(s.x).toBeLessThan(wallX);
      expect(front).toBeLessThan(wallX + thick);
    }
    expect(farthest).toBeGreaterThan(wallX - CAR.radius - 0.4);
    expect(s.x + CAR.radius).toBeLessThanOrEqual(wallX + 0.05);
  });
});
