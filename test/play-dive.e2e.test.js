// [fish-fix] 海の中 end to end, as a person plays it, in headless Chrome: a phone (390x844, DPR 3, iPhone UA, CDP touches) and a
// desktop (1440x900, mouse and keys). Enter from the あそぶ hub (はじめる) and from the shore's 「もぐる」; the first-swim coach
// (one line, never on the stick or the buttons it teaches, nothing else teaching at the same time); the fish on screen; a drag
// (or W) that moves it; 上へ; あがる; everything restored, and a phone frees the dive's world (deploy #6). Heavy (it builds the
// app and loads the town), so it runs only through the machine gate:
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=9582 bun test ./test/play-dive.e2e.test.js
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { buildAndServe, launch, phonePage, fingers, center, waitGo, sleep } from '../tools/anime/pad-lib.mjs';
import { MEASURE, mouse, key } from '../tools/anime/dive-shots.mjs';
import { STICK, padScale } from '../src/anime/ui/touchpad.js';
import STR from '../data/play-i18n.json';

const RUN = process.env.KLC_E2E === '1' && process.env.KLC_GATE === '1';
const PORT = Number(process.env.KLC_E2E_PORT || 9582);
const d = RUN ? describe : describe.skip;
const T = (name, fn) => test(name, fn, 300000);

const hit = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
const COACH_UP = "(() => { const c = document.querySelector('#klc-play .coach'); return !!c && !c.hidden; })()";
const ACTIVE = '!!(window.__swim && window.__swim.active)';
/** The page's own errors. Not counted: the local server has no /api/live, and a headless Chrome on this machine sometimes fails to
 *  fetch the web fonts (net::ERR_CERT_VERIFIER_CHANGED on fonts.gstatic.com): network conditions, not the page's code. */
