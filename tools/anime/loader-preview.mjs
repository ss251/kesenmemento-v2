// [loader] The real loading screen and title screen without the world: src/anime/index.html built with tools/anime/loader-preview-main.js standing in for main.js, and served on YOUR port.
//   env -u NODE_OPTIONS bun tools/anime/loader-preview.mjs --port 9435 [--mock-runner path/to/still.png --mock-label]    (Ctrl-C to stop)
//   http://127.0.0.1:9435/?p=0.55            the loader at 55 %          &state=loaded  the title screen          &state=playing  after the hand-off          &lang=en  &phone=1
// --mock-runner <png>: replaces the ship's sheet with one still, in the page's own DOM, and adds a 「申請用イメージ」 tag.
// That mock is not part of the app.
import { join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { serve, ROOT } from './cdp.mjs';

const a = process.argv.slice(2), arg = (k, d = null) => { const i = a.indexOf('--' + k); return i >= 0 ? (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : '1') : d; };
const port = Number(arg('port', 9435));
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const STUB = join(ROOT, 'tools/anime/loader-preview-main.js');

export async function buildPreview(outdir) {
  const { writeRegistry } = await import(join(ROOT, 'scripts/anime/registry.js')); writeRegistry();
  const res = await Bun.build({ entrypoints: [join(ROOT, 'src/anime/index.html')], outdir, minify: false, target: 'browser', splitting: false,
    plugins: [
      { name: 'loader-preview-stub', setup(b) { b.onResolve({ filter: /(^|[\\/])main\.js$/ }, () => ({ path: STUB })); } },
      (await import(join(ROOT, 'scripts/anime/optional-meme.js'))).optionalMemePlugin(ROOT),
    ] });
  if (!res.success) throw new Error('preview build failed:\n' + res.logs.map((l) => l.message ?? l).join('\n'));
  const { installTitleAssets } = await import(join(ROOT, 'scripts/anime/title-assets.js')); installTitleAssets(outdir, ROOT);
  return res;
}

if (import.meta.main) {
  const dist = join(ROOT, `dist/loader-preview-${port}`);
  await buildPreview(dist);
  const extra = {};
  const mock = arg('mock-runner');
  if (mock) extra['/mock/'] = resolve(mock, '..');
  const srv = serve({ port, dist, extra });
  console.log(`loader preview: ${srv.url}  (dist ${dist})${mock ? '  mock runner: /mock/' + mock.split('/').pop() : ''}`);
  process.on('SIGINT', () => { srv.stop(); process.exit(0); });
}
