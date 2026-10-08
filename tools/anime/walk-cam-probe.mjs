// Walk-camera audit. Scripted third-person walks on real streets, phone portrait 390×844 and desktop 1280×720.
// Logs, per frame, the camera's height above the ground under it, the boom, the pitch, the field of view and where
// the walker sits on screen. Saves a PNG the moment the boom or the camera jumps, or the camera is low.
//
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/walk-cam-probe.mjs --label before
//   ... --label after --pair /path/before.json
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAndServe, launch, phonePage, sleep, waitGo, ROOT } from './pad-lib.mjs';

const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] ?? true) : d; };
const LABEL = String(arg('label', 'before'));
const PORT = Number(arg('port', 9577));
const ONLY = String(arg('only', 'phone,desktop')).split(',').filter(Boolean);
const OUT = process.env.WALK_CAM_OUT || join(ROOT, 'dist', 'review', 'walk-cam');
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.error('[walk-cam]', ...a);
const PAIR = arg('pair');
const pairPath = PAIR ? (String(PAIR).startsWith('/') ? String(PAIR) : join(OUT, String(PAIR))) : null;
const pairSpots = pairPath ? JSON.parse(readFileSync(pairPath, 'utf8')).shots || [] : [];

const INSTALL = `(() => {
  if (window.__wc) return 'again';
  const ctx = window.__ctx, P = ctx.playerObj, cam = ctx.camera, Ph = ctx.physics, T3 = window.THREE;
  const v = new T3.Vector3(), d = new T3.Vector3();
  const frames = [];
  let on = false, mode = 'settle', held = null, shots = 0, segFov = null, segBreak = true;
  const rootOf = () => { let r = null; ctx.scene.traverse((o) => { if (!r && o.visible && /^(meme|chr_play-)/.test(o.name || '')) r = o; }); return r; };   // the walker: メメ, or the original figure
  function sample() {
    cam.getWorldDirection(d);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180 / Math.PI;
    const g = Ph.groundHeight(cam.position.x, cam.position.z, cam.position.y - 0.45);
    const h = cam.position.y - g;
    const av = ctx.services.play && ctx.services.play.avatar;
    const boom = av ? av.boom : NaN;
    let sy = NaN, vis = 0;
    const root = rootOf();
    if (root && root.visible) {
      vis = 1;
      cam.updateMatrixWorld();
      v.set(root.position.x, root.position.y + 0.55, root.position.z).project(cam);
      sy = (1 - v.y) / 2;
    }
    return {
      t: frames.length, mode, route: window.__wcRoute || '', boom, h, pitch, fov: cam.fov,
      sy, vis, cx: cam.position.x, cy: cam.position.y, cz: cam.position.z,
      px: P.pos.x, py: P.pos.y, pz: P.pos.z,
      fy: ((P.prevPos || P.pos).y + (P.pos.y - (P.prevPos || P.pos).y) * Math.max(0, Math.min(1, ctx.alpha || 0))) + (P.lift || 0),
    };
  }
  ctx.onUpdate(() => {
    if (held) {
      cam.position.set(held.cx, held.cy, held.cz);
      cam.lookAt(held.lx, held.ly, held.lz);
      cam.fov = held.fov; cam.updateProjectionMatrix();
      return;
    }
    if (!on) return;
    const s = sample();
    const prev = frames[frames.length - 1];
    const same = !segBreak && prev && prev.mode === s.mode;
    segBreak = false;
    s.dBoom = same ? s.boom - prev.boom : 0;
    s.dY = same ? (s.cy - prev.cy) - ((s.fy ?? s.py) - (prev.fy ?? prev.py)) : 0;
    s.dH = same ? s.h - prev.h : 0;
    if (segFov == null) segFov = s.fov;
    s.dFov = s.fov - segFov;
    frames.push(s);
    // a jump is the boom or the camera moving, not the ground sample changing under a steady camera
    const jump = Math.abs(s.dBoom) > 0.3 || Math.abs(s.dY) > 0.3;
    const low = s.h < 0.599;
    const up = s.pitch > 1 && s.h < 1.4;
    const distort = (s.mode === 'walk' || s.mode === 'run') && Math.abs(s.dFov) > 0.4;
    if ((jump || low || up) && shots < 8) {
      const last = window.__wcShots && window.__wcShots[window.__wcShots.length - 1];
      const far = !last || Math.hypot(s.px - last.px, s.pz - last.pz) > 2.5 || last.why !== (jump ? 'jump' : low ? 'low' : 'up');
      if (far) {
        const why = jump ? 'jump' : low ? 'low' : 'up';
        held = { cx: s.cx, cy: s.cy, cz: s.cz, lx: s.px, ly: s.py + 0.9, lz: s.pz, fov: s.fov };
        shots++;
        const rec = { why, route: window.__wcRoute || '', mode: s.mode, ...s, file: '' };
        (window.__wcShots ||= []).push(rec);
        window.__wcPending = rec;
      }
    }
    void distort;
  });
  window.__wcShots = [];
  window.__wc = {
    start(m) { mode = m || 'settle'; if (m === 'walk' || m === 'run') segFov = null; segBreak = true; on = true; },
    stop() { on = false; },
    mark(m) { mode = m; segFov = null; },
    release() { held = null; segBreak = true; window.__wcPending = null; },
    get pending() { return window.__wcPending || null; },
    summary() {
      const segs = {};
      let maxBoom = 0, maxY = 0, maxH = 0, minH = Infinity, lookUp = 0, below = 0, jumpN = 0;
      let fovWalk = 0, fovRun = 0;
      const worst = [];
      for (const f of frames) {
        const g = segs[f.mode] || (segs[f.mode] = { n: 0, fovMin: Infinity, fovMax: -Infinity, minH: Infinity, maxBoomJump: 0, maxY: 0 });
        g.n++; g.fovMin = Math.min(g.fovMin, f.fov); g.fovMax = Math.max(g.fovMax, f.fov);
        g.minH = Math.min(g.minH, f.h); g.maxBoomJump = Math.max(g.maxBoomJump, Math.abs(f.dBoom)); g.maxY = Math.max(g.maxY, Math.abs(f.dY));
        maxBoom = Math.max(maxBoom, Math.abs(f.dBoom)); maxY = Math.max(maxY, Math.abs(f.dY)); maxH = Math.max(maxH, Math.abs(f.dH));
        if (Number.isFinite(f.h)) minH = Math.min(minH, f.h);
        if (f.h < 0.599) below++;
        if (f.pitch > 1 && f.h < 1.4) lookUp++;
        if (Math.abs(f.dBoom) > 0.3 || Math.abs(f.dY) > 0.3) jumpN++;
        if (f.mode === 'walk') fovWalk = Math.max(fovWalk, Math.abs(f.dFov));
        if (f.mode === 'run') fovRun = Math.max(fovRun, Math.abs(f.dFov));
        const score = Math.max(Math.abs(f.dBoom), Math.abs(f.dY), Math.abs(f.dH), f.h < 0.6 ? 2 : 0, f.pitch > 1 ? 1 : 0);
        if (score > 0.15) worst.push({ score, route: f.route, mode: f.mode, boom: +f.boom.toFixed(3), dBoom: +f.dBoom.toFixed(3), h: +f.h.toFixed(3), dH: +f.dH.toFixed(3), dY: +f.dY.toFixed(3), pitch: +f.pitch.toFixed(2), fov: +f.fov.toFixed(2), dFov: +f.dFov.toFixed(2), sy: Number.isFinite(f.sy) ? +f.sy.toFixed(3) : null, px: +f.px.toFixed(2), py: +f.py.toFixed(2), pz: +f.pz.toFixed(2), vis: f.vis });
      }
      worst.sort((a, b) => b.score - a.score);
      const slim = {};
      for (const [k, g] of Object.entries(segs)) slim[k] = { n: g.n, fov: [+g.fovMin.toFixed(2), +g.fovMax.toFixed(2)], minH: +g.minH.toFixed(3), maxBoomJump: +g.maxBoomJump.toFixed(3), maxY: +g.maxY.toFixed(3) };
      return { n: frames.length, jumpN, maxBoomJump: +maxBoom.toFixed(3), maxY: +maxY.toFixed(3), maxH: +maxH.toFixed(3), minH: Number.isFinite(minH) ? +minH.toFixed(3) : null, below, lookUp, fovWalk: +fovWalk.toFixed(3), fovRun: +fovRun.toFixed(3), segs: slim, worst: worst.slice(0, 18) };
    },
  };
  window.__wcKeys = (mode) => {
    P.keys.delete('KeyW'); P.keys.delete('ShiftLeft'); P.keys.delete('KeyS');
    if (mode === 'walk' || mode === 'run') P.keys.add('KeyW');
    if (mode === 'run') P.keys.add('ShiftLeft');
    P.enabled = true; P.fly = false; P.person = 'third';
  };
  window.__wcSpots = () => {
    const L = window.__L, S = L.SPOTS || {}, spots = [];
    const push = (id, x, z, yaw) => spots.push({ id, x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(2) });
    const hw = L.HERO && L.HERO.walk;
    if (hw) push('hero', hw.x, hw.z, hw.yaw);
    const sx = -1.06, sz = 75.54;
    push('pier7stair', sx, sz, Math.atan2(-(1.64 - sx), -(80.45 - sz)) * 180 / Math.PI);
    if (S.isuzuTorii && S.isuzuShrine) push('shrine', S.isuzuTorii.x, S.isuzuTorii.z, Math.atan2(-(S.isuzuShrine.x - S.isuzuTorii.x), -(S.isuzuShrine.z - S.isuzuTorii.z)) * 180 / Math.PI);
    const p7 = (ctx.services.life && ctx.services.life.tour && ctx.services.life.tour.stops || []).find((s) => s.id === 'pier7');
    if (p7 && p7.walk) push('quay', p7.walk.x, p7.walk.z, p7.walk.yaw);
    else push('quay', 5, 40, -130);
    // the station arcade: stand just south of the footprint and walk along its long face
    push('arcade', -1372, -450, Math.atan2(-(-1380 + 1372), -(-420 + 450)) * 180 / Math.PI);
    // a second hero heading that passes the most colliders (poles, cars, people), still walkable
    const x0 = hw ? hw.x : 168, z0 = hw ? hw.z : -122;
    let best = null;
    for (let q = 0; q < 24; q++) {
      const yaw = q * Math.PI / 12, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let y = Ph.groundHeight(x0, z0, 1e9), ok = 0, hits = 0;
      for (let s = 0.5; s <= 16; s += 0.5) {
        const px = x0 + fx * s, pz = z0 + fz * s, g = Ph.groundHeight(px, pz, y + 0.45);
        if (Math.abs(g - y) > 0.5 || Ph.solidAt(px, pz, g + 0.9) || !Ph.standable(px, pz, g + 0.1)) break;
        ok = s; y = g;
        if (Ph.solidAt(px, pz, g + 1.3) || Ph.solidAt(px + 1.1, pz, g + 1.2) || Ph.solidAt(px - 1.1, pz, g + 1.2)) hits++;
      }
      if (ok >= 8 && (!best || hits > best.hits)) best = { yaw: yaw * 180 / Math.PI, hits, ok };
    }
    if (best && best.hits > 0) push('clutter', x0, z0, best.yaw);
    return { spots, tier: (ctx.quality && (ctx.quality.tier || ctx.quality.name)) || '', phone: !!(ctx.quality && ctx.quality.phone), aspect: cam.aspect, fov: cam.fov };
  };
  return 'ok';
})()`;

