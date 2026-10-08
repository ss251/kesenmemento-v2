// [play] 金のカツオ rules. Distances and the ヨナ抜き steps are the design's;
// a playtest is what changes them.

export const YONANUKI = [0, 2, 4, 7, 9, 12];
export const MILESTONES = [10, 25, 40];
export const TOTAL = 50;
export const SHIMMER_M = 40;
export const GLINT_M = 180;
// Screen-size floor. A 0.9 m charm at 60 m is only a few pixels; the star
// never drops below this, and flares by GLINT_FLASH every 2.2 s. The peak
// is about 59 px. 36 px sat on the beige quay and did not read in a full
// frame. The star is a DOM sprite, so the flare never enters the bloom pass.
export const GLINT_PX = 14;
export const GLINT_FLASH = 4.2;
// A 60 m gap is 59 m of running after the two 2.5 m pickup radii. At 6.4 m/s
// that is 9.2 s, so the design's 6 s never stepped the scale on foot. 12 s
// keeps the combo if you run the opening quay, and a walk breaks it.
export const COMBO_S = 12;
export const GLINT_REST = 1;
export const SWIM_R = 3.2;

/** Metres. Menu, photo and interior do not collect. Swim is the water column. */
export function pickupRadius(mode) {
  if (mode === 'walk') return 2.5;
  if (mode === 'drive' || mode === 'fly') return 4;
  if (mode === 'sail') return 9;
  if (mode === 'swim') return SWIM_R;
  return 0;
}

/** World metres for a sprite `GLINT_PX` CSS pixels tall at `dist` metres. */
export function glintMetres(dist, fovDeg, viewPx) {
  const fov = (fovDeg || 55) * Math.PI / 180;
  const vh = viewPx > 0 ? viewPx : 900;
  return GLINT_PX * (2 * Math.tan(fov * 0.5) * dist) / vh;
}

/** Next step on the scale. `prev` is -1 before the first, or the last step. */
export function nextCombo(prev, sinceSec) {
  if (!(sinceSec <= COMBO_S) || prev < 0) return 0;
  return Math.min(YONANUKI.length - 1, prev + 1);
}

export function comboPitch(step) {
  return YONANUKI[step] || 0;
}

export function comboName(step) {
  return step <= 0 ? 'chime' : 'combo';
}

/** Squared falloff, 0 at SHIMMER_M and beyond. */
export function shimmerGain(dist) {
  if (!(dist >= 0) || dist >= SHIMMER_M) return 0;
  const u = 1 - dist / SHIMMER_M;
  return u * u;
}

export function isMilestone(n) {
  return MILESTONES.indexOf(n) >= 0;
}

export function isFinale(prev, next, total = TOTAL) {
  return prev < total && next >= total;
}
