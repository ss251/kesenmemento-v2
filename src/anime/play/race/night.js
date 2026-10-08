// The night race sat under a dark-blue veil. It was not a sheet left open.
// Preset 夜 (19:30) lights the street from above with a blue hemisphere and a
// blue moon, then adds bloom 0.58 + 0.24 and a wide glow 0.32 + 0.22. The
// composite also cools dark pixels toward blue. sky.setTime writes that every
// frame, before this runs. For the frames the race owns, the fill goes neutral
// so asphalt stays grey, the wide glow is off, and the cool-shadow mix is
// held back (uNeutral). Lamp bloom stays, tight. The city's other nights stay
// on the life grade: the next setTime restores them once the race lets go.

export const CRISP_NIGHT = {
  bloom: 0.28,
  glow: 0,
  exposure: 1.24,
  vignette: 0.05,
  neutral: 1,
  hemiI: 1.35,
  sunI: 0.38,
  // Neutral fill from above (the road faces the sky colour, not the ground).
  hemiSky: 0xc8c2b4,
  hemiGround: 0x8d6e4c,
  sun: 0xffe2b0,
};

export function applyCrispNight(ctx) {
  const u = ctx?.pipeline?.compMat?.uniforms;
  if (u) {
    if (u.uBloom) u.uBloom.value = CRISP_NIGHT.bloom;
    if (u.uGlow) u.uGlow.value = CRISP_NIGHT.glow;
    if (u.uExposure) u.uExposure.value = CRISP_NIGHT.exposure;
    if (u.uVignette) u.uVignette.value = CRISP_NIGHT.vignette;
    if (u.uNeutral) u.uNeutral.value = CRISP_NIGHT.neutral;
  }
  const sky = ctx?.sky;
  if (sky?.hemi) {
    sky.hemi.intensity = CRISP_NIGHT.hemiI;
    sky.hemi.color?.setHex?.(CRISP_NIGHT.hemiSky);
    sky.hemi.groundColor?.setHex?.(CRISP_NIGHT.hemiGround);
  }
  if (sky?.sun) {
    sky.sun.intensity = CRISP_NIGHT.sunI;
    sky.sun.color?.setHex?.(CRISP_NIGHT.sun);
  }
}
