// [loader] Keeps the loader's inline parts of src/anime/index.html in step with their sources, so the page paints the loader with its first bytes (no request, no font, no script of the app).
//
//   env -u NODE_OPTIONS bun scripts/anime/loader-inline.js            rewrite the marked regions of src/anime/index.html
//   env -u NODE_OPTIONS bun scripts/anime/loader-inline.js --check    exit 1 when index.html is out of date (test/loader-inline.test.js runs the same check)
//
// Regions (each is <!--klc:NAME--> ... <!--/klc:NAME--> in index.html; everything between the markers is generated):
//   css       <style id="klc-loader-css">   src/anime/ui/loader/loader.css
//   slot      the poster hour, before paint  ui/loader/sky.js posterForQuery, duplicated in slotScript()
//   logo      the sun title mark             src/anime/assets/loader/title-logo-sun.svg (tools/anime/title-logo.mjs)
//   runner    the gauge's カツオ              an empty svg; title-boot.js clones the logo's fish into it.
//   tips      <script type=application/json id=klc-tips>   ja, en and the phrased source of every tip in data/loading-tips.json
//   sky       <script>                       the real-time sky: NOAA sun position (src/web/lib/solar.js) + ui/loader/sky.js + the glue that writes the poster slot
//   boot      <script>                       title-motion.js then title-boot.js, as classic scripts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRunnerAllowed } from '../../src/anime/ui/loader/sprite-runner.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p, enc = 'utf8') => readFileSync(join(ROOT, p), enc);

/** A data: URI for a sheet. SVG goes in as (mostly) readable percent-encoded text (smaller than base64 and it compresses better), PNG and WebP as base64. */
export function dataUri(name, buf) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'svg') {
    const t = buf.toString('utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\s*\n\s*/g, '').replace(/"/g, "'").replace(/%/g, '%25').replace(/#/g, '%23').replace(/&/g, '%26').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/\{/g, '%7B').replace(/\}/g, '%7D');
    return 'data:image/svg+xml,' + t;
  }
  return `data:image/${ext === 'png' ? 'png' : 'webp'};base64,` + buf.toString('base64');
}

/** The inline wordmark: the file's own paths (.k lettering, .sl the seal's field, .sf its hairline frame, .sg the carved character) in its viewBox, labelled for screen readers. */
export function wordmarkSvg(src) {
  const vb = src.match(/viewBox="0 0 (\d+) (\d+)"/), inner = src.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!vb || !inner || !/class="k"/.test(inner[1]) || !/class="sl"/.test(inner[1]) || !/class="sg"/.test(inner[1])) throw new Error('wordmark.svg: expected a viewBox and the paths k, sl, sf, sg');
  return `<svg class="ld-mark" viewBox="0 0 ${vb[1]} ${vb[2]}" role="img" aria-label="KesenMemento"><title>KesenMemento</title>${inner[1].trim()}</svg>`;
}

/** The harbour silhouette (already an inline-ready <svg class="ld-hills">). */
export function harbourSvg(src) {
  if (!/<svg class="ld-hills"/.test(src)) throw new Error('harbour.svg: expected <svg class="ld-hills" ...>');
  return src.trim().replace(/\n/g, '');
}

/** The rope's curve in the 100 x 20 box of index.html (a quadratic Bezier): x and y (0..20) for a parameter s in 0..1. */
export const ROPE = Object.freeze({ p0: [-2, 3], p1: [46, 25], p2: [102, 9], h: 20 });
const bez = (a, b, c, s) => (1 - s) * (1 - s) * a + 2 * s * (1 - s) * b + s * s * c;
/** y (0..1 of the rope's height) of the rope at horizontal position x (0..100). */
export function ropeY(x) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (bez(ROPE.p0[0], ROPE.p1[0], ROPE.p2[0], m) < x) lo = m; else hi = m; }
  return +(bez(ROPE.p0[1], ROPE.p1[1], ROPE.p2[1], (lo + hi) / 2) / ROPE.h).toFixed(4);
}
/** The flags, hung along the rope: --x percent, --y fraction of the rope's height, --i the order (also the flutter's phase). They start hidden; the loader adds .up as stages complete. */
export function flagsHtml(flags) {
  const n = flags.length, x0 = 7, x1 = 93;
  return flags.map((f, i) => { const x = +(x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1))).toFixed(2); return `<div class="ld-flag" data-flag="${f.id}" style="--x:${x};--y:${ropeY(x)};--i:${i}"><i>${f.svg}</i></div>`; }).join('');
}
const FALLBACK_FLAGS = Array.from({ length: 13 }, (_, i) => ({ id: `plain${i}`, svg: `<svg viewBox="0 0 40 60"><rect width="40" height="60" fill="${['#B7282E', '#F8B500', '#165E83', '#FBFAF5'][i % 4]}"/></svg>` }));

