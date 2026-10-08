// [play:hoya3d] 3D ホヤぼーや: 気仙沼市観光キャラクター「海の子 ホヤぼーや」 as the walking third-person avatar.
//
// Built only from Kesennuma City's design manual (デザインマニュアル, updated 2026-05-20, 28 pages) and the city's own
// published stills. Procedural three.js geometry: no model file, no texture, nothing traced from anyone else's art.
// docs/play/HOYA3D.md has every number with its page, and says what is specified and what is interpretation.
//
// THE CITY MUST APPROVE ANY 3D OR ANIMATED USE (立体物・動画: the city's 取扱要綱 and its page). The owner switched it
// on for the demo on 2026-10-07 13:20 IST and will ask the city on demo day (Sat 10 Oct); the avatar lane keeps the
// switch (?hoya3d=0, the notebook toggle). The credit goes wherever he is shown (manual p.4):
//   気仙沼市観光キャラクター「海の子 ホヤぼーや」  /  Kesennuma City Mascot,Hoya Boya the Ocean Boy
//
// The manual's NG list (p.5) and how this model keeps it: his colours exactly (p.2), the black (K100) line never
// thicker than drawn, no deformation (no squash-and-stretch scaling: poses only), the サンマ sword and nothing else in
// his hand, no hat, his proportions, no parts apart, his face as drawn (the only other eye is the closed ⌒ the manual
// itself draws, NO.15-3, and the jump's wink as NO.1-16 / NO.1-29 draw it), no text on him, never filled in dark (a
// lift keeps his colours at night).
//
// v2 (2026-10-08, measured against the manual's own files; docs/play/HOYA3D.md "v2"): the face as the manual draws him
// off-axis (FACE_VIEW: the head's drawing moves round the head by view, the head's shape never), two-tone flat colour
// (HOYA_TONE), the walk, run and jump from the manual's drawings (HOYA_GAIT; cadence in, hoyaGait()/gait() out), the
// cape flaring in motion (NO.9-1), the サンマ's two edges and the back marks as measured.
//
// Units: the design numbers are in U = half the width of his head (its surface; 393 px in the city's NO.1-1.png). The
// model is in metres: 1.10 m from the soles to the top of the siphon knobs (3.845 U). Origin between the soles, +Y up,
// facing -Z, his right hand (the sword) on +X.
//
// Cost: ONE geometry drawn twice: the cel body (vertex colours, no texture) and the black line (an inverted hull on
// LAYER_NO_OUTLINE, so the world's edge pre-pass ignores it). The parts are rigid groups posed procedurally every frame.
// The groups are THREE.Bones so that the whole figure stays two draw calls and so that the world's outline pre-pass (an
// override material that follows skinning) and the shadow pass see the pose; nothing is rigged by hand or weight-painted:
// every vertex belongs to one part, except the soft bends at the elbows and knees and down the cape.

export const HOYA_HEIGHT = 1.1;                    // m, soles to the top of the siphon knobs
export const HOYA_U = 3.845;                       // the same height in U (NO.1-1: the two knobs' tops averaged, 1511 px / 393 px)
export const HOYA_SCALE = HOYA_HEIGHT / HOYA_U;    // m per U

/** The official colours (manual p.2, process CMYK) in the city's own sRGB export of the standard pose (NO.1-1.png,
 *  the same values in NO.13-2.png). The manual's colour page shows ONE yellow for the legs, the guard and the button. */
export const HOYA_COLORS = Object.freeze({
  ink: '#000000',   // K100     the line, the eyes
  hoya: '#F0831F',  // Y90 M60  the ホヤ head, the belt, the soles
  face: '#FFFFFF',  //          the face, the ホタテ (scallop) buckle
  nose: '#F4B4D0',  // M40      the nose
  suit: '#57C4F1',  // C60      body suit, arms, hands
  cape: '#4384C5',  // C80 M40  the shark-skin cape, the collar
  legs: '#FDD119',  // Y90 M20  legs and boots, the sword's guard, the collar button
  sanma: '#D3D3D4', // K30      the サンマ (Pacific saury) sword
});

/** Line weights in U (NO.1-1: the outline and the hood's marks 19 px; the siphon marks, the mouth and the scallop
 *  ribs 12.6-13 px; the nose ring 19.6 px). The outline is an inverted hull, so it lies outside the surface: the
 *  surface is the inner edge of the drawn line. */
export const HOYA_LINE = Object.freeze({ outline: 0.0483, thin: 0.033, mouth: 0.032, nose: 0.05 });

// ------------------------------------------------------------------ the design (U; head-centre frame for the head)
// Head: an ellipsoid. Front view NO.1-1: the outline's centre line is an ellipse 402.5 x 350 px round (657.5, 553.5),
// so the surface (its inner edge) is 393 x 340.5 px = 1 x 0.866 U. Depth: the profile NO.15-31 is 1.09 x its height.
const HEAD = { y: 2.632, rx: 1.0, ry: 0.866, rz: 0.95 };
// The face opening (the hood's front edge): front view, centre line of the drawn line, the x >= 0 half (mirrored), from
// the notch between the two humps to the flap tip on the outline (NO.1-1, its clean right-hand side, 393 px/U).
const FACE_HALF = [[0, 0.279], [0.058, 0.297], [0.118, 0.324], [0.179, 0.347], [0.242, 0.365], [0.308, 0.377], [0.376, 0.378],
  [0.443, 0.368], [0.505, 0.347], [0.561, 0.312], [0.609, 0.264], [0.641, 0.206], [0.663, 0.144], [0.676, 0.079], [0.681, 0.01],
  [0.678, -0.06], [0.666, -0.125], [0.65, -0.19], [0.627, -0.251], [0.612, -0.315], [0.615, -0.383], [0.645, -0.441],
  [0.696, -0.485], [0.757, -0.508], [0.805, -0.541]];
const FACE_O = [0, -0.15];          // the face contour is star-shaped round this point (used for the bulge)
// The face lies on the head itself. (v1 raised it 0.06 U to bring the profile toward NO.15-31; NO.15-31 measures the
// face's front 0.93 U from the head centre at the eye row, which is the plain head (0.938), and the face view now gives
// the profile its face. A raised face also creased the line where it met the hood.)
const FACE_BULGE = 0;
// Face features (front view, U from the head centre; NO.1-1, mirrored to symmetry).
const EYE = { x: 0.295, y: -0.137, r: 0.057 };
const NOSE = { y: -0.272, rx: 0.0547, ry: 0.0471, rz: 0.045 };        // the pink inside the black ring (M40)
const MOUTH = [[-0.249, -0.472], [-0.121, -0.524], [0, -0.538], [0.121, -0.524], [0.249, -0.472]];
const CLOSED_EYE = { w: 0.068, h: 0.036 };   // the ⌒ the manual draws for a closed eye (NO.15-3, the wink NO.1-29)
// The hood's bumps (ホヤの突起), short strokes as wide as the outline. Front view NO.1-1; back view NO.9-1 (small,
// read at 913 px). The x >= 0 side; the others are mirrored.
const MARKS_FRONT = [
  [[-0.116, 0.676], [0, 0.757], [0.116, 0.676]],                         // ^ on top
  [[0.469, 0.605], [0.614, 0.597], [0.644, 0.459]],                      // the upper corners
  [[0.829, 0.118], [0.909, 0.001], [0.829, -0.112]],                     // > on the sides
];
// v2: re-measured on NO.9-1 at its own scale (172 px/U, the head centre from its top and its widest row): the ^ centres
// 0.17 U above the head centre, the corners 0.45 U, the chevrons 0.18 U below; v1 sat all three ~0.13 U lower
const MARKS_BACK = [
  [[-0.16, 0.08], [0, 0.22], [0.16, 0.08]],                              // ^ in the middle of the back
  [[0.385, 0.53], [0.585, 0.518], [0.6, 0.37]],                          // the upper corners
  [[0.62, -0.05], [0.726, -0.181], [0.65, -0.277]],                      // the lower chevrons
];
// The two siphons (入水孔 "+" on his right, 出水孔 "-" on his left, as on a real ホヤ). Front view NO.1-1: the knob
// centres 0.870 U out and 1.014 U above the head centre, radius 0.198 U (surface); the stalks lean 37 deg out and aim at
// the centre line 0.12 U below the head centre; 0.118 U thick at the head, 0.100 at the knob. Profile NO.15-31: the
// knob sits about 0.3 U behind the head's centre.
const SIPHON = { x: 0.8704, y: 1.0137, z: 0.25, r: 0.198, base: [0, -0.12, -0.12], r0: 0.118, r1: 0.1, pivot: [0.6, 0.66, 0.02] };
// The marks on the knobs in knob radii, front view (x toward his right, +X): "+" on his right knob, "-" on his left.
const KNOB_PLUS = [[[0.685, 0.062], [-0.559, 0.126]], [[-0.174, 0.677], [0.262, -0.503]]];
const KNOB_MINUS = [[[0.403, 0.403], [-0.521, -0.174]]];

// Body (NO.1-1 rows; body centre x = 638 px; heights above the soles = (1588 - y px) / 393).
const TORSO = [   // [y, half-width, half-depth]: the yellow of the legs below the belt, the suit above
  [0.665, 0.24, 0.2], [0.695, 0.36, 0.27], [0.75, 0.415, 0.31], [0.82, 0.418, 0.315], [0.9, 0.39, 0.305], [0.98, 0.368, 0.292],
  [1.08, 0.365, 0.29], [1.2, 0.38, 0.292], [1.33, 0.405, 0.3], [1.46, 0.42, 0.3], [1.58, 0.405, 0.29], [1.7, 0.34, 0.25],
  [1.79, 0.21, 0.16]];
const PANTS_TOP = 1.0;               // the colour seam, hidden under the belt
const BELT = { y0: 0.934, y1: 1.12, out: 0.022 };
const SHELL = {   // NO.1-1 at 2x (U, from its middle): the fan, x >= 0 half from the top to the waist; the hinge; the ribs
  y: 1.07, d: 0.05,
  half: [[0, 0.172], [0.07, 0.168], [0.122, 0.148], [0.15, 0.11], [0.159, 0.064], [0.152, 0], [0.133, -0.038], [0.105, -0.062], [0.076, -0.083]],
  hinge: [[-0.08, -0.12], [-0.089, -0.168], [0.089, -0.168], [0.08, -0.12]],
  ribs: [[[0, 0.136], [0.004, 0.045]], [[0.126, 0.1], [0.065, -0.001]], [[-0.118, 0.088], [-0.062, -0.006]]],
};
const COLLAR_EDGE = [[0, 1.665], [0.03, 1.6], [0.07, 1.545], [0.13, 1.508], [0.22, 1.49], [0.31, 1.51], [0.37, 1.565], [0.41, 1.64],
  [0.44, 1.71], [0.5, 1.735]];       // the lower edge, front view: two rounded lobes meeting under the button
const BUTTON = { y: 1.646, r: 0.037 };
const SHOULDER = { x: 0.4, y: 1.6, z: 0.02 };
const ARM = { upper: 0.37, fore: 0.37, r0: 0.138, r1: 0.125, hand: [0.205, 0.2, 0.225], handOff: 0.16 };
const HIP = { x: 0.28, y: 0.7, z: 0.0 };
const LEG = { thigh: 0.2, shin: 0.2, r0: 0.168, r1: 0.155 };
const BOOT = { rx: 0.31, ry: 0.215, rz: 0.47, cy: 0.19, cz: -0.12 };
const CAPE = { top: 1.735, bottom: 0.86, w0: 0.46, w1: 0.84, z0: 0.235, z1: 0.42, wave: 0.042, thick: 0.022 };
// The サンマ sword (the colour page p.2 / NO.1-1): a straight blade 1.62 U from the guard to the snout, widest a quarter of
// the way down from the snout; a yellow crescent guard; the fish is held by its tail, whose fork shows below the fist.
// Strokes on the blade: [s from the snout (0) to the guard (1), f across the blade (-1..1, + toward his right)].
// v2: the blade's two edges measured on NO.1-1 (the grey's edges, row by row, against the line from the snout to the
// guard's middle): the fish is widest (0.31 U) about halfway, its back (the inner edge, toward his head) bulging near the
// head end and its belly (the outer edge) through the middle; v1's symmetric blade was 0.07 U too wide near the snout.
// [s from the snout (0) to the guard (1), the edge's distance from that line, U]
const SWORD = {
  len: 1.62, base: 0.33, thick: 0.38,
  outer: [[0, 0], [0.03, 0.026], [0.08, 0.056], [0.15, 0.089], [0.23, 0.119], [0.31, 0.143], [0.39, 0.155], [0.48, 0.163], [0.56, 0.161], [0.64, 0.154], [0.72, 0.141], [0.8, 0.121], [0.89, 0.093], [1, 0.058]],
  inner: [[0, 0], [0.03, 0.04], [0.08, 0.081], [0.15, 0.117], [0.23, 0.146], [0.31, 0.155], [0.39, 0.155], [0.48, 0.15], [0.56, 0.142], [0.64, 0.129], [0.72, 0.116], [0.8, 0.1], [0.89, 0.08], [1, 0.062]],
  guard: { w: 0.44, h: 0.115, d: 0.15 },   // NO.1-1: a straight top edge, a curved underside
  eye: [0.12, -0.1, 0.034],
  strokes: [[[0.124, 0.66], [0.2, 0.27]], [[0.26, 0.76], [0.3, 0.35], [0.26, -0.41]], [[0.37, 0.07], [0.97, -0.28]]],
  tail: [[0, -0.16], [0.045, -0.19], [0.2, -0.47], [0.1, -0.43], [0, -0.35], [-0.1, -0.43], [-0.2, -0.47], [-0.045, -0.19]],
};
// The sword's frame in the fist (bind pose): with the arm raised 125 deg it would stand 8 deg out; swordUp() in the
// animator turns the fist so it stands as in NO.1-1 (6.8 deg out) whatever the arm does.
const SWORD_GRIP = -(125 + 8) * Math.PI / 180;

