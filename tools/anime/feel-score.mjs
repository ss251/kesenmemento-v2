// [feel] Score the feel probe's saved recordings again (dist/feel/<label>/<device>-<fps>.json) without Chrome: the same analysis as the
// probe (feel-metrics.mjs analyseRun), into docs/play/shots/feel/<label>-metrics.json. For a run the machine gate stopped part-way (every
// session's frames are saved as it ends), and for re-scoring old runs after a metric changes.
//   env -u NODE_OPTIONS bun tools/anime/feel-score.mjs <label> [--out docs/play/shots/feel/<label>-metrics.json]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './cdp.mjs';
import { toFrames, analyseRun } from './feel-metrics.mjs';

const label = process.argv[2];
if (!label) { console.error('usage: feel-score.mjs <label>'); process.exit(2); }
const i = process.argv.indexOf('--out');
const out = i > 0 ? process.argv[i + 1] : join(ROOT, 'docs/play/shots/feel', `${label}-metrics.json`);
const dir = join(ROOT, 'dist/feel', label);
if (!existsSync(dir)) { console.error('no recordings in', dir); process.exit(2); }
const report = { label, scored: new Date().toISOString(), from: 'saved recordings (tools/anime/feel-score.mjs)', sessions: [] };
for (const f of readdirSync(dir).filter((n) => /^(phone|desktop)-\d+(-cpu\d+)?(-clip)?\.json$/.test(n)).sort()) {
  const [dev, fps] = f.replace('.json', '').split('-');
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const frames = toFrames(j.frames.flat(), j.fields);
  report.sessions.push({ dev, fps: Number(fps), file: f, frames: frames.length, metrics: analyseRun(frames, j.marks) });
}
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