async function enter(page, dev) {
  if (dev === 'phone') { await waitGo(page); await page.eval("document.getElementById('go').click()"); }
  else { await waitGo(page); await page.eval("document.getElementById('go').click()"); }
  await page.waitFor("document.body.classList.contains('playing')", { timeout: 30000 });
  await page.waitFor(`(() => { let r = null; window.__ctx.scene.traverse((o) => { if (/^(meme|chr_play-)/.test(o.name || '')) r = o; }); return !!r; })()`, { timeout: 90000 });
  await page.eval(INSTALL);
}

async function drainShots(page, dev, bag) {
  const pending = await page.eval('window.__wc.pending');
  if (!pending) return;
  const name = `${LABEL}-${dev}-${pending.route || 'x'}-${pending.why}-${bag.length}.png`;
  await page.shot(join(OUT, name));
  pending.file = name;
  bag.push(pending);
  log('shot', name, 'boom', pending.dBoom, 'h', pending.h, 'pitch', pending.pitch, 'fov', pending.fov);
  await page.eval('window.__wc.release()');
}

async function leg(page, dev, route, mode, ms, bag) {
  await page.eval(`window.__wcRoute = ${JSON.stringify(route.id)}; window.__wc.mark(${JSON.stringify(mode)}); window.__wcKeys(${JSON.stringify(mode)})`);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await drainShots(page, dev, bag);
    // a before-spot we are walking through: one still, so the after run can pair it
    if (pairSpots.length) {
      const here = await page.eval(`(() => { const p = window.__ctx.playerObj.pos; return { x: p.x, z: p.z, route: window.__wcRoute }; })()`);
      const hit = pairSpots.find((s) => !s._got && s.dev === dev && s.route === here.route && Math.hypot(s.px - here.x, s.pz - here.z) < 1.8);
      if (hit) {
        hit._got = true;
        const name = `${LABEL}-${dev}-${hit.route}-${hit.why}-pair.png`;
        await page.shot(join(OUT, name));
        bag.push({ ...hit, file: name, pair: true });
        log('pair', name);
      }
    }
    await sleep(60);
  }
}

