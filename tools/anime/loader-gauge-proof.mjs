// [loader] The gauge, proven in a browser: does the number agree with the fill through the long steps? (core/loadbar.js, docs/loading/README.md "The gauge")
//
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/loader-gauge-proof.mjs --port 9572 [--target app|preview] [--rate 6] [--label after] [--out DIR] [--dpr 2]
//   (--scale 0.5 shortens the preview target's stalls)
//   env -u NODE_OPTIONS bun tools/anime/loader-gauge-proof.mjs --from DIR [--out DIR2]       draw and audit a run saved earlier (no browser)
//
// What it does. It loads the page on an iPhone-shaped viewport (393 x 852) with the CPU throttled (Emulation.setCPUThrottlingRate, default 6x: a slow phone, whose long steps block the
// page's thread for seconds) and records a CDP SCREENCAST, which is the compositor's own picture: it does not wait for the page's thread, so it shows what a visitor sees through a stall.
// Every frame is cropped to the gauge as it arrives. Afterwards:
//   * the number in each frame is READ from the picture (template matching against the page's own rendering of 0..100, taken through the same screencast), never from the DOM;
//   * the fill's edge is MEASURED from the picture (the right end of the solid 山吹: the runner covers the last stretch of it, an offset taken once from a static page at 25/50/75 %);
//   * an audit counts the frames in which the two disagree by more than 3 points, and in which the number is not round(mark * 100) of the page's own load log;
//   * strips like the conductor's: a row every 250 ms, the time, the picture, what was read, and a marker where the page's main thread was blocked (long tasks).
// --target app (default) is the real build's cold load, run through the same stalls a visitor has; --target preview drives the real plan's stages on the loader preview (no world) with
// busy loops as the stalls. Run it from a worktree of main for the "before" strip (the old bar), from the branch for the "after".
// Out: DIR/run.json, DIR/frames/*.jpg (the crops), DIR/templates/*.png, DIR/audit.json, DIR/strip-*.png. Machine rules: through tools/anime/gate.sh chrome (cdp.mjs refuses without it).
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import sharp from 'sharp';
import { launch, serve, ROOT } from './cdp.mjs';
import { buildAndServe, phonePage, sleep } from './pad-lib.mjs';

const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const FROM = arg('from'), SCALE = Number(arg('scale', 1)), PORT = Number(arg('port', 9572)), TARGET = arg('target', 'app'), RATE = Number(arg('rate', 6)), DPR = Number(arg('dpr', 2)), LABEL = arg('label', 'run');
const OUT = arg('out', FROM || join(ROOT, 'dist/loader-gauge-proof', LABEL));
const VIEW = { width: 393, height: 852, dpr: DPR, insets: { top: 59, bottom: 34, left: 0, right: 0 } };
const FS = 1;             // screencast frames come at the CSS viewport's size, whatever the page's pixel ratio (DPR only sharpens what Chrome scales down)
const TOL = 3;            // points of percent: the most the number and the fill may differ in a frame outside a move
const MOVE_MS = 560;      // after a mark the fill is allowed this long to arrive (MARK_MS 420 + a frame or two)
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'));
const round = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// ------------------------------------------------------------------------------------------------ capture
/** The crop of a frame (device pixels) that holds the gauge with its runner, from the rects the page reports (CSS px). */
const cropOf = (r) => {
  const x0 = Math.max(0, Math.round((r.gauge.x - 8) * FS)), y0 = Math.max(0, Math.round((r.gauge.y - 4) * FS));
  const x1 = Math.min(VIEW.width * FS, Math.round((r.gauge.x + r.gauge.w + 16) * FS)), y1 = Math.min(VIEW.height * FS, Math.round((r.gauge.y + r.gauge.h + 18) * FS));   // (the runner overhangs the bar's end by 13 px, and bobs)
  return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
};

