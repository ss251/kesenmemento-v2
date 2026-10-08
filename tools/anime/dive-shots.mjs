// [fish-fix] 海の中 end to end in a real browser, the way a person plays it: leave the title with a tap (or a click), open あそぶ,
// open the 「海の中」 card, はじめる, read the first-swim coach, わかった, swim (a drag on the stick, or W), あがる.
// Each step writes a frame and what it measured: the player fish on screen (in front of the camera, its size in px),
// the dive's world (built, warmed), the coach and the HUD (rects, and what each overlay covers), the pad's mode.
//
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/dive-shots.mjs --port 9580 --tag after
//   options: --sets phone-ja,phone-en,land-ja,land-en,desktop-ja,desktop-en,p360-ja,p430-en   --out docs/play/shots/underwater   --no-build   --png <dir>
// Frames: <out>/v7-<tag>-<set>-<step>.jpg (phones resampled to 2x, desktop 1x), the measures: <out>/v7-<tag>-measures.json.
import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { buildAndServe, launch, phonePage, fingers, center, waitGo, sleep, ROOT } from './pad-lib.mjs';
import { serve } from './cdp.mjs';
import { STICK, padScale } from '../../src/anime/ui/touchpad.js';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const PORT = Number(opt('port', 9580));
const TAG = opt('tag', 'after');
const OUT = opt('out', join(ROOT, 'docs/play/shots/underwater'));
const PNG = opt('png', join(ROOT, 'dist/dive-shots', TAG));
/** --night: the town at 20:00 (core time, as the 夜 preset) before the dive; --reduced: prefers-reduced-motion. */
const NIGHT = argv.includes('--night'), REDUCED = argv.includes('--reduced');
const SETS = opt('sets', 'phone-ja,phone-en,land-ja,land-en,desktop-ja,desktop-en,p360-ja,p430-en').split(',').filter(Boolean);
/** The phones: an iPhone 13-15 in portrait and landscape, and the narrowest and widest phones (360 and 430 px) in portrait. */
const PHONES = { phone: { width: 390, height: 844 }, land: { width: 844, height: 390 }, p360: { width: 360, height: 780 }, p430: { width: 430, height: 932 } };

/** What one frame measures. `under(el)`: the HUD elements an overlay covers (sampled with elementsFromPoint). */
export const MEASURE = `(() => {
  const s = window.__swim, c = window.__ctx, cam = c.camera, W = innerWidth, H = innerHeight;
  const vis = (el) => { if (!el || el.hidden) return false; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 1 && b.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; };
  const R = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
  const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : '') + (e.dataset?.id ? '[' + e.dataset.id + ']' : '');
  const big = (e) => { const b = e.getBoundingClientRect(); return b.width * b.height > W * H * 0.45; };
  /** HUD things under an overlay: interactive or text-bearing elements, not full-screen layers, not the overlay itself. */
  const under = (el) => {
    if (!vis(el)) return [];
    const b = el.getBoundingClientRect(), got = new Set();
    for (let i = 0; i < 7; i++) for (let j = 0; j < 4; j++) {
      const x = b.left + 3 + (b.width - 6) * i / 6, y = b.top + 3 + (b.height - 6) * j / 3;
      for (const e of document.elementsFromPoint(x, y)) {
        if (e === el || el.contains(e) || e.contains(el) || big(e) || /^(canvas|html|body|svg|path|circle|i|span|b|small|kbd)$/i.test(e.tagName)) continue;
        const cs = getComputedStyle(e);
        if (cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
        const txt = (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 24);
        if (e.matches('button, a, [role=button], input') || txt) got.add(name(e) + (txt ? ' 「' + txt + '」' : ''));
      }
    }
    return [...got];
  };
  const rects = {};
  const add = (key, sel) => document.querySelectorAll(sel).forEach((e, i) => { if (vis(e)) rects[key + (i ? '#' + i : '')] = R(e); });
  add('coach', '#klc-play .coach:not([hidden]) .bubble');
  add('coachHole', '#klc-play .coach:not([hidden]) .hole');
  add('hint', '.swim-ui .swim-hint');
  add('chip', '.swim-ui .swim-chip');
  add('dive', '.swim-ui .swim-dive');
  add('become', '.swim-ui .swim-become');
  add('board', '#klc-board');
  add('hoyaCredit', '#klc-play .hoya-credit');
  add('stick', '#klc-pad .ghost');
  document.querySelectorAll('#klc-pad .cluster .btn').forEach((e) => { if (e.dataset.show !== '0' && vis(e)) rects['btn:' + e.dataset.id] = R(e); });
  add('playPill', '#klc-play [data-act="play"]');
  add('book', '#klc-play [data-act="book"]');
  add('counters', '#klc-play .counters > *');
  add('prompt', '#klc-play .prompt');
  const btnText = [...document.querySelectorAll('#klc-pad .cluster .btn')].filter((e) => e.dataset.show !== '0' && vis(e)).map((e) => e.dataset.id + ':' + (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' '));
  let fish = null;
  if (s && s.active) {
    const m = s.nodes[0];
    if (m) {
      m.updateMatrixWorld(true);
      const p = m.getWorldPosition(m.position.clone());
      const d = p.distanceTo(cam.position);
      const q = p.clone().project(cam);
      let chain = true; for (let o = m; o; o = o.parent) if (!o.visible) { chain = false; break; }
      let rad = 0; m.traverse((o) => { if (o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); rad = Math.max(rad, o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z)); } });
      const span = H * (rad * 2) / (2 * d * Math.tan(cam.fov * Math.PI / 360));
      fish = { visible: m.visible, chain, inScene: !!m.parent, pos: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), dist: +d.toFixed(2), ndc: [q.x, q.y, q.z].map((v) => +v.toFixed(3)),
        onScreen: Math.abs(q.x) < 1 && Math.abs(q.y) < 1 && q.z < 1, screen: [Math.round((q.x + 1) / 2 * W), Math.round((1 - q.y) / 2 * H)], spanPx: Math.round(span), radius: +rad.toFixed(2) };
    }
  }
  const st = s?.state;
  const coachEl = document.querySelector('#klc-play .coach');
  return {
    vw: W, vh: H, active: !!s?.active, padMode: window.__pad?.mode ?? null, body: document.body.className,
    state: st ? { x: +st.x.toFixed(2), y: +st.y.toFixed(2), z: +st.z.toFixed(2), yaw: +st.yaw.toFixed(3), pitch: +st.pitch.toFixed(3), mode: st.mode, species: st.species, v: +Math.hypot(st.vx, st.vy, st.vz).toFixed(2) } : null,
    cam: [cam.position.x, cam.position.y, cam.position.z].map((v) => +v.toFixed(2)), fov: +cam.fov.toFixed(1),
    player: (() => { const p = c.playerObj; return { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), fly: p.fly, enabled: p.enabled }; })(),
    fish, worlds: window.__playWorlds ? window.__playWorlds() : null,
    coachText: coachEl && !coachEl.hidden ? (coachEl.querySelector('.say p')?.textContent || '') : null,
    hintText: vis(document.querySelector('.swim-ui .swim-hint')) ? document.querySelector('.swim-ui .swim-hint').textContent : null,
    chipText: vis(document.querySelector('.swim-ui .swim-chip')) ? document.querySelector('.swim-ui .swim-chip').innerText.replace(/\\s+/g, ' ') : null,
    buttons: btnText, rects,
    covers: { coach: under(document.querySelector('#klc-play .coach:not([hidden]) .bubble')), chip: under(document.querySelector('.swim-ui .swim-chip')), hint: under(document.querySelector('.swim-ui .swim-hint')) },
    calls: c.renderer?.info?.render?.calls ?? null, errors: (window.__errors || []).length,
  };
})()`;

