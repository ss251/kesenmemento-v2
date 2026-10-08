// [perf] Tables for docs/perf/BASELINE.md and RESULTS.md from the harness's summary.json files (tools/perf/run.mjs, wk-run.mjs).
//
//   bun tools/perf/report.mjs table <dir>[,<dir>...]                    one row per config and scenario (the summary columns)
//   bun tools/perf/report.mjs split <dir>                               CPU ms per frame by system, per config and scenario
//   bun tools/perf/report.mjs compare <before dir> <after dir>          before -> after for each config and scenario
//   <dir> holds <config>/summary.json (dist/perf/<label>)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { mdRow, MD_HEAD } from './stats.mjs';

const [cmd, a, b] = process.argv.slice(2);
const f = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '–' : Number(v).toFixed(d));
const ORDER = ['desktop', 'retina', 'phone', 'webkit-desktop', 'webkit-phone'];
function load(dir) {
  const out = {};
  for (const c of readdirSync(dir).sort((x, y) => (ORDER.indexOf(x) + 99 * (ORDER.indexOf(x) < 0)) - (ORDER.indexOf(y) + 99 * (ORDER.indexOf(y) < 0)))) {
    const p = join(dir, c, 'summary.json');
    if (existsSync(p)) out[c] = JSON.parse(readFileSync(p, 'utf8'));
  }
  return out;
}
// the systems of the CPU split: the main loop's sections and the wrapped systems, the rest summed as "other updates"
const GROUPS = [
  ['sim', ['player', 'physics', 'explore:drive', 'life:tour', 'upd:harness']],
  ['streaming', ['explore:stream', 'stream:commit']],
  ['batching', ['batching', 'stream:cull']],
  ['labels', ['labels']],
  ['HUD', ['hud', 'hud:explore-ui', 'hud:life']],
  ['life (people, sound, season)', ['life:cast', 'life:sound', 'life:season', 'upd:life']],
  ['world updates', ['upd:harbor', 'upd:ship', 'upd:water', 'upd:environment', 'upd:town', 'upd:landmarks', 'upd:explore', 'upd:main', 'explore:labels+ui']],
  ['audio', ['audio']],
  ['sky + view', ['sky', 'view']],
  ['render submit', ['render']],
  ['shadow submit', ['render:shadow']],
];
if (cmd === 'table') {
  const rows = [];
  for (const dir of a.split(',')) for (const [c, s] of Object.entries(load(dir))) for (const [sc, r] of Object.entries(s.scenarios)) rows.push(mdRow(c, sc, r, { programs: r.programs }));
  console.log(MD_HEAD + '\n' + rows.join('\n'));
} else if (cmd === 'split') {
  const head = '| config | scenario | ' + GROUPS.map((g) => g[0]).join(' | ') + ' | other | total |';
  const rows = [head, '|' + '---|'.repeat(GROUPS.length + 4)];
  for (const [c, s] of Object.entries(load(a))) for (const [sc, r] of Object.entries(s.scenarios)) {
    const by = r.cpu.by || {}; let used = 0;
    const cells = GROUPS.map(([, keys]) => { const v = keys.reduce((t, k) => t + (by[k]?.mean || 0), 0); used += v; return f(v, 2); });
    rows.push(`| ${c} | ${sc} | ${cells.join(' | ')} | ${f(r.cpu.mean - used, 2)} | ${f(r.cpu.mean, 2)} |`);
  }
  console.log(rows.join('\n'));
} else if (cmd === 'compare') {
  const A = load(a), B = load(b);
  const rows = ['| config | scenario | fps | interval p50 | p95 | p99 | max | >33 ms | >50 ms | >100 ms | GPU p50 / p95 ms | CPU mean ms | calls mean |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  const ab = (x, y, d = 1) => `${f(x, d)} → **${f(y, d)}**`;
  for (const c of Object.keys(B)) for (const sc of Object.keys(B[c].scenarios)) {
    const x = A[c]?.scenarios?.[sc], y = B[c].scenarios[sc]; if (!x) continue;
    rows.push(`| ${c} | ${sc} | ${ab(x.fps, y.fps)} | ${ab(x.interval?.p50, y.interval?.p50)} | ${ab(x.interval?.p95, y.interval?.p95)} | ${ab(x.interval?.p99, y.interval?.p99)} | ${ab(x.interval?.max, y.interval?.max, 0)} | ${x.hitches.over33} → **${y.hitches.over33}** | ${x.hitches.over50} → **${y.hitches.over50}** | ${x.hitches.over100} → **${y.hitches.over100}** | ${x.gpu ? `${f(x.gpu.p50)} / ${f(x.gpu.p95)}` : 'n/a'} → **${y.gpu ? `${f(y.gpu.p50)} / ${f(y.gpu.p95)}` : 'n/a'}** | ${ab(x.cpu.mean, y.cpu.mean)} | ${ab(x.calls?.mean, y.calls?.mean, 0)} |`);
  }
  console.log(rows.join('\n'));
} else {
  console.error('usage: report.mjs table|split|compare ...'); process.exit(2);
}
