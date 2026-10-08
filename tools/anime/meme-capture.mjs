// [meme] Review renders of the 3D メメ (src/anime/play/avatar/meme-model.js) in headless Chrome, and the sheet-vs-model
// comparison. Run the renders through the Chrome gate (or on a second machine through a remote runner):
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/meme-capture.mjs [--out DIR] [--quality high|phone] [--only a,b,...]
// then, on any machine (no browser, sharp only), the comparison with the design sheet:
//   env -u NODE_OPTIONS bun tools/anime/meme-capture.mjs --compare --sheet <the design sheet PNG, 2 px a unit>
// Builds tools/anime/meme-view.html with Bun, serves it on a free local port with a POST /save/<name> endpoint, drives
// window.meme (tools/anime/meme-view.mjs), and writes what the page posts to --out:
//   turn-*.png        front, three-quarter, side (his right, as the sheet), three-quarter back, back: the sheet's light
//   turntable.png     eight views round him
//   cmp-*.png         front / side / back framed on the sheet's own windows at the sheet's 2x scale (for --compare)
//   faces.png         the sheet's four faces (にこっ, おっ！, 見つけた, ほっ) on the model
//   walk-strip.png    one walk cycle in 8 frames at 1.3 m/s, from his side, the floor going by at his speed
//   run-strip.png     one run cycle in 8 frames at 3.4 m/s (side, and from behind)
//   jump-strip.png    a jump: the crouch, take-off, rise, apex, fall, landing squash, recovery
//   phone-back*.png   the game's own camera on a 390 x 844 phone (camera.js thirdFor, core/fov.js): idle, walk, run
//   game-desktop.png  the game's desktop camera, 1600 x 900, running away from it
//   light.png         the sheet's light, the town's day, dusk and night (setLift)
//   compare-sheet.png the sheet's front / side / back / faces next to the model's, at the same scale (--compare)
// Nothing is left running: Chrome closes and the server stops when the run ends (also on an error).
import { join, resolve, dirname } from 'node:path';
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';

const ROOT = resolve(import.meta.dir, '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('--out', resolve(ROOT, 'dist/review/meme-renders')));
const SHEET = resolve(arg('--sheet', process.env.MEME_SHEET || resolve(ROOT, 'dist/review/meme-sheet.png')));
const QUALITY = arg('--quality', 'high');
const ALL = ['turn', 'cmp', 'faces', 'walk', 'run', 'jump', 'idle', 'startstop', 'phone', 'desktop', 'light', 'detail'];
const ONLY = new Set((arg('--only', ALL.join(','))).split(','));
const PREFIX = arg('--prefix', '');

// The sheet's three views (meme-sheet.html): the groups' origins, and the window each crop and render covers (sheet units)
const VIEW = { front: [330, 300], side: [760, 300], back: [1180, 300] };
const WIN = { x0: -160, x1: 160, y0: -34, y1: 590 };   // round each view's origin: the cowlick's tip to under the shadow
const K = 1.15 / 576;                                  // m per sheet unit (meme-model.js MEME_SCALE)
const FACES = [[60, 40, 'smile', 'にこっ'], [180, 40, 'o', 'おっ！'], [60, 196, 'wink', '見つけた'], [180, 196, 'blink', 'ほっ']];   // translate(1440 360) + these, scale .42

if (process.argv.includes('--compare')) { await compare(); process.exit(0); }

// 1. build the viewer
const { launch } = await import('./cdp.mjs');
const dist = join(ROOT, 'dist/meme-view');
rmSync(dist, { recursive: true, force: true });
const built = await Bun.build({ entrypoints: [join(ROOT, 'tools/anime/meme-view.html')], outdir: dist, target: 'browser', minify: false });
if (!built.success) { for (const l of built.logs) console.error(l); process.exit(1); }

// 2. serve it and the save endpoint
mkdirSync(OUT, { recursive: true });
const saved = [];
const server = Bun.serve({
  port: 0, hostname: '127.0.0.1',
  async fetch(req) {
    const u = new URL(req.url);
    if (req.method === 'POST' && u.pathname.startsWith('/save/')) {
      const name = decodeURIComponent(u.pathname.slice(6));
      if (!/^[a-z0-9_\-/.]+$/i.test(name) || name.includes('..')) return new Response('bad name', { status: 400 });
      const f = join(OUT, PREFIX + name); mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, new Uint8Array(await req.arrayBuffer())); saved.push(PREFIX + name);
      return new Response('ok');
    }
    const p = u.pathname === '/' ? '/meme-view.html' : u.pathname, f = join(dist, p);
    if (!f.startsWith(dist) || !existsSync(f)) return new Response('not found', { status: 404 });
    return new Response(Bun.file(f));
  },
});

