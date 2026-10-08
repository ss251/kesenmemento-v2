// [fish-fix] The leap with the inputs a player actually uses. On main 20751e0 「stick forward + 上へ + ダッシュ」 from the hub's quay
// start (0.9 m down) topped out at 4.3 m/s upward against a 5.15 m/s threshold, and a fish held at the surface had its climb damped
// every step: the leap only came when looking 20° up or starting 4 m down. Pure logic, no WebGL (logic.js, tune.js).
import { test, expect, describe } from 'bun:test';
import { createState, swimStep } from '../src/anime/play/underwater/logic.js';
import { TUNE } from '../src/anime/play/underwater/tune.js';

const deep = { bed: () => -6, shore: () => 30 };
const shallow = { bed: () => -1.5, shore: () => 30 };
/** Hold `input` from depth y0 for up to `secs`: when the leap came (s), and the apex. */
function leap(input, { y0 = -0.9, pitch = -0.08, env = deep, secs = 3 } = {}) {
  const s = createState(0, y0, 0, 0);
  s.pitch = pitch;
  let t = 0, at = null, apex = -9;
  while (t < secs) { swimStep(s, input, 1 / 60, env); t += 1 / 60; apex = Math.max(apex, s.y); if (s.mode === 'breach' && at === null) at = t; }
  return { at, apex };
}

describe('the leap, as a player does it', () => {
  test('stick forward + 上へ + ダッシュ from the quay start leaps within a quarter second, in deep and shallow water', () => {
    for (const env of [deep, shallow]) {
      const r = leap({ thrust: 1, lift: 1, dash: true }, { env });
      expect(r.at).not.toBeNull();
      expect(r.at).toBeLessThan(0.35);
      expect(r.apex).toBeGreaterThan(2.6);   // the same arc as before: the kick (9.4) did not change
    }
  });
  test('上へ + ダッシュ alone leaps too', () => {
    expect(leap({ thrust: 0, lift: 1, dash: true }).at).not.toBeNull();
  });
  test('a fish resting at the surface leaps with ダッシュ + 上へ', () => {
    const r = leap({ thrust: 1, lift: 1, dash: true }, { y0: TUNE.surfaceHold });
    expect(r.at).not.toBeNull();
    expect(r.at).toBeLessThan(0.3);
  });
  test('never without the dash: rising, looking straight up, at the surface', () => {
    expect(leap({ thrust: 1, lift: 1, dash: false }).at).toBeNull();
    expect(leap({ thrust: 1, lift: 1, dash: false }, { y0: -2, pitch: 1.15 }).at).toBeNull();
    expect(leap({ thrust: 1, lift: 1, dash: false }, { y0: TUNE.surfaceHold }).at).toBeNull();
    expect(TUNE.breachSpeed).toBeGreaterThan(TUNE.cruise);
  });
  test('a level dash under the surface stays in the water', () => {
    expect(leap({ thrust: 1, lift: 0, dash: true }).at).toBeNull();
    expect(leap({ thrust: 1, lift: 0, dash: true }, { y0: TUNE.surfaceHold, pitch: 0.2 }).at).toBeNull();
  });
});

describe('the hub start faces open water (logic.js quayStart, clearestYaw)', () => {
  const { quayStart, clearestYaw } = require('../src/anime/play/underwater/logic.js');
  // a straight quay along x at z = 0 (land for z < 0), water deepening seaward
  const env = { bed: (x, z) => -Math.min(6, 0.5 + z * 0.2), shore: (x, z) => z };
  test('no obstacle: seaward, as before', () => {
    const p = quayStart(0, 20, env);
    expect(Math.abs(Math.atan2(Math.sin(p.yaw - Math.PI), Math.cos(p.yaw - Math.PI)))).toBeLessThan(1e-9);   // facing +z
  });
  test('a pile 3 m dead ahead: the start turns to the open water beside it, no further than it must', () => {
    const p0 = quayStart(0, 20, env);
    const pile = { x: p0.x - Math.sin(p0.yaw) * 3, z: p0.z - Math.cos(p0.yaw) * 3, r: 0.6 };
    const clearAhead = (x, y, z, yaw) => {
      for (let d = 0.5; d <= 14; d += 0.5) { const qx = x - Math.sin(yaw) * d, qz = z - Math.cos(yaw) * d; if (Math.hypot(qx - pile.x, qz - pile.z) < pile.r) return d; }
      return 14;
    };
    const p = quayStart(0, 20, { ...env, clearAhead });
    expect(clearAhead(p.x, p.y, p.z, p.yaw)).toBeGreaterThanOrEqual(10);
    const off = Math.abs(Math.atan2(Math.sin(p.yaw - Math.PI), Math.cos(p.yaw - Math.PI)));
    expect(off).toBeGreaterThan(0.1);
    expect(off).toBeLessThanOrEqual(0.45 + 1e-9);
    expect(clearestYaw(0, -1, 7.5, Math.PI, () => 14)).toBe(Math.PI);
  });
});

describe('the hub start moves out when no heading is clear (logic.js quayStart)', () => {
  const { quayStart } = require('../src/anime/play/underwater/logic.js');
  const env = { bed: (x, z) => -Math.min(6, 0.5 + z * 0.2), shore: (x, z) => z };
  test('a row of piles 3 m out of the 7.5 m start, across every heading: the start goes further out, past them', () => {
    // anything between z 9 and 12 blocks; past that the water is open
    const clearAhead = (x, y, z, yaw) => {
      if (z > 8.5 && z < 12.5) return 0;
      for (let d = -2.6; d <= 14; d += 0.5) { const qz = z - Math.cos(yaw) * d; if (qz > 9 && qz < 12) return Math.max(0, d); }
      return 14;
    };
    const p = quayStart(0, 20, { ...env, clearAhead });
    expect(p.z).toBeGreaterThan(12.5);
    expect(clearAhead(p.x, p.y, p.z, p.yaw)).toBeGreaterThanOrEqual(10);
  });
});
