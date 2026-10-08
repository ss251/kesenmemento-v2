// [loader] The generic sprite runner: the little character that rides the loader's progress bar.
//
// One horizontal strip of equal frames (a PNG, WebP or SVG sheet), a frame count and a frame rate: the strip is stepped with a CSS transform (steps(n)), which runs on the
// compositor, so the runner keeps running while the page's thread is busy with the 10-20 s the town takes to batch. The wrapper rocks on its own transform (the swell), so a sheet
// only has to carry what changes between poses.
//
//   runner.json (src/anime/assets/runner/runner.json)
//   { "character": "bonito", "src": "bonito-run.svg", "frames": 6, "fps": 8, "frameW": 192, "frameH": 96, "alt": {"ja": "カツオ", "en": "Bonito"} }
//
// The gauge's fish is the logo's own カツオ. The page clones that fish into the empty svg (title-boot.js).

const CHARACTERS = ['bonito'];

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

/** A runner config the loader may draw. */
export function assertRunnerAllowed(cfg) {
  return normalizeRunner(cfg);
}

/** Width over height of one frame (what the stylesheet's --sr-aspect holds). */
export const aspectOf = (r) => +(r.frameW / r.frameH).toFixed(4);

/** The custom properties the loader's stylesheet reads. */
export const runnerVars = (r) => `--sr-n:${r.frames};--sr-fps:${r.fps};--sr-aspect:${aspectOf(r)}`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The runner's markup: .sr > .sr-bob (rocks) > .sr-win (one frame wide) > img.sr-strip (all the frames, stepped). `url` is a data: URI or a path. */
export function runnerHtml(cfg, url) {
  const r = assertRunnerAllowed(cfg);
  const alt = r.alt?.ja || '';
  return `<div class="sr" style="${runnerVars(r)}" data-character="${r.character}" data-n="${r.frames}"><div class="sr-bob"><div class="sr-win"><img class="sr-strip" src="${esc(url)}" width="${r.frames * r.frameW}" height="${r.frameH}" alt="${esc(alt)}" decoding="async"></div></div></div>`;
}

/** The position of the strip at time t (seconds) as a frame index, for tests and for a reduced-motion poster: frame 0 is the still pose. */
export function frameAt(r, t) { return Math.floor(((t * r.fps) % r.frames + r.frames) % r.frames); }
