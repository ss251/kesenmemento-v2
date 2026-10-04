// [v7:pad] Headless-Chrome helpers for the touch pad: an iPhone-shaped page (mobile, touch, iPhone UA, DPR 3) and real touches
// through CDP Input.dispatchTouchEvent (several fingers at once), plus the geometry checks (nothing of the pad on the UI panels).
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/pad-shots.mjs [--port 8981]
import { join } from 'node:path';
import { build, serve, launch, ROOT } from './cdp.mjs';

export const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Build into a private dist for this port and serve it (+ /data/). Returns { srv, dist }. */
export async function buildAndServe(port, { minify = false } = {}) {
  if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
  const dist = join(ROOT, `dist/anime-${port}`);
  await build({ outdir: dist, minify, strict: true });
  return { srv: serve({ port, dist }), dist };
}

/** An iPhone-like page: mobile viewport, touch emulation, the iPhone UA. */
export async function phonePage(browser, { width = 390, height = 844, dpr = 3, insets = null } = {}) {
  const page = await browser.page({ width, height, dpr });
  await setViewport(page, { width, height, dpr, insets });
  await page.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }).catch(() => {});
  await page.S('Emulation.setEmitTouchEventsForMouse', { enabled: false }).catch(() => {});
  await page.S('Emulation.setUserAgentOverride', { userAgent: IPHONE_UA, platform: 'iPhone', acceptLanguage: 'ja-JP' });
  return page;
}
/** Rotate: a new device-metrics override (the page gets a resize, like an orientation change). */
export async function setViewport(page, { width, height, dpr = 3, insets = null }) {
  await page.S('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: true, screenWidth: width, screenHeight: height, screenOrientation: width > height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
  if (insets) await page.S('Emulation.setSafeAreaInsetsOverride', { insets }).catch(() => {});
}

/** Fingers: down / move / up by id; every event carries all the fingers that are down. */
export function fingers(page) {
  const pts = new Map();
  const send = (type, ids) => page.S('Input.dispatchTouchEvent', { type, touchPoints: ids.map((id) => ({ id, x: pts.get(id).x, y: pts.get(id).y, radiusX: 8, radiusY: 8, force: 0.6 })) });
  const api = {
    get down() { return [...pts.keys()]; },
    async down1(id, x, y) { pts.set(id, { x, y }); await page.S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...pts].map(([i, p]) => ({ id: i, x: p.x, y: p.y, radiusX: 8, radiusY: 8, force: 0.6 })) }); },
    async move(id, x, y) { pts.set(id, { x, y }); await page.S('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...pts].map(([i, p]) => ({ id: i, x: p.x, y: p.y, radiusX: 8, radiusY: 8, force: 0.6 })) }); },
    async up(id) {
      // CDP touchEnd: the listed points are the ones that lift (the others stay down)
      const p = pts.get(id); if (!p) return;
      pts.delete(id);
      await page.S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id, x: p.x, y: p.y, radiusX: 8, radiusY: 8, force: 0.6 }] });
    },
    /** Slide a finger to (x, y) in steps, 16 ms apart. */
    async drag(id, x, y, steps = 8) {
      const a = pts.get(id);
      for (let i = 1; i <= steps; i++) { await api.move(id, a.x + (x - a.x) * i / steps, a.y + (y - a.y) * i / steps); await sleep(16); }
    },
    async tap(x, y, ms = 70) { await api.down1(99, x, y); await sleep(ms); await api.up(99); },
    async release() { for (const id of [...pts.keys()]) await api.up(id); },
  };
  void send;
  return api;
}

