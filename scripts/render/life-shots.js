// [v3:life] Screenshots for the life package with per-camera time of day (one page load, many frames).
// ALWAYS through the machine gate (one headless Chrome machine-wide, V3-SPEC section 8):
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun scripts/render/life-shots.js --port 8814 \
//       --only environment,water,_houses,harbor,life --cams "yoru@hero;yugata@walk;yuyake@x,y,z>lx,ly,lz" --out shots/life/a
// cam = [<preset|hours>@]<camSpec>   (camSpec: hero | walk | tour:<id> | tourwalk:<id> | x,z,yaw,pitch | x,y,z,yaw,pitch | x,y,z>lx,ly,lz)
// --photo 0.5 saves a photo-mode PNG · --pre "js|||js" per-camera eval · cams ltour:<id> / lwalk:<id> (life's tour)
// --ui 1 shows the UI (also --lang en) · --w/--h <= 1920x1080 · --t sim seconds · --bench N · --weather rain · --film "t1,t2" (film path frames)
import { join, resolve, relative } from 'node:path';
import { build, serve, launch, ROOT } from '../../tools/anime/cdp.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const W = Math.min(1920, Number(args.w || 1280)), H = Math.min(1080, Number(args.h || 720));
const port = Number(args.port || 8814);
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const cams = (args.cams || 'hero').split(';').map((s) => s.trim()).filter(Boolean);
const out = args.out || 'shots/life/shot';
const dist = join(ROOT, `dist/anime-${port}`);
const only = args.only ? args.only.split(',') : null;