// The face as the manual draws him off-axis (顔の見せ方). Every off-axis drawing slides the face round the head more than a
// rigid head can: NO.16-15 (a 12.5 deg turn, measured from the nose and the eyes) draws the face 8 % wider than a rigid
// head, and the profiles NO.15-31 / NO.10-7 put the eye 37-50 deg and the face's edge 85-87 deg round from the front
// (a rigid head: 17 and 43 deg). So the head's DRAWING (the face, its features, the hood's marks) is carried round the
// head's vertical axis by tan(W/2) = k tan(phi/2), phi = the azimuth from the face's centre, with
// k = 1 + FACE_VIEW.k sin^2(camera azimuth) cos^2(camera elevation): 1 from the front and the back (NO.1-1, NO.9-1 exact),
// 2.45 in profile, where the face's edge then lies 0.475 of the head's depth back from its front (NO.15-31 and NO.10-7:
// 0.472). The eyes move with `eyes` times the boost (1.08 at NO.16-15's 12.5 deg, where that fits its eyes to 0.01 U; in
// profile 0.16 of the depth back, the manual 0.146-0.195). The head's SHAPE never changes (every point stays on the ellipsoid, so
// the silhouette, the proportions and the line are the same from every side: no deformation); the eyes and the nose
// move whole, never stretched, and every ink stroke moves by its own centre line (its width never shears). Under the
// chin (below `bottom`, U from the head centre), where the face's edge already sits mid-head, the rows stay put (the
// head has extra rows across that band, so no triangle shears); behind him (`back`, degrees) the boost eases off, so
// the back view NO.9-1 is exact and a 3/4 back shows only the cheek's edge.
export const FACE_VIEW = Object.freeze({ k: 1.45, eyes: 1.2, bottom: [-0.7, -0.3], back: [90, 165] });
/** The azimuth phi (radians from the face's centre, + toward his left) carried to W for the boost k. */
export function faceWarp(phi, k) { return 2 * Math.atan(k * Math.tan(phi / 2)); }
/** The eyes' boost for the face's boost k (they move a little further round than the face, as the profiles draw them). */
export function faceEyeK(k) { return 1 + (k - 1) * FACE_VIEW.eyes; }
/** The boost for a camera at azimuth az round the head (0 = in front, + toward his left) and elevation el (radians). */
export function faceViewK(az, el = 0) {
  const s = Math.sin(az), c = Math.cos(el), b = 1 - smooth(FACE_VIEW.back[0] * DEG, FACE_VIEW.back[1] * DEG, Math.abs(az));
  return 1 + FACE_VIEW.k * s * s * c * c * b;
}
/** How much a row of the head (y in U from the head centre) takes part: 1 across the face, 0 at the siphons and under the chin. */
export function faceWarpRow(y) { return smooth(FACE_VIEW.bottom[0], FACE_VIEW.bottom[1], y); }

// Cel shading as the manual's flat colour: two tones only. Lit = the official colour; shade = one step (SHADE of the
// key light kept), the terminator at SHADE_AT of n.l. The sky's fill is the same from every side (a hemisphere light's
// sky-to-ground gradient would be a soft gradient on him), and he takes no shadow from the shadow map (his own big head
// would print a soft dark blot on his chest): only the clean step and the K100 line. The light's own colour reaches him
// at `hue` strength (its brightness in full): a sunset warms him as it warms the town, but his white stays white-ish and
// his colours stay his (p.5 NG: 色を変える).
export const HOYA_TONE = Object.freeze({ shade: 0.55, at: 0.1, hue: 0.4 });

// The walk and the run as the manual draws them: big strides on his short legs (NO.1-3, NO.1-8, NO.16-19, NO.16-20;
// from behind NO.9-1; the run NO.1-5, NO.1-11). The stance: the planted boot sweeps back exactly as far as the body
// travels (it never slides), rolling heel (toe up, `heel` deg) to toe (heel up, `toe` deg); the hips turn with the step
// (`hipYaw` deg) and the pelvis drops into the stride (`drop` U) so the leg can reach (`reach` U from its hip). The swing:
// the back boot kicks up (`kick` U, its orange sole to the back, `kickPitch` deg: NO.9-1, NO.1-5), the knee comes up
// (`lift` U, NO.16-20); late in the swing the front boot rises toe-up (`highStep` U) so its sole shows to the front, as
// NO.1-3 and NO.1-8 catch him, and the heel strikes toe-up (NO.16-19). A bounce from pose alone: the planted heel rises
// (`rise` deg) through the middle of the stance so the body goes up (`bounce` U) as the other leg passes. The run has a
// flight (`flight` U up). Legs 0.4 U: a walk stride of 0.20 m, a run of 0.20 m. Never a squash or a stretch: only the
// joints turn.
export const HOYA_GAIT = Object.freeze({
  walk: { stance: 0.56, reach: 0.27, hipYaw: 18, drop: 0.11, lift: 0.22, kick: 0.16, heel: 40, toe: 42, kickPitch: 40, highStep: 0.1, rise: 16, bounce: 0.08, flight: 0, maxHz: 4.2 },
  run: { stance: 0.36, reach: 0.26, hipYaw: 17, drop: 0.1, lift: 0.26, kick: 0.32, heel: 20, toe: 45, kickPitch: 60, highStep: 0.04, rise: 0, bounce: 0, flight: 0.06, maxHz: 5.5 },
  runFrom: 2.3, runTo: 3.6, walkFrom: 0.08, walkTo: 0.9,   // m/s: the walk -> run blend when the caller gives no `run`
});
/** [walk weight, run weight] for a speed (or an explicit run blend 0..1); they sum to the movement. Into `out` (no garbage). */
const gaitW = (speed, run, out = [0, 0]) => {
  const m = smooth(HOYA_GAIT.walkFrom, HOYA_GAIT.walkTo, speed), r = Number.isFinite(run) ? clamp(run, 0, 1) : smooth(HOYA_GAIT.runFrom, HOYA_GAIT.runTo, speed);
  out[0] = m * (1 - r); out[1] = m * r;
  return out;
};
const GAIT_W = [0, 0], GAIT_MIX = {};   // hoyaGait()'s scratch (it is called every frame by the cadence driver)
const gaitMix = (wR, out = {}) => { for (const k of Object.keys(HOYA_GAIT.walk)) out[k] = lerp(HOYA_GAIT.walk[k], HOYA_GAIT.run[k], wR); return out; };
/**
 * His stride at a speed, for the caller that drives the cycle (the movement lane): { travel, stance, run, hz }.
 * travel: metres the planted boot sweeps back in one stance (= how far the body may go per stance with no slide);
 * stance: the stance's share of a cycle; run: the run blend; hz: the cycle rate (cycles/s) with no slide, before any
 * clamp; rate: the cycle rate the animator uses when update() is given no cadence (hz capped at maxHz, so the steps
 * still read). A cycle is two steps (two footfalls). Pass `run` (0..1) to choose walk or run yourself (update() too).
 */
export function hoyaGait(speed, run) {
  const v = Math.max(0, speed || 0), w = gaitW(v, run, GAIT_W), wW = w[0], wR = w[1], wM = Math.min(1, wW + wR), r = wM > 1e-6 ? wR / wM : 0, G = gaitMix(r, GAIT_MIX);
  const travel = 2 * (G.reach + HIP.x * Math.sin(G.hipYaw * DEG)) * HOYA_SCALE * wM;
  const hz = travel > 1e-6 && v > 0.03 ? (v * G.stance) / travel : 0;
  return { travel, stance: G.stance, run: r, hz, rate: Math.min(G.maxHz, hz) };
}

const QUALITY = {
  high: { inkTol: 0.0035, shell: 2, head: [34, 20], headBand: 6, knob: [14, 9], stalk: 8, nose: [8, 5], torso: 14, collar: 22, limb: 8, limbRings: 6, hand: [10, 7], boot: 12, cape: [12, 5], blade: [8, 10], inkStep: 0.045, capSeg: 4 },
  phone: { inkTol: 0.008, shell: 1, head: [18, 10], headBand: 4, knob: [8, 5], stalk: 6, nose: [6, 4], torso: 10, collar: 14, limb: 6, limbRings: 3, hand: [8, 5], boot: 9, cape: [8, 3], blade: [6, 6], inkStep: 0.09, capSeg: 2 },
};
export const HOYA_QUALITIES = Object.freeze(Object.keys(QUALITY));
export const POSES = Object.freeze(['idle', 'walk', 'run', 'jump', 'fall']);

// ------------------------------------------------------------------ small maths
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const area2 = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