const pageErrors = (page) => page.errors().filter((e) => !/api\/live/.test(e.text) && !/Failed to load resource: net::ERR_[A-Z_]+ https:\/\/fonts\.(gstatic|googleapis)\.com\//.test(e.text));
/** What the visitor sees besides MEASURE: the land controls, and the HUD rects the chip must keep off. */
const LAND = `(() => {
  const shown = (sel) => { const e = document.querySelector(sel); if (!e) return false; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.width > 1; };
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const hud = [...document.querySelectorAll('#klc-ui button, #klc-ui .brand, #klc-ui .pbar, #klc-ui .chip, #klc-x .mini, #klc-x .xbar > *, #klc-play .topbar > *, #klc-play .counters > *, #klc-pad .ghost, #klc-pad .cluster .btn, #klc-play .cluster .act')]
    .filter((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.width > 1 && r.width * r.height < innerWidth * innerHeight * 0.4 && e.dataset.show !== '0'; })
    .map((e) => ({ id: (e.className || e.tagName) + (e.dataset.id ? ':' + e.dataset.id : '') + (e.dataset.act ? ':' + e.dataset.act : ''), ...R(e) }));
  return { board: shown('#klc-board.show'), drive: shown('#klc-x [data-act="drive"]'), view: shown('#klc-ui [data-act="view"]'), credit: shown('#klc-play .hoya-credit'), swim: document.body.classList.contains('klc-swim'), hud };
})()`;

/** Shared checks for a dive that has just started. */
async function checkEntered(page) {
  const m = await page.eval(MEASURE);
  expect(m.active).toBe(true);
  expect(m.worlds?.swim?.built).toBe(true);
  // the fish: drawn, in front of the camera, near the middle, a readable size
  expect(m.fish).toMatchObject({ visible: true, chain: true, inScene: true, onScreen: true });
  expect(Math.abs(m.fish.ndc[0])).toBeLessThan(0.3);
  expect(m.fish.spanPx).toBeGreaterThan(m.vh * 0.18);
  // the HUD: only what the dive needs
  const l = await page.eval(LAND);
  expect(l).toMatchObject({ board: false, drive: false, view: false, credit: false, swim: true });
  // one thing at a time: on a first dive the species chip waits for the coach; otherwise it is off every HUD rect
  if (await page.eval(COACH_UP)) expect(m.rects.chip).toBeUndefined();
  else await checkChip(page);
  return m;
}
/** The species chip is on screen, off every HUD rect and the controls. */
async function checkChip(page) {
  const m = await page.eval(MEASURE);
  const l = await page.eval(LAND);
  const chip = m.rects.chip;
  expect(chip).toBeTruthy();
  for (const q of l.hud) expect([q.id, hit(chip, q)]).toEqual([q.id, false]);
}

/** One build, one server, one Chrome for the whole file: a second Bun.build in the same process fails here with misplaced
 *  "Could not resolve" errors (Bun 1.3.14), so the desktop pages use the phone's build. */
let shared = null;
const app = () => (shared ||= (async () => { const { srv } = await buildAndServe(PORT); const browser = await launch({ quiet: true }); return { srv, browser }; })());
if (RUN) afterAll(async () => { if (!shared) return; const { srv, browser } = await shared; await browser?.close(); srv?.stop(); }, 60000);

d('海の中 on a phone (390x844 @3, touch)', () => {
  let browser, srv, page, f, before;
  const tap = async (sel) => { const c = await center(page, sel); expect(c).not.toBeNull(); await f.tap(c.x, c.y); return c; };
  beforeAll(async () => {
    ({ srv, browser } = await app());
    page = await phonePage(browser, { width: 390, height: 844, dpr: 3 });
    await page.S('Storage.clearDataForOrigin', { origin: srv.url.replace(/\/$/, ''), storageTypes: 'local_storage,indexeddb' }).catch(() => {});
    await page.goto(`${srv.url}index.html?lang=ja`);
    await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
    f = fingers(page);
  }, 330000);
  afterAll(async () => { await f?.release?.().catch(() => {}); await page?.S('Page.close').catch(() => {}); }, 60000);

  T('enter from the hub: 「まちへ出る」, あそぶ, the 「海の中」 card, はじめる; the dive is ready on its first frame', async () => {
    await waitGo(page);
    await tap('#go');
    await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
    await sleep(1200);
    if (await page.waitFor("(() => { const c = document.querySelector('#klc-pad .coach'); return !!c && !c.hidden; })()", { timeout: 8000 }).catch(() => false)) { await tap('#klc-pad .coach .ok'); await sleep(500); }
    await page.waitFor("(() => { const b = document.querySelector('#klc-play [data-act=\"play\"]'); return !!b && !b.hidden && b.getBoundingClientRect().width > 0; })()", { timeout: 30000 });
    before = await page.eval("(() => { const p = window.__ctx.playerObj, c = window.__ctx.camera; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, fly: p.fly, fov: c.fov, pad: window.__pad.mode }; })()");
    await tap('#klc-play [data-act="play"]');
    await page.waitFor("!!document.querySelector('#klc-play .mcard[data-mode=\"underwater\"]')", { timeout: 15000 });
    await page.eval("document.querySelector('#klc-play .mcard[data-mode=\"underwater\"]').scrollIntoView({ inline: 'center', block: 'center' })");
    await sleep(700);
    await tap('#klc-play .mcard[data-mode="underwater"] .still');
    await page.waitFor("(() => { const g = document.querySelector('[data-go=\"underwater\"]'); return !!g && g.getBoundingClientRect().width > 0; })()", { timeout: 10000 });
    await page.eval("document.querySelector('[data-go=\"underwater\"]').scrollIntoView({ block: 'center' })");
    await sleep(400);
    await tap('[data-go="underwater"]');
    await page.waitFor(ACTIVE, { timeout: 30000 });
    await page.frames(2);
    // the title card warmed the world: built and warmed before the first frame
    const w = await page.eval('window.__playWorlds().swim');
    expect(w.built).toBe(true);
    expect(w.warmMs).toBeGreaterThan(0);
    expect(await page.eval('window.__pad.mode')).toBe('swim');
    await sleep(800);
    await checkEntered(page);
  });

  T('the coach: one line, on the stick, never on the stick or the buttons, nothing else teaching; わかった closes it', async () => {
    await page.waitFor(COACH_UP, { timeout: 8000 });
    await sleep(900);   // typed out
    const m = await page.eval(MEASURE);
    expect(m.coachText).toBe(STR.ja['play.swim.coach.touch']);
    expect(m.hintText).toBeNull();   // one teacher at a time
    const bubble = m.rects.coach;
    for (const id of ['stick', 'btn:swim-up', 'btn:swim-down', 'btn:swim-dash', 'btn:swim-out']) {
      expect(m.rects[id]).toBeTruthy();
      expect([id, hit(bubble, m.rects[id])]).toEqual([id, false]);
    }
    // the spotlight is on the stick
    const hole = m.rects.coachHole, stick = m.rects.stick;
    expect(Math.abs((hole.l + hole.r) / 2 - (stick.l + stick.r) / 2)).toBeLessThan(2);
    // its text is one block: the line and the button never overlap
    const lines = await page.eval("(() => { const p = document.querySelector('#klc-play .coach .say p').getBoundingClientRect(), o = document.querySelector('#klc-play .coach .ok').getBoundingClientRect(); return { p: { l: p.left, t: p.top, r: p.right, b: p.bottom }, o: { l: o.left, t: o.top, r: o.right, b: o.bottom } }; })()");
    expect(hit(lines.p, lines.o)).toBe(false);
    // the fish is not dimmed: no dim layer
    expect(await page.eval("document.querySelector('#klc-play .coach').classList.contains('dim')")).toBe(false);
    await tap('#klc-play .coach .ok');
    await page.waitFor(`!${COACH_UP}`, { timeout: 4000 });
    await sleep(300);
    await checkChip(page);   // the species chip comes in now, off every HUD rect and control
  });

  T('a drag on the stick moves the fish forward at once, and it stays on screen', async () => {
    const a = await page.eval('({ ...window.__swim.state })');
    const g = await center(page, '#klc-pad .ghost');
    const T0 = STICK.travel * padScale(390, 844);
    await f.down1(1, g.x, g.y);
    await f.drag(1, g.x, g.y - 0.8 * T0, 4);
    await sleep(250);
    const early = await page.eval('({ ...window.__swim.state })');
    expect(Math.hypot(early.vx, early.vz)).toBeGreaterThan(1);   // it answers in a quarter of a second
    await sleep(1400);
    const m = await page.eval(MEASURE);
    await f.up(1);
    const b = await page.eval('({ ...window.__swim.state })');
    const moved = Math.hypot(b.x - a.x, b.z - a.z);
    expect(moved).toBeGreaterThan(3);
    const fwd = (b.x - a.x) * -Math.sin(a.yaw) + (b.z - a.z) * -Math.cos(a.yaw);
    expect(fwd).toBeGreaterThan(moved * 0.8);
    expect(m.fish.onScreen).toBe(true);
    expect(Math.abs(m.fish.ndc[0])).toBeLessThan(0.35);
    // the next lesson comes now that the fish swims, alone, near the thumbs and off every control and the chip
    expect(m.hintText).toBe(STR.ja['play.swim.lesson.leap']);
    for (const id of ['btn:swim-up', 'btn:swim-down', 'btn:swim-dash', 'btn:swim-out', 'chip']) if (m.rects[id]) expect([id, hit(m.rects.hint, m.rects[id])]).toEqual([id, false]);
  });

  T('上へ (hold) rises toward the surface', async () => {
    await sleep(600);
    const a = await page.eval('window.__swim.state.y');
    const c = await center(page, '#klc-pad .btn[data-id="swim-up"]');
    expect(c).not.toBeNull();
    await f.down1(2, c.x, c.y);
    await sleep(900);
    const b = await page.eval('window.__swim.state.y');
    await f.up(2);
    expect(b).toBeGreaterThan(a + 0.15);
  });

  T('the leap as a player tries it (stick forward + ダッシュ + 上へ), and a tap in the air spins', async () => {
    await sleep(600);
    const g = await center(page, '#klc-pad .ghost');
    const T0 = STICK.travel * padScale(390, 844);
    const dash = await center(page, '#klc-pad .btn[data-id="swim-dash"]');
    const up = await center(page, '#klc-pad .btn[data-id="swim-up"]');
    await f.tap(dash.x, dash.y);   // the dash toggle: on
    await f.down1(1, g.x, g.y);
    await f.drag(1, g.x, g.y - 0.8 * T0, 3);
    await f.down1(2, up.x, up.y);
    const leapt = await page.waitFor("window.__swim.state.mode === 'breach'", { timeout: 4000, poll: 50 }).catch(() => false);
    await f.up(2);
    await f.up(1);
    expect(leapt).toBe(true);
    await page.waitFor('window.__swim.state.y > 1.3', { timeout: 2000, poll: 30 });
    await f.tap(300, 330);   // the open water on the look side: no button there
    await sleep(150);
    const s = await page.eval("(() => { const h = document.querySelector('.swim-ui .swim-hint'); return { spinV: window.__swim.state.spinV, trick: window.__swim.state.trick, hint: h.hidden ? null : h.textContent }; })()");
    expect(s.trick).toBe(1);
    expect(s.spinV).toBeGreaterThan(0);
    expect(s.hint).toBe(STR.ja['play.swim.lesson.spin.touch']);
    await page.waitFor("window.__swim.state.mode === 'swim'", { timeout: 8000 });
    await f.tap(dash.x, dash.y);   // the dash toggle: off
    await sleep(400);
  });

  T('あがる: back where you were, everything restored, and the phone frees the dive world', async () => {
    const lbl = await page.eval("document.querySelector('#klc-pad .btn[data-id=\"swim-out\"]').textContent.trim()");
    expect(lbl).toContain(STR.ja['play.swim.surface']);
    await tap('#klc-pad .btn[data-id="swim-out"]');
    await page.waitFor(`!${ACTIVE}`, { timeout: 8000 });
    await sleep(900);
    const r = await page.eval("(() => { const p = window.__ctx.playerObj, c = window.__ctx.camera; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, fly: p.fly, fov: c.fov, up: c.up.y, pad: window.__pad.mode, chip: !document.querySelector('.swim-ui .swim-chip').hidden, world: window.__playWorlds().swim.built }; })()");
    expect(r.fly).toBe(before.fly);
    expect(Math.hypot(r.x - before.x, r.z - before.z)).toBeLessThan(1);
    expect(Math.abs(r.fov - before.fov)).toBeLessThan(0.1);
    expect(r.up).toBeCloseTo(1, 5);
    expect(r.pad).toBe(before.pad);
    expect(r.chip).toBe(false);
    expect(r.world).toBe(false);
    const l = await page.eval(LAND);
    expect(l.swim).toBe(false);
    expect(pageErrors(page)).toEqual([]);
  });

  T('from the shore: standing at the water, 「もぐる」 takes you in, behind the title card, and builds the world again', async () => {
    // spots at the water near the town's walk spawn, a step or two from the edge (skipping any by the berth, so no other prompt is up)
    const spots = await page.eval(`(() => {
      const L = window.__ctx.L, sx = L.HERO.walk.x, sz = L.HERO.walk.z, out = [];
      if (L.shoreDist(sx, sz) < -0.3 && L.shoreDist(sx, sz) > -7) out.push({ x: sx, z: sz, yaw: L.HERO.walk.yaw });
      for (let r = 2; r < 120 && out.length < 6; r += 2) for (let k = 0; k < 36 && out.length < 6; k++) {
        const a = k / 36 * Math.PI * 2, x = sx + Math.cos(a) * r, z = sz + Math.sin(a) * r, d = L.shoreDist(x, z);
        if (d < -1.2 && d > -4) out.push({ x, z, yaw: Math.atan2(-(sx - x), -(sz - z)) * 180 / Math.PI });
      }
      return out; })()`);
    expect(spots.length).toBeGreaterThan(0);
    let spot = null;
    for (const sp of spots) {
      await page.eval(`window.__camSpec('${sp.x.toFixed(2)},${sp.z.toFixed(2)},${sp.yaw.toFixed(1)},0')`);
      const ok = await page.waitFor("(() => { const b = document.querySelector('.swim-ui .swim-dive'); return !!b && !b.hidden && b.getBoundingClientRect().width > 0 && !document.querySelector('#klc-board.show'); })()", { timeout: 6000 }).catch(() => false);
      if (ok) { spot = sp; break; }
    }
    expect(spot).not.toBeNull();
    expect(await page.eval("document.querySelector('.swim-ui .swim-dive').textContent")).toBe(STR.ja['play.swim.dive']);
    await tap('.swim-ui .swim-dive');
    await page.waitFor(ACTIVE, { timeout: 30000 });
    await page.frames(2);
    expect(await page.eval('window.__playWorlds().swim.built')).toBe(true);
    await sleep(800);
    const l = await page.eval(LAND);
    expect(l).toMatchObject({ board: false, swim: true });
    // the coach was seen: not again; the fish is on screen
    expect(await page.eval(COACH_UP)).toBe(false);
    const m = await page.eval(MEASURE);
    expect(m.fish.onScreen).toBe(true);
    await tap('#klc-pad .btn[data-id="swim-out"]');
    await page.waitFor(`!${ACTIVE}`, { timeout: 8000 });
    const r = await page.eval("(() => { const p = window.__ctx.playerObj; return { x: p.pos.x, z: p.pos.z, fly: p.fly }; })()");
    expect(r.fly).toBe(false);
    expect(Math.hypot(r.x - spot.x, r.z - spot.z)).toBeLessThan(1);
  });
});

d('海の中 on a desktop (1440x900, mouse and keys)', () => {
  let browser, srv, page;
  const click = async (sel) => { const c = await center(page, sel); expect(c).not.toBeNull(); await mouse(page, c.x, c.y); return c; };
  beforeAll(async () => {
    ({ srv, browser } = await app());
    page = await browser.page({ width: 1440, height: 900, dpr: 1 });
    await page.S('Storage.clearDataForOrigin', { origin: srv.url.replace(/\/$/, ''), storageTypes: 'local_storage,indexeddb' }).catch(() => {});
    await page.goto(`${srv.url}index.html?lang=en`);
    await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
  }, 330000);
  afterAll(async () => { await page?.S('Page.close').catch(() => {}); }, 60000);

  T('the hub, the coach (keys, on the fish), W swims, the あがる key-cap button leaves', async () => {
    await waitGo(page);
    await click('#go');
    await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
    await page.waitFor("(() => { const b = document.querySelector('#klc-play [data-act=\"play\"]'); return !!b && !b.hidden && b.getBoundingClientRect().width > 0; })()", { timeout: 30000 });
    const before = await page.eval("(() => { const p = window.__ctx.playerObj; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, fly: p.fly }; })()");
    await click('#klc-play [data-act="play"]');
    await page.waitFor("!!document.querySelector('#klc-play .mcard[data-mode=\"underwater\"]')", { timeout: 15000 });
    await click('#klc-play .mcard[data-mode="underwater"] .still');
    await page.waitFor("(() => { const g = document.querySelector('[data-go=\"underwater\"]'); return !!g && g.getBoundingClientRect().width > 0; })()", { timeout: 10000 });
    await click('[data-go="underwater"]');
    await page.waitFor(ACTIVE, { timeout: 30000 });
    await sleep(1500);
    await checkEntered(page);
    const m = await page.eval(MEASURE);
    expect(m.coachText).toBe(STR.en['play.swim.coach.keys']);
    expect(m.hintText).toBeNull();
    // the spotlight rings the fish
    const hole = m.rects.coachHole;
    expect(Math.hypot((hole.l + hole.r) / 2 - m.fish.screen[0], (hole.t + hole.b) / 2 - m.fish.screen[1])).toBeLessThan(80);
    // the way out is on screen, with its key
    const out = await page.eval("(() => { const b = document.querySelector('#klc-play .cluster .act[data-id=\"swim-out\"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { w: r.width, label: b.querySelector('.lb').textContent, kbd: b.querySelector('kbd')?.textContent }; })()");
    expect(out).toMatchObject({ label: STR.en['play.swim.surface'], kbd: 'V' });
    expect(hit(m.rects.coach, await page.eval("(() => { const r = document.querySelector('#klc-play .cluster .act[data-id=\"swim-out\"]').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()"))).toBe(false);
    await click('#klc-play .coach .ok');
    await page.waitFor(`!${COACH_UP}`, { timeout: 4000 });
    await sleep(300);
    await checkChip(page);
    const a = await page.eval('({ ...window.__swim.state })');
    await key(page, 'keyDown', 'KeyW');
    await sleep(1500);
    await key(page, 'keyUp', 'KeyW');
    const b = await page.eval('({ ...window.__swim.state })');
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(3);
    await click('#klc-play .cluster .act[data-id="swim-out"]');
    await page.waitFor(`!${ACTIVE}`, { timeout: 8000 });
    await sleep(600);
    const r = await page.eval("(() => { const p = window.__ctx.playerObj; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, fly: p.fly, cluster: !!document.querySelector('#klc-play .cluster .act[data-id=\"swim-out\"]'), world: window.__playWorlds().swim.built }; })()");
    expect(r.fly).toBe(before.fly);
    expect(Math.hypot(r.x - before.x, r.z - before.z)).toBeLessThan(1);
    expect(r.cluster).toBe(false);
    expect(r.world).toBe(true);   // a desktop keeps the world (the next dive is instant)
    expect(pageErrors(page)).toEqual([]);
  });
});
