// [ui-c2] Gated browser checks for the ui-c2 rows (the UI round notes (ui-c2, not included)): row 2 (phone-safe photo mode) and row 9 (loading), plus lane B's three requests for the intro card.
// Each step is one row's "Verify" column, run against a private build in headless Chrome. A script, not a bun:test file (see ui-c-check.mjs: `bun test` cannot spawn Chrome here).
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ui-c2-check.mjs [--port 9410] [--steps card,photocard,photo,load,load-async] [--out DIR] [--label NAME] [--nobuild] [--dist DIR] [--base-html FILE]
//
//   card   row 9: the intro card on a static page (the real index.html without the app): its height at 17 viewports x 5 font stacks x 3 label states must not change (before: 49 px of spread at desktop widths, 30 px at 414-480 px)
//   load   row 9 + lane B's requests: cold loads of the real app on a desktop and an iPhone-shaped page, sampled every 100 ms from navigation start: the card's height at 0.8 s and 3.3 s, when the
//          card was revealed against the fonts, the bar and the labels through the finishing steps (the page's own __loadLog), the network log (explore.json once), a compositor proof (the bar
//          changes in a screencast of the page while the main thread is blocked), #go focus (fine pointer yes, touch no), a touch swipe scrolls a 480x200 intro
//   photocard  row 2, the card's CSS on static pages (the real markup and stylesheet, no app): the preview is the photo's shape and the buttons are on screen at 8 viewports x 2 pictures
//   load-async  the same desktop load with ?compile=async (compileAsync waits for the programs): what the opt-in costs and buys
//   photo  row 2: on the phone tier the photo is 887x1920 at the screen's field of view with the klc-pose chunk, the card and the share sheet work through the real HUD, the process footprint
//          (macOS `footprint`, the Chrome tree: what the mobile review measured, +945 MB at 4K) stays within +100 MB of the no-photo footprint; a desktop keeps 4K
//
// Port 9410-9414 only (this lane's). --out DIR writes the numbers (ui-c2-check-<steps>.json) and the small screenshots there. --label tags a run (e.g. base: run this file from a worktree
// of main to get the "before" numbers; steps that need the new code are marked). Exit code 1 if any check fails.
import { join } from 'node:path';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { buildAndServe, launch, phonePage, setViewport, fingers, center, sleep, ROOT } from './pad-lib.mjs';
import { serve } from './cdp.mjs';
import { readPngPose } from '../../src/anime/ui/pngmeta.js';
import { createPhotoCard, PHOTO_CSS } from '../../src/anime/ui/photo-share.js';
import { makeDom } from '../../test/lib/mini-dom.js';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const PORT = Number(arg('port', 9410));
if (PORT < 9410 || PORT > 9414) throw new Error('ports 9410-9414 only (this lane\'s)');
const STEPS = String(arg('steps', 'card,load,photo')).split(',').map((s) => s.trim()).filter(Boolean);
const OUT = arg('out', '');
const LABEL = arg('label', '');
if (OUT) mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ a tiny assertion harness
const results = [];
let failed = 0;
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, ...(detail !== undefined && { detail }) });
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '   ' + JSON.stringify(detail) : ''}`);
  return !!ok;
}
/** An observation, not a check (the "before" numbers of a base run, a measurement the notes quote). */
const note = (name, detail) => { results.push({ name, note: true, detail }); console.log(`NOTE  ${name}   ${JSON.stringify(detail)}`); };
const equal = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? undefined : { got, want });
const save = (name, obj) => { if (OUT) writeFileSync(join(OUT, name), JSON.stringify(obj, null, 1)); };
const closePage = (page) => page.S('Page.close').catch(() => {});
/** Console errors and exceptions of the page, less the static server's 404 for /api/live (the app falls back to its saved sample) and Google Fonts (a machine without a network). */
const pageErrors = (page) => page.errors().map((e) => e.text).filter((t) => !/\/api\/live|fonts\.(googleapis|gstatic)\.com/.test(t));
const waitLoaded = (page, timeout = 300000) => page.waitFor("document.body.classList.contains('loaded')", { timeout });
const enter = async (page) => { await page.eval("document.getElementById('go').click()"); await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 }); };
const round1 = (v) => Math.round(v * 10) / 10;
/** A desktop-style viewport (pad-lib's setViewport is a mobile override with touch metrics). */
const setDesktopViewport = (page, w, h) => page.S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false, screenWidth: w, screenHeight: h });
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// ================================================================== row 9, the card on a static page
const VIEWPORTS = [[1440, 900], [1280, 720], [1024, 768], [768, 1024], [640, 800], [600, 800], [540, 800], [480, 800], [430, 932], [414, 896], [390, 844], [375, 667], [360, 740], [844, 390], [844, 340], [667, 375], [667, 300]];
// five font stacks that differ as much as system fonts can (the page's own fonts are two variables: --round and --sans)
const FONT_STACKS = [
  ['page', null],
  ['hiragino', ['"Hiragino Sans", sans-serif', '"Hiragino Sans", sans-serif']],
  ['arial', ['Arial, sans-serif', 'Arial, sans-serif']],
  ['courier', ['"Courier New", monospace', '"Courier New", monospace']],   // wide: the worst case for any line that depends on a width
  ['times', ['"Times New Roman", serif', '"Times New Roman", serif']],
];
const LABEL_STATES = [['loading', '読み込み中…', false], ['long label', '電線を張っています…', false], ['ready', '', true]];

/** The page's HTML with the app and the web-font link removed: the card alone, in whatever fonts the machine has. */
const cardPage = (html) => html.replace(/<script type="module"[^>]*><\/script>/, '').replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis[^>]*>/, '').replace(/<link rel="preconnect"[^>]*>/g, '');

async function cardMatrix(browser, srv, htmlText, name) {
  srv.pages.set('/card.html', cardPage(htmlText));
  const rows = [];
  const page = await browser.page({ width: 1440, height: 900, dpr: 1 });
  await page.goto(`${srv.url}card.html`);
  await page.waitFor("document.readyState === 'complete' && !!document.querySelector('#intro .board')", { timeout: 30000 });
  await page.eval("document.documentElement.classList.add('klc-card-ready')");   // (the hold is not what is measured here: its layout is)
  for (const [w, h] of VIEWPORTS) {
    await setDesktopViewport(page, w, h);
    await sleep(120);
    const heights = {};
    for (const [fname, stack] of FONT_STACKS) for (const [lname, label, loaded] of LABEL_STATES) {
      const r = await page.eval(`(() => {
        const root = document.documentElement, st = ${JSON.stringify(stack)};
        if (st) { root.style.setProperty('--round', st[0]); root.style.setProperty('--sans', st[1]); } else { root.style.removeProperty('--round'); root.style.removeProperty('--sans'); }
        document.body.classList.toggle('loaded', ${loaded});
        document.getElementById('loadlabel').textContent = ${JSON.stringify(label)};
        const b = document.querySelector('#intro .board').getBoundingClientRect(), g = document.getElementById('go').getBoundingClientRect(), f = document.querySelector('#intro .foot').getBoundingClientRect();
        return { h: b.height, go: [g.top, g.bottom, g.left, g.right], foot: [f.top, f.height], inside: g.bottom <= innerHeight + 0.5 && g.top >= -0.5 };
      })()`);
      heights[`${fname}/${lname}`] = r;
    }
    const hs = Object.values(heights).map((r) => r.h);
    rows.push({ w, h, min: round1(Math.min(...hs)), max: round1(Math.max(...hs)), spread: round1(Math.max(...hs) - Math.min(...hs)), heights: Object.fromEntries(Object.entries(heights).map(([k, r]) => [k, round1(r.h)])), goInside: Object.values(heights).every((r) => r.inside) });
  }
  await closePage(page);
  const worst = rows.reduce((a, r) => (r.spread > a.spread ? r : a), rows[0]);
  note(`card matrix (${name}): the largest spread of the card's height across fonts and labels`, { viewport: `${worst.w}x${worst.h}`, spread: worst.spread, perViewport: rows.map((r) => `${r.w}x${r.h}:${r.spread}`) });
  return rows;
}