// 3. the shot list: each is one page.eval (a JS body that awaits window.meme's calls)
const steps = [];
const js = (label, body) => steps.push([label, body]);
const W8 = (a) => JSON.stringify(a);
if (ONLY.has('turn')) {
  // the sheet lights each view from his right on the viewer's side: az 45 in front, 135 for the side and the back
  for (const [n, az, el, k] of [['front', 0, 0, 45], ['34front', 35, 3, 45], ['side', 90, 0, 135], ['34back', 145, 6, 135], ['back', 180, 4, 135]]) {
    js('turn ' + n, `meme.model.setExpression('smile'); await meme.shot('turn-${n}.png', { az: ${az}, el: ${el}, keyAz: ${k}, w: 900, h: 1200, hh: 0.66, cy: 0.575, pose: 'idle', t: 1.2 }); meme.model.setExpression(null); return 'ok';`);
  }
  js('turntable', `return await meme.strip('turntable.png', [0, 45, 90, 135, 180, 225, 270, 315].map((az) => ({ az, el: 5, pose: 'idle', t: 1.2, hh: 0.66, cy: 0.575 })), { w: 360, h: 480, cols: 8, labels: ['まえ 0°', '45°', 'よこ 90°', '135°', 'うしろ 180°', '225°', '270°', '315°'], title: 'メメ · turntable (the sheet\\'s light)' });`);
}
if (ONLY.has('cmp')) {
  // the sheet's own windows at its 2x scale: 640 x 1248 px for 320 x 624 units
  const cy = (564 - (WIN.y0 + WIN.y1) / 2) * K, hh = ((WIN.y1 - WIN.y0) / 2) * K, w = (WIN.x1 - WIN.x0) * 2, h = (WIN.y1 - WIN.y0) * 2;
  for (const [n, az, k] of [['front', 0, 45], ['back', 180, 135]]) js('cmp ' + n, `meme.model.setExpression('smile'); await meme.shot('cmp-${n}.png', { az: ${az}, el: 0, keyAz: ${k}, w: ${w}, h: ${h}, hh: ${hh}, cy: ${cy}, pose: 'idle', t: 1.2 }); meme.model.setExpression(null); return 'ok';`);
  // the sheet's side view is mid-step (his left boot forward, his right arm forward, the tails flying): the walk at the
  // left boot's heel strike (phase 0.5), standing still on the floor of the sheet
  // (a slow walk, 0.6 m/s: the sheet draws a gentle step, the legs ~10 deg from the hip)
  js('cmp side', `meme.model.setExpression('smile'); const g = meme.memeGait(0.6, 0); await meme.shot('cmp-side.png', { az: 90, el: 0, keyAz: 135, w: ${w}, h: ${h}, hh: ${hh}, cy: ${cy}, pose: 'walk', speed: 0.6, t: 6.52 / g.rate }); await meme.shot('cmp-side-idle.png', { az: 90, el: 0, keyAz: 135, w: ${w}, h: ${h}, hh: ${hh}, cy: ${cy}, pose: 'idle', t: 1.2 }); meme.model.setExpression(null); return 'ok';`);
  // the faces: the head alone, framed like one of the sheet's faces (scale .42: 300 x 300 units of the head -> 252 px at 2x)
  js('cmp faces', `for (const [x, y, e] of ${W8(FACES)}) { meme.model.setExpression(e); await meme.shot('cmp-face-' + e + '.png', { az: 0, el: 0, w: 600, h: 600, hh: ${(150 * K).toFixed(5)}, cy: ${((564 - 125) * K).toFixed(5)}, pose: 'idle', t: 1.2 }); } meme.model.setExpression(null); return 'ok';`);
}
if (ONLY.has('faces')) {
  js('faces', `const fr = (e) => () => { meme.model.setExpression(e); const c = meme.frame({ az: 18, el: 4, w: 480, h: 480, hh: 0.29, cy: 0.87, pose: 'idle', t: 1.2 }); return meme.copyCanvas(c); };
    const r = await meme.strip('faces.png', [fr('smile'), fr('o'), fr('wink'), fr('blink')], { w: 480, h: 480, cols: 4, labels: ['にこっ (his own)', 'おっ！ (the fall)', '見つけた (the jump)', 'ほっ (the blink)'], title: 'かお · the sheet\\'s faces' });
    meme.model.setExpression(null); return r;`);
}
// one cycle in 8 frames, the floor going by at his speed: step the walker's own update() to each frame's time
const cycle = (name, speed, run, views, title) => `
  const m = meme.model, g = meme.memeGait(${speed}, ${run}), T = 1 / g.rate, frames = [];
  meme.applyLight('day');
  m.poseAt('idle', 1); m.setPose('auto');
  let t = 0; const step = (to) => { while (t < to - 1e-9) { const dt = Math.min(1 / 120, to - t); m.update(dt, { speed: ${speed}, onGround: true, vy: 0, cadence: g.rate, run: ${run} }); t += dt; meme.tileTex.offset.set(0, ((${speed} * t) / 2) % 1); } };
  step(2.0);   // two seconds in: the springs and the cycle are settled
  const t0 = t;
  for (const v of ${W8(views)}) for (let i = 0; i < 8; i++) {
    step(t0 + (i / 8) * T);
    meme.floor.visible = true; meme.size(${360}, ${480}); meme.applyLight('day');
    const cam = meme.ortho, a = 480 / 360, hh = 0.68; cam.left = -hh / a; cam.right = hh / a; cam.top = hh; cam.bottom = -hh; cam.updateProjectionMatrix();
    const az = v * Math.PI / 180, el = (v === 180 ? 10 : 2) * Math.PI / 180;
    cam.position.set(Math.sin(az) * Math.cos(el) * 8, 0.58 + Math.sin(el) * 8, -Math.cos(az) * Math.cos(el) * 8); cam.lookAt(0, 0.58, 0);
    meme.key.position.set(2.2, 2.9, -2.4); meme.key.target.position.set(0, 0.55, 0);
    meme.renderer.render(meme.scene, cam); frames.push(meme.copyCanvas(meme.renderer.domElement));
  }
  const labels = []; for (const v of ${W8(views)}) for (let i = 0; i < 8; i++) labels.push((v === 180 ? 'うしろ ' : 'よこ ') + (i + 1) + '/8');
  return await meme.strip('${name}', frames.map((c) => () => c), { w: 360, h: 480, cols: 8, labels, title: ${W8(title)} + ' · ' + g.rate.toFixed(2) + ' cycles/s, ' + (g.travel * 100).toFixed(1) + ' cm a stance' });`;
