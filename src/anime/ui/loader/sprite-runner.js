// [loader] The generic sprite runner: the little character that rides the loader's progress bar.
//
// One horizontal strip of equal frames (a PNG, WebP or SVG sheet), a frame count and a frame rate: the strip is stepped with a CSS transform (steps(n)), which runs on the
// compositor, so the runner keeps running while the page's thread is busy with the 10-20 s the town takes to batch. The wrapper rocks on its own transform (the swell), so a sheet
// only has to carry what changes between poses.
//
//   runner.json (src/anime/assets/runner/runner.json)
//   { "character": "bonito", "src": "bonito-run.svg", "frames": 6, "fps": 8, "frameW": 192, "frameH": 96, "alt": {"ja": "カツオ", "en": "Bonito"} }
//
// DROPPING IN AN APPROVED RUN CYCLE (docs/loading/RUNNER.md): put the city's approved sheet next to the ship's, change this one file, run `bun scripts/anime/loader-inline.js`.
//   { "character": "hoyaboya", "src": "hoyaboya-run.png", "frames": 8, "fps": 12, "frameW": 256, "frameH": 256, "credit": "ja",
//     "approval": { "by": "気仙沼市産業部観光課", "ref": "<the number on the 使用承認書 (様式第2号)>", "date": "YYYY-MM-DD" } }
// assertRunnerAllowed() refuses a Hoya Boya runner without an approval record, and without the credit: the manual says the credit is always shown, and the city's rules
// (取扱要綱 第2条) say a 動画 needs the mayor's approval first. A static still needs neither, which is why the title's standing still (1-9) is not a runner.

/** The credit lines the design manual prescribes (デザインマニュアル 2026-05-20, p.4: "クレジットは必ず記載し、勝手に変更しないでください"). Never edit these strings. */
export const HOYABOYA_CREDIT = Object.freeze({
  ja: Object.freeze(['気仙沼市観光キャラクター', '「海の子 ホヤぼーや」']),
  en: Object.freeze(['Kesennuma City Mascot,Hoya Boya the Ocean Boy']),
});

const CHARACTERS = ['bonito', 'hoyaboya'];

/** A runner config checked and completed; throws a readable error for anything the loader could not draw. */
export function normalizeRunner(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('runner: no config');
  const out = { character: cfg.character ?? 'bonito', src: String(cfg.src ?? ''), frames: Number(cfg.frames), fps: Number(cfg.fps), frameW: Number(cfg.frameW), frameH: Number(cfg.frameH),
    alt: cfg.alt ?? { ja: '', en: '' }, credit: cfg.credit ?? null, approval: cfg.approval ?? null };
  if (!CHARACTERS.includes(out.character)) throw new Error(`runner: unknown character ${JSON.stringify(out.character)} (${CHARACTERS.join(', ')})`);
  if (!/^[\w.-]+\.(svg|png|webp)$/i.test(out.src)) throw new Error(`runner: src must be a file name ending in .svg, .png or .webp (got ${JSON.stringify(cfg.src)})`);
  if (!Number.isInteger(out.frames) || out.frames < 1 || out.frames > 64) throw new Error('runner: frames must be an integer 1..64');
  if (!(out.fps > 0 && out.fps <= 60)) throw new Error('runner: fps must be in (0, 60]');
  if (!(out.frameW > 0 && out.frameH > 0)) throw new Error('runner: frameW and frameH must be positive');
  return out;
}

/** The Hoya Boya guard. Anything but the plain ship needs the city's written approval on file, and the official credit shown with it. */
export function assertRunnerAllowed(cfg) {
  const r = normalizeRunner(cfg);
  if (r.character === 'hoyaboya') {
    const a = r.approval;
    if (!a || !a.by || !a.ref || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.date ?? ''))) throw new Error('runner: a Hoya Boya run cycle is a 動画 and needs the city\'s approval first: add "approval": { "by", "ref", "date": "YYYY-MM-DD" } (docs/loading/HOYABOYA.md)');
    if (r.credit !== 'ja' && r.credit !== 'en') throw new Error('runner: a Hoya Boya runner must show the official credit: "credit": "ja" | "en"');
  }
  return r;
}

/** Width over height of one frame (what the stylesheet's --sr-aspect holds). */
export const aspectOf = (r) => +(r.frameW / r.frameH).toFixed(4);