const t0 = Date.now();
if (!args.nobuild) { const r = await build({ outdir: dist, only }); console.log(`build ${r.reused ? 'FAILED (reused last good build)' : 'ok'} ${r.ms ?? ''} ms`); }
const srv = serve({ port, dist });
let browser;
try {
  browser = await launch({ quiet: true });
  const page = await browser.page({ width: W, height: H });
  if (args.mobile) { await page.S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true, screenWidth: W, screenHeight: H }); await page.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }).catch(() => {}); }
  const q = new URLSearchParams({ shot: '1', w: String(W), h: String(H), t: String(args.t || 12), q: args.q || 'high' });
  for (const k of ['only', 'preset', 'hours', 'weather', 'lang', 'ui', 'fov', 'rain', 'cloud', 'nocast', 'nolamps', 'live', 'fixtures', 'arrivals', 'sound', 'cells', 'wet', 'season', 'batch']) if (args[k]) q.set(k, args[k]);
  if (args.noshot) q.delete('shot');
  await page.goto(`${srv.url}index.html?${q}`);
  if (args.noshot) {   // the real interactive flow: intro board -> "Enter the town" -> live UI, real-time frames
    await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
    await page.eval("document.getElementById('go').click()");
    await page.frames(30);
  } else await page.waitFor('window.__ready === true', { timeout: 280000 });
  console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const life = await page.eval('JSON.stringify(window.__life?.stats || null)');
  console.log('life stats:', life);
  if (args.ui) { await page.eval('window.__life?.live?.ready?.then?.(() => 1)'); await page.eval('document.fonts.ready.then(() => 1)'); }
  if (args.actors) console.log('actors:', await page.eval(`JSON.stringify((window.__life?.cast?.actors || []).map((a) => { const g = (a.h.group || a.h).position; return [a.kind || (a.cat ? 'cat' : a.group ? 'group' : 'idle'), +g.x.toFixed(1), +g.y.toFixed(2), +g.z.toFixed(1)]; }))`));
  if (args.audio) console.log('audio:', await page.eval(`(async () => { const A = window.__ctx.audio; try { A.start(); } catch (e) { return 'start failed ' + e.message; } await new Promise((r) => setTimeout(r, 400)); window.__camSpec('walk'); const S = window.__life.sound; if (!S) return 'no soundscape'; for (let i = 0; i < 120; i++) S.update(0.1); return JSON.stringify({ ready: A.ready, state: A.context && A.context.state, ...S.stats }); })()`));
  if (args.flight) console.log('flight:', await page.eval(`(() => { const T = window.__life.tour; window.__camSpec('hero'); T.flyTo(${JSON.stringify(args.flight)}); for (let i = 0; i < ${Number(args.flightSteps || 25)}; i++) T.update(0.1); const c = window.__ctx.camera.position; return JSON.stringify({ flying: T.flying, cam: [c.x, c.y, c.z].map((v) => +v.toFixed(1)) }); })()`));
  if (args.eval) console.log('eval:', await page.eval(`(async () => JSON.stringify(await (${args.eval})))()`));
  // --pre "js0|||js1|||..." : evaluated before cam i (look-pass tuning without reloading the page)
  const pres = args.pre ? args.pre.split('|||') : [];
  const films = args.film ? args.film.split(',').map(Number) : null;
  const list = films ? films.map((t) => ({ film: t, spec: cams[0] })) : cams.map((c) => ({ spec: c }));
  for (let i = 0; i < list.length; i++) {
    let spec = list[i].spec, time = null;
    const m = spec.match(/^([a-z]+|\d+(?:\.\d+)?)@(.+)$/);
    if (m) { time = m[1]; spec = m[2]; }
    if (pres[i] && pres[i].trim()) await page.eval(`(() => { ${pres[i]} })()`);
    if (time) await page.eval(`window.__lifeSet(${isNaN(Number(time)) ? JSON.stringify(time) : Number(time)})`);
    if (args.flight && spec === 'keep') { /* keep the flight camera */ }
    else if (list[i].film != null) { await page.eval(`window.__sim(${list[i].film})`); await page.eval(`window.__film(${list[i].film})`); }
    else if (/^l(tour|walk):/.test(spec)) {   // life's tour framings (tour.js FRAMES): ltour:<id> drone, lwalk:<id> walk spot
      const [k, id] = spec.split(':');
      await page.eval(`window.__life.tour.${k === 'ltour' ? 'jumpTo' : 'walkTo'}(${JSON.stringify(id)})`);
    } else await page.eval(`window.__camSpec(${JSON.stringify(spec)})`);
    await page.frames(6);
    const file = resolve(ROOT, `${out}_${i}.png`);
    await page.shot(file);
    const st = await page.eval('({ calls: window.__stats.calls, triangles: window.__stats.triangles })');
    console.log(`saved ${relative(ROOT, file)}  [${time || '-'}@${list[i].film ?? spec}]  calls=${st.calls} tris=${(st.triangles / 1e6).toFixed(2)}M`);
    if (args.bench) console.log('  bench:', JSON.stringify(await page.eval(`window.__bench(${Number(args.bench) > 1 ? Number(args.bench) : 30})`)));
  }
  // --photo <scale>: photo mode (ui/photo.js) from the last camera; 0.5 = 1920x1080 (the machine caps forbid 4K renders
  // until 2026-10-01 00:00Z; scale 1 = 3840x2160 is the same code path)
  if (args.photo) {
    const r = await page.eval(`window.__photo(${Number(args.photo)}, { data: true, noDownload: true }).then((r) => r && ({ w: r.w, h: r.h, name: r.name, b64: r.url.split(',')[1] }))`);
    if (!r) console.log('photo: FAILED');
    else { const { writeFileSync } = await import('node:fs'); const f = resolve(ROOT, `${out}_photo.png`); writeFileSync(f, Buffer.from(r.b64, 'base64')); console.log(`photo ${r.w}x${r.h} ${r.name} -> ${relative(ROOT, f)}`); }
  }
  const info = await page.eval('({ errors: window.__errors })');
  if (info.errors?.length) { console.log('MODULE ERRORS:'); for (const e of info.errors) console.log(` - [${e.module}] ${String(e.message).split('\n').slice(0, 6).join('\n   ')}`); }
  const errs = page.errors();
  if (errs.length) { console.log('PAGE ERRORS:'); for (const l of errs.slice(0, 30)) console.log('  ', l.type, l.text.slice(0, 400)); }
} catch (e) {
  console.log('SHOT FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.stop();
}