/** A Japanese line with a zero-width space between phrases (bunsetsu), so the page can break lines only there (word-break: keep-all) and never in the middle of a verb or a name. Particles and
 *  auxiliaries (a short hiragana run) stay with the word before them; Intl.Segmenter (ICU, the same in Bun and in the browsers) finds the words. */
export function phrases(ja) {
  const seg = [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(ja)].map((s) => s.segment);
  const ZW = String.fromCharCode(0x200b), out = [];
  for (const s of seg) {
    const glue = /^[\u3041-\u309f]{1,3}$/.test(s) || /^[、。」）』！？…ー・,.!?]/.test(s);   // (a particle or a closing mark stays with the word before it)
    const afterOpen = out.length && /[「『（(]$/.test(out[out.length - 1]);                          // (an opening bracket never ends a line: it stays with what follows)
    if (out.length && (glue || afterOpen)) out[out.length - 1] += s; else out.push(s);
  }
  return out.join(ZW);
}

/** The tips as the page reads them: ja and en, and the source's title in both languages (an English page never shows a Japanese-only line), in the data file's order.
 *  Escaped so a tip can never end the <script> it sits in. */
export function tipsJson(data) {
  const tips = (data.tips || []).map((t) => ({ id: t.id, ja: phrases(t.ja), en: t.en, src: t.source && t.source.title ? phrases(t.source.title) : '', srcEn: (t.source && t.source.title_en) || '' }));
  const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);   // (line and paragraph separators end a string in old JS engines)
  return JSON.stringify(tips).replace(/</g, '\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');
}
const FALLBACK_TIPS = { tips: [
  { id: 'katsuo-modori', ja: '秋に南へもどる、あぶらがのったカツオは「もどりガツオ」とよばれるよ。', en: 'Bonito that return south in autumn are fatty and are known as “modori-gatsuo.”' },
] };