/** The custom properties the loader's stylesheet reads. */
export const runnerVars = (r) => `--sr-n:${r.frames};--sr-fps:${r.fps};--sr-aspect:${aspectOf(r)}`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The runner's markup: .sr > .sr-bob (rocks) > .sr-win (one frame wide) > img.sr-strip (all the frames, stepped). `url` is a data: URI or a path. A Hoya Boya runner carries its credit. */
export function runnerHtml(cfg, url) {
  const r = assertRunnerAllowed(cfg);
  const alt = r.alt?.ja || '';
  const credit = r.character === 'hoyaboya' ? `<p class="ld-credit sr-credit" lang="${r.credit === 'en' ? 'en' : 'ja'}">${HOYABOYA_CREDIT[r.credit].map(esc).join('<br>')}</p>` : '';
  return `<div class="sr" style="${runnerVars(r)}" data-character="${r.character}" data-n="${r.frames}"><div class="sr-bob"><div class="sr-win"><img class="sr-strip" src="${esc(url)}" width="${r.frames * r.frameW}" height="${r.frameH}" alt="${esc(alt)}" decoding="async"></div></div>${credit}</div>`;
}

/** The position of the strip at time t (seconds) as a frame index, for tests and for a reduced-motion poster: frame 0 is the still pose. */
export function frameAt(r, t) { return Math.floor(((t * r.fps) % r.frames + r.frames) % r.frames); }

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The Hoya Boya slot (docs/loading/RUNNER.md). `runner.json` has a "hoya" block with ONE switch, "mode":
//   "off"    (the default, and the only mode in production until the city approves) the progress head is our own bonito. Nothing of Hoya Boya moves.
//   "still"  approval level A: ONE official pose (a still, unmodified) is carried along the bar; only its position moves (the page's CSS), plus a two-step bob of the position.
//   "cycle"  approval level B: a run cycle the city has approved (a strip of frames: set "frames" and "fps"); the same guard.
// The guard refuses "still" and "cycle" without an approval record and without the credit (the credit is shown with the figure in the page already; a runner carries it too).
export const HOYA_MODES = ['off', 'still', 'cycle'];

/** The hoya block checked and completed (a missing block is mode "off"). */
export function normalizeHoya(h) {
  const o = { mode: 'off', pose: '', src: 'runner-a.png', aspect: 1, credit: 'ja', approval: null, frames: 1, fps: 8, ...(h || {}) };
  if (!HOYA_MODES.includes(o.mode)) throw new Error(`runner.hoya.mode must be one of ${HOYA_MODES.join(', ')}`);
  if (!(Number(o.aspect) > 0)) throw new Error('runner.hoya.aspect (width over height of one frame) must be positive');
  return o;
}

/** Throws unless the hoya block may be live: an approval record from the city (要綱 第2条 ただし書き: a 動画 needs the mayor's approval) and the official credit. Returns the block. */
export function assertHoyaAllowed(h) {
  const o = normalizeHoya(h);
  if (o.mode === 'off') return o;
  const a = o.approval;
  if (!a || !a.by || !a.ref || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.date ?? ''))) throw new Error('runner.hoya: a moving Hoya Boya is a 動画 and needs the city\'s approval first: "approval": { "by", "ref", "date": "YYYY-MM-DD" } (docs/loading/HOYABOYA.md)');
  if (o.credit !== 'ja' && o.credit !== 'en') throw new Error('runner.hoya: "credit" must be "ja" or "en" (the manual: the credit is always shown)');
  if (!o.pose) throw new Error('runner.hoya: name the official pose ("pose": "15-10") the approval covers');
  if (o.mode === 'cycle' && !(Number.isInteger(o.frames) && o.frames > 1)) throw new Error('runner.hoya: a cycle needs "frames" > 1');
  return o;
}

/** The runner markup for a live Hoya block: the still (or the strip) as an <img>; `url` is where the bundler found the file. */
export function hoyaRunnerHtml(h, url) {
  const o = assertHoyaAllowed(h);
  if (o.mode === 'off') throw new Error('hoyaRunnerHtml: mode is off');
  const n = o.mode === 'cycle' ? o.frames : 1;
  const vars = `--sr-n:${n};--sr-fps:${o.fps};--sr-aspect:${+Number(o.aspect).toFixed(4)}`;
  return `<div class="sr" style="${vars}" data-character="hoyaboya" data-n="${n}"><div class="sr-bob"><div class="sr-win"><img class="sr-strip" src="${esc(url)}" alt="ホヤぼーや" decoding="async"></div></div></div>`;
}
