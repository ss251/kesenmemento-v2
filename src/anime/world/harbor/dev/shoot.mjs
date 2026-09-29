// [v3:harbor] Headless-Chrome screenshots of the harbour kit with the real Sakura renderer.
// Real GPU (--use-angle=metal, never --disable-gpu), real-time rAF (no virtual time), port 8813 only.
//
//   nice -n 15 taskpolicy -b env -u NODE_OPTIONS bun src/anime/world/harbor/dev/shoot.mjs \
//     --scene boats --preset golden,night --out shots/harbor/boats \
//     --cams "hero:40,6,30,0,4,0;wide:120,40,120,0,0,0" [--t 12] [--w 1600 --h 900] [--fov 45] [--bench]
//
// cams: ';'-separated "name:px,py,pz,lx,ly,lz" (look-at) or "name:px,py,pz,yawDeg,pitchDeg" (yaw 0 = north).
// Files: <out>_<preset>_<name>.png. Prints module errors, page errors, build time, draw calls, triangles.
import { resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { start, ROOT } from './serve.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const PORT = 8813;
const W = Number(args.w || 1600), H = Number(args.h || 900);
const presets = (args.preset || 'golden').split(',');
const cams = (args.cams || 'hero:60,12,60,0,3,0').split(';').map((s) => s.trim()).filter(Boolean).map((s, i) => {
  const [n, v] = s.includes(':') ? s.split(':') : [String(i), s];
  return { name: n, v: v.split(',').map(Number) };
});
const out = resolve(ROOT, args.out || 'shots/harbor/shot');
mkdirSync(dirname(out), { recursive: true });

// ---- machine rules (V3-SPEC 8)
function load5() { const s = Bun.spawnSync(['uptime']).stdout.toString(); const m = s.match(/load averages?:\s*([\d.]+),?\s+([\d.]+)/); return m ? +m[2] : 0; }
function quiet() { const d = new Date(); const m = d.getUTCHours() * 60 + d.getUTCMinutes(); return m >= 14 * 60 || m < 2 * 60; }
{
  const t0 = Date.now();
  for (;;) {
    const l = load5(), q = quiet(), max = q ? 18 : 20, hard = 22;
    if (l <= max) break;
    if (l > hard) { console.error(`load ${l} > ${hard}: stopping`); process.exit(2); }
    if (Date.now() - t0 > 600000) { console.error(`load stayed ${l} > ${max}`); process.exit(2); }
    console.error(`load ${l} > ${max}${q ? ' (quiet window)' : ''}; waiting 30 s`); await Bun.sleep(30000);
  }
}

let server = null;
try { server = start({ port: PORT, quiet: true }); } catch (e) { /* already running (our own harness) */ }
const base = `http://127.0.0.1:${PORT}/src/anime/world/harbor/dev/index.html`;

const chrome = Bun.spawn([CHROME, '--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
  '--remote-debugging-port=0', `--window-size=${W},${H}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--user-data-dir=/tmp/harbor-chrome-${PORT}`, 'about:blank'], { stdout: 'ignore', stderr: 'pipe' });
const kill = () => { try { chrome.kill(9); } catch {} };
process.on('exit', kill);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { kill(); process.exit(130); });

let wsUrl = null, buf = '';
const reader = chrome.stderr.getReader();
while (!wsUrl) { const { value, done } = await reader.read(); if (done) throw new Error('chrome exited:\n' + buf); buf += new TextDecoder().decode(value); wsUrl = buf.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]; }
(async () => { while (!(await reader.read()).done); })();
const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 400));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push('[log] ' + (m.params.entry.text + ' ' + (m.params.entry.url || '')).slice(0, 400));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 600));
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId && { sessionId }) })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Runtime.enable'); await S('Page.enable'); await S('Log.enable');
await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
async function evalJS(expression, timeout = 180000) {
  const r = await Promise.race([S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }), Bun.sleep(timeout).then(() => { throw new Error('eval timeout: ' + expression.slice(0, 80)); })]);
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result?.value;
}

let code = 0;
try {
  for (const preset of presets) {
    const q = new URLSearchParams({ scene: args.scene || 'boats', preset, shot: '1', w: String(W), h: String(H), t: String(args.t ?? 12), fov: String(args.fov || 45) });
    if (args.q) q.set('q', args.q);
    if (args.layout) q.set('layout', args.layout);
    const t0 = Date.now();
    await S('Page.navigate', { url: base + '?' + q });
    for (;;) { await Bun.sleep(400); const ok = await evalJS('window.__ready === true || (window.__fatal ? "fatal" : false)').catch(() => false); if (ok === 'fatal') throw new Error(await evalJS('window.__fatal')); if (ok) break; if (Date.now() - t0 > Number(args.timeout || 150000)) { const d = await evalJS('JSON.stringify({info: window.__info, stage: window.__stage, fatal: window.__fatal, errs: window.__errors})').catch((e) => String(e)); throw new Error('timeout waiting for __ready ' + d); } }
    const info = await evalJS('JSON.stringify(window.__info)');
    console.log(`[${preset}] ready in ${Date.now() - t0} ms  ${info}`);
    if (args.eval) console.log('eval:', JSON.stringify(await evalJS(args.eval)));
    for (const c of cams) {
      const r = await evalJS(`window.__shot(${JSON.stringify(c.v)})`);
      const shot = await S('Page.captureScreenshot', { format: 'png' });
      const file = `${out}_${preset}_${c.name}.png`;
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.log(`saved ${file.replace(ROOT + '/', '')}  ${JSON.stringify(r)}`);
      if (args.bench) console.log('  bench', JSON.stringify(await evalJS(`window.__bench(${Number(args.bench) > 1 ? Number(args.bench) : 30})`)));
    }
  }
} catch (e) { console.log('SHOT FAILED:', e.message); code = 1; }
if (logs.length) { console.log('PAGE LOGS:'); for (const l of [...new Set(logs)].slice(0, 40)) console.log('  ' + l); }
kill(); server?.stop(true); ws.close();
process.exit(code);
