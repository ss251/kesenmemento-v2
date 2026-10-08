// [v3:integrate] End-to-end QA of the PRODUCTION build (dist/ from scripts/build-web.js, served by scripts/serve.js at /):
// the real interactive flow a visitor sees, not the shot-mode page. ALWAYS through the machine gate:
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/qa3.mjs [--port 8815] [--out dist/qa3/ui] [--phone 1] [--bench 1] [--build 1]
// Steps: load / -> intro board -> "Enter the town" -> HUD; time presets (buttons + T); drone/walk (V + button); tour stop +
// auto tour (G); live chip + arrivals panel; arriving boats at 06:30; characters; audio toggle (button + M); photo mode
// (1920x1080: the machine caps forbid 4K until 2026-10-01 00:00Z; scale 1 = 3840x2160 is the same path); hide UI (H).
// --phone 1 also runs the 390x844 touch layout. --bench 1 measures GPU ms/frame per quality tier on the wow cameras.
// [v4:explore] then the explorable core: streaming in the far core, search (JA / EN), the full map, the car on the real
// roads, the fish market, 男山本店 and café RST interiors, POI labels (--noexplore skips it; --dist <dir> builds privately).
// Prints a JSON report and exits 1 on any page error or failed check. Never leaves Chrome or the server running.
import { join, resolve, relative } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, ROOT, build as cdpBuild } from './cdp.mjs';
import { start } from '../../scripts/serve.js';
import { buildWeb } from '../../scripts/build-web.js';
import sharp from 'sharp';   // [v3:fix] frame-content checks on the walk spots

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const port = Number(args.port || 8815);
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const out = resolve(ROOT, args.out || 'dist/qa3/ui');
mkdirSync(join(out, '..'), { recursive: true });
const report = { checks: [], errors: [], timings: {}, bench: {} };
const check = (name, ok, info) => { report.checks.push({ name, ok: !!ok, ...(info !== undefined && { info }) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [v4:explore] --dist <dir>: build into (and serve) a private directory instead of dist/ (another agent may be using it)
const distDir = args.dist ? resolve(ROOT, args.dist) : null;
if (args.build) { const t0 = Date.now(); if (distDir) await cdpBuild({ outdir: distDir, minify: true }); else await buildWeb({ quiet: true }); report.timings.buildMs = Date.now() - t0; }
const srv = await start({ port, build: false, quiet: true, ...(distDir && { dist: distDir }) });
let browser;
try {
  browser = await launch({ quiet: true });
  const W = 1600, H = 900;
  const page = await browser.page({ width: W, height: H });
  const key = async (code, k = code.replace(/^Key|^Digit/, '').toLowerCase()) => {
    await page.S('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
    await page.S('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
  };
  const click = (sel) => page.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`);
  const shot = async (name) => { const f = `${out}_${name}.png`; await page.shot(f); console.log('  saved', relative(ROOT, f)); };
  const hold0 = async (code, k, vk, ms) => { await page.S('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: vk }); await sleep(ms); await page.S('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk }); };
  const cam = () => page.eval('(() => { const c = window.__ctx.camera.position; return [c.x, c.y, c.z].map((v) => +v.toFixed(1)); })()');

  // ---- load
  const t0 = Date.now();
  await page.goto(`${srv.url}?person=first`);   // [integration] the walk checks are first-person by design (eye height, the spot framing); third person is the players' default and has its own tests
  await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
  report.timings.loadMs = Date.now() - t0;
  const st = await page.eval('({ modules: window.__stats.modules, batch: window.__stats.batch, errors: window.__errors })');
  report.timings.modules = st.modules; report.timings.batch = st.batch;
  // [v4:integrate] the v4 build order: landmarks (civic landmarks) and explore (streamed core, drive, map, search) too
  check('all seven modules built', ['environment', 'water', 'town', 'harbor', 'landmarks', 'life', 'explore'].every((m) => st.modules[m]), Object.keys(st.modules));
  check('no module errors', !st.errors.length, st.errors.map((e) => e.module + ': ' + e.message.split('\n')[0]));
  await shot('00_intro');

  // ---- enter
  await click('#go');
  // [title] the mark leaves, then the camera flies into the town (about 2 s, 8 s safety) before body.playing. Twenty frames was the old instant start.
  let entered = false;
  try { await page.waitFor("document.body.classList.contains('playing')", { timeout: 12000 }); entered = true; } catch { /* the check below records it */ }
  check('entered the town (body.playing)', entered);
  check('HUD visible', await page.eval("!!document.getElementById('klc-ui') && !document.getElementById('klc-ui').hidden"));
  await page.eval('window.__life.live.ready');
  await page.frames(10);
  const liveSt = await page.eval('({ status: __life.live.state.status, origin: __life.live.state.origin, sample: __life.live.state.sample, arrivals: __life.live.state.arrivals.length, wx: __life.live.state.weather?.sky, chip: document.querySelector("#klc-ui .chip")?.innerText.replace(/\\s+/g, " ") })');
  check('live chip filled', liveSt.status === 'ok' && /\d\d:\d\d/.test(liveSt.chip || ''), liveSt);
  check('sample data labelled サンプル', !liveSt.sample || /サンプル|Sample/i.test(liveSt.chip || ''), liveSt.chip);
  await shot('01_enter');

  // ---- time presets: every button, then T cycles
  const presets = await page.eval('__life.time.presets.map((p) => p.id)');
  for (const id of presets) {
    await click(`#klc-ui [data-act="preset"][data-id="${id}"]`);
    await page.eval('new Promise((r) => setTimeout(r, 3600))');   // 3.2 s transition
    await page.frames(4);
    const s = await page.eval('({ preset: __life.time.preset, clock: __life.time.clock(), night: +(+__life.time.night).toFixed(2) })');
    check(`preset ${id}`, s.preset === id, s);
    if (id === 'yoru' || id === 'asa') await shot(`02_preset_${id}`);
  }
  const before = await page.eval('__life.time.preset');
  await key('KeyT'); await page.eval('new Promise((r) => setTimeout(r, 3600))');
  check('T cycles the preset', (await page.eval('__life.time.preset')) !== before, await page.eval('__life.time.preset'));
  await click('#klc-ui [data-act="preset"][data-id="yugata"]'); await page.eval('new Promise((r) => setTimeout(r, 3600))');

  // ---- arrivals panel
  await click('#klc-ui [data-act="arrivals"]'); await page.frames(4);
  const arr = await page.eval('document.querySelectorAll("#klc-arr li").length');
  check('arrivals panel lists boats', arr > 0, arr);
  await shot('03_arrivals');
  await click('#klc-ui [data-act="arrivals"]');

  // ---- boats arriving (06:30: the sample list's morning arrivals glide in)
  await page.eval('void __life.time.setHours(6.0)'); await page.frames(4);
  const a0 = await page.eval('JSON.stringify(window.__harbor?.state?.() || [])');
  await page.eval('void __life.time.setHours(6.5)'); await page.frames(30);
  const a1 = JSON.parse(await page.eval('JSON.stringify(window.__harbor?.state?.() || [])'));
  const moving = a1.filter((b) => b.phase === 'approach' || b.phase === 'berthed');
  check('arriving boats spawned from the live list', a1.length > 0 && moving.length > 0, { total: a1.length, active: moving.map((b) => `${b.vessel}:${b.phase}`).slice(0, 6), dry: a1.filter((b) => b.dry).length });
  check('arrival routes stay on water', a1.every((b) => !b.dry));
  void a0;

  // ---- tour: a stop, then the auto tour (G)
  await click('#klc-ui [data-act="preset"][data-id="yugata"]'); await page.eval('new Promise((r) => setTimeout(r, 3600))');
  await click('#klc-ui [data-act="places"]'); await page.frames(3);
  const stops = await page.eval('__life.tour.stops.map((s) => s.id)');
  check('tour stops listed', stops.length >= 5, stops);
  const c0 = await cam();
  await click('#klc-ui [data-act="stop"][data-id="market"]');
  await page.eval('new Promise((r) => setTimeout(r, 12000))');
  const c1 = await cam();
  const mk = await page.eval("__life.tour.stops.find((s) => s.id === 'market').drone.pos");   // [v3:polish3] the stop's own framing (life/tour.js FRAMES)
  check('fly to the market stop', Math.hypot(c1[0] - mk[0], c1[2] - mk[2]) < 80, { from: c0, to: c1, want: mk });
  await shot('04_tour_market');
  await key('KeyG'); await page.eval('new Promise((r) => setTimeout(r, 2500))');
  const playing = await page.eval('__life.tour.playing');
  const c2 = await cam();
  check('G starts the auto tour and the camera moves', playing && Math.hypot(c2[0] - c1[0], c2[2] - c1[2]) > 2, { playing, cam: c2 });
  await key('KeyG'); await page.frames(3);
  check('G stops the auto tour', !(await page.eval('__life.tour.playing')));

  // ---- drone / walk
  await click('#klc-ui [data-act="stop"][data-id="hero"]'); await page.eval('new Promise((r) => setTimeout(r, 9000))');
  await click('#klc-ui [data-act="view"]'); await page.frames(20);
  // [integration] the view button cycles 3rd-person walk -> 1st-person walk -> drone; these checks are first person
  if (await page.eval('window.__ctx.playerObj.person') === 'third') { await click('#klc-ui [data-act="view"]'); await page.frames(20); }
  // ground = the physics floor under the eye (terrain, or the walk boxes of decks / quays / the promenade)
  const w = await page.eval('(() => { const p = window.__ctx.playerObj, c = window.__ctx.camera.position; return { fly: p.fly, y: +c.y.toFixed(2), ground: +window.__ctx.physics.groundHeight(c.x, c.z, c.y).toFixed(2) }; })()');
  check('walk mode: eye height above the ground', !w.fly && w.y - w.ground > 1.2 && w.y - w.ground < 2.2, w);
  // walk forward for 1.5 s (W) and check the player moved and stayed on the ground
  const p0 = await cam();
  await page.S('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await sleep(1500);
  await page.S('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await page.frames(5);
  const p1 = await cam();
  check('walking moves the player', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.8, { p0, p1 });
  await shot('05_walk');
  // [v3:fix] the quay edge is a wall: face the bay from the promenade and hold W for 4 s -> still on land (or a deck)
  await page.eval("(() => { const p = window.__ctx.playerObj; p.setPose(168, -122, 180, 0); return 1; })()");
  await page.S('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await sleep(4000);
  await page.S('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await page.frames(5);
  const sea = await page.eval('(() => { const p = window.__ctx.playerObj.pos, P = window.__ctx.physics; return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), water: window.__L.isWater(p.x, p.z), standable: P.standable ? P.standable(p.x, p.z, p.y) : null, y: +p.y.toFixed(2) }; })()');
  check('walk mode: the player cannot walk off the quay into the sea', sea.standable !== false && sea.y > 1.0, sea);

  // [v3:fix] every tour stop's walk spot: on land (or a deck), outside every building (lots + market halls), and a real
  // picture (no single colour quantised to 3 bits per channel covers more than 45 % of the frame)
  const spots = await page.eval(`(() => {
    const T = window.__life.tour, L = window.__L, halls = window.__ctx.services.harbor?.market?.halls || [];
    const inBox = (x, z, cx, cz, rotY, w, d) => { const c = Math.cos(rotY), s = Math.sin(rotY), dx = x - cx, dz = z - cz; return Math.abs(dx * c - dz * s) < w / 2 && Math.abs(dx * s + dz * c) < d / 2; };
    return T.stops.map((st) => {
      if (!st.walk) return { id: st.id, walk: false };
      const { x, z } = st.walk;
      const lot = L.LOTS.filter((l) => l.zone !== 'far').find((l) => inBox(x, z, l.obb.cx, l.obb.cz, l.obb.rotY, l.obb.w, l.obb.d));
      const hall = halls.find((h) => inBox(x, z, h.x, h.z, h.rotY, h.depth, h.len));
      return { id: st.id, walk: true, water: L.isWater(x, z) && !(window.__ctx.physics.standable?.(x, z)), lot: lot ? lot.id : null, hall: !!hall };
    });
  })()`);
  await page.eval("document.body.classList.add('noui')");
  // [v4:polish3] wait until the streamed core has built what this view wants and every pool is flushed (max 20 s), so a
  // walk-spot frame is never a half-streamed one
  // (idle three polls in a row, and the tile under the player at L0 when it has one: right after a teleport the plan
  // can still be the old place's, which looks idle)
  const settled = `new Promise((r) => { const t0 = performance.now(); let ok = 0; const f = () => {
    const S = window.__explore?.stream; if (!S) return r(1);
    const sm = S.summary(), p = window.__ctx.playerObj.pos;
    const t = window.__explore.tiles && [...window.__explore.tiles.values()].find((q) => q.cx - 50 <= p.x && p.x < q.cx + 50 && q.cz - 50 <= p.z && p.z < q.cz + 50);
    const lv = t && S.level(t.key), atL0 = !t || !(t.mid.length + t.far.length) || (lv && lv.l0 === 'ready');
    ok = !sm.busy && !sm.pending && !S.sb.pending() && atL0 ? ok + 1 : 0;
    if (ok >= 3 || performance.now() - t0 > 25000) r(1); else setTimeout(f, 150); }; setTimeout(f, 400); })`;
  // a coarse picture of the frame (32 x 18 RGB) to compare two visits of the same spot
  const thumb = async (buf) => (await sharp(buf).resize(32, 18, { fit: 'fill' }).removeAlpha().raw().toBuffer());
  const nearNow = () => page.eval('window.__ctx.pipeline.nearShare ? +window.__ctx.pipeline.nearShare(window.__ctx.camera, 6, 16, 9).toFixed(3) : -1');
  // [v4:polish1 -> polish3] the 気仙沼簡易裁判所 spot on an almost fresh stream, before the long walk loop (the reference)
  let courtRef = null;
  if (spots.some((q) => q.id === 'court' && q.walk)) {
    await page.eval("void window.__life.tour.walkTo('court')"); await page.eval(settled); await page.frames(6);
    courtRef = { img: await thumb(await page.shot(`${out}_walk_court_ref.png`)), near: await nearNow() };
  }
  // [v4:polish3] 'place visible': at an extra place's walk spot, the place's aim point (its drone look point) projects
  // into the frame within 25 deg of the view centre, and the pre-pass depth there is at least min(0.8 d, d - r - 2)
  // (r = the place's own footprint radius): the frame shows the place, not a wall, a slope or a trunk in front of it
  const placeVisible = (id) => page.eval(`(() => {
    const st = window.__life.tour.stops.find((s) => s.id === ${JSON.stringify(id)}); if (!st?.extra || !st.drone?.look) return null;
    const L = window.__L, cam = window.__ctx.camera, V = cam.position.constructor, [x, y, z] = st.drone.look, t = new V(x, y, z);
    const inBox = (px, pz, l, m = 0) => { const o = l.obb, c = Math.cos(o.rotY), s = Math.sin(o.rotY), dx = px - o.cx, dz = pz - o.cz; return Math.abs(dx * c - dz * s) < o.w / 2 + m && Math.abs(dx * s + dz * c) < o.d / 2 + m; };
    // the place's own footprint: the lot under its point (else the biggest within 8 m), with every lot of the same
    // landmark (a civic landmark is several GSI lots); r = the farthest corner from the aim point
    const nearL = L.LOTS.filter((l) => Math.abs(l.obb.cx - x) < 160 && Math.abs(l.obb.cz - z) < 160);
    const own = nearL.find((l) => inBox(x, z, l)) || nearL.filter((l) => inBox(x, z, l, 8)).sort((a, b) => b.obb.w * b.obb.d - a.obb.w * a.obb.d)[0]
      || nearL.filter((l) => l.landmark && Math.hypot(l.obb.cx - x, l.obb.cz - z) < 40).sort((a, b) => Math.hypot(a.obb.cx - x, a.obb.cz - z) - Math.hypot(b.obb.cx - x, b.obb.cz - z))[0] || null;   // a landmark site round its point
    const group = own ? (own.landmark ? nearL.filter((l) => l.landmark === own.landmark) : [own]) : [];
    let r = 0; for (const l of group) { const o = l.obb, c = Math.cos(o.rotY), s = Math.sin(o.rotY); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lx = a * o.w / 2, lz = b * o.d / 2; r = Math.max(r, Math.hypot(o.cx + lx * c + lz * s - x, o.cz - lx * s + lz * c - z)); } }
    const d = t.distanceTo(cam.position);
    const fwd = new V(0, 0, -1).applyQuaternion(cam.quaternion), dir = t.clone().sub(cam.position).normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, fwd.dot(dir)))) * 180 / Math.PI;
    const p = t.clone().project(cam), u = (p.x + 1) / 2, v = (1 - p.y) / 2;
    let depth = 0;
    if (p.z < 1 && u > 0 && u < 1 && v > 0 && v < 1) for (const [du, dv] of [[0, 0], [0.015, 0], [-0.015, 0], [0, 0.02], [0, -0.02]]) depth = Math.max(depth, window.__ctx.pipeline.depthAt(cam, u + du, v + dv));
    const need = Math.min(0.8 * d, d - r - 2);
    return { ang: +ang.toFixed(1), d: +d.toFixed(1), depth: Number.isFinite(depth) ? +depth.toFixed(1) : 9999, need: +need.toFixed(1), ok: ang <= 25 && depth >= need };
  })()`);
  for (const sp of spots) {
    if (!sp.walk) { check(`walk spot ${sp.id}: exists`, false, sp); continue; }
    await page.eval(`void window.__life.tour.walkTo(${JSON.stringify(sp.id)})`);
    await page.eval(settled);
    await page.frames(6);
    const buf = await page.shot(`${out}_walk_${sp.id}.png`);
    const { data, info } = await sharp(buf).resize(160, 90, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const bins = new Map(); const n = info.width * info.height;
    for (let i = 0; i < n; i++) { const k = ((data[i * info.channels] >> 5) << 6) | ((data[i * info.channels + 1] >> 5) << 3) | (data[i * info.channels + 2] >> 5); bins.set(k, (bins.get(k) || 0) + 1); }
    const top = Math.max(...bins.values()) / n;
    // [v4:polish1] near-depth: no wall, trunk, pole or facade right in front of the eye (more than 25 % of a 16 x 9 ray
    // grid hitting closer than 6 m, the pavement not counted; the pre-pass depth of the frame just shot)
    const near = await page.eval('window.__ctx.pipeline.nearShare ? +window.__ctx.pipeline.nearShare(window.__ctx.camera, 6, 16, 9).toFixed(2) : -1');
    report.walkNear = { ...(report.walkNear || {}), [sp.id]: near };
    check(`walk spot ${sp.id}: on land, outside buildings, a real picture, nothing within 6 m`, !sp.water && !sp.lot && !sp.hall && top <= 0.45 && near >= 0 && near <= 0.25, { ...sp, topColourShare: +top.toFixed(2), near6m: near });
    const pv = await placeVisible(sp.id);
    if (pv) { report.placeVisible = { ...(report.placeVisible || {}), [sp.id]: pv }; check(`walk spot ${sp.id}: the place is in view (within 25 deg, not hidden)`, pv.ok, pv); }
  }
  // [v4:polish3] regression (blocker: after the long loop a kit building drew as floating slabs and windows): back at
  // 気仙沼簡易裁判所, the settled frame matches the early visit, and every streamed pool is intact
  if (courtRef) {
    await page.eval("void window.__life.tour.walkTo('court')"); await page.eval(settled); await page.frames(6);
    const img = await thumb(await page.shot(`${out}_walk_court_again.png`)), near = await nearNow();
    let diff = 0; for (let i = 0; i < img.length; i++) diff += Math.abs(img[i] - courtRef.img[i]); diff /= img.length;
    const v = await page.eval('window.__explore.stream.sb.validate()');
    check('stream: after the walk loop the court spot draws as on the early visit (frame, near-depth) and every pool is intact', diff < 10 && Math.abs(near - courtRef.near) <= 0.03 && v.nBad === 0, { meanAbsDiff: +diff.toFixed(2), near, nearRef: courtRef.near, pools: v.pools, slots: v.slots, bad: v.bad.slice(0, 4) });
  }
  await page.eval("document.body.classList.remove('noui')");
  await page.eval("void window.__life.tour.walkTo('hero')"); await page.frames(10);   // back on the promenade, still in walk view

  // [v4:integrate] fly mode (F): from the promenade, F lifts off, Space climbs and W flies; F again lands on the ground
  await key('KeyF'); await page.frames(3);
  const fy0 = await cam();
  await hold0('Space', ' ', 32, 1500); await hold0('KeyW', 'w', 87, 1500); await page.frames(4);
  const fy1 = await cam();
  const flyOn = await page.eval('window.__ctx.playerObj.fly');
  const flySpeed = +(Math.hypot(fy1[0] - fy0[0], fy1[2] - fy0[2]) / 1.5).toFixed(1);   // m/s over the 1.5 s of W
  // [v4:polish3] land: wait until the fall ends (sim time runs slower than real time when the gate throttles the frame rate)
  await key('KeyF'); await page.eval('new Promise((r) => { const t0 = performance.now(); const f = () => { const c = window.__ctx.camera.position; if (c.y - window.__ctx.physics.groundHeight(c.x, c.z, c.y) < 2.4 || performance.now() - t0 > 12000) r(1); else setTimeout(f, 100); }; setTimeout(f, 500); })');
  const land = await page.eval('(() => { const p = window.__ctx.playerObj, c = window.__ctx.camera.position; return { fly: p.fly, eye: +(c.y - window.__ctx.physics.groundHeight(c.x, c.z, c.y)).toFixed(2) }; })()');
  // [v4:polish3] fly is 25 m/s (Shift 70): at least 10 m/s measured over the 1.5 s of W (it accelerates in ~0.3 s)
  check('fly mode (F): climbs and flies at city speed, F again lands', flyOn && fy1[1] - fy0[1] > 3 && flySpeed >= 10 && !land.fly && land.eye < 2.5, { from: fy0, to: fy1, mps: flySpeed, land });
  await page.eval("void window.__life.tour.walkTo('hero')"); await page.frames(10);

  await key('KeyV'); await page.eval('new Promise((r) => setTimeout(r, 8000))');
  const d = await page.eval('(() => { const c = window.__ctx.camera.position; return { fly: window.__ctx.playerObj.fly, alt: +(c.y - window.__L.groundAt(c.x, c.z)).toFixed(1) }; })()');
  check('V returns to the drone', d.alt > 25, d);

  // ---- characters
  const cast = await page.eval('({ people: __life.stats.cast?.people, cats: __life.stats.cast?.cats, walkers: __life.stats.cast?.walkers })');
  check('townspeople and cats', cast.people > 10 && cast.cats > 0, cast);

  // ---- audio toggle (button + M)
  const m0 = await page.eval('!!__ctx.audio.muted');
  await click('#klc-ui [data-act="sound"]'); await page.frames(2);
  const m1 = await page.eval('!!__ctx.audio.muted');
  await key('KeyM'); await page.frames(2);
  const m2 = await page.eval('!!__ctx.audio.muted');
  const aud = await page.eval('({ ready: !!__ctx.audio.ready, state: __ctx.audio.context?.state || null, sound: !!__life.sound })');
  check('audio toggles (button, then M)', m1 !== m0 && m2 === m0, { m0, m1, m2, ...aud });

  // ---- photo mode (1920x1080 here; the button saves 3840x2160)
  const ph = await page.eval('window.__photo(0.5, { data: true, noDownload: true }).then((r) => r && ({ w: r.w, h: r.h, name: r.name, b64: r.url.split(",")[1] }))');
  check('photo mode renders a 16:9 PNG without UI', ph && ph.w === 1920 && ph.h === 1080, ph && { w: ph.w, h: ph.h, name: ph.name });
  if (ph) writeFileSync(`${out}_06_photo.png`, Buffer.from(ph.b64, 'base64'));

  // ---- hide UI (H) and back
  await key('KeyH'); await page.frames(3);
  const hidden = await page.eval("document.body.classList.contains('noui')");
  await shot('07_noui');
  await key('KeyH'); await page.frames(3);
  check('H hides and restores the UI', hidden && !(await page.eval("document.body.classList.contains('noui')")));

  // ---- language
  await click('#klc-ui [data-act="lang"]'); await page.frames(3);
  const en = await page.eval('document.getElementById("klc-ui").getAttribute("lang")');
  await shot('08_en');
  await click('#klc-ui [data-act="lang"]');
  check('JA/EN toggle', en === 'en', en);

  // ---- seasons (button, then K) and the tiny planet (button, then O)
  const s0 = await page.eval('__life.season?.id');
  // [v4:integrate] wait for the blend to finish (2.5 s of sim time: slower in real time when the gate throttles the frame rate)
  // [v4:polish3] wait for the NEW season's weight (the old one already weighs 1 when the click lands: that raced)
  const seasonDone = 'new Promise((r) => { const t0 = performance.now(); const f = () => { const i = ["spring", "summer", "autumn", "winter"].indexOf(__life.season?.id); const v = __ctx.shared.uSeason.value.toArray(); if ((i >= 0 && v[i] > 0.995) || performance.now() - t0 > 15000) r(1); else setTimeout(f, 100); }; f(); })';
  await click('#klc-ui [data-act="season"]'); await page.eval('new Promise((r) => setTimeout(r, 300))'); await page.eval(seasonDone);
  const s1 = await page.eval('__life.season?.id');
  const w1 = await page.eval('__ctx.shared.uSeason.value.toArray().map((v) => +v.toFixed(2))');
  await shot('08b_season_' + s1);
  await key('KeyK'); await page.eval('new Promise((r) => setTimeout(r, 300))'); await page.eval(seasonDone);
  const s2 = await page.eval('__life.season?.id');
  await shot('08c_season_' + s2);
  check('season toggles (button, then K) and blends the materials', s0 === 'autumn' && s1 !== s0 && s2 !== s1 && w1[3] > 0.99, { s0, s1, s2, weights: w1 });
  await page.eval("void window.__season('autumn')"); await page.frames(3);
  await click('#klc-ui [data-act="planet"]'); await page.eval('new Promise((r) => setTimeout(r, 1500))');
  const pa = await page.eval('__ctx.planet.active');
  await shot('08d_planet');
  await key('KeyO'); await page.frames(4);
  check('tiny planet (button, then O)', pa && !(await page.eval('__ctx.planet.active')));

  // ---- fps in the live loop (real rAF, gate-throttled)
  const fps = await page.eval('new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { if (++n >= 90) r(+(n * 1000 / (performance.now() - t0)).toFixed(1)); else requestAnimationFrame(f); }; requestAnimationFrame(f); })');
  report.timings.liveFps = fps;
  console.log('  live fps (1600x900, high, gate-throttled):', fps);

  // ---- [v4:explore] the explorable core: streaming, search, map, labels, the car, the interiors, the places
  if (!args.noexplore) {
    const keyDown = (code, k, vk) => page.S('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: vk });
    const keyUp = (code, k, vk) => page.S('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk });
    const hold = async (code, k, vk, ms) => { await keyDown(code, k, vk); await sleep(ms); await keyUp(code, k, vk); };
    // [v4:integrate] hold a key until a page condition holds (or maxMs): movement is in sim time, which runs slower than
    // real time when the gate throttles the frame rate
    const holdUntil = async (code, k, vk, cond, maxMs) => { await keyDown(code, k, vk); const t0 = Date.now(); while (Date.now() - t0 < maxMs && !(await page.eval(cond))) await sleep(150); await keyUp(code, k, vk); };
    const ex = await page.eval('({ has: !!window.__explore, stats: window.__explore?.stats, s: window.__explore?.stream?.summary(), stops: window.__life.tour.stops.length, extra: window.__life.tour.stops.filter((s) => s.extra).length })');
    check('explore: module built, mid-zone base tiles, 20+ extra real places in the tour', ex.has && ex.s?.m1 > 50 && ex.extra >= 20 && ex.stops >= 27, { m1: ex.s?.m1, stops: ex.stops, extra: ex.extra, ms: ex.stats?.ms });
    // the explore UI is up: the minimap has been painted
    const mini = await page.eval(`(() => { const c = document.querySelector('#klc-x .mini canvas'); if (!c || !c.width) return null; const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; const set = new Set(); for (let i = 0; i < d.length; i += 4 * 97) { if (d[i + 3] > 0) n++; set.add((d[i] >> 4) + '|' + (d[i + 1] >> 4) + '|' + (d[i + 2] >> 4)); } let a = 0, m = 0; const W = c.width, R = W / 2; for (let y = 0; y < W; y += 3) for (let x = 0; x < W; x += 3) { if (Math.hypot(x - R, y - R) < R * 0.8) { a += d[(y * W + x) * 4 + 3]; m++; } } return { w: c.width, painted: n, colours: set.size, alpha: +(a / m / 255).toFixed(2), visible: !document.getElementById('klc-x').hidden }; })()`);
    // [v4:integrate] + opaque inside the disc (the mask used to fade it out to a smudge round the arrow)
    check('explore: minimap visible, opaque and painted', mini && mini.visible && mini.colours > 6 && mini.alpha > 0.95, mini);
    // search (JA): '/', type 気仙沼駅, Enter -> the camera flies to the station
    await hold('Slash', '/', 191, 60); await page.frames(3);
    const open = await page.eval("!document.querySelector('#klc-x .xsearch').hidden && document.activeElement?.tagName === 'INPUT'");
    await page.S('Input.insertText', { text: '気仙沼駅' }); await page.frames(3);
    const res = await page.eval("[...document.querySelectorAll('#klc-x .xsearch li b')].slice(0, 4).map((b) => b.textContent)");
    await shot('11_search');
    await page.S('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 }); await page.S('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 });
    // [v5] wait for the flight to land (up to 45 s): long frames while tiles stream are clamped to 0.1 s of flight each,
    // so on a loaded machine the 11 s flight takes longer than 11 s of wall time
    await page.eval('new Promise((r) => { const t0 = performance.now(); const f = () => { if ((performance.now() - t0 > 4000 && !window.__life.tour.flying) || performance.now() - t0 > 45000) r(1); else setTimeout(f, 250); }; f(); })');
    const atSt = await page.eval('(() => { const c = window.__ctx.camera.position; return { d: +Math.hypot(c.x + 1380, c.z + 420).toFixed(0), pin: window.__explore.labels?.pinned?.ja || null, shown: window.__explore.labels?.stats.shown }; })()');
    check('explore: search 気仙沼駅 (JA) lists it and flies there, its label pinned', open && res[0] === '気仙沼駅' && atSt.d < 600 && !!atSt.pin, { open, res, ...atSt });
    await shot('12_search_station');
    // search (EN kind): hospital
    await hold('Slash', '/', 191, 60); await page.frames(2);
    await page.eval("(() => { const i = document.querySelector('#klc-x .xsearch input'); i.value = ''; i.dispatchEvent(new Event('input')); })()");
    await page.S('Input.insertText', { text: 'hospital' }); await page.frames(3);
    const hos = await page.eval("[...document.querySelectorAll('#klc-x .xsearch li b')].map((b) => b.textContent)");
    check('explore: search "hospital" (EN) lists hospitals', hos.length >= 3 && hos.some((t) => /病院/.test(t)), hos.slice(0, 5));
    await page.S('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 }); await page.S('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
    // the full map (N): opens, draws, closes
    await key('KeyN'); await page.frames(6);
    const mapOpen = await page.eval("!document.querySelector('#klc-x .xmap').hidden");
    await shot('13_map');
    // [v4:docs] the map's data credit (ODbL: "© OpenStreetMap contributors") is on screen and not under the minimap
    const mapCredit = await page.eval(`(() => { const c = document.querySelector('#klc-x .xmap .credit'), m = document.querySelector('#klc-x .mini canvas');
      const r = c.getBoundingClientRect(), q = m ? m.getBoundingClientRect() : null, R = (b) => [b.left, b.top, b.right, b.bottom].map(Math.round);
      const over = !!q && q.width > 0 && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top;
      return { text: c.textContent, credit: R(r), mini: q ? R(q) : null, over, inView: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; })()`);
    check('explore: the map credit shows © OpenStreetMap contributors, clear of the minimap', /© OpenStreetMap contributors/.test(mapCredit.text) && !mapCredit.over && mapCredit.inView, mapCredit);
    await key('KeyN'); await page.frames(2);
    check('explore: the full map opens (N) and closes', mapOpen && (await page.eval("document.querySelector('#klc-x .xmap').hidden")));
    // walk into the far core (新町, 1 km west of the bay): kit detail streams in around you, with colliders
    await page.eval("(() => { window.__life.tour.stop(); const p = window.__ctx.playerObj; p.fly = false; p.setPose(-961.1, -86.9, 83, 2); return 1; })()");
    const tStream = Date.now();
    await page.eval(`new Promise((r) => { const t0 = performance.now(); const f = () => { const S = window.__explore.stream, k = window.__explore.tiles && [...window.__explore.tiles.values()].find((t) => t.cx - 50 <= -961 && -961 < t.cx + 50 && t.cz - 50 <= -87 && -87 < t.cz + 50)?.key; const lv = k && S.level(k), sm = S.summary(); if ((lv && lv.l0 === 'ready' && !sm.busy && !sm.pending) || performance.now() - t0 > 30000) r(1); else requestAnimationFrame(f); }; f(); })`);
    report.timings.streamL0Ms = Date.now() - tStream;
    const far = await page.eval('(() => { const S = window.__explore.stream.summary(); return { l0: S.l0, l1: S.l1, colliders: S.colliders, farHidden: S.farHidden, kitMsPerLot: S.kitMsPerLot, failures: S.failures }; })()');
    check('explore: walking in the far core streams kit tiles (with colliders) and hides the far boxes', far.l0 >= 2 && far.l1 >= 10 && far.colliders > 500 && far.farHidden > 100 && !far.failures, { ...far, ms: report.timings.streamL0Ms });
    await shot('14_far_core_street');
    const ffar = await page.eval('new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { if (++n >= 90) r(+(n * 1000 / (performance.now() - t0)).toFixed(1)); else requestAnimationFrame(f); }; requestAnimationFrame(f); })');
    report.timings.liveFpsFarCore = ffar;
    console.log('  live fps in the streamed far core:', ffar);
    // walk forward 4 s: the town's buildings stop you (no walking through them)
    const w0 = await cam();
    await hold('KeyW', 'w', 87, 4000); await page.frames(3);
    const w1 = await cam();
    const inside = await page.eval('(() => { const p = window.__ctx.playerObj.pos; return window.__L.LOTS.filter((l) => Math.abs(l.obb.cx - p.x) < 40 && Math.abs(l.obb.cz - p.z) < 40).some((l) => { const o = l.obb, c = Math.cos(o.rotY), s = Math.sin(o.rotY), dx = p.x - o.cx, dz = p.z - o.cz; return Math.abs(dx * c - dz * s) < o.w / 2 - 0.8 && Math.abs(dx * s + dz * c) < o.d / 2 - 0.8; }); })()');
    check('explore: walking the far core moves you and never into a building', Math.hypot(w1[0] - w0[0], w1[2] - w0[2]) > 2 && !inside, { from: w0, to: w1 });
    // drive (C): the car starts on the nearest road, W drives it along the road, A steers, C gets out
    await hold('KeyC', 'c', 67, 150); await page.frames(4);
    const d0 = await page.eval('({ on: window.__explore.drive.active, s: { ...window.__explore.drive.state } })');
    await holdUntil('KeyW', 'w', 87, 'window.__explore.drive.state.km > 0.03', 12000);
    await keyDown('KeyW', 'w', 87); await keyDown('KeyA', 'a', 65); await sleep(1200); await keyUp('KeyA', 'a', 65); await sleep(600); await keyUp('KeyW', 'w', 87);
    await page.frames(4);
    const d1 = await page.eval('(() => { const D = window.__explore.drive, s = D.state; return { on: D.active, x: +s.x.toFixed(1), z: +s.z.toFixed(1), yaw: +s.yaw.toFixed(2), kmh: +D.kmh.toFixed(1), km: +s.km.toFixed(3), onRoad: window.__explore.net.onRoad(s.x, s.z, -0.2), chip: !document.querySelector("#klc-x .xdrive").hidden }; })()');
    await shot('15_drive');
    check('explore: drive mode (C) on the real roads: moves, steers, stays on the road', d0.on && d1.on && d1.km > 0.02 && Math.abs(d1.yaw - d0.s.yaw) > 0.1 && d1.onRoad && d1.chip, { start: { x: +d0.s.x.toFixed(1), z: +d0.s.z.toFixed(1), yaw: +d0.s.yaw.toFixed(2) }, end: d1 });
    await hold('KeyC', 'c', 67, 150); await page.frames(4);
    const out = await page.eval('({ on: window.__explore.drive.active, fly: window.__ctx.playerObj.fly })');
    check('explore: C leaves the car on foot', !out.on && !out.fly, out);
    // interiors: the fish market C hall (2F gallery over the landing floor), 男山本店 and café RST (walk in through the door)
    const ints = await page.eval('(window.__explore.interiors?.list || []).map((i) => ({ id: i.id, entrance: i.entrance, inside: i.inside }))');
    const mk = ints.find((i) => i.id === 'marketC'), ok2 = ints.find((i) => i.id === 'otokoyama');
    if (mk) {
      await page.eval(`(() => { const p = window.__ctx.playerObj; p.fly = false; p.setPose(${mk.entrance.x}, ${mk.entrance.z}, ${mk.entrance.yaw}, 0); return 1; })()`);
      await holdUntil('KeyW', 'w', 87, '(() => { const p = window.__ctx.playerObj.pos, b = window.__explore.interiors.marketC.bounds, c = Math.cos(b.rotY), s = Math.sin(b.rotY), dx = p.x - b.O[0], dz = p.z - b.O[1]; return dx * c - dz * s > 1.5; })()', 9000); await page.frames(3);
      const inLobby = await page.eval('(() => { const p = window.__ctx.playerObj.pos, b = window.__explore.interiors.marketC.bounds, c = Math.cos(b.rotY), s = Math.sin(b.rotY), dx = p.x - b.O[0], dz = p.z - b.O[1]; return { lx: +(dx * c - dz * s).toFixed(1), lz: +(dx * s + dz * c).toFixed(1) }; })()');
      await page.eval(`(() => { const p = window.__ctx.playerObj; p.fly = false; p.setPose(${mk.inside.x}, ${mk.inside.z}, ${mk.inside.yaw}, ${mk.inside.pitch}); return 1; })()`);
      await page.frames(10);
      const g = await page.eval('({ y: +window.__ctx.playerObj.pos.y.toFixed(2), y2: window.__explore.interiors.marketC.y2 })');
      await shot('16_market_gallery');
      check('explore: fish market C hall: in through the visitors’ door, on the 2F gallery over the landing floor', inLobby.lx > 0.5 && Math.abs(g.y - g.y2) < 0.3, { inLobby, ...g });
    } else check('explore: fish market C hall interior built', false, ints);
    if (ok2) {
      await page.eval(`(() => { const p = window.__ctx.playerObj; p.fly = false; p.setPose(${ok2.entrance.x}, ${ok2.entrance.z}, ${ok2.entrance.yaw}, 0); return 1; })()`);
      await holdUntil('KeyW', 'w', 87, `(() => { const p = window.__ctx.playerObj.pos, l = window.__L.lotById(${JSON.stringify('16/58540/25068/327')}), o = l.obb, c = Math.cos(o.rotY), s = Math.sin(o.rotY), dx = p.x - o.cx, dz = p.z - o.cz; return Math.abs(dx * c - dz * s) < o.w / 2 - 1 && Math.abs(dx * s + dz * c) < o.d / 2 - 1; })()`, 9000); await page.frames(3);
      const inShop = await page.eval(`(() => { const p = window.__ctx.playerObj.pos, l = window.__L.lotById(${JSON.stringify('16/58540/25068/327')}), o = l.obb, c = Math.cos(o.rotY), s = Math.sin(o.rotY), dx = p.x - o.cx, dz = p.z - o.cz; return { lx: +(dx * c - dz * s).toFixed(2), lz: +(dx * s + dz * c).toFixed(2), w: o.w, d: o.d }; })()`);
      await shot('17_otokoyama_walkin');
      await page.eval(`(() => { const p = window.__ctx.playerObj; p.setPose(${ok2.inside.x}, ${ok2.inside.z}, ${ok2.inside.yaw}, ${ok2.inside.pitch}); return 1; })()`); await page.frames(8);
      await shot('18_otokoyama_inside');
      check('explore: 男山本店: walk in through the shop door', Math.abs(inShop.lx) < inShop.w / 2 && Math.abs(inShop.lz) < inShop.d / 2, inShop);
    } else check('explore: 男山本店 interior built', false, ints);
    // [cafe-rst] café RST (迎 1F): walk in from the sidewalk through the street door (W held until the camera is inside), then its first view; the credit and consent ride in the record
    const cr = ints.find((i) => i.id === 'cafeRst');
    if (cr) {
      await page.eval(`(() => { const p = window.__ctx.playerObj; p.fly = false; p.setPose(${cr.entrance.x}, ${cr.entrance.z}, ${cr.entrance.yaw}, 0); return 1; })()`);
      await holdUntil('KeyW', 'w', 87, "(() => { const c = window.__ctx.camera.position; return window.__explore.interiors.at(c.x, c.y, c.z) === 'cafeRst'; })()", 9000); await page.frames(3);
      const inCafe = await page.eval("(() => { const c = window.__ctx.camera.position, p = window.__ctx.playerObj.pos, r = window.__explore.interiors.cafeRst; return { at: window.__explore.interiors.at(c.x, c.y, c.z), feet: +p.y.toFixed(2), floor: r.inside.y, credit: r.credit?.ja, owner: r.consent?.owner }; })()");
      await shot('17b_cafe_walkin');
      await page.eval(`(() => { const p = window.__ctx.playerObj; p.setPose(${cr.inside.x}, ${cr.inside.z}, ${cr.inside.yaw}, ${cr.inside.pitch}); return 1; })()`); await page.frames(8);
      await shot('18c_cafe_inside');
      check('explore: café RST: in through the street door on foot, standing on its floor, credited 協力：café RST', inCafe.at === 'cafeRst' && Math.abs(inCafe.feet - inCafe.floor) < 0.1 && inCafe.credit === '協力：café RST' && inCafe.owner === 'café RST', inCafe);
    } else check('explore: café RST interior built', false, ints);
    check('explore: four interiors listed (the fish market C hall, 男山本店, café RST, the station hall)', ['marketC', 'otokoyama', 'cafeRst', 'station'].every((id) => ints.some((i) => i.id === id)), ints.map((i) => i.id));
    const stn = ints.find((i) => i.id === 'station');
    if (stn?.inside) {
      await page.eval(`(() => { const p = window.__ctx.playerObj; p.fly = false; p.setPose(${stn.inside.x}, ${stn.inside.z}, ${stn.inside.yaw}, 0); return 1; })()`); await page.frames(10);
      const sy = await page.eval('+window.__ctx.playerObj.pos.y.toFixed(2)');
      await shot('18b_station_hall');
      check('explore: the station waiting hall (landmarks-B) is walkable', Math.abs(sy - stn.inside.y) < 0.6, { y: sy, want: stn.inside.y });
    }
    // POI labels at street level in the inner bay
    await page.eval("void window.__life.tour.walkTo('hero')"); await page.frames(20);
    const lab = await page.eval('window.__explore.labels?.stats.shown ?? -1');
    await shot('19_labels');
    check('explore: POI labels near the promenade', lab >= 2, lab);
  }

  report.errors = page.errors().map((l) => `${l.type}: ${l.text.slice(0, 300)}`);
  check('no console errors', !report.errors.length, report.errors.slice(0, 8));

  // ---- phone layout
  if (args.phone) {
    const ph2 = await browser.page({ width: 390, height: 844 });
    await ph2.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await ph2.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }).catch(() => {});
    const tp = Date.now();
    await ph2.goto(`${srv.url}?person=first`);
    await ph2.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
    report.timings.phoneLoadMs = Date.now() - tp;
    await ph2.shot(`${out}_09_phone_intro.png`);
    await ph2.eval("document.getElementById('go').click()");
    try { await ph2.waitFor("document.body.classList.contains('playing')", { timeout: 12000 }); } catch { /* the explore-UI check records a sheet that never appeared */ }
    await ph2.eval('window.__life.live.ready');
    await ph2.frames(10);
    const q = await ph2.eval('({ q: window.__ctx.quality.name, tier: window.__ctx.quality.tier, phone: !!window.__ctx.quality.phone, heroR: window.__ctx.quality.heroR, overflow: document.documentElement.scrollWidth > innerWidth })');
    check('phone: low tier, no horizontal overflow', q.q === 'low' && !q.overflow, q);
    check('phone: a touch screen is forced to the phone tier (v4:phone)', q.tier === 'phone' && q.phone, q);   // [v4:phone]
    // [v4:explore] the explore UI on the phone: minimap, the search / map / drive buttons in reach
    const px = await ph2.eval(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; return { mini: r('#klc-x .mini canvas'), bar: r('#klc-x .xbar'), search: r('#klc-x .xbar [data-act="search"]'), visible: !document.getElementById('klc-x')?.hidden, stream: window.__explore?.stream?.R }; })()`);
    const inView = (b) => b && b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= 390 && b[1] + b[3] <= 844;
    check('phone: explore UI in view (minimap, 44 px buttons), low-tier streaming radii', px.visible && inView(px.mini) && inView(px.bar) && px.search?.[2] >= 44 && px.stream?.l0 <= 60, px);
    // [v4:polish3] POI labels on the phone: every shown pill inside the screen and off the minimap
    await ph2.frames(20);
    const pl = await ph2.eval(`(() => { const m = document.querySelector('#klc-x .mini')?.getBoundingClientRect(); const out = []; for (const e of document.querySelectorAll('#klc-labels .xl')) { if (+e.style.opacity < 0.05) continue; const b = e.getBoundingClientRect(); out.push({ t: e.querySelector('b').textContent, x0: Math.round(b.left), x1: Math.round(b.right), y0: Math.round(b.top), y1: Math.round(b.bottom), mini: !!m && b.left < m.right && b.right > m.left && b.top < m.bottom && b.bottom > m.top }); } return out; })()`);
    check('phone: POI labels inside the screen and off the minimap', pl.every((b) => b.x0 >= 0 && b.x1 <= 390 && !b.mini), pl);
    await ph2.shot(`${out}_10_phone.png`);
    const perr = ph2.errors().map((l) => `${l.type}: ${l.text.slice(0, 300)}`);
    check('phone: no console errors', !perr.length, perr.slice(0, 6));
  }

  // ---- per-tier GPU frame times on the wow cameras (shot-mode page: deterministic, 1920x1080)
  if (args.bench) {
    const cams = { drone: 'yugata@hero', promenade: 'yugata@walk', market: 'asa@735,22,905>665,3,830', night: 'yoru@hero', city: 'yugata@900,700,900>150,0,-50' };
    for (const q of ['high', 'medium', 'low']) {
      const bp = await browser.page({ width: 1920, height: 1080 });
      await bp.goto(`${srv.url}?shot=1&w=1920&h=1080&t=12&q=${q}`);
      await bp.waitFor('window.__ready === true', { timeout: 280000 });
      report.bench[q] = {};
      for (const [name, spec] of Object.entries(cams)) {
        const [time, c] = spec.split('@');
        await bp.eval(`window.__lifeSet(${JSON.stringify(time)})`);
        await bp.eval(`window.__camSpec(${JSON.stringify(c)})`);
        await bp.frames(4);
        report.bench[q][name] = await bp.eval('window.__bench(30)');
        console.log(`  bench ${q} ${name}:`, JSON.stringify(report.bench[q][name]));
      }
      await bp.S('Page.close').catch(() => {});
    }
  }
} catch (e) {
  console.log('QA FAILED:', e.message);
  report.fatal = e.message;
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.server.stop(true);
}
const failed = report.checks.filter((c) => !c.ok);
writeFileSync(`${out}_report.json`, JSON.stringify(report, null, 1));
console.log(`\n${report.checks.length - failed.length}/${report.checks.length} checks passed${failed.length ? '; FAILED: ' + failed.map((c) => c.name).join(', ') : ''}`);
if (failed.length) process.exitCode = 1;
process.exit(process.exitCode || 0);