if (ONLY.has('walk')) js('walk', cycle('walk-strip.png', 1.3, 0, [90, 180], 'あるく · walk 1.3 m/s'));
if (ONLY.has('run')) js('run', cycle('run-strip.png', 3.4, 1, [90, 180], 'はしる · run 3.4 m/s'));
if (ONLY.has('jump')) {
  js('jump', `const m = meme.model, frames = [], labels = [];
    meme.applyLight('day');
    m.poseAt('idle', 1); m.setPose('auto');
    // stand, take off at 3.4 m/s, land at 0.69 s, recover; frames at these times (s from the take-off)
    const shots = [[-0.05, 'まえ · before'], [0.06, 'とぶ · take-off'], [0.2, 'のぼる · rising'], [0.35, 'てっぺん · apex'], [0.55, 'おちる · falling'], [0.72, 'ちゃくち · landing'], [0.8, 'ぐっ · squash'], [1.1, 'もどる · recovered']];
    let t = -0.6; const step = (to) => { while (t < to - 1e-9) { const dt = Math.min(1 / 120, to - t); const j = meme.jumpAt(t + dt); m.update(dt, { speed: 0, onGround: j.onGround, vy: j.vy }); t += dt; } };
    for (const [at, label] of shots) {
      step(at); const j = meme.jumpAt(at);
      m.root.position.y = j.y; meme.blob.scale.set(0.62 / (1 + 2.5 * j.y), 0.5 / (1 + 2.5 * j.y), 1);
      meme.size(360, 560); meme.floor.visible = true;
      const cam = meme.ortho, a = 560 / 360, hh = 0.98; cam.left = -hh / a; cam.right = hh / a; cam.top = hh; cam.bottom = -hh; cam.updateProjectionMatrix();
      const az = 30 * Math.PI / 180; cam.position.set(Math.sin(az) * 8, 0.86 + 0.6, -Math.cos(az) * 8); cam.lookAt(0, 0.86, 0);
      meme.key.position.set(2.2, 2.9, -2.4); meme.key.target.position.set(0, 0.55, 0);
      m.root.updateMatrixWorld(true); meme.renderer.render(meme.scene, cam); frames.push(meme.copyCanvas(meme.renderer.domElement)); labels.push(label);
    }
    m.root.position.y = 0;
    return await meme.strip('jump-strip.png', frames.map((c) => () => c), { w: 360, h: 560, cols: 8, labels, title: 'とぶ · the jump (3.4 m/s up, 59 cm high), landing squash by pose only' });`);
}
// a motion sequence: run the walker's own update() at 120 Hz through inputs(t) and grab frames at the given times
const seq = (name, seconds, inputs, at, cam, title, labels) => `
  const m = meme.model, frames = [];
  meme.applyLight('day'); m.poseAt('idle', 1); m.setPose('auto');
  const inputs = ${inputs}, cam = ${cam}, shots = ${W8(at)};
  let t = 0, k = 0;
  while (k < shots.length) {
    const inp = inputs(t), g = meme.memeGait(inp.speed || 0, inp.run);
    m.update(1 / 120, { ...inp, cadence: (inp.speed || 0) > 0.05 ? g.rate : undefined }); t += 1 / 120;
    meme.tileTex.offset.set(0, (((inp.dist || 0)) / 2) % 1);
    if (t >= shots[k] - 1e-9) {
      meme.size(360, 480); meme.floor.visible = true;
      const c = meme.ortho, a = 480 / 360, hh = cam.hh || 0.68; c.left = -hh / a; c.right = hh / a; c.top = hh; c.bottom = -hh; c.updateProjectionMatrix();
      const az = cam.az * Math.PI / 180, el = (cam.el || 4) * Math.PI / 180; c.position.set(Math.sin(az) * Math.cos(el) * 8, 0.6 + Math.sin(el) * 8, -Math.cos(az) * Math.cos(el) * 8); c.lookAt(0, 0.6, 0);
      meme.key.position.set(2.2, 2.9, -2.4); meme.key.target.position.set(0, 0.55, 0);
      m.root.updateMatrixWorld(true); meme.renderer.render(meme.scene, c); frames.push(meme.copyCanvas(meme.renderer.domElement)); k++;
    }
  }
  return await meme.strip('${name}', frames.map((c) => () => c), { w: 360, h: 480, cols: 8, labels: ${W8(labels)}, title: ${W8(title)} });`;
