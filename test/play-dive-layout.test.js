// [fish-fix] Where the dive's boxes go, with the rects measured in Chrome on main 20751e0 (tools/anime/dive-shots.mjs,
// docs/play/shots/underwater/v7-before-measures.json): the coach's bubble never on the stick or the buttons it teaches,
// the species chip never on the HUD. The real pages are checked by test/play-dive.e2e.test.js.
import { test, expect, describe } from 'bun:test';
import { placeBubble } from '../src/anime/play/kit/coach.js';
import { findSlot } from '../src/anime/play/underwater/hud.js';

const R = (l, t, r, b) => ({ l, t, r, b });
const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
const box = (p, s) => R(p.x, p.y, p.x + s.w, p.y + s.h);

// iPhone portrait 390x844: the stick's ring and the four swim buttons (main 20751e0)
const PHONE = { w: 390, h: 844 };
const STICK = R(24, 630, 152, 758);
const BUTTONS = [R(298, 682, 374, 758), R(303, 598, 363, 658), R(238, 628, 298, 688), R(214, 696, 274, 756)];
const TOP_HUD = [R(10, 8, 188, 52), R(10, 60, 58, 108), R(10, 116, 134, 172), R(142, 120, 190, 168), R(198, 124, 285, 164), R(293, 57, 383, 148), R(312, 152, 380, 170)];
// landscape 844x390
const LAND = { w: 844, h: 390 };
const L_STICK = R(22, 196, 140, 314);
const L_BUTTONS = [R(759, 305, 829, 375), R(763, 227, 819, 283), R(703, 255, 759, 311), R(682, 318, 738, 374)];
const L_TOP = [R(10, 8, 330, 52), R(10, 72, 58, 118), R(10, 132, 142, 188), R(150, 136, 245, 184), R(253, 140, 422, 180), R(371, 5, 473, 125), R(506, 10, 830, 50), R(558, 58, 830, 96)];

describe('the coach bubble (kit/coach.js placeBubble)', () => {
  test('phone portrait, the swim coach on the stick: clear of the spotlight, the stick and every button', () => {
    const target = { x: 88, y: 694 }, size = { w: 351, h: 128 };
    const p = placeBubble({ target, size, view: PHONE, hard: [STICK, ...BUTTONS], soft: TOP_HUD });
    const b = box(p, size);
    expect(p.clear).toBe(true);
    for (const q of [STICK, ...BUTTONS, R(target.x - 66, target.y - 66, target.x + 66, target.y + 66)]) expect(hit(b, q)).toBe(false);
    expect(b.t).toBeGreaterThanOrEqual(12); expect(b.b).toBeLessThanOrEqual(PHONE.h - 12);
    expect(b.l).toBeGreaterThanOrEqual(12); expect(b.r).toBeLessThanOrEqual(PHONE.w - 12);
    for (const q of TOP_HUD) expect(hit(b, q)).toBe(false);   // there is room between the top HUD and the controls
  });

  test('the old rule (108 px above the target) put a 150 px bubble on its own target; the new one never does', () => {
    const target = { x: 195, y: 520 }, size = { w: 351, h: 150 };
    const p = placeBubble({ target, size, view: PHONE });
    expect(hit(box(p, size), R(target.x - 66, target.y - 66, target.x + 66, target.y + 66))).toBe(false);
    const old = { x: 12, y: target.y - 108 };
    expect(hit(box(old, size), R(target.x - 10, target.y - 10, target.x + 10, target.y + 10))).toBe(true);
  });

  test('phone landscape: no room above the stick, so the bubble goes beside it, clear of the buttons and the top HUD', () => {
    const target = { x: 81, y: 255 }, size = { w: 380, h: 110 };
    const p = placeBubble({ target, size, view: LAND, hard: [L_STICK, ...L_BUTTONS], soft: L_TOP });
    const b = box(p, size);
    expect(p.clear).toBe(true);
    for (const q of [L_STICK, ...L_BUTTONS]) expect(hit(b, q)).toBe(false);
    expect(b.l).toBeGreaterThan(L_STICK.r);
    for (const q of L_TOP) expect(hit(b, q)).toBe(false);
  });

  test('every phone width 360-430 and landscape: always clear of the controls', () => {
    for (const w of [360, 375, 390, 414, 430]) {
      const sx = w / 390;
      const stick = R(24, 630, 152, 758), btns = BUTTONS.map((q) => R(q.l * sx, q.t, q.r * sx, q.b));
      const size = { w: Math.min(380, Math.round(w * 0.9)), h: 128 };
      const p = placeBubble({ target: { x: 88, y: 694 }, size, view: { w, h: 844 }, hard: [stick, ...btns] });
      expect(p.clear).toBe(true);
      for (const q of [stick, ...btns]) expect(hit(box(p, size), q)).toBe(false);
    }
  });

  test('no room anywhere: the least covered spot, flagged', () => {
    const p = placeBubble({ target: { x: 100, y: 100 }, size: { w: 180, h: 180 }, view: { w: 200, h: 200 }, hard: [R(0, 0, 200, 200)] });
    expect(p.clear).toBe(false);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

describe('the species chip (underwater/hud.js findSlot)', () => {
  const chip = { w: 222, h: 60 };
  test('phone portrait: under the あそぶ row in the left column (it sat on あそぶ and 手帳 at a fixed 120 px)', () => {
    const p = findSlot({ size: chip, view: PHONE, rects: [...TOP_HUD, STICK, ...BUTTONS], xs: [16, (390 - 222) / 2, 390 - 222 - 16], band: { top: 8, bottom: 844 * 0.62 } });
    expect(p).not.toBeNull();
    expect(p.x).toBe(16);
    expect(p.y).toBeGreaterThanOrEqual(172 + 8);
    for (const q of [...TOP_HUD, STICK, ...BUTTONS]) expect(hit(box(p, chip), q)).toBe(false);
  });
  test('phone landscape: the left column is full (the HUD, then the stick), so another column', () => {
    const rects = [...L_TOP, L_STICK, ...L_BUTTONS];
    const p = findSlot({ size: chip, view: LAND, rects, xs: [16, (844 - 222) / 2, 844 - 222 - 16], band: { top: 8, bottom: 390 * 0.62 } });
    expect(p).not.toBeNull();
    for (const q of rects) expect(hit(box(p, chip), q)).toBe(false);
  });
  test('a spot that is still free is kept (the chip does not wander)', () => {
    const keep = { x: 16, y: 300 };
    const p = findSlot({ size: chip, view: PHONE, rects: TOP_HUD, xs: [16], band: { top: 8, bottom: 600 }, keep });
    expect(p).toEqual(keep);
  });
});
