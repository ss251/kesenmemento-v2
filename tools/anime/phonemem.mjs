// [v4:phone] Memory and budget probe for the phone tier (and desktop): JS heap peak during load and steady after it,
// triangles, draw calls, geometries, textures and an estimate of GPU texture memory, time to the first frame, and
// optionally where the heap goes (sampling heap profile by allocating function, or a full heap snapshot).
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/phonemem.mjs --port 8860 [--nobuild] [--desktop]
//       [--q low] [--url https://.../] [--eval diag.js] [--sample out.json] [--snapshot out.heapsnapshot] [--settle 12] [--out report.json]
//
// Phone = 390x844, DPR 3, mobile, touch (pointer: coarse), like qa3 --phone but at the real DPR.
import { join } from 'node:path';
import { writeFileSync, createWriteStream, mkdirSync } from 'node:fs';
import { build, serve, launch, ROOT } from './cdp.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 8860));
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const desktop = arg('desktop') === '1';
const settle = Number(arg('settle', 12));
let base = arg('url');
let srv = null;
if (!base) {
  const dist = join(ROOT, `dist/anime-${port}`);
  if (arg('nobuild') !== '1') console.error(JSON.stringify(await build({ outdir: dist, quiet: false })));
  srv = serve({ port, dist });
  base = srv.url;
}
const qs = new URLSearchParams();
if (arg('q')) qs.set('q', arg('q'));
for (const kv of (arg('params') || '').split('&').filter(Boolean)) { const [k, v = ''] = kv.split('='); qs.set(k, v); }
const url = base + (base.endsWith('/') ? '' : '/') + 'index.html' + (qs.toString() ? '?' + qs : '');

// --heapcap N: cap V8's old space at N MB (a memory-tight engine, like a phone tab under pressure): the build either
// fits its live data in N MB or the page dies with an out-of-memory crash (reported as crashed: true)
const cap = arg('heapcap');
const b = await launch({ args: [`--js-flags=--expose-gc${cap ? ' --max-old-space-size=' + cap : ''}`, '--enable-precise-memory-info'] });
const p = await b.page(desktop ? { width: 1600, height: 900, dpr: 1 } : { width: 390, height: 844, dpr: 3 });
if (!desktop) {
  await p.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844 });
  await p.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await p.S('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
}
await p.S('Performance.enable');
await p.S('HeapProfiler.enable');
const sampleOut = arg('sample');
if (sampleOut) await p.S('HeapProfiler.startSampling', { samplingInterval: 65536, includeObjectsCollectedByMajorGC: arg('alloc') === '1', includeObjectsCollectedByMinorGC: arg('alloc') === '1' });

let peak = 0, peakTotal = 0, polling = true;
const heap = async () => { const { metrics } = await p.S('Performance.getMetrics'); const m = Object.fromEntries(metrics.map((x) => [x.name, x.value])); return m; };
const poller = (async () => { while (polling) { try { const m = await heap(); peak = Math.max(peak, m.JSHeapUsedSize || 0); peakTotal = Math.max(peakTotal, m.JSHeapTotalSize || 0); } catch { /* navigating */ } await Bun.sleep(150); } })();

