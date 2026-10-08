// [feel] ホヤぼーや's credit is on screen, uncovered, whenever he is shown (取扱要綱 第5条), and never over him or the thumbs: the rules and
// their arithmetic per screen. tools/anime/feel-modes.mjs and feel-stills.mjs check the rects in Chrome.
import { test, expect, describe } from 'bun:test';
import { CSS, CREDIT_LIFT as L } from '../src/anime/play/avatar/index.js';
import { padScale, clusterLayout, layoutBounds } from '../src/anime/ui/touchpad.js';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bottomOf = (rule) => Number((CSS.match(new RegExp(esc(rule) + '\\s*\\{[^}]*bottom: calc\\((\\d+)px')) || [])[1]);
const CREDIT_H = 2 * 13 * 1.45 + 16;   // two lines of 13 px at 1.45, padding 8 + 8 (54 px measured in Chrome)

describe('a desktop (no pad): on the right under the search; a narrow window: bottom centre, above the chips that share it', () => {
  test('wider than 720 px: right 18 px, 112 px down, under the search button (it ends at 104 px), off him (bottom centre sat on his legs)', () => {
    const desk = CSS.slice(CSS.indexOf('@media (min-width: 721px)'));
    expect(desk).toMatch(/^@media \(min-width: 721px\) \{\s*body:not\(\.klc-pad\) #klc-play \.hoya-credit \{ left: auto; right: calc\(18px \+ env\(safe-area-inset-right, 0px\)\); transform: none; bottom: auto; top: calc\(112px \+ env\(safe-area-inset-top, 0px\)\); \}/);
  });
  test('no lift reaches a desktop: each sits in the narrow-window block (a bottom beside the top would stretch the caption)', () => {
    const narrow = CSS.slice(CSS.indexOf('@media (max-width: 720px) {'), CSS.indexOf('@media (max-width: 720px) and (orientation: portrait)'));
    const lifts = [...CSS.matchAll(/^.*:has\(\.(swim-dive|prompt).*hoya-credit.*$/gm)].map((m) => m[0]);
    expect(lifts.length).toBe(2);
    for (const l of lifts) expect(narrow).toContain(l);
  });
  test('a narrow window: bottom centre at 96 px, above the もぐる chip (bottom 96 px, 44 px tall) when it shows', () => {
    expect(CSS).toContain('#klc-play .hoya-credit { position: absolute; left: 50%; bottom: calc(96px');
    expect(bottomOf('body:not(.klc-pad):has(.swim-dive:not([hidden])) #klc-play .hoya-credit')).toBeGreaterThanOrEqual(L.base + L.chip + L.gap);
  });
  test('a narrow window keeps 96 under its prompt (at 168 px); with both, it goes above the prompt', () => {
    expect(L.base + CREDIT_H).toBeLessThanOrEqual(L.promptPhone);
    expect(bottomOf('body:not(.klc-pad):has(.swim-dive:not([hidden])) #klc-play:has(.prompt:not([hidden]):not(.top)) .hoya-credit')).toBeGreaterThanOrEqual(L.promptPhone + L.promptH + L.gap);
  });
});

describe('a phone with the pad: its own band (portrait), under the search (landscape), never lifted into the thumbs', () => {
  test('portrait: the band the emil-ui lane keeps free (24 px up, under the pad’s 78 px floor)', () => {
    const b = bottomOf('body.klc-pad #klc-play .hoya-credit');
    expect(b).toBe(24);
    expect(b + CREDIT_H).toBeLessThanOrEqual(78 + 1e-9);   // 24 + 54 = 78: the pad's band floor (emil-ui PHONE_BAND)
    expect(CSS).toMatch(/@media \(max-width: 720px\) and \(orientation: portrait\) \{\s*body\.klc-pad #klc-play \.hoya-credit \{ bottom: calc\(24px/);
  });
  test('no lift with the pad: every lift is for body:not(.klc-pad)', () => {
    for (const m of CSS.matchAll(/^.*:has\(\.(swim-dive|prompt).*hoya-credit.*$/gm)) expect(m[0]).toContain('body:not(.klc-pad)');
  });
  test('landscape: one line on the right under the search button, off him and above the pad’s cluster (it owns the bottom-right corner)', () => {
    const land = CSS.slice(CSS.indexOf('@media (orientation: landscape) and (max-height: 520px)'));
    expect(land).toMatch(/body\.klc-pad #klc-play \.hoya-credit \{ left: auto; right: calc\(14px \+ env\(safe-area-inset-right, 0px\)\); transform: none;/);
    expect(land).toMatch(/bottom: auto; top: calc\(112px \+ env\(safe-area-inset-top, 0px\)\)/);
    expect(land).toMatch(/hoya-credit span \{ display: inline; \}/);
    // the pad's own layout (ui/touchpad.js) at 844x390, with no inset and with an iPhone's 21 px bottom inset: the cluster's top stays
    // below the credit's bottom (112 + one 11.5 px line at 1.4 + 8 px of padding = 136 px). Every pad mode has at most 4 buttons today
    // (walk, fly, the swim and the gull 4; drive, the ship and the missions 3); up to 5 keep a full 8 px gap, and even 8 would not touch it.
    const vw = 844, vh = 390, sc = padScale(vw, vh), M = 12 * sc + 4, creditBottom = 112 + 11.5 * 1.4 + 8;
    for (const inset of [0, 21]) for (let n = 1; n <= 8; n++) {
      const top = vh - inset - M - layoutBounds(clusterLayout(n, { scale: sc })).h;
      expect(top).toBeGreaterThan(creditBottom + (n <= 5 ? 8 : 0));
    }
    // and the search button (top 58 px, 38 px tall in Chrome) ends above it
    expect(58 + 38 + 8).toBeLessThanOrEqual(112);
  });
  test('the あそぶ hub covers him: the credit steps back with him', () => {
    expect(CSS).toContain('#klc-play.hub-open .hoya-credit { visibility: hidden; }');
  });
  test('the move eases over 200 ms, and not at all under reduced motion', () => {
    expect(CSS).toMatch(/hoya-credit \{ transition: bottom \.2s/);
    expect(CSS).toMatch(/prefers-reduced-motion: reduce\) \{ #klc-play \.hoya-credit \{ transition: none; \}/);
  });
});
