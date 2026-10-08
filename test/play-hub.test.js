import { test, expect } from 'bun:test';
import { registerMode, listModes, onModes, _resetModes } from '../src/anime/play/kit/modes.js';
import { planShells, boomDelay, FW_ALT, FW_PALETTE, FW_VOLLEY } from '../src/anime/play/kit/fireworks.js';
import { BLOOM_MAX, STAR_MAX, STAR_PX } from '../src/anime/play/kit/particles.js';
import { HUB_CSS } from '../src/anime/play/kit/hub.js';

test('modes register in order and a blank spec is refused', () => {
  _resetModes();
  const seen = [];
  const off = onModes((spec) => seen.push(spec.id));
  expect(registerMode({ id: 'katsuo', order: 20, title: { ja: '金のカツオさがし', en: 'Find the golden bonito' } })).toBe(true);
  expect(registerMode({ id: 'ippon', order: 10, title: { ja: '一本釣り', en: 'Pole fishing' } })).toBe(true);
  expect(registerMode({})).toBe(false);
  expect(registerMode({ id: 'x' })).toBe(false);
  expect(listModes().map((m) => m.id)).toEqual(['ippon', 'katsuo']);
  expect(seen).toEqual(['katsuo', 'ippon']);
  off();
  _resetModes();
  expect(listModes()).toEqual([]);
});

test('the finale is 5 to 7 shells, each a burst that fills the bay sky', () => {
  const shells = planShells({ seconds: 25, count: 6, seed: 1 });
  expect(shells).toHaveLength(6);
  expect(planShells({ count: 99 }).length).toBe(7);
  expect(planShells({ count: 1 }).length).toBe(5);
  expect(FW_ALT).toBe(250);
  expect(FW_PALETTE).toHaveLength(5);
  for (const s of shells) {
    expect(s.n).toBeGreaterThanOrEqual(180);
    expect(s.n).toBeLessThanOrEqual(220);
    expect(s.y).toBeGreaterThanOrEqual(236);
    expect(s.y).toBeLessThanOrEqual(264);
    expect(s.diam).toBeGreaterThanOrEqual(64);
    expect(s.diam).toBeLessThanOrEqual(88);
    expect(s.kind === 'kiku' || s.kind === 'botan').toBe(true);
    expect(s.t).toBeGreaterThan(0);
    expect(s.t).toBeLessThan(25);
  }
  expect(shells[0].kind).toBe('kiku');
  expect(shells[1].kind).toBe('botan');
  expect(boomDelay(340)).toBeCloseTo(1, 5);
  expect(boomDelay(0)).toBe(0);
  expect(BLOOM_MAX).toBeLessThanOrEqual(1);
  expect(BLOOM_MAX).toBeGreaterThan(0.5);
});

test('the finale builds to a volley: the last three shells open together, left, centre and right', () => {
  for (const count of [5, 6, 7]) {
    const shells = planShells({ seconds: 25, count, seed: 0xA11CE });
    expect(shells).toHaveLength(count);
    const v = shells.slice(-3);
    expect(v[2].t - v[0].t).toBeCloseTo(2 * FW_VOLLEY, 5);
    expect(v[0].t).toBeCloseTo(20, 5);
    // The volley still has room to open and fade before the end.
    expect(v[2].t + 2.4).toBeLessThan(25);
    expect(v[0].ox).toBeLessThan(v[1].ox);
    expect(v[1].ox).toBeLessThan(v[2].ox);
    expect(v[2].ox - v[0].ox).toBeGreaterThan(70);
    // The lead shells come one at a time, at least 3 s apart.
    const lead = shells.slice(0, -3);
    for (let i = 1; i < lead.length; i++) expect(lead[i].t - lead[i - 1].t).toBeGreaterThan(3);
    for (let i = 1; i < shells.length; i++) expect(shells[i].t).toBeGreaterThan(shells[i - 1].t);
  }
  const short = planShells({ seconds: 12, count: 5, seed: 1 });
  expect(short[short.length - 1].t + 1.5).toBeLessThan(12);
});

test('sparkle stars are 6 to 14 px with a core under the bright-pass threshold', () => {
  expect(STAR_PX).toBeGreaterThanOrEqual(6);
  expect(STAR_PX).toBeLessThanOrEqual(14);
  expect(STAR_MAX).toBeLessThan(1.05);
  expect(STAR_MAX).toBeGreaterThan(BLOOM_MAX);
});

test('the hub keeps the chosen card vivid, never squashes a card, and owns no bare .go', () => {
  // round 3: `.carousel.picked .mcard` (opacity .38) out-ranked `.mcard.open`, so the chosen card went grey.
  expect(HUB_CSS).toContain('.carousel.picked .mcard:not(.open)');
  expect(HUB_CSS).not.toMatch(/\.carousel\.picked \.mcard \{/);
  // round 3: with 7 modes the grid's auto rows shrank to nothing under overflow: hidden.
  expect(HUB_CSS).toContain('grid-auto-rows: max-content');
  expect(HUB_CSS).toContain('grid-template-columns: minmax(0, 1fr)');
  // round 3: the countdown's `go` state picked up the hub's はじめる button style. The hub scopes it now.
  expect(HUB_CSS).not.toMatch(/#klc-play \.go[\s{,]/);
  expect(HUB_CSS).toContain('#klc-play .mcard .go');
});
