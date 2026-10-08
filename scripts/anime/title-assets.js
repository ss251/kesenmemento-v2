// The title's posters and font subsets are named from the inlined stylesheet. Bun hashes the
// preload <link>s and leaves the <style> urls alone, so after a build the font-face urls are
// pointed at those hashed files and the posters are copied to assets/loader/ under their own names.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FONTS = ['zen-maru-700', 'zen-maru-900', 'dela-gothic-one'];

export function installTitleAssets(outdir, root) {
  const src = join(root, 'src/anime/assets/loader');
  if (!existsSync(src)) return;
  const dst = join(outdir, 'assets/loader');
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) if (/\.(avif|webp|woff2)$/.test(name)) cpSync(join(src, name), join(dst, name));
  const htmlPath = join(outdir, 'index.html');
  if (!existsSync(htmlPath)) return;
  let html = readFileSync(htmlPath, 'utf8');
  let changed = false;
  for (const base of FONTS) {
    const hashed = html.match(new RegExp(`\\./(${base}-[a-z0-9]+\\.woff2)`));
    const from = `./assets/loader/${base}.woff2`;
    if (hashed && html.includes(from)) { html = html.replaceAll(from, `./${hashed[1]}`); changed = true; }
  }
  if (changed) writeFileSync(htmlPath, html);
}