/** A full polyline from a half (x >= 0): mirrored end ... centre ... end. */
function mirrored(half) {
  const out = [];
  for (let i = half.length - 1; i > 0; i--) out.push([-half[i][0], half[i][1]]);
  for (const p of half) out.push([p[0], p[1]]);
  return out;
}
/** Resample a polyline (any dimension) at a fixed spacing; keeps both ends. */
function resample(pts, step) {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(...pts[i].map((v, k) => v - pts[i - 1][k])));
  const L = d[d.length - 1], n = Math.max(1, Math.round(L / step)), out = [];
  for (let s = 0, j = 1; s <= n; s++) {
    const t = (s / n) * L;
    while (j < d.length - 1 && d[j] < t) j++;
    const f = (t - d[j - 1]) / ((d[j] - d[j - 1]) || 1);
    out.push(pts[j].map((v, k) => lerp(pts[j - 1][k], v, f)));
  }
  return out;
}
/** Resample points with their normals together (arc length of the points). */
function resampleWith(P, N, step) {
  const both = P.map((p, i) => [...p, ...N[i]]), r = resample(both, step);
  return { P: r.map((q) => q.slice(0, 3)), N: r.map((q) => norm(q.slice(3, 6))) };
}
/** Douglas-Peucker: indices of the points to keep so the polyline stays within tol of the original. */
function dpKeep(P, tol) {
  const n = P.length; if (n <= 2 || !tol) return [...Array(n).keys()];
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let dm = -1, im = -1;
    const ab = sub(P[b], P[a]), L2 = dot(ab, ab) || 1e-12;
    for (let i = a + 1; i < b; i++) { const ap = sub(P[i], P[a]), t = clamp(dot(ap, ab) / L2, 0, 1), d = len(sub(ap, mul(ab, t))); if (d > dm) { dm = d; im = i; } }
    if (dm > tol) { keep[im] = 1; stack.push([a, im], [im, b]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
/** Catmull-Rom through points, n samples per span. */
function spline(pts, n = 4) {
  if (pts.length < 3) return pts.map((p) => p.slice());
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push(p1.map((_, k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

// ------------------------------------------------------------------ the face opening as a region of the head
const FACE_POLY = [...mirrored(FACE_HALF), [1.3, -0.6], [1.3, -1.3], [-1.3, -1.3], [-1.3, -0.6]];   // closed below: the chin is face
function inPoly(P, x, y) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
/** Signed distance to the face region in the front view (> 0 inside). */
export function faceSd(x, y) {
  let d = Infinity;
  for (let i = 0, j = FACE_POLY.length - 1; i < FACE_POLY.length; j = i++) d = Math.min(d, segDist(x, y, ...FACE_POLY[j], ...FACE_POLY[i]));
  return inPoly(FACE_POLY, x, y) ? d : -d;
}
const FACE_R = (() => {   // the contour's radius round FACE_O by angle (degrees)
  const R = new Float32Array(360);
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * TAU, dx = Math.cos(a), dy = Math.sin(a);
    let lo = 0, hi = 2;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (inPoly(FACE_POLY, FACE_O[0] + dx * m, FACE_O[1] + dy * m)) lo = m; else hi = m; }
    R[i] = lo;
  }
  return R;
})();
function faceBulge(x, y) {
  const dx = x - FACE_O[0], dy = y - FACE_O[1], r = Math.hypot(dx, dy);
  let a = Math.atan2(dy, dx); if (a < 0) a += TAU;
  const f = (a / TAU) * 360, i = Math.floor(f) % 360, R = lerp(FACE_R[i], FACE_R[(i + 1) % 360], f - Math.floor(f));
  const s = r / (R || 1);
  return s >= 1 ? 0 : FACE_BULGE * (1 - s * s);
}
const headE = (x, y) => 1 - (x / HEAD.rx) ** 2 - (y / HEAD.ry) ** 2;
function frontDepth(x, y) {   // the head's front surface is at z = -frontDepth (head-centre frame)
  const e = headE(x, y);
  return HEAD.rz * Math.sqrt(Math.max(0, e)) + (e > 0 && faceSd(x, y) > 0 ? faceBulge(x, y) : 0);
}
/** A point of the head (head-centre frame) and its normal; back = the back half (no bulge there). */
function headPoint(x, y, back = false) {
  const e = headE(x, y);
  if (back || e < 0.03) {
    let px = x, py = y, pz = 0;
    if (e < 0) { const s = 1 / Math.sqrt((x / HEAD.rx) ** 2 + (y / HEAD.ry) ** 2); px *= s; py *= s; } else pz = HEAD.rz * Math.sqrt(e) * (back ? 1 : -1);
    return { p: [px, py, pz], n: norm([px / HEAD.rx ** 2, py / HEAD.ry ** 2, pz / HEAD.rz ** 2]) };
  }
  const g = frontDepth(x, y), h = 1e-3;
  const gx = (frontDepth(x + h, y) - frontDepth(x - h, y)) / (2 * h), gy = (frontDepth(x, y + h) - frontDepth(x, y - h)) / (2 * h);
  return { p: [x, y, -g], n: norm([-gx, -gy, -1]) };
}

// ------------------------------------------------------------------ the mesher
class Mesher {
  constructor() { this.P = []; this.N = []; this.C = []; this.SI = []; this.SW = []; this.HW = []; this.WV = []; this.I = []; this.IL = []; this.nv = 0; this.warp = null; }
  /** p in metres, w: bone index or [[bone, weight], ...], hw: hull width in metres (0: no line). The current `warp` tag
   *  (the face view, FACE_VIEW) goes with the vertex: null = not part of the head's drawing; [1] = moves with its own
   *  place; [2, az, y] = moves whole, as its centre (azimuth az, row y in U) does; [3, az, y] = an eye (moves whole, with
   *  the eyes' boost, faceEyeK). */
  vert(p, n, col, w, hw) {
    const t = this.warp; this.WV.push(t ? t[0] : 0, t && t[0] >= 2 ? t[1] : 0, t && t[0] >= 2 ? t[2] : 0);
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(col[0], col[1], col[2]);
    const ws = typeof w === 'number' ? [[w, 1]] : w.filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = ws.reduce((s, e) => s + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { this.SI.push(ws[k] ? ws[k][0] : 0); this.SW.push(ws[k] ? ws[k][1] / tot : 0); }
    this.HW.push(hw);
    return this.nv++;
  }
  tri(a, b, c, line) { this.I.push(a, b, c); if (line) this.IL.push(a, b, c); }
  /** per-part triangle accounting (stats.parts): call at the start of each part */
  part(name) { this.parts ||= []; this.parts.push([name, this.I.length / 3, this.IL.length / 3]); }
  pos(i) { return [this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]]; }
}

// ------------------------------------------------------------------ the builder
/**
 * Build ホヤぼーや. opts: { quality: 'high' | 'phone', lineScale <= 1 (the manual forbids a thicker line), mat (the
 * world's ctx.mat: its cel ramp is shared) }.
 * Returns { root, setPose(name), update(dt, { speed, onGround, vy }), dispose(), stats, ... }.
 */
export function buildHoya(THREE, opts = {}) {
  const qname = QUALITY[opts.quality] ? opts.quality : 'high';
  const Q = QUALITY[qname];
  const K = HOYA_SCALE;
  const lineK = clamp(opts.lineScale ?? 1, 0, 1);
  const COL = {};
  for (const [k, hex] of Object.entries(HOYA_COLORS)) { const c = new THREE.Color(hex); COL[k] = [c.r, c.g, c.b]; }
  const M = new Mesher();
  const OUT = HOYA_LINE.outline, THIN = HOYA_LINE.thin;
  const INK_LIFT = 0.006;   // ink sits 1.7 mm off its surface
  const S = (p) => [p[0] * K, p[1] * K, p[2] * K];
  const HW = (u) => u * K * lineK;

  // ---------------- part groups (bones). Bind pose: standing straight, arms and legs hanging, identity rotations.
  const bones = [], bind = new Map();
  function bone(name, parent, at) {
    const b = new THREE.Bone(); b.name = name;
    const pp = parent ? bind.get(parent) : [0, 0, 0];
    b.position.set((at[0] - pp[0]) * K, (at[1] - pp[1]) * K, (at[2] - pp[2]) * K);
    if (parent) parent.add(b);
    b.userData.i = bones.length;
    bones.push(b); bind.set(b, at.slice());
    return b;
  }
  const H0 = [0, HEAD.y, 0];
  const B = {};
  B.root = bone('root', null, [0, 0, 0]);
  B.pelvis = bone('pelvis', B.root, [0, 0.8, 0]);
  B.spine = bone('spine', B.pelvis, [0, 1.06, 0]);
  B.head = bone('head', B.spine, [0, 1.78, 0]);
  for (const s of [1, -1]) {
    const n = s > 0 ? 'R' : 'L';
    B['sip' + n] = bone('siphon' + n, B.head, add(H0, [s * SIPHON.pivot[0], SIPHON.pivot[1], SIPHON.pivot[2]]));
    B['eye' + n] = bone('eyeOpen' + n, B.head, add(H0, [s * EYE.x, EYE.y, -0.9]));
    B['eyeC' + n] = bone('eyeShut' + n, B.head, add(H0, [s * EYE.x, EYE.y, -0.9]));
    B['arm' + n] = bone('arm' + n, B.spine, [s * SHOULDER.x, SHOULDER.y, SHOULDER.z]);
    B['fore' + n] = bone('fore' + n, B['arm' + n], [s * SHOULDER.x, SHOULDER.y - ARM.upper, SHOULDER.z]);
    B['hand' + n] = bone('hand' + n, B['fore' + n], [s * SHOULDER.x, SHOULDER.y - ARM.upper - ARM.fore, SHOULDER.z]);
    B['leg' + n] = bone('leg' + n, B.pelvis, [s * HIP.x, HIP.y, HIP.z]);
    B['shin' + n] = bone('shin' + n, B['leg' + n], [s * HIP.x, HIP.y - LEG.thigh, HIP.z]);
    B['foot' + n] = bone('foot' + n, B['shin' + n], [s * HIP.x, HIP.y - LEG.thigh - LEG.shin, HIP.z]);
  }
  B.cape0 = bone('cape0', B.spine, [0, CAPE.top, CAPE.z0]);
  B.cape1 = bone('cape1', B.cape0, [0, lerp(CAPE.top, CAPE.bottom, 0.36), lerp(CAPE.z0, CAPE.z1, 0.36)]);
  B.cape2 = bone('cape2', B.cape1, [0, lerp(CAPE.top, CAPE.bottom, 0.7), lerp(CAPE.z0, CAPE.z1, 0.7)]);
  // the cape's two sides: they swing out from its top corners in motion (NO.9-1 draws the hem flared ~±1.45 U mid-stride;
  // at rest NO.1-1 keeps it at ±0.79). Children of cape2, so the sides keep the cape's whole lift.
  B.capeL = bone('capeL', B.cape2, [-CAPE.w0, CAPE.top, CAPE.z0]);
  B.capeR = bone('capeR', B.cape2, [CAPE.w0, CAPE.top, CAPE.z0]);
  const bi = (b) => b.userData.i;

  // ---------------- generic parts (U, model space, bind pose)
  /**
   * A grid surface fn(u, v, i, j) -> { p, n?, col?, w?, hw? } of (nu+1) x (nv+1) points. Normals not given are taken
   * from the grid (central differences). wrapU closes the u seam; poles skips the collapsed triangles of the first and
   * last rows; orient: 'out' flips the winding when it faces into the part (closed parts only), 'keep' trusts flip.
   */
  function grid(nu, nv, fn, o) {
    const pts = [];
    for (let j = 0; j <= nv; j++) { const row = []; for (let i = 0; i <= nu; i++) row.push(o.wrapU && i === nu ? row[0] : fn(i / nu, j / nv, i, j)); pts.push(row); }
    let flip = !!o.flip;
    if (o.orient === 'out') {
      let c = [0, 0, 0], cnt = 0;
      for (const row of pts) for (const r of row) { c = add(c, r.p); cnt++; }
      c = mul(c, 1 / cnt);
      let s = 0;
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = pts[j][i].p, b = pts[j][i + 1].p, cc = pts[j + 1][i].p;
        s += dot(cross(sub(cc, a), sub(b, a)), sub(a, c));
      }
      flip = s < 0;
    }
    const at = (j, i) => pts[clamp(j, 0, nv)][o.wrapU ? ((i % nu) + nu) % nu : clamp(i, 0, nu)].p;
    const idx = [];
    for (let j = 0; j <= nv; j++) {
      const row = [];
      for (let i = 0; i <= nu; i++) {
        if (o.wrapU && i === nu) { row.push(row[0]); continue; }
        const r = pts[j][i];
        let n = r.n;
        if (!n) {
          let du = sub(at(j, i + 1), at(j, i - 1)), dv = sub(at(j + 1, i), at(j - 1, i));
          if (len(du) < 1e-7) du = sub(at(j + (j === 0 ? 1 : -1), i + 1), at(j + (j === 0 ? 1 : -1), i - 1));
          if (len(dv) < 1e-7) dv = [0, -1, 0];
          n = norm(flip ? cross(du, dv) : cross(dv, du));
        }
        row.push(M.vert(S(r.p), n, r.col || o.col, r.w ?? o.w, HW(r.hw ?? o.hw)));
      }
      idx.push(row);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = idx[j][i], b = idx[j][i + 1], c = idx[j + 1][i], d = idx[j + 1][i + 1];
      const t1 = !(o.poles && j === 0), t2 = !(o.poles && j === nv - 1);
      if (flip) { if (t1) M.tri(a, b, c, o.line); if (t2) M.tri(b, d, c, o.line); } else { if (t1) M.tri(a, c, b, o.line); if (t2) M.tri(b, c, d, o.line); }
    }
    return idx;
  }
  /** Ellipsoid with poles on Y (the seam at the back). deform(p, n) -> { p, n, col? } */
  function ellipsoid(c, r, nu, nv, o, deform) {
    return grid(nu, nv, (u, v) => {
      const ph = u * TAU, th = v * Math.PI;
      const sx = Math.sin(th) * Math.sin(ph), sy = Math.cos(th), sz = Math.sin(th) * Math.cos(ph);
      const p = [c[0] + r[0] * sx, c[1] + r[1] * sy, c[2] + r[2] * sz], n = norm([sx / r[0], sy / r[1], sz / r[2]]);
      return deform ? deform(p, n) : { p, n };
    }, { ...o, wrapU: true, poles: true });
  }
  /** Tube along a polyline, radius per point (or [ra, rb] elliptical in its frame). */
  function tube(path, radii, sides, o) {
    const n = path.length, frames = [];
    let prev = null;
    for (let i = 0; i < n; i++) {
      const t = norm(sub(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]));
      let a = prev ? sub(prev, mul(t, dot(prev, t))) : (Math.abs(t[2]) < 0.9 ? cross(t, [0, 0, 1]) : cross(t, [1, 0, 0]));
      a = norm(a); prev = a;
      frames.push([a, cross(t, a)]);
    }
    return grid(sides, n - 1, (u, v, i, j) => {
      const [a, b] = frames[j], r = radii[j], ra = Array.isArray(r) ? r[0] : r, rb = Array.isArray(r) ? r[1] : r;
      const ang = u * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      return { p: add(path[j], add(mul(a, ca * ra), mul(b, sa * rb))), n: norm(add(mul(a, ca / ra), mul(b, sa / rb))), w: o.wFn ? o.wFn(j / (n - 1)) : o.w, hw: o.hwFn ? o.hwFn(j / (n - 1)) : o.hw };
    }, { ...o, wrapU: true, orient: 'out' });
  }
  /** A flat shape (2D) extruded along the frame normal (Z = X x Y): a closed slab, soft rim normals. */
  function slab(shape0, frame, depth, o) {
    const [O, X, Y] = frame, Z = norm(cross(X, Y));
    const shape = area2(shape0) > 0 ? shape0 : shape0.slice().reverse();
    const n = shape.length, at = (q, z) => add(add(add(O, mul(X, q[0])), mul(Y, q[1])), mul(Z, z));
    const front = [], back = [], rimF = [], rimB = [];
    for (let i = 0; i < n; i++) {
      const q = shape[i], a = shape[(i - 1 + n) % n], b = shape[(i + 1) % n];
      const t = [b[0] - a[0], b[1] - a[1]], rn = norm(add(mul(X, t[1]), mul(Y, -t[0])));
      front.push(M.vert(S(at(q, depth / 2)), Z, o.col, o.w, HW(o.hw)));
      back.push(M.vert(S(at(q, -depth / 2)), mul(Z, -1), o.col, o.w, HW(o.hw)));
      rimF.push(M.vert(S(at(q, depth / 2)), rn, o.col, o.w, HW(o.hw)));
      rimB.push(M.vert(S(at(q, -depth / 2)), rn, o.col, o.w, HW(o.hw)));
    }
    for (const [a, b, c] of earcut2(shape)) { M.tri(front[a], front[b], front[c], o.line); M.tri(back[a], back[c], back[b], o.line); }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; M.tri(rimF[i], rimB[i], rimF[j], o.line); M.tri(rimF[j], rimB[i], rimB[j], o.line); }
    return { Z, front: O };
  }
  /** Ink ribbon through surface points (U) with their normals; width w; round caps. The polyline is first simplified
   *  (Douglas-Peucker, Q.inkTol): a straight run is one quad, a curve keeps the points it needs. */
  function ribbon(pts0, nrms0, w, wb, caps = true, anchor = null) {
    // a closed loop (first point = last): no caps, and the seam is mitred like any other bend
    const closed = len(sub(pts0[0], pts0[pts0.length - 1])) < 1e-6;
    const keep = dpKeep(pts0, Q.inkTol), pts = keep.map((i) => pts0[i]), nrms = keep.map((i) => nrms0[i]);
    if (closed) { pts.pop(); nrms.pop(); caps = false; }
    const n = pts.length, h = w / 2, L = [], R = [], side = [];
    if (n < 2) return;
    const P = (i) => pts[closed ? (i + n) % n : clamp(i, 0, n - 1)];
    for (let i = 0; i < n; i++) {
      const t = norm(sub(P(i + 1), P(i - 1)));
      const s = norm(cross(nrms[i], t));
      let k = 1;
      if (closed || (i > 0 && i < n - 1)) {   // keep the stroke's width through a bend (miter, capped)
        const t0 = norm(sub(P(i), P(i - 1))), t1 = norm(sub(P(i + 1), P(i)));
        k = 1 / Math.max(0.6, Math.cos(Math.acos(clamp(dot(t0, t1), -1, 1)) / 2));
      }
      const p = add(pts[i], mul(nrms[i], INK_LIFT));
      side.push(s);
      if (anchor) M.warp = anchor(pts[i]);   // the face view moves the stroke by its centre line: its width never shears
      L.push(M.vert(S(add(p, mul(s, h * k))), nrms[i], COL.ink, wb, 0));
      R.push(M.vert(S(add(p, mul(s, -h * k))), nrms[i], COL.ink, wb, 0));
    }
    for (let i = 0; i < n - (closed ? 0 : 1); i++) { const j = (i + 1) % n; M.tri(L[i], R[i], L[j], false); M.tri(L[j], R[i], R[j], false); }
    if (!caps) return;
    const segs = Q.capSeg;
    for (const end of [0, n - 1]) {
      const tOut = end === 0 ? norm(sub(pts[0], pts[1])) : norm(sub(pts[n - 1], pts[n - 2]));
      const s = side[end], p = add(pts[end], mul(nrms[end], INK_LIFT));
      if (anchor) M.warp = anchor(pts[end]);
      const c = M.vert(S(p), nrms[end], COL.ink, wb, 0), ring = [L[end]];
      for (let k = 1; k < segs; k++) { const a = (k / segs) * Math.PI; ring.push(M.vert(S(add(p, mul(add(mul(s, Math.cos(a)), mul(tOut, Math.sin(a))), h))), nrms[end], COL.ink, wb, 0)); }
      ring.push(R[end]);
      for (let k = 0; k < segs; k++) { if (end === 0) M.tri(c, ring[k], ring[k + 1], false); else M.tri(c, ring[k + 1], ring[k], false); }
    }
  }
  /** A filled ink disc (or ellipse) on a surface. */
  function inkDisc(c, nrm, r, segs, wb, ry = r) {
    const t = norm(Math.abs(nrm[1]) < 0.9 ? cross([0, 1, 0], nrm) : cross([1, 0, 0], nrm)), b = cross(nrm, t);
    const p0 = add(c, mul(nrm, INK_LIFT * 1.3)), ci = M.vert(S(p0), nrm, COL.ink, wb, 0), ring = [];
    for (let s = 0; s < segs; s++) { const a = (s / segs) * TAU; ring.push(M.vert(S(add(p0, add(mul(t, Math.cos(a) * r), mul(b, Math.sin(a) * ry)))), nrm, COL.ink, wb, 0)); }
    for (let s = 0; s < segs; s++) M.tri(ci, ring[s], ring[(s + 1) % segs], false);
  }
  /** Ink along a polyline of the head (front-view coordinates, head-centre frame). */
  function headInk(pts2, back, w, wb, step = Q.inkStep * 0.8, caps = true) {
    const P = [], N = [];
    for (const [x, y] of step ? resample(pts2, step) : pts2) { const h = headPoint(x, y, back); P.push(add(h.p, H0)); N.push(h.n); }
    const keep = M.warp, rigid = keep && keep[0] >= 2;   // a stroke of a feature that moves whole keeps its tag
    // above the face view's lower band a stroke's cross-sections move whole (its drawn width, never thicker); in the band,
    // where the view eases off row by row, the stroke follows the surface like the colours under it (it cannot twist)
    const anchorOf = (q) => (q[1] - H0[1] < FACE_VIEW.bottom[1] + 0.05 ? [1] : [2, Math.atan2(-q[0] / HEAD.rx, -(q[2] - H0[2]) / HEAD.rz), q[1] - H0[1]]);
    ribbon(P, N, w, wb, caps, keep && !rigid ? anchorOf : null);
    M.warp = keep;
  }

  M.part('head');
  // ================================================================== HEAD (the hood and the face)
  const hb = bi(B.head);
  const azOf = (p) => Math.atan2(-p[0] / HEAD.rx, -p[2] / HEAD.rz);   // head frame (U): the azimuth from the face's centre
  M.warp = [1];   // the head's drawing follows the face view (FACE_VIEW); the eyes and the nose re-tag themselves below
  {
    // one ellipsoid, the face opening cut exactly along its contour: triangles that straddle it are split on it and each
    // side keeps its own colour and normal, so the edge under the ink is crisp at any distance, never a gradient
    const [nu, nv0] = Q.head;
    // the rows' polar angles: uniform, plus Q.headBand more across the face view's lower band (FACE_VIEW.bottom), where
    // the face view eases off row by row: thin rows there keep every triangle whole whatever the camera does
    const ths = [...Array(nv0 + 1).keys()].map((j) => (j / nv0) * Math.PI);
    { const t0 = Math.acos(FACE_VIEW.bottom[1] / HEAD.ry), t1 = Math.acos(FACE_VIEW.bottom[0] / HEAD.ry);
      for (let e = 1; e <= Q.headBand; e++) ths.push(t0 + ((t1 - t0) * e) / (Q.headBand + 1)); }
    ths.sort((a, b) => a - b);
    for (let j = ths.length - 1; j > 0; j--) if (ths[j] - ths[j - 1] < 0.02) ths.splice(j - (j === ths.length - 1 ? 1 : 0), 1);
    const nv = ths.length - 1;
    const fOf = (p) => (p[2] < 0 ? faceSd(p[0], p[1]) : -0.5 - p[2]);
    const g2 = [];
    for (let j = 0; j <= nv; j++) {
      const row = [];
      for (let i = 0; i <= nu; i++) {
        const ph = (i / nu) * TAU, th = ths[j];
        const p = [HEAD.rx * Math.sin(th) * Math.sin(ph), HEAD.ry * Math.cos(th), HEAD.rz * Math.sin(th) * Math.cos(ph)];
        row.push({ p, f: fOf(p) });
      }
      g2.push(row);
    }
    const joins = [1, -1].map((s) => {   // where each stalk's axis leaves the head (head frame)
      const Kc = [s * SIPHON.x, SIPHON.y, SIPHON.z], b = SIPHON.base, d = sub(Kc, b);
      let lo = 0, hi = 1;
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2, q = add(b, mul(d, m)); if ((q[0] / HEAD.rx) ** 2 + (q[1] / HEAD.ry) ** 2 + (q[2] / HEAD.rz) ** 2 < 1) lo = m; else hi = m; }
      return add(b, mul(d, lo));
    });
    const lineAt = (q) => OUT * Math.min(...joins.map((j) => smooth(SIPHON.r0 * 1.05, SIPHON.r0 * 1.9, len(sub(q, j)))));
    const cache = new Map();
    const emit = (q, inside) => {
      const key = q.map((v) => (Math.abs(v) < 5e-6 ? 0 : v).toFixed(5)).join(',') + (inside ? 'f' : 'h');
      let id = cache.get(key);
      if (id !== undefined) return id;
      let p = q, n = norm([q[0] / HEAD.rx ** 2, q[1] / HEAD.ry ** 2, q[2] / HEAD.rz ** 2]);
      if (inside && q[2] < 0) { const h = headPoint(q[0], q[1]); p = h.p; n = h.n; }
      id = M.vert(S(add(p, H0)), n, inside ? COL.face : COL.hoya, hb, HW(lineAt(q)));
      cache.set(key, id);
      return id;
    };
    const onEll = (p) => { const s = 1 / Math.hypot(p[0] / HEAD.rx, p[1] / HEAD.ry, p[2] / HEAD.rz); return mul(p, s); };
    const cut = (a, b) => {
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2, q = onEll(add(a.p, mul(sub(b.p, a.p), m))); if ((fOf(q) > 0) === (a.f > 0)) lo = m; else hi = m; }
      return onEll(add(a.p, mul(sub(b.p, a.p), (lo + hi) / 2)));
    };
    const triCut = (A, Bv, C) => {
      const ins = [A.f > 0, Bv.f > 0, C.f > 0], cnt = ins.filter(Boolean).length;
      if (cnt === 0 || cnt === 3) { M.tri(emit(A.p, ins[0]), emit(Bv.p, ins[1]), emit(C.p, ins[2]), true); return; }
      const lone = cnt === 1 ? ins.indexOf(true) : ins.indexOf(false);
      const v = [[A, Bv, C][lone], [A, Bv, C][(lone + 1) % 3], [A, Bv, C][(lone + 2) % 3]], a = ins[lone];
      const p01 = cut(v[0], v[1]), p02 = cut(v[0], v[2]);
      M.tri(emit(v[0].p, a), emit(p01, a), emit(p02, a), true);
      M.tri(emit(p01, !a), emit(v[1].p, !a), emit(v[2].p, !a), true);
      M.tri(emit(p01, !a), emit(v[2].p, !a), emit(p02, !a), true);
    };
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = g2[j][i], b = g2[j][i + 1], c = g2[j + 1][i], d = g2[j + 1][i + 1];
      if (j > 0) triCut(a, c, b);
      if (j < nv - 1) triCut(b, c, d);
    }
    // the hood's front edge (the face opening's line) and the hood's bumps, front and back
    headInk(mirrored(FACE_HALF), false, OUT, hb);
    // the hood's lower hem runs from flap tip to flap tip under the chin (on the outline in the front view): inked too,
    // so a view from below never shows a colour edge without its line
    { const t0 = Math.atan2(-0.528 / HEAD.ry, 0.786), hem = [];
      for (let k = 0; k <= 72; k++) { const t = lerp(Math.PI - t0, 2 * Math.PI + t0, k / 72); hem.push([Math.cos(t) * HEAD.rx, Math.sin(t) * HEAD.ry]); }
      headInk(hem, false, OUT, hb, 0); }   // exactly on the outline (resampled chords would dip off it)
    for (const m of MARKS_FRONT) { headInk(m, false, OUT, hb); if (m[1][0] !== 0) headInk(m.map(([x, y]) => [-x, y]), false, OUT, hb); }
    for (const m of MARKS_BACK) { headInk(m, true, OUT, hb); if (m[1][0] !== 0) headInk(m.map(([x, y]) => [-x, y]), true, OUT, hb); }
    // eyes: open dots; the closed ⌒ (the manual's own) on their own groups, folded away until a blink
    for (const s of [1, -1]) {
      const h = headPoint(s * EYE.x, EYE.y);
      M.warp = [3, azOf(h.p), EYE.y];   // an eye moves whole: always the manual's round dot (or its ⌒)
      inkDisc(add(h.p, H0), h.n, EYE.r, Q.capSeg * 4, bi(B['eye' + (s > 0 ? 'R' : 'L')]));
      const arc = [];
      for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8); arc.push([s * EYE.x - Math.cos(a) * CLOSED_EYE.w, EYE.y - CLOSED_EYE.h * 0.35 + Math.sin(a) * CLOSED_EYE.h]); }
      headInk(arc, false, HOYA_LINE.mouth, bi(B['eyeC' + (s > 0 ? 'R' : 'L')]), Q.inkStep * 0.4);
    }
    M.warp = [1];
    headInk(spline(MOUTH, 4), false, HOYA_LINE.mouth, hb, Q.inkStep * 0.6);
    // nose: a small pink rise; its black ring is ink on the face (the hull rings it from the side). It sits on the face's
    // centre line, which the face view never moves: it stays the front of his profile (NO.15-31)
    M.warp = [2, 0, NOSE.y];
    const hn = headPoint(0, NOSE.y), c = add(add(hn.p, H0), mul(hn.n, NOSE.rz * 0.35));
    ellipsoid(c, [NOSE.rx, NOSE.ry, NOSE.rz], Q.nose[0], Q.nose[1], { col: COL.nose, w: hb, hw: HOYA_LINE.nose * 0.5, line: true });
    const ring = [];
    for (let k = 0; k <= 32; k++) { const a = (k / 32) * TAU; ring.push([Math.cos(a) * (NOSE.rx + HOYA_LINE.nose / 2), NOSE.y + Math.sin(a) * (NOSE.ry + HOYA_LINE.nose / 2)]); }
    headInk(ring, false, HOYA_LINE.nose, hb, Q.inkStep * 0.5, false);
  }
  M.warp = null;

  M.part('siphons');
  // ================================================================== SIPHONS (入水孔 + / 出水孔 -)
  for (const s of [1, -1]) {
    const sb = bi(B['sip' + (s > 0 ? 'R' : 'L')]);
    const Kc = add(H0, [s * SIPHON.x, SIPHON.y, SIPHON.z]), base = add(H0, SIPHON.base);
    const axis = norm(sub(Kc, base)), L = len(sub(Kc, base));
    const path = [], radii = [];
    for (let k = 0; k <= 3; k++) { const t = lerp(0.5, 1.0, k / 3); path.push(add(base, mul(axis, L * t))); radii.push(lerp(SIPHON.r0, SIPHON.r1, k / 3)); }
    tube(path, radii, Q.stalk, { col: COL.hoya, w: sb, hw: OUT, line: true });
    ellipsoid(Kc, [SIPHON.r, SIPHON.r, SIPHON.r], Q.knob[0], Q.knob[1], { col: COL.hoya, w: sb, hw: OUT, line: true });
    // the knob's mark faces the front, as in every front view (the back view NO.9-1 shows plain knobs)
    for (const stroke of s > 0 ? KNOB_PLUS : KNOB_MINUS) {
      const P = [], Nn = [];
      for (const [u, v] of resample(stroke, (Q.inkStep * 0.5) / SIPHON.r)) { const n = [u, v, -Math.sqrt(Math.max(0, 1 - u * u - v * v))]; P.push(add(Kc, mul(n, SIPHON.r))); Nn.push(n); }
      ribbon(P, Nn, THIN, sb);
    }
  }

  M.part('body');
  // ================================================================== TORSO, PANTS, BELT, SHELL, COLLAR, BUTTON
  const sp = bi(B.spine), pv = bi(B.pelvis);
  const torsoAt = (y) => {
    if (y <= TORSO[0][0]) return [TORSO[0][1], TORSO[0][2]];
    for (let i = 1; i < TORSO.length; i++) if (y <= TORSO[i][0]) { const t = (y - TORSO[i - 1][0]) / (TORSO[i][0] - TORSO[i - 1][0]); return [lerp(TORSO[i - 1][1], TORSO[i][1], t), lerp(TORSO[i - 1][2], TORSO[i][2], t)]; }
    const l = TORSO[TORSO.length - 1]; return [l[1], l[2]];
  };
  const bodyW = (y) => { const t = smooth(0.94, 1.1, y); return [[pv, 1 - t], [sp, t]]; };
  {
    // one lathe of elliptical rings, bottom to top: the legs' yellow below PANTS_TOP, the suit above (the seam is a
    // doubled ring under the belt, so the colours never blend)
    const all = [0.665, 0.69, 0.72, 0.76, 0.83, 0.91, PANTS_TOP, PANTS_TOP, 1.12, 1.3, 1.46, 1.6, 1.72, 1.79];
    const rows = Q.torso >= 12 ? all : all.filter((y) => ![0.69, 0.76, 1.3].includes(y));
    const seam = rows.indexOf(PANTS_TOP);
    grid(Q.torso, rows.length - 1, (u, v, i, j) => {
      const y = rows[j], [a, b] = torsoAt(y), ph = u * TAU, k = j === 0 ? 0.55 : 1;
      return { p: [a * Math.sin(ph) * k, y, b * Math.cos(ph) * k], col: j <= seam ? COL.legs : COL.suit, w: bodyW(y) };
    }, { col: COL.suit, hw: OUT, line: true, wrapU: true, orient: 'out' });
    const [a0, b0] = torsoAt(0.665), ring = [];
    const c0 = M.vert(S([0, 0.63, 0]), [0, -1, 0], COL.legs, pv, HW(OUT));
    for (let i = 0; i < Q.torso; i++) { const ph = (i / Q.torso) * TAU; ring.push(M.vert(S([a0 * 0.55 * Math.sin(ph), 0.665, b0 * 0.55 * Math.cos(ph)]), norm([Math.sin(ph) * 0.4, -1, Math.cos(ph) * 0.4]), COL.legs, pv, HW(OUT))); }
    for (let i = 0; i < Q.torso; i++) M.tri(c0, ring[(i + 1) % Q.torso], ring[i], true);
  }
  {
    // the belt (Y90 M60): a raised band whose top and bottom edges the hull outlines
    const ys = [BELT.y0 - 0.004, BELT.y0, BELT.y1, BELT.y1 + 0.004];
    grid(Q.torso, 3, (u, v, i, j) => {
      const y = ys[j], [a, b] = torsoAt(y), ph = u * TAU, o = j === 0 || j === 3 ? 0.003 : BELT.out;
      return { p: [(a + o) * Math.sin(ph), y, (b + o) * Math.cos(ph)] };
    }, { col: COL.hoya, w: sp, hw: 0, line: false, wrapU: true, orient: 'out' });
    // its top and bottom edges are drawn lines in the manual: ink round both (its sides are the torso's silhouette)
    for (const y of [BELT.y0, BELT.y1]) {
      const [a, b] = torsoAt(y), P = [], N = [];
      for (let k = 0; k <= 64; k++) { const ph = (k / 64) * TAU; P.push([(a + BELT.out) * Math.sin(ph), y, (b + BELT.out) * Math.cos(ph)]); N.push(norm([Math.sin(ph) / a, 0, Math.cos(ph) / b])); }
      const br = resampleWith(P, N, Q.inkStep * 0.8);
      ribbon(br.P, br.N, OUT, sp, false);
    }
  }
  {
    // the ホタテ (scallop) buckle: a domed fan with three ribs on its little flared hinge, white, on the front of the
    // belt (NO.1-1 at 2x: fan 0.318 U wide, waist 0.153, hinge 0.178 at its foot; 0.341 U tall). Its line is ink on
    // its face (a hull would fall behind the belt it sits on); the hull still outlines it from the side.
    const pts = spline(mirrored(SHELL.half).reverse(), Q.shell);   // right waist -> over the top -> left waist
    const outline = [...pts, ...SHELL.hinge];
    const [, bz] = torsoAt(SHELL.y), z0 = -(bz + BELT.out + 0.004), zf = z0 - SHELL.d, dome = 0.035;
    const C = [0, 0.02], n = outline.length;
    const Rof = (q) => Math.hypot(q[0] - C[0], q[1] - C[1]);
    const at = (q, k) => [-q[0], SHELL.y + q[1], lerp(z0, zf, 1) - dome * k];   // k: 0 at the rim .. 1 at the centre
    const front = outline.map((q) => M.vert(S(at(q, 0)), norm([-q[0] * 1.2, q[1] * 1.2, -1]), COL.face, sp, HW(OUT)));
    const mid = outline.map((q) => { const m = [C[0] + (q[0] - C[0]) * 0.55, C[1] + (q[1] - C[1]) * 0.55]; return M.vert(S(at(m, 0.7)), norm([-m[0] * 0.8, m[1] * 0.8, -1]), COL.face, sp, HW(OUT)); });
    const ci = M.vert(S(at(C, 1)), [0, 0, -1], COL.face, sp, HW(OUT));
    const backR = outline.map((q) => M.vert(S([-q[0], SHELL.y + q[1], z0]), norm([-q[0], q[1], 0]), COL.face, sp, HW(OUT)));
    const sideF = outline.map((q) => M.vert(S(at(q, 0)), norm([-q[0], q[1], 0]), COL.face, sp, HW(OUT)));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // outline runs clockwise as seen from the front (x mirrored), so these windings face -Z
      M.tri(ci, mid[i], mid[j], false); M.tri(mid[i], front[i], front[j], false); M.tri(mid[i], front[j], mid[j], false);
      M.tri(sideF[i], backR[i], sideF[j], true); M.tri(sideF[j], backR[i], backR[j], true);
    }
    void Rof;
    const ring = resample([...outline, outline[0]].map((q) => [-q[0], SHELL.y + q[1], zf - 0.002]), Q.inkStep * 0.5);
    ribbon(ring, ring.map(() => [0, 0, -1]), OUT, sp, false);
    const zAt = (x, y) => { const r = Math.hypot(x - C[0], y - C[1]) / 0.16; return zf - dome * clamp(1 - r * r, 0, 1) - 0.004; };
    for (const r of SHELL.ribs) { const P = resample(r.map(([x, y]) => [-x, SHELL.y + y, zAt(x, y)]), 0.02); ribbon(P, P.map(() => [0, 0, -1]), THIN, sp); }
  }
  {
    // the collar (C80 M40): a band round the neck whose front falls in two rounded lobes meeting under the button
    const edgeAt = (x) => {
      const ax = Math.abs(x);
      for (let i = 1; i < COLLAR_EDGE.length; i++) if (ax <= COLLAR_EDGE[i][0]) { const t = (ax - COLLAR_EDGE[i - 1][0]) / (COLLAR_EDGE[i][0] - COLLAR_EDGE[i - 1][0]); return lerp(COLLAR_EDGE[i - 1][1], COLLAR_EDGE[i][1], t); }
      return COLLAR_EDGE[COLLAR_EDGE.length - 1][1];
    };
    const top = 1.8, out = 0.03, nu = Q.collar, back = COLLAR_EDGE[COLLAR_EDGE.length - 1][1];
    const phs = [];
    for (let i = 0; i <= nu; i++) { const u = i / nu; phs.push(Math.PI + Math.sign(u - 0.5) * Math.pow(Math.abs(u - 0.5) * 2, 1.35) * Math.PI); }
    const yLow = (ph) => { const sx = Math.sin(ph), sz = Math.cos(ph); return sz < 0 ? lerp(back, edgeAt(torsoAt(1.6)[0] * sx), smooth(0, 0.35, -sz)) : back; };
    grid(nu, 3, (u, v, i, j) => {
      const ph = phs[i], yy = lerp(top, yLow(ph), j / 3), [a, b] = torsoAt(yy), o = j === 3 ? out * 0.3 : out;
      return { p: [(a + o) * Math.sin(ph), yy, (b + o) * Math.cos(ph)] };
    }, { col: COL.cape, w: sp, hw: 0, line: false });
    // the collar's drawn edge (the two lobes and the notch under the button): an ink line round its lower edge
    const P = [], N = [];
    for (const ph of resample(phs.map((x) => [x]), 0.03).map((x) => x[0])) {
      const y = yLow(ph), [a, b] = torsoAt(y);
      P.push([(a + out * 0.75) * Math.sin(ph), y, (b + out * 0.75) * Math.cos(ph)]); N.push(norm([Math.sin(ph) / a, 0, Math.cos(ph) / b]));
    }
    const cr = resampleWith(P, N, Q.inkStep * 0.7);
    ribbon(cr.P, cr.N, OUT, sp, false);
    // the button (Y90 M20) with its thinner ring
    const [, bz] = torsoAt(BUTTON.y), z = -(bz + out + 0.012), segs = Q.capSeg * 3, ring = [];
    const c0 = M.vert(S([0, BUTTON.y, z - 0.014]), [0, 0, -1], COL.legs, sp, 0);
    for (let s = 0; s < segs; s++) { const a = (s / segs) * TAU; ring.push(M.vert(S([Math.cos(a) * BUTTON.r, BUTTON.y + Math.sin(a) * BUTTON.r, z]), norm([Math.cos(a), Math.sin(a), -0.7]), COL.legs, sp, 0)); }
    for (let s = 0; s < segs; s++) M.tri(c0, ring[(s + 1) % segs], ring[s], false);
    const br = [];   // its ring, as thin as the manual draws it
    for (let s = 0; s <= segs * 2; s++) { const a = (s / (segs * 2)) * TAU; br.push([Math.cos(a) * (BUTTON.r + THIN / 2), BUTTON.y + Math.sin(a) * (BUTTON.r + THIN / 2), z - 0.004]); }
    ribbon(br, br.map(() => [0, 0, -1]), THIN, sp, false);
  }

  M.part('arms');
  // ================================================================== ARMS AND HANDS
  for (const s of [1, -1]) {
    const n = s > 0 ? 'R' : 'L', ab = bi(B['arm' + n]), fb = bi(B['fore' + n]), hb2 = bi(B['hand' + n]);
    const L = ARM.upper + ARM.fore, rings = Q.limbRings, path = [], radii = [];
    for (let k = 0; k <= rings; k++) { const t = k / rings; path.push([s * SHOULDER.x, SHOULDER.y + 0.03 - (L + 0.04) * t, SHOULDER.z]); radii.push(lerp(ARM.r0, ARM.r1, t)); }
    const e = (ARM.upper + 0.03) / (L + 0.04);
    tube(path, radii, Q.limb, { col: COL.suit, hw: OUT, line: true, hwFn: (t) => OUT * (1 - smooth(0.8, 0.97, t)), wFn: (t) => { const w = smooth(e - 0.13, e + 0.13, t); return t > 0.97 ? [[hb2, 1]] : [[ab, 1 - w], [fb, w]]; } });
    ellipsoid([s * SHOULDER.x, SHOULDER.y - L - ARM.handOff, SHOULDER.z], ARM.hand, Q.hand[0], Q.hand[1], { col: COL.suit, w: hb2, hw: OUT, line: true });
  }

  M.part('legs');
  // ================================================================== LEGS AND BOOTS
  for (const s of [1, -1]) {
    const n = s > 0 ? 'R' : 'L', lb = bi(B['leg' + n]), shb = bi(B['shin' + n]), fb = bi(B['foot' + n]);
    const x = s * HIP.x, L = LEG.thigh + LEG.shin, rings = Math.max(3, Q.limbRings - 1), path = [], radii = [];
    for (let k = 0; k <= rings; k++) { const t = k / rings; path.push([x, HIP.y + 0.04 - (L + 0.06) * t, HIP.z]); radii.push(lerp(LEG.r0, LEG.r1, t)); }
    const e = (LEG.thigh + 0.04) / (L + 0.06);
    tube(path, radii, Q.limb, { col: COL.legs, hw: OUT, line: true, hwFn: (t) => OUT * (1 - smooth(0.6, 0.72, t)), wFn: (t) => { const w = smooth(e - 0.16, e + 0.16, t); return t > 0.93 ? [[fb, 1]] : [[lb, 1 - w], [shb, w]]; } });
    // the boot: a big round shoe, toe forward, flat sole. The sole (its bottom face) is the orange of the head (NO.1-3,
    // NO.9-1 show it when a foot lifts); a doubled ring at the sole line keeps the colours apart, the ink line on it.
    const nb = Q.boot, cx = x, cz = BOOT.cz;
    const ellR = (y) => { const t = (y - BOOT.cy) / BOOT.ry; return Math.sqrt(Math.max(0, 1 - t * t)); };
    const ringsY = Q.boot >= 12 ? [0, 0, 0, 0.02, 0.08, 0.17, 0.27, 0.35, 0.4, BOOT.cy + BOOT.ry] : [0, 0, 0, 0.03, 0.14, 0.28, 0.38, BOOT.cy + BOOT.ry];
    grid(nb, ringsY.length - 1, (u, v, i, j) => {
      const y = ringsY[j], ph = u * TAU, k = j === 0 ? 0 : ellR(Math.max(y, 0.0001));
      const top = j === ringsY.length - 1;
      return { p: [cx + Math.sin(ph) * BOOT.rx * k, y, cz + Math.cos(ph) * BOOT.rz * k], col: j <= 1 ? COL.hoya : COL.legs, n: j <= 1 ? [0, -1, 0] : top ? [0, 1, 0] : undefined };
    }, { col: COL.legs, w: fb, hw: OUT, line: true, wrapU: true, orient: 'out', poles: true });
    const tY = (0.004 - BOOT.cy) / BOOT.ry, rr = Math.sqrt(1 - tY * tY) * 0.985, P = [], Nn = [];
    for (let k = 0; k <= 28; k++) { const a = (k / 28) * TAU; P.push([cx + Math.sin(a) * BOOT.rx * rr, 0.004, cz + Math.cos(a) * BOOT.rz * rr]); Nn.push([0, -1, 0]); }
    ribbon(P, Nn, THIN, fb, false);
  }

  M.part('cape');
  // ================================================================== CAPE (shark skin, C80 M40)
  {
    const [cu, cv] = Q.cape, c0 = bi(B.cape0), c1 = bi(B.cape1), c2 = bi(B.cape2);
    const capeW0 = (v) => (v < 0.36 ? (() => { const t = smooth(0.16, 0.36, v); return [[c0, 1 - t], [c1, t]]; })() : (() => { const t = smooth(0.55, 0.8, v); return [[c1, 1 - t], [c2, t]]; })());
    // the outer, lower part of each half goes with its side bone (the flare); the middle and the top never do
    const cL = bi(B.capeL), cR = bi(B.capeR);
    const capeW = (v, u = 0.5) => {
      const a = Math.pow(clamp(Math.abs(u - 0.5) * 2, 0, 1), 1.5) * smooth(0.12, 0.85, v) * 0.95;
      return a < 1e-4 ? capeW0(v) : [...capeW0(v).map(([b, w]) => [b, w * (1 - a)]), [u < 0.5 ? cL : cR, a]];
    };
    const at = (u, v, side) => {
      const y = lerp(CAPE.top, CAPE.bottom, v), hw = lerp(CAPE.w0, CAPE.w1, v), x = (u - 0.5) * 2 * hw;
      const arc = Math.cos((u - 0.5) * Math.PI * 0.9);   // wraps round the back, flares as it falls
      const z = lerp(CAPE.z0, CAPE.z1, v) + arc * lerp(0.07, 0.12, v) - 0.06;
      const wave = v > 0.85 ? Math.sin(u * TAU * 2.5 + 0.6) * CAPE.wave * smooth(0.85, 1, v) : 0;   // the wavy hem
      return [x, y + wave, z + (side * CAPE.thick) / 2];
    };
    const nAt = (u, v) => { const e = 1e-3, p = at(u, v, 0); return norm(cross(sub(at(u, v + e, 0), p), sub(at(u + e, v, 0), p))); };   // +Z: away from his back
    grid(cu, cv, (u, v) => ({ p: at(u, v, 1), n: nAt(u, v), w: capeW(v, u) }), { col: COL.cape, hw: OUT, line: true });
    grid(cu, cv, (u, v) => ({ p: at(u, v, -1), n: mul(nAt(u, v), -1), w: capeW(v, u) }), { col: COL.cape, hw: OUT, line: true, flip: true });
    // the rim: its own vertices whose normals point out of the cape's edge (so the hull draws the edge's line, as the
    // manual draws every edge of the cape), each strip turned to face away from the cape's middle
    const mid = S(at(0.5, 0.5, 0)), e = 1e-3;
    const edge = (pts) => {   // pts: [u, v] along one edge
      const A = [], Bv = [];
      for (const [u, v] of pts) {
        const n = nAt(u, v), p = at(u, v, 0);
        const outw = norm(sub(p, at(clamp(u + (u <= 0 ? e : u >= 1 ? -e : 0), 0, 1), clamp(v + (v <= 0 ? e : v >= 1 ? -e : 0), 0, 1), 0)));
        A.push(M.vert(S(at(u, v, 1)), outw, COL.cape, capeW(v, u), HW(OUT)));
        Bv.push(M.vert(S(at(u, v, -1)), outw, COL.cape, capeW(v, u), HW(OUT)));
      }
      for (let k = 0; k < A.length - 1; k++) {
        const pa = M.pos(A[k]), pb = M.pos(Bv[k]), pc = M.pos(A[k + 1]);
        if (dot(cross(sub(pb, pa), sub(pc, pa)), sub(pa, mid)) > 0) { M.tri(A[k], Bv[k], A[k + 1], true); M.tri(A[k + 1], Bv[k], Bv[k + 1], true); }
        else { M.tri(A[k], A[k + 1], Bv[k], true); M.tri(A[k + 1], Bv[k + 1], Bv[k], true); }
      }
    };
    const us = [...Array(cu + 1).keys()].map((i) => i / cu), vs = [...Array(cv + 1).keys()].map((j) => j / cv);
    edge(us.map((u) => [u, 1])); edge(us.map((u) => [u, 0])); edge(vs.map((v) => [0, v])); edge(vs.map((v) => [1, v]));
  }

  M.part('sword');
  // ================================================================== THE サンマ SWORD (in his right hand)
  {
    const hR = bi(B.handR);
    const hc = [SHOULDER.x, SHOULDER.y - ARM.upper - ARM.fore - ARM.handOff, SHOULDER.z];   // the fist (bind)
    const ca = Math.cos(SWORD_GRIP), sa = Math.sin(SWORD_GRIP);
    const R = (p) => [p[0] * ca - p[1] * sa, p[0] * sa + p[1] * ca, p[2]];
    const W = (p) => add(hc, R(p));
    const edgeAt = (E, s) => {
      for (let i = 1; i < E.length; i++) if (s <= E[i][0]) { const t = (s - E[i - 1][0]) / (E[i][0] - E[i - 1][0]); return lerp(E[i - 1][1], E[i][1], t); }
      return E[E.length - 1][1];
    };
    // local +x is the outer edge (his right, away from his head, in every pose: swordUp keeps the blade's frame)
    const halfAt = (s) => (edgeAt(SWORD.outer, s) + edgeAt(SWORD.inner, s)) / 2;
    const midAt = (s) => (edgeAt(SWORD.outer, s) - edgeAt(SWORD.inner, s)) / 2;
    const y0 = SWORD.base, y1 = SWORD.base + SWORD.len;
    // the blade: elliptical sections, the flat side to the front, the snout a soft point
    grid(Q.blade[0], Q.blade[1], (u, v) => {
      const s = Math.pow(v, 1.15), y = lerp(y1, y0, s), hw = Math.max(0.003, halfAt(s)), ht = hw * SWORD.thick, ph = u * TAU;
      return { p: W([midAt(s) + Math.cos(ph) * hw, y, Math.sin(ph) * ht]) };
    }, { col: COL.sanma, w: hR, hw: OUT, line: true, wrapU: true, orient: 'out' });
    // the grip through the fist (the saury's tail stalk) and the forked tail below it
    tube([W([0, y0 + 0.02, 0]), W([0, 0, 0]), W([0, -0.2, 0])], [[0.07, 0.035], [0.065, 0.032], [0.055, 0.03]], 6, { col: COL.sanma, w: hR, hw: OUT, line: true });
    slab(SWORD.tail, [W([0, 0, 0]), R([1, 0, 0]), R([0, 1, 0])], 0.04, { col: COL.sanma, w: hR, hw: OUT, line: true });
    // the yellow guard across the blade's foot: a straight top edge, a curved underside (NO.1-1)
    const g = SWORD.guard, gs = [];
    for (let k = 0; k <= 10; k++) { const x = (k / 10 - 0.5) * g.w; gs.push([x, y0 - 0.015]); }
    for (let k = 10; k >= 0; k--) { const x = (k / 10 - 0.5) * g.w * 0.92; gs.push([x, y0 - 0.015 - g.h * (1 - Math.pow(Math.abs(x) / (g.w * 0.46), 2)) * 0.9 - 0.01]); }
    slab(gs, [W([0, 0, 0]), R([1, 0, 0]), R([0, 1, 0])], g.d, { col: COL.legs, w: hR, hw: OUT, line: true });
    // the fish's face and its lateral line, on both flanks (a saury has two)
    for (const side of [-1, 1]) {
      const onBlade = (s, f) => {
        const y = lerp(y1, y0, s), hw = halfAt(s), ht = hw * SWORD.thick, c = Math.sqrt(Math.max(0, 1 - f * f));
        return { p: W([midAt(s) + f * hw, y, side * ht * c]), n: norm(R([f / hw, 0, (side * c) / ht])) };
      };
      for (const st of SWORD.strokes) {
        const P = [], Nn = [];
        for (const [s2, f] of resample(spline(st, 4), 0.035)) { const o = onBlade(s2, f); P.push(o.p); Nn.push(o.n); }
        ribbon(P, Nn, THIN, hR);
      }
      const e = onBlade(SWORD.eye[0], SWORD.eye[1]);
      inkDisc(e.p, e.n, SWORD.eye[2], Q.capSeg * 2 + 2, hR);
    }
  }

  // ------------------------------------------------------------------ meshes
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(M.P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(M.N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(M.C, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(M.SI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(M.SW, 4));
  g.setAttribute('hullW', new THREE.Float32BufferAttribute(M.HW, 1));
  g.setAttribute('hullN', new THREE.Float32BufferAttribute(hullDirections(M), 3));
  g.setAttribute('hoyaW', new THREE.Float32BufferAttribute(M.WV, 3));
  const Idx = (a) => (M.nv > 65535 ? new THREE.Uint32BufferAttribute(a, 1) : new THREE.Uint16BufferAttribute(a, 1));
  g.setIndex(Idx(M.I));
  const gl = new THREE.BufferGeometry();   // the line pass shares every buffer; only the outlined triangles
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight', 'hullW', 'hullN', 'hoyaW']) gl.setAttribute(k, g.attributes[k]);
  gl.setIndex(Idx(M.IL));
  const sphere = new THREE.Sphere(new THREE.Vector3(0, 0.6, 0), 1.5);   // every pose fits (the sword up, the run)
  g.boundingSphere = sphere; gl.boundingSphere = sphere.clone();
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-1.2, -0.3, -1.2), new THREE.Vector3(1.2, 1.9, 1.2)); gl.boundingBox = g.boundingBox.clone();

  const faceK = { value: 1 };   // the face view's boost, shared by both passes; set per camera just before each draw
  const body = makeBodyMaterial(THREE, faceK, K), line = makeLineMaterial(THREE, faceK, K);
  const root = new THREE.Group(); root.name = 'hoya3d';
  root.add(B.root);
  const mesh = new THREE.SkinnedMesh(g, body); mesh.name = 'hoya3d-body';
  const hull = new THREE.SkinnedMesh(gl, line); hull.name = 'hoya3d-line';
  root.add(mesh); root.add(hull);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton, mesh.matrixWorld); hull.bind(skeleton, hull.matrixWorld);
  // he casts his shadow on the town; he takes none (HOYA_TONE: the manual's flat colour, no soft blots)
  mesh.castShadow = true; mesh.receiveShadow = false; hull.castShadow = false; hull.receiveShadow = false;
  // the face view (FACE_VIEW): where the drawing camera stands round his head, just before each pass draws him
  let faceOn = opts.faceView !== false;
  const camH = new THREE.Vector3(), invHead = new THREE.Matrix4(), headUp = (HEAD.y - 1.78) * K;   // head bone (neck) -> head centre
  const faceView = (r, s, camera) => {
    if (!faceOn || !camera) { faceK.value = 1; return; }
    camH.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(invHead.copy(B.head.matrixWorld).invert());
    faceK.value = faceViewK(Math.atan2(-camH.x, -camH.z), Math.atan2(camH.y - headUp, Math.hypot(camH.x, camH.z)));
  };
  mesh.onBeforeRender = faceView; hull.onBeforeRender = faceView;
  hull.layers.set(1);   // LAYER_NO_OUTLINE (core/materials.js): the world's edge pre-pass renders layer 0 only
  for (const o of [root, mesh, hull]) { o.userData.dynamic = true; o.userData.noBatch = true; }
  // fixed, generous bounds in mesh space: a SkinnedMesh would otherwise measure its first pose once and cull the run's
  // forward arm or the jump (three.js Frustum.intersectsObject uses object.boundingSphere)
  for (const o of [mesh, hull]) { o.boundingSphere = sphere.clone(); o.boundingBox = g.boundingBox.clone(); }

  M.part('end');
  const parts = {};
  for (let i = 0; i < M.parts.length - 1; i++) parts[M.parts[i][0]] = [M.parts[i + 1][1] - M.parts[i][1], M.parts[i + 1][2] - M.parts[i][2]];
  const stats = { quality: qname, triangles: M.I.length / 3, lineTriangles: M.IL.length / 3, drawn: (M.I.length + M.IL.length) / 3, vertices: M.nv, bones: bones.length, drawCalls: 2, parts };

  // ------------------------------------------------------------------ animation
  const anim = createAnimator(THREE, B, K, { blink: opts.blink !== false, calm: !!opts.calm });
  let forced = null;
  const live = { speed: 0, onGround: true, vy: 0, cadence: undefined, run: undefined };   // reused every frame (no garbage)
  /** Force a pose ('idle' | 'walk' | 'run' | 'jump' | 'fall'); 'auto' or null hands it back to update()'s inputs. */
  function setPose(name) {
    if (name == null || name === 'auto') { forced = null; return; }
    if (!POSES.includes(name)) throw new Error(`hoya3d: unknown pose "${name}"`);
    forced = name;
  }
  /** Advance by dt seconds and pose: speed (m/s along the ground) blends idle -> walk -> run; off the ground, vy (m/s,
   *  + up) picks jump or fall. Optional: cadence (cycles/s, a cycle is two steps: the caller locks it to the ground speed,
   *  hoyaGait() gives the no-slide rate) and run (0 = walk .. 1 = run, instead of the blend by speed). Returns the pose. */
  function update(dt, { speed = 0, onGround = true, vy = 0, cadence, run } = {}) {
    let inp;
    if (forced) inp = forcedInputs(forced, speed > 0.05 ? speed : undefined, cadence);
    else { live.speed = speed; live.onGround = onGround; live.vy = vy; live.cadence = cadence; live.run = run; inp = live; }
    anim.step(clamp(dt || 0, 0, 0.1), inp);
    return anim.state.pose;
  }
  /** Pose deterministically at time t of a named pose (tests, the review renders). */
  function poseAt(name, t, { speed } = {}) {
    anim.reset();
    const inp = forcedInputs(name, speed), dt = 1 / 60;
    for (let s = 0; s < t - 1e-9; s += dt) anim.step(dt, inp);
    anim.step(0, inp);
    return anim.state;
  }
  function dispose() {
    root.removeFromParent();
    g.dispose(); gl.dispose(); body.dispose(); line.dispose(); skeleton.dispose();
  }
  anim.step(0, { speed: 0, onGround: true, vy: 0 });
  return {
    root, mesh, hull, bones: B, skeleton, stats, materials: { body, line }, colors: HOYA_COLORS,
    setPose, update, poseAt, dispose,
    get pose() { return anim.state.pose; },
    /** The cycle rate in use (cycles/s; a cycle is two steps). */
    get cadence() { return anim.state.cadence || 0; },
    /** His stride at a speed (hoyaGait): { travel, stance, run, hz, rate }; the caller sets cadence = speed x stance / travel. */
    gait: (speed, run) => hoyaGait(speed, run),
    /** 0..1: he lights his own colours (night): never a dark silhouette (manual p.5, 「塗りつぶす」). */
    setLift(v) { body.userData.uLift.value = clamp(v, 0, 1); },
    /** Show the manual's closed eye (⌒) for sec seconds. */
    blink: (sec) => anim.blink(sec),
    /** Reduced motion (prefers-reduced-motion): calmer bob, sway, flutter; blinking off. */
    setCalm(v) { anim.opts.calm = !!v; },
    /** The face view (FACE_VIEW) on or off: off = the rigid head (the face fixed on the front). On by default. */
    setFaceView(v) { faceOn = !!v; if (!faceOn) faceK.value = 1; },
    /** The face view's boost as last drawn (1 = the front or the back). */
    get faceK() { return faceK.value; },
  };
}