async function capture() {
  mkdirSync(join(OUT, 'frames'), { recursive: true }); mkdirSync(join(OUT, 'templates'), { recursive: true });
  const { buildPreview } = await import('./loader-preview.mjs');
  const pdist = join(ROOT, `dist/loader-preview-${PORT + 1}`); await buildPreview(pdist);
  const psrv = serve({ port: PORT + 1, dist: pdist });
  const app = TARGET === 'app' ? await buildAndServe(PORT, { minify: true }) : null;
  const browser = await launch();
  try {
    const page = await phonePage(browser, VIEW);
    await page.S('Page.enable');
    // ---- a frame source: the latest screencast frame, cropped; `frames` collects them while `casting`
    let casting = false, crop = null, latest = null, ready = null, latestN = 0, warned = 0, work = Promise.resolve(); const frames = [];   // ready: the newest frame whose crop is done
    browser.on('Page.screencastFrame', (p) => {
      page.S('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
      if (!crop) return;
      const t = p.metadata.timestamp * 1000, buf = Buffer.from(p.data, 'base64');
      const slot = { t, buf: null }; latest = slot; latestN++; if (casting) frames.push(slot);
      work = work.then(() => sharp(buf).extract(crop).jpeg({ quality: 92 }).toBuffer()).then((b) => { slot.buf = b; if (!ready || slot.t >= ready.t) ready = slot; }).catch(async (e) => { if (!warned++) console.error('crop failed:', e.message, JSON.stringify(crop), JSON.stringify(await sharp(buf).metadata().then((m) => [m.width, m.height]))); });
    });
    const cast = (on, every = 3) => page.S(on ? 'Page.startScreencast' : 'Page.stopScreencast', on ? { format: 'jpeg', quality: 82, maxWidth: VIEW.width * FS, maxHeight: VIEW.height * FS, everyNthFrame: every } : {}).catch(() => {});
    /** The frame that shows what the page has just been given: two rendered frames of the page, a moment, then the latest frame that arrived (a static page sends one frame per change: every = 1). */
    const settle = async () => { const n0 = latestN; await page.frames(2); for (let i = 0; i < 150 && latestN === n0; i++) await sleep(20); await sleep(120); await work; if (!ready) throw new Error('no screencast frame arrived'); return ready; };
    // ---- the static page: rects, the templates of the number (0..100) and the runner's offset, all through the screencast
    await page.goto(`${psrv.url}index.html?sky=14:00&capture=1&tframe=0&lang=ja`);
    await page.waitFor('document.body.dataset.ready === "1"', { timeout: 30000 });
    const rects = await page.eval(`(() => { const R = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }; return { gauge: R('.gauge'), bar: R('.bar'), pct: R('.pct') }; })()`);
    crop = cropOf(rects); await cast(true, 1);
    const numBox = numberBox(rects);
    const templates = [];
    console.error('rects', JSON.stringify(rects), 'crop', JSON.stringify(crop));
    for (let v = 0; v <= 100; v++) {
      await page.eval(`document.getElementById('ld-pct').firstChild.nodeValue = '${v}'; 1`);
      const f = await settle(); templates.push(f.buf);
    }
    await cast(false);
    templates.forEach((b, v) => writeFileSync(join(OUT, 'templates', `${String(v).padStart(3, '0')}.jpg`), b));
    // the runner's offset: the preview at rest at 25, 50, 75 %; the fill is measured left of the runner by a constant
    await page.goto(`${psrv.url}index.html?sky=14:00&lang=ja`); await page.waitFor('!!window.__preview', { timeout: 30000 });
    await cast(true, 1); const rest = [];
    for (const p of [0.25, 0.5, 0.75]) {
      await page.eval(`window.__preview.set(${p}, 'x'); 1`); await sleep(1400);
      const f = await settle(); const E = await edgeOf(f.buf, rects); rest.push({ p, edge: E });
    }
    await cast(false);
    const offsets = rest.filter((r) => r.edge !== null).map((r) => r.p * rects.bar.w - r.edge);
    console.error('templates done; runner offsets', JSON.stringify(rest));
    // ---- the run
    const url = TARGET === 'app' ? `${app.srv.url}index.html?sky=14:00&lang=ja` : `${psrv.url}index.html?sky=14:00&lang=ja`;
    await page.S('Emulation.setCPUThrottlingRate', { rate: RATE });
    await page.S('Page.addScriptToEvaluateOnNewDocument', { source: `window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}` });
    frames.length = 0; latest = null;
    await page.goto(url);
    await page.waitFor(`!!document.querySelector('.gauge')`, { timeout: 120000, poll: 100 });
    casting = true; await cast(true, 3);
    let stalls = null;
    if (TARGET === 'app') await page.waitFor(`document.body.classList.contains('loaded')`, { timeout: 900000, poll: 1000 });
    else stalls = await drivePreview(page);
    await sleep(2800);
    casting = false; await cast(false); await work;
    const dump = await page.eval(`({ origin: performance.timeOrigin, now: performance.now(), log: window.__loadLog || [], lt: window.__lt || [], loaded: document.body.classList.contains('loaded'), errors: (window.__errors || []).length })`);
    const errs = page.errors().map((e) => e.text).filter((t) => !/\/api\/live|fonts\.(googleapis|gstatic)\.com/.test(t));
    const kept = frames.filter((f) => f.buf);
    kept.forEach((f, i) => writeFileSync(join(OUT, 'frames', `${String(i).padStart(5, '0')}.jpg`), f.buf));
    const run = { label: LABEL, target: TARGET, rate: RATE, dpr: DPR, view: VIEW, rects, crop, numBox, offsets, rest, origin: dump.origin, endMs: dump.now, loadLog: dump.log, longTasks: TARGET === 'app' ? dump.lt : stalls.map(([a, d]) => [a, d]), errors: errs, pageErrors: dump.errors, stalls, frames: kept.map((f) => f.t) };
    writeFileSync(join(OUT, 'run.json'), JSON.stringify(run));
    console.log(`captured ${kept.length} frames over ${round((kept.at(-1).t - kept[0].t) / 1000)} s; ${dump.log.length} marks; longest tasks ${dump.lt.map((l) => Math.round(l[1])).sort((a, b) => b - a).slice(0, 5)} ms; errors ${errs.length}`);
  } finally { await browser.close(); app?.srv.stop(); psrv.stop(); }
}

/** The preview target: the stages of the real plan, each begun as main.js's begin() does (the mark, then a paint), then a busy loop as long as the stage's weight says (units of 100 ms of a real load). */
async function drivePreview(page) {
  const plan = await page.eval(`window.__plan.keys.map((k) => [k, window.__plan.weight(k)])`), stalls = [];
  for (const [k, w] of plan) {
    const ms = Math.round(w * 100 * SCALE);
    await page.eval(`window.__preview.begin(${JSON.stringify(k)}, ${ms}); new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))`);
    const [start, dur] = await page.eval(`(() => { const t = performance.now(); while (performance.now() - t < ${ms}); return [t, performance.now() - t]; })()`);
    stalls.push([start, dur, k]);   // (page ms: the busy loop is the blocked thread, like a long task)
  }
  await page.eval(`window.__preview.loaded()`); return stalls;
}

// ------------------------------------------------------------------------------------------------ reading a frame
/** Where the number sits in the crop: the gauge's right end, 70 CSS px wide, as tall as the row. Device pixels, inside the crop. */
function numberBox(r) {
  const c = cropOf(r), x1 = Math.round((r.pct.x + r.pct.w + 2) * FS) - c.left, x0 = Math.max(0, x1 - Math.round(70 * FS)), y0 = Math.round((r.pct.y - 3) * FS) - c.top, y1 = Math.round((r.pct.y + r.pct.h + 3) * FS) - c.top;
  return { x0, x1, y0, y1 };
}
const raw = async (buf) => { const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
/** The white of the number as a bitmask of the box. */
async function numberMask(buf, box) {
  const { data, w } = await raw(buf), out = new Uint8Array((box.x1 - box.x0) * (box.y1 - box.y0)); let k = 0;
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) { const i = (y * w + x) * 3; out[k++] = data[i] > 205 && data[i + 1] > 205 && data[i + 2] > 195 ? 1 : 0; }
  return out;
}
const hamming = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] ^ b[i]; return d; };
/** The right end of the solid 山吹 along the bar's centre line, in CSS px from the bar's left edge (null when there is none). The runner hides the last stretch of it. */
async function edgeOf(buf, r) {
  const { data, w, h } = await raw(buf), c = cropOf(r), yc = Math.round((r.bar.y + r.bar.h / 2) * FS) - c.top, x0 = Math.round(r.bar.x * FS) - c.left;
  let best = null;
  for (const y of [yc - 1, yc, yc + 1]) {
    if (y < 0 || y >= h) continue;
    for (let x = w - 1; x >= x0; x--) { const i = (y * w + x) * 3; if (data[i] > 190 && data[i + 1] > 120 && data[i + 1] < 220 && data[i + 2] < 110) { if (best === null || x > best) best = x; break; } }
  }
  return best === null ? null : (best - x0) / FS;
}

