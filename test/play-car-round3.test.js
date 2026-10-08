import { describe, expect, test } from 'bun:test';
import { CRISP_NIGHT, applyCrispNight } from '../src/anime/play/race/night.js';
import { PUFF, puffScale, screenCap, shouldPuff } from '../src/anime/play/race/smoke.js';
import { raceProgress, raceIsNew, raceModeSpec } from '../src/anime/play/car/mode.js';

function storeWith(metaCar, course) {
  const mem = { meta: { car: metaCar || {} }, courses: course ? { 'race-minato': course } : {} };
  return {
    get(section) { return mem[section] ? JSON.parse(JSON.stringify(mem[section])) : {}; },
  };
}

describe('crisp night', () => {
  test('the wide glow that veiled the street is gone, and the fill is lifted', () => {
    expect(CRISP_NIGHT.glow).toBeLessThanOrEqual(0.08);
    expect(CRISP_NIGHT.bloom).toBeLessThanOrEqual(0.35);
    expect(CRISP_NIGHT.hemiI).toBeGreaterThan(0.8);
    const u = {
      uBloom: { value: 0.82 },
      uGlow: { value: 0.54 },
      uExposure: { value: 1.03 },
      uVignette: { value: 0.22 },
      uNeutral: { value: 0 },
    };
    const hemi = { intensity: 0.43, color: { setHex() {} }, groundColor: { setHex() {} } };
    const sun = { intensity: 0.4, color: { setHex() {} } };
    applyCrispNight({ pipeline: { compMat: { uniforms: u } }, sky: { hemi, sun } });
    expect(u.uGlow.value).toBe(CRISP_NIGHT.glow);
    expect(u.uBloom.value).toBe(CRISP_NIGHT.bloom);
    expect(u.uNeutral.value).toBe(1);
    expect(u.uVignette.value).toBeLessThan(0.12);
    expect(hemi.intensity).toBe(CRISP_NIGHT.hemiI);
    expect(sun.intensity).toBe(CRISP_NIGHT.sunI);
  });
});

describe('drift puffs', () => {
  test('they grow, stay under the bloom threshold, and fit in 30 % of the frame', () => {
    expect(Math.max(...PUFF.color)).toBeLessThan(1.05);
    expect(puffScale(1)).toBeCloseTo(PUFF.base, 5);
    expect(puffScale(0)).toBeGreaterThan(puffScale(1));
    expect(puffScale(0)).toBeLessThanOrEqual(PUFF.maxWorld);
    const fov = 55;
    for (const dist of [2.2, 3.5, 6, 12]) {
      const capped = screenCap(puffScale(0), dist, fov);
      const tan = Math.tan((fov * Math.PI / 180) / 2);
      const frac = capped / (2 * Math.max(1.2, dist) * tan);
      expect(frac).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });

  test('smoke comes only from a slide, and reduced motion stays quiet', () => {
    expect(shouldPuff(true, false)).toBe(true);
    expect(shouldPuff(false, false)).toBe(false);
    expect(shouldPuff(true, true)).toBe(false);
  });
});

describe('ドライブ・レース card', () => {
  test('registers a medal, a best lap, and a garage step', () => {
    const spec = raceModeSpec({ store: storeWith(), start() {}, garage: true });
    expect(spec.id).toBe('race');
    expect(spec.title.ja).toBe('ドライブ・レース');
    expect(spec.how.ja).toHaveLength(3);
    expect(spec.how.ja[2]).toContain('ガレージ');
    expect(spec.how.en[2].toLowerCase()).toContain('garage');
    expect(spec.progress()).toBe(null);
    expect(spec.isNew()).toBe(true);
    expect(spec.players).toBe(1);
  });

  test('a saved lap shows the medal and the time', () => {
    const store = storeWith(
      { race: { bestLapMs: 72000, medal: 'gold' } },
      { best: 150000, medal: 'gold', runs: 2 },
    );
    const line = raceProgress(store);
    expect(line.ja).toBe('金 · ベスト 1:12.00');
    expect(line.en).toBe('Gold · Best 1:12.00');
    expect(raceIsNew(store)).toBe(false);
  });

  test('without a garage the third step is the drift', () => {
    const spec = raceModeSpec({ store: storeWith(), start() {}, garage: false });
    expect(spec.how.ja[2]).toContain('ドリフト');
    expect(spec.how.ja.join('')).not.toContain('ガレージ');
  });
});