async function stepCard({ browser, srv }) {
  const html = readFileSync(join(ROOT, 'src/anime/index.html'), 'utf8');
  const rows = await cardMatrix(browser, srv, html, 'this build');
  save('card-matrix.json', rows);
  for (const r of rows) check(`card ${r.w}x${r.h}: the card is ${r.min} px tall in every font and every label state (spread ${r.spread} px)`, r.spread <= 0.5, { min: r.min, max: r.max });
  for (const r of rows) if (r.h <= 460) check(`card ${r.w}x${r.h}: 「まちへ出る」 is inside the screen in every font and label state`, r.goInside, r.heights);
  if (arg('base-html') && existsSync(arg('base-html'))) {
    const base = await cardMatrix(browser, srv, readFileSync(arg('base-html'), 'utf8'), 'the old card');
    save('card-matrix-base.json', base);
  }
}

// ================================================================== row 2, the photo card's CSS on static pages
/** The card's real markup (the module run on a small DOM) and stylesheet, with a picture of the given size as a data URI: no app, no WebGL. */
async function photoCardPage(pw, ph) {
  const dom = makeDom();
  const card = createPhotoCard({ lang: 'ja', env: { doc: dom.document, nav: {}, win: { requestAnimationFrame: (f) => f() } } }).show({ w: pw, h: ph });
  const el = dom.document.getElementById('klc-photo');
  const png = await sharp({ create: { width: 64, height: Math.max(8, Math.round((64 * ph) / pw)), channels: 3, background: '#5a8fb0' } }).png().toBuffer();
  // (the small DOM keeps style as an object: the ratio the card sets on .pic is written into the markup here)
  const html = dom.serialize(el).replace('data-state="capturing"', 'data-state="ready"').replace('data-open="0"', 'data-open="1"').replace('<div class="pic">', `<div class="pic" style="--klc-photo-r: ${(pw / ph).toFixed(4)}">`).replace(/<img /, `<img src="data:image/png;base64,${png.toString('base64')}" `);
  card.close();
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>html,body{margin:0;height:100%;background:#7a8fb0}${PHOTO_CSS}</style><body>${html}</body>`;
}

async function stepPhotoCard({ browser, srv }) {
  const pics = [['portrait 887x1920', 887, 1920], ['landscape 1920x887', 1920, 887], ['tablet 1334x1920', 1334, 1920], ['tablet 1920x1334', 1920, 1334]];
  const views = [[390, 844], [375, 667], [430, 932], [844, 390], [667, 375], [820, 1180], [1180, 820], [360, 640]];
  const rows = [];
  const page = await browser.page({ width: 390, height: 844, dpr: 2 });
  for (const [pname, pw, ph] of pics) {
    srv.pages.set('/photo-card.html', await photoCardPage(pw, ph));
    await page.goto(`${srv.url}photo-card.html`);
    await page.waitFor("document.readyState === 'complete' && !!document.querySelector('#klc-photo .pic img')", { timeout: 20000 });
    for (const [w, h] of views) {
      await setDesktopViewport(page, w, h); await sleep(150);
      const r = await page.eval(`(() => { const q = (s) => document.querySelector(s).getBoundingClientRect(), c = q('#klc-photo .c'), p = q('#klc-photo .pic'), i = q('#klc-photo img'), b = q('#klc-photo [data-a="save"]'), x = q('#klc-photo [data-a="close"]');
        return { vw: innerWidth, vh: innerHeight, card: [c.left, c.top, c.right, c.bottom].map(Math.round), box: [Math.round(p.width * 10) / 10, Math.round(p.height * 10) / 10], img: [Math.round(i.width), Math.round(i.height)], ratio: p.width / p.height, save: [b.top, b.bottom, b.height], close: [x.height], scrollH: document.documentElement.scrollHeight }; })()`);
      const want = pw / ph;
      rows.push({ pic: pname, view: `${w}x${h}`, ...r, ok: Math.abs(r.ratio / want - 1) < 0.01 && r.card[0] >= 0 && r.card[1] >= 0 && r.card[2] <= r.vw && r.card[3] <= r.vh + 0.5 && r.save[1] <= r.vh && r.save[2] >= 44 && r.close[0] >= 44 && r.scrollH <= r.vh + 1 });
    }
  }
  await closePage(page);
  save('photo-card-geometry.json', rows);
  const bad = rows.filter((r) => !r.ok);
  check(`photocard: the preview has the photo's shape (within 1 %) and the whole card, the 44 px buttons included, is on screen at ${rows.length} picture/viewport pairs`, bad.length === 0, bad.slice(0, 4));
  note('photocard: the preview box (css px) for each picture on a phone, a phone on its side and a tablet', rows.filter((r) => ['390x844', '844x390', '820x1180'].includes(r.view)).map((r) => `${r.pic} @ ${r.view}: ${r.box[0]} x ${r.box[1]}`));
}

// ================================================================== the process footprint (what the mobile review measured)
const sh = async (cmd, args) => { const p = Bun.spawn([cmd, ...args], { stdout: 'pipe', stderr: 'ignore' }); const t = await new Response(p.stdout).text(); await p.exited; return t; };
async function chromeTree() {
  const tag = `.chrome-${process.pid}`;
  const out = await sh('ps', ['-axo', 'pid=,ppid=,rss=,command=']);
  const rows = out.split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], rss: +m[3], cmd: m[4] }));
  const set = new Set(rows.filter((r) => r.cmd.includes(tag) && !r.cmd.includes('--type=')).map((r) => r.pid));
  for (let grew = true; grew;) { grew = false; for (const r of rows) if (!set.has(r.pid) && set.has(r.ppid)) { set.add(r.pid); grew = true; } }
  for (const r of rows) if (r.cmd.includes(tag)) set.add(r.pid);
  return rows.filter((r) => set.has(r.pid));
}
/** The macOS physical footprint (MB) of these processes: it counts graphics memory, which the resident size does not. */
async function footprintOf(pids) {
  if (!pids.length) return null;
  try {
    const o = await sh('footprint', pids.flatMap((p) => ['-p', String(p)]));
    let mb = 0;
    for (const l of o.split('\n')) { const m = l.match(/^\S.*\[\d+\]:.*Footprint:\s+([\d.]+)\s*(KB|MB|GB)/); if (m) mb += +m[1] * (m[2] === 'GB' ? 1024 : m[2] === 'KB' ? 1 / 1024 : 1); }
    return Math.round(mb);
  } catch { return null; }
}
/** The whole Chrome tree, and the processes where a photo's memory lives (the GPU process and the page's renderers: a fast sampler for the peak). */
async function footprints() { const t = await chromeTree(); return { all: await footprintOf(t.map((r) => r.pid)), hot: t.filter((r) => /--type=(gpu-process|renderer)/.test(r.cmd)).map((r) => r.pid) }; }
const footprintMB = async () => (await footprints()).all;
/** Sample the hot processes' footprint back to back until stop() is called. */
async function samplePeak(hot) {
  const samples = []; let on = true; const t0 = Date.now();
  const loop = (async () => { while (on) { const v = await footprintOf(hot); if (v !== null) samples.push([Date.now() - t0, v]); } })();
  return { async stop() { on = false; await loop; return { peak: Math.max(0, ...samples.map((x) => x[1])), n: samples.length, ms: Date.now() - t0, samples }; } };
}
const gc = async (page) => { await page.eval('window.gc && gc()').catch(() => {}); await sleep(700); };

