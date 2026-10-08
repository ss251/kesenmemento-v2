// [play:courses] 16:10 card stills for the あそぶ hub. WebKit, canvas only.
//   tools/anime/gate.sh run env -u NODE_OPTIONS bun tools/anime/play-courses-art.mjs [--port 9475]
import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9475));
if (port < 9475 || port > 9479) throw new Error('courses lane ports are 9475-9479');
const W = 960, H = 600;
const out = join(ROOT, 'dist/perf/course-art');
mkdirSync(out, { recursive: true });

const SRC = join(ROOT, 'tools/perf/wk/wks.swift'), BIN = join(ROOT, 'dist/perf/wks');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
  mkdirSync(join(ROOT, 'dist/perf'), { recursive: true });
  const r = Bun.spawnSync(['swiftc', '-O', SRC, '-o', BIN]);
  if (r.exitCode !== 0) throw new Error('swiftc failed: ' + r.stderr.toString().slice(0, 2000));
}
const dist = join(ROOT, `dist/anime-${port}`);
if (arg('nobuild') !== '1' || !existsSync(join(dist, 'index.html'))) console.error(JSON.stringify(await build({ outdir: dist, quiet: true })));
const srv = serve({ port, dist });

const workdir = join(ROOT, 'dist/perf/wk-courses-art-' + process.pid);
rmSync(workdir, { recursive: true, force: true });
const url = `${srv.url}index.html?shot=1&w=${W}&h=${H}&t=0&q=high&lang=ja`;
const proc = Bun.spawn([BIN, url, workdir, String(W), String(H)], { stdout: 'pipe', stderr: 'pipe' });
const wk = open(workdir);

const VIEWS = {
  anba: { id: 'anba', cam: '168,46,-18>150,42,-8' },
  minato: { id: 'minato', cam: '42,4.2,122>14.1,6.2,115.6' },
  harbour: { id: 'harbour', cam: '152,2.8,-10>164.5,1.6,-1.9' },
};

async function grab(name) {
  const v = VIEWS[name];
  const png = await wk.eval(`
    window.__lifeSet && window.__lifeSet('hiru');
    window.__race.world.setRun(${JSON.stringify(v.id)}, 0);
    window.__camSpec(${JSON.stringify(v.cam)});
    window.__raf.step(6);
    window.__camSpec(${JSON.stringify(v.cam)});
    window.__raf.step(1);
    const c = document.querySelector('#scene');
    return c.toDataURL('image/png');
  `, 180);
  const file = join(out, 'course-' + name + '.png');
  writeFileSync(file, Buffer.from(String(png).replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.error('saved', file, statSync(file).size);
  return file;
}

try {
  const t0 = Date.now();
  const r = await wk.ready(600);
  console.error('ready', Date.now() - t0, JSON.stringify(r));
  const only = arg('only');
  const names = only ? only.split(',') : ['anba', 'minato', 'harbour'];
  for (const name of names) await grab(name);
  const errs = (await wk.console()).filter((l) => /^error|onerror|unhandled/.test(l)).slice(0, 6);
  console.error('errors', JSON.stringify(errs));
} finally {
  try { await wk.quit(); } catch { /* gone */ }
  try { proc.kill(9); } catch { /* gone */ }
  rmSync(workdir, { recursive: true, force: true });
  srv.stop();
}
