// [play:underwater] Numbers for the dive. Starting values are PLAY-DESIGN-2.md §D (4 m/s, 9 m/s dash).
// Tuned by playing: the coast and the breach arc. The look (浅葱 → 藍, the leap) stays as designed.

export const TUNE = {
  cruise: 4,
  dash: 9,
  /** exponential approach while a stick is held, 1/s */
  accel: 8,
  /** exponential coast with the stick released, 1/s. Slower than accel, so the water keeps you moving. */
  drag: 1.55,
  strafe: 0.62,
  /** added to the facing when 上昇 / 下降 is held. Facing pitch already carries part of the climb. */
  lift: 0.78,
  staminaMax: 2.6,
  staminaCost: 1,
  staminaRegen: 0.85,
  /** a new dash waits until the tank is back above this fraction */
  staminaRestart: 0.34,
  /** just under the surface, the fish stays wet unless it is leaping */
  surfaceHold: -0.22,
  /** upward speed, m/s, that leaves the water when the body is at surfaceHold */
  breachVy: 5.15,
  /** total speed that must go with it, so a slow drift does not hop */
  breachSpeed: 6.1,
  /** the leap's initial upward speed. Apex is about vy² / (2 g). */
  breachKick: 9.4,
  breachG: 10.2,
  reenterY: -0.35,
  /** metres of water kept under the belly */
  clearance: 0.42,
  /** shoreDist below this is land: slide back */
  shoreKeep: 0.85,
  ropeDepth: 8,
  camBack: 3.55,
  camUp: 0.82,
  camLook: 0.22,
  /** added at the top of the leap (metres, degrees, radians). Enough to feel the hang, close enough that the fish stays the subject. */
  beatBack: 4,
  beatUp: 1.5,
  beatFov: 11,
  beatRoll: 0.16,
  /** first breach of a dive: 0.2 s of wall time at the apex runs at this fraction of speed. */
  apexHold: 0.2,
  apexScale: 0.28,
  /** a short field-of-view kick on the way out and on the way back in. Degrees. */
  punchFov: 6.5,
  punchDur: 0.16,
  /** a tap above this height starts a barrel roll. */
  trickMinY: 1.15,
  spinRate: 11.5,
  spinDrag: 0.45,
  /** bay mouth gate, metres. Seaward of it (and outside the radius) you are a カツオ. route.js BAY_MOUTH. */
  mouth: { x: 2025, z: 7425, r: 400 },
  /** new longlines stay this far from the ship channel. Photographed rafts are not moved. */
  channelClear: 80,
  /** イワシ, about 15 cm: they keep a body length apart, read their neighbours within 1.7 m, and part round you at 2.2 m. */
  school: {
    neigh2: 1.7 * 1.7, sep2: 0.32 * 0.32, sep: 6, coh: 1.6, ali: 1.8, home: 1.2, avoid: 9, avoid2: 2.2 * 2.2, speed: 1.5,
    /** a dash inside this radius throws the school apart; cohesion brings it back when the dash stops. */
    scatter: 4.4, scatter2: 8 * 8, scatterSpeed: 4.5,
  },
};

export const SPECIES = {
  ainame: { id: 'ainame', ja: 'アイナメ', en: 'Greenling', scale: 0.86 },
  katsuo: { id: 'katsuo', ja: 'カツオ', en: 'Bonito', scale: 1.18 },
};
