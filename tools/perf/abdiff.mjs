// [perf] Pixel A/B of a toggle in shot mode (tools/perf/abdiff.page.js): the same frame with and without the change, per view.
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/perf/abdiff.mjs --toggle singlepass|ndsort [--views a;b;c] [--port 9447] [--nobuild]
// A view is a ?cam= spec (main.js camSpec): 'hero', 'walk', 'tour:market', 'x,y,z>lx,ly,lz' ... Prints one JSON line per view.
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { build, serve, launch, ROOT } from '../anime/cdp.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9447));
const toggle = arg('toggle', 'singlepass');
const views = arg('views', 'hero;walk;tour:market;tour:pier7;tour:kanae;420,40,60>340,4,-25').split(';');
// --params-a / --params-b: compare two page loads (URL switches, e.g. twosided=0 against the default) instead of an in-page toggle; the
// frames are 640x360 read back from the page (shot mode is deterministic: a load against itself is the noise floor)
const pa = arg('params-a'), pb = arg('params-b');
const dist = join(ROOT, `dist/anime-${port}`);
if (arg('nobuild') !== '1') await build({ outdir: dist });
const srv = serve({ port, dist });
const b = await launch();
try {
  const p = await b.page({ width: 1280, height: 720, dpr: 1 });
  if (pa !== null || pb !== null) {
    const grab = async (v, extra) => {
      await p.goto(`${srv.url}index.html?shot=1&w=640&h=360&cam=${encodeURIComponent(v)}${extra ? '&' + extra : ''}`);
      await p.waitFor('window.__ready === true', { timeout: 300000 });
      return p.eval(`(() => { window.__explore?.settle?.(); const c = window.__ctx, r = c.renderer, gl = r.getContext(), W = r.domElement.width, H = r.domElement.height;
        c.pipeline.render(c.scene, c.camera, c.sunDir, c.time); c.pipeline.render(c.scene, c.camera, c.sunDir, c.time);
        const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let s = ''; for (let i = 0; i < px.length; i += 32768) s += String.fromCharCode.apply(null, px.subarray(i, i + 32768)); return btoa(s); })()`);
    };
    const cmp = (x, y) => { let changed = 0, max = 0, sum = 0; for (let i = 0; i < x.length; i += 4) { const d = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2])); if (d > 2) changed++; if (d > max) max = d; sum += d; } return { changed, maxDiff: max, meanDiff: +(sum / (x.length / 4)).toFixed(4) }; };
    for (const v of views) {
      const A = Buffer.from(await grab(v, pa), 'base64'), A2 = Buffer.from(await grab(v, pa), 'base64'), B = Buffer.from(await grab(v, pb), 'base64');
      console.log(JSON.stringify({ view: v, a: pa, b: pb, pixels: A.length / 4, ...cmp(A, B), noise: cmp(A, A2), errors: p.errors().length }));
    }
    await b.close(); srv.stop(); process.exit(0);
  }
  for (const v of views) {
    await p.goto(`${srv.url}index.html?shot=1&w=1280&h=720&cam=${encodeURIComponent(v)}`);
    await p.waitFor('window.__ready === true', { timeout: 300000 });
    await p.eval('window.__explore?.settle?.(); 1');
    await p.eval(readFileSync(join(ROOT, 'tools/perf/abdiff.page.js'), 'utf8'));
    const r = await p.eval(`window.__abdiff(${JSON.stringify(toggle)})`);
    console.log(JSON.stringify({ toggle, view: v, ...r, errors: p.errors().length }));
  }
} finally { await b.close(); srv.stop(); }
process.exit(0);
