// [cafe-rst] The screenshots of café RST for the owner: the street door with the 入る prompt (phone layout), three views inside by day, one at night, the phone layout
// inside (with 出る), and the same views as the reference video's frames for the side-by-side check (docs/anime/interiors-cafe-rst.md).
// Always through the machine gate (one headless Chrome machine-wide):
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/cafe-rst-shots.mjs --port 9441 --out <dir> [--set door,day,night,phone,ref] [--nobuild]
// --set   comma list (default all but land): door = the phone page at the entrance (入る), day = three desktop views at noon, people = the figures close up, night = one at 19:30, phone = inside on the phone (出る),
//         land = the phone sets again in landscape (852 x 393), retina = the counter view on a 1440 x 900 @2x desktop, day and night, ref = portrait renders at the video's own cameras (t = 29, 38, 44 s: room-frame pose from the panorama, docs/anime/interiors/cafe-rst-plan.json) for pairing with the frames.
// The app renders only; the reference frames are never copied here (the owner's video stays outside git).
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { build, serve, launch, ROOT } from './cdp.mjs';
import { roomToWorld, yawToward, FRONT } from '../../src/anime/world/explore/cafe-rst.js';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9441));
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const out = arg('out', join(ROOT, 'shots/cafe/final')), want = new Set((arg('set', 'door,day,people,night,phone,ref')).split(','));
mkdirSync(out, { recursive: true });
const dist = join(ROOT, `dist/anime-${port}`);
if (arg('nobuild') !== '1') console.log('build', JSON.stringify(await build({ outdir: dist, quiet: true })));
const srv = serve({ port, dist });
const spec = (x, y, dx, dy, pitch = 0) => { const [X, Z] = roomToWorld(x, y); return `${X.toFixed(2)},${Z.toFixed(2)},${yawToward(dx, dy)},${pitch}`; };
const roomYaw = (deg) => yawToward(Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180));
const FY = FRONT.floor;
const browser = await launch({ quiet: true });
let rc = 0;
try {
  // ---- desktop views (shot mode: deterministic, no HUD)
  if (['day', 'night', 'people', 'ref', 'retina'].some((k) => want.has(k))) {
    const mk = async (w, h, extra = '', dpr = 1) => { const p = await browser.page({ width: w, height: h, dpr }); await p.goto(`${srv.url}index.html?shot=1&w=${w}&h=${h}&t=0&q=high${extra}`); await p.waitFor('window.__ready === true', { timeout: 280000 }); return p; };
    if (['day', 'night', 'people'].some((k) => want.has(k))) {
      const p = await mk(1600, 900);
      const views = { counter: spec(4.3, 2.0, -1, -0.2, 4), dining: spec(5.2, 1.5, 0, 1, 0), windows: spec(3.3, 3.5, -0.15, -1, 2) };
      if (want.has('day')) {
        await p.eval("window.__lifeSet('hiru')");
        for (const [k, v] of Object.entries(views)) { await p.eval(`window.__camSpec(${JSON.stringify(v)})`); await p.frames(8); await p.shot(join(out, `inside-day-${k}.png`)); console.log('saved', k, 'day'); }
        await p.eval(`window.__camSpec(${JSON.stringify(spec(5.6, -5.4, -0.42, 1, 3))})`); await p.frames(8); await p.shot(join(out, 'street-front-day.png')); console.log('saved street front day');   // the shopfront from the pavement, 5.4 m out and a little to the SE of the door
      }
      if (want.has('people')) {   // the figures close up, by day: the barista from the dining side, the woman at the table, and the man at the window seen through the glass from the sidewalk
        await p.eval("window.__lifeSet('hiru')");
        for (const [k, v] of Object.entries({ barista: spec(3.2, 2.5, -1, 0.42, 1), table: spec(4.9, 2.9, 0.3, 1, 0), window: spec(4.9, -3.4, -0.1, 1, 2) })) { await p.eval(`window.__camSpec(${JSON.stringify(v)})`); await p.frames(10); await p.shot(join(out, `people-${k}.png`)); console.log('saved people', k); }
      }
      if (want.has('night')) { await p.eval("window.__lifeSet('yoru')"); await p.frames(4); await p.eval(`window.__camSpec(${JSON.stringify(views.counter)})`); await p.frames(10); await p.shot(join(out, 'inside-night-counter.png')); await p.eval(`window.__camSpec(${JSON.stringify(spec(2.4, -2.4, 0, 1, 4))})`); await p.frames(10); await p.shot(join(out, 'door-night.png')); console.log('saved night'); }
      console.log('errors', JSON.stringify(p.errors().slice(0, 4)));
      await p.S('Page.close').catch(() => {});
    }
    if (want.has('retina')) {   // a Retina desktop (1440 x 900 at 2x): the counter view by day and by night
      const p = await mk(1440, 900, '', 2);
      await p.eval("window.__lifeSet('hiru')"); await p.eval(`window.__camSpec(${JSON.stringify(spec(4.3, 2.0, -1, -0.2, 4))})`); await p.frames(8); await p.shot(join(out, 'inside-day-counter-retina.png'));
      await p.eval("window.__lifeSet('yoru')"); await p.frames(4); await p.eval(`window.__camSpec(${JSON.stringify(spec(4.3, 2.0, -1, -0.2, 4))})`); await p.frames(10); await p.shot(join(out, 'inside-night-counter-retina.png')); console.log('saved retina');
      console.log('errors', JSON.stringify(p.errors().slice(0, 4))); await p.S('Page.close').catch(() => {});
    }
    if (want.has('ref')) {
      const p = await mk(540, 960, '&fov=63.6');
      await p.eval("window.__lifeSet('hiru')");
      for (const [t, ang, pitch] of [[29, -145.2, 0.4], [38, 158.3, 0.5], [44, 107.0, 1.5]]) {
        const [X, Z] = roomToWorld(5.2, 2.5);
        await p.eval(`window.__setCam(${X.toFixed(3)}, ${(FY + 1.55).toFixed(3)}, ${Z.toFixed(3)}, ${roomYaw(ang)}, ${pitch})`); await p.frames(8);
        await p.shot(join(out, `ref-t${t}-app.png`)); console.log('saved ref', t);
      }
      await p.S('Page.close').catch(() => {});
    }
  }
  // ---- the phone: the real page at 393 x 852 @3x with touch, as a visitor uses it: the door with 入る, then inside with 出る
  for (const [PW, PH, tag] of (want.has('land') ? [[393, 852, ''], [852, 393, '-landscape']] : [[393, 852, '']])) if (want.has('door') || want.has('phone')) {
    const p = await browser.page({ width: PW, height: PH, dpr: 3 });
    await p.S('Emulation.setDeviceMetricsOverride', { width: PW, height: PH, deviceScaleFactor: 3, mobile: true, screenWidth: PW, screenHeight: PH });
    await p.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.S('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
    await p.goto(`${srv.url}index.html?fixtures=1`);
    await p.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
    await p.eval("document.getElementById('go').click()"); await p.frames(30); await p.eval('window.__life.live.ready'); await p.frames(10);
    await p.eval("window.__lifeSet('hiru')");
    const rec = await p.eval('(() => { const i = window.__explore.interiors.cafeRst; return i ? { entrance: i.entrance, inside: i.inside } : null; })()');
    if (!rec) throw new Error('no café RST interior on the page');
    const pose = (q) => p.eval(`(() => { window.__life.tour.stop?.(); const pl = window.__ctx.playerObj; pl.fly = false; pl.setPose(${q.x}, ${q.z}, ${q.yaw}, ${q.pitch}); return 1; })()`);
    const touchAt = async (b) => { await p.S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y }] }); await p.frames(2); await p.S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
    const tap = async (label) => {
      const b = await p.eval(`(() => { const e = [...document.querySelectorAll('#klc-pad .cluster .btn')].find((x) => x.textContent.includes(${JSON.stringify(label)})); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!b) return false;
      await touchAt(b); return true;
    };
    // the first-run coach mark (「左で移動・右で視点」) is answered like a visitor does, with a tap on はじめる, so the pictures show the pad as it is in play
    await p.waitFor("(() => { const c = document.querySelector('#klc-pad .coach'); return !!c && !c.hidden; })()", { timeout: 12000 }).catch(() => {});
    { const b = await p.eval("(() => { const e = document.querySelector('#klc-pad .coach .ok'); if (!e || e.closest('.coach').hidden) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()"); if (b) { await touchAt(b); await p.frames(30); console.log('coach mark answered'); } }
    if (want.has('door')) { await pose({ ...rec.entrance, x: rec.entrance.x, z: rec.entrance.z }); await p.frames(40); await p.eval("document.querySelector('#klc-pad')?.removeAttribute('data-idle')"); await p.shot(join(out, `phone-door-enter${tag}.png`)); console.log('saved phone door' + tag + ', 入る button:', await p.eval("[...document.querySelectorAll('#klc-pad .cluster .btn')].map((e) => e.textContent.trim()).join('|')")); }
    if (want.has('phone')) {
      const ok = await tap('入る'); await p.frames(40); console.log('tapped 入る:', ok);
      if (!ok) await pose(rec.inside);
      await p.frames(30); await p.shot(join(out, `phone-inside-exit${tag}.png`)); console.log('saved phone inside' + tag + ', buttons:', await p.eval("[...document.querySelectorAll('#klc-pad .cluster .btn')].map((e) => e.textContent.trim()).join('|')"));
    }
    console.log('phone errors', JSON.stringify(p.errors().slice(0, 4)));
  }
} catch (e) { console.log('FAILED:', e.message); rc = 1; } finally { await browser.close(); srv.server.stop(true); }
process.exit(rc);
