// [play] The 50/50 shells. Pure plan: the mesh in fx.js only launches this.
// 5–7 shells over `seconds`, each 160–240 particles, 60–90 m across,
// about 250 m up. 菊 trails, 牡丹 droops. PLAY-UI-STYLE / the round-3 brief.

export const FW_ALT = 250;
export const FW_PALETTE = Object.freeze([
  [0.540, 0.394, 0.000], // 山吹 #F8B500, scaled so the peak channel is 0.54
  [0.540, 0.118, 0.135], // 茜 #B7282E
  [0.000, 0.503, 0.540], // 浅葱 #00A3AF
  [0.540, 0.540, 0.523], // white
  [0.540, 0.372, 0.420], // soft pink
]);

/** Seconds. Light is instant; the boom waits for the air. */
export function boomDelay(dist) {
  if (!(dist > 0)) return 0;
  return dist / 340;
}

function rnd(state) {
  state.s = (state.s + 0x6d2b79f5) | 0;
  let t = Math.imul(state.s ^ (state.s >>> 15), 1 | state.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The finale's last three shells open together, a beat apart (s). */
export const FW_VOLLEY = 0.4;

/**
 * `count` is clamped to 5–7. The sequence builds like a harbour festival's: single
 * shells walk across the sky, then the last three go up as one volley (left, centre,
 * right), so at the peak three chrysanthemums are open at once. The volley starts at
 * 80 % of `seconds`, so it has room to open and fade before the end.
 */
export function planShells({ seconds = 25, count = 6, seed = 1 } = {}) {
  const n = Math.max(5, Math.min(7, count | 0));
  const span = Math.max(1, Number(seconds) || 25);
  const state = { s: (seed | 0) || 1 };
  const lead = n - 3;
  const volleyAt = span * 0.8;
  const out = [];
  for (let i = 0; i < n; i++) {
    const inVolley = i >= lead;
    const k = i - lead;
    const t = inVolley ? volleyAt + k * FW_VOLLEY : 0.45 + (i / lead) * (volleyAt - 0.45 - 2.2);
    // Lead shells step across the sky; the volley spreads left, centre, right.
    const ox = inVolley ? (k - 1) * 46 + (rnd(state) - 0.5) * 8 : ((i % 3) - 1) * 30 + (rnd(state) - 0.5) * 18;
    out.push({
      t: Math.round(t * 1000) / 1000,
      kind: i % 2 ? 'botan' : 'kiku',
      n: 180 + Math.floor(rnd(state) * 41),
      ox: Math.round(ox * 10) / 10,
      oz: Math.round((rnd(state) - 0.5) * 40 * 10) / 10,
      y: Math.round((FW_ALT - 14 + rnd(state) * 28) * 10) / 10,
      diam: Math.round((inVolley ? 76 + rnd(state) * 12 : 64 + rnd(state) * 20) * 10) / 10,
      color: i % FW_PALETTE.length,
    });
  }
  return out;
}
