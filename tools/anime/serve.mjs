// [v3:foundation] Dev server for the anime app on YOUR package port (V3-SPEC section 8): builds src/anime into
// dist/anime-<port> and serves it (+ /data/). Stop it when you are done (Ctrl-C); never leave it running.
//   env -u NODE_OPTIONS bun tools/anime/serve.mjs --port 8811 [--watch]      then open http://127.0.0.1:8811/
// --watch rebuilds when src/anime changes (the page must be reloaded by hand).
import { join } from 'node:path';
import { watch } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';

const i = process.argv.indexOf('--port');
const port = i > 0 ? Number(process.argv[i + 1]) : 8811;
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const dist = join(ROOT, `dist/anime-${port}`);
console.log(JSON.stringify(await build({ outdir: dist, quiet: false })));
const srv = serve({ port, dist });
console.log(`serving ${srv.url}  (dist ${dist})`);
if (process.argv.includes('--watch')) {
  let t = null;
  watch(join(ROOT, 'src/anime'), { recursive: true }, (ev, f) => {
    if (f && f.endsWith('registry.js')) return;
    clearTimeout(t); t = setTimeout(async () => { try { const r = await build({ outdir: dist }); console.log('rebuilt', r.ms, 'ms'); } catch (e) { console.error(e.message); } }, 300);
  });
}
process.on('SIGINT', () => { srv.stop(); process.exit(0); });
