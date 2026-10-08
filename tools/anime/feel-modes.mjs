// [feel] Every mode that shares core/player.js, entered and left in one Chrome session, and a walk after each: he moves (> 2.5 m in 1.2 s),
// the camera follows (boom > 0.7 m, he is drawn), he stands on land, and no console error appeared. Phone tier by default (the iPhone
// shape the conductor checks); --desktop for 1440x900. The movement-feel lane's check that drive, fly, swim, gull and 一本釣り still work.
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/feel-modes.mjs [--port 9561] [--desktop] [--no-build]
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildAndServe, launch, phonePage, fingers, center, sleep, ROOT } from './pad-lib.mjs';

const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] ?? true) : d; };
const has = (k) => process.argv.includes('--' + k);
const PORT = Number(arg('port', 9561));
const DESKTOP = has('desktop');
const ONLY = arg('only') ? String(arg('only')).split(',') : null;   // e.g. --only ippon,katsuo
const want = (name) => !ONLY || ONLY.some((o) => name.startsWith(o));
const log = (...a) => console.error('[modes]', ...a);

const { srv } = has('no-build') ? { srv: (await import('./cdp.mjs')).serve({ port: PORT, dist: join(ROOT, `dist/anime-${PORT}`) }) } : await buildAndServe(PORT);
const browser = await launch({ quiet: true });
const out = { at: new Date().toISOString(), device: DESKTOP ? 'desktop 1440x900' : 'phone 390x844 @3', checks: [] };
try {
  const page = DESKTOP ? await browser.page({ width: 1440, height: 900, dpr: 1 }) : await phonePage(browser, { width: 390, height: 844, dpr: 3 });
  await page.goto(`${srv.url}index.html?lang=ja`);
  await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
  if (DESKTOP) await page.eval("document.getElementById('go').click()"); else { const f = fingers(page); const g = await center(page, '#go'); await f.tap(g.x, g.y); }
  await page.waitFor("document.body.classList.contains('playing')", { timeout: 30000 });
  await page.waitFor('!window.__ctx.services.life?.tour?.flying', { timeout: 30000 }).catch(() => {});
  const key = async (code, ms) => {
    const vk = { KeyW: [87, 'w'], Escape: [27, 'Escape'], KeyF: [70, 'f'] }[code];
    await page.S('Input.dispatchKeyEvent', { type: 'keyDown', code, key: vk[1], windowsVirtualKeyCode: vk[0], nativeVirtualKeyCode: vk[0] });
    if (ms) await sleep(ms);
    await page.S('Input.dispatchKeyEvent', { type: 'keyUp', code, key: vk[1], windowsVirtualKeyCode: vk[0], nativeVirtualKeyCode: vk[0] });
  };
  const state = () => page.eval(`(() => { const c = window.__ctx, p = c.playerObj, av = c.services.play?.avatar; let vis = false;
    c.scene.traverse((o) => { if (o.name === 'hoya3d' && o.visible) vis = true; });
    return { x: p.pos.x, y: p.pos.y, z: p.pos.z, fly: p.fly, enabled: p.enabled, gnd: p.onGround, person: p.person, gull: !!p.gull,
      water: !!c.physics.isWater?.(p.pos.x, p.pos.z) && !c.physics.standable?.(p.pos.x, p.pos.z, p.pos.y), boom: av ? av.boom : null, drawn: vis,
      landing: !!p.landing, finite: [p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.z].every(Number.isFinite) }; })()`);
  const errs = () => page.errors().filter((e) => !String(e.text).includes('/api/live'));
  let seen = 0;
  /** After a mode: a 1.2 s walk forward must move him, keep him drawn behind a working boom, on land; new console errors fail it. */
  async function walkCheck(name, extra = {}) {
    await sleep(600);
    const a = await state();
    await key('KeyW', 1200);
    await sleep(500);
    let b = await state();
    let moved = Math.hypot(b.x - a.x, b.z - a.z);
    if (moved < 2.5) {   // facing the quay edge (the sea is a wall): the other way round
      const KS = { code: 'KeyS', key: 's', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 };
      await page.S('Input.dispatchKeyEvent', { type: 'keyDown', ...KS }); await sleep(1200); await page.S('Input.dispatchKeyEvent', { type: 'keyUp', ...KS });
      await sleep(500);
      const c = await state(); const m2 = Math.hypot(c.x - b.x, c.z - b.z);
      if (m2 > moved) { moved = m2; b = c; }
    }
    const e = errs(); const fresh = e.slice(seen); seen = e.length;
    const ok = moved > 2.5 && b.finite && !b.fly && b.boom > 0.7 && b.drawn && !b.water && b.gnd && fresh.length === 0;
    const row = { mode: name, ok, moved: +moved.toFixed(2), boom: b.boom === null ? null : +b.boom.toFixed(2), drawn: b.drawn, water: b.water, onGround: b.gnd, fly: b.fly, errors: fresh.map((x) => x.text.slice(0, 160)), ...extra };
    out.checks.push(row); log(JSON.stringify(row));
    return row;
  }
  const modes = (id) => `window.__ctx.services.play?.listModes?.().find((m) => m.id === ${JSON.stringify(id)})`;

  // the walk itself, from the hero spot
  await page.eval("window.__camSpec('walk')");
  await walkCheck('walk (third person)');

  if (want('fly')) {
  // fly: up 30 m, then 歩く (the pad's chip on a phone, F on a desktop): an eased landing on land
  await page.eval("(() => { const p = window.__ctx.playerObj; p.fly = true; p.vy = 0; p.onGround = false; p.liftTo = p.pos.y + 30; })()");
  await sleep(2500);
  if (DESKTOP) await key('KeyF'); else { const c = await center(page, '#klc-pad .chip button[data-mode="walk"]'); if (c) { const f = fingers(page); await f.tap(c.x, c.y); } else await page.eval('window.__ctx.playerObj.fly = false'); }
  await sleep(2500);
  await walkCheck('fly → 歩く', { landed: !(await state()).landing });
  }

  if (want('gull')) {
  // gull: become the gull, glide, leave for a walk
  await page.eval("window.__camSpec('walk')"); await sleep(400);
  const gull = await page.eval("(() => { const g = window.__ctx.services.play?.gull; return g ? g.start() : 'no gull'; })()");
  await sleep(3000);
  await page.eval("(() => { const g = window.__ctx.services.play?.gull; if (g?.active) g.leave('walk'); })()");
  await sleep(2500);
  await walkCheck('gull → walk', { started: gull });
  }

  if (want('drive')) {
  // drive: into the car, a short drive, out
  await page.eval("window.__camSpec('walk')"); await sleep(400);
  const drove = await page.eval("(() => { const d = window.__explore?.drive; return d ? !!d.enter() : 'no drive'; })()");
  await sleep(800); await key('KeyW', 1500); await sleep(500);
  await page.eval("(() => { const d = window.__explore?.drive; if (d?.active) d.exit(); })()");
  await walkCheck('drive → walk', { entered: drove });
  }

  if (want('swim')) {
  // swim: the dive, then back
  await page.eval("window.__camSpec('walk')"); await sleep(400);
  const swam = await page.eval(`(async () => { const m = ${modes('underwater')}; if (m) { await m.prepare?.(); await m.start(); return true; } const s = window.__ctx.services.swim; if (s?.enter) { s.enter('mode'); return true; } return 'no swim'; })()`);
  await sleep(3500);
  const swimOn = await page.eval('!!window.__ctx.services.swim?.active');
  await page.eval('(() => { const s = window.__ctx.services.swim; if (s?.active) s.exit(); })()');
  await walkCheck('swim → walk', { started: swam, wasActive: swimOn });
  }

  // 一本釣り: the trip on the katsuo boat, then Escape back to the quay
  for (const id of ['ippon', 'katsuo'].filter(want)) {
    await page.eval("window.__camSpec('walk')"); await sleep(400);
    const started = await page.eval(`(async () => { const m = ${modes(id)}; if (!m) return 'no mode ' + ${JSON.stringify(id)}; await m.prepare?.(); await m.start?.(); return true; })()`).catch((e) => 'start threw: ' + e.message);
    await sleep(4000);
    const onBoat = await page.eval('!!window.__ctx.services.sail?.active');
    // leaving the boat (the ship layer's way out; Escape on the 一本釣り trip asks for 帰港, a sail home, instead)
    await page.eval("(() => { try { const s = window.__ctx.services.sail; if (s?.active) s.exit(); } catch (e) {} try { window.__explore?.drive?.active && window.__explore.drive.exit(); } catch (e) {} })()");
    await sleep(1500);
    const after = await state();   // where the mode's own exit left him
    let landed = null;
    if (after.fly) {   // underway the boat leaves him hovering where the camera was: 歩く lands him on the nearest quay
      if (DESKTOP) await key('KeyF'); else { const c = await center(page, '#klc-pad .chip button[data-mode="walk"]'); if (c) { const f = fingers(page); await f.tap(c.x, c.y); } else await page.eval('window.__ctx.playerObj.fly = false'); }
      await sleep(2800);
      const s2 = await state(); landed = { onLand: !s2.water && s2.gnd, fly: s2.fly };
    }
    await walkCheck(id + ' → walk', { started, onBoat, afterExit: { fly: after.fly, water: after.water, onGround: after.gnd, finite: after.finite, enabled: after.enabled }, landed });
  }
  if (want('credit')) {
    // ホヤぼーや's credit (取扱要綱 第5条): never covered by a bottom-centre chip. Show the もぐる chip and the kit prompt (alone and together)
    // and compare the rects once the credit's 200 ms move is done. The pad's buttons and stick ring are reported too.
    await page.eval("window.__camSpec('walk')"); await sleep(900);
    const rects = () => page.eval(`(() => {
      const R = (e) => { if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
      const credit = R(document.querySelector('#klc-play .hoya-credit'));
      const dive = R(document.querySelector('.swim-dive')), prompt = R(document.querySelector('#klc-play .prompt'));
      const pad = [...document.querySelectorAll('#klc-pad .cluster .btn')].filter((e) => e.dataset.show !== '0').map(R).filter(Boolean);
      const ring = R(document.querySelector('#klc-pad .ghost'));
      const hit = (a, b) => !!(a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t);
      return { credit, dive, prompt, overDive: hit(credit, dive), overPrompt: hit(credit, prompt), overPad: pad.some((b) => hit(credit, b)), overRing: hit(credit, ring) };
    })()`);
    const setChips = (dive, prompt) => page.eval(`(() => {
      let d = document.querySelector('.swim-dive');
      if (!d) { const ui = document.createElement('div'); ui.className = 'swim-ui'; ui.id = 'feel-swim-ui'; d = document.createElement('button'); d.className = 'swim-dive'; d.textContent = 'もぐる'; ui.appendChild(d); document.body.appendChild(ui); }
      d.hidden = ${!dive};
      const p = document.querySelector('#klc-play .prompt'); if (p) { p.hidden = ${!prompt}; if (${prompt}) p.textContent = 'ウミネコになる'; }
      return !!p;
    })()`);
    const rows = {};
    for (const [name, d, pr] of [['none', false, false], ['dive', true, false], ['prompt', false, true], ['both', true, true]]) { await setChips(d, pr); await sleep(450); rows[name] = await rects(); }
    await setChips(false, false);
    await page.eval("document.getElementById('feel-swim-ui')?.remove()");
    const ok = !!rows.none.credit && Object.values(rows).every((r) => r.credit && !r.overDive && !r.overPrompt);
    const row = { mode: 'credit vs bottom-centre chips', ok, rows };
    out.checks.push(row); log(JSON.stringify({ mode: row.mode, ok, dive: rows.dive.credit, prompt: rows.prompt.credit, both: rows.both.credit, overPad: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.overPad])), overRing: rows.none.overRing }));
  }
  out.ok = out.checks.every((c) => c.ok);
} finally {
  await browser.close(); srv.stop();
}
mkdirSync(join(ROOT, 'docs/play/shots/feel'), { recursive: true });
writeFileSync(join(ROOT, `docs/play/shots/feel/modes-${DESKTOP ? 'desktop' : 'phone'}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
process.exit(out.ok ? 0 : 1);