if (ONLY.has('idle')) {
  const at = [1.0, 2.2, 3.4, 4.6, 5.3, 6.4, 7.6, 8.8];
  js('idle', seq('idle-strip.png', 9, '(t) => ({ speed: 0, onGround: true, vy: 0 })', at, '{ az: 25, el: 6 }', 'たつ · idle: the breath, a blink, a look round, the harbour breeze in the tails (9 s)', at.map((x) => x.toFixed(1) + ' s')));
}
if (ONLY.has('startstop')) {
  // still, then a run from a standstill, then a stop: the tails and the float catch up and swing on
  const at = [0.5, 1.1, 1.4, 1.8, 2.3, 2.45, 2.65, 3.1];
  js('startstop', seq('startstop-strip.png', 3.2, '(t) => { const s = t < 1 ? 0 : t < 2.3 ? Math.min(3.4, (t - 1) * 9) : Math.max(0, 3.4 - (t - 2.3) * 14); return { speed: s, onGround: true, vy: 0, run: s > 1.5 ? 1 : 0, dist: 0 }; }', at, '{ az: 90, el: 3 }', 'はしりだし · from a standstill to a run and a stop: the tails and the float lag and swing on (springs at 120 Hz)', ['still', 'away', 'speeding up', 'running', 'stop', '+0.15 s', '+0.35 s', '+0.8 s']));
}
if (ONLY.has('phone') || ONLY.has('desktop')) {
  // the game's camera behind him: idle, mid-walk and mid-run, the floor going by
  const scene = (name, w, h, speed, run, secs) => `{
    const m = meme.model, g = meme.memeGait(${speed}, ${run});
    m.poseAt('idle', 1); m.setPose('auto'); meme.applyLight('day'); meme.floor.visible = true;
    let t = 0; while (t < ${secs}) { const dt = 1 / 120; m.update(dt, { speed: ${speed}, onGround: true, vy: 0, cadence: ${speed} > 0.05 ? g.rate : undefined, run: ${run} }); t += dt; meme.tileTex.offset.set(0, ((${speed} * t) / 2) % 1); }
    meme.size(${w}, ${h}); meme.gameCam(meme.persp, ${w} / ${h});
    meme.key.position.set(2.2, 2.9, -2.4); meme.key.target.position.set(0, 0.55, 0);
    m.root.updateMatrixWorld(true); meme.renderer.render(meme.scene, meme.persp);
    await meme.post('${name}', meme.copyCanvas(meme.renderer.domElement)); }`;
  if (ONLY.has('phone')) {
    // the phone at 1x (its real pixel count at 390 x 844 css px) and at 3x (an iPhone's 1170 x 2532)
    js('phone 1x', `${scene('phone-back-idle.png', 390, 844, 0, 0, 2.3)} ${scene('phone-back-walk.png', 390, 844, 1.3, 0, 2.15)} ${scene('phone-back-run.png', 390, 844, 3.4, 1, 2.1)} return 'ok';`);
    js('phone 3x', `meme.renderer.setPixelRatio(1); ${scene('phone-back-3x.png', 1170, 2532, 1.3, 0, 2.15)} return 'ok';`);
  }
  if (ONLY.has('desktop')) js('desktop', `${scene('game-desktop.png', 1600, 900, 3.4, 1, 2.1)} return 'ok';`);
}
if (ONLY.has('detail')) {
  // close-ups where parts meet (knot / tails / band / cowlick, the collar, the boots, the camera and strap, the pack and float), 2x
  const D = [['the bow, from the game’s side', { az: 160, el: 24, cy: 0.93, hh: 0.2, keyAz: 135 }], ['the crown and the cowlick', { az: 30, el: 30, cy: 1.0, hh: 0.2 }],
    ['the collar and the strap', { az: 20, el: 10, cy: 0.56, hh: 0.17 }], ['the camera', { az: -35, el: 8, cy: 0.37, hh: 0.12 }],
    ['the pack and the float', { az: 150, el: 12, cy: 0.38, hh: 0.2, keyAz: 135 }], ['the boots', { az: 30, el: 14, cy: 0.12, hh: 0.14 }]];
  js('detail', `return await meme.strip('detail.png', ${JSON.stringify(D.map((d) => d[1]))}.map((o) => ({ ...o, pose: 'idle', t: 1.2, w: 640, h: 640 })), { w: 640, h: 640, cols: 6, labels: ${JSON.stringify(D.map((d) => d[0]))}, title: 'ちかく · close-ups where the parts meet (the sheet’s light)' });`);
}
if (ONLY.has('light')) {
  js('light', `const L = [['sheet', 25], ['day', 25], ['day', 160], ['dusk', 25], ['night', 25], ['night', 160]];
    return await meme.strip('light.png', L.map(([light, az]) => ({ light, az, el: 6, cam: 'persp', fov: 22, dist: 4.4, cy: 0.58, pose: 'idle', t: 1.2, floorOn: light !== 'sheet' })), { w: 400, h: 560, cols: 6, labels: L.map(([l, a]) => ({ sheet: 'シート', day: 'ひる', dusk: 'ゆうがた', night: 'よる' }[l] + ' · ' + a + '°')), title: 'ひかり · the sheet\\'s light and the town\\'s (night: setLift(1))' });`);
}