// ================================================================== row 2, photo mode
/** Bytes of the PNG in the card's <img> (an object URL): base64 out of the page in chunks. */
const cardPngBytes = async (page) => {
  const b64 = await page.eval(`(async () => { const img = document.querySelector('#klc-photo img'); const r = await fetch(img.src); const u = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); })()`);
  return new Uint8Array(Buffer.from(b64, 'base64'));
};
const pngSize = (u) => [new DataView(u.buffer, u.byteOffset).getUint32(16), new DataView(u.buffer, u.byteOffset).getUint32(20)];
const hfov = (v, a) => (2 * Math.atan(Math.tan((v * Math.PI) / 360) * a) * 180) / Math.PI;
const hudNote = (page) => page.eval(`(() => { const n = document.querySelector('#klc-ui .note'); return n ? { text: n.textContent, shown: n.classList.contains('show') } : null; })()`);
const instrumentRenders = (page) => page.eval(`(() => { const c = window.__ctx; window.__renders = []; if (!c.pipeline.__ui2) { const r0 = c.pipeline.render; c.pipeline.render = function (...a) { if (document.body.classList.contains('klc-photo')) window.__renders.push({ fov: c.camera.fov, aspect: c.camera.aspect, w: c.pipeline.size.x, h: c.pipeline.size.y, card: !!document.getElementById('klc-photo') }); return r0.apply(this, a); }; c.pipeline.__ui2 = 1; } return true; })()`);
const screenState = (page) => page.eval(`(() => { const c = __ctx, r = c.renderer.domElement; return { fov: c.camera.fov, aspect: c.camera.aspect, canvas: [r.width, r.height], pipe: [c.pipeline.size.x, c.pipeline.size.y], klcPhoto: document.body.classList.contains('klc-photo') }; })()`);

