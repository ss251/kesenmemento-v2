// [loader] Makes the screen-size copy of the ONE official Hoya Boya pose that approval level A would carry along the loading bar (docs/loading/RUNNER.md).
//
//   env -u NODE_OPTIONS bun tools/anime/hoya-runner-asset.mjs --pose 15-10 --src /path/to/the/official/15-10.png [--height 360] [--to data/hoyaboya-dev]
//
// The official files are 3 to 5 thousand pixels tall (a 46 MB bitmap in memory); the loader shows the figure about 80 px tall, so the page gets one proportional, lossless resample
// (Lanczos3, RGBA, no palette, no sharpening, no crop, no recolour, no mirror: the manual's rules about colour, balance, pose and expression are not touched). The original's SHA-256
// and the copy's are written to NOTICE.md beside it, so a test can prove which official file it is. The copy lives in data/hoyaboya-dev/ (served on localhost only, never staged)
// while the city has not approved; with approval it moves to src/anime/assets/hoyaboya/ and runner.json's hoya.mode becomes "still".
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const a = process.argv.slice(2), arg = (k, d = null) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const ROOT = resolve(import.meta.dir, '../..');
const pose = arg('pose'), src = arg('src'), height = Number(arg('height', 360)), to = resolve(ROOT, arg('to', 'data/hoyaboya-dev'));
if (!pose || !src) { console.error('usage: --pose 15-10 --src <official png> [--height 360] [--to data/hoyaboya-dev]'); process.exit(2); }
const orig = readFileSync(src), sha = (b) => createHash('sha256').update(b).digest('hex');
const meta = await sharp(orig).metadata();
const out = await sharp(orig).resize({ height, kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: false }).toBuffer();
const om = await sharp(out).metadata();
mkdirSync(to, { recursive: true });
writeFileSync(join(to, 'runner-a.png'), out);
const aspect = +(om.width / om.height).toFixed(4);
writeFileSync(join(to, 'NOTICE.md'), `# Hoya Boya (海の子 ホヤぼーや): the screen-size copy of one official pose, NOT under this project's MIT licence

- **What:** \`runner-a.png\`, a ${om.width} x ${om.height} px proportional, lossless resample of the city's official illustration **NO.${pose}** (${meta.width} x ${meta.height} px). Nothing else was done to it.
- **Source:** the city's published set, https://www.kesennuma.miyagi.jp/sec/s084/030/010/010/20160921145744.html (the variation ZIPs), downloaded 2026-10-07.
- **Original SHA-256:** \`${sha(orig)}\`
- **Copy SHA-256:** \`${sha(out)}\`
- **Owner and terms:** © 気仙沼市. 「「ホヤぼーや」のデザインと名称は、気仙沼市が商標登録しております。また、「ホヤぼーや」に関する著作権、使用権は気仙沼市に属します。」 Moving it along the loading bar is a 動画 use: it needs the city's prior approval (取扱要綱 第2条, 様式第1号). Until an approval is on file this copy is OFF in production: runner.json has hoya.mode "off", and this folder is not staged by server/app/stage.sh. \`?hoya=run\` shows it on localhost only.
- **Credit (mandatory, unaltered; デザインマニュアル 2026-05-20, p.4):** 気仙沼市観光キャラクター「海の子 ホヤぼーや」
`);
console.error(`runner-a.png ${om.width}x${om.height} (${out.length} bytes), aspect ${aspect}`);
console.log(JSON.stringify({ pose, aspect, width: om.width, height: om.height, sha: sha(orig) }));