// ------------------------------------------------------------------------------------------------ analysis
async function analyze(dir) {
  const run = rd(join(dir, 'run.json')), files = readdirSync(join(dir, 'frames')).filter((f) => f.endsWith('.jpg')).sort();
  const T = []; for (let v = 0; v <= 100; v++) T.push(await numberMask(readFileSync(join(dir, 'templates', `${String(v).padStart(3, '0')}.jpg`)), run.numBox));
  const offset = median(run.offsets);
  const t0 = run.frames[0], pageMs = (t) => t - run.origin;
  const pcts = (bar) => new Set([Math.round(bar * 100), Math.round((bar - 0.00005) * 100), Math.round((bar + 0.00005) * 100)]);   // (the page's log rounds a mark to 4 places: a mark at x.5 % may have been either side)
  const marks = run.loadLog.map((e) => ({ t: e.t, bar: e.bar, pcts: pcts(e.bar), pct: Math.round(e.bar * 100) })), lt = run.longTasks.map(([s, d]) => [s, s + d]);
  const markAt = (ms) => { let m = null; for (const k of marks) if (k.t <= ms) m = k; return m; };
  const rows = [];
  for (let i = 0; i < files.length; i++) {
    const buf = readFileSync(join(dir, 'frames', files[i])), ms = pageMs(run.frames[i]);
    const mask = await numberMask(buf, run.numBox); let best = -1, bd = 1e9, second = 1e9;
    for (let v = 0; v <= 100; v++) { const d = hamming(mask, T[v]); if (d < bd) { second = bd; bd = d; best = v; } else if (d < second) second = d; }
    const area = mask.length, ink = mask.reduce((s, x) => s + x, 0);
    const num = ink > 12 && bd < 0.18 * Math.max(ink, 40) + 6 ? best : null;   // (a gauge that has faded or is not yet drawn reads as nothing)
    const edge = await edgeOf(buf, run.rects), edgePct = edge === null || offset === null ? null : Math.min(100, ((edge + offset) / run.rects.bar.w) * 100);
    rows.push({ i, ms, num, edgePct, blocked: lt.some(([a, b]) => ms >= a && ms <= b), mark: markAt(ms) });
  }
  // the audit: frames from the first mark until the hand-over fades the gauge (the first frame after the last mark in which no number can be read)
  const lastSet = marks.at(-1)?.t ?? 0, firstSet = marks[0]?.t ?? 0;
  const fade = rows.find((r) => r.ms > lastSet + MOVE_MS && r.num === null)?.ms ?? Infinity;
  const live = rows.filter((r) => r.ms >= firstSet + MOVE_MS && r.ms < fade && r.num !== null && r.edgePct !== null);
  const moving = (r) => marks.some((k) => r.ms >= k.t && r.ms < k.t + MOVE_MS);
  const settled = live.filter((r) => !moving(r));
  const gaps = settled.map((r) => Math.abs(r.edgePct - r.num));
  const off = settled.filter((r, k) => gaps[k] > TOL);
  // the number against the page's own load log: it says the latest mark, or (until a frame can paint the new one: the thread was blocked right after the mark) the mark before it. Anything else is a number nobody asked for.
  const idxAt = (ms) => { let m = -1; marks.forEach((k, i) => { if (k.t <= ms) m = i; }); return m; };
  const klass = (r) => { const i = idxAt(r.ms); return i < 0 ? 'mark' : marks[i].pcts.has(r.num) ? 'mark' : i > 0 && marks[i - 1].pcts.has(r.num) ? 'previous' : 'neither'; };
  const kinds = settled.map(klass), onPrevious = settled.filter((r, k) => kinds[k] === 'previous'), neither = settled.filter((r, k) => kinds[k] === 'neither');
  const stall = settled.filter((r) => r.blocked);
  const audit = { label: run.label, target: run.target, rate: run.rate, frames: rows.length, read: rows.filter((r) => r.num !== null).length, settledFrames: settled.length, blockedFrames: stall.length,
    offBy3: off.length, offBy3Blocked: off.filter((r) => r.blocked).length, maxGapPoints: round(Math.max(0, ...gaps)), medianGapPoints: round(median(gaps) ?? 0),
    numberOnPreviousMark: onPrevious.length, numberNeitherMark: neither.length, neitherWorst: neither.slice(0, 6).map((r) => ({ s: round(r.ms / 1000, 2), num: r.num, mark: r.mark?.pct, edge: round(r.edgePct), blocked: r.blocked })),
    offset: round(offset ?? 0), offsets: run.offsets.map((o) => round(o)), marks: marks.length, longestTasksMs: run.longTasks.map((l) => Math.round(l[1])).sort((a, b) => b - a).slice(0, 6),
    worst: off.sort((a, b) => Math.abs(b.edgePct - b.num) - Math.abs(a.edgePct - a.num)).slice(0, 8).map((r) => ({ s: round(r.ms / 1000, 2), num: r.num, edge: round(r.edgePct), blocked: r.blocked })) };
  writeFileSync(join(OUT, 'audit.json'), JSON.stringify(audit, null, 1));
  console.log(JSON.stringify(audit));
  await strips(dir, run, rows, files, lt);
  return audit;
}