/** The centre of an element (CSS px). */
export const center = (page, sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; })()`);

/** Rects (CSS px) of everything the pad draws and of every UI panel; the overlaps between them. */
export async function layoutReport(page) {
  return page.eval(`(() => {
    const R = (e) => { const b = e.getBoundingClientRect(); return { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
    const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 1 && b.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.01; };
    const pad = {};
    const g = document.querySelector('#klc-pad .ghost'); if (g) pad.ghost = R(g);
    document.querySelectorAll('#klc-pad .cluster .btn').forEach((e) => { if (e.dataset.show !== '0' && vis(e)) pad['btn:' + e.dataset.id] = R(e); });
    const c = document.querySelector('#klc-pad .chip'); if (c) pad.chip = R(c);
    const gear = document.querySelector('#klc-pad .gear'); if (gear) pad.gear = R(gear);
    const st = document.querySelector('#klc-pad .settings'); if (st && !st.hidden) pad.settings = R(st);
    const co = document.querySelector('#klc-pad .coach'); if (co && !co.hidden) pad.coach = R(co);
    const panels = {};
    const add = (name, sel) => document.querySelectorAll(sel).forEach((e, i) => { if (vis(e)) panels[name + (i ? i : '')] = R(e); });
    add('dock', '#klc-ui .dock'); add('places', '#klc-ui .places'); add('credit', '#klc-ui .attr'); add('brand', '#klc-ui .brand'); add('tools', '#klc-ui .tools');
    add('mini', '#klc-x .mini'); add('xbar', '#klc-x .xbar'); add('xdrive', '#klc-x .xdrive'); add('arrivals', '#klc-ui .arrivals'); add('search', '#klc-x .xsearch');
    const hit = [];
    for (const [pn, p] of Object.entries(pad)) for (const [qn, q] of Object.entries(panels)) {
      if (p.l < q.r - 0.5 && p.r > q.l + 0.5 && p.t < q.b - 0.5 && p.b > q.t + 0.5) hit.push(pn + ' x ' + qn);
    }
    const pnl = [], pn = Object.keys(panels).filter((k) => !/^(arrivals|search)/.test(k));
    for (let i = 0; i < pn.length; i++) for (let j = i + 1; j < pn.length; j++) {
      const p = panels[pn[i]], q = panels[pn[j]];
      if (p.l < q.r - 0.5 && p.r > q.l + 0.5 && p.t < q.b - 0.5 && p.b > q.t + 0.5) pnl.push(pn[i] + ' x ' + pn[j]);
    }
    const self = [];
    const names = Object.keys(pad).filter((k) => k !== 'settings');
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const p = pad[names[i]], q = pad[names[j]];
      if (names[i].startsWith('btn:') && names[j].startsWith('btn:')) {   // round buttons: circles, not their boxes
        if (Math.hypot((p.l + p.r - q.l - q.r) / 2, (p.t + p.b - q.t - q.b) / 2) < (p.w + q.w) / 2 - 0.5) self.push(names[i] + ' x ' + names[j]);
      } else if (p.l < q.r - 0.5 && p.r > q.l + 0.5 && p.t < q.b - 0.5 && p.b > q.t + 0.5) self.push(names[i] + ' x ' + names[j]);
    }
    const inside = Object.entries(pad).filter(([, p]) => p.l < -0.5 || p.t < -0.5 || p.r > innerWidth + 0.5 || p.b > innerHeight + 0.5).map(([k]) => k);
    return { vw: innerWidth, vh: innerHeight, pad, panels, overlaps: hit, selfOverlaps: self, panelOverlaps: pnl, outside: inside, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight };
  })()`);
}

/** Open the app on a phone page, leave the intro card with a real tap, wait until the pad shows. */
export async function enterTown(page, url, { timeout = 280000, tap = true } = {}) {
  await page.goto(url);
  await page.waitFor("document.body.classList.contains('loaded')", { timeout });
  const f = fingers(page);
  if (tap) { const g = await center(page, '#go'); await f.tap(g.x, g.y); } else await page.eval("document.getElementById('go').click()");
  await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
  return f;
}
export { launch, ROOT };

/** The game state a test reads: the player, the pad and the car. */
export const gameState = (page) => page.eval(`(() => { const c = window.__ctx, p = c.playerObj, pad = window.__pad, d = window.__explore?.drive;
  return { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, fly: p.fly, onGround: p.onGround, cam: [c.camera.position.x, c.camera.position.y, c.camera.position.z],
    mode: pad.mode, hidden: pad.hidden, move: [pad.move.x, pad.move.y], running: pad.running, stickActive: pad.stickActive,
    drive: d ? { active: d.active, speed: d.state.speed, kmh: d.kmh, x: d.state.x, z: d.state.z, yaw: d.state.yaw } : null }; })()`);
/** Angle difference b - a wrapped to (-pi, pi]. */
export const dAngle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
/** The ids of the visible buttons now. */
export const buttonIds = (page) => page.eval(`[...document.querySelectorAll('#klc-pad .cluster .btn')].filter((b) => b.dataset.show !== '0').map((b) => b.dataset.id)`);
