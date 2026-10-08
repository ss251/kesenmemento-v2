// Headless-Chrome helper for the anime app (v3). Real GPU (--use-angle=metal, never --disable-gpu), real-time
// requestAnimationFrame (no virtual time: it starves rAF), a private Bun build per port so concurrent agents never
// break each other's renders, and the machine rules of V3-SPEC section 8.
//
//   import { build, serve, launch, machine } from './cdp.mjs';
//   await build({ outdir });                          // bundles src/anime/index.html against three 0.186.1
//   const srv = serve({ port: 8811, dist: outdir });   // /data/* -> project data/, everything else -> dist
//   const b = await launch(); const p = await b.page({ width: 1280, height: 720 });
//   await p.goto(srv.url + 'index.html?shot=1'); await p.waitFor('window.__ready === true');
//   await p.shot('out.png'); await b.close(); srv.stop();
import { resolve, join, normalize, dirname } from 'node:path';
import { mkdirSync, rmSync, existsSync, renameSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ------------------------------------------------------------------ machine rules (V3-SPEC section 8)
export const machine = {
  load() {
    const out = Bun.spawnSync(['uptime']).stdout.toString();
    const m = out.match(/load averages?:\s*([\d.]+),?\s+([\d.]+),?\s+([\d.]+)/);
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  },
  utcMinutes(d = new Date()) { return d.getUTCHours() * 60 + d.getUTCMinutes(); },
  /** [v3:fix] the tightened caps (V3-SPEC 8, after the 12:06Z freeze): start at 5-minute load <= 14, stop above 18. */
  inQuietWindow(d = new Date()) { const m = machine.utcMinutes(d); return m >= 14 * 60 || m < 2 * 60; },
  async gate({ log = console.error } = {}) {
    const t0 = Date.now();
    for (;;) {
      const l5 = machine.load()[1];
      const quiet = machine.inQuietWindow();
      const max = 14, hard = 18;
      if (l5 <= max) return l5;
      if (l5 > hard) throw new Error(`5-minute load ${l5} > ${hard}: heavy step stopped (V3-SPEC 8)`);
      if (Date.now() - t0 > 600000) throw new Error(`5-minute load stayed ${l5} > ${max} for 10 min`);
      log(`[machine] load ${l5} > ${max}${quiet ? ' (quiet window)' : ''}; waiting 30 s`);
      await Bun.sleep(30000);
    }
  },
};

// ------------------------------------------------------------------ build
/** Bundle an HTML entry (default src/anime/index.html) into outdir with Bun. Keeps the last good build on failure. */
export async function build({ entry = join(ROOT, 'src/anime/index.html'), outdir, minify = false, strict = false, quiet = true, only = null, files = null } = {}) {
  const t0 = performance.now();
  const reg = join(ROOT, 'scripts/anime/registry.js');
  // [v3:foundation] the module registry is generated per build (a Bun plugin serves src/anime/world/registry.js from
  // memory): with `only`, just those modules are bundled, so another package's half-edited file cannot break your build.
  const plugins = [];
  if (existsSync(reg) && entry.startsWith(join(ROOT, 'src/anime'))) {
    const m = await import(reg); m.writeRegistry();
    let mods = m.listModules();
    if (only && only.length) mods = mods.filter(([n]) => only.includes(n));
    const body = 'export const MODULE_LOADERS = {\n' + mods.map(([n, p]) => `  ${JSON.stringify(n)}: () => import(${JSON.stringify(p)}),`).join('\n') + '\n};\n';
    plugins.push({ name: 'klc-registry', setup(b) { b.onLoad({ filter: /[\\/]src[\\/]anime[\\/]world[\\/]registry\.js$/ }, () => ({ contents: body, loader: 'js' })); } });
  }
  const tmp = outdir + '.tmp';
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  let res;
  let define; try { define = (await import(join(ROOT, 'scripts/anime/buildinfo.js'))).buildDefines(ROOT); } catch { /* no stamp: reports say 'dev' */ }   // [contrib] core/buildinfo.js
  try { res = await Bun.build({ entrypoints: [entry], outdir: tmp, minify, sourcemap: 'linked', target: 'browser', splitting: true, plugins, define, ...(files ? { files } : {}) }); }   // [jpyc] `files`: absolute path -> contents, Bun's in-memory overrides (a test builds the app with another data file, without touching the tree)
  catch (e) { res = { success: false, logs: e && Array.isArray(e.errors) && e.errors.length ? e.errors : [e] }; }   // Bun throws an AggregateError ("Bundle failed"): its .errors carry the real messages and positions
  if (!res.success) {
    const msg = res.logs.map((l) => String(l?.message ?? l) + (l?.position ? ` (${l.position.file}:${l.position.line}: ${String(l.position.lineText || '').trim().slice(0, 160)})` : '')).join('\n').slice(0, 3000);
    rmSync(tmp, { recursive: true, force: true });
    if (!strict && existsSync(join(outdir, 'index.html'))) { console.error(`[build] failed; reusing the last good build in ${outdir}\n${msg}`); return { outdir, reused: true }; }
    throw new Error('anime build failed:\n' + msg);
  }
  // [ship:integrate] Bun can write the HTML's <script src> for the wrong chunk (scripts/anime/html-entry.js)
  try { const { fixHtmlEntry } = await import(join(ROOT, 'scripts/anime/html-entry.js')); for (const f of fixHtmlEntry(res.outputs)) if (!quiet) console.error(`[build] fixed ${f.html}: ${f.from} -> ${f.to}`); } catch (e) { console.error('[build] html entry check', e.message); }
  rmSync(outdir, { recursive: true, force: true }); renameSync(tmp, outdir);
  try { const { installTitleAssets } = await import(join(ROOT, 'scripts/anime/title-assets.js')); installTitleAssets(outdir, ROOT); } catch (e) { console.error('[build] title assets', e.message); }
  if (!quiet) console.error(`[build] ${outdir} in ${Math.round(performance.now() - t0)} ms`);
  return { outdir, reused: false, ms: Math.round(performance.now() - t0) };
}

// ------------------------------------------------------------------ static server
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.bin': 'application/octet-stream', '.f32': 'application/octet-stream', '.map': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
function inside(base, rel) { const p = normalize(join(base, rel)); return p.startsWith(base + '/') || p === base ? p : null; }
/** Serve dist at / and the project's data/ at /data/. Binds 127.0.0.1:<port> only. */
export function serve({ port, dist, data = join(ROOT, 'data'), extra = {} } = {}) {
  const server = Bun.serve({
    port, hostname: '127.0.0.1',
    async fetch(req) {
      const p = decodeURIComponent(new URL(req.url).pathname);
      let file = null;
      for (const [prefix, base] of Object.entries(extra)) if (p.startsWith(prefix)) file = inside(base, p.slice(prefix.length));
      if (!file && p.startsWith('/data/')) file = inside(data, p.slice(6));
      if (!file) file = inside(dist, p === '/' ? 'index.html' : p.slice(1));
      if (!file) return new Response('forbidden', { status: 403 });
      const f = Bun.file(file);
      if (!(await f.exists())) return new Response('not found', { status: 404 });
      const ext = file.slice(file.lastIndexOf('.'));
      return new Response(f, { headers: { 'content-type': TYPES[ext] || f.type, 'cache-control': 'no-store' } });
    },
  });
  return { server, url: `http://127.0.0.1:${server.port}/`, stop: () => server.stop(true) };
}

// ------------------------------------------------------------------ chrome
export async function launch({ quiet = true, args = [] } = {}) {
  // [v3:fix] one headless Chrome machine-wide: only under tools/anime/gate.sh chrome (it exports KLC_GATE=1 and holds the lock)
  if (process.env.KLC_GATE !== '1') throw new Error('launch(): run this through tools/anime/gate.sh chrome <cmd> (V3-SPEC section 8)');
  const profile = join(ROOT, 'dist/.chrome-' + process.pid);
  const chrome = Bun.spawn([CHROME, '--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1920,1080', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...args, 'about:blank'],
  { stdout: 'ignore', stderr: 'pipe' });
  // [fix:leak] Chrome can close its stderr and keep running, re-parented to launchd (seen 2026-10-05: idle orphans for hours),
  // so the spawned PID is not enough: every process on this profile goes, then the profile.
  const kill = () => {
    try { chrome.kill(9); } catch { /* gone */ }
    try { Bun.spawnSync(['pkill', '-9', '-f', '--', `user-data-dir=${profile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`]); } catch { /* none left */ }   // (anchored: .chrome-12 is not .chrome-123)
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* ok */ }
  };
  process.on('exit', kill);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { kill(); process.exit(130); });
  let wsUrl = null, buf = '';
  const reader = chrome.stderr.getReader();
  // [fix:leak] the endpoint is also in <profile>/DevToolsActivePort ("<port>\n<path>"): use it when stderr closes before naming it
  const fromPortFile = () => { try { const [port, path] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n'); return port && path ? `ws://127.0.0.1:${port.trim()}${path.trim()}` : null; } catch { return null; } };
  while (!wsUrl) {
    const { value, done } = await reader.read();
    if (done) {
      for (let i = 0; i < 50 && !wsUrl; i++) { wsUrl = fromPortFile(); if (!wsUrl) await Bun.sleep(200); }
      if (!wsUrl) { kill(); throw new Error('chrome exited early:\n' + buf); }
      break;
    }
    buf += new TextDecoder().decode(value); wsUrl = buf.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
  }
  (async () => { while (!(await reader.read()).done); })();
  const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const wsClosed = new Promise((r) => ws.addEventListener('close', r, { once: true }));
  let id = 0; const pending = new Map(), logs = new Map(), listeners = new Map();   // [v4:phone] listeners: CDP events by method
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method && listeners.has(m.method)) for (const fn of listeners.get(m.method)) fn(m.params, m.sessionId);
    const L = m.sessionId && logs.get(m.sessionId);
    if (!L) return;
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description).join(' ');
      L.push({ type: m.params.type, text: text.slice(0, 800) });
      if (!quiet) console.error(`[page ${m.params.type}] ${text.slice(0, 300)}`);
    }
    if (m.method === 'Runtime.exceptionThrown') L.push({ type: 'exception', text: (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 1200) });
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') L.push({ type: 'log-error', text: `${m.params.entry.text} ${m.params.entry.url ?? ''}`.slice(0, 500) });
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId && { sessionId }) }));
  });
  async function page({ width = 1280, height = 720, dpr = 1 } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    logs.set(sessionId, []);
    const S = (m, p) => send(m, p, sessionId);
    await S('Runtime.enable'); await S('Page.enable'); await S('Log.enable').catch(() => {});
    await S('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false, screenWidth: width, screenHeight: height });
    return {
      S, get logs() { return logs.get(sessionId); },
      errors() { return logs.get(sessionId).filter((l) => l.type === 'error' || l.type === 'exception' || l.type === 'log-error'); },
      async goto(url) { logs.set(sessionId, []); await S('Page.navigate', { url }); },
      async eval(expr) {
        const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).slice(0, 1500));
        return r.result.value;
      },
      async waitFor(expr, { timeout = 300000, poll = 250 } = {}) {
        const t0 = Date.now();
        for (;;) {
          let v = false; try { v = await this.eval(expr); } catch { /* page not ready */ }
          if (v) return v;
          const ex = logs.get(sessionId).find((l) => l.type === 'exception');
          if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${expr}` + (ex ? `\n${ex.text}` : ''));
          await Bun.sleep(poll);
        }
      },
      async frames(n = 3) { await this.eval(`new Promise(r => { let k = ${n}; const f = () => (--k <= 0 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`); },
      async shot(file) {
        const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const buf = Buffer.from(data, 'base64');
        if (file) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, buf); }
        return buf;
      },
    };
  }
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };
  // [fix:leak] Browser.close makes Chrome end its own helper processes; kill() stays as the backstop (its pkill cannot run inside
  // bun test, where Bun.spawnSync fails on this machine)
  const close = async () => {
    try { send('Browser.close').catch(() => {}); await Promise.race([wsClosed, Bun.sleep(2000)]); } catch { /* gone */ }
    try { ws.close(); } catch { /* ok */ }
    kill();
  };
  return { page, on, close };
}

export function listWorldModules() {
  const dir = join(ROOT, 'src/anime/world');
  return readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'layout.js' && f !== 'registry.js').map((f) => f.slice(0, -3));
}
