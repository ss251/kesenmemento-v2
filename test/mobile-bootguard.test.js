// [mobile-perf] The crash-loop guard (core/bootguard.js): a phone whose last load died boots lighter instead of crashing again.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { BOOT_KEY, STALE_MS, crashCount, bootStart, bootOk, bootLeft, liteLevel, liteOverrides, liteNote } from '../src/anime/core/bootguard.js';

const store = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const T0 = 1_760_000_000_000;

describe('the state machine', () => {
  test('a first boot (nothing stored) is clean and marks itself loading', () => {
    const s = store();
    expect(bootStart(s, T0).n).toBe(0);
    expect(JSON.parse(s.m.get(BOOT_KEY))).toEqual({ state: 'loading', t: T0, n: 0 });
  });
  test('a load that never reached ok, booted again within 5 minutes, counts as a crash: 1, then 2', () => {
    const s = store();
    bootStart(s, T0);                          // dies
    expect(bootStart(s, T0 + 20_000).n).toBe(1);   // Safari's reload: lite 1, dies again
    expect(bootStart(s, T0 + 45_000).n).toBe(2);   // lite 2
  });
  test('ok resets the count; a stale loading state (older than 5 min) does not count', () => {
    const s = store();
    bootStart(s, T0); bootStart(s, T0 + 10_000);
    bootOk(s, T0 + 30_000);
    expect(JSON.parse(s.m.get(BOOT_KEY)).n).toBe(0);
    expect(bootStart(s, T0 + 60_000).n).toBe(0);
    expect(bootStart(s, T0 + 60_000 + STALE_MS + 1).n).toBe(0);
  });
  test('leaving during the load (pagehide) is not a crash; leaving after ok changes nothing', () => {
    const s = store();
    bootStart(s, T0);
    expect(bootLeft(s, T0 + 3000)).toBe(true);
    expect(bootStart(s, T0 + 5000).n).toBe(0);
    bootOk(s, T0 + 20_000);
    expect(bootLeft(s, T0 + 30_000)).toBe(false);
    expect(JSON.parse(s.m.get(BOOT_KEY)).state).toBe('ok');
  });
  test('a clock that went backwards, junk, or a throwing store never trips it', () => {
    expect(crashCount({ state: 'loading', t: T0, n: 0 }, T0 - 1000)).toBe(0);
    expect(crashCount({ state: 'loading', t: 'x', n: 0 }, T0)).toBe(0);
    expect(crashCount(null, T0)).toBe(0);
    const s = store(); s.m.set(BOOT_KEY, '{oops'); expect(bootStart(s, T0).n).toBe(0);
    const bad = { getItem() { throw new Error('private mode'); }, setItem() { throw new Error('quota'); } };
    expect(bootStart(bad, T0).n).toBe(0); expect(bootOk(bad)).toBe(false); expect(bootLeft(bad)).toBe(false);
    expect(bootStart(null, T0).n).toBe(0);
  });
  test('the count is capped', () => { expect(crashCount({ state: 'loading', t: T0, n: 50 }, T0 + 1)).toBe(9); });
});

describe('the lite level', () => {
  test('never on desktop, whatever the count; ?lite= pins it on a phone (and 0 turns it off)', () => {
    expect(liteLevel({ phone: false, n: 5 })).toBe(0);
    expect(liteLevel({ phone: false, param: '2', n: 0 })).toBe(0);
    expect(liteLevel({ phone: true, n: 0 })).toBe(0);
    expect(liteLevel({ phone: true, n: 1 })).toBe(1);
    expect(liteLevel({ phone: true, n: 4 })).toBe(2);
    expect(liteLevel({ phone: true, param: '1', n: 0 })).toBe(1);
    expect(liteLevel({ phone: true, param: '0', n: 3 })).toBe(0);
  });
  test('level 1 is lighter than the phone tier, level 2 lighter still; both keep a 1x canvas and no climb above the tier ratio', () => {
    expect(liteOverrides(0)).toBe(null);
    const a = liteOverrides(1), b = liteOverrides(2);
    expect(a.phone.atlasPage).toBe(1024); expect(b.phone.atlasPage).toBe(1024);
    for (const k of ['drawMax', 'farDist', 'heroR', 'treeNear', 'canvasMax', 'atlasDensity']) expect(b.phone[k]).toBeLessThan(a.phone[k]);
    expect(b.stream.l1).toBeLessThan(a.stream.l1);
    expect(a.canvasPR).toBe(1); expect(a.drMax).toBe(1); expect(b.quality.pixelRatio).toBe(1);
  });
  test('the note is short and non-alarming, in Japanese and English', () => {
    expect(liteNote('ja')).toBe('軽量モードで表示しています');
    expect(liteNote('en')).toBe('Showing a lighter version');
  });
});

describe('wiring', () => {
  const main = readFileSync(new URL('../src/anime/main.js', import.meta.url), 'utf8');
  test('main.js checks before the renderer is made, marks ok after 10 s on screen, and the stream takes the lighter radii', () => {
    expect(main.indexOf('const LITE = (() => {')).toBeGreaterThan(0);
    expect(main.indexOf('const LITE = (() => {')).toBeLessThan(main.indexOf('const renderer = new THREE.WebGLRenderer('));
    expect(main).toContain("const phoneTier = qName === 'phone' && !SHOT;");
    expect(main).toContain('if (LITE.phoneTier) setTimeout(() => bootOk(bootStore), 10000);');
    expect(main).toContain("addEventListener('pagehide', () => bootLeft(bootStore))");
    expect(readFileSync(new URL('../src/anime/world/explore/stream.js', import.meta.url), 'utf8')).toContain("quality === 'phone' && PHONE.streamRadii ? { ...RADII.phone, ...PHONE.streamRadii }");
  });
});
