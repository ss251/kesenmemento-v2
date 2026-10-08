// [mobile-perf] What the phone shows, live (not shot mode): the phone tier at 390 x 844 @3 (iPhone UA, touch), past the title, the camera at each
// spec, a few seconds to stream and settle, then the screen in device pixels (1170 x 2532) and, with --crop, a 1:1 crop of it. For A/B looks of
// engine changes (the canvas ratio, the atlas density) where shot mode differs from what a visitor sees (shot mode pins the canvas to 1x and
// turns dynamic resolution off).
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/phone-look.mjs [--port 9532] [--nobuild] [--url http://.../]
//       [--params "dr=1&cdpr=1"] [--cams "hero;tourwalk:market"] [--wait 6] [--crop x,y,w,h (CSS px)] --out dir/prefix
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build, serve, launch, ROOT } from './cdp.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9532));
const out = arg('out', join(ROOT, '.work/look/shot'));
const cams = arg('cams', 'hero').split(';').map((s) => s.trim()).filter(Boolean);
const wait = Number(arg('wait', 6));
let base = arg('url'), srv = null;
if (!base) {
  const dist = join(ROOT, `dist/anime-${port}`);
  if (arg('nobuild') !== '1') await build({ outdir: dist, quiet: true });
  srv = serve({ port, dist });
  base = srv.url;
}
const qs = new URLSearchParams(arg('params') || '');
const url = base + (base.endsWith('/') ? '' : '/') + 'index.html' + (qs.toString() ? '?' + qs : '');
const b = await launch({});
const p = await b.page({ width: 390, height: 844, dpr: 3 });
await p.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844 });
await p.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await p.S('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
await p.goto(url);
await p.waitFor(`document.body.classList.contains('loaded')`, { timeout: 300000 });
await Bun.sleep(1000);
await p.eval(`(() => { const go = document.getElementById('go'); if (go && !go.disabled) go.click(); else window.__titleArrive?.(); })()`);
await p.waitFor(`document.body.classList.contains('playing')`, { timeout: 20000 }).catch(() => {});
await Bun.sleep(2000);
const crop = arg('crop') ? arg('crop').split(',').map(Number) : null;
mkdirSync(dirname(out), { recursive: true });
const info = [];
for (const [i, c] of cams.entries()) {
  await p.eval(`(() => { document.body.classList.add('noui'); window.__camSpec(${JSON.stringify(c)}); return 1; })()`);
  await Bun.sleep(wait * 1000);
  const meta = await p.eval(`(() => { const r = window.__ctx.renderer, s = window.__stats || {}, cam = window.__ctx.camera, f = new window.THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const r2 = (x) => Math.round(x * 100) / 100, pose = [r2(cam.position.x), r2(cam.position.y), r2(cam.position.z), r2((Math.atan2(f.x, -f.z) * 180 / Math.PI + 360) % 360), r2(Math.asin(Math.max(-1, Math.min(1, f.y))) * 180 / Math.PI), r2(cam.fov)];
    return { canvas: [r.domElement.width, r.domElement.height], scale: s.renderScale, target: [window.__ctx.pipeline.size.x, window.__ctx.pipeline.size.y], fps: Math.round(s.fps || 0), pose: pose.join(',') }; })()`);   // pose: the six-number ?cam= link of this view (x,y,z,heading,pitch,fov), for matched framings
  const tag = `${i}-${c.replace(/[^a-z0-9]+/gi, '_')}`;
  const { data } = await p.S('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}-${tag}.png`, Buffer.from(data, 'base64'));
  if (crop) { const r = await p.S('Page.captureScreenshot', { format: 'png', clip: { x: crop[0], y: crop[1], width: crop[2], height: crop[3], scale: 1 } }); writeFileSync(`${out}-${tag}-crop.png`, Buffer.from(r.data, 'base64')); }
  info.push({ cam: c, tag, ...meta });
}
console.log(JSON.stringify({ url, info, errors: p.errors().slice(0, 5) }, null, 1));
await b.close();
srv?.stop();
process.exit(0);
