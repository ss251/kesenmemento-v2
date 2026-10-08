// [r2:3] The renderer paints a flat top about 3.5 L* lighter than the colour it is given: Earth 2026-03-11 reads the flat roofs of the 12 cells as mid-grey concrete or membrane, while
// the app drew them near white (and often slightly pink): flat lots (464 in the cells) were 11.0 L* brighter than Earth in median, 72 % of them more than 5 L* too bright. Two causes
// stacked: the stored colour was already too light (data: the Earth readings in data/anime/overrides and the GSI -> paint transform of scripts/anime/enrich/fold.js, fitted on
// data/anime/earth-roofs.json), and this renderer residual (a flat top faces the sun squarely and the toon ramp + grade lift it; a pitched roof is shaded 3 L* darker instead:
// scripts/anime/enrich/fold.js RENDER_DL). The data fix brings the stored colour to the Earth median; THIS only takes the residual out, so the app lands on Earth and not 3.5 below it.
// The stored colour is untouched (the layout, search and the sheets keep the Earth colour); the three town builders (mid.js, blocks.js, industrial.js) and the hero kit paint flatPaint(colour).
export const FLAT_PAINT_DL = 3.5;
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const srgb = (c) => { c = Math.max(0, Math.min(1, c)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055); };
const cache = new Map();
/** '#rrggbb' -> '#rrggbb' with CIE L* lowered by FLAT_PAINT_DL (chroma and hue kept) */
export function flatPaint(hex, dL = FLAT_PAINT_DL) {
  const key = hex + '|' + dL;
  let out = cache.get(key); if (out) return out;
  const n = parseInt(String(hex).slice(1), 16), R = lin((n >> 16) & 255), G = lin((n >> 8) & 255), B = lin(n & 255);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047, Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B, Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const L = Math.max(0, 116 * f(Y) - 16 - dL), a = 500 * (f(X) - f(Y)), b = 200 * (f(Y) - f(Z));
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200, g = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = 0.95047 * g(fx), y = g(fy), z = 1.08883 * g(fz);
  const rgb = [srgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z), srgb(-0.969266 * x + 1.8760108 * y + 0.041556 * z), srgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z)];
  out = '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  cache.set(key, out);
  return out;
}