export async function mouse(page, x, y) {
  await page.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await page.S('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(60);
  await page.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
const VK = { KeyW: [87, 'w'], Space: [32, ' '], KeyV: [86, 'v'] };
export const key = (page, type, code) => page.S('Input.dispatchKeyEvent', { type, code, key: VK[code][1], windowsVirtualKeyCode: VK[code][0], nativeVirtualKeyCode: VK[code][0] });

async function frame(page, set, step, log) {
  const buf = await page.shot(join(PNG, `${set}-${step}.png`));
  const m = await page.eval(MEASURE);
  const img = sharp(buf);
  const meta = await img.metadata();
  const w = set.startsWith('desktop') ? meta.width : Math.round(meta.width * 2 / 3);
  const file = join(OUT, `v7-${TAG}-${set}-${step}.jpg`);
  await sharp(buf).resize({ width: w }).jpeg({ quality: 84, mozjpeg: true }).toFile(file);
  log[step] = { file: file.replace(ROOT + '/', ''), ...m };
  console.error(`[${set}] ${step}: active=${m.active} fish=${JSON.stringify(m.fish && { onScreen: m.fish.onScreen, spanPx: m.fish.spanPx, dist: m.fish.dist, chain: m.fish.chain })} coach=${JSON.stringify(m.coachText)} covers=${JSON.stringify(m.covers)}`);
  return m;
}

/** A fresh visitor (no saved coach marks, no saved settings) in the town, the hub open, 「海の中」 started with real input. */
export async function enterDive(browser, url, set, log = null) {
  const [dev, lang] = set.split('-');
  const phone = !!PHONES[dev];
  const page = phone
    ? await phonePage(browser, { ...PHONES[dev], dpr: 3 })
    : await browser.page({ width: 1440, height: 900, dpr: 1 });
  const f = phone ? fingers(page) : null;
  const tap = async (sel) => {
    const c = await center(page, sel);
    if (!c) throw new Error('no ' + sel);
    if (phone) await f.tap(c.x, c.y); else await mouse(page, c.x, c.y);
    return c;
  };
  if (REDUCED) await page.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }).catch(() => {});
  await page.S('Storage.clearDataForOrigin', { origin: url.replace(/\/$/, ''), storageTypes: 'local_storage,indexeddb,cache_storage' }).catch(() => {});
  await page.goto(`${url}index.html?lang=${lang}`);
  await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
  await waitGo(page);
  await tap('#go');
  await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
  if (NIGHT) await page.eval('window.__setHours(20)');
  await sleep(1500);
  if (phone) {
    // the pad's own first-run coach (左で移動・右で視点 / はじめる) comes first for a new phone visitor
    const up = await page.waitFor("(() => { const c = document.querySelector('#klc-pad .coach'); return !!c && !c.hidden; })()", { timeout: 8000 }).catch(() => false);
    if (up) { await tap('#klc-pad .coach .ok'); await sleep(600); }
  }
  await page.waitFor("(() => { const b = document.querySelector('#klc-play [data-act=\"play\"]'); return !!b && !b.hidden && b.getBoundingClientRect().width > 0; })()", { timeout: 30000 });
  await tap('#klc-play [data-act="play"]');
  await page.waitFor("!!document.querySelector('#klc-play .mcard[data-mode=\"underwater\"]')", { timeout: 15000 });
  await page.eval("document.querySelector('#klc-play .mcard[data-mode=\"underwater\"]').scrollIntoView({ inline: 'center', block: 'center' })");
  await sleep(700);
  await tap('#klc-play .mcard[data-mode="underwater"] .still');
  await page.waitFor("(() => { const g = document.querySelector('[data-go=\"underwater\"]'); if (!g) return false; const r = g.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()", { timeout: 10000 });
  await page.eval("document.querySelector('[data-go=\"underwater\"]').scrollIntoView({ block: 'center' })");
  await sleep(400);
  await tap('[data-go="underwater"]');
  // the title card: the first frame after it is the dive
  await page.waitFor('!!(window.__swim && window.__swim.active)', { timeout: 30000 });
  await page.frames(2);
  if (log) await frame(page, set, 'enter', log);
  return { page, f, phone, tap };
}