/** Strip comments from a piece of plain browser JS (whole-line comments, block comments, and trailing // comments that hold no quote), and turn ES-module exports into plain declarations. */
export function plainJs(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s+\/\/[^'"`\n]*$/, '')).filter((l) => l.trim() !== '').join('\n')
    .replace(/^\s*export\s+(const|function|let|var)\s/gm, '$1 ')
    .replace(/^import\s.*$/gm, '');
}
/** The real-time sky as one inline classic script: sunPosition (the NOAA function of src/web/lib/solar.js), the sky module, and the glue. */
export function skyScript() {
  const solar = read('src/web/lib/solar.js'), a = solar.indexOf('const rad ='), b = solar.indexOf('/** JST wall-clock hours');
  if (a < 0 || b < 0) throw new Error('src/web/lib/solar.js changed: loader-inline.js cannot find sunPosition');
  const code = plainJs(solar.slice(a, b)) + '\n' + plainJs(read('src/anime/ui/loader/sky.js'));
  const glue = `
  var intro = document.getElementById('intro');
  if (intro) {
    var d = null; try { d = pinnedSky(new URLSearchParams(location.search).get('sky')); } catch (e) { /* no pin */ }
    var st = skyState(d || new Date(), sunPosition, { wide: innerWidth / Math.max(1, innerHeight) > 1.4 && innerHeight <= 520 });
    for (var k in st.vars) intro.style.setProperty(k, st.vars[k]);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', st.stops[1]);
    try { var slot = posterForQuery(location.search); document.documentElement.dataset.t = slot; intro.dataset.t = slot; } catch (e2) { /* the head script already set it */ }
  }`;
  return `<script>\n/* [loader] The sky follows the real clock in Kesennuma (JST). Generated by scripts/anime/loader-inline.js from src/web/lib/solar.js and src/anime/ui/loader/sky.js; edit those. */\n(function () {\n${code}\n${glue}\n})();\n</script>`;
}

/** Sets the poster slot and the language before the body paints (the same bands as posterForQuery in sky.js). */
export function slotScript() {
  const lqip = {};
  for (const slot of ['asa', 'hiru', 'yugata', 'yoru']) {
    const file = join(ROOT, `src/anime/assets/loader/lqip-${slot}.webp`);
    if (existsSync(file)) lqip[slot] = readFileSync(file).toString('base64');
  }
  return `<script>
(function () {
  var q = new URLSearchParams(location.search);
  function band(h) { h = ((h % 24) + 24) % 24; if (h >= 5 && h < 10) return "asa"; if (h >= 10 && h < 15) return "hiru"; if (h >= 15 && h < 19) return "yugata"; return "yoru"; }
  var sky = { dawn: "asa", morning: "asa", day: "hiru", noon: "hiru", afternoon: "hiru", golden: "yugata", dusk: "yugata", blue: "yoru", night: "yoru", midnight: "yoru" };
  var slot = "hiru", pin = q.get("poster"), preset = q.get("preset") || (q.get("look") === "photo" ? "photo" : "");
  if (pin === "asa" || pin === "hiru" || pin === "yugata" || pin === "yoru") slot = pin;
  else if (q.has("hours")) slot = band(Number(q.get("hours")));
  else if (preset === "asa" || preset === "hiru" || preset === "yugata" || preset === "yoru") slot = preset;
  else if (preset === "yuyake" || preset === "photo") slot = "yugata";
  else if (sky[q.get("sky")]) slot = sky[q.get("sky")];
  else if (/^\\d{1,2}:\\d{2}$/.test(q.get("sky") || "")) { var hm = q.get("sky").split(":"); slot = band(Number(hm[0]) + Number(hm[1]) / 60); }
  else { var j = new Date(Date.now() + 9 * 3600000); slot = band(j.getUTCHours() + j.getUTCMinutes() / 60); }
  document.documentElement.dataset.t = slot;
  var lqip = ${JSON.stringify(lqip)};
  if (lqip[slot]) document.documentElement.style.setProperty("--lqip", "url(\\"data:image/webp;base64," + lqip[slot] + "\\")");
  var lang = "ja";
  try { var l = q.get("lang") || localStorage.getItem("klc.lang"); if (l === "en" || l === "ja") lang = l; } catch (e) { /* private mode */ }
  document.documentElement.lang = lang;
  var pinIn = q.get("input"), coarse = false;
  try { coarse = matchMedia("(pointer: coarse)").matches; } catch (e) { /* no matchMedia */ }
  document.documentElement.setAttribute("data-input", pinIn === "touch" || pinIn === "mouse" ? pinIn : (coarse ? "touch" : "mouse"));
  if (q.get("chrome") === "1") document.documentElement.dataset.chrome = "1";
  if (q.get("capture") === "1") document.documentElement.dataset.capture = "1";
})();
</script>`;
}

/** Every generated region of index.html, as a map name -> the text that goes between the markers. */
export function loaderParts() {
  const raw = JSON.parse(read('src/anime/assets/runner/runner.json'));
  assertRunnerAllowed(raw);
  // the gauge's fish is the logo's own カツオ (cloned at runtime). The region only names the character.
  const runnerMarkup = `<svg class="runner" id="fish" data-character="bonito" viewBox="-66 -32 122 61" aria-hidden="true"></svg>`;
  const tipsFile = join(ROOT, 'data/loading-tips.json');
  const tips = existsSync(tipsFile) ? JSON.parse(readFileSync(tipsFile, 'utf8')) : FALLBACK_TIPS;
  const css = read('src/anime/ui/loader/loader.css').trimEnd();
  const motion = plainJs(read('src/anime/ui/loader/title-motion.js'));
  const boot = plainJs(read('src/anime/ui/loader/title-boot.js'));
  return {
    css: `<style id="klc-loader-css">\n${css}\n</style>`,
    slot: slotScript(),
    logo: read('src/anime/assets/loader/title-logo-sun.svg').trim(),
    runner: runnerMarkup,
    tips: `<script type="application/json" id="klc-tips">${tipsJson(tips)}</script>`,
    sky: skyScript(),
    boot: `<script>\n${motion}\n${boot}\n</script>`,
  };
}

const re = (name) => new RegExp(`(<!--klc:${name}-->)[\\s\\S]*?(<!--/klc:${name}-->)`);
/** Put the parts between their markers. Throws when a marker pair is missing, so a region can never silently stop being generated. */
export function applyParts(html, parts) {
  let out = html;
  for (const [name, text] of Object.entries(parts)) {
    if (!re(name).test(out)) throw new Error(`index.html has no <!--klc:${name}--> ... <!--/klc:${name}--> region`);
    out = out.replace(re(name), (_, a, b) => a + text + b);
  }
  return out;
}

if (import.meta.main) {
  const file = join(ROOT, 'src/anime/index.html');
  const before = readFileSync(file, 'utf8'), after = applyParts(before, loaderParts());
  if (process.argv.includes('--check')) {
    if (before !== after) { console.error('src/anime/index.html is out of date: run `env -u NODE_OPTIONS bun scripts/anime/loader-inline.js`'); process.exit(1); }
    console.error('loader inline regions are up to date');
  } else {
    if (before !== after) writeFileSync(file, after);
    console.error(before === after ? 'index.html already up to date' : `index.html updated (${after.length} bytes)`);
  }
}