async function runDevice(browser, srv, dev) {
  const page = dev === 'phone'
    ? await phonePage(browser, { width: 390, height: 844, dpr: 1 })
    : await browser.page({ width: 1280, height: 720, dpr: 1 });
  const q = dev === 'phone' ? 'lang=ja&fps=60' : 'lang=ja&fps=60&unsafe=1&q=high';
  await page.goto(`${srv.url}index.html?${q}`);
  await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
  await enter(page, dev);
  const info = await page.eval('window.__wcSpots()');
  log(dev, 'tier', JSON.stringify(info));
  const shots = [];
  for (const spot of info.spots) {
    log(dev, 'route', spot.id, spot.x, spot.z, spot.yaw);
    await page.eval('window.__wcKeys("stop")');
    // stop before the teleport, so the placed pose is not a boom jump between routes
    await page.eval(`window.__wc.stop(); window.__wcRoute = ${JSON.stringify(spot.id)}; window.__wc.mark("settle")`);
    await page.eval(`window.__camSpec(${JSON.stringify(spot.x + ',' + spot.z + ',' + spot.yaw + ',0')})`);
    await page.eval('window.__wc.start("settle")');
    await sleep(700);
    await leg(page, dev, spot, 'walk', 3200, shots);
    await leg(page, dev, spot, 'run', 2200, shots);
    await page.eval('window.__wcKeys("stop")');
    await sleep(250);
  }
  await page.eval('window.__wc.stop()');
  const summary = await page.eval('window.__wc.summary()');
  summary.dev = dev;
  summary.tier = { tier: info.tier, phone: info.phone, aspect: info.aspect, fov: info.fov };
  summary.spots = info.spots;
  summary.shots = shots.map(({ t, mode, why, route, file, boom, dBoom, h, dH, dY, pitch, fov, dFov, sy, px, pz, pair }) => ({ t, mode, why, route, file, boom, dBoom, h, dH, dY, pitch, fov, dFov, sy, px, pz, pair: !!pair }));
  await page.goto('about:blank');
  return summary;
}

const built = process.argv.includes('--no-build')
  ? { srv: (await import('./cdp.mjs')).serve({ port: PORT, dist: join(ROOT, `dist/anime-${PORT}`) }) }
  : await buildAndServe(PORT);
const browser = await launch({ quiet: true });
const report = { label: LABEL, at: new Date().toISOString(), devices: [] };
try {
  for (const dev of ONLY) {
    log('device', dev);
    const t0 = Date.now();
    try { report.devices.push(await runDevice(browser, built.srv, dev)); }
    catch (e) { log('failed', dev, e && e.stack || e); report.devices.push({ dev, error: String(e && e.message || e) }); }
    log('device done', dev, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
} finally {
  await browser.close(); built.srv.stop();
}
const shots = [];
for (const d of report.devices) for (const s of d.shots || []) shots.push({ dev: d.dev, ...s });
report.shots = shots;
writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