// 4. Chrome (one page), the steps, and always a clean exit
let browser = null, failed = false;
try {
  browser = await launch();
  const p = await browser.page({ width: 1280, height: 900 });
  await p.goto(`http://127.0.0.1:${server.port}/meme-view.html?capture=1&quality=${QUALITY}${process.argv.includes('--calm') ? '&calm=1' : ''}`);
  await p.waitFor('window.memeReady === true', { timeout: 120000 });
  console.error('[meme] stats', JSON.stringify(await p.eval('JSON.stringify(window.meme.stats())')));
  for (const [label, body] of steps) {
    const t0 = performance.now();
    const r = await p.eval(`(async () => { ${body} })()`);
    console.error(`[meme] ${label}: ${r} (${Math.round(performance.now() - t0)} ms)`);
  }
  const errs = p.errors().filter((e) => !/favicon\.ico/.test(e.text));
  if (errs.length) { console.error('[meme] page errors:\n' + errs.map((e) => e.text).join('\n')); failed = true; }
} catch (e) {
  console.error('[meme] capture failed:', e && e.message ? e.message : e); failed = true;
} finally {
  if (browser) await browser.close();
  server.stop(true);
}
console.error(`[meme] saved ${saved.length} files in ${OUT}`);
process.exit(failed ? 1 : 0);

