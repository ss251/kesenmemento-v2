// [sys:5] Override values for `height` or `storeys` whose `src` cites a Google Earth oblique. Kesennuma has no 3D buildings in Earth (the 2026-03-11
// aerial image is draped on the terrain), so the obliques carry no height: what looks like height is the lean of the source image. Each flagged value must
// be re-derived from shadow length or lean through the calibrated 2026-03-11 scene (tools/anime/earth-ref.mjs EARTH_SCENE, `--heights`), from ground
// photos, the GSI footprints or OSM building:levels, and its src reworded.
//   env -u NODE_OPTIONS bun tools/anime/flag-oblique-heights.mjs [--json out.json] [--quiet]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('../../', import.meta.url).pathname, DIR = join(ROOT, 'data/anime/overrides');
/** a src that reads a height or storey count off an Earth oblique view (o0 o90 o180 o270 l45 l225, "oblique", "Earth 3D") */
export const OBLIQUE = /\b(o0|o90|o180|o270|l45|l225|o\d{1,3}\s*\/\s*o\d{1,3})\b|oblique|Earth 3D|Google Earth 3D|north wall|east wall|south wall|west wall/i;
export function flagged(files = readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const out = [];
  for (const f of files.sort()) {
    const d = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
    for (const sec of ['lots', 'newLots']) (d[sec] || []).forEach((o, i) => {
      if (o.height == null && o.storeys == null) return;
      if (!OBLIQUE.test(o.src || '')) return;
      out.push({ file: f, ref: `${f}#${sec}/${i}`, id: o.id, height: o.height ?? null, storeys: o.storeys ?? null, kind: o.kind ?? null, src: o.src });
    });
  }
  return out;
}
if (import.meta.main) {
  const a = process.argv.slice(2), list = flagged();
  const byFile = {}; for (const o of list) byFile[o.file] = (byFile[o.file] || 0) + 1;
  console.log(`${list.length} override heights / storeys cite an Earth oblique (re-derive them):`, JSON.stringify(byFile));
  if (!a.includes('--quiet')) for (const o of list) console.log(`${o.ref}\t${o.id}\t${o.height != null ? o.height + ' m' : ''}${o.storeys != null ? ' ' + o.storeys + 'F' : ''}\t${o.src.slice(0, 110)}`);
  const i = a.indexOf('--json'); if (i >= 0) writeFileSync(a[i + 1], JSON.stringify(list, null, 1));
}
