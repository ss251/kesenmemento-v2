// [r3:rivers] The river ribbons take their colour per channel name (RIVER_TONE in town/rivers.js): Earth 2026-03-11 from above reads
// 大川 (c9) as muddy grey-green (L* 37 a* 0 b* -7) and 鹿折川 (c4) as dark slate (L* 31 b* -16); the default harbour blues rendered L* 47, b* -33.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as RV from '../src/anime/world/town/rivers.js';

const ROOT = join(import.meta.dir, '..');
const src = readFileSync(join(ROOT, 'src/anime/world/town/rivers.js'), 'utf8');
const lab = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const X = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047, Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], Z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return { L: 116 * f(Y) - 16, a: 500 * (f(X) - f(Y)), b: 200 * (f(Y) - f(Z)) };
};

describe('[r3:rivers] per-river water tone', () => {
  test('大川 and 鹿折川 have their own table; the ribbon looks the tone up by channel name', () => {
    expect(Object.keys(RV.RIVER_TONE).sort()).toEqual(['大川', '鹿折川']);
    expect(src).toContain('tones[ch.name] || dflt');
    expect(src).toContain('lerp(seaRiver, mo)');   // the mouth blend ends in the river's own tone (tn.sea), no longer the default bright #4f8fab
    for (const t of Object.values(RV.RIVER_TONE)) for (const k of ['deep', 'mid', 'edge', 'sea']) expect(t[k]).toMatch(/^#[0-9a-f]{6}$/);
  });
  test('the tones are dark and desaturated: no cobalt (the default deep / mid read L* 47, b* -33 from above)', () => {
    for (const [name, t] of Object.entries(RV.RIVER_TONE)) {
      const d = lab(t.deep), m = lab(t.mid), e = lab(t.edge), s = lab(t.sea);
      expect(d.L).toBeLessThan(m.L); expect(m.L).toBeLessThan(e.L);   // centre darkest, banks lighter, as the default ribbon
      expect(e.L).toBeLessThan(50);
      expect(s.L).toBeLessThanOrEqual(d.L + 0.5);   // the mouth fades to the deep tone, not to the bright default
      if (name === '大川') for (const c of [d, m, e]) { expect(c.b).toBeGreaterThan(-8); expect(Math.abs(c.a)).toBeLessThan(3); }   // grey-green, not blue
      if (name === '鹿折川') for (const c of [d, m, e]) expect(c.b).toBeGreaterThan(-18);   // Earth b* -16
    }
  });
  test('the default palette is kept for every other channel', () => {
    expect(src).toContain("deep: new THREE.Color('#336d95'), mid: new THREE.Color('#4a8fac'), edge: new THREE.Color('#6f9fb4'), sea: new THREE.Color('#4f8fab')");
  });
});
