// [v3:life] Shared helpers for the v3 capture scripts (stills.js, film.js): build the anime app on a private port,
// open it in the one headless Chrome (real GPU via tools/anime/cdp.mjs), and the machine rules of V3-SPEC section 8.
// Launch every capture through the gate:  tools/anime/gate.sh chrome env -u NODE_OPTIONS bun scripts/render/stills.js ...
import { join } from 'node:path';
import { build, serve, launch, ROOT } from '../../tools/anime/cdp.mjs';

export const SIZES = { preview: [960, 540], '1080': [1920, 1080], '4k': [3840, 2160] };
/** Until the machine coordinator's caps expire, nothing above 1920x1080 may render on this machine. */
export const CAPS_UNTIL = Date.parse('2026-10-01T00:00:00Z');
export function sizeAllowed(size, now = Date.now()) {
  const [w, h] = SIZES[size] || [0, 0];
  if (!w) return { ok: false, reason: `unknown size ${size}` };
  if (now < CAPS_UNTIL && (w > 1920 || h > 1080)) return { ok: false, reason: `${size} is a GPU job: blocked by the machine caps until 2026-10-01 00:00Z (V3-SPEC section 8); use --size 1080 or preview` };
  return { ok: true };
}
export function loadAvg5() { const m = Bun.spawnSync(['sysctl', '-n', 'vm.loadavg']).stdout.toString().match(/[\d.]+/g) || []; return Number(m[1] || 0); }

/** Open the app. q: extra URL params (object). Returns { page, close, url }. */
export async function openApp({ port = 8814, width = 1920, height = 1080, q = {}, nobuild = false, only = null } = {}) {
  if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
  const dist = join(ROOT, `dist/anime-${port}`);
  if (!nobuild) { const r = await build({ outdir: dist, only }); if (r.reused) console.log('build failed; reusing the last good build'); }
  const srv = serve({ port, dist });
  const browser = await launch({ quiet: true });
  let page;
  try {
    page = await browser.page({ width, height });
    const params = new URLSearchParams({ shot: '1', w: String(width), h: String(height), q: 'high', credit: '1', ...q });
    if (only) params.set('only', only.join(','));
    await page.goto(`${srv.url}index.html?${params}`);
    await page.waitFor('window.__ready === true', { timeout: 280000 });
  } catch (e) { await browser.close(); srv.stop(); throw e; }
  return { page, url: srv.url, close: async () => { await browser.close(); srv.stop(); } };
}
export { ROOT };
