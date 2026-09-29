// [v3:integrate] Contact sheet: tile PNGs into one image for review (no GPU).
//   env -u NODE_OPTIONS bun tools/anime/sheet.mjs --out dist/qa3/sheet.png [--cols 2] [--w 960] a.png b.png ...
import sharp from 'sharp';

const argv = process.argv.slice(2);
const opt = { cols: 2, w: 960, out: 'sheet.png' };
const files = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i]; else files.push(argv[i]); }
const cols = Number(opt.cols), w = Number(opt.w);
const tiles = await Promise.all(files.map(async (f) => { const img = sharp(f); const m = await img.metadata(); const h = Math.round(w * m.height / m.width); return { buf: await img.resize(w, h).png().toBuffer(), h }; }));
const rowH = Math.max(...tiles.map((t) => t.h));
const rows = Math.ceil(tiles.length / cols);
const comp = tiles.map((t, i) => ({ input: t.buf, left: (i % cols) * (w + 4), top: Math.floor(i / cols) * (rowH + 4) }));
await sharp({ create: { width: cols * (w + 4) - 4, height: rows * (rowH + 4) - 4, channels: 3, background: '#222' } }).composite(comp).png().toFile(opt.out);
console.log(opt.out);