const t0 = Date.now();
await p.goto(url);
let crashed = false;
b.on('Inspector.targetCrashed', () => { crashed = true; });
await p.S('Inspector.enable').catch(() => {});
try { await p.waitFor(`document.body.classList.contains('loaded') || document.body.classList.contains('shot')`, { timeout: cap ? 120000 : 240000 }); }
catch (e) { if (!cap) throw e; console.log(JSON.stringify({ url, heapcap: cap, crashed: true, polledPeakMB: Math.round(peak / 1e6), error: String(e.message).slice(0, 200) })); polling = false; await b.close(); srv?.stop(); process.exit(0); }
const firstFrameMs = Date.now() - t0;
await Bun.sleep(settle * 1000);   // streaming settles, the drone hovers
const loadPeak = peak;
const settled = await heap();   // without a forced GC (what a visitor's tab holds)
await p.S('HeapProfiler.collectGarbage');
await Bun.sleep(500);
const steady = await heap();
polling = false; await poller;
const info = await p.eval(`(() => {
  const ctx = window.__ctx, r = ctx.renderer;
  const bench = window.__bench(5);
  // texture memory estimate: every texture reachable from a material in the scene, plus the render targets
  const seen = new Set(); let texBytes = 0, big = [];
  const addTex = (t) => { if (!t || seen.has(t)) return; seen.add(t); const im = t.image; const w = im?.width || 0, h = im?.height || 0, d = im?.depth || 1;
    const bpp = t.type === 1016 || t.type === 1015 ? (t.type === 1016 ? 8 : 16) : 4; const bytes = w * h * d * bpp * (t.generateMipmaps !== false && t.minFilter >= 1008 ? 1.33 : 1);
    texBytes += bytes; if (bytes > 2e6) big.push([t.name || (im?.tagName || im?.constructor?.name || '?'), w, h, Math.round(bytes / 1e6)]); };
  ctx.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) for (const k in m) { const v = m[k]; if (v && v.isTexture) addTex(v); }
    for (const m of ms) if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture) addTex(v); } });
  // geometry: GPU bytes (count x itemSize x element size) and the CPU copies still held (released ones are null)
  let vtx = 0, cpu = 0; const geos = new Set(), seenA = new Set();   // attributes shared between geometries count once
  const acc = (a) => { if (!a || seenA.has(a)) return; seenA.add(a); const el = a.array ? a.array.BYTES_PER_ELEMENT : (a.count > 65535 || a.itemSize > 1 ? 4 : 2); vtx += a.count * a.itemSize * el; if (a.array) cpu += a.array.byteLength; };
  ctx.scene.traverse((o) => { const g = o.geometry; if (!g || geos.has(g)) return; geos.add(g); for (const k in g.attributes) acc(g.attributes[k]); acc(g.index); });
  const sun = ctx.sky?.sun || null;
  return { q: ctx.quality.name, tier: ctx.quality.tier || ctx.quality.name, pixelRatio: ctx.quality.pixelRatio, msaa: ctx.quality.msaa, shadowMap: ctx.quality.shadowMap,
    canvas: [r.domElement.width, r.domElement.height], bench, texMB: Math.round(texBytes / 1e6), bigTex: big.sort((a, b) => b[3] - a[3]).slice(0, 12), geoMB: Math.round(vtx / 1e6), geoCpuMB: Math.round(cpu / 1e6),
    modules: window.__stats?.modules, errors: (window.__errors || []).length, lots: window.__L?.LOTS?.length };
})()`);
if (arg('eval')) info.eval = await p.eval(await Bun.file(arg('eval')).text());   // extra page JS (diagnostics)
const modPeak = Math.max(0, ...Object.values(info.modules || {}).map((m) => m.heapMB || 0));
const report = { url, desktop, heapcap: cap, crashed, firstFrameMs, heapPeakMB: Math.max(Math.round(loadPeak / 1e6), modPeak), heapPolledPeakMB: Math.round(loadPeak / 1e6), heapModulePeakMB: modPeak, heapSettledMB: Math.round((settled.JSHeapUsedSize || 0) / 1e6), heapTotalPeakMB: Math.round(peakTotal / 1e6), heapAfterGcMB: Math.round((steady.JSHeapUsedSize || 0) / 1e6), ...info, pageErrors: p.errors().slice(0, 5) };
console.log(JSON.stringify(report, null, 1));
if (arg('out')) writeFileSync(arg('out'), JSON.stringify(report, null, 1));

if (sampleOut) {
  const { profile } = await p.S('HeapProfiler.getSamplingProfile');
  await p.S('HeapProfiler.stopSampling');
  // live bytes by allocating frame (self) and by the first frame in our own source (src/anime/...)
  const self = new Map(), own = new Map();
  const key = (cf) => `${cf.functionName || '(anon)'} ${String(cf.url).replace(/^.*\//, '')}:${cf.lineNumber + 1}`;
  const walk = (n, stack) => {
    const st = stack.concat(n.callFrame);
    if (n.selfSize) {
      self.set(key(n.callFrame), (self.get(key(n.callFrame)) || 0) + n.selfSize);
      const mine = [...st].reverse().find((cf) => /src\/anime|\/chunk-|\/index-|\/main-/.test(cf.url) && !/three/.test(cf.url)) || n.callFrame;
      own.set(key(mine), (own.get(key(mine)) || 0) + n.selfSize);
    }
    for (const c of n.children || []) walk(c, st);
  };
  walk(profile.head, []);
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => [k, Math.round(v / 1e5) / 10]);
  mkdirSync(join(sampleOut, '..'), { recursive: true });
  writeFileSync(sampleOut, JSON.stringify({ selfMB: top(self), ownMB: top(own) }, null, 1));
  writeFileSync(sampleOut.replace(/\.json$/, '') + '.raw.json', JSON.stringify(profile));
  console.error('sampling profile ->', sampleOut);
}
const snapOut = arg('snapshot');
if (snapOut) {
  // the snapshot streams as HeapProfiler.addHeapSnapshotChunk events; summarise it with tools/anime/heapsnap.mjs
  const ws = createWriteStream(snapOut);
  b.on('HeapProfiler.addHeapSnapshotChunk', (pr) => ws.write(pr.chunk));
  console.error('taking heap snapshot ->', snapOut);
  await p.S('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
  await new Promise((r) => ws.end(r));
}
await b.close();
srv?.stop();
process.exit(0);

