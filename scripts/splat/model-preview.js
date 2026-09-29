// Before/after preview renders of the model splat in headless Chrome + Spark, and a QA record.
//   env -u NODE_OPTIONS nice -n 15 taskpolicy -b bun scripts/splat/model-preview.js [--raw <brush ply>] [--out raw/work/model/preview]
// Writes <out>/{before_oblique,after_oblique,after_top,after_portal}.png and <out>/qa.json, and copies qa into
// data/splats/splats.json (model.qa) when that file exists.
import { resolve, join, relative } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import sharp from "sharp";
import { shoot, buildPreview } from "./preview/shoot.js";
import { readRadHeader } from "./splats-json.js";
import { readFileSync } from "node:fs";

const ROOT = resolve(import.meta.dir, "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]]] : acc), []));
const W = join(ROOT, "raw/work/model");
const out = resolve(args.out ?? join(W, "preview"));
const latest = () => readdirSync(join(W, "brush/out")).filter((f) => /^model_\d+\.ply$/.test(f)).map((f) => join(W, "brush/out", f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const raw = resolve(args.raw ?? latest());
const rel = (p) => "/project/" + relative(ROOT, p);
const tf = rel(join(W, "final/clean_report.json"));
const rad = rel(join(ROOT, "data/splats/model.rad"));

const views = {
  oblique: "cam=0,2.1,2.5&look=0,0,0.1&fov=45",
  top: "cam=0,3.6,0.001&look=0,0,0&fov=45",
  portal: "cam=-0.9,0.55,1.0&look=0.2,0.02,-0.1&fov=55",
};
const jobs = [
  [join(out, "before_oblique.png"), `splat=${rel(raw)}&tf=${tf}&${views.oblique}&wait=3000`],
  [join(out, "after_oblique.png"), `splat=${rad}&paged=1&tf=${tf}&${views.oblique}&wait=5000`],
  [join(out, "after_top.png"), `splat=${rad}&paged=1&tf=${tf}&${views.top}&wait=5000`],
  [join(out, "after_portal.png"), `splat=${rad}&paged=1&tf=${tf}&${views.portal}&wait=5000`],
  [join(out, "before_portal.png"), `splat=${rel(raw)}&tf=${tf}&${views.portal}&wait=3000`],
];
await buildPreview();
const res = await shoot(jobs);
for (const r of res) {
  const { data, info } = await sharp(r.out).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let s = 0, s2 = 0; const n = info.width * info.height;
  for (let i = 0; i < n; i++) { const l = 0.2126 * data[3 * i] + 0.7152 * data[3 * i + 1] + 0.0722 * data[3 * i + 2]; s += l; s2 += l * l; }
  r.meanLum = +(s / n).toFixed(2); r.lumStd = +Math.sqrt(s2 / n - (s / n) ** 2).toFixed(2);
  r.out = relative(ROOT, r.out);
}
const radShot = res.find((r) => r.out.endsWith("after_oblique.png"));
const radCount = readRadHeader(readFileSync(join(ROOT, "data/splats/model.rad"))).count;
const qa = { when: new Date().toISOString(), radLoadedInSpark: !!(radShot?.ready && !radShot.errors.length), radCount, note: "paged .rad reports numSplats 0 until pages stream; radCount is from the index", shots: res };
await Bun.write(join(out, "qa.json"), JSON.stringify(qa, null, 1));
const sj = join(ROOT, "data/splats/splats.json");
if (existsSync(sj)) { const j = await Bun.file(sj).json(); j.model.qa = qa; await Bun.write(sj, JSON.stringify(j, null, 1) + "\n"); }
console.log(JSON.stringify(qa.shots.map((r) => ({ out: r.out, ready: r.ready, n: r.numSplats, lum: r.meanLum, std: r.lumStd, err: r.errors.length }))));
