// [cafe-rst] The street front of café RST: the ground-floor openings of 迎's ANCHOR face. One table shared by harbor/minami5.js
// (which leaves the openings open in the khaki wall and draws no painted glass over them) and explore/cafe-rst.js (which builds
// the room, the glazing, the door and the lit interior behind them).
//
// Hard scale: the ANCHOR face is the surveyed plane of harbor/minami5.js ANCHOR (197 SfM points, rms 0.029 m; P1 / P2 its NW and
// SE ends, sigma ~0.27 m along the face); P3 is the SE face's bay end (GSI outline); the floor and sidewalk are T.P. 2.62
// (anchor.floor). They are copied here, not imported, so neither builder imports the other (test/v8-cafe-rst.test.js pins them
// against ANCHOR). ENU metres, x east, z south.
export const FRONT = Object.freeze({ P1: Object.freeze([-15.34, 44.16]), P2: Object.freeze([-8.77, 51.09]), P3: Object.freeze([-3.9, 47.4]), floor: 2.62 });

/** Length of the face and its unit vectors: `u` from P1 (NW end) to P2 (SE end), `n` the OUTWARD (street) normal. */
export const FACE = (() => {
  const dx = FRONT.P2[0] - FRONT.P1[0], dz = FRONT.P2[1] - FRONT.P1[1], len = Math.hypot(dx, dz), u = [dx / len, dz / len];
  return Object.freeze({ len, u: Object.freeze(u), n: Object.freeze([-u[1], u[0]]) });
})();

/**
 * The openings in the face at ground level: x = metres along the face from P1, z = metres above the floor. Basis: the exterior
 * photos (the take-away window, the door and the big café window are at these spans on the façade: the existing exterior put the
 * neon fascia over x 0-2.8 and the window at x 0.12-1.9) and the measured interior plan (docs/anime/interiors-cafe-rst.md).
 * PROVISIONAL until the plan is fitted.
 */
export const OPENINGS = Object.freeze([
  Object.freeze({ id: 'takeaway', kind: 'window', x0: 0.25, x1: 1.85, z0: 1.0, z1: 2.25 }),
  Object.freeze({ id: 'door', kind: 'door', x0: 1.95, x1: 2.85, z0: 0, z1: 2.05 }),
  Object.freeze({ id: 'bay', kind: 'window', x0: 3.15, x1: 9.05, z0: 0.85, z1: 2.35 }),
]);
