// [v3:town] The town palette (V3-SPEC section 5): the layout's photo-sampled colours pushed toward an anime harbour
// town: warm cream / beige / pale-blue / mint / peach walls, dark green, slate, navy, brown, red and terracotta
// pitched roofs, green-coated or warm-grey flat roofs, faded blue / cream / sea-green warehouse sheds. Deterministic
// by lot seed.
const WALLS = ['#efe6d2', '#e9dcc4', '#f1e7d6', '#e3d4b8', '#ecd8c6', '#d9e2e6', '#c9d9e2', '#d3e0d0', '#e8e0cc', '#f0e2c6', '#dccfbd', '#e6d9d0', '#cfdcd6', '#efe2b6'];
const PITCHED = ['#4d6457', '#56677a', '#3e4a63', '#6a5448', '#8e4540', '#a0573f', '#4a78a0', '#5d6f86', '#4a5f55', '#56677a', '#4d6457', '#6f5a4a'];
const FLAT = ['#8fa396', '#a8a39a', '#9aa7a2', '#b7b3a8', '#7f978a', '#a3a9ad'];
const SHED = ['#a9c3d4', '#c9d4d8', '#e3ddd0', '#b8c7b8', '#d6d2c6', '#9fb6c9', '#c7c1b4', '#b2bec9'];
const PALE_ROOF = new Set(['#d8dbd6', '#b9bab4', '#dcdcd4']);
const GREY_ROOF = new Set(['#7b8691', '#4a4f58']);

const h = (seed, k) => { let x = (seed ^ (k * 0x9e3779b1)) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

/** Wall colour: keep the layout's pastel 55 % of the time, otherwise a warmer palette colour. */
export function wallOf(lot) {
  if (lot.kind === 'warehouse' || lot.kind === 'factory') return SHED[Math.floor(h(lot.seed, 1) * SHED.length)];
  return h(lot.seed, 2) < 0.55 ? lot.wall : WALLS[Math.floor(h(lot.seed, 3) * WALLS.length)];
}
/** Pitched roof colour: the photo colour unless it is pale / grey (then the anime roof palette). */
export function pitchedRoofOf(lot) {
  const c = lot.roof.color;
  if (PALE_ROOF.has(c) || (GREY_ROOF.has(c) && h(lot.seed, 4) < 0.65)) return PITCHED[Math.floor(h(lot.seed, 5) * PITCHED.length)];
  return c;
}
/** Flat roof colour: green waterproof coating, warm grey or the photo colour. */
export function flatRoofOf(lot) {
  const k = h(lot.seed, 6);
  if (k < 0.45) return FLAT[Math.floor(h(lot.seed, 7) * FLAT.length)];
  return PALE_ROOF.has(lot.roof.color) ? '#c2bfb6' : lot.roof.color;
}
export { WALLS, PITCHED, FLAT, SHED };