const FORCED = {
  idle: { speed: 0, onGround: true, vy: 0, forced: 'idle', base: 0 },
  walk: { speed: 1.3, onGround: true, vy: 0, forced: 'walk', base: 1.3 },
  run: { speed: 4.2, onGround: true, vy: 0, forced: 'run', base: 4.2 },
  jump: { speed: 0, onGround: false, vy: 3, forced: 'jump', base: 0 },
  fall: { speed: 0, onGround: false, vy: -3, forced: 'fall', base: 0 },
};
/** The inputs that show a named pose (speed: the caller's, when it gives one). Reused objects: no garbage. */
function forcedInputs(name, speed, cadence) {
  const f = FORCED[name] || FORCED.idle;
  f.speed = name === 'walk' || name === 'run' ? speed ?? f.base : speed ?? 0;
  f.cadence = cadence;   // the caller's, this call only (the objects are shared)
  return f;
}

/** Per vertex, the direction the line pushes it: the mitred mean of the normals of every vertex at the same place in
 *  the same part (d . n = 1 for each of them, capped), so a split edge still gets a closed line of the full width. */
function hullDirections(M) {
  const groups = new Map(), out = new Float32Array(M.nv * 3);
  for (let i = 0; i < M.nv; i++) {
    const key = `${Math.round(M.P[i * 3] / 2e-4)},${Math.round(M.P[i * 3 + 1] / 2e-4)},${Math.round(M.P[i * 3 + 2] / 2e-4)},${M.SI[i * 4]}`;
    let g = groups.get(key); if (!g) groups.set(key, (g = []));
    g.push(i);
  }
  for (const g of groups.values()) {
    const ns = [];
    for (const i of g) {
      const n = [M.N[i * 3], M.N[i * 3 + 1], M.N[i * 3 + 2]];
      if (!ns.some((m) => dot(m, n) > 0.999)) ns.push(n);
    }
    let a = [0, 0, 0];
    for (const n of ns) a = add(a, n);
    a = mul(a, 1 / ns.length);
    const l2 = dot(a, a);
    const d = l2 > 1e-6 ? mul(a, Math.min(1 / l2, 2.2)) : ns[0];
    for (const i of g) { out[i * 3] = d[0]; out[i * 3 + 1] = d[1]; out[i * 3 + 2] = d[2]; }
  }
  return out;
}