async function stepPhoto({ browser, srv, dist }) {
  const base = LABEL === 'base';   // run from a worktree of main: the same measurements of the OLD code ("before"); the checks that need the new code are skipped
  // ---------------------------------------------------------------- the phone tier
  const page = await phonePage(browser, { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  await page.goto(`${srv.url}index.html?fixtures=1`);
  await waitLoaded(page);
  await enter(page);
  await sleep(10000);   // streaming settles, the drone hovers: the footprint it holds is the no-photo footprint
  const q = await page.eval('({ tier: __ctx.quality.tier, phone: !!__ctx.quality.phone, hasPhoto: typeof window.__photo, ua: navigator.userAgent.includes("iPhone"), coarse: matchMedia("(pointer: coarse)").matches })');
  check('photo: the page is on the phone tier with a coarse pointer (the iPhone-shaped page)', q.tier === 'phone' && q.phone && q.coarse && q.hasPhoto === 'function', q);
  await instrumentRenders(page);
  const s0 = await screenState(page);
  note('photo: the screen before the photo', s0);
  if (OUT) { const { data } = await page.S('Page.captureScreenshot', { format: 'jpeg', quality: 70 }); writeFileSync(join(OUT, `photo-screen-390x844${LABEL ? '-' + LABEL : ''}.jpg`), Buffer.from(data, 'base64')); }

  // the no-photo footprint, and how much it moves by itself
  await gc(page);
  const idle = []; for (let i = 0; i < 5; i++) { idle.push(await footprintMB()); await sleep(1000); }
  const fp0 = median(idle);
  note('photo: the no-photo footprint of the Chrome tree (MB), five samples a second apart', { fp0, idle });

  // a capture only (a tool's call: no card, no download): the same work as the HUD's, the old way and the new way
  const photoRuns = [];
  const runs = 3;
  for (let i = 0; i < runs; i++) {
    await gc(page);
    const fp = await footprints(), hot0 = await footprintOf(fp.hot);
    const sampler = await samplePeak(fp.hot);
    const t = Date.now();
    const res = await page.eval(`window.__photo(1, { noDownload: true }).then((r) => r && ({ w: r.w, h: r.h, bytes: r.bytes, name: r.name, fov: r.fov ?? null, phone: r.phone ?? null, poseFov: r.pose && r.pose.fov }))`);
    const ms = Date.now() - t;
    await sleep(400);
    const peak = await sampler.stop();
    await sleep(1500);
    const after = await footprintMB();
    const st = await screenState(page);
    // the peak of the hot processes above where they stood, and the whole tree before and after
    photoRuns.push({ i: i + 1, res, ms, before: fp.all, hotBefore: hot0, hotPeak: peak.peak, samples: peak.n, after, peakAbove: peak.peak - hot0, afterAbove: after - fp.all, restored: st });
    note(`photo: capture ${i + 1} (${base ? 'the old code' : 'tool path'})`, photoRuns.at(-1));
  }
  // the working set of a photo, held still (the new code only): the page waits after the PNG is encoded, with the renderer, the pipeline and the camera at the photo's size, while the footprint
  // is read three times: a deterministic number where the sampler above can miss the instant of the peak
  const held = [];
  if (!base) for (let i = 0; i < 2; i++) {
    await gc(page);
    const fp = await footprints(), hot0 = await footprintOf(fp.hot);
    const pending = page.eval(`window.__heldAt = 0; window.__photo(1, { noDownload: true, hold: () => new Promise((r) => { window.__heldAt = Date.now(); window.__release = r; }) }).then((r) => r && ({ w: r.w, h: r.h }))`);
    await page.waitFor('!!window.__heldAt', { timeout: 30000, poll: 50 });
    const reads = []; for (let k = 0; k < 3; k++) reads.push(await footprintOf(fp.hot));
    const heldState = await screenState(page);
    await page.eval('window.__heldAt = 0; window.__release()');
    const res = await pending; await sleep(1500);
    held.push({ i: i + 1, hot0, reads, heldAbove: Math.max(...reads) - hot0, heldState, res });
    note(`photo: held capture ${i + 1}`, held.at(-1));
  }
  save(`photo-memory${LABEL ? '-' + LABEL : ''}.json`, { fp0, idle, photoRuns, held });
  const worstPeak = Math.max(...photoRuns.map((r) => r.peakAbove)), worstAfter = Math.max(...photoRuns.map((r) => r.afterAbove)), worstHeld = held.length ? Math.max(...held.map((h) => h.heldAbove)) : null;
  note(`photo: footprint above where it stood just before each photo: sampled peak +${worstPeak} MB (worst of ${runs}), held working set ${worstHeld === null ? 'n/a' : '+' + worstHeld + ' MB'}, settled +${worstAfter} MB`, { sampledPeaks: photoRuns.map((r) => r.peakAbove), held: held.map((h) => h.heldAbove), settled: photoRuns.map((r) => r.afterAbove) });
  if (base) {
    note('photo: the old code on the phone tier', { size: photoRuns[0].res && [photoRuns[0].res.w, photoRuns[0].res.h], peakAboveNoPhoto: worstPeak });
    await closePage(page);
    return;
  }
  check('photo: a capture on the phone tier is 887x1920 (the screen\'s aspect, 1920 px on the long side)', photoRuns.every((r) => r.res && r.res.w === 887 && r.res.h === 1920 && r.res.phone === true), photoRuns.map((r) => r.res));
  check('photo: the footprint stays within +100 MB of the no-photo footprint: the sampled peak of 3 photos in a row AND the held working set (it was +945 MB at 4K)', worstPeak <= 100 && worstHeld <= 100, { worstPeak, worstHeld, fp0 });
  check('photo: three photos in a row do not ratchet the footprint: each settles within 60 MB of where it stood before the photo, and the third no higher than the first + 30', photoRuns.every((r) => r.afterAbove <= 60) && photoRuns[2].afterAbove <= photoRuns[0].afterAbove + 30, photoRuns.map((r) => r.afterAbove));
  check('photo: the screen is restored after every photo (canvas, pipeline, field of view, aspect, no klc-photo class)', photoRuns.every((r) => JSON.stringify(r.restored.canvas) === JSON.stringify(s0.canvas) && JSON.stringify(r.restored.pipe) === JSON.stringify(s0.pipe) && Math.abs(r.restored.fov - s0.fov) < 1e-9 && Math.abs(r.restored.aspect - s0.aspect) < 1e-9 && !r.restored.klcPhoto), { s0, restored: photoRuns.map((r) => r.restored) });

  // the field of view the pipeline rendered the photo with, against the screen's
  const rd = await page.eval('window.__renders');
  check('photo: each photo is ONE render at 887x1920 (the main loop draws nothing meanwhile) with the SCREEN\'s vertical field of view and aspect', rd.length === runs + held.length && rd.every((r) => r.w === 887 && r.h === 1920 && Math.abs(r.fov - s0.fov) < 1e-9 && Math.abs(r.aspect - 887 / 1920) < 1e-9), { screen: [s0.fov, s0.aspect], rendered: rd.slice(0, 2) });
  const hs = hfov(s0.fov, s0.aspect), hp = hfov(rd[0].fov, rd[0].aspect);
  check(`photo: the picture is ${round1(hp)} degrees across and the screen ${round1(hs)} (it was ~120 against 48)`, Math.abs(hs - hp) < 0.05 && hp < 50, { screen: hs, photo: hp });

  // the real HUD path: the time sheet, a real tap on 写真, the card, the share sheet, 保存しました only after it resolves
  await page.eval(`(() => { window.__shared = null; window.__shareResolve = null; navigator.canShare = () => true; navigator.share = (d) => { window.__shared = { n: d.files.length, name: d.files[0].name, type: d.files[0].type, size: d.files[0].size, title: d.title }; return new Promise((res, rej) => { window.__shareResolve = res; window.__shareReject = rej; }); }; })()`);
  const f = fingers(page);
  let c = await center(page, '#klc-ui .pbar button[data-sheet="time"]'); await f.tap(c.x, c.y); await sleep(700);
  c = await center(page, '#klc-ui button[data-act="photo"]');
  check('photo: the 写真 pill is on screen in the open time sheet', !!c && c.w > 20, c);
  await f.tap(c.x, c.y);
  await page.waitFor("!!document.querySelector('#klc-photo')", { timeout: 15000 });
  const cap = await page.eval("(() => { const e = document.getElementById('klc-photo'), cs = getComputedStyle(e); return { state: e.dataset.state, open: e.dataset.open, z: cs.zIndex, rect: e.getBoundingClientRect().toJSON(), padHidden: window.__pad.hidden, suppressed: window.__pad.suppressed }; })()");
  check('photo: a tap on 写真 puts the card up at once, over everything, with the pad stepped aside', cap.z === '45' && cap.rect.width >= 389 && cap.rect.height >= 843 && cap.suppressed.includes('photo-card'), cap);
  await page.waitFor("document.getElementById('klc-photo')?.dataset.state === 'ready'", { timeout: 30000 });
  const ready = await page.eval(`(() => { const e = document.getElementById('klc-photo'), img = e.querySelector('img'), r = img.getBoundingClientRect(), p = e.querySelector('.pic').getBoundingClientRect(), b = e.querySelector('[data-a="save"]').getBoundingClientRect(), x = e.querySelector('[data-a="close"]').getBoundingClientRect();
    return { state: e.dataset.state, img: [img.naturalWidth, img.naturalHeight], shown: [Math.round(r.width), Math.round(r.height)], pic: [Math.round(p.width), Math.round(p.height)], save: { w: b.width, h: b.height, text: e.querySelector('[data-a="save"]').textContent, top: b.top, bottom: b.bottom }, close: { w: x.width, h: x.height }, vh: innerHeight, vw: innerWidth, title: [...e.querySelectorAll('h2 span')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.textContent) }; })()`);
  check('photo: the card shows the 887x1920 picture inside the screen, with a 44 px 保存・共有 button and a 閉じる button', ready.img[0] === 887 && ready.img[1] === 1920 && ready.save.h >= 44 && ready.close.h >= 44 && ready.save.bottom <= ready.vh && ready.save.text === '保存・共有' && ready.title[0] === '写真ができました', ready);
  const mid = await hudNote(page);
  check('photo: no 保存しました before the visitor has saved anything (and no 4K note on a phone)', !mid || !/保存しました|4K/.test(mid.text) || !mid.shown, mid);
  if (OUT) { const { data } = await page.S('Page.captureScreenshot', { format: 'jpeg', quality: 72 }); writeFileSync(join(OUT, 'photo-card-iphone-390x844.jpg'), Buffer.from(data, 'base64')); }
  // the picture itself: the PNG in the card has its pose chunk, the screen's field of view, and the screen's framing
  const bytes = await cardPngBytes(page);
  const [pw, ph] = pngSize(bytes), pose = readPngPose(bytes);
  check('photo: the PNG is 887x1920 and keeps its klc-pose chunk (heading, pitch, the screen\'s field of view, the mode, the time preset, the season)', pw === 887 && ph === 1920 && !!pose && Math.abs(pose.fov - s0.fov) < 0.01 && typeof pose.heading === 'number' && !!pose.mode && !!pose.timePreset && !!pose.season, { size: [pw, ph], pose });
  if (OUT) {
    // the screen and the picture side by side (the finding's own picture: they must frame the same view)
    const screen = await sharp(join(OUT, `photo-screen-390x844${LABEL ? '-' + LABEL : ''}.jpg`)).resize({ height: 760 }).toBuffer();
    const pic = await sharp(Buffer.from(bytes)).resize({ height: 760 }).jpeg({ quality: 80 }).toBuffer();
    const sm = await sharp(screen).metadata(), pm = await sharp(pic).metadata();
    await sharp({ create: { width: sm.width + pm.width + 30, height: 780, channels: 3, background: '#cfdcec' } }).composite([{ input: screen, left: 10, top: 10 }, { input: pic, left: sm.width + 20, top: 10 }]).jpeg({ quality: 78 }).toFile(join(OUT, 'photo-vs-screen-iphone-390x844.jpg'));
  }
  // a real tap on 保存・共有: the share sheet gets the PNG; 保存しました waits for it to resolve
  c = await center(page, '#klc-photo [data-a="save"]'); await f.tap(c.x, c.y);
  await page.waitFor('!!window.__shared', { timeout: 5000 });
  const sh = await page.eval('window.__shared');
  check('photo: the tap opens the share sheet with the PNG as a file (name, image/png, a size) and the app\'s title', sh.n === 1 && /^kesennuma-\d{4}-\w+\.png$/.test(sh.name) && sh.type === 'image/png' && sh.size > 100000 && sh.size === bytes.length && sh.title === '気仙沼リビングシティ', sh);
  await sleep(900);
  const waiting = await hudNote(page), openNow = await page.eval("document.getElementById('klc-photo')?.dataset.open");
  check('photo: while the share sheet is open nothing says 保存しました and the card is still up', openNow === '1' && (!waiting || !waiting.shown || !/保存しました/.test(waiting.text)), { note: waiting, open: openNow });
  await page.eval('window.__shareResolve()');
  await page.waitFor("(() => { const n = document.querySelector('#klc-ui .note'); return !!n && n.classList.contains('show') && /保存しました/.test(n.textContent); })()", { timeout: 5000 });
  const saved = await hudNote(page);
  await sleep(500);
  const gone = await page.eval("(() => { const e = document.getElementById('klc-photo'); return !e || e.dataset.open === '0'; })()");
  check('photo: once the share sheet has resolved the note says 保存しました and the card is gone', saved.shown && /保存しました/.test(saved.text) && gone, { saved, gone });
  const pad1 = await page.eval('window.__pad.suppressed');
  check('photo: the pad is back after the card', !pad1.includes('photo-card'), pad1);

  // the visitor dismisses the share sheet: the card stays, nothing is said
  await page.eval(`document.querySelector('#klc-ui .note')?.classList.remove('show')`);
  await page.eval(`window.__photo(1)`);   // (the HUD handler: the card path)
  await page.waitFor("document.getElementById('klc-photo')?.dataset.state === 'ready'", { timeout: 30000 });
  await page.eval('window.__shared = null'); c = await center(page, '#klc-photo [data-a="save"]'); await f.tap(c.x, c.y);
  await page.waitFor('!!window.__shared', { timeout: 5000 });
  await page.eval(`window.__shareReject(Object.assign(new Error('dismissed'), { name: 'AbortError' }))`);
  await sleep(800);
  const dis = await page.eval(`(() => { const e = document.getElementById('klc-photo'), n = document.querySelector('#klc-ui .note'); return { open: e && e.dataset.open, state: e && e.dataset.state, noteShown: !!n && n.classList.contains('show'), noteText: n && n.textContent }; })()`);
  check('photo: a dismissed share sheet leaves the card up and says nothing', dis.open === '1' && dis.state === 'ready' && !(dis.noteShown && /保存しました/.test(dis.noteText)), dis);
  // no share sheet in this browser: the same button downloads
  await page.eval(`(() => { delete navigator.share; navigator.canShare = undefined; window.__dl = []; const c0 = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__dl.push({ name: this.download, href: String(this.href).slice(0, 5) }); }; return true; })()`);
  const label = await page.eval("document.querySelector('#klc-photo [data-a=\"save\"]').textContent");
  c = await center(page, '#klc-photo [data-a="save"]'); await f.tap(c.x, c.y);
  await page.waitFor("window.__dl.length > 0", { timeout: 5000 });
  await page.waitFor("(() => { const n = document.querySelector('#klc-ui .note'); return !!n && n.classList.contains('show') && /保存しました/.test(n.textContent); })()", { timeout: 5000 });
  const dl = await page.eval('window.__dl');
  check('photo: without a share sheet the button downloads the PNG and then says 保存しました', dl.length === 1 && /^kesennuma-.*\.png$/.test(dl[0].name) && dl[0].href === 'blob:', { dl, label });
  // a phone on its side: 1920 x 887 at the screen's 55 degrees
  await page.eval('window.__renders.length = 0');
  await setViewport(page, { width: 844, height: 390, dpr: 3, insets: { top: 0, bottom: 21, left: 47, right: 47 } }); await sleep(1200);
  const ls = await screenState(page);
  const lres = await page.eval(`window.__photo(1, { noDownload: true }).then((r) => r && ({ w: r.w, h: r.h, fov: r.fov }))`);
  const lrd = await page.eval('window.__renders');
  check('photo: a phone in landscape takes a 1920x887 picture at the screen\'s 55 degrees', lres && lres.w === 1920 && lres.h === 887 && lrd.length === 1 && Math.abs(lrd[0].fov - ls.fov) < 1e-9 && Math.abs(ls.fov - 55) < 1e-9, { ls, lres, lrd });
  await setViewport(page, { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  equal('photo: no page errors on the phone page', pageErrors(page), []);
  await closePage(page);

  // ---------------------------------------------------------------- a desktop keeps 4K
  const dpage = await browser.page({ width: 1280, height: 720, dpr: 1 });
  await dpage.goto(`${srv.url}index.html?fixtures=1&q=low`);
  await waitLoaded(dpage); await enter(dpage); await sleep(4000);
  await instrumentRenders(dpage);
  const dq = await dpage.eval('({ tier: __ctx.quality.tier, phone: !!__ctx.quality.phone, coarse: matchMedia("(pointer: coarse)").matches, fov: __ctx.camera.fov, aspect: __ctx.camera.aspect })');
  const dres = await dpage.eval(`window.__photo(1, { noDownload: true }).then((r) => r && ({ w: r.w, h: r.h, bytes: r.bytes, fov: r.fov ?? null, phone: r.phone ?? null }))`);
  const drd = await dpage.eval('window.__renders');
  check('photo desktop: the photo is still 3840x2160 (4K), ONE render (the loop is paused while it is encoded), with the 16:9 frame\'s field of view', dres && dres.w === 3840 && dres.h === 2160 && drd.length === 1 && drd[0].w === 3840 && drd[0].h === 2160 && Math.abs(drd[0].fov - 55) < 1e-9, { dq, dres, rendered: drd });
  await dpage.eval(`window.__renders.length = 0`);
  await setDesktopViewport(dpage, 600, 1000); await sleep(600);
  const portrait = await dpage.eval('({ fov: __ctx.camera.fov, aspect: __ctx.camera.aspect })');
  await dpage.eval(`window.__photo(0.25, { noDownload: true })`);
  const pr = await dpage.eval('window.__renders'), after = await dpage.eval('({ fov: __ctx.camera.fov, aspect: __ctx.camera.aspect })');
  check('photo desktop: in a tall window the 16:9 photo gets the 16:9 frame\'s 55 degrees (the window\'s own 88 gave a ~120 degree picture) and the window\'s field of view is back after', pr.length === 1 && Math.abs(pr[0].fov - 55) < 1e-9 && Math.abs(portrait.fov - 88) < 1e-9 && Math.abs(after.fov - portrait.fov) < 1e-9 && Math.abs(after.aspect - portrait.aspect) < 1e-9, { portrait, rendered: pr, after });
  await setDesktopViewport(dpage, 1280, 720); await sleep(600);
  // the download path: a click on an anchor with the file name, no card, then 保存しました
  await dpage.eval(`(() => { window.__dl = []; HTMLAnchorElement.prototype.click = function () { window.__dl.push({ name: this.download, href: String(this.href).slice(0, 5) }); }; return true; })()`);
  await dpage.eval(`window.__photo(0.25)`);
  const dnote = await hudNote(dpage), ddl = await dpage.eval('window.__dl'), dcard = await dpage.eval("!!document.getElementById('klc-photo')");
  check('photo desktop: the PNG goes straight to a download (no card) and the note says 保存しました', ddl.length === 1 && /^kesennuma-.*\.png$/.test(ddl[0].name) && !dcard && dnote.shown && /保存しました/.test(dnote.text), { ddl, dcard, dnote });
  equal('photo desktop: no page errors', pageErrors(dpage), []);
  await closePage(dpage);
}

// ================================================================== row 9, the cold load
/** Sample the page every ~100 ms from navigation start: the card, the bar, the label. A sample waits for the main thread, so a gap is a blocked thread. */
async function sampleLoad(page, { until, t0, maxMs = 280000 }) {
  const samples = [];
  const one = `(() => { try { const b = document.querySelector('#intro .board'); if (!b) return { t: Math.round(performance.now()), none: true }; const r = b.getBoundingClientRect(), cs = getComputedStyle(b), root = document.documentElement;
    const bar = document.getElementById('bar'), cr = document.getElementById('creep'), lab = document.getElementById('loadlabel');
    return { t: Math.round(performance.now()), h: +r.height.toFixed(2), w: +r.width.toFixed(1), top: +r.top.toFixed(1), vis: cs.visibility, op: +(+cs.opacity).toFixed(3), ready: root.classList.contains('klc-card-ready'),
      label: lab.textContent, bar: bar.style.transform, creep: cr ? cr.style.transform : null, loaded: document.body.classList.contains('loaded'), fonts: document.fonts.status }; } catch (e) { return { t: Math.round(performance.now()), err: String(e) }; } })()`;
  while (Date.now() - t0 < maxMs) {
    let s = null; try { s = await page.eval(one); } catch { s = null; }
    if (s) { s.wall = Date.now() - t0; samples.push(s); if (until(s)) break; }
    await sleep(100);
  }
  return samples;
}
const nearest = (samples, ms) => samples.filter((s) => s.h !== undefined).reduce((a, s) => (!a || Math.abs(s.t - ms) < Math.abs(a.t - ms) ? s : a), null);

async function loadOne(ctx, { name, phone, query = '' }) {
  const { browser, srv } = ctx;
  const page = phone ? await phonePage(browser, { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } }) : await browser.page({ width: 1440, height: 900, dpr: 1 });
  const t0 = Date.now();
  // a screencast of the page (the compositor's frames; nothing is asked of the page or of its viewport): while the main thread is blocked the frames that still come are the compositor's own
  const frames = []; let casting = true;
  browser.on('Page.screencastFrame', (p) => { if (!casting) return; frames.push({ wall: Date.now() - t0, data: p.data, w: p.metadata.deviceWidth, h: p.metadata.deviceHeight }); page.S('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {}); });
  await page.S('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: phone ? 390 : 1440, maxHeight: phone ? 844 : 900, everyNthFrame: 3 });
  await page.goto(`${srv.url}index.html?fixtures=1${query}`);
  let stripe = null;
  const finder = (async () => { for (let i = 0; i < 400 && !stripe; i++) { const r = await page.eval(`(() => { const b = document.querySelector('.stripe'); if (!b) return null; const x = b.getBoundingClientRect(); return x.width ? { x: x.left, y: x.top, w: x.width, h: x.height } : null; })()`).catch(() => null); if (r) stripe = r; else await sleep(150); } })();
  const samples = await sampleLoad(page, { until: (s) => s.loaded === true, t0 });
  await finder;
  // after ready: how long until the page draws a frame, and does it stall (the programs still compiling used to make the FIRST frame wait, after the card had said ready)
  const frameProbe = await page.eval(`new Promise((resolve) => { const ts = [], t0 = performance.now(); (function f(t) { ts.push(Math.round(t)); if (t - t0 < 6000 && ts.length < 600) requestAnimationFrame(f); else { const gaps = ts.slice(1).map((v, i) => v - ts[i]); resolve({ n: ts.length, first: Math.round(ts[0] - t0), maxGap: Math.max(0, ...gaps), gapsOver500: gaps.filter((g) => g > 500).length, spanMs: Math.round(ts.at(-1) - ts[0]) }); } })(t0); })`);
  casting = false; await page.S('Page.stopScreencast').catch(() => {});
  const timeOrigin = await page.eval('performance.timeOrigin');
  const log = await page.eval('window.__loadLog'), stats = await page.eval(`(() => { const s = window.__stats; return { bootMs: s.bootMs, firstFrameMs: s.firstFrameMs ?? null, finish: s.finish, modules: Object.fromEntries(Object.entries(s.modules).map(([k, v]) => [k, v.ms])), batch: s.batch && s.batch.ms, errors: (window.__errors || []).length }; })()`);
  const res = await page.eval(`(() => { const e = performance.getEntriesByType('resource'), by = {}; for (const r of e) { const k = r.name.replace(/^https?:\\/\\/[^/]+/, ''); by[k] = (by[k] || 0) + 1; }
    const nav = performance.getEntriesByType('navigation')[0], card = performance.getEntriesByName('klc:card')[0], hold = performance.getEntriesByName('klc:hold')[0], ready = performance.getEntriesByName('klc:ready')[0], fonts = [...document.fonts].reduce((a, f) => { a[f.status] = (a[f.status] || 0) + 1; return a; }, {});
    const cardText = document.getElementById('intro').textContent.replace(/\\s+/g, ' ');
    return { total: e.length, dups: Object.entries(by).filter(([, n]) => n > 1), explore: e.filter((r) => /explore\\.json/.test(r.name)).map((r) => ({ start: Math.round(r.startTime), dur: Math.round(r.duration), size: r.transferSize, enc: r.encodedBodySize })),
      google: e.filter((r) => /fonts\\.(googleapis|gstatic)\\.com/.test(r.name)).map((r) => ({ n: r.name.slice(0, 90), start: Math.round(r.startTime), dur: Math.round(r.duration) })), nav: nav && { dcl: Math.round(nav.domContentLoadedEventEnd), res: Math.round(nav.responseEnd) },
      cardMark: card ? Math.round(card.startTime) : null, holdMark: hold ? Math.round(hold.startTime) : null, readyMark: ready ? Math.round(ready.startTime) : null, fontFaces: fonts, cardFontsOk: ['900 56px "Zen Maru Gothic"', '700 16px "Zen Maru Gothic"', '500 13px "Noto Sans JP"', '700 11px "Noto Sans JP"'].map((f) => document.fonts.check(f, cardText)) }; })()`);
  let platformFonts = null;
  try {
    await page.S('DOM.enable'); await page.S('CSS.enable');
    const doc = await page.S('DOM.getDocument', { depth: 0 });
    platformFonts = {};
    for (const sel of ['#stname', '#go', '#loadlabel']) { const n = await page.S('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel }); const f = await page.S('CSS.getPlatformFontsForNode', { nodeId: n.nodeId }); platformFonts[sel] = f.fonts.map((x) => `${x.familyName}${x.isCustomFont ? ' (web)' : ' (system)'} x${x.glyphCount}`); }
  } catch (e) { platformFonts = { error: String(e).slice(0, 120) }; }
  const focus = await page.eval(`({ active: document.activeElement && document.activeElement.id, fine: matchMedia('(pointer: fine)').matches, coarse: matchMedia('(pointer: coarse)').matches, goDisabled: document.getElementById('go').disabled, scrollAttr: document.getElementById('intro').hasAttribute('data-scroll') })`);
  const readyLine = await page.eval(`(() => { const l = document.getElementById('loadlabel'); return { text: l.textContent, before: getComputedStyle(l, '::before').content }; })()`);
  return { page, samples, frames, stripe, timeOrigin, log, stats, res, focus, readyLine, frameProbe, platformFonts, t0 };
}

/** Frame-to-frame change inside the stripe's box (mean absolute difference of the pixels, 0-255) between consecutive screencast frames. */
async function stripeDiffs(frames, stripe) {
  if (!stripe || frames.length < 2) return [];
  const crops = [];
  for (const f of frames) {
    try {
      const img = Buffer.from(f.data, 'base64'), meta = await sharp(img).metadata(), k = meta.width / f.w;
      const left = Math.max(0, Math.floor((stripe.x + 4) * k)), top = Math.max(0, Math.floor(stripe.y * k)), width = Math.max(1, Math.min(meta.width - left, Math.floor((stripe.w - 8) * k))), height = Math.max(1, Math.min(meta.height - top, Math.ceil(stripe.h * k)));
      crops.push({ wall: f.wall, buf: await sharp(img).extract({ left, top, width, height }).raw().toBuffer() });
    } catch { /* a frame that does not decode */ }
  }
  const out = [];
  for (let i = 1; i < crops.length; i++) { const a = crops[i - 1].buf, b = crops[i].buf; if (a.length !== b.length) continue; let sum = 0; for (let k = 0; k < a.length; k++) sum += Math.abs(a[k] - b[k]); out.push({ from: crops[i - 1].wall, to: crops[i].wall, diff: sum / a.length }); }
  return out;
}

const loadChecks = async (ctx, cfg, L) => {
  const { page, samples, log, stats, res, focus, readyLine, frameProbe } = L;
  save(`load-${cfg.tag}.json`, { samples, log, stats, res, focus, readyLine, frameProbe, stripe: L.stripe, frames: L.frames.length });
  note(`load ${cfg.tag}: the page's own clock at the start of build(), and how long each stage took (ms)`, { bootMs: stats.bootMs, finish: stats.finish, modules: stats.modules, batchMs: stats.batch });
  // --- the card: its height at 0.8 s and 3.3 s (page clock), and at every sample
  const a = nearest(samples, 800), b = nearest(samples, 3300);
  note(`load ${cfg.tag}: the card at the sample nearest 0.8 s and 3.3 s`, { a: a && { t: a.t, h: a.h, vis: a.vis, ready: a.ready }, b: b && { t: b.t, h: b.h, vis: b.vis, ready: b.ready } });
  check(`load ${cfg.tag}: the card's height is equal at 0.8 s and 3.3 s`, !!a && !!b && Math.abs(a.h - b.h) < 0.5, { a: a && [a.t, a.h], b: b && [b.t, b.h] });
  const hs = samples.filter((s) => s.h !== undefined).map((s) => s.h);
  check(`load ${cfg.tag}: the card's height never changes during the whole load (${hs.length} samples; ${round1(Math.min(...hs))} to ${round1(Math.max(...hs))} px)`, Math.max(...hs) - Math.min(...hs) < 0.5, { min: Math.min(...hs), max: Math.max(...hs) });
  const hiddenBefore = samples.filter((s) => s.h !== undefined && !s.ready).every((s) => s.vis === 'hidden'), visibleAfter = samples.filter((s) => s.h !== undefined && s.ready).every((s) => s.vis === 'visible');
  // the cap runs from the hold script, which waits for the render-blocking font stylesheet: in a gated run that stylesheet is requested seconds after the page starts, so the reveal is judged from the script's own mark
  const heldMs = res.cardMark !== null && res.holdMark !== null ? res.cardMark - res.holdMark : null;
  check(`load ${cfg.tag}: the card is hidden until it is revealed, ${heldMs} ms after the hold began (at most 2 s; the page clock says ${res.cardMark} ms) and visible after`, heldMs !== null && heldMs >= 0 && heldMs <= 2100 && hiddenBefore && visibleAfter, { cardMark: res.cardMark, holdMark: res.holdMark, hiddenBefore, visibleAfter });
  note(`load ${cfg.tag}: web fonts`, { googleRequests: res.google, fontFaceStates: res.fontFaces, cardFacesLoadedAtEnd: res.cardFontsOk, platformFonts: L.platformFonts });
  if (heldMs !== null && heldMs < 1900) check(`load ${cfg.tag}: the reveal came before the cap, so the card's faces were loaded for the card's own text (checked at the end of the load)`, res.cardFontsOk.every(Boolean), { heldMs, ok: res.cardFontsOk });
  // --- one request for explore.json
  check(`load ${cfg.tag}: explore.json is requested once (it was three times)`, res.explore.length === 1, res.explore);
  note(`load ${cfg.tag}: requests`, { total: res.total, duplicates: res.dups, nav: res.nav });
  // --- the labels and the bar through the finishing steps (the page's own record)
  const labels = log.filter((e) => e.label);
  const FIN = ['電線を張っています…', 'スマホ向けに軽くしています…', '街並みをまとめています…', '描画の準備をしています…'];
  const want = FIN.filter((l) => (cfg.phone ? true : !/スマホ/.test(l)));
  const seq = labels.map((e) => e.label).filter((l) => FIN.includes(l));
  equal(`load ${cfg.tag}: the finishing steps each put their own Japanese label up, in order`, seq, want);
  check(`load ${cfg.tag}: no label says "Loading"; the loader's first label is 文字を読み込んでいます…`, labels.every((e) => !/Loading/i.test(e.label)) && labels[0].label === '文字を読み込んでいます…', labels[0]);
  const endT = log.at(-1).t, finishStart = log.find((e) => e.label === '電線を張っています…');
  const plateau = endT - finishStart.t;   // the old plateau: from the end of the modules (the old bar's 89 % mark) to ready
  note(`load ${cfg.tag}: the old plateau (89 % to ready) took ${plateau} ms of ${endT} ms (${Math.round((plateau / endT) * 100)} %); the steps in it (ms after its start, label, bar, creep target, creep time)`, { steps: log.filter((e) => e.t >= finishStart.t).map((e) => [e.t - finishStart.t, e.label, e.bar, e.creepTo, e.creepMs]) });
  check(`load ${cfg.tag}: the bar is at ${Math.round(finishStart.bar * 100)} % (not 89 %) when the finishing steps begin, ${Math.round((finishStart.t / endT) * 100)} % of the way through the load`, finishStart.bar < 0.7 && finishStart.bar > 0.4, { bar: finishStart.bar, at: finishStart.t, endT });
  const first89 = log.find((e) => e.bar >= 0.89);
  check(`load ${cfg.tag}: the bar reaches 89 % no earlier than 70 % of the load (at ${first89 ? Math.round((first89.t / endT) * 100) : '?'} % of the page clock)`, !first89 || first89.t / endT >= 0.7, { first89: first89 && [first89.t, first89.bar], endT });
  const bars = log.map((e) => e.bar); check(`load ${cfg.tag}: the bar never goes backwards (${log.length} marks)`, bars.every((v, i) => i === 0 || v >= bars[i - 1]), bars);
  const longest = (() => { let best = { ms: 0 }; for (let i = 0; i + 1 < log.length; i++) if (log[i + 1].t - log[i].t > best.ms) best = { ms: log[i + 1].t - log[i].t, label: log[i].label, bar: log[i].bar, creepTo: log[i].creepTo, creepMs: log[i].creepMs }; return best; })();
  note(`load ${cfg.tag}: the longest time the bar stood at one mark (its creep layer moves on the compositor through it)`, longest);
  check(`load ${cfg.tag}: the longest step's creep time (${longest.creepMs} ms) is within a factor of 2 of how long it took (${longest.ms} ms): the calibrated estimate`, longest.creepMs && longest.creepMs > longest.ms / 2 && longest.creepMs < longest.ms * 2, longest);
  check(`load ${cfg.tag}: the card's ready state: 「まちへ出る」 enabled, the label empty and the ready line from CSS`, !focus.goDisabled && readyLine.text === '' && /準備完了/.test(readyLine.before), { focus, readyLine });
  note(`load ${cfg.tag}: after ready, the first six seconds of frames (this sampler's own wait hides a stall of the first frame: see stats.firstFrameMs)`, frameProbe);
  const stall = stats.firstFrameMs !== null && res.readyMark !== null ? stats.firstFrameMs - res.readyMark : null;
  note(`load ${cfg.tag}: the first frame is done ${stall} ms after the ready mark (the programs still compiling would show here)`, { firstFrameMs: stats.firstFrameMs, readyMark: res.readyMark, stall });
  // --- the compositor proof: the stripe changes in the screencast frames while the main thread is blocked
  const gaps = []; for (let i = 1; i < samples.length; i++) if (samples[i].wall - samples[i - 1].wall > 1500) gaps.push([samples[i - 1].wall, samples[i].wall]);
  const diffs = await stripeDiffs(L.frames, L.stripe);
  const inGap = diffs.filter((d) => gaps.some(([g0, g1]) => d.from >= g0 && d.to <= g1));
  const moving = inGap.filter((d) => d.diff > 1.5);
  note(`load ${cfg.tag}: main-thread gaps (>1.5 s between samples) and the stripe's frame-to-frame change inside them`, { gaps: gaps.length, gapSeconds: round1(gaps.reduce((s, [a1, b1]) => s + (b1 - a1), 0) / 1000), framePairsInGaps: inGap.length, moving: moving.length, meanDiff: inGap.length ? round1(inGap.reduce((s, d) => s + d.diff, 0) / inGap.length) : null, frames: L.frames.length });
  // a shimmer driven from script cannot change a single pixel while the thread is blocked: any steady supply of changing frames inside the blocked intervals is the compositor's own (the sheen has slow ends of its ease, so not every pair differs)
  check(`load ${cfg.tag}: while the main thread is blocked the stripe still moves (compositor-only shimmer: ${moving.length} of ${inGap.length} frame pairs inside blocked intervals differ)`, inGap.length >= 20 && moving.length >= 10 && moving.length >= inGap.length * 0.25, { inGap: inGap.length, moving: moving.length, meanDiff: inGap.length ? round1(inGap.reduce((s, d) => s + d.diff, 0) / inGap.length) : null });
  if (OUT) {
    const { data } = await page.S('Page.captureScreenshot', { format: 'jpeg', quality: 72 }); writeFileSync(join(OUT, `load-${cfg.tag}-ready.jpg`), Buffer.from(data, 'base64'));
    // frames from inside the longest blocked interval: the card with its label, bar and creep, and the same stripe a moment later
    const g = [...gaps].sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
    if (g) for (const [k, f] of [['a', 0.3], ['b', 0.5], ['c', 0.7]]) { const w = g[0] + (g[1] - g[0]) * f; const fr = L.frames.reduce((x, y) => (!x || Math.abs(y.wall - w) < Math.abs(x.wall - w) ? y : x), null); if (fr) writeFileSync(join(OUT, `load-${cfg.tag}-blocked-${k}.jpg`), Buffer.from(fr.data, 'base64')); }
  }
};

async function stepLoad(ctx) {
  for (const cfg of [{ name: 'desktop 1440x900', phone: false, tag: 'desktop' }, { name: 'phone 390x844', phone: true, tag: 'phone' }]) {
    console.log(`\n-- cold load, ${cfg.name}`);
    const L = await loadOne(ctx, cfg);
    await loadChecks(ctx, cfg, L);
    const { page, focus, stats } = L;
    // --- lane B's requests on the live page
    if (!cfg.phone) check('intro: on a desktop (a fine pointer) 「まちへ出る」 has the focus when the town is ready', focus.fine && focus.active === 'go', focus);
    else {
      check('intro: on a touch screen (a coarse pointer) 「まちへ出る」 is NOT focused (no ring, no scroll-into-view)', focus.coarse && !focus.fine && focus.active !== 'go', focus);
      check('intro: #intro is data-scroll', focus.scrollAttr === true, focus);
      // a touch swipe scrolls the intro on a screen shorter than the card (480x200), through the pad's touchmove veto
      await setViewport(page, { width: 480, height: 200, dpr: 3 }); await sleep(900);
      const m0 = await page.eval(`(() => { const i = document.getElementById('intro'), g = document.getElementById('go').getBoundingClientRect(); return { sh: i.scrollHeight, ch: i.clientHeight, top: i.scrollTop, go: [Math.round(g.top), Math.round(g.bottom)], padActive: window.__pad && window.__pad.active, board: Math.round(document.querySelector('#intro .board').getBoundingClientRect().height) }; })()`);
      const f = fingers(page);
      const swipe = async () => { await f.down1(7, 240, 160); await f.drag(7, 240, 40, 10); await f.release(); await sleep(500); return page.eval(`document.getElementById('intro').scrollTop`); };
      const withAttr = await swipe();
      await page.eval(`(() => { const i = document.getElementById('intro'); i.scrollTop = 0; i.removeAttribute('data-scroll'); })()`);
      const without = await swipe();
      await page.eval(`(() => { const i = document.getElementById('intro'); i.setAttribute('data-scroll', ''); i.scrollTop = 0; })()`);
      note('intro 480x200: the card scrolls by touch (scrollTop after one swipe, with data-scroll and with the attribute removed)', { m0, withAttr, without });
      check('intro 480x200: a touch swipe scrolls the intro card with data-scroll, and not without it (the pad vetoes the touchmove)', m0.sh > m0.ch && withAttr > 0 && without === 0, { m0, withAttr, without });
      check('intro 480x200: 「まちへ出る」 is inside the screen (the footer is pinned)', m0.go[1] <= 200, m0);
      await setViewport(page, { width: 390, height: 844, dpr: 3 });
    }
    equal(`load ${cfg.tag}: no page errors, no module errors`, { errors: pageErrors(page), modules: stats.errors }, { errors: [], modules: 0 });
    await closePage(page);
  }
}

/** The same desktop load with ?compile=async (compileAsync: waits for the programs): what the opt-in costs and buys, in the page's own numbers. */
async function stepLoadAsync(ctx) {
  console.log('\n-- cold load, desktop 1440x900, ?compile=async');
  const L = await loadOne(ctx, { name: 'desktop async', phone: false, query: '&compile=async' });
  const stall = L.stats.firstFrameMs !== null && L.res.readyMark !== null ? L.stats.firstFrameMs - L.res.readyMark : null;
  note('load async: stage times, ready time and the first frame (compileAsync)', { finish: L.stats.finish, ready: L.log.at(-1).t, firstFrameStall: stall, frameProbe: L.frameProbe });
  save('load-desktop-async.json', { finish: L.stats.finish, ready: L.log.at(-1).t, firstFrameStall: stall, frameProbe: L.frameProbe, log: L.log });
  check('load async: loads without errors', L.stats.errors === 0 && pageErrors(L.page).length === 0, { errors: L.stats.errors });
  await closePage(L.page);
}

// ================================================================== main
const STEP_FNS = { card: stepCard, photocard: stepPhotoCard, load: stepLoad, 'load-async': stepLoadAsync, photo: stepPhoto };
const t0 = Date.now();
let ctx = { browser: null, srv: null, dist: null };
try {
  const dist = arg('dist') ? join(process.cwd(), arg('dist')) : join(ROOT, `dist/anime-${PORT}`);
  if (arg('nobuild') === '1') ctx = { ...ctx, srv: serve({ port: PORT, dist }), dist };
  else { const b = await buildAndServe(PORT); ctx = { ...ctx, srv: b.srv, dist: b.dist }; }
  // a second tiny server for the static card pages (the matrix needs the real CSS without the app)
  const pages = new Map();
  const cardSrv = Bun.serve({ port: PORT + 1, hostname: '127.0.0.1', fetch(req) { const p = new URL(req.url).pathname; return pages.has(p) ? new Response(pages.get(p), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }) : new Response('not found', { status: 404 }); } });
  ctx.cardSrv = cardSrv;
  ctx.cardCtx = { url: `http://127.0.0.1:${PORT + 1}/`, pages };
  ctx.browser = await launch({ quiet: true, args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  for (const s of STEPS) {
    if (!STEP_FNS[s]) { check(`unknown step ${s}`, false); continue; }
    console.log(`\n== step ${s}`);
    try { await STEP_FNS[s]({ ...ctx, srv: s === 'card' || s === 'photocard' ? ctx.cardCtx : ctx.srv }); } catch (e) { check(`step ${s} ran to the end`, false, String(e?.stack || e).slice(0, 800)); }
  }
} finally {
  await ctx.browser?.close().catch(() => {});
  ctx.srv?.stop();
  try { ctx.cardSrv?.stop(true); } catch { /* gone */ }
  try { Bun.spawnSync(['pkill', '-9', '-f', 'user-data-dir=' + join(ROOT, 'dist/.chrome-' + process.pid)]); } catch { /* nothing left to sweep */ }
}
const summary = { steps: STEPS, label: LABEL || null, pass: results.filter((r) => r.ok).length, fail: failed, seconds: Math.round((Date.now() - t0) / 1000), results };
save(`ui-c2-check-${STEPS.join('+')}${LABEL ? '-' + LABEL : ''}.json`, summary);
console.log(`\n${summary.pass} passed, ${summary.fail} failed in ${summary.seconds} s`);
process.exit(failed ? 1 : 0);