// ------------------------------------------------------------------------------------------------ strips
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** A panel: rows every `step` ms from a to b (page ms), in `cols` columns; each row is the time, a marker where the thread was blocked, what was read, and the picture. */
async function panel(dir, run, rows, files, lt, a, b, { step = 250, cols = 2, scale = 1.5, name }) {
  const times = []; for (let t = a; t < b - 1; t += step) times.push(t);
  const per = Math.ceil(times.length / cols), cw = Math.round(run.crop.width * scale), ch = Math.round(run.crop.height * scale), lw = 110, gap = 16, W = cols * (lw + cw) + (cols + 1) * gap, H = per * (ch + 2) + 52;
  const comps = [], svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="${gap}" y="20" font-family="Helvetica" font-size="16" font-weight="700" fill="#17184B">${esc(`${run.label} · ${run.target} · CPU ${run.rate}x · ${round(a / 1000, 1)} to ${round(b / 1000, 1)} s · a row every ${step} ms`)}</text>`,
    `<text x="${gap}" y="38" font-family="Helvetica" font-size="12" fill="#595857">${esc('n = the number, read from the picture   b = the fill\'s edge, measured from the picture   red = the page\'s main thread was blocked')}</text>`];
  for (let k = 0; k < times.length; k++) {
    const t = times[k], col = Math.floor(k / per), row = k % per, x = gap + col * (lw + cw + gap), y = 46 + row * (ch + 2);
    let j = -1; for (let i = 0; i < rows.length; i++) if (rows[i].ms <= t) j = i; else break;
    if (j < 0) continue;
    const r = rows[j], blocked = lt.some(([s, e]) => t >= s && t <= e);
    svg.push(`<text x="${x}" y="${y + 18}" font-family="Helvetica" font-size="14" fill="#17184B">${round(t / 1000, 2).toFixed(2)}s</text>`);
    svg.push(`<text x="${x}" y="${y + 36}" font-family="Helvetica" font-size="12" fill="#595857">${r.num === null ? 'n –' : 'n ' + r.num}  ${r.edgePct === null ? 'b –' : 'b ' + Math.round(r.edgePct)}</text>`);
    if (blocked) svg.push(`<rect x="${x}" y="${y + 44}" width="${lw - 14}" height="14" rx="3" fill="#B7282E"/><text x="${x + 5}" y="${y + 55}" font-family="Helvetica" font-size="10" font-weight="700" fill="#ffffff">thread blocked</text>`);
    comps.push({ input: await sharp(join(dir, 'frames', files[j])).resize(cw, ch).toBuffer(), left: x + lw, top: y });
  }
  svg.push('</svg>');
  const out = join(OUT, `strip-${name}.png`);
  await sharp(Buffer.from(svg.join(''))).composite(comps).png().toFile(out);
  console.log('wrote', out);
}
async function strips(dir, run, rows, files, lt) {
  const dur = (run.frames.at(-1) - run.origin);
  const stalls = [...lt].map(([s, e]) => [s, e]).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]));
  const picked = [];
  for (const [s, e] of stalls) { if (picked.length >= 2) break; if (picked.every(([a]) => Math.abs(a - s) > 8000)) picked.push([s, e]); }
  let n = 1;
  for (const [s, e] of picked) {
    const a = Math.max(0, s - 1500), b = Math.min(dur, e + 1500);
    // the start of the stall, every 250 ms (the mark, the paint, then the thread goes); a long one also as a whole, coarser
    await panel(dir, run, rows, files, lt, a, Math.min(b, a + 12000), { name: `stall-${n}` });
    if (b - a > 14000) await panel(dir, run, rows, files, lt, a, b, { name: `stall-${n}-whole`, step: Math.ceil((b - a) / 44 / 250) * 250, cols: 2 });
    n++;
  }
  const lastSet = run.loadLog.at(-1)?.t ?? dur, lastStage = run.loadLog.at(-2)?.t ?? lastSet;
  await panel(dir, run, rows, files, lt, Math.max(0, lastStage - 1000), dur, { name: 'handoff', step: Math.max(250, Math.ceil((dur - lastStage + 1000) / 40 / 250) * 250), cols: 2 });   // (the last stage, the 100 %, the prompt)
  const first = run.loadLog[0]?.t ?? 0;
  await panel(dir, run, rows, files, lt, Math.max(0, first - 500), Math.min(dur, lastSet + 3000), { name: 'overview', step: Math.max(1000, Math.ceil((lastSet - first) / 160 / 250) * 250), cols: 4, scale: 1 });
}

if (FROM) { mkdirSync(OUT, { recursive: true }); await analyze(FROM); }
else { await capture(); await analyze(OUT); }
