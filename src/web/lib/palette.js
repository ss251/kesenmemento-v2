// Roof colour quantiser for "model mode" (ADDENDUM): sample the GSI aerial photo at a roof and snap it to the
// physical model's palette. Classification in HSV beats nearest-RGB on aerial photos, which are hazy and dark.
export const ROOF_PALETTE = {
  red: [0.71, 0.33, 0.29],
  blue: [0.34, 0.47, 0.62],
  brown: [0.56, 0.42, 0.31],
  grey: [0.64, 0.65, 0.66],
  white: [0.95, 0.94, 0.91],
};
export const ROOF_NAMES = Object.keys(ROOF_PALETTE);

export function rgbToHsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}

/** rgb in 0..1 (an averaged roof sample) -> palette name. */
export function quantizeRoof(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b);
  if (v > 0.72 && s < 0.16) return "white";
  if (s < 0.14) return v > 0.6 ? "white" : "grey";
  if (h >= 180 && h < 260) return "blue";
  if (h < 18 || h >= 330) return s > 0.3 ? "red" : "brown";
  if (h < 50) return s > 0.5 && v > 0.45 && h < 28 ? "red" : "brown";
  if (h < 180) return s < 0.25 ? "grey" : h > 150 ? "blue" : "grey";   // greenish roofs are rare; moss/shadow -> grey
  return "blue";
}

export function roofColour(r, g, b) { return ROOF_PALETTE[quantizeRoof(r, g, b)]; }
