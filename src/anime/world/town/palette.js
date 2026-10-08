// [v3:town] The town palette (V3-SPEC section 5): the layout's photo-sampled colours pushed toward an anime harbour
// town: white / grey / cream walls with a few salmon and dark ones (sys:9), dark green, slate, navy, brown, red and terracotta
// pitched roofs, green-coated or warm-grey flat roofs, faded blue / cream / sea-green warehouse sheds. Deterministic
// by lot seed.
// [sys:9] the weighted wall scheme of scripts/anime/derive.js WALLS.house (author photos: white 35 %, grey 20 %, cream 22 %, salmon 6 %,
// dark 8 %, pale blue 4 %, other 5 %; no mint). Repeat an entry to weight it. wallOf draws from it 45 % of the time.
const rep = (arr, n) => Array.from({ length: n }, (_, i) => arr[i % arr.length]);
const WALLS = [...rep(['#f6f4e6', '#f2f0e8', '#eceae0', '#f5f5f0', '#e8e6dc'], 14), ...rep(['#bab9aa', '#c4c4bf', '#a9aaa5', '#8c8e89', '#b5b6b0', '#cfcfca'], 8), ...rep(['#efe6d2', '#e3d4b8', '#e8e0cc', '#e5dabc', '#f0e9cc'], 9),
  ...rep(['#e1c6ae', '#e6cbbd'], 2), ...rep(['#55585d', '#3f434a', '#6b5a4c'], 4), ...rep(['#c4ccd4', '#cfd6dc'], 1), ...rep(['#d9b48c', '#d6c8a0'], 2)];
const PITCHED = ['#4d6457', '#56677a', '#3e4a63', '#6a5448', '#8e4540', '#a0573f', '#4a78a0', '#5d6f86', '#4a5f55', '#56677a', '#4d6457', '#6f5a4a'];
const FLAT = ['#8fa396', '#a8a39a', '#9aa7a2', '#b7b3a8', '#7f978a', '#a3a9ad'];
const SHED = ['#a9c3d4', '#c9d4d8', '#e3ddd0', '#b8c7b8', '#d6d2c6', '#9fb6c9', '#c7c1b4', '#b2bec9'];
const PALE_ROOF = new Set(['#d8dbd6', '#b9bab4', '#dcdcd4']);
const GREY_ROOF = new Set(['#7b8691', '#4a4f58']);

const h = (seed, k) => { let x = (seed ^ (k * 0x9e3779b1)) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

/** Wall colour: keep the layout's pastel 55 % of the time, otherwise a warmer palette colour. */
export function wallOf(lot) {
  if (lot.src?.wall === 'osm' || lot.src?.wall === 'override') return lot.wall;   // [v4:data] OSM building:colour is the real wall colour  [v4:overrides] or an override's
  if (lot.kind === 'warehouse' || lot.kind === 'factory') return SHED[Math.floor(h(lot.seed, 1) * SHED.length)];
  return h(lot.seed, 2) < 0.55 ? lot.wall : WALLS[Math.floor(h(lot.seed, 3) * WALLS.length)];
}
/** Pitched roof colour: the photo colour unless it is pale / grey (then the anime roof palette). */
export function pitchedRoofOf(lot) {
  const c = lot.roof.color;
  if (lot.src?.color === 'aerial' || lot.src?.color === 'osm' || lot.src?.color === 'override') return c;   // [v4:data] the measured roof colour (aerial photo / OSM)  [v4:overrides]
  if (PALE_ROOF.has(c) || (GREY_ROOF.has(c) && h(lot.seed, 4) < 0.65)) return PITCHED[Math.floor(h(lot.seed, 5) * PITCHED.length)];
  return c;
}
/** Flat roof colour: green waterproof coating, warm grey or the photo colour. */
export function flatRoofOf(lot) {
  if (lot.src?.color === 'aerial' || lot.src?.color === 'osm' || lot.src?.color === 'override') return lot.roof.color;   // [v4:data] measured  [v4:overrides]
  const k = h(lot.seed, 6);
  if (k < 0.45) return FLAT[Math.floor(h(lot.seed, 7) * FLAT.length)];
  return PALE_ROOF.has(lot.roof.color) ? '#c2bfb6' : lot.roof.color;
}
/** [v4:town-accuracy] Does a roof colour read as 瓦 (grey / silver / charcoal / black or a dark brown glaze)? Painted
 *  metal roofs are the saturated ones (red, blue, green) and the pale ones; the kawara texture would mis-colour them. */
export function kawaraColour(hex) {
  const n = parseInt(String(hex).slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0;
  return mx < 150 && s < 0.36;
}
/** [sys:31] A wall colour that was measured (OSM building:colour, an override) is the wall; builders keep their random
 *  draws and replace only the result. */
export const measuredWall = (lot) => lot.src?.wall === 'osm' || lot.src?.wall === 'override';
export { WALLS, PITCHED, FLAT, SHED };