// ------------------------------------------------------------------ materials
/** The face view in GLSL (FACE_VIEW; faceWarp / faceWarpRow above are the same maths for tests): a vertex of the head's
 *  drawing is carried round the head's vertical axis along its own row of the ellipsoid, so it never leaves the head. */
function faceViewGLSL(K) {
  const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
  return `
uniform float hoyaFaceK;
attribute vec3 hoyaW;
float hoyaFaceDelta(vec3 p) {
  if (hoyaW.x < 0.5 || hoyaFaceK < 1.0001) return 0.0;
  vec3 h = p - vec3(0.0, ${f(HEAD.y * K)}, 0.0);
  if (hoyaW.x < 1.5 && abs(h.x) + abs(h.z) < 1e-6) return 0.0;   // the head's poles: atan(0, 0) is undefined in GLSL
  float a = hoyaW.x > 1.5 ? hoyaW.y : atan(-h.x / ${f(HEAD.rx * K)}, -h.z / ${f(HEAD.rz * K)});
  float y = hoyaW.x > 1.5 ? hoyaW.z : h.y / ${f(K)};
  float k = hoyaW.x > 2.5 ? 1.0 + (hoyaFaceK - 1.0) * ${f(FACE_VIEW.eyes)} : hoyaFaceK;   // the eyes: faceEyeK
  float w = 2.0 * atan(k * tan(0.5 * a));
  return (w - a) * smoothstep(${f(FACE_VIEW.bottom[0])}, ${f(FACE_VIEW.bottom[1])}, y);
}
vec3 hoyaFaceDir(vec3 n, float d) { float c = cos(d), s = sin(d); return vec3(n.x * c + n.z * s, n.y, n.z * c - n.x * s); }
vec3 hoyaFacePoint(vec3 p, float d) {
  vec3 h = p - vec3(0.0, ${f(HEAD.y * K)}, 0.0);
  vec2 e = vec2(-h.x / ${f(HEAD.rx * K)}, -h.z / ${f(HEAD.rz * K)});
  float c = cos(d), s = sin(d);
  vec2 r = vec2(e.x * c + e.y * s, e.y * c - e.x * s);
  return vec3(-r.x * ${f(HEAD.rx * K)}, p.y, -r.y * ${f(HEAD.rz * K)});
}
`;
}
function makeBodyMaterial(THREE, faceK, K) {
  // his own two-tone ramp (HOYA_TONE): shade below the terminator, the official colour above it
  const n = 16, data = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const d = ((i + 0.5) / n) * 2 - 1; data[i] = Math.round((d < HOYA_TONE.at ? HOYA_TONE.shade : 1) * 255); }
  const ramp = new THREE.DataTexture(data, n, 1, THREE.RedFormat);
  ramp.minFilter = THREE.NearestFilter; ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
  // two-sided with the outward normal kept: where the face view turns a hair-thin sliver of the face's cut edge over,
  // it is drawn in its own colour and light, never a pinhole into the head
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: ramp, side: THREE.DoubleSide });
  m.name = 'hoya3d-body';
  const uLift = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLift = uLift;
    sh.uniforms.hoyaFaceK = faceK;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + faceViewGLSL(K))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  float hoyaD = hoyaFaceDelta(position);\n  objectNormal = hoyaFaceDir(objectNormal, hoyaD);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = hoyaFacePoint(transformed, hoyaD);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLift;')
      // the light chunk, expanded here: the sky's fill is the same from every side (no sky-to-ground gradient on him) and
      // every light's colour is kept at HOYA_TONE.hue of its hue
      .replace('#include <common>', '#include <common>\nvec3 hoyaHue(vec3 c) { return mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, ' + HOYA_TONE.hue.toFixed(3) + '); }')
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin
        .replace('getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal )', 'hoyaHue( getHemisphereLightIrradiance( hemisphereLights[ i ], vec3( 0.0 ) ) )')
        .replace('getAmbientLightIrradiance( ambientLightColor )', 'hoyaHue( getAmbientLightIrradiance( ambientLightColor ) )')
        .replace(/(get(?:Point|Spot|Directional)LightInfo\( [^;]*\);)/g, '$1\n\t\tdirectLight.color = hoyaHue( directLight.color );'))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uLift;')
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(/normal \*= faceDirection;/g, '').replace(/nonPerturbedNormal \*= faceDirection;/g, ''));
  };
  m.customProgramCacheKey = () => 'hoya3d-body-2';
  m.userData.uLift = uLift;
  const d0 = m.dispose.bind(m);
  m.dispose = () => { ramp.dispose(); d0(); };
  return m;
}
function makeLineMaterial(THREE, faceK, K) {
  // the inverted hull: back faces pushed out along the (bind-space) normal by the per-vertex width; 0 = no line (ink)
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  m.name = 'hoya3d-line';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.hoyaFaceK = faceK;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float hullW;\nattribute vec3 hullN;\n' + faceViewGLSL(K))
      // the face view keeps every point of the head on the head, so the head's silhouette (all this pass draws there) is
      // the same unmoved: only the parts that move whole (the nose) move here. No line triangle can fold.
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  float hoyaD = hoyaW.x > 1.5 ? hoyaFaceDelta(position) : 0.0;\n  transformed = hoyaFacePoint(transformed, hoyaD) + hoyaFaceDir(hullN, hoyaD) * hullW;');
  };
  m.customProgramCacheKey = () => 'hoya3d-line-2';
  return m;
}

