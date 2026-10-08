// [mobile-play] The hub's はじめる with a mode whose world is built behind the title card (spec.prepare, kit/lazy.js):
// the card stays up until the world is ready, even when its own time is over or it is tapped away, and start() comes after.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { makeDom } from './lib/mini-dom.js';

const saved = {};
const KEYS = ['document', 'window', 'getComputedStyle', 'requestAnimationFrame', 'matchMedia', 'innerWidth', 'innerHeight'];
let dom, mountHub;

beforeAll(async () => {
  for (const k of KEYS) saved[k] = globalThis[k];
  dom = makeDom();
  // the two ParentNode methods the hub's paint() uses that the mini DOM does not have
  const P = dom.El.prototype;
  if (!P.append) P.append = function (...ns) { for (const n of ns) if (n && typeof n === 'object') this.appendChild(n); };
  if (!P.replaceChildren) P.replaceChildren = function (...ns) { for (const c of [...this.childNodes]) this.removeChild(c); this.append(...ns); };
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.getComputedStyle = () => ({ fontSize: '46px' });
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  globalThis.innerWidth = 390; globalThis.innerHeight = 844;
  ({ mountHub } = await import('../src/anime/play/kit/hub.js'));
});
afterAll(() => { for (const k of KEYS) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; } });

function hubFor() {
  const root = dom.document.createElement('div');
  dom.document.body.appendChild(root);
  const meta = {};
  const store = { get: () => meta, update: (k, fn) => fn(meta) };
  const hub = mountHub({ root, store, t: (k) => k, lang: () => 'ja', setOverlay: () => {}, reduced: () => true });
  return { hub, card: root.querySelector('.titlecard') };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const spec = (log, prepMs) => ({
  id: 'test', title: { ja: 'テスト', en: 'Test' }, hook: { ja: 'フック', en: 'Hook' },
  prepare: () => { log.push('prepare'); return sleep(prepMs).then(() => log.push('ready')); },
  start: () => { log.push('start'); },
});

describe('a mode built behind the title card', () => {
  test("the card outlasts its own time until the world is ready; start() comes after", async () => {
    const { hub, card } = hubFor();
    const log = [];
    const run = hub.run(spec(log, 900));
    await sleep(700);   // past the wipe (220 ms) and the reduced card's own 400 ms
    expect(card.hidden).toBe(false);
    expect(log).toEqual(['prepare']);
    await run;
    expect(log).toEqual(['prepare', 'ready', 'start']);
    expect(card.hidden).toBe(true);
    const s = hub.lastStart;
    expect(s.id).toBe('test');
    expect(s.prepMs).toBeGreaterThanOrEqual(850);
    expect(s.cardMs).toBeGreaterThanOrEqual(s.prepMs - 60);
  });

  test('a tap skips the card time, never the build', async () => {
    const { hub, card } = hubFor();
    const log = [];
    const run = hub.run(spec(log, 600));
    await sleep(300);
    hub.cancelTitle();   // the tap / Escape
    await sleep(100);
    expect(log).toEqual(['prepare']);
    expect(card.hidden).toBe(false);
    await run;
    expect(log).toEqual(['prepare', 'ready', 'start']);
  });

  test('a mode with no world to build starts when its card is done', async () => {
    const { hub } = hubFor();
    const log = [];
    await hub.run({ id: 'plain', title: { ja: 'x', en: 'x' }, start: () => { log.push('start'); } });
    expect(log).toEqual(['start']);
    expect(hub.lastStart.prepMs).toBe(null);
  });
});

describe("the cards' photos", () => {
  // the hub's photos are its <img> elements in the carousel, keyed by the mode they belong to
  const photoOf = (root, id) => root.querySelector(`.mcard[data-mode="${id}"] .still img`);
  test('the first press of the あそぶ pill starts every photo before the sheet opens; a repaint keeps the same image; it fades in once loaded', async () => {
    const { registerMode, _resetModes } = await import('../src/anime/play/kit/modes.js');
    _resetModes();
    registerMode({ id: 'ippon', order: 10, title: { ja: '一本釣り', en: 'Pole' }, art: '/data/play/art/ippon.webp' });
    registerMode({ id: 'gull', order: 30, title: { ja: 'ウミネコ', en: 'Gull' }, art: '/data/play/art/gull.webp' });
    const root = dom.document.createElement('div');
    const pill = dom.document.createElement('button');
    pill.setAttribute('data-act', 'play');
    root.appendChild(pill);
    dom.document.body.appendChild(root);
    const meta = {};
    const hub = mountHub({ root, store: { get: () => meta, update: (k, fn) => fn(meta) }, t: (k) => k, lang: () => 'ja', setOverlay: () => {}, reduced: () => true });
    hub.paint();
    const before = photoOf(root, 'ippon');
    expect(before.src).toBeFalsy();   // nothing is fetched until the visitor reaches for the hub
    dom.fire(pill, 'pointerdown');
    expect(photoOf(root, 'ippon').src).toBe('/data/play/art/ippon.webp');
    expect(photoOf(root, 'gull').src).toBe('/data/play/art/gull.webp');
    hub.show();   // the click that follows: the sheet is painted again
    const after = photoOf(root, 'ippon');
    expect(after).toBe(before);   // the same image (already loading), not a new one
    expect(after.classList.contains('in')).toBe(false);
    dom.fire(after, 'load');
    await Promise.resolve();
    expect(after.classList.contains('in')).toBe(true);
    hub.hide();
    _resetModes();
  });
});