// ------------------------------------------------------------------ the sheet next to the model (sharp, no browser)
async function compare() {
  const sharp = (await import('sharp')).default;
  if (!existsSync(SHEET)) throw new Error('no sheet at ' + SHEET);
  const meta = await sharp(SHEET).metadata(), S = meta.width / 1800;   // the 2x sheet: 2 px a unit
  const ww = Math.round((WIN.x1 - WIN.x0) * S), wh = Math.round((WIN.y1 - WIN.y0) * S);
  const crop = (cx, cy, x0, y0, w, h) => sharp(SHEET).extract({ left: Math.round((cx + x0) * S), top: Math.round((cy + y0) * S), width: w, height: h }).png().toBuffer();
  const pad = 36, label = 64, colW = ww * 2 + pad, top = 112, faceS = 260;
  const width = pad + 3 * (colW + pad), height = top + wh + label + pad + faceS + label + pad;
  const parts = [];
  const text = (s, x, y, size = 22, weight = 700, fill = '#223A70', anchor = 'middle') => `<text x="${x}" y="${y}" font-family="Hiragino Maru Gothic ProN, Hiragino Sans, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${s}</text>`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  svg += text('メメ · the sheet (left of each pair) and the 3D model (right), at the same scale', pad, 52, 30, 900, '#223A70', 'start');
  svg += text('docs/character/sheet/meme-sheet.html · src/anime/play/avatar/meme-model.js (high) · the model framed on the sheet\'s own windows, 2 px a sheet unit, the sheet\'s light', pad, 86, 16, 500, '#595857', 'start');
  for (const [i, [n, lab]] of [['front', 'まえ · FRONT'], ['side', 'よこ · SIDE'], ['back', 'うしろ · BACK']].entries()) {
    const x = pad + i * (colW + pad), [cx, cy] = VIEW[n];
    parts.push({ input: await crop(cx, cy, WIN.x0, WIN.y0, ww, wh), left: x, top });
    const r = join(OUT, `cmp-${n}.png`);
    if (!existsSync(r)) throw new Error('render the cmp shots first: ' + r);
    parts.push({ input: await sharp(r).resize(ww, wh).png().toBuffer(), left: x + ww + pad, top });
    svg += text(lab, x + colW / 2, top + wh + 40);
    svg += text('sheet', x + ww / 2, top + wh + 62, 15, 500, '#595857') + text('3D', x + ww + pad + ww / 2, top + wh + 62, 15, 500, '#595857');
  }
  // the faces: the sheet's (scale .42 of the head) and the model's head, in pairs
  const fy = top + wh + label + pad;
  for (const [i, [fx, fyy, e, lab]] of FACES.entries()) {
    const x = pad + i * (faceS * 2 + pad * 2);
    const sx = 1440 + fx, sy = 360 + fyy, half = 150 * 0.42;
    parts.push({ input: await sharp(SHEET).extract({ left: Math.round((sx - half) * S), top: Math.round((sy - 25 * 0.42) * S), width: Math.round(half * 2 * S), height: Math.round(half * 2 * S) }).resize(faceS, faceS).png().toBuffer(), left: x, top: fy });
    const r = join(OUT, `cmp-face-${e}.png`);
    if (existsSync(r)) parts.push({ input: await sharp(r).resize(faceS, faceS).png().toBuffer(), left: x + faceS + 8, top: fy });
    svg += text(lab, x + faceS + 4, fy + faceS + 34, 18, 700);
  }
  svg += '</svg>';
  const base = sharp({ create: { width, height, channels: 3, background: '#FBFAF5' } });
  const out = join(OUT, PREFIX + 'compare-sheet.png');
  await base.composite([{ input: Buffer.from(svg), left: 0, top: 0 }, ...parts]).png().toFile(out);
  // and an overlay of each view: the sheet at full strength, the model at half on top (every misplaced line shows twice)
  for (const n of ['front', 'side', 'back']) {
    const [cx, cy] = VIEW[n], a = await crop(cx, cy, WIN.x0, WIN.y0, ww, wh);
    const b = await sharp(join(OUT, `cmp-${n}.png`)).resize(ww, wh).removeAlpha().ensureAlpha(0.5).png().toBuffer();
    await sharp(a).composite([{ input: b, blend: 'over' }]).png().toFile(join(OUT, PREFIX + `overlay-${n}.png`));
  }
  console.error('[meme] wrote', out);
}
