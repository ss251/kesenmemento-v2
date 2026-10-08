// [feel] ホヤぼーや's credit is never covered (取扱要綱 第5条): it moves above the bottom-centre chips that share its place. The rules and
// their arithmetic; tools/anime/feel-modes.mjs checks the rects in Chrome.
import { test, expect, describe } from 'bun:test';
import { CSS, CREDIT_LIFT as L } from '../src/anime/play/avatar/index.js';

const bottomOf = (rule) => Number((CSS.match(new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*bottom: calc\\((\\d+)px')) || [])[1]);
const CREDIT_H = 2 * 13 * 1.45 + 16;   // two lines of 13 px at 1.45, padding 8 + 8

describe('the ホヤぼーや credit stays clear of the bottom-centre chips', () => {
  test('its own place: bottom centre at 96 px', () => {
    expect(CSS).toContain('#klc-play .hoya-credit { position: absolute; left: 50%; bottom: calc(96px');
  });
  test('above the もぐる chip (bottom 96 px, 44 px tall) when it shows, on any screen', () => {
    const b = bottomOf('body:has(.swim-dive:not([hidden])) #klc-play .hoya-credit');
    expect(b).toBeGreaterThanOrEqual(L.base + L.chip + L.gap);
  });
  test('above the kit prompt on a desktop (bottom 108 px); a phone keeps 96 (its prompt is at 168, clear above the credit)', () => {
    const desk = bottomOf('#klc-play:has(.prompt:not([hidden]):not(.top)) .hoya-credit');
    expect(desk).toBeGreaterThanOrEqual(L.promptDesk + L.chip + L.gap);
    expect(L.base + CREDIT_H).toBeLessThanOrEqual(L.promptPhone);   // phone: credit top 146 px < the prompt's 168
  });
  test('both on a phone: above the prompt (168 + 44 + 8)', () => {
    const both = bottomOf('body:has(.swim-dive:not([hidden])) #klc-play:has(.prompt:not([hidden]):not(.top)) .hoya-credit');
    expect(both).toBeGreaterThanOrEqual(L.promptPhone + L.chip + L.gap);
  });
  test('the move eases over 200 ms, and not at all under reduced motion', () => {
    expect(CSS).toMatch(/hoya-credit \{ transition: bottom \.2s/);
    expect(CSS).toMatch(/prefers-reduced-motion: reduce\) \{ #klc-play \.hoya-credit \{ transition: none; \}/);
  });
});
