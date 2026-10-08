// [r3:2] The vegetation-green scan of the GSI aerial photo over the accuracy cells (scripts/anime/enrich/green.js): lists the lots whose interior is dark vegetation (ghost-lot leads) and writes
// data/anime/green-flags.json, which build-layout.js reads for its recolour gate. ADVISORY: check every lead on an Earth top view AND an oblique (o0 / o180) before writing remove: true.
//   env -u NODE_OPTIONS bun tools/anime/green-scan.mjs [--cell c2] [--write] [--all]
// --write rewrites data/anime/green-flags.json (the flagged lots of every cell); --cell limits the printout; --all includes lots that touch another lot (slivers; skipped by default).
// Left out: the PIER7 / plaza / fish-market area of the photo-survey workflow (x -80..200, z 0..140).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { orthoSampler } from './earth-ref.mjs';
import { ROOT } from './cdp.mjs';
import { scanGreen, GREEN } from '../../scripts/anime/enrich/green.js';

const arg = process.argv.slice(2), has = (k) => arg.includes('--' + k), val = (k) => { const i = arg.indexOf('--' + k); return i >= 0 ? arg[i + 1] : null; };
const L = await import(join(ROOT, 'src/anime/world/layout.js'));
const cells = JSON.parse(readFileSync(join(ROOT, 'data/anime/cells.json'), 'utf8')).cells;
const cellOf = (x, z) => Object.entries(cells).find(([k, c]) => k !== 'pier7' && x >= c.bbox[0] && x < c.bbox[2] && z >= c.bbox[1] && z < c.bbox[3])?.[0] || null;
const inSouthShore = (l) => l.obb.cx >= -80 && l.obb.cx <= 200 && l.obb.cz >= 0 && l.obb.cz <= 140;
const bb = [Infinity, Infinity, -Infinity, -Infinity]; for (const c of Object.values(cells)) { bb[0] = Math.min(bb[0], c.bbox[0]); bb[1] = Math.min(bb[1], c.bbox[1]); bb[2] = Math.max(bb[2], c.bbox[2]); bb[3] = Math.max(bb[3], c.bbox[3]); }
const sampler = await orthoSampler(bb[0] - 20, bb[1] - 20, bb[2] + 20, bb[3] + 20);
const lots = L.LOTS.filter((l) => cellOf(l.obb.cx, l.obb.cz));
const found = scanGreen(lots, sampler, { skip: inSouthShore });
const byId = new Map(L.LOTS.map((l) => [l.id, l]));
const rows = found.map((f) => ({ ...f, cell: cellOf(byId.get(f.id).obb.cx, byId.get(f.id).obb.cz), x: Math.round(byId.get(f.id).obb.cx), z: Math.round(byId.get(f.id).obb.cz) }));
const show = rows.filter((r) => (has('all') || !r.touches) && (!val('cell') || r.cell === val('cell')));
console.log(`${lots.length} lots scanned in ${Object.keys(cells).length - 1} cells (rule: lum < ${GREEN.lumMax}, G - R >= ${GREEN.gOverR}, G > B, ${GREEN.share * 100} % of pixels); ${rows.length} flagged, ${rows.filter((r) => r.touches).length} of them slivers touching another lot`);
for (const r of show) console.log(`${r.cell}\t${r.id}\t${r.kind}\t${r.area} m2\t(${r.x}, ${r.z})\tlum ${r.lum}\tgreen ${Math.round(r.share * 100)} %${r.touches ? '\ttouches' : ''}`);
if (has('write')) {
  const flagged = {}; for (const r of rows.sort((a, b) => (a.id < b.id ? -1 : 1))) flagged[r.id] = { cell: r.cell, kind: r.kind, area: r.area, lum: r.lum, share: r.share, touches: r.touches };
  writeFileSync(join(ROOT, 'data/anime/green-flags.json'), JSON.stringify({ note: 'ADVISORY ghost-lot leads: lots whose GSI aerial interior is dark vegetation green (tools/anime/green-scan.mjs, scripts/anime/enrich/green.js). build-layout.js fails an override that recolours one of them (not a sliver: touches) unless its src names an oblique view (o0 / o180 / l45) or a ground photo; remove: true is always allowed.', rule: GREEN, flagged }, null, 1) + '\n');
  console.log('wrote data/anime/green-flags.json', Object.keys(flagged).length);
}