/** How far the ankle rises (U) so a boot pitched by p (radians, + = toe up) still touches the ground with its lowest
 *  point: the heel when the toe is up, the toe when the heel is up. From the boot's own shape (BOOT), the ankle 0.3 U up. */
const BOOT_LIFT = (() => {
  const ankleY = HIP.y - LEG.thigh - LEG.shin, out = new Float32Array(91);
  for (let i = 0; i <= 90; i++) {
    const p = ((i - 45) * 2) * DEG, c = Math.cos(p), s = Math.sin(p);
    let lo = Infinity;
    for (let j = 0; j <= 24; j++) {
      const y = (BOOT.cy + BOOT.ry) * (j / 24), k = Math.sqrt(Math.max(0, 1 - ((y - BOOT.cy) / BOOT.ry) ** 2));
      for (const cz of [-1, 1]) { const z = BOOT.cz + cz * BOOT.rz * k, dy = y - ankleY; lo = Math.min(lo, dy * c - z * s); }
    }
    out[i] = Math.max(0, -lo - ankleY);
  }
  return out;
})();
const bootLift = (p) => { const f = clamp(p / DEG / 2 + 45, 0, 90), i = Math.min(89, Math.floor(f)); return lerp(BOOT_LIFT[i], BOOT_LIFT[i + 1], f - i); };

