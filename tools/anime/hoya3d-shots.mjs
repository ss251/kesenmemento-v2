// [play:hoya3d] Review renders of the 3D ホヤぼーや, in WebKit (the iOS engine), without Chrome:
//   env -u NODE_OPTIONS bun tools/anime/hoya3d-shots.mjs [--refs DIR] [--out docs/play/shots/hoya3d] [--quality high|phone] [--only views,compare,walk,turntable]
// Builds tools/anime/hoya3d-view.html with Bun, serves it on a free local port for the run, drives it with
// tools/anime/webkit-shot.swift (compiled to /tmp/webkit-shot when missing), and writes what the page POSTs back:
//   front / q34 / side / back .png      the four views (orthographic, the standard pose)
//   walk.png, run.png, air.png           frames of the walk and run cycles, the jump and the fall
//   turntable.mp4                        4 s, 30 fps, one turn (frames via ffmpeg)
//   play-behind.mp4                      6 s of play (stand, walk, run, jump, land) from the game's third-person camera (--only play)
//   compare/*.png                        each view next to the city's official view: ONLY with --refs (a folder with the
//                                        official PNGs from the city's variation ZIPs: x_manualvariation1-2/1-1.png, ...).
//                                        Those sheets contain the city's art: reference only, never committed (.gitignore).
// Nothing is left running: the server stops and the WebKit process exits when the run ends.
import { join, resolve, dirname } from 'node:path';
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(import.meta.dir, '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(ROOT, arg('--out', 'docs/play/shots/hoya3d'));
const REFS = arg('--refs', process.env.HOYA_REFS || '');
const QUALITY = arg('--quality', 'high');
const ONLY = new Set((arg('--only', 'views,compare,walk,turntable,play')).split(','));
const SHOT = existsSync('/tmp/webkit-shot') ? '/tmp/webkit-shot' : null;

function ensureShot() {
  if (SHOT) return SHOT;
  const src = join(ROOT, 'tools/anime/webkit-shot.swift');
  if (!existsSync(src)) throw new Error('tools/anime/webkit-shot.swift is missing');
  const r = spawnSync('swiftc', ['-O', src, '-o', '/tmp/webkit-shot'], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('swiftc failed');
  return '/tmp/webkit-shot';
}

// 1. build the viewer
const dist = join(ROOT, 'dist/hoya3d-view');
rmSync(dist, { recursive: true, force: true });
const built = await Bun.build({ entrypoints: [join(ROOT, 'tools/anime/hoya3d-view.html')], outdir: dist, target: 'browser', minify: false });
if (!built.success) { for (const l of built.logs) console.error(l); process.exit(1); }

// 2. serve it, the references (optional) and the save endpoint
mkdirSync(OUT, { recursive: true });
const saved = [];
const server = Bun.serve({
  port: 0, hostname: '127.0.0.1',
  async fetch(req) {
    const u = new URL(req.url);
    if (req.method === 'POST' && u.pathname.startsWith('/save/')) {
      const name = decodeURIComponent(u.pathname.slice(6));
      if (!/^[a-z0-9_\-/.]+$/i.test(name) || name.includes('..')) return new Response('bad name', { status: 400 });
      const f = join(OUT, name); mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, new Uint8Array(await req.arrayBuffer())); saved.push(name);
      return new Response('ok');
    }
    if (u.pathname.startsWith('/refs/') && REFS) {
      const f = join(REFS, decodeURIComponent(u.pathname.slice(6)));
      if (!f.startsWith(resolve(REFS)) || !existsSync(f)) return new Response('no ref', { status: 404 });
      return new Response(Bun.file(f));
    }
    const p = u.pathname === '/' ? '/hoya3d-view.html' : u.pathname;
    const f = join(dist, p);
    if (!f.startsWith(dist) || !existsSync(f)) return new Response('not found', { status: 404 });
    return new Response(Bun.file(f));
  },
});
const base = `http://127.0.0.1:${server.port}/?quality=${QUALITY}${process.argv.includes('--calm') ? '&calm=1' : ''}`;

// 3. the shot list (each js step must finish within webkit-shot's 60 s)
const V = { front: 0, q34: 38, side: 90, back: 180 };
const steps = [{ js: 'await new Promise((r) => { const f = () => (window.hoya3dReady ? r() : setTimeout(f, 30)); f(); }); return JSON.stringify(hoya3d.stats());', wait: 0 }];
const js = (s) => steps.push({ js: s, wait: 0 });
// [hoya-accuracy] the audit set: every view and pose the manual draws, sharp (1200 px tall, his height ~1000 px),
// orthographic, on white, no credit band (the sheets carry it). Names: <PREFIX><view>.png
const PREFIX = arg('--prefix', 'v2-');
if (ONLY.has('audit')) {
  const W = 900, H = 1200, hh = 0.66, cy = 0.56;
  const A = [
    ['front', { az: 0, el: 0 }], ['q34m', { az: 12.5, el: 0 }], ['q34', { az: 38, el: 2 }], ['q45', { az: 45, el: 2 }], ['q135', { az: 135, el: 4 }], ['q34r', { az: -38, el: 2 }], ['side', { az: 90, el: 0 }], ['sider', { az: -90, el: 0 }],
    ['q34back', { az: 145, el: 6 }], ['back', { az: 180, el: 6 }], ['top', { az: 20, el: 55 }],
  ];
  for (const [n, v] of A) js(`await hoya3d.shot(${JSON.stringify(PREFIX + 'view-' + n + '.png')}, ${JSON.stringify({ ...v, w: W, h: H, hh, cy, bg: '#ffffff', credit: false })}); return ${JSON.stringify(n)};`);
  // the poses at the manual's own angles: the walk from NO.1-3's side (3/4 front, his left), the run (NO.1-5 faces right:
  // the camera on his right), the jump (NO.1-16, near front), the fall
  // one cycle in 8 frames at the model's own cadence (v1 had none: 2.446 / 3.564 Hz)
  js(`hoya3d.hoya.poseAt('walk', 1); const hz = hoya3d.hoya.cadence || 2.446; for (let i = 0; i < 8; i++) await hoya3d.shot(${JSON.stringify(PREFIX + 'walk-')} + i + '.png', { pose: 'walk', t: 1 + i / 8 / hz, az: 30, el: 2, w: ${W}, h: ${H}, hh: ${hh}, cy: ${cy}, bg: '#ffffff', credit: false }); return 'walk ' + hz;`);
  js(`hoya3d.hoya.poseAt('run', 1); const hz = hoya3d.hoya.cadence || 3.564; for (let i = 0; i < 8; i++) await hoya3d.shot(${JSON.stringify(PREFIX + 'run-')} + i + '.png', { pose: 'run', t: 1 + i / 8 / hz, az: -40, el: 2, w: ${W}, h: ${H}, hh: ${hh}, cy: ${cy}, bg: '#ffffff', credit: false }); return 'run ' + hz;`);
  js(`for (const [n, p, t] of [['jump-rise', 'jump', 0.25], ['jump-apex', 'jump', 0.6], ['fall', 'fall', 0.3], ['idle', 'idle', 1]]) await hoya3d.shot(${JSON.stringify(PREFIX)} + n + '.png', { pose: p, t, az: 15, el: 2, w: ${W}, h: ${H}, hh: ${hh}, cy: ${cy}, bg: '#ffffff', credit: false }); return 'air';`);
}
if (ONLY.has('heads')) {   // close-ups of the head round the clock (the face view's check)
  const azs = [0, 12.5, 30, 45, 60, 75, 90, 105, 120, 135, 150, 180];
  js(`return await hoya3d.strip(${JSON.stringify(PREFIX + 'heads.png')}, ${JSON.stringify(azs)}.map((az) => ({ pose: 'idle', t: 0.5, az, el: 2, w: 420, h: 420, hh: 0.31, cy: 0.79, bg: '#ffffff' })), { w: 420, h: 420, cols: 6, labels: ${JSON.stringify(azs.map((a) => a + ' deg'))} });`);
}
if (ONLY.has('flap')) {   // the flap tip under the cheek, close (the face view's hardest place)
  js(`return await hoya3d.strip(${JSON.stringify(PREFIX + 'flap.png')}, [60, 90, 90, 120].map((az, i) => ({ pose: 'idle', t: 0.5, az, el: 2, w: 520, h: 520, hh: 0.12, cy: 0.64, bg: '#ffffff', line: i !== 2 })), { w: 520, h: 520, cols: 4, labels: ['60 deg', '90 deg', '90 deg, no hull line', '120 deg'] });`);
}
if (ONLY.has('light')) {   // in the town's own light: day, dusk, night (lift 1), front and 3/4 back, close enough to judge the tones
  const L = [['day', 20], ['day', 160], ['dusk', 20], ['night', 20], ['night', 160]];
  js(`return await hoya3d.strip(${JSON.stringify(PREFIX + 'light.png')}, ${JSON.stringify(L)}.map(([world, az]) => ({ pose: 'idle', t: 0.5, az, el: 8, w: 480, h: 640, hh: 0.62, world })), { w: 480, h: 640, cols: 5, labels: ${JSON.stringify(L.map(([w, a]) => w + ', ' + a + ' deg'))} });`);
}
if (ONLY.has('gait')) {   // one walk and one run cycle, 8 frames each, from his left side (the stride reads best) and 3/4 behind
  const G = (pose, hz, az) => [...Array(8).keys()].map((i) => ({ pose, t: 2 + i / 8 / hz, az, el: 3, w: 360, h: 480, hh: 0.62, cy: 0.55 }));
  js(`const hz = (p) => { hoya3d.hoya.poseAt(p, 2); return hoya3d.hoya.cadence; }; const hw = hz('walk'), hr = hz('run');
    await hoya3d.strip(${JSON.stringify(PREFIX + 'gait-walk.png')}, [...Array(8).keys()].map((i) => ({ pose: 'walk', t: 2 + i / 8 / hw, az: 75, el: 3, w: 360, h: 480, hh: 0.62, cy: 0.55 })).concat([...Array(8).keys()].map((i) => ({ pose: 'walk', t: 2 + i / 8 / hw, az: 155, el: 8, w: 360, h: 480, hh: 0.62, cy: 0.55 }))), { w: 360, h: 480, cols: 8, labels: [...Array(16).keys()].map((i) => 'walk ' + (i % 8 + 1) + '/8') });
    await hoya3d.strip(${JSON.stringify(PREFIX + 'gait-run.png')}, [...Array(8).keys()].map((i) => ({ pose: 'run', t: 2 + i / 8 / hr, az: 75, el: 3, w: 360, h: 480, hh: 0.62, cy: 0.55 })).concat([...Array(8).keys()].map((i) => ({ pose: 'run', t: 2 + i / 8 / hr, az: 155, el: 8, w: 360, h: 480, hh: 0.62, cy: 0.55 }))), { w: 360, h: 480, cols: 8, labels: [...Array(16).keys()].map((i) => 'run ' + (i % 8 + 1) + '/8') });
    return 'gait ' + hw.toFixed(2) + ' / ' + hr.toFixed(2) + ' Hz';`);
}
if (ONLY.has('jump')) {   // the jump and the fall round him (NO.1-16 is a 3/4 from his right-front)
  const J = [['jump', 0.4, -35], ['jump', 0.4, 0], ['jump', 0.4, 90], ['jump', 0.4, 180], ['fall', 0.4, -35], ['fall', 0.4, 90]];
  js(`return await hoya3d.strip(${JSON.stringify(PREFIX + 'jump.png')}, ${JSON.stringify(J)}.map(([pose, t, az]) => ({ pose, t, az, el: 3, w: 400, h: 520, hh: 0.66, cy: 0.58 })), { w: 400, h: 520, cols: 6, labels: ${JSON.stringify(J.map(([p, t, a]) => p + ', ' + a + ' deg'))} });`);
}
if (ONLY.has('backs')) {   // straight behind, as NO.9-1: idle, the walk's two contacts and passings, the run
  js(`const hz = (p) => { hoya3d.hoya.poseAt(p, 2); return hoya3d.hoya.cadence; }; const hw = hz('walk'), hr = hz('run');
    const F = [['idle', 1], ['walk', 2], ['walk', 2 + 0.25 / hw], ['walk', 2 + 0.5 / hw], ['run', 2], ['run', 2 + 0.25 / hr]];
    return await hoya3d.strip(${JSON.stringify(PREFIX + 'backs.png')}, F.map(([pose, t]) => ({ pose, t, az: 180, el: 6, w: 420, h: 520, hh: 0.64, cy: 0.58 })), { w: 420, h: 520, cols: 6, labels: ['idle (NO.1-1 cape)', 'walk, contact', 'walk, passing', 'walk, contact', 'run', 'run'] });`);
}
if (ONLY.has('turnaround')) {
  // 8 angles round him (0 = his front, then toward his left), idle, in the town's light by day and at night; desktop
  // (480 x 640 a frame) and phone size (he stands ~20 % of a 844 px phone screen tall: ~170 px, drawn at 1x as a phone does)
  const A8 = [0, 45, 90, 135, 180, 225, 270, 315], L8 = JSON.stringify(A8.map((a) => a + ' deg'));
  for (const world of ['day', 'night']) {
    js(`return await hoya3d.strip(${JSON.stringify(PREFIX + 'turnaround-desktop-' + world + '.png')}, ${JSON.stringify(A8)}.map((az) => ({ pose: 'idle', t: 0.5, az, el: 8, w: 480, h: 640, hh: 0.64, cy: 0.58, world: ${JSON.stringify(world)}, bg: '#ffffff' })), { w: 480, h: 640, cols: 8, labels: ${L8} });`);
    js(`return await hoya3d.strip(${JSON.stringify(PREFIX + 'turnaround-phone-' + world + '.png')}, ${JSON.stringify(A8)}.map((az) => ({ pose: 'idle', t: 0.5, az, el: 8, w: 150, h: 200, hh: 0.64, cy: 0.58, world: ${JSON.stringify(world)}, bg: '#ffffff' })), { w: 150, h: 200, cols: 8, labels: ${L8} });`);
  }
}
if (ONLY.has('chip')) {   // the face opening's upper corner, close, front and 12.5 deg
  js(`return await hoya3d.strip(${JSON.stringify(PREFIX + 'chip.png')}, [0, 12.5].map((az) => ({ pose: 'idle', t: 0.5, az, el: 2, w: 480, h: 480, hh: 0.07, cy: 0.88, cx: 0.11, bg: '#ffffff' })), { w: 480, h: 480, cols: 2, labels: ['0 deg', '12.5 deg'] });`);
}
if (ONLY.has('measure')) {
  js(`await hoya3d.shot('measure-front.png', { az: 0, el: 0, w: 800, h: 1000, hh: 0.825, cy: 0.56, bg: '#ffffff' }); await hoya3d.shot('measure-side.png', { az: 90, el: 0, w: 800, h: 1000, hh: 0.825, cy: 0.56, bg: '#ffffff' }); return 'measure';`);
}
if (ONLY.has('detail')) {
  // close-ups for the review: the joints and small parts where a 3D build goes wrong first
  const D = [
    ['head front', { az: 0, el: 0, hh: 0.2, cy: 0.83 }], ['head 3/4', { az: 38, el: 6, hh: 0.2, cy: 0.8 }], ['head side', { az: 90, el: 0, hh: 0.2, cy: 0.8 }],
    ['head back', { az: 180, el: 6, hh: 0.2, cy: 0.8 }], ['head top', { az: 20, el: 60, hh: 0.24, cy: 0.8 }], ['under the chin', { az: 20, el: -35, hh: 0.24, cy: 0.62 }],
    ['sword hand', { az: 0, el: 0, hh: 0.16, cy: 0.68, cx: 0.34 }], ['sword back', { az: 180, el: 0, hh: 0.16, cy: 0.68, cx: 0.34 }], ['free hand', { az: 20, el: 4, hh: 0.15, cy: 0.28, cx: -0.26 }],
    ['belt, shell', { az: 0, el: 0, hh: 0.13, cy: 0.33 }], ['boots', { az: 30, el: 15, hh: 0.16, cy: 0.1 }], ['cape back', { az: 160, el: 10, hh: 0.24, cy: 0.38 }],
  ];
  js(`return await hoya3d.strip('detail.png', ${JSON.stringify(D.map((d) => d[1]))}.map((f) => ({ pose: 'idle', t: 0.5, w: 400, h: 400, ...f })), { w: 400, h: 400, cols: 4, labels: ${JSON.stringify(D.map((d) => d[0]))} });`);
  js(`return await hoya3d.strip('light.png', [{ az: 20, el: 4 }, { az: 20, el: 4, light: 0.35 }, { az: 20, el: 4, light: 0.35, lift: 0.45 }, { az: 160, el: 8, light: 0.35, lift: 0.45 }].map((f) => ({ pose: 'idle', t: 0.5, w: 360, h: 480, hh: 0.68, ...f })), { w: 360, h: 480, labels: ['day', 'dusk, no lift', 'dusk, lift 0.45', 'dusk, lift, back'] });`);
}
if (ONLY.has('debug')) {
  js(`await hoya3d.shot('dbg-chin-noline.png', { az: 20, el: -35, w: 700, h: 700, hh: 0.14, cy: 0.56, line: false }); return 'x';`);
  js(`await hoya3d.shot('dbg-chin.png', { az: 20, el: -35, w: 700, h: 700, hh: 0.14, cy: 0.56 }); await hoya3d.shot('dbg-top.png', { az: 20, el: 60, w: 700, h: 700, hh: 0.16, cy: 0.98, cx: 0.12 }); await hoya3d.shot('dbg-boot.png', { az: 30, el: 15, w: 700, h: 700, hh: 0.09, cy: 0.12, cx: 0.1 }); return 'dbg2';`);
  js(`await hoya3d.shot('dbg-belt.png', { az: 0, el: 0, w: 500, h: 500, hh: 0.12, cy: 0.3, line: false }); await hoya3d.shot('dbg-belt-line.png', { az: 0, el: 0, w: 500, h: 500, hh: 0.12, cy: 0.3 }); return 'dbg';`);
}
if (ONLY.has('views')) {
  js(`for (const [n, az] of ${JSON.stringify(Object.entries(V))}) await hoya3d.shot(n + '.png', { az, el: 4, w: 600, h: 800, bg: '#FBFAF5' }); return 'views';`);
  js(`await hoya3d.shot('front-blink.png', { az: 0, el: 4, w: 600, h: 800, bg: '#FBFAF5', blink: true }); await hoya3d.shot('q34back.png', { az: 145, el: 10, w: 600, h: 800, bg: '#FBFAF5' }); return 'extra';`);
}
if (ONLY.has('compare') && REFS && existsSync(REFS)) {
  const NO11 = { u: 393, c: [657.5, 553.5], sole: 1588 };   // NO.1-1.png: px per U, the head centre, the soles (surface)
  const C = [
    ['compare/front.png', { ref: '/refs/x_manualvariation1-2/1-1.png', refBox: [0, 0, 1100, 1609], exact: NO11, overlay: 'NO.1-1 (公式) と 3D の重ね合わせ, 同じ縮尺 (393 px = 1 U)', refLabel: '公式 NO.1-1 (基本ポーズ, p.2/p.6)', label: '3D 正面 (idle), 同じ縮尺', view: { az: 0, el: 0 } }],
    ['compare/q34.png', { ref: '/refs/x_manualvariation16/16-15.png', refLabel: '公式 NO.16-15 (斜め, p.26)', label: '3D 斜め 38°', view: { az: 38, el: 2 } }],
    ['compare/side.png', { ref: '/refs/x_manualvariation15/15-31.png', refBox: [0, 560, 1500, 4660], refLabel: '公式 NO.15-31 (横, p.23)', label: '3D 横 (左側)', view: { az: 90, el: 0 } }],
    ['compare/back.png', { ref: '/refs/x_manualvariation9/9-1.png', refBox: [2070, 1550, 2990, 2350], refLabel: '公式 NO.9-1 (後ろ姿, p.14)', label: '3D 後ろ', view: { az: 180, el: 4 } }],
    ['compare/face.png', { ref: '/refs/x_manualvariation1-2/1-1.png', refBox: [225, 60, 1090, 935], exact: NO11, overlay: 'NO.1-1 頭部 (公式) と 3D の重ね合わせ', refLabel: '公式 NO.1-1 頭部', label: '3D 頭部, 同じ縮尺', view: { az: 0, el: 0 } }],
  ];
  for (const [n, o] of C) js(`return await hoya3d.compare(${JSON.stringify(n)}, ${JSON.stringify(o)});`);
  js(`return 'ink distance, 3D vs official (mm at 1.10 m): ' + hoya3d.measures();`);
}
if (ONLY.has('walk')) {
  // one walk cycle and one run cycle in 8 frames each at the model's own cadence (a cycle is two steps); the air
  const L8 = (w) => JSON.stringify([...Array(8).keys()].map((i) => `${w} ${i + 1}/8`));
  js(`hoya3d.hoya.poseAt('walk', 1); const hz = hoya3d.hoya.cadence; return await hoya3d.strip(${JSON.stringify(PREFIX + 'walk.png')}, [...Array(8).keys()].map((i) => ({ pose: 'walk', t: 1 + i / 8 / hz, az: 60, el: 6, hh: 0.68 })), { labels: ${L8('walk')} });`);
  js(`hoya3d.hoya.poseAt('run', 1); const hz = hoya3d.hoya.cadence; return await hoya3d.strip(${JSON.stringify(PREFIX + 'run.png')}, [...Array(8).keys()].map((i) => ({ pose: 'run', t: 1 + i / 8 / hz, az: 80, el: 6, hh: 0.68 })), { labels: ${L8('run')} });`);
  js(`return await hoya3d.strip(${JSON.stringify(PREFIX + 'air.png')}, [{ pose: 'idle', t: 1, az: 50 }, { pose: 'jump', t: 0.25, az: 50 }, { pose: 'jump', t: 0.6, az: 50 }, { pose: 'fall', t: 0.3, az: 50 }, { pose: 'walk', t: 1.1, az: 180, el: 8 }, { pose: 'run', t: 1.05, az: 180, el: 8 }].map((f) => ({ hh: 0.68, el: 6, ...f })), { labels: ['idle', 'jump (rise)', 'jump (apex)', 'fall', 'walk, from behind', 'run, from behind'] });`);
}
if (ONLY.has('turntable2')) {
  // [hoya-accuracy] the v2 turntable: one turn in 6 s in the town's day light, idle; the face view turns with the camera
  for (let k = 0; k < 6; k++) js(`for (let i = ${k * 30}; i < ${(k + 1) * 30}; i++) { const t = i / 180 * 6; const cv = hoya3d.frame({ az: (i / 180) * 360, el: 8, pose: 'idle', t: 0.5 + t, w: 720, h: 960, cam: 'persp', dist: 4.6, cy: 0.56, world: 'day', bg: '#ffffff' }); await hoya3d.post('tt2/' + String(i).padStart(4, '0') + '.png', cv); } return 'tt2 ${k}';`);
}
if (ONLY.has('turntable')) {
  for (let k = 0; k < 4; k++) js(`for (let i = ${k * 30}; i < ${(k + 1) * 30}; i++) { const t = i / 120 * 4; const cv = hoya3d.frame({ az: (i / 120) * 360, el: 8, pose: 'idle', t: 0.5 + t, w: 720, h: 960, cam: 'persp', dist: 4.6, cy: 0.56, bg: '#FBFAF5' }); await hoya3d.post('tt/' + String(i).padStart(4, '0') + '.png', cv); } return 'tt ${k}';`);
}

if (ONLY.has('play')) {
  // 6 s of play as the avatar lane drives it, from the game's camera behind him: stand, walk, run, jump, land, walk
  const inputs = `(t) => { const air = t > 4.0 && t < 4.62, ta = t - 4.0, vy = air ? 3.1 - 9.8 * ta : 0, y = air ? Math.max(0, 3.1 * ta - 4.9 * ta * ta) : 0;
    const speed = t < 0.6 ? 0 : t < 2.4 ? 1.3 : t < 5.2 ? 4.2 : 1.3; return { speed, onGround: !air, vy, y }; }`;
  js(`return await hoya3d.clip('pl/', 6, ${inputs}, { w: 720, h: 960 });`);
}

if (ONLY.has('film')) {
  // the walking clip: stand, walk, run, jump, walk; the camera from behind as the game sees him, coming round to his side
  const inputs = `(t) => { const air = t > 5.0 && t < 5.62, ta = t - 5.0, vy = air ? 3.1 - 9.8 * ta : 0, y = air ? Math.max(0, 3.1 * ta - 4.9 * ta * ta) : 0;
    const speed = t < 0.6 ? 0 : t < 3.6 ? 1.3 : t < 5.9 ? 3.0 : t < 7.4 ? 1.3 : 0; return { speed, onGround: !air, vy, y, run: speed > 2 ? 1 : 0 }; }`;
  const cam = `(t) => ({ az: 160 - Math.min(1, Math.max(0, (t - 1.2) / 3)) * 90, el: 10, dist: 4.2, fov: 45, cy: 0.62 })`;
  for (let k = 0; k < 4; k++) js(`return 'film ' + await hoya3d.film('wk/', 2, ${inputs}, ${cam}, { w: 720, h: 960, first: ${k * 60} });`);
}
if (ONLY.has('far')) {
  // 20 m away on a phone (390 x 844 CSS px, the engine draws at ~1x CSS on a phone; the game's vertical FOV ~88 deg there):
  // four frames of one walk cycle, then the same 4x (nearest) so the pixels can be seen
  js(`const hz = (() => { hoya3d.hoya.poseAt('walk', 1); return hoya3d.hoya.cadence; })(); let out = [];
    for (let i = 0; i < 4; i++) await hoya3d.film(${JSON.stringify(PREFIX + 'far-')}, 1 / 30, () => ({ speed: 1.3 }), () => ({ az: 120, el: 12, dist: 20, fov: 88, cy: 0.55, credit: false }), { w: 390, h: 844, first: i ? 30 + i * Math.round(30 / hz / 4) : 0 });
    return 'far';`);
}
// 4. run WebKit
const stepsFile = join(tmpdir(), `hoya3d-steps-${process.pid}.json`);
writeFileSync(stepsFile, JSON.stringify(steps));
const t0 = Date.now();
// async: the server above must keep answering while WebKit runs (a sync spawn would block this event loop)
const proc = Bun.spawn([ensureShot(), '--url', base, '--w', '1000', '--h', '1300', '--steps', stepsFile, '--timeout', '120'], { stdout: 'pipe', stderr: 'pipe' });
const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
server.stop(true);
rmSync(stepsFile, { force: true });
console.log(out.trim().split('\n').filter((l) => !l.startsWith('saved')).join('\n'));
if (code !== 0) { console.error(err); process.exit(code || 1); }

if (ONLY.has('turntable2') && existsSync(join(OUT, 'tt2'))) {
  const v = spawnSync('nice', ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', join(OUT, 'tt2/%04d.png'), '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', join(OUT, PREFIX + 'turntable.mp4')], { stdio: 'inherit' });
  if (v.status !== 0) process.exit(1);
  rmSync(join(OUT, 'tt2'), { recursive: true, force: true });
}
// 5. the turntable video
if (ONLY.has('turntable') && existsSync(join(OUT, 'tt'))) {
  const v = spawnSync('nice', ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', join(OUT, 'tt/%04d.png'), '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', join(OUT, 'turntable.mp4')], { stdio: 'inherit' });
  if (v.status !== 0) process.exit(1);
  rmSync(join(OUT, 'tt'), { recursive: true, force: true });
}
if (ONLY.has('play') && existsSync(join(OUT, 'pl'))) {
  const v = spawnSync('nice', ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', join(OUT, 'pl/%04d.png'), '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-movflags', '+faststart', join(OUT, 'play-behind.mp4')], { stdio: 'inherit' });
  if (v.status !== 0) process.exit(1);
  rmSync(join(OUT, 'pl'), { recursive: true, force: true });
}
if (ONLY.has('film') && existsSync(join(OUT, 'wk'))) {
  const v = spawnSync('nice', ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', join(OUT, 'wk/%04d.png'), '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', join(OUT, PREFIX + 'walk.mp4')], { stdio: 'inherit' });
  if (v.status !== 0) process.exit(1);
  rmSync(join(OUT, 'wk'), { recursive: true, force: true });
}
const frame = (s) => s.startsWith('tt/') || s.startsWith('tt2/') || s.startsWith('pl/') || s.startsWith('wk/');
console.log(JSON.stringify({ saved: saved.filter((s) => !frame(s)), frames: saved.filter(frame).length, seconds: (Date.now() - t0) / 1000 }));