async function runSet(browser, url, set) {
  const log = { set };
  const { page, f, phone, tap } = await enterDive(browser, url, set, log);
  await sleep(1400);
  await frame(page, set, 'coach', log);
  const coachUp = await page.eval("(() => { const c = document.querySelector('#klc-play .coach'); return !!c && !c.hidden; })()");
  if (coachUp) { await tap('#klc-play .coach .ok'); await sleep(900); }
  await frame(page, set, 'swim', log);
  // swim: the stick (a drag up from the ghost ring), or W
  const a = await page.eval('({ ...window.__swim.state })');
  if (phone) {
    const g = await center(page, '#klc-pad .ghost');
    const vw = await page.eval('innerWidth'), vh = await page.eval('innerHeight');
    const T = STICK.travel * padScale(vw, vh);
    await f.down1(1, g.x, g.y);
    await f.drag(1, g.x, g.y - 0.8 * T, 4);
    await sleep(1600);
    await frame(page, set, 'drag', log);
    await f.up(1);
  } else {
    await key(page, 'keyDown', 'KeyW');
    await sleep(1600);
    await frame(page, set, 'drag', log);
    await key(page, 'keyUp', 'KeyW');
  }
  const b = await page.eval('({ ...window.__swim.state })');
  log.moved = +Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z).toFixed(2);
  await sleep(500);
  // leave: あがる on a phone; on a desktop the same button if the page shows one, else V
  const out = await page.eval("(() => { const b = document.querySelector('#klc-pad .btn[data-id=\"swim-out\"]'); return !!b && b.dataset.show !== '0' && b.getBoundingClientRect().width > 0; })()");
  if (out) await tap('#klc-pad .btn[data-id="swim-out"]');
  else { await key(page, 'keyDown', 'KeyV'); await key(page, 'keyUp', 'KeyV'); }
  await page.waitFor('!(window.__swim && window.__swim.active)', { timeout: 10000 }).catch(() => {});
  await sleep(1500);
  await frame(page, set, 'shore', log);
  log.consoleErrors = page.errors().map((e) => e.text.slice(0, 300));
  await page.S('Page.close').catch(() => {});
  return log;
}

async function main() {
  mkdirSync(OUT, { recursive: true }); mkdirSync(PNG, { recursive: true });
  const dist = join(ROOT, `dist/anime-${PORT}`);
  const srv = argv.includes('--no-build') && existsSync(join(dist, 'index.html')) ? serve({ port: PORT, dist }) : (await buildAndServe(PORT)).srv;
  const browser = await launch({ quiet: true });
  const all = {};
  try {
    for (const set of SETS) {
      try { all[set] = await runSet(browser, srv.url, set); }
      catch (e) { console.error(`[${set}] FAILED`, e.message); all[set] = { error: String(e.message || e) }; }
      writeFileSync(join(OUT, `v7-${TAG}-measures.json`), JSON.stringify(all, null, 1));
    }
  } finally {
    await browser.close(); srv.stop();
  }
  console.error('measures:', join(OUT, `v7-${TAG}-measures.json`));
}
if (import.meta.main) main();