// ------------------------------------------------------------------ the animator: procedural, rotations of the groups only
function createAnimator(THREE, B, K, opts = { blink: true, calm: false }) {
  const E = new THREE.Euler(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qW = new THREE.Quaternion();
  const st = { t: 0, phase: 0, pose: 'idle', wWalk: 0, wRun: 0, air: 0, vy: 0, land: 0, prevGround: true, blinkT: 2.2, blinking: 0, capeLift: 0, capeV: 0, sipJ: 0, sipV: 0, speed: 0 };
  const rest = new Map(); for (const b of Object.values(B)) rest.set(b, b.position.clone());
  const rot = (b, x, y, z) => { E.set(x, y, z, 'XYZ'); b.quaternion.setFromEuler(E); };
  const pos = (b, dx, dy, dz) => { const r = rest.get(b); b.position.set(r.x + dx * K, r.y + dy * K, r.z + dz * K); };
  let seed = 0.37;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  function reset() { Object.assign(st, { t: 0, phase: 0, wWalk: 0, wRun: 0, air: 0, vy: 0, land: 0, prevGround: true, blinkT: 2.2, blinking: 0, capeLift: 0, capeV: 0, sipJ: 0, sipV: 0 }); seed = 0.37; }

  /** Two-bone leg in its own plane: the ankle at (forward f, up h) from where it hangs -> hip and knee angles. */
  function legIK(f, h, L1, L2) {
    const dx = f, dy = -(L1 + L2) + h;
    const d = clamp(Math.hypot(dx, dy), 0.05, (L1 + L2) * 0.9995);
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const knee = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    return { hip: Math.atan2(dx, -dy) + a, knee: -knee };   // the thigh swings forward (+), the shin folds back (-)
  }
  /** Turn the foot so that, in his own frame, it is level, toed out by yaw and pitched by pitch (+ = toe up). */
  function footWorld(n, yaw, pitch) {
    E.set(pitch, yaw, 0, 'YXZ'); qW.setFromEuler(E);
    q1.copy(B.pelvis.quaternion).multiply(B['leg' + n].quaternion).multiply(B['shin' + n].quaternion);
    B['foot' + n].quaternion.copy(q2.copy(q1).invert().multiply(qW));
  }
  /** Keep the sword up: the fist turns so the サンマ stands as in the standard pose (p.2), tipped by (fwd, out). */
  const qGrip = new THREE.Quaternion();
  function swordUp(fwd, out) {
    E.set(fwd, 0, 126.2 * DEG + out, 'XYZ'); qGrip.setFromEuler(E);   // the blade tipped 6.8 deg out (NO.1-1)
    q1.copy(B.pelvis.quaternion).multiply(B.spine.quaternion).multiply(B.armR.quaternion).multiply(B.foreR.quaternion);
    B.handR.quaternion.copy(q2.copy(q1).invert().multiply(qGrip));
  }

  const gmix = {}, gw = [0, 0], legT = [{}, {}];   // reused every frame (no garbage)
  /** Soft minimum (the pelvis follows the lower of its limits without a kink). */
  const smin = (a, b, w = 0.012) => { const h = clamp(0.5 + (0.5 * (b - a)) / w, 0, 1); return lerp(b, a, h) - w * h * (1 - h); };

  function step(dt, inp) {
    st.t += dt;
    const speed = Math.max(0, inp.speed || 0), ground = inp.onGround !== false;
    st.speed = speed;
    const k = dt > 0 ? 1 - Math.exp(-dt * 10) : 1;
    gaitW(speed, inp.run, gw); const wWalkT = gw[0], wRunT = gw[1];
    if (inp.forced && dt === 0) { st.wRun = wRunT; st.wWalk = wWalkT; st.air = ground ? 0 : 1; }
    st.wRun = lerp(st.wRun, wRunT, k); st.wWalk = lerp(st.wWalk, wWalkT, k);
    st.air = lerp(st.air, ground ? 0 : 1, dt > 0 ? 1 - Math.exp(-dt * 16) : 0);
    st.vy = inp.vy || 0;
    if (ground && !st.prevGround) { st.land = 1; st.sipV -= 3.5; }   // landing: the knees take it, the siphons bob
    st.prevGround = ground;
    st.land = Math.max(0, st.land - dt * 4.5);
    const wW = st.wWalk, wR = st.wRun, wM = Math.min(1, wW + wR), rr = wM > 1e-4 ? wR / wM : 0;   // rr: the run's share
    const G = gaitMix(rr, gmix);
    const R = G.reach + HIP.x * Math.sin(G.hipYaw * DEG);   // half the planted boot's sweep (U), at full gait
    // the cycle rate: the caller's `cadence` (cycles/s; the movement lane locks it to the ground speed), or else the rate
    // at which the planted boot does not slide, capped where it still reads (HOYA_GAIT maxHz)
    let cadence;
    if (Number.isFinite(inp.cadence) && inp.cadence >= 0) cadence = inp.cadence;
    else { const travel = 2 * R * K * wM; cadence = speed > 0.03 && travel > 1e-5 ? Math.min(G.maxHz, (speed * G.stance) / travel) : 0; }
    st.cadence = cadence;
    st.phase = (st.phase + cadence * dt) % 1;
    st.pose = inp.forced || (!ground ? (st.vy > 0.3 ? 'jump' : 'fall') : st.wRun > 0.5 ? 'run' : st.wWalk > 0.35 ? 'walk' : 'idle');

    const ph = st.phase * TAU, air = st.air, gd = 1 - air, gm = wM * gd;
    const wI = (1 - wM) * gd, br = Math.sin((st.t * TAU) / 3.6), cm = opts.calm ? 0.35 : 1;   // cm: reduced motion
    const up = st.vy > 0 ? 1 : 0, wJ = air * up, wF = air * (1 - up);
    const cs = Math.cos(ph), sn = Math.sin(ph), swing = cs;   // his right boot strikes at phase 0, his left at 0.5

    // ---- the legs' targets (HOYA_GAIT): F forward of his centre line (U, his own frame), H the ankle's rise, the boot's pitch
    const yaw = G.hipYaw * DEG * cs * gm;   // the hips turn with the stride: his right hip forward as his right boot strikes
    for (let li = 0; li < 2; li++) {
      const s = li === 0 ? 1 : -1, T = legT[li], p = (st.phase + (s > 0 ? 0 : 0.5)) % 1;
      let F, H, pitch, planted = 0;
      if (p < G.stance) {   // stance: the planted boot sweeps back exactly as far as the body goes, heel -> flat -> toe
        const u = p / G.stance;
        F = R * (1 - 2 * u);
        pitch = G.heel * DEG * (1 - smooth(0, 0.28, u)) - G.toe * DEG * smooth(0.62, 1, u) - G.rise * DEG * Math.sin(Math.PI * clamp((u - 0.22) / 0.5, 0, 1));
        H = bootLift(pitch);
        planted = 1;
      } else {              // swing: the kick (the sole to the back), the knee up, the reach, the heel strikes toe-up
        const t = (p - G.stance) / (1 - G.stance), kick = Math.sin(Math.PI * clamp(t / 0.6, 0, 1)), late = Math.sin(Math.PI * clamp((t - 0.5) / 0.46, 0, 1));
        F = lerp(-R, R, smooth(0.15, 0.86, t)) + 0.06 * R * late;   // a little over-reach before the heel comes down
        pitch = lerp(-G.toe * DEG - G.kickPitch * DEG * kick, G.heel * DEG, smooth(0.45, 0.86, t)) + 10 * DEG * late;
        H = bootLift(-G.toe * DEG) * (1 - smooth(0, 0.3, t)) + G.kick * kick * (1 - t) + G.lift * Math.pow(Math.sin(Math.PI * t), 1.2) + G.highStep * late + bootLift(G.heel * DEG) * smooth(0.7, 1, t);
      }
      F *= gm; H *= gm; pitch *= gm;
      // in the air (NO.1-16, NO.1-6): his right knee comes up in front, the boot flexed toe-up so its orange sole faces
      // forward; his left leg reaches down and back; falling, both dangle
      F = lerp(F, up ? (s > 0 ? 0.22 : -0.14) : 0.06 * s, air); H = lerp(H, up ? (s > 0 ? 0.33 : 0.1) : 0.05, air);
      pitch = lerp(pitch, up ? (s > 0 ? 48 : -34) * DEG : -14 * DEG, air);
      T.F = F; T.H = H; T.pitch = pitch; T.planted = planted * gd;
      T.hipF = s * HIP.x * Math.sin(yaw);   // how far his hip is forward of its rest (the turn of the hips)
    }

    // ---- the pelvis: drops into each contact and rises through the passing (running: lowest mid-stance, up in the flight),
    //      never higher than the planted legs can reach; a lean into the run
    // 1 where the gait is lowest: walking, the "down" just after each contact (the knees take the step) and the "up" just
    // after the passing, on the planted toe; running, lowest mid-stance and up in the flight
    const c2 = Math.cos(2 * (ph - lerp(0.07, G.stance / 2, rr) * TAU));
    const bobY = (-G.drop * (0.5 + 0.5 * c2) + (G.flight + G.bounce) * (0.5 - 0.5 * c2)) * gm * (opts.calm ? 0.6 : 1);
    const drop = -0.11 * st.land * gd;
    const splayDrop = -0.4 * (1 - Math.cos(17 * DEG * wI + 5 * DEG * wM * gd));   // the A-stance leans the legs: lower him so the soles stay down
    let pdy = bobY + drop + splayDrop * gd + 0.003 * br * wI;
    const Lr = (LEG.thigh + LEG.shin) * 0.995;
    for (let li = 0; li < 2; li++) { const T = legT[li]; if (T.planted > 0.5) { const fh = T.F - T.hipF; pdy = smin(pdy, Math.sqrt(Math.max(0, Lr * Lr - fh * fh)) - (LEG.thigh + LEG.shin) + T.H + splayDrop * gd); } }
    st.pdy = pdy;
    pos(B.pelvis, sn * 0.012 * gm * cm, pdy, 0);   // a little sway over the planted boot
    const lean = 4 * DEG * wW + 11 * DEG * wR - 4 * DEG * wJ + 5 * DEG * wF;
    rot(B.pelvis, -lean * 0.45, yaw, -sn * 3 * DEG * gm);
    rot(B.spine, -lean * 0.55 - 0.6 * DEG * br * wI, -yaw * 0.8, sn * 2 * DEG * gm);   // the shoulders stay square
    pos(B.spine, 0, 0.004 * br * wI, 0);
    rot(B.head, lean * 0.45 + Math.cos(2 * (ph - 0.12 * TAU)) * 2.5 * DEG * gm + 1.0 * DEG * br * wI + 6 * DEG * st.land - 4 * DEG * wJ, -yaw * 0.15, sn * 2 * DEG * gm + 1.6 * DEG * Math.sin(st.t * 0.7) * wI);
    // ---- the siphons: a soft spring after the body (they sway; they never stretch)
    const sipT = -bobY * 9 * DEG - wJ * 0.06 + wF * 0.08;
    st.sipV += (-(st.sipJ - sipT) * 140 - st.sipV * 11) * dt;
    st.sipJ += st.sipV * dt;
    const sj = clamp(st.sipJ, -0.22, 0.22);
    rot(B.sipR, 0, 0, sj); rot(B.sipL, 0, 0, -sj);

    // ---- the legs: two-bone IK to the targets, the boots level in his frame, pitched as above; the A-stance (p.2).
    //      Each thigh turns back against the hips' turn (-yaw about the pelvis's up axis, 'YXZ'), so the leg swings in his
    //      own heading, not the hips': the knee and the boot keep pointing where he goes, and a planted boot is no longer
    //      carried sideways by the turn (it swung ~1.4-2.1 cm across each stance before; the movement lane saw it in town).
    for (let li = 0; li < 2; li++) {
      const s = li === 0 ? 1 : -1, n = s > 0 ? 'R' : 'L', T = legT[li];
      const { hip, knee } = legIK(T.F - T.hipF, T.H - pdy, LEG.thigh, LEG.shin);
      const splay = s * (17 * DEG * wI + 5 * DEG * wM * gd + 9 * DEG * air);   // the A-stance (p.2): boots wide, toes out
      E.set(hip, -yaw, splay, 'YXZ'); B['leg' + n].quaternion.setFromEuler(E);
      rot(B['shin' + n], knee, 0, 0);
      footWorld(n, s * (-20 * DEG * wI - 6 * DEG * wM * gd - 8 * DEG * air), T.pitch);
    }

    // ---- the sword arm keeps the サンマ up: raised out (p.2), held up while walking (NO.1-3), up and ahead while
    //      running (NO.1-11), high in the jump (NO.1-16)
    // (NO.1-1 measured: the guard's centre 1.32 U out at 2.34 U up, the tip at 3.97: the arm at 118 deg, the shoulder 0.12 out)
    const armRz = 118 * DEG * wI + 114 * DEG * wW + 104 * DEG * wR + 136 * DEG * wJ + 120 * DEG * wF;
    pos(B.armR, 0.12 * wI + 0.05 * (wW + air), 0.02 * wI, 0);   // v2: NO.1-1's guard is centred 1.32 U out (v1's 0.05: 1.23)
    const armRx = -swing * 12 * DEG * wW + (30 * DEG - swing * 8 * DEG) * wR - 12 * DEG * wJ + 0.8 * DEG * br * wI;
    rot(B.armR, armRx, 0, armRz);
    rot(B.foreR, 6 * DEG * wW + 16 * DEG * wR, 0, 4 * DEG * wW - 4 * DEG * wR - 6 * DEG * wJ);
    swordUp(-swing * 5 * DEG * wW + (24 * DEG + swing * 6 * DEG) * wR - 8 * DEG * wJ, 2 * DEG * Math.sin(st.t * 0.9) * wI - swing * 4 * DEG * wW);
    // ---- the free arm: out with the fist at the hip (p.2); walking it swings wide and forward with his right step (NO.1-8,
    //      NO.16-15), running it pumps, out in the air (NO.1-16)
    // (NO.1-1 measured: the elbow at (-0.72, 1.40) U, the fist at the hip (-0.82, 1.02): upper arm 62 deg, the elbow bent 48)
    // (the jump, NO.1-16: the free arm bent in front, the fist at his chest)
    const armLz = -(62 * DEG * wI + 30 * DEG * wW + 22 * DEG * wR + 38 * DEG * wJ + 72 * DEG * wF);
    rot(B.armL, swing * (56 * DEG * wW + 58 * DEG * wR) * gd + 12 * DEG * wW * gd + 0.8 * DEG * br * wI + 48 * DEG * wJ, 0, armLz);
    rot(B.foreL, 4 * DEG * wI + (20 + 18 * Math.max(0, swing)) * DEG * wW + 78 * DEG * wR + 96 * DEG * wJ + 16 * DEG * wF, 0, 48 * DEG * wI - 10 * DEG * wJ);
    rot(B.handL, 0, 0, 0);

    // ---- the cape: a damped spring, lifted behind by speed, a stiff flutter (shark skin)
    // (running it lifts less than it flares: from behind, the game's view, it stays a cape, not an edge)
    const liftT = 10 * DEG * wW + 30 * DEG * wR - 8 * DEG * wJ + 42 * DEG * wF;
    st.capeV += ((liftT - st.capeLift) * 38 - st.capeV * 9) * dt;
    st.capeLift += st.capeV * dt;
    if (inp.forced && dt === 0) { st.capeLift = liftT; st.capeV = 0; }
    const flutter = (Math.sin(st.t * 9.5) * (2.5 * DEG * wW + 5 * DEG * wR) + Math.sin(st.t * 1.3) * 1.2 * DEG * wI) * cm;
    rot(B.cape0, -st.capeLift * 0.25, 0, swing * 2.5 * DEG * wW);
    rot(B.cape1, -st.capeLift * 0.45 - flutter, 0, -swing * 3.5 * DEG * wM);
    rot(B.cape2, -st.capeLift * 0.55 - flutter * 1.6, 0, swing * 4.5 * DEG * wM);
    // the sides flare out in motion, toward NO.9-1 (a little more on the side of the leg that is swinging)
    const flare = (16 * DEG * wW + 28 * DEG * wR + 12 * DEG * wF - 4 * DEG * wJ) * (opts.calm ? 0.6 : 1);
    rot(B.capeL, 0, 0, -(flare + swing * 4 * DEG * wM * cm)); rot(B.capeR, 0, 0, flare - swing * 4 * DEG * wM * cm);

    // ---- blink: the manual's own closed eye (⌒) for 0.12 s every 2.5-5.5 s
    st.blinkT -= dt;
    if (st.blinkT <= 0) { st.blinking = opts.blink && !opts.calm ? 0.12 : 0; st.blinkT = 2.5 + rnd() * 3; }
    st.blinking = Math.max(0, st.blinking - dt);
    // the jump's wink (NO.1-16: his left eye, the manual's own closed ⌒); not with blink: false or reduced motion
    eyes(st.blinking > 0, opts.blink && !opts.calm && wJ > 0.6);
  }
  function eyes(shut, winkL = false) {
    const cR = shut, cL = shut || winkL;
    B.eyeR.scale.setScalar(cR ? 1e-4 : 1); B.eyeCR.scale.setScalar(cR ? 1 : 1e-4);
    B.eyeL.scale.setScalar(cL ? 1e-4 : 1); B.eyeCL.scale.setScalar(cL ? 1 : 1e-4);
  }
  eyes(false);
  return { step, reset, state: st, opts, blink(sec = 0.12) { st.blinking = sec; eyes(true); } };
}

// ------------------------------------------------------------------ triangulation of small simple polygons (ear clipping)
function earcut2(pts) {
  const idx = [...Array(pts.length).keys()], out = [];
  const ar = (a, b, c) => (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[c][0] - pts[a][0]) * (pts[b][1] - pts[a][1]);
  const inTri = (p, a, b, c) => ar(a, b, p) >= 0 && ar(b, c, p) >= 0 && ar(c, a, p) >= 0;
  for (let guard = 0; idx.length > 3 && guard < 4000; guard++) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i - 1 + idx.length) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (ar(a, b, c) <= 1e-12) continue;
      if (idx.some((j) => j !== a && j !== b && j !== c && inTri(j, a, b, c))) continue;
      out.push([a, b, c]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
