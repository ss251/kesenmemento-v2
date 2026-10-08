// [meme] 3D メメ (Meme): KesenMemento's own guide, the third-person walker that replaces 海の子 the previous walker.
//
// An original character of the KesenMemento team (2026). The design is the team's character sheet and bible (kept with the
// design files, not in this repository). Every
// number below is read off the sheet's SVG in its own units: U = one SVG px, 1.15 m / 576 U = 2.0 mm (soles at y 564,
// the cowlick's tip at y -12). Where the sheet draws a stroke, the surface here is the stroke's inner edge and the line
// (an inverted hull) its outer edge, so the silhouettes are the sheet's.
//
// Units and axes: metres; origin between the soles, +Y up, facing -Z, his right hand on +X: the frame the previous walker.js
// uses, so the walker places either the same way. Sheet front view (x, y) -> (-x, 564 - y) U; side view x -> -z.
//
// Cost: ONE geometry drawn twice, as the previous walker.js does it: the cel body (two colours per vertex, the lit tone and the
// shade tone, no texture) and the navy line (an inverted hull on LAYER_NO_OUTLINE). The parts are rigid groups on
// THREE.Bones (two draw calls whatever he does, and the shadow pass sees the pose); the only soft bends are the elbows,
// the knees, the shorts' legs and the hachimaki's tails. Nothing is ever scaled: every pose is a rotation.
//
// Construction (docs/character/BIBLE.md has the table): the head is an ellipsoid (the face) under a hair shell lofted
// from the fringe's zigzag to the crown; the hachimaki a band round the hair (tilted, with a saddle) and its wave, the bow
// and two tails on bone chains at the back; the body lathes of rounded (superellipse) sections; boots, backpack and camera rounded
// boxes; arms, legs, strap and string tubes. Secondary motion (tails, float charm, cowlick, backpack, camera) is a
// fixed-step verlet in the root's frame, driven by the pose and by his own motion (speed, vy, turns): framerate free.

export const MEME_HEIGHT = 1.15;                    // m, soles to the cowlick's tip (standing, bind pose)
export const MEME_U = 576;                          // the same height in sheet units (y 564 -> -12)
export const MEME_SCALE = MEME_HEIGHT / MEME_U;     // m per U (2.0 mm)

/** His colours, the sheet's palette (sRGB). 紺 is also the line. */
export const MEME_COLORS = Object.freeze({
  navy: '#223A70',    // 紺: hair, eyes, shorts, straps, the lens, the line
  red: '#DD4A2E',     // 朱: the hachimaki (大漁旗 red). Never recoloured.
  teal: '#17A2AE',    // 浅葱: the jacket
  yellow: '#F8B500',  // 山吹: boots, zip, backpack
  kinari: '#FBFAF5',  // 生成り: hood, cuffs, boot bands, camera, buckle, the band's wave
  skin: '#F7D9C4',    // 肌
  cheek: '#F4A694',   // the cheeks
  flap: '#E0A100',    // the backpack's flap
  float: '#7FD3DB',   // the glass fishing float (浮き球)
  white: '#FFFFFF',   // the eyes' highlights, the float's glint
  sheen: '#3E5A99',   // the hair's sheen
  mouth: '#B7282E',   // 茜: the open mouth
});
/** The shade tone of each colour: the sheet's own where it draws one (浅葱 #0F8592 the jacket's shaded side, 朱 #C43E26
 *  the far tail, 山吹 #E0A100 the far boot, 肌 #E9C5AE the far leg); the rest in the same small steps. 紺, white and the
 *  eyes stay flat (the hair is the line's colour; a darker hair would show the line lighter than the hair). */
export const MEME_SHADES = Object.freeze({
  navy: '#223A70', red: '#C43E26', teal: '#0F8592', yellow: '#E0A100', kinari: '#E2DED3', skin: '#E9C5AE', cheek: '#E3917F',
  flap: '#C48C00', float: '#62BAC4', white: '#FFFFFF', sheen: '#34508C', mouth: '#9C2228',
});
/** The line (inverted hull) widths in U, the sheet's strokes: 6 the body, 5 the cowlick/bow/tails/camera, 4 the small parts. */
export const MEME_LINE = Object.freeze({ outline: 6, small: 5, fine: 4 });
/**
 * Two flat tones from a light direction, as the sheet paints him: the lit colour where the sun (the first directional
 * light) meets the surface at n.l >= `at`, the shade colour elsewhere; every light reaches both tones in full (no
 * gradient). The sky's fill is the same from every side; the lights keep `hue` of their colour (a sunset warms him, his
 * colours stay his). `lift`: how much of his own colour he gives off at night (setLift(1)), so he never goes to a dark
 * silhouette in a dark town. `bias` leans a part toward the lit tone (added to n.l): the sheet never shades his face, so the
 * face stays lit unless the sun is behind him, and the small round parts (ears, hands, neck) shade only on their far side.
 */
export const MEME_TONE = Object.freeze({ at: 0.08, hue: 0.4, lift: 0.55, bias: { face: 1.0, ears: 0.4, hands: 0.3, neck: 0.6 } });

/**
 * The walk and the run. reach: how far (U) the planted boot sweeps either side of the hip at full stride; hipYaw: the
 * hips' turn with the step (deg, it adds to the sweep); stance: the stance's share of a cycle (a cycle is two steps);
 * drop: the pelvis's dip into the double support (walk) or mid-stance (run); lift: the knee's rise in the swing; kick:
 * the heel's kick-up behind; heel / toe: the boot's pitch at the strike and the push-off (deg); flight: the run's
 * float; lean: forward lean (deg); arm / elbow: the arm's swing and the elbow's bend (deg). Below strideWalk / strideRun
 * (m/s) the steps shorten (stride ~ v^strideExp), so a slow walk is small steps, not a fast shuffle.
 */
export const MEME_GAIT = Object.freeze({
  walk: { stance: 0.58, reach: 52, hipYaw: 11, drop: 9, lift: 27, kick: 13, heel: 16, toe: 22, kickPitch: 26, highStep: 5, bounce: 5, flight: 0, lean: 4, arm: 27, elbow: 16, maxHz: 4.2 },
  run: { stance: 0.36, reach: 58, hipYaw: 10, drop: 14, lift: 46, kick: 52, heel: 6, toe: 32, kickPitch: 64, highStep: 3, bounce: 0, flight: 15, lean: 13, arm: 50, elbow: 88, maxHz: 5.4 },
  walkFrom: 0.06, walkTo: 0.75, runFrom: 1.9, runTo: 2.9,
  strideWalk: 1.1, strideRun: 2.6, strideExp: 0.65,
});
/**
 * His speeds in third person (m/s), for the walker (player.walk3 / run3). His legs are 0.21 m hip to ankle (1.9x the previous walker's
 * 0.114 m): at full stride the planted boot sweeps 0.235 m walking and 0.257 m running (memeGait().travel), so at 1.3 m/s he
 * walks at 3.2 cycles/s (6.4 steps/s, a brisk kid's trot) and at 3.4 m/s runs at 4.8 cycles/s with a flight, both under
 * their readable ceilings (MEME_GAIT maxHz) and inside the walker's cadence clamp (1.6-5.5), so the planted boot never
 * slides. the previous walker's 1.5 / 3.0 needed 4.1 / 5.5 cycles/s on his 0.114 m legs, at the ceilings; Meme walks a little slower
 * (a kid looking around the harbour) and runs a little faster (his longer legs and the run's float carry 0.71 m a cycle).
 * At the characters registry's CHARACTER_SPEED (1.5 / 3.0) his boots stay planted too: 3.7 / 4.2 cycles/s.
 */
export const MEME_SPEED = Object.freeze({ walk: 1.3, run: 3.4 });

const QUALITY = {
  high: { hairRows: [0, 0.05, 0.16, 0.31, 0.48, 0.65, 0.81, 0.93, 1], hairBack: 13, rim: true, skin: [26, 8], ear: [8, 5], cowlick: [7, 6], band: 36, bandLow: true, wave: 5, knot: [8, 5], loop: [9, 5], tail: 4,
    torso: 16, hood: [18, 6], limb: 8, arm: 2, hand: [9, 6], leg: 7, legRings: 3, shorts: 14, legHole: 10, box: 2, camBox: 1, strap: 14, lens: 10, float: [9, 6], net: 2, ring: 12, decal: 16, small: 9, inkTol: 0.3, capSeg: 3, straps: 10, rr: 3, fineInk: true, buckle: 16, flatStrap: false },
  phone: { hairRows: [0, 0.08, 0.3, 0.57, 0.82, 1], hairBack: 19, rim: false, skin: [16, 5], ear: [5, 4], cowlick: [5, 5], band: 24, bandLow: false, wave: 2, knot: [6, 4], loop: [6, 4], tail: 2,
    torso: 10, hood: [12, 4], limb: 6, arm: 1, hand: [7, 4], leg: 6, legRings: 2, shorts: 10, legHole: 8, box: 1, camBox: 1, strap: 32, lens: 0, float: [6, 4], net: 1, ring: 10, decal: 10, small: 6, inkTol: 0.7, capSeg: 2, straps: 18, rr: 2, fineInk: false, buckle: 8, flatStrap: true },
};
export const MEME_QUALITIES = Object.freeze(Object.keys(QUALITY));
export const MEME_POSES = Object.freeze(['idle', 'walk', 'run', 'jump', 'fall']);
/** The sheet's faces: にこっ (his own), ほっ (the blink), 見つけた (the jump), おっ (the fall). */
export const EXPRESSIONS = Object.freeze(['smile', 'blink', 'wink', 'o']);

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
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const qbez = (a, c, b, t) => [lerp(lerp(a[0], c[0], t), lerp(c[0], b[0], t), t), lerp(lerp(a[1], c[1], t), lerp(c[1], b[1], t), t)];
const cbez = (p0, p1, p2, p3, t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
/** superellipse point and outward normal at angle a (0 = front (-Z), + toward +X) for half-sizes ax, bz, exponent n */
function sel(a, ax, bz, n) {
  const s = Math.sin(a), c = Math.cos(a), e = 2 / n;
  const x = ax * Math.sign(s) * Math.abs(s) ** e, z = -bz * Math.sign(c) * Math.abs(c) ** e;
  const gx = Math.sign(x) * Math.abs(x / ax) ** (n - 1) / ax, gz = Math.sign(z) * Math.abs(z / bz) ** (n - 1) / bz;
  const l = Math.hypot(gx, gz) || 1;
  return { x, z, nx: gx / l, nz: gz / l };
}
/** A rounded rectangle's outline (x, z) with outward normals, from the front's middle toward +X and round to it again. */
function rrect(hx, hz, r, segs) {
  const P = [[0, -hz]], N = [[0, -1]];
  const arc = (cx, cz, a0) => { for (let k = 0; k <= segs; k++) { const a = a0 + (k / segs) * (Math.PI / 2); P.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); N.push([Math.cos(a), Math.sin(a)]); } };
  arc(hx - r, -hz + r, -Math.PI / 2); arc(hx - r, hz - r, 0); arc(-hx + r, hz - r, Math.PI / 2); arc(-hx + r, -hz + r, Math.PI);
  P.push([0, -hz]); N.push([0, -1]);
  return { P, N };
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

// ------------------------------------------------------------------ the design (U)
const SOLE = 564;                                  // the sheet's ground line (y of the soles)
// HEAD: the face ellipse 118 x 108 round (0, 162), 110 deep in profile; the surface is the stroke's inner edge (-3)
const H0 = [0, SOLE - 162, 0];
const HEAD = { rx: 115, ry: 105, rz: 107 };
// HAIR: a shell over the head, 紺 like the line, so it carries no line of its own: its surface is the sheet's hair outline
// at the stroke's OUTER edge. Its thickness (U) over the head's surface: `eq` at the equator rising by `top` toward the
// crown (the sheet's hair 14 U over the head on top, 5-8 at the temples, + 6 of the stroke), `back` more behind, `flare`
// low on the sides (the sideburns' tips stand out to x 124 in the front view); `edge` at the fringe and the sideburns,
// blended in over `blend` radians from the edge.
const HAIR = { eq: 11, top: 9.5, back: 3, flare: 6, edgeFront: 3.5, edgeSide: 5, edgeBack: 8, blend: 0.2 };
// The fringe (front view, the sheet's zigzag; model x = -sheet x, head-frame y = 162 - sheet y), from his left to his right
const FRINGE = [[-110, 22], [-96, 10], [-86, 34], [-70, 16], [-58, 40], [-40, 20], [-26, 44], [-8, 22], [8, 46], [24, 22], [40, 42], [56, 18], [70, 38], [86, 14], [98, 32], [110, 20]];
// The hair's edge down his left side (side view, (z, head-frame y)): the sideburn in front of the ear, then under it
// to the nape (the ear sits on the hair). Mirrored for his right.
const SIDEBURN = [[-8, 10], [-3, -18], [3, -40], [20, -62], [42, -86]];
const NAPE_TH = 168 * DEG;                         // the hair's lower edge at the back of the head (back view: 紺 down to the hood)
// EARS: circles r 16 at (+-118, 178) front, (-30, 184) in profile: on the hair, 26 U behind the face's plane, 13 U clear of it
const EAR = { y: 162 - 182, z: 26, x: 123, r: [13, 16.5, 12.5] };
// COWLICK (アホ毛): the sheet's leaf, left edge then right edge (front view coords), lofted between them; it curls to his
// right-front (so the back view, the game's, curls to the right as the sheet's back view draws it, and the profile forward)
const COWLICK = { left: [[6, 42], [8, 16], [30, 6], [26, -12]], right: [[26, -12], [46, 4], [40, 34], [18, 46]], base: [12, 44], th: 0.12, sink: 7, curl: 30 * DEG, thick: 7 };
// HACHIMAKI: a band round the hair at head-frame height mid + tilt cos(ph) + saddle cos(2 ph): highest at the brow (96, the
// front view's middle at y 66-70), lower at the knot (78) and lowest over the ears (69), so it arcs over his head from the
// front and the back as the sheet draws it and slants from the brow down to the knot in profile, as its side view does
// (the sheet's three views cannot all hold for one band; docs/character/BIBLE.md). 23 U wide, 2.6 U off the hair (+ its
// 4 U line). The wave: 4 U kinari, 12 waves round.
const BAND = { mid: 78, tilt: 9, saddle: 9, half: 11.5, inner: -1, outer: 2.6, waves: 12, waveAmp: 3.4, waveW: 4 };
// The bow at the back (back view): the knot r 12 at (0, 84), two loops 46 x 36 out to x +-52
const BOW = { knot: [10, 10, 8], loop: { reach: 28, len: 25, h: 19, t: 9, rise: 2.5 } };
// The tails (back view): from the knot down and out, 140 U long, 6 -> 20 U wide, 4 U thick, the ends cut slanting (the sheet:
// (-58, 214) - (-38, 220)). Built splayed 25-27 deg; on their springs gravity settles them near the sheet's ~20.
const TAIL = { len: 138, w0: 6, w1: 20, th: 4, spread: [25, 27], gap: 2.5, segs: 3 };
// BODY rows: [y up, half-width, half-depth, centre z] (front view: the jacket 96 at the chest, 88 at the hem, the
// shoulders from the neck (y 266) to the corners (92, 288); profile: 126-138 deep, the shoulders sloping back)
const TORSO = [[143, 70, 56, -2], [145.5, 83, 62.5, -2], [151, 85.5, 64, -2], [186, 87, 63, -2], [224, 90, 61, -1], [258, 92, 59, -1],
  [272, 89, 57, -2], [284, 79, 51, -4], [292, 63, 43, -6], [298, 38, 30, -7]];
const TORSO_N = 2.6;                               // the sections' superellipse exponent (a jacket, not a barrel)
// (紺 like the line: no line of their own, their surface at the stroke's outer edge)
const SHORTS = { rows: [[168, 74, 52], [150, 77, 55], [142, 81, 58], [134, 80, 57], [126, 75, 53]], n: 2.6, legX: 44, legA: 34, legB: 53, legTop: 136, hem: 108 };
const NECK = { r: 27, y0: 282, y1: 330 };
// The hood folded round the neck (front: a crescent y 248-285, +-62; back: y 250-308, +-78): a roll on a loop, thin in front
const HOOD = { a: 53, b: 45, z: 2, yF: 298, yB: 285, hF: 17, hSide: 6.5, hB: 28, tF: 9.5, tSide: 7.5, tB: 23 };
const ZIP = { y0: 270, y1: 147, w: 7 };
const POCKET = { y: 202, x0: 26, x1: 60, w: 4 };
// ARMS: the sleeve 42 wide hanging 11 deg out from (+-109, 290); cuff y 372-384; the hand r 19 at (+-126, 402)
const SHOULDER = { x: 104, y: 272, z: 0 };
const ARM = { upper: 52, sleeve: 82, cuff: 13, hand: 107, r0: 18, r1: 17, cuffR: 20, handR: 16, top: 4 };
// LEGS and BOOTS: legs 32 wide at x +-36; boots 58 wide, 66 long (14 U forward of the leg), 80 tall, corners r 17; the
// kinari band the top 16 U; the sole's line 8 U up
const HIP = { x: 36, y: 140, z: 0 };
const LEG = { thigh: 52, shin: 54, r: 13, top: 126, bottom: 56 };
const BOOT = { c: [0, 38.5, -14], half: [26, 38.5, 32], r: 14, band: 61, sole: 8 };
// BACKPACK (back view 128 x 104 at y 300-404; profile 58 deep at z 60-118): the flap the top 34 U, the buckle 28 x 14
const PACK = { c: [0, 212, 89], half: [61, 49, 26], r: 15, flap: 34, buckle: [12, 5], strapX: 46 };
// CAMERA (front: 72 x 50 at (66, 384), the lens r 16; profile 40 deep, the lens 14 forward): at his left hip
const CAM = { c: [-66, 186, -72], half: [34, 23, 18], r: 9, lens: 14, lensL: 11, inner: 7, flash: [[-94, 198], [-80, 206]] };
// The FLOAT charm (back view: the string from the pack's corner (44, 404), the float r 17 at (56, 446))
const CHARM = { at: [50, 163, 104], string: 28, r: 14.5 };

// ------------------------------------------------------------------ head-frame helpers (U, round H0)
const dirOf = (th, ph) => [Math.sin(th) * Math.sin(ph), Math.cos(th), -Math.sin(th) * Math.cos(ph)];   // ph 0 = the face
function headAt(th, ph) {
  const s = dirOf(th, ph);
  return { p: [HEAD.rx * s[0], HEAD.ry * s[1], HEAD.rz * s[2]], n: norm([s[0] / HEAD.rx, s[1] / HEAD.ry, s[2] / HEAD.rz]) };
}
function thPhOf(p) {
  const ex = p[0] / HEAD.rx, ey = p[1] / HEAD.ry, ez = p[2] / HEAD.rz, r = Math.hypot(ex, ey, ez) || 1;
  return [Math.acos(clamp(ey / r, -1, 1)), Math.atan2(ex, -ez)];
}
const frontZ = (x, y) => -HEAD.rz * Math.sqrt(Math.max(0, 1 - (x / HEAD.rx) ** 2 - (y / HEAD.ry) ** 2));
const sideX = (z, y, s) => s * HEAD.rx * Math.sqrt(Math.max(0, 1 - (z / HEAD.rz) ** 2 - (y / HEAD.ry) ** 2));
/** the hair's thickness (U) over the head, away from its edge */
function hairT(th, ph) {
  const c = Math.max(0, Math.cos(th)), back = Math.max(0, -Math.cos(ph)), side = Math.abs(Math.sin(ph));
  return HAIR.eq + HAIR.top * c * c + HAIR.back * back * Math.sin(th) + HAIR.flare * smooth(1.45, 1.98, th) * side * side;
}
function hairEdgeT(ph) { const c = Math.cos(ph); return c > 0 ? lerp(HAIR.edgeSide, HAIR.edgeFront, smooth(0.25, 0.6, c)) : lerp(HAIR.edgeSide, HAIR.edgeBack, smooth(0.2, 0.7, -c)); }
/** the hair's outer surface at (th, ph) (head frame) */
function hairAt(th, ph) { const h = headAt(th, ph); return { p: add(h.p, mul(h.n, hairT(th, ph))), n: h.n }; }

/** The hair's edge as a loop round the head: [ph, th] from ph -180 (the nape, his left half) through the fringe to +180. */
function hairLoop(backStepDeg) {
  const L = [];
  const side = (s) => SIDEBURN.map(([z, y]) => thPhOf([sideX(z, y, s), y, z]).reverse());   // [ph, th]
  const left = side(-1).reverse(), right = side(1);                                          // left: from the nape toward the fringe
  const fringe = FRINGE.map(([x, y]) => thPhOf([x, y, frontZ(x, y)]).reverse());
  // the nape: from the last sideburn point round the back to ph 180 (th easing down to NAPE_TH)
  const back = (s) => {
    const [ph0, th0] = s < 0 ? left[0] : right[right.length - 1], out = [];
    const n = Math.max(2, Math.round((Math.PI - Math.abs(ph0)) / (backStepDeg * DEG)));
    for (let k = 1; k < n; k++) { const f = k / n, ph = s * lerp(Math.abs(ph0), Math.PI, f); out.push([ph, lerp(th0, NAPE_TH, smooth(0, 1, f))]); }
    return out;
  };
  L.push([-Math.PI, NAPE_TH], ...back(-1).reverse(), ...left, ...fringe, ...right, ...back(1));
  return L;
}
/** the hair's edge's polar angle at ph (linear along the loop) */
function loopTh(loop, ph) {
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length], pb = i === loop.length - 1 ? b[0] + TAU : b[0];
    if (ph >= a[0] && ph <= pb) return lerp(a[1], b[1], (ph - a[0]) / ((pb - a[0]) || 1));
  }
  return NAPE_TH;
}

// ------------------------------------------------------------------ the mesher
class Mesher {
  constructor(K, lineK) { this.K = K; this.lineK = lineK; this.P = []; this.N = []; this.C = []; this.S = []; this.SI = []; this.SW = []; this.HW = []; this.BI = []; this.I = []; this.IL = []; this.nv = 0; this.parts = []; this.bias = 0; }
  /** p in U (model frame), col = [lit rgb, shade rgb] (linear), w: bone index or [[bone, weight], ...], hw: line width in U (0: none) */
  vert(p, n, col, w, hw) {
    const K = this.K, l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.P.push(p[0] * K, p[1] * K, p[2] * K); this.N.push(n[0] / l, n[1] / l, n[2] / l);
    this.C.push(col[0], col[1], col[2]); this.S.push(col[3], col[4], col[5]);
    const ws = typeof w === 'number' ? [[w, 1]] : w.filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = ws.reduce((s, e) => s + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { this.SI.push(ws[k] ? ws[k][0] : 0); this.SW.push(ws[k] ? ws[k][1] / tot : 0); }
    this.HW.push(hw * K * this.lineK);
    this.BI.push(this.bias);   // the tone's lean toward lit (MEME_TONE.bias) for the part being built
    return this.nv++;
  }
  tri(a, b, c, line) { this.I.push(a, b, c); if (line) this.IL.push(a, b, c); }
  part(name) { this.parts.push([name, this.I.length / 3, this.IL.length / 3]); }
  pos(i) { return [this.P[i * 3] / this.K, this.P[i * 3 + 1] / this.K, this.P[i * 3 + 2] / this.K]; }
}

// ------------------------------------------------------------------ the builder
/**
 * Build Meme. opts: { quality: 'high' | 'phone', calm (reduced motion), blink (default true), lineScale (<= 1), mat (the
 * world's ctx.mat: accepted, unused; he carries his own two-tone material) }. Never throws: a bad build returns null, quietly
 * (the characters registry's loader writes nothing to the console); build.lastError keeps what went wrong.
 */
export function build(THREE, opts = {}) {
  build.lastError = null;
  try {
    const m = buildMeme(THREE, opts || {});
    return m && m.root ? m : null;
  } catch (e) {
    build.lastError = e;
    return null;
  }
}
build.lastError = null;

/** The builder itself (throws on a bad THREE; build() is the safe entry). */
export function buildMeme(THREE, opts = {}) {
  const qname = QUALITY[opts.quality] ? opts.quality : 'high';
  const Q = QUALITY[qname];
  const K = MEME_SCALE;
  const lineK = clamp(fin(opts.lineScale, 1), 0, 1);
  const COL = {};
  for (const [k, hex] of Object.entries(MEME_COLORS)) { const c = new THREE.Color(hex), s = new THREE.Color(MEME_SHADES[k]); COL[k] = [c.r, c.g, c.b, s.r, s.g, s.b]; }
  const M = new Mesher(K, lineK);
  const OUT = MEME_LINE.outline, SMALL = MEME_LINE.small, FINE = MEME_LINE.fine;
  const LIFT = 0.9;                                // decals and ink sit 0.9 U (1.8 mm) off their surface

  // ---------------- bones (bind pose: standing straight, arms and legs hanging, every rotation identity)
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
  const B = {};
  B.root = bone('root', null, [0, 0, 0]);
  B.pelvis = bone('pelvis', B.root, [0, HIP.y, 0]);
  B.spine = bone('spine', B.pelvis, [0, 164, 0]);
  B.head = bone('head', B.spine, [0, 300, -2]);
  const W = (p) => add(H0, p);   // head frame -> model
  // the cowlick's root on the crown
  const cw = hairAt(COWLICK.th, 0), cwO = W(sub(cw.p, mul(cw.n, COWLICK.sink)));
  B.cowlick = bone('cowlick', B.head, cwO);
  // the band's back (the knot) and the tails' joints (draped down the back of the hair)
  const bandTh = (ph) => {   // the band's middle: the polar angle where the hair's outer surface is at the band's height
    const y = BAND.mid + BAND.tilt * Math.cos(ph) + BAND.saddle * Math.cos(2 * ph);
    let lo = 0.05, hi = 1.5;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (hairAt(m, ph).p[1] > y) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  const bandAt = (th, ph, off) => { const h = hairAt(th, ph); return { p: add(h.p, mul(h.n, off)), n: h.n }; };
  const knotC = (() => { const b = bandAt(bandTh(Math.PI), Math.PI, BAND.outer); return add(b.p, mul(b.n, BOW.knot[2] * 0.55)); })();
  const tailPath = (s) => {   // a tail's centre line in the head frame, bind pose: down and out over the back of the hair, lying on it
    const sp = TAIL.spread[s > 0 ? 1 : 0] * DEG, pts = [];
    for (let k = 0; k <= 24; k++) {
      const d = (k / 24) * TAIL.len, x = s * (TAIL.gap + d * Math.sin(sp)), y = knotC[1] - 6 - d * Math.cos(sp);
      const z = HEAD.rz * Math.sqrt(Math.max(0.02, 1 - (x / HEAD.rx) ** 2 - (y / HEAD.ry) ** 2)), [th, ph] = thPhOf([x, y, z]), h = hairAt(th, ph);
      pts.push(add(h.p, mul(h.n, TAIL.th / 2 + 1.5)));
    }
    // re-space by arc length so the joints sit at equal lengths
    return resample(pts, TAIL.len / 48);
  };
  const TP = { L: tailPath(-1), R: tailPath(1) };
  const tailJoint = (P, f) => P[Math.round(f * (P.length - 1))];
  for (const n of ['L', 'R']) {
    let prev = B.head;
    for (let k = 0; k < TAIL.segs; k++) { prev = bone('tail' + n + k, prev, W(tailJoint(TP[n], k / TAIL.segs))); B['tail' + n + k] = prev; }
  }
  // the face's swaps (scale 1 shown / 1e-4 hidden): open eyes, the blink's closed eyes, the 見つけた wink, three mouths
  const EYE = { x: 42, y: -8, rx: 15, ry: 21 };
  const onFace = (x, y) => [x, y, frontZ(x, y)];
  for (const s of [1, -1]) {
    const n = s > 0 ? 'R' : 'L', c = W(onFace(s * EYE.x, EYE.y));
    B['eye' + n] = bone('eyeOpen' + n, B.head, c);
    B['eyeShut' + n] = bone('eyeShut' + n, B.head, c);
  }
  B.eyeWinkR = bone('eyeWinkR', B.head, W(onFace(EYE.x, EYE.y)));
  B.mouthSmile = bone('mouthSmile', B.head, W(onFace(0, -48)));
  B.mouthOpen = bone('mouthOpen', B.head, W(onFace(0, -50)));
  B.mouthO = bone('mouthO', B.head, W(onFace(0, -52)));
  for (const s of [1, -1]) {
    const n = s > 0 ? 'R' : 'L';
    B['arm' + n] = bone('arm' + n, B.spine, [s * SHOULDER.x, SHOULDER.y, SHOULDER.z]);
    B['fore' + n] = bone('fore' + n, B['arm' + n], [s * SHOULDER.x, SHOULDER.y - ARM.upper, SHOULDER.z]);
    B['leg' + n] = bone('leg' + n, B.pelvis, [s * HIP.x, HIP.y, HIP.z]);
    B['shin' + n] = bone('shin' + n, B['leg' + n], [s * HIP.x, HIP.y - LEG.thigh, HIP.z]);
    B['foot' + n] = bone('foot' + n, B['shin' + n], [s * HIP.x, HIP.y - LEG.thigh - LEG.shin, HIP.z]);
  }
  B.pack = bone('pack', B.spine, [0, PACK.c[1] + PACK.half[1] - 4, PACK.c[2] - PACK.half[2] + 4]);
  B.charm = bone('charm', B.pack, CHARM.at);
  B.cam = bone('cam', B.spine, [CAM.c[0], CAM.c[1] + CAM.half[1] + 3, CAM.c[2] + 6]);
  const bi = (b) => b.userData.i;
  const hb = bi(B.head), sp = bi(B.spine), pv = bi(B.pelvis);

  // ---------------- generic parts (U, model frame, bind pose)
  /** A grid surface fn(u, v, i, j) -> { p, n?, col?, w?, hw? } of (nu+1) x (nv+1) points. */
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
        row.push(M.vert(r.p, n, r.col || o.col, r.w ?? o.w, r.hw ?? o.hw));
      }
      idx.push(row);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = idx[j][i], b = idx[j][i + 1], c = idx[j + 1][i], d = idx[j + 1][i + 1];
      const t1 = !((o.poles === true || o.poles === 'first') && j === 0), t2 = !((o.poles === true || o.poles === 'last') && j === nv - 1);
      if (flip) { if (t1) M.tri(a, b, c, o.line); if (t2) M.tri(b, d, c, o.line); } else { if (t1) M.tri(a, c, b, o.line); if (t2) M.tri(b, c, d, o.line); }
    }
    return idx;
  }
  /** Ellipsoid with poles on its local Y. frame: [X, Y, Z] axes (default the model's); deform(p, n, u, v) -> { p, n }. */
  function ellipsoid(c, r, nu, nv, o, frame = null, deform = null) {
    const [X, Y, Z] = frame || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    return grid(nu, nv, (u, v) => {
      const ph = u * TAU, th = v * Math.PI;
      const sx = Math.sin(th) * Math.sin(ph), sy = Math.cos(th), sz = Math.sin(th) * Math.cos(ph);
      let lp = [r[0] * sx, r[1] * sy, r[2] * sz], ln = [sx / r[0], sy / r[1], sz / r[2]];
      if (deform) { const d = deform(lp, ln, u, v); lp = d.p; ln = d.n; }
      const p = add(c, add(add(mul(X, lp[0]), mul(Y, lp[1])), mul(Z, lp[2]))), n = norm(add(add(mul(X, ln[0]), mul(Y, ln[1])), mul(Z, ln[2])));
      return { p, n };
    }, { ...o, wrapU: true, poles: true, orient: 'out' });
  }
  /** Tube along a polyline, radius per point (or [ra, rb] in its frame), optional end caps (hemispheres flattened). */
  function tube(path, radii, sides, o) {
    const n = path.length, frames = [];
    let prev = o.up ? norm(o.up) : null;
    for (let i = 0; i < n; i++) {
      const t = norm(sub(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]));
      let a = prev ? sub(prev, mul(t, dot(prev, t))) : (Math.abs(t[2]) < 0.9 ? cross(t, [0, 0, 1]) : cross(t, [1, 0, 0]));
      a = norm(a); prev = a;
      frames.push([a, cross(t, a), t]);
    }
    const P = path.slice(), R = radii.slice(), F = frames.slice(), WT = path.map((_, i) => (o.wFn ? o.wFn(i / (n - 1)) : o.w)), HWs = path.map((_, i) => (o.hwFn ? o.hwFn(i / (n - 1)) : o.hw));
    for (const [end, cap] of [[0, o.cap0], [1, o.cap1]]) {   // caps: rings closing to a point along the tube's axis
      if (!cap) continue;
      const k = end ? n - 1 : 0, r0 = R[k], ra = Array.isArray(r0) ? r0 : [r0, r0], t = mul(F[k][2], end ? 1 : -1), depth = cap === true ? Math.max(ra[0], ra[1]) : cap;
      const rings = [];
      for (const f of [0.55, 0.85, 1]) { const ang = f * Math.PI / 2; rings.push([add(P[k], mul(t, Math.sin(ang) * depth)), f === 1 ? 0.0001 : [ra[0] * Math.cos(ang), ra[1] * Math.cos(ang)]]); }
      if (end) { for (const [p, r] of rings) { P.push(p); R.push(r); F.push(F[k]); WT.push(WT[k]); HWs.push(HWs[k]); } }
      else { for (const [p, r] of rings) { P.unshift(p); R.unshift(r); F.unshift(F[0]); WT.unshift(WT[0]); HWs.unshift(HWs[0]); } }
    }
    const m = P.length;
    return grid(sides, m - 1, (u, v, i, j) => {
      const [a, b] = F[j], r = R[j], ra = Array.isArray(r) ? r[0] : r, rb = Array.isArray(r) ? r[1] : r;
      const ang = u * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      return { p: add(P[j], add(mul(a, ca * ra), mul(b, sa * rb))), n: norm(add(mul(a, ca / Math.max(ra, 1e-3)), mul(b, sa / Math.max(rb, 1e-3)))), w: WT[j], hw: HWs[j] };
    }, { ...o, wrapU: true, orient: 'out', poles: o.cap0 && o.cap1 ? true : o.cap0 ? 'first' : o.cap1 ? 'last' : false });
  }
  /** A lathe round a vertical axis through (cx, cz): rows [{ y, r, col, n: [radial, up], w }] (a row repeated with a new
   *  colour or normal makes a crisp seam; zero-width quads are dropped). segs round, starting at the front (-Z). */
  function lathe(cx, cz, rows, segs, o) {
    const idx = rows.map((r) => {
      const row = [];
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * TAU, sx = Math.sin(a), sz = -Math.cos(a), nr = r.n ? r.n[0] : 1, ny = r.n ? r.n[1] : 0;
        row.push(M.vert([cx + sx * r.r, r.y, cz + sz * r.r], norm([sx * nr, ny, sz * nr]), r.col || o.col, r.w ?? o.w, r.hw ?? o.hw));
      }
      return row;
    });
    for (let j = 0; j < rows.length - 1; j++) {
      if (Math.abs(rows[j].y - rows[j + 1].y) < 1e-6 && Math.abs(rows[j].r - rows[j + 1].r) < 1e-6) continue;
      const down = rows[j + 1].y < rows[j].y || (rows[j + 1].y === rows[j].y && rows[j + 1].r > rows[j].r) ? 1 : -1;
      for (let i = 0; i < segs; i++) {
        const a = idx[j][i], b = idx[j][(i + 1) % segs], c = idx[j + 1][i], d = idx[j + 1][(i + 1) % segs], line = o.line && rows[j].hw !== 0 && rows[j + 1].hw !== 0;
        const t1 = rows[j].r >= 1e-3, t2 = rows[j + 1].r >= 1e-3;   // a row of radius 0 is a pole: one triangle per quad
        if (down > 0) { if (t1) M.tri(a, b, c, line); if (t2) M.tri(b, d, c, line); } else { if (t1) M.tri(a, c, b, line); if (t2) M.tri(b, c, d, line); }
      }
    }
    return idx;
  }
  /**
   * A rounded box (the sheet's rounded rects in depth): each face a grid whose rows and columns sit where the rounding
   * needs them (k per 45 deg of each edge), projected onto the box of half-sizes `half` with corner radius r. `split`:
   * [{ axis: 1, at: local y, below: colKey, above: colKey }] colour seams on doubled rows (crisp, never blended).
   */
  function roundBox(c, half, r, k, o) {
    const inner = half.map((h) => h - r);
    const coords = (ax) => {
      const h = half[ax], i0 = inner[ax], out = [-h];
      for (let q = k - 1; q >= 1; q--) out.push(-(i0 + r * Math.tan((Math.PI / 4) * q / k)));
      out.push(-i0, i0);
      for (let q = 1; q <= k - 1; q++) out.push(i0 + r * Math.tan((Math.PI / 4) * q / k));
      out.push(h);
      for (const s of o.split || []) if (s.axis === ax) { out.push(s.at, s.at); }
      return out.sort((a, b) => a - b);
    };
    const C = [coords(0), coords(1), coords(2)];
    const colAt = (local, j, list, ax) => {
      for (const s of o.split || []) if (s.axis === ax) {
        const v = local[ax];
        if (Math.abs(v - s.at) < 1e-9) { const first = list.indexOf(s.at); return j === first ? COL[s.below] : COL[s.above]; }
        return v < s.at ? COL[s.below] : COL[s.above];
      }
      return null;
    };
    const faces = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
    for (const [ax, u, v] of faces) for (const sgn of [1, -1]) {
      if (o.skip && o.skip(ax, sgn)) continue;
      const U = C[u], V = C[v], idx = [];
      for (let j = 0; j < V.length; j++) {
        const row = [];
        for (let i = 0; i < U.length; i++) {
          const local = [0, 0, 0]; local[ax] = sgn * half[ax]; local[u] = U[i]; local[v] = V[j];
          const q = local.map((x, d) => clamp(x, -inner[d], inner[d])), dn = sub(local, q), nn = len(dn) > 1e-9 ? norm(dn) : (() => { const z = [0, 0, 0]; z[ax] = sgn; return z; })();
          const p = add(q, mul(nn, r));
          let col = o.col;
          const seamAx = (o.split || []).find((s) => s.axis === u || s.axis === v);
          if (seamAx) col = colAt(local, seamAx.axis === u ? i : j, seamAx.axis === u ? U : V, seamAx.axis) || col;
          else if ((o.split || []).some((s) => s.axis === ax)) col = colAt(local, 0, [], ax) || col;
          row.push(M.vert(add(c, p), nn, col, o.w, o.hw));
        }
        idx.push(row);
      }
      for (let j = 0; j < V.length - 1; j++) for (let i = 0; i < U.length - 1; i++) {
        if (Math.abs(U[i + 1] - U[i]) < 1e-9 || Math.abs(V[j + 1] - V[j]) < 1e-9) continue;   // a seam's zero-width row
        const a = idx[j][i], b = idx[j][i + 1], cc = idx[j + 1][i], d = idx[j + 1][i + 1];
        // outward winding: (u, v, ax) is right-handed for the three faces above
        if (sgn > 0) { M.tri(a, b, d, o.line); M.tri(a, d, cc, o.line); } else { M.tri(a, d, b, o.line); M.tri(a, cc, d, o.line); }
      }
    }
  }
  /** Ink (or paint) ribbon through surface points (U) with their normals; width w; round caps unless closed. */
  function ribbon(pts0, nrms0, w, col, wb, caps = true) {
    const closed = len(sub(pts0[0], pts0[pts0.length - 1])) < 1e-6;
    const keep = dpKeep(pts0, Q.inkTol), pts = keep.map((i) => pts0[i]), nrms = keep.map((i) => nrms0[i]);
    if (closed) { pts.pop(); nrms.pop(); caps = false; }
    const n = pts.length, h = w / 2, L = [], R = [], side = [];
    if (n < 2) return;
    const P = (i) => pts[closed ? (i + n) % n : clamp(i, 0, n - 1)];
    for (let i = 0; i < n; i++) {
      const t = norm(sub(P(i + 1), P(i - 1))), s = norm(cross(nrms[i], t));
      let k = 1;
      if (closed || (i > 0 && i < n - 1)) { const t0 = norm(sub(P(i), P(i - 1))), t1 = norm(sub(P(i + 1), P(i))); k = 1 / Math.max(0.6, Math.cos(Math.acos(clamp(dot(t0, t1), -1, 1)) / 2)); }
      const p = add(pts[i], mul(nrms[i], LIFT));
      side.push(s);
      L.push(M.vert(add(p, mul(s, h * k)), nrms[i], col, wb, 0));
      R.push(M.vert(add(p, mul(s, -h * k)), nrms[i], col, wb, 0));
    }
    for (let i = 0; i < n - (closed ? 0 : 1); i++) { const j = (i + 1) % n; M.tri(L[i], R[i], L[j], false); M.tri(L[j], R[i], R[j], false); }
    if (!caps) return;
    const segs = Q.capSeg;
    for (const end of [0, n - 1]) {
      const tOut = end === 0 ? norm(sub(pts[0], pts[1])) : norm(sub(pts[n - 1], pts[n - 2]));
      const s = side[end], p = add(pts[end], mul(nrms[end], LIFT));
      const c = M.vert(p, nrms[end], col, wb, 0), ring = [L[end]];
      for (let q = 1; q < segs; q++) { const a = (q / segs) * Math.PI; ring.push(M.vert(add(p, mul(add(mul(s, Math.cos(a)), mul(tOut, Math.sin(a))), h)), nrms[end], col, wb, 0)); }
      ring.push(R[end]);
      for (let q = 0; q < segs; q++) { if (end === 0) M.tri(c, ring[q], ring[q + 1], false); else M.tri(c, ring[q + 1], ring[q], false); }
    }
  }
  /** A filled disc / ellipse / polygon on a surface: proj(x, y) -> { p, n } maps the shape's 2D points onto it. */
  function decal(shape, centre, proj, col, wb, lift = LIFT) {
    const c = proj(centre[0], centre[1]), ci = M.vert(add(c.p, mul(c.n, lift)), c.n, col, wb, 0), ring = [];
    for (const [x, y] of shape) { const q = proj(x, y); ring.push(M.vert(add(q.p, mul(q.n, lift)), q.n, col, wb, 0)); }
    // the winding faces along the surface normal
    const a = M.pos(ring[0]), b = M.pos(ring[1]), flip = dot(cross(sub(a, M.pos(ci)), sub(b, M.pos(ci))), c.n) < 0;
    for (let s = 0; s < ring.length; s++) { const j = (s + 1) % ring.length; if (flip) M.tri(ci, ring[j], ring[s], false); else M.tri(ci, ring[s], ring[j], false); }
  }
  const ellipse2 = (cx, cy, rx, ry, segs, rot = 0) => { const out = []; for (let s = 0; s < segs; s++) { const a = (s / segs) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); } return out; };
  /** the face's front surface (head frame front-view x, y) -> model point and normal */
  const faceProj = (x, y) => { const z = frontZ(x, y), p = [x, y, z]; return { p: W(p), n: norm([x / HEAD.rx ** 2, y / HEAD.ry ** 2, z / HEAD.rz ** 2]) }; };
  /** ink along a polyline on the face (front-view coords, head frame) */
  function faceInk(pts2, w, col, wb, step = 2.5, caps = true) {
    const P = [], N = [];
    for (const [x, y] of resample(pts2, step)) { const f = faceProj(x, y); P.push(f.p); N.push(f.n); }
    ribbon(P, N, w, col, wb, caps);
  }

  M.part('head');
  // ================================================================== HEAD: the face (skin) under the hair
  const loop = hairLoop(Q.hairBack);
  M.bias = MEME_TONE.bias.face;
  {
    const [nu, nv] = Q.skin;
    // the skin reaches up under the hair (hidden there): above the lowest edge round each column, by 9 deg
    const topTh = (ph) => { let m = Infinity; for (let k = -4; k <= 4; k++) m = Math.min(m, loopTh(loop, ph + (k / 4) * (TAU / nu) * 1.2)); return m - 9 * DEG; };
    const tops = [...Array(nu + 1).keys()].map((i) => topTh(-Math.PI + (i / nu) * TAU));
    grid(nu, nv, (u, v, i) => {
      const ph = -Math.PI + u * TAU, th = lerp(tops[i % nu], Math.PI, Math.pow(v, 0.92));
      const h = headAt(th, ph);
      return { p: W(h.p), n: h.n };
    }, { col: COL.skin, w: hb, hw: OUT, line: true, wrapU: true, poles: 'last', orient: 'out' });
  }
  M.bias = 0;
  M.part('hair');
  // ================================================================== HAIR: a shell lofted from its edge (the fringe's zigzag, the sideburns, the nape) to the crown
  {
    const rows = Q.hairRows, nu = loop.length;
    const edgeOf = loop.map(([ph]) => hairEdgeT(ph));
    const at = (i, v) => {
      const [ph, th0] = loop[i % nu], th = th0 * (1 - v), d = th0 - th;
      const h = headAt(th, ph), t = lerp(edgeOf[i % nu], hairT(th, ph), smooth(0, HAIR.blend, d));
      return { p: W(add(h.p, mul(h.n, t))), n: v >= 1 ? [0, 1, 0] : undefined };
    };
    grid(nu, rows.length - 1, (u, v, i, j) => at(i, rows[j]), { col: COL.navy, w: hb, hw: 0, line: false, wrapU: true, poles: 'last' });
    // the rim: from the shell's edge down into the head, facing away from the hair (the fringe's thickness in profile)
    const rim = [];
    for (let i = 0; i < nu && Q.rim; i++) {
      const [ph, th] = loop[i], h = headAt(th, ph), o = add(h.p, mul(h.n, edgeOf[i])), inn = sub(h.p, mul(h.n, 2.5));
      const prev = loop[(i - 1 + nu) % nu], next = loop[(i + 1) % nu];
      const pa = headAt(prev[1], prev[0]).p, pb = headAt(next[1], next[0]).p;
      let rn = norm(cross(sub(pb, pa), h.n));
      if (dot(rn, headAt(Math.min(Math.PI, th + 0.1), ph).p.map((v2, k) => v2 - h.p[k])) < 0) rn = mul(rn, -1);   // away from the hair (toward larger th)
      rim.push([M.vert(W(o), rn, COL.navy, hb, 0), M.vert(W(inn), rn, COL.navy, hb, 0)]);
    }
    for (let i = 0; i < rim.length; i++) {
      const [a, b] = rim[i], [c, d] = rim[(i + 1) % nu];
      const pa = M.pos(a), pc = M.pos(c), pb2 = M.pos(b), nrm = [M.N[a * 3], M.N[a * 3 + 1], M.N[a * 3 + 2]];
      if (dot(cross(sub(pc, pa), sub(pb2, pa)), nrm) > 0) { M.tri(a, c, b, false); M.tri(c, d, b, false); } else { M.tri(a, b, c, false); M.tri(c, b, d, false); }
    }
    // the sheen (the sheet's lighter 紺 strokes): over the brow above the band, on his right; and at the nape
    const bandTop = (ph) => bandTh(ph) - (BAND.half + 6) / (HEAD.ry + 10);
    const brow = [], browN = [];
    for (let k = 0; k <= 14; k++) { const ph = lerp(42, -10, k / 14) * DEG, th = bandTop(ph) - 0.05 * Math.sin(Math.PI * k / 14); const h = hairAt(th, ph); brow.push(W(h.p)); browN.push(h.n); }
    if (Q.fineInk) ribbon(brow, browN, 7, COL.sheen, hb);
    const nape = [], napeN = [];
    for (let k = 0; k <= 12; k++) { const ph = Math.PI + lerp(-24, 24, k / 12) * DEG, th = 133 * DEG + 0.06 * Math.sin(Math.PI * k / 12); const h = hairAt(th, ph); nape.push(W(h.p)); napeN.push(h.n); }
    ribbon(nape, napeN, 6, COL.sheen, hb);
  }
  M.part('ears');
  M.bias = MEME_TONE.bias.ears;
  for (const s of [1, -1]) {
    const c = W([s * EAR.x, EAR.y, EAR.z]);
    ellipsoid(c, EAR.r, Q.ear[0], Q.ear[1], { col: COL.skin, w: hb, hw: SMALL, line: true });
  }
  M.bias = MEME_TONE.bias.face;
  M.part('face');
  // ================================================================== FACE: the sheet's にこっ, its blink (ほっ), the 見つけた wink and the おっ mouth
  {
    const seg = Q.decal, small = Q.small;
    for (const s of [1, -1]) {
      const n = s > 0 ? 'R' : 'L', ex = s * EYE.x, ey = EYE.y, eb = bi(B['eye' + n]);
      decal(ellipse2(ex, ey, EYE.rx, EYE.ry, seg), [ex, ey], faceProj, COL.navy, eb, LIFT);
      decal(ellipse2(ex + 5, ey + 9, 6, 6, small), [ex + 5, ey + 9], faceProj, COL.white, eb, LIFT + 0.6);
      decal(ellipse2(ex - 4, ey - 10, 2.6, 2.6, Math.max(5, small - 3)), [ex - 4, ey - 10], faceProj, COL.white, eb, LIFT + 0.6);
      // the closed eye of ほっ (a soft ∪), for the blink
      const arc = []; for (let k = 0; k <= 10; k++) arc.push(qbez([ex + 16, ey + 2], [ex, ey - 10], [ex - 16, ey + 2], k / 10));
      faceInk(arc, 7, COL.navy, bi(B['eyeShut' + n]), 2);
      // the cheeks (no line)
      decal(ellipse2(s * 76, -36, 17, 9, seg), [s * 76, -36], faceProj, COL.cheek, hb, LIFT * 0.6);
    }
    // 見つけた: his right eye squeezed shut (∩) while his left stays open; the open mouth
    { const arc = []; for (let k = 0; k <= 10; k++) arc.push(qbez([EYE.x + 16, EYE.y - 2], [EYE.x, EYE.y + 14], [EYE.x - 16, EYE.y - 2], k / 10)); faceInk(arc, 7, COL.navy, bi(B.eyeWinkR), 2); }
    // にこっ: the small smile
    { const arc = []; for (let k = 0; k <= 10; k++) arc.push(qbez([14, -44], [0, -58], [-14, -44], k / 10)); faceInk(arc, 5, COL.navy, bi(B.mouthSmile), 2); }
    // 見つけた's mouth: a D (flat top, round bottom) in 茜 with its 紺 rim
    { const mb = bi(B.mouthOpen), shape = [];
      for (let k = 0; k <= 8; k++) shape.push(qbez([20, -40], [0, -64], [-20, -40], k / 8));
      for (let k = 1; k < 4; k++) shape.push([lerp(-20, 20, k / 4), -40]);
      decal(shape, [0, -47], faceProj, COL.mouth, mb, LIFT);
      faceInk([...shape, shape[0]], 5, COL.navy, mb, 2, false); }
    // おっ: the little round mouth, and the sheet's surprised eyes (white, a 紺 rim, a 紺 pupil) on the same swap
    { const mb = bi(B.mouthO), shape = ellipse2(0, -52, 9, 12, small);
      decal(shape, [0, -52], faceProj, COL.mouth, mb, LIFT);
      faceInk([...shape, shape[0]], 5, COL.navy, mb, 2, false);
      for (const s2 of [1, -1]) {
        const ex = s2 * EYE.x, ey = 162 - 168;
        decal(ellipse2(ex, ey, 23, 27, seg), [ex, ey], faceProj, COL.navy, mb, LIFT);
        decal(ellipse2(ex, ey, 17, 21, seg), [ex, ey], faceProj, COL.white, mb, LIFT + 0.5);
        decal(ellipse2(ex, ey - 2, 10, 10, small), [ex, ey - 2], faceProj, COL.navy, mb, LIFT + 1);
      } }
  }
  M.bias = 0;
  M.part('cowlick');
  // ================================================================== COWLICK
  {
    const cb = bi(B.cowlick), up = cw.n, side0 = [Math.cos(COWLICK.curl), 0, -Math.sin(COWLICK.curl)];
    const es = norm(sub(side0, mul(up, dot(side0, up)))), et = norm(cross(es, up));
    // set into the hair so that its tip is exactly his height (the sheet: the tip at y -12, 576 U over the soles)
    const surf = W(cw.p), tipAt = (dy) => add(add(surf, mul(es, 26 - COWLICK.base[0])), mul(up, COWLICK.base[1] + 12 + dy))[1];
    const dyTip = MEME_U - 0.05 - tipAt(0);
    const toW = (q) => add(add(surf, mul(es, q[0] - COWLICK.base[0])), mul(up, COWLICK.base[1] - q[1] + dyTip));
    const [ns, nr] = Q.cowlick, rings = [];
    for (let j = 0; j <= ns; j++) {
      const t = Math.pow(j / ns, 0.85), L = cbez(...COWLICK.left, t), R = cbez(...COWLICK.right, 1 - t);
      const mid = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2], hw = Math.max(0.2, Math.hypot(R[0] - L[0], R[1] - L[1]) / 2 + 2.5 * (1 - t));
      const across = norm(add(mul(es, R[0] - L[0]), mul(up, -(R[1] - L[1])))), th = COWLICK.thick * Math.pow(1 - t, 0.75) + 0.8;
      const c = j === 0 ? sub(toW(mid), mul(up, 1)) : toW(mid);
      rings.push({ c, across, th, hw: j === ns ? 0.15 : hw });
    }
    grid(nr, ns, (u, v, i, j) => {
      const r = rings[j], a = u * TAU, ca = Math.cos(a), sa = Math.sin(a);
      return { p: add(r.c, add(mul(r.across, ca * r.hw), mul(et, sa * r.th))), n: norm(add(mul(r.across, ca / Math.max(r.hw, 0.5)), mul(et, sa / r.th))) };
    }, { col: COL.navy, w: cb, hw: 0, line: false, wrapU: true, orient: 'out' });
  }
  M.part('band');
  // ================================================================== HACHIMAKI: the band, its wave, the bow, the tails
  {
    const n = Q.band, dth = (BAND.half) / (HEAD.ry + 10);
    const rowsAt = [];
    for (let i = 0; i <= n; i++) {
      const ph = -Math.PI + (i / n) * TAU, th = bandTh(ph);
      const lo = th + dth, hi = th - dth;
      const bi0 = bandAt(lo, ph, BAND.inner), bo = bandAt(lo, ph, BAND.outer), to = bandAt(hi, ph, BAND.outer), ti = bandAt(hi, ph, BAND.inner);
      const down = norm(sub(headAt(lo + 0.05, ph).p, headAt(lo - 0.05, ph).p)), upv = mul(norm(sub(headAt(hi + 0.05, ph).p, headAt(hi - 0.05, ph).p)), -1);
      rowsAt.push({ bi: bi0, bo, to, ti, down, up: upv, n: hairAt(th, ph).n });
    }
    const strip = (pa, pb, na, nb) => {   // a quad strip round the band between two rails
      const A = [], Bv = [];
      for (let i = 0; i <= n; i++) { A.push(M.vert(W(pa(rowsAt[i])), na(rowsAt[i]), COL.red, hb, FINE)); Bv.push(M.vert(W(pb(rowsAt[i])), nb(rowsAt[i]), COL.red, hb, FINE)); }
      for (let i = 0; i < n; i++) {
        const a = A[i], b = Bv[i], c = A[i + 1], d = Bv[i + 1], nn = [M.N[a * 3], M.N[a * 3 + 1], M.N[a * 3 + 2]];
        if (dot(cross(sub(M.pos(c), M.pos(a)), sub(M.pos(b), M.pos(a))), nn) > 0) { M.tri(a, c, b, true); M.tri(c, d, b, true); } else { M.tri(a, b, c, true); M.tri(c, b, d, true); }
      }
    };
    if (Q.bandLow) strip((r) => r.bi.p, (r) => r.bo.p, (r) => r.down, (r) => r.down);   // the lower edge (unseen from the game's camera above)
    strip((r) => r.bo.p, (r) => r.to.p, (r) => r.n, (r) => r.n);         // the face of the band
    strip((r) => r.to.p, (r) => r.ti.p, (r) => r.up, (r) => r.up);       // the upper edge
    // the wave (the sheet's white line of 波): kinari, 12 waves round, along the band's middle
    const wv = [], wn = [], steps = BAND.waves * Q.wave;
    for (let k = 0; k <= steps; k++) {
      const f = Q.wave === 2 ? (k + 0.5) / steps : k / steps, ph = -Math.PI + f * TAU, th = bandTh(ph) + Math.sin(f * TAU * BAND.waves) * (BAND.waveAmp / (HEAD.ry + 10)) - 0.3 / (HEAD.ry + 10);
      const b = bandAt(th, ph, BAND.outer); wv.push(W(b.p)); wn.push(b.n);
    }
    ribbon(wv, wn, BAND.waveW, COL.kinari, hb, false);
    // the bow: the knot and two loops lying on the back of the head
    const kn = hairAt(bandTh(Math.PI), Math.PI).n, kx = [1, 0, 0], ky = norm(cross(kn, kx));   // the knot's frame: x across, y up the head, n out
    ellipsoid(W(knotC), BOW.knot, Q.knot[0], Q.knot[1], { col: COL.red, w: hb, hw: SMALL, line: true }, [kx, ky, kn]);
    for (const s of [1, -1]) {
      const L = BOW.loop, c = add(add(knotC, mul(kx, s * L.reach)), add(mul(ky, L.rise), mul(kn, -2.5)));
      // a teardrop: an ellipsoid along x, pinched toward the knot, its outer end round
      ellipsoid(W(c), [L.len, L.h, L.t], Q.loop[0], Q.loop[1], { col: COL.red, w: hb, hw: SMALL, line: true }, [mul(kx, s), ky, kn], (p, nn) => {
        const f = clamp((p[0] / L.len + 1) / 2, 0, 1), k = lerp(0.5, 1, Math.pow(f, 0.55));
        return { p: [p[0], p[1] * k, p[2] * lerp(0.7, 1, f)], n: [nn[0] * k, nn[1], nn[2]] };
      });
    }
    // the tails: flat ribbons hanging from the knot, each on a chain of TAIL.segs bones (soft joins)
    for (const [n2, s] of [['L', -1], ['R', 1]]) {
      const P = TP[n2], segs = Q.tail * TAIL.segs, sec = [];
      const boneAt = (f) => { const x = f * TAIL.segs, k = Math.min(TAIL.segs - 1, Math.floor(x)), fr = x - k, wts = [[bi(B['tail' + n2 + k]), 1]]; if (k < TAIL.segs - 1 && fr > 0.75) { const t = smooth(0.75, 1.0, fr) * 0.5; wts[0][1] = 1 - t; wts.push([bi(B['tail' + n2 + (k + 1)]), t]); } if (k > 0 && fr < 0.25) { const t = smooth(0.25, 0, fr) * 0.5; wts[0][1] -= t; wts.push([bi(B['tail' + n2 + (k - 1)]), t]); } return wts; };
      for (let q = 0; q <= segs; q++) {
        const f = q / segs, idx = f * (P.length - 1), i0 = Math.floor(idx), i1 = Math.min(P.length - 1, i0 + 1), fr = idx - i0;
        const c = P[i0].map((v, d) => lerp(v, P[i1][d], fr)), t = norm(sub(P[Math.min(P.length - 1, i0 + 1)], P[Math.max(0, i0 - 1)] || P[i0]));
        const out = norm([c[0] / (HEAD.rx + 12) ** 2, c[1] / (HEAD.ry + 12) ** 2, c[2] / (HEAD.rz + 12) ** 2]);
        const side = norm(cross(t, out)), w = lerp(TAIL.w0, TAIL.w1, Math.pow(f, 0.8)) / 2, th = TAIL.th / 2;
        // the end: cut slanting (the outer corner higher, as the sheet cuts it)
        const cut = q === segs ? 4 : 0, so = s * (dot(side, [1, 0, 0]) >= 0 ? 1 : -1);
        sec.push({ c: W(c), t, out, side, w, th, cut, so, wts: boneAt(Math.min(f, 0.999)) });
      }
      // a closed flat slab: 4 corners per section, plus a closed end at the knot and at the cut
      const ringV = sec.map((r) => {
        const pts = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => add(add(r.c, mul(r.side, a * r.w)), add(mul(r.out, b * r.th), mul(r.t, -a * r.so * r.cut))));
        const nrm = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => norm(add(mul(r.side, a * 0.6), mul(r.out, b))));
        return pts.map((p, k) => M.vert(p, nrm[k], COL.red, r.wts, SMALL));
      });
      for (let q = 0; q < ringV.length - 1; q++) for (let k = 0; k < 4; k++) {
        const a = ringV[q][k], b = ringV[q][(k + 1) % 4], c = ringV[q + 1][k], d = ringV[q + 1][(k + 1) % 4];
        const nn = [M.N[a * 3] + M.N[b * 3], M.N[a * 3 + 1] + M.N[b * 3 + 1], M.N[a * 3 + 2] + M.N[b * 3 + 2]];
        if (dot(cross(sub(M.pos(b), M.pos(a)), sub(M.pos(c), M.pos(a))), nn) > 0) { M.tri(a, b, c, true); M.tri(b, d, c, true); } else { M.tri(a, c, b, true); M.tri(b, c, d, true); }
      }
      for (const q of [0, ringV.length - 1]) {
        const r = ringV[q], nn = q === 0 ? mul(sec[0].t, -1) : sec[q].t;
        if (dot(cross(sub(M.pos(r[1]), M.pos(r[0])), sub(M.pos(r[2]), M.pos(r[0]))), nn) > 0) { M.tri(r[0], r[1], r[2], true); M.tri(r[0], r[2], r[3], true); } else { M.tri(r[0], r[2], r[1], true); M.tri(r[0], r[3], r[2], true); }
      }
    }
  }
  M.part('body');
  // ================================================================== TORSO (the jacket), NECK, HOOD, ZIP, POCKETS
  const torsoAt = (y) => {
    if (y <= TORSO[0][0]) return TORSO[0].slice(1);
    for (let i = 1; i < TORSO.length; i++) if (y <= TORSO[i][0]) { const t = (y - TORSO[i - 1][0]) / (TORSO[i][0] - TORSO[i - 1][0]); return [1, 2, 3].map((k) => lerp(TORSO[i - 1][k], TORSO[i][k], t)); }
    return TORSO[TORSO.length - 1].slice(1);
  };
  /** the jacket's surface at (x, y) on its front (side -1) or back (+1): z and the outward normal */
  const torsoZ = (x, y, side) => {
    const [a, b, zc] = torsoAt(y), e = Math.min(0.999, Math.abs(x / a) ** TORSO_N), z = zc + side * b * Math.pow(1 - e, 1 / TORSO_N);
    const gx = Math.sign(x) * Math.abs(x / a) ** (TORSO_N - 1) / a, gz = side * Math.abs((z - zc) / b) ** (TORSO_N - 1) / b;
    return { z, n: norm([gx, 0, gz]) };
  };
  {
    const ys = TORSO.map((r) => r[0]), rows = Q.torso >= 16 ? ys : ys.filter((y, i) => i !== 3 && i !== 7);
    grid(Q.torso, rows.length - 1, (u, v, i, j) => {
      const [a, b, zc] = torsoAt(rows[j]), q = sel(u * TAU, a, b, TORSO_N);
      return { p: [q.x, rows[j], zc + q.z] };
    }, { col: COL.teal, w: sp, hw: OUT, line: true, wrapU: true, orient: 'out' });
    // the caps (top under the neck and hood, bottom inside the shorts): fans
    for (const [y, dn] of [[TORSO[0][0], -1], [TORSO[TORSO.length - 1][0], 1]]) {
      const [a, b, zc] = torsoAt(y), c = M.vert([0, y + dn * 2, zc], [0, dn, 0], COL.teal, sp, OUT), ring = [];
      for (let i = 0; i < Q.torso; i++) { const q = sel((i / Q.torso) * TAU, a, b, TORSO_N); ring.push(M.vert([q.x, y, zc + q.z], norm([q.nx, dn, q.nz]), COL.teal, sp, OUT)); }
      for (let i = 0; i < Q.torso; i++) { const j = (i + 1) % Q.torso; if (dn > 0) M.tri(c, ring[j], ring[i], true); else M.tri(c, ring[i], ring[j], true); }
    }
    // the neck (mostly under the hood and the chin)
    M.bias = MEME_TONE.bias.neck;
    grid(Q.limb, 1, (u, v) => { const a = u * TAU; return { p: [Math.sin(a) * NECK.r, lerp(NECK.y0, NECK.y1, v), -Math.cos(a) * NECK.r - 4], n: [Math.sin(a), 0, -Math.cos(a)], w: v < 0.5 ? sp : hb }; },
      { col: COL.skin, hw: OUT, line: true, wrapU: true, orient: 'out' });
    M.bias = 0;
    // the hood folded round the neck: a roll along a loop, its section an ellipse (thin in front, a fat fold behind)
    const [hn, hs] = Q.hood, path = [], rad = [];
    for (let i = 0; i < hn; i++) {
      const a = (i / hn) * TAU, ad = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))), front = Math.max(0, Math.cos(a)) ** 2, back = smooth(70 * DEG, 165 * DEG, ad);
      path.push([HOOD.a * Math.sin(a), lerp(HOOD.yF, HOOD.yB, smooth(90 * DEG, 180 * DEG, ad)), HOOD.z - HOOD.b * Math.cos(a)]);
      rad.push([HOOD.tSide + (HOOD.tF - HOOD.tSide) * front + (HOOD.tB - HOOD.tSide) * back, HOOD.hSide + (HOOD.hF - HOOD.hSide) * front + (HOOD.hB - HOOD.hSide) * back]);
    }
    {
      const n = path.length, rows2 = [];
      for (let i = 0; i < n; i++) {
        const p = path[i], t = norm(sub(path[(i + 1) % n], path[(i - 1 + n) % n])), outw = norm([p[0], 0, p[2] - HOOD.z]), upv = norm(cross(outw, t));
        rows2.push({ p, a: outw, b: dot(upv, [0, 1, 0]) >= 0 ? upv : mul(upv, -1), r: rad[i] });
      }
      rows2.push(rows2[0]);
      grid(hs, n, (u, v, i, j) => {
        const r = rows2[j], ang = u * TAU, ca = Math.cos(ang), sa = Math.sin(ang), ra = r.r[0], rb = r.r[1];
        const off = lerp(0.55, 1, smooth(-0.35, 0.35, ca));   // the inner side of the roll tucked against the neck
        return { p: add(r.p, add(mul(r.a, ca * ra * off), mul(r.b, sa * rb))), n: norm(add(mul(r.a, ca / ra), mul(r.b, sa / rb))) };
      }, { col: COL.kinari, w: sp, hw: OUT, line: true, wrapU: true, orient: 'out' });
    }
    // the zip (山吹, no line) and the two pocket lines (紺)
    { const P = [], N = []; for (let k = 0; k <= 10; k++) { const y = lerp(ZIP.y0, ZIP.y1, k / 10), f = torsoZ(0, y, -1); P.push([0, y, f.z]); N.push(f.n); } ribbon(P, N, ZIP.w, COL.yellow, sp); }
    for (const s of [1, -1]) { const P = [], N = []; for (let k = 0; k <= 4; k++) { const x = s * lerp(POCKET.x0, POCKET.x1, k / 4), f = torsoZ(x, POCKET.y, -1); P.push([x, POCKET.y, f.z]); N.push(f.n); } ribbon(P, N, POCKET.w, COL.navy, sp); }
  }
  M.part('arms');
  // ================================================================== ARMS: the sleeve, the cuff (two ink rims), the hand
  for (const s of [1, -1]) {
    const n = s > 0 ? 'R' : 'L', ab = bi(B['arm' + n]), fb = bi(B['fore' + n]);
    const x = s * SHOULDER.x, top = SHOULDER.y + ARM.top, elbow = SHOULDER.y - ARM.upper, c0 = SHOULDER.y - ARM.sleeve, c1 = c0 - ARM.cuff;
    const wAt = (y) => { const w = smooth(elbow + 9, elbow - 9, y); return [[ab, 1 - w], [fb, w]]; };
    const T = COL.teal, Kn = COL.kinari, rows = [
      { y: top + 15, r: 0, col: T, n: [0, 1], w: ab }, { y: top + 11, r: 12.5, col: T, n: [0.55, 0.85], w: ab }, { y: top + 2, r: ARM.r0, col: T, n: [1, 0.2], w: ab },
    ];
    const mids = Q.arm > 1 ? [elbow + 14, elbow, elbow - 14] : [elbow];
    for (const y of mids) rows.push({ y, r: lerp(ARM.r0, ARM.r1, (top - y) / (top - c0)), col: T, n: [1, 0], w: wAt(y) });
    rows.push({ y: c0, r: ARM.r1, col: T, n: [1, 0], w: fb }, { y: c0, r: ARM.r1, col: Kn, n: [0, 1], w: fb }, { y: c0, r: ARM.cuffR, col: Kn, n: [0, 1], w: fb },
      { y: c0, r: ARM.cuffR, col: Kn, n: [1, 0], w: fb }, { y: c1, r: ARM.cuffR - 0.5, col: Kn, n: [1, 0], w: fb }, { y: c1, r: ARM.cuffR - 0.5, col: Kn, n: [0, -1], w: fb },
      { y: c1 - 0.5, r: 11, col: Kn, n: [0, -1], w: fb });
    lathe(x, SHOULDER.z, rows, Q.limb, { hw: OUT, line: true });
    // the cuff's edges are drawn lines on the sheet: ink round its top and bottom
    for (const [y, r] of Q.fineInk ? [[c0 - 1.2, ARM.cuffR + 0.15], [c1 + 1.2, ARM.cuffR - 0.35]] : [[c0 - 1.2, ARM.cuffR + 0.15]]) {
      const P = [], N = []; for (let k = 0; k <= Q.ring; k++) { const a = (k / Q.ring) * TAU; P.push([x + Math.sin(a) * r, y, SHOULDER.z - Math.cos(a) * r]); N.push([Math.sin(a), 0, -Math.cos(a)]); }
      ribbon(P, N, 3.2, COL.navy, fb, false);
    }
    // the hand, its top in the cuff (the sheet: the hand's top meets the cuff's lower edge)
    M.bias = MEME_TONE.bias.hands;
    ellipsoid([x, SHOULDER.y - ARM.hand, SHOULDER.z], [ARM.handR, ARM.handR * 1.02, ARM.handR], Q.hand[0], Q.hand[1], { col: COL.skin, w: fb, hw: OUT, line: true });
    M.bias = 0;
  }
  M.part('shorts');
  // ================================================================== SHORTS: the seat and two wide legs (the inverted V between them)
  {
    const R = SHORTS.rows;
    grid(Q.shorts, R.length - 1, (u, v, i, j) => { const q = sel(u * TAU, R[j][1], R[j][2], SHORTS.n); return { p: [q.x, R[j][0], q.z] }; },
      { col: COL.navy, w: pv, hw: 0, line: false, wrapU: true, orient: 'out' });
    { const y = R[R.length - 1][0], c = M.vert([0, y - 1.5, 0], [0, -1, 0], COL.navy, pv, 0), ring = [];
      for (let i = 0; i < Q.shorts; i++) { const q = sel((i / Q.shorts) * TAU, R[R.length - 1][1], R[R.length - 1][2], SHORTS.n); ring.push(M.vert([q.x, y, q.z], norm([q.nx, -0.6, q.nz]), COL.navy, pv, 0)); }
      for (let i = 0; i < Q.shorts; i++) M.tri(c, ring[i], ring[(i + 1) % Q.shorts], false); }
    for (const s of [1, -1]) {
      const n = s > 0 ? 'R' : 'L', lb = bi(B['leg' + n]);
      grid(Q.legHole, 2, (u, v) => {
        const y = lerp(SHORTS.legTop, SHORTS.hem, v), q = sel(u * TAU, SHORTS.legA - v * 1.5, SHORTS.legB - v * 1.5, SHORTS.n);
        return { p: [s * SHORTS.legX + q.x, y, q.z], n: norm([q.nx, -0.05, q.nz]), w: v < 0.3 ? [[pv, 1 - v], [lb, v]] : [[pv, 0.35 - v * 0.35], [lb, 0.65 + v * 0.35]] };
      }, { col: COL.navy, hw: 0, line: false, wrapU: true, orient: 'out' });
    }
  }
  M.part('legs');
  // ================================================================== LEGS and BOOTS (the kinari band, the sole's line)
  const bootC = (s) => add([s * HIP.x, 0, 0], BOOT.c);
  for (const s of [1, -1]) {
    const n = s > 0 ? 'R' : 'L', lb = bi(B['leg' + n]), shb = bi(B['shin' + n]), fb = bi(B['foot' + n]);
    const x = s * HIP.x, knee = HIP.y - LEG.thigh;
    const ys = Q.legRings > 2 ? [LEG.top, knee + 12, knee, knee - 12, LEG.bottom] : [LEG.top, knee + 6, knee - 6, LEG.bottom];
    lathe(x, HIP.z, ys.map((y) => { const w = smooth(knee + 12, knee - 12, y); return { y, r: LEG.r, n: [1, 0], w: y <= LEG.bottom + 1e-6 ? fb : [[lb, 1 - w], [shb, w]] }; }), Q.leg, { col: COL.skin, hw: OUT, line: true });
    const c = bootC(s);
    roundBox(c, BOOT.half, BOOT.r, Q.box, { col: COL.yellow, w: fb, hw: OUT, line: true, split: [{ axis: 1, at: BOOT.band - c[1], below: 'yellow', above: 'kinari' }] });
    // the band's lower edge and the sole's line: ink round the boot
    const rr = rrect(BOOT.half[0], BOOT.half[2], BOOT.r, Q.rr);
    for (const [y, w] of Q.fineInk ? [[BOOT.band, 3.5], [BOOT.sole, 5]] : [[BOOT.sole, 5]]) {
      ribbon(rr.P.map(([x, z]) => [c[0] + x, y, c[2] + z]), rr.N.map(([x, z]) => [x, 0, z]), w, COL.navy, fb, false);
    }
  }
  M.part('pack');
  // ================================================================== BACKPACK: the flap, its edge, the buckle, the straps
  {
    const pb = bi(B.pack), c = PACK.c, fy = c[1] + PACK.half[1] - PACK.flap;
    roundBox(c, PACK.half, PACK.r, Q.box, { col: COL.yellow, w: pb, hw: OUT, line: true, split: [{ axis: 1, at: fy - c[1], below: 'yellow', above: 'flap' }] });
    // the flap's edge: ink round the sides and the back (from his right side's front end round to his left's)
    const hz = PACK.half[2], rr = rrect(PACK.half[0], hz, PACK.r, Q.rr), segs = Q.rr + 1;
    const from = 1 + segs - 1, to = rr.P.length - 1 - segs;   // the end of the front-right arc .. the start of the front-left arc
    const sl = (A) => A.slice(from, to + 1);
    ribbon(sl(rr.P).map(([x, z]) => [c[0] + x, fy, c[2] + z]), sl(rr.N).map(([x, z]) => [x, 0, z]), 4.5, COL.navy, pb, true);
    // the buckle: a kinari tab on the flap's edge, its rim in ink
    const bz = c[2] + hz + 0.2, proj = (x, y) => ({ p: [x, y, bz], n: [0, 0, 1] }), tab = [];
    const [bx, by] = PACK.buckle;
    for (let k = 0; k < Q.buckle; k++) { const a = (k / Q.buckle) * TAU + Math.PI / Q.buckle, ca = Math.cos(a), sa = Math.sin(a); tab.push([Math.sign(ca) * Math.abs(ca) ** 0.45 * bx, fy + Math.sign(sa) * Math.abs(sa) ** 0.45 * by]); }
    decal(tab, [0, fy], proj, COL.kinari, pb, 1.2);
    const rim = tab.map(([x, y]) => [x, y, bz + 1.4]); rim.push(rim[0]);
    ribbon(rim, rim.map(() => [0, 0, 1]), 3, COL.navy, pb, false);
    // the shoulder straps: from the pack's top up over the shoulders, under the hood (紺, no line)
    for (const s of [1, -1]) {
      // up the back of the shoulder and under the folded hood: never over the shoulder's top (the sheet's front shows none)
      const path = [[s * PACK.strapX, c[1] + PACK.half[1] - 8, c[2] - PACK.half[2] + 2], [s * (PACK.strapX - 1), 276, 54], [s * (PACK.strapX - 4), 288, 42]];
      const rp = resample(path, Q.straps);
      if (Q.flatStrap) ribbon(rp, rp.map((p, i) => norm(sub(p, [s * 20, p[1] - 60, i < 2 ? 40 : 0]))), 11, COL.navy, sp, false);
      else tube(rp, rp.map(() => [5.5, 3]), 4, { col: COL.navy, hw: 0, line: false, w: sp, up: [0, 1, 0] });
    }
  }
  M.part('camera');
  // ================================================================== CAMERA on its strap (the strap 紺, no line)
  {
    const cb = bi(B.cam), c = CAM.c, [hx, hy, hz] = CAM.half;
    roundBox(c, CAM.half, CAM.r, Q.camBox, { col: COL.kinari, w: cb, hw: SMALL, line: true });
    const fz = c[2] - hz;
    // the lens: a 紺 barrel, its glass 浅葱 with a glint
    // (紺 like the line: no line of its own; on the phone a flat disc, it is 3 px there)
    const lz = Q.lens ? fz - CAM.lensL - 1.6 : fz - 0.4;
    if (Q.lens) {
      const rows = [{ y: 0, r: CAM.lens, n: [1, 0] }, { y: CAM.lensL + 2, r: CAM.lens, n: [1, 0] }, { y: CAM.lensL + 2, r: CAM.lens, n: [0, 1] }, { y: CAM.lensL + 2, r: 0, n: [0, 1] }];
      // a lathe along -Z: build it upright, then lay it on the camera's face
      const first = M.nv; lathe(0, 0, rows.map((r) => ({ ...r, y: r.y })), Q.lens, { col: COL.navy, w: cb, hw: 0, line: false });
      for (let v = first; v < M.nv; v++) {
        const px = M.P[v * 3] / K, py = M.P[v * 3 + 1] / K, pz = M.P[v * 3 + 2] / K, nx = M.N[v * 3], ny = M.N[v * 3 + 1], nz = M.N[v * 3 + 2];
        // (x, y, z) upright -> (x, z, -y) laid forward, about the lens's foot on the face
        M.P[v * 3] = (c[0] + px) * K; M.P[v * 3 + 1] = (c[1] - pz) * K; M.P[v * 3 + 2] = (fz + 2 - py) * K;
        M.N[v * 3] = nx; M.N[v * 3 + 1] = -nz; M.N[v * 3 + 2] = -ny;
      }
    } else decal(ellipse2(c[0], c[1], CAM.lens, CAM.lens, Q.small + 3), [c[0], c[1]], (x, y) => ({ p: [x, y, fz], n: [0, 0, -1] }), COL.navy, cb, 0.3);
    const lens = (x, y) => ({ p: [x, y, lz], n: [0, 0, -1] });
    decal(ellipse2(c[0], c[1], CAM.inner, CAM.inner, Q.small), [c[0], c[1]], lens, COL.teal, cb, 0.35);
    decal(ellipse2(c[0] + 3, c[1] + 3, 2.5, 2.5, 6), [c[0] + 3, c[1] + 3], lens, COL.white, cb, 0.7);
    // the flash: a little 山吹 window, top corner
    const [[x0, y0], [x1, y1]] = CAM.flash, face = (x, y) => ({ p: [x, y, fz], n: [0, 0, -1] });
    decal([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [(x0 + x1) / 2, (y0 + y1) / 2], face, COL.yellow, cb, 0.8);
    // the strap: from the camera's top corners over his right shoulder and round his back (hidden under the pack)
    const OFF = 2.8;   // the strap's middle off the jacket (its half-thickness 1.6 + a hair)
    const F = (x, y) => { const f = torsoZ(x, y, -1); return { p: add([x, y, f.z], mul(f.n, OFF)), n: f.n }; };
    const Bk = (x, y) => { const f = torsoZ(x, y, 1); return { p: add([x, y, f.z], mul(f.n, OFF)), n: f.n }; };
    const Ar = (y, a) => { const [ta, tb, zc] = torsoAt(y), q = sel(a, ta + OFF, tb + OFF, TORSO_N); return { p: [q.x, y, zc + q.z], n: [q.nx, 0, q.nz] }; };
    const front = [{ p: [c[0] + hx - 5, c[1] + hy + 1.5, c[2] - 1], n: [0, 1, 0] }, F(-30, 217), F(-6, 231), F(22, 247), F(48, 261), F(64, 271), { p: [74, 283, -38], n: norm([0.3, 0.75, -0.6]) },
      { p: [79, 295, -16], n: norm([0.25, 1, -0.15]) }, { p: [79, 296, 12], n: norm([0.25, 1, 0.15]) }, { p: [74, 285, 38], n: norm([0.3, 0.75, 0.6]) }, Bk(62, 268), Bk(42, 252)];
    const back = [Bk(-54, 193), Bk(-70, 184), Ar(181, -2.35), Ar(182, -1.75), Ar(185, -1.2), { p: [c[0] - hx + 5, c[1] + hy + 1.5, c[2] + 1], n: [0, 1, 0] }];
    for (const part of [front, back]) {
      const pts = part.map((q) => q.p), path = resample(pts, Q.strap);
      const nrm = path.map((p) => { let best = part[0], bd = Infinity; for (const q of part) { const d = len(sub(q.p, p)); if (d < bd) { bd = d; best = q; } } return best.n; });
      // a flat strap: 4 corners round a frame of (tangent, surface normal)
      const rows = path.map((p, i) => { const t = norm(sub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)])), nn = norm(sub(nrm[i], mul(t, dot(nrm[i], t)))), sd = norm(cross(t, nn)); return { p, nn, sd }; });
      if (Q.flatStrap) { ribbon(rows.map((r) => sub(r.p, mul(r.nn, LIFT))), rows.map((r) => r.nn), 10, COL.navy, sp, false); continue; }
      const V = rows.map((r) => [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => M.vert(add(r.p, add(mul(r.sd, a * 5), mul(r.nn, b * 1.6))), norm(add(mul(r.sd, a * 0.5), mul(r.nn, b))), COL.navy, sp, 0)));
      for (let q = 0; q < V.length - 1; q++) for (let k = 0; k < 4; k++) {
        const a = V[q][k], b = V[q][(k + 1) % 4], cc = V[q + 1][k], d = V[q + 1][(k + 1) % 4], nn = [M.N[a * 3] + M.N[b * 3], M.N[a * 3 + 1] + M.N[b * 3 + 1], M.N[a * 3 + 2] + M.N[b * 3 + 2]];
        if (dot(cross(sub(M.pos(b), M.pos(a)), sub(M.pos(cc), M.pos(a))), nn) > 0) { M.tri(a, b, cc, false); M.tri(b, d, cc, false); } else { M.tri(a, cc, b, false); M.tri(b, cc, d, false); }
      }
    }
  }
  M.part('charm');
  // ================================================================== THE FLOAT CHARM (浮き球): the string, the glass, its net, a glint
  {
    const chb = bi(B.charm), a = CHARM.at, fc = [a[0], a[1] - CHARM.string - CHARM.r, a[2]];
    tube([a, [a[0], a[1] - CHARM.string - 1, a[2]]], [1.7, 1.7], 4, { col: COL.navy, hw: 0, line: false, w: chb, up: [0, 0, 1] });
    ellipsoid(fc, [CHARM.r, CHARM.r, CHARM.r], Q.float[0], Q.float[1], { col: COL.float, w: chb, hw: FINE, line: true });
    const ring = (fn) => { const P = [], N = []; for (let k = 0; k <= 24; k++) { const d = fn((k / 24) * TAU); P.push(add(fc, mul(d, CHARM.r + 0.1))); N.push(d); } ribbon(P, N, 2.6, COL.navy, chb, false); };
    for (const lat of Q.net > 1 ? [-0.38, 0.38] : [0]) ring((t) => { const c2 = Math.cos(Math.asin(lat)); return [Math.cos(t) * c2, lat, Math.sin(t) * c2]; });
    for (const lon of Q.net > 1 ? [-0.5, 0.5] : [0.25]) ring((t) => [Math.sin(t) * Math.sin(lon), Math.cos(t), Math.sin(t) * Math.cos(lon)]);
    const g = norm([-0.45, 0.5, 0.75]), gt = norm(cross([0, 1, 0], g)), gb = cross(g, gt);
    const proj = (x, y) => ({ p: add(fc, mul(norm(add(g, add(mul(gt, x / CHARM.r), mul(gb, y / CHARM.r)))), CHARM.r)), n: g });
    decal(ellipse2(0, 0, 3.6, 3.6, 8), [0, 0], proj, COL.white, chb, 0.9);
  }
  M.part('end');

  // ------------------------------------------------------------------ meshes
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(M.P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(M.N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(M.C, 3));
  g.setAttribute('memeShade', new THREE.Float32BufferAttribute(M.S, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(M.SI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(M.SW, 4));
  g.setAttribute('hullW', new THREE.Float32BufferAttribute(M.HW, 1));
  g.setAttribute('hullN', new THREE.Float32BufferAttribute(hullDirections(M), 3));
  g.setAttribute('memeBias', new THREE.Float32BufferAttribute(M.BI, 1));
  const Idx = (a) => (M.nv > 65535 ? new THREE.Uint32BufferAttribute(a, 1) : new THREE.Uint16BufferAttribute(a, 1));
  g.setIndex(Idx(M.I));
  const gl = new THREE.BufferGeometry();   // the line pass shares every buffer; only the outlined triangles
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight', 'hullW', 'hullN']) gl.setAttribute(k, g.attributes[k]);
  gl.setIndex(Idx(M.IL));
  const sphere = new THREE.Sphere(new THREE.Vector3(0, 0.62, 0.04), 1.0);   // every pose fits (arms up, tails streaming, the charm swinging)
  const box = new THREE.Box3(new THREE.Vector3(-0.8, -0.3, -0.8), new THREE.Vector3(0.8, 1.6, 0.9));
  g.boundingSphere = sphere.clone(); gl.boundingSphere = sphere.clone(); g.boundingBox = box.clone(); gl.boundingBox = box.clone();

  const body = makeBodyMaterial(THREE), line = makeLineMaterial(THREE);
  const root = new THREE.Group(); root.name = 'meme';
  root.add(B.root);
  const mesh = new THREE.SkinnedMesh(g, body); mesh.name = 'meme-body';
  const hull = new THREE.SkinnedMesh(gl, line); hull.name = 'meme-line';
  root.add(mesh); root.add(hull);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton, mesh.matrixWorld); hull.bind(skeleton, hull.matrixWorld);
  // he casts his shadow on the town and takes none (two flat tones: no soft blot of his own head on his chest)
  mesh.castShadow = true; mesh.receiveShadow = false; hull.castShadow = false; hull.receiveShadow = false;
  hull.layers.set(1);   // LAYER_NO_OUTLINE (core/materials.js): the world's edge pre-pass renders layer 0 only
  for (const o of [root, mesh, hull]) { o.userData.dynamic = true; o.userData.noBatch = true; }
  // fixed, generous bounds in mesh space: a SkinnedMesh would otherwise measure its first pose once and cull a swinging arm
  for (const o of [mesh, hull]) { o.boundingSphere = sphere.clone(); o.boundingBox = box.clone(); }

  const parts = {};
  for (let i = 0; i < M.parts.length - 1; i++) parts[M.parts[i][0]] = [M.parts[i + 1][1] - M.parts[i][1], M.parts[i + 1][2] - M.parts[i][2]];
  const stats = { quality: qname, triangles: M.I.length / 3, lineTriangles: M.IL.length / 3, drawn: (M.I.length + M.IL.length) / 3, vertices: M.nv, bones: bones.length, drawCalls: 2, parts };

  // ------------------------------------------------------------------ animation
  const rig = { bind, TP, knotC, cwO, tailN: TAIL.segs };
  const anim = createAnimator(THREE, B, K, rig, { blink: opts.blink !== false, calm: !!opts.calm });
  let forced = null;
  const live = { speed: 0, onGround: true, vy: 0, cadence: undefined, run: undefined };   // reused every frame (no garbage)
  /** Force a pose ('idle' | 'walk' | 'run' | 'jump' | 'fall'); 'auto' or null hands it back to update()'s inputs. Unknown names are ignored (false). */
  function setPose(name) {
    if (name == null || name === 'auto') { forced = null; return true; }
    if (!MEME_POSES.includes(name)) return false;
    forced = name; return true;
  }
  /** Advance by dt seconds (0..0.1, clamped) and pose: speed (m/s along the ground) blends idle -> walk -> run; off the
   *  ground, vy (m/s, + up) picks jump or fall. Optional: cadence (cycles/s; a cycle is two steps; the walker locks it to
   *  the ground speed with gait()) and run (0 walk .. 1 run). Returns the pose. Never throws on odd inputs. */
  function update(dt, inp) {
    const i = inp || {};
    const speed = Math.max(0, fin(i.speed)), vy = fin(i.vy), cadence = Number.isFinite(i.cadence) ? i.cadence : undefined, run = Number.isFinite(i.run) ? i.run : undefined;
    let x;
    if (forced) x = forcedInputs(forced, speed > 0.05 ? speed : undefined, cadence);
    else { live.speed = speed; live.onGround = i.onGround !== false; live.vy = vy; live.cadence = cadence; live.run = run; x = live; }
    anim.step(clamp(fin(dt), 0, 0.1), x, root);
    return anim.state.pose;
  }
  /** Pose deterministically at time t of a named pose (tests, the review renders). */
  function poseAt(name, t, { speed } = {}) {
    anim.reset();
    const inp = forcedInputs(MEME_POSES.includes(name) ? name : 'idle', speed), dt = 1 / 60;
    anim.step(0, inp, null);
    anim.settle();
    for (let s = 0; s < t - 1e-9; s += dt) anim.step(dt, inp, null);
    anim.step(0, inp, null);
    return anim.state;
  }
  function dispose() {
    root.removeFromParent();
    g.dispose(); gl.dispose(); body.dispose(); line.dispose(); skeleton.dispose();
  }
  anim.step(0, { speed: 0, onGround: true, vy: 0 }, null);
  anim.settle();
  return {
    root, mesh, hull, bones: B, skeleton, stats, materials: { body, line }, colors: MEME_COLORS, height: MEME_HEIGHT,
    setPose, update, poseAt, dispose,
    get pose() { return anim.state.pose; },
    /** The cycle rate in use (cycles/s; a cycle is two steps). */
    get cadence() { return anim.state.cadence || 0; },
    /** His stride at a speed (memeGait): { travel, stance, run, hz, rate }; no slide at cadence = speed x stance / travel. */
    gait: (speed, run) => memeGait(speed, run),
    /** 0..1 (night): he gives off a little of his own colour, so a dark town never turns him to a silhouette. */
    setLift(v) { body.userData.uLift.value = clamp(fin(v), 0, 1) * MEME_TONE.lift; },
    /** Reduced motion (prefers-reduced-motion): the springs settle, the breeze stops, no look-around, a smaller bob. */
    setCalm(v) { anim.opts.calm = !!v; },
    /** Close his eyes for sec seconds (the sheet's ほっ). */
    blink: (sec) => anim.blink(sec),
    /** Hold one of the sheet's faces ('smile' | 'blink' | 'wink' | 'o'), or null to let the poses choose (the jump's 見つけた,
     *  the fall's おっ, the blinks). */
    setExpression(name) { anim.expression(name); anim.step(0, forced ? forcedInputs(forced) : live, null); },
    /** The secondary motion's particles (tests and the viewer read them). */
    get springs() { return anim.springs; },
  };
}

const FORCED = {
  idle: { speed: 0, onGround: true, vy: 0, forced: 'idle', base: 0 },
  walk: { speed: MEME_SPEED.walk, onGround: true, vy: 0, forced: 'walk', base: MEME_SPEED.walk },
  run: { speed: MEME_SPEED.run, onGround: true, vy: 0, forced: 'run', base: MEME_SPEED.run, run: 1 },
  jump: { speed: 0, onGround: false, vy: 3, forced: 'jump', base: 0 },
  fall: { speed: 0, onGround: false, vy: -3, forced: 'fall', base: 0 },
};
/** The inputs that show a named pose (speed: the caller's, when it gives one). Reused objects: no garbage. */
function forcedInputs(name, speed, cadence) {
  const f = FORCED[name] || FORCED.idle;
  f.speed = name === 'walk' || name === 'run' ? speed ?? f.base : speed ?? 0;
  f.cadence = cadence;
  if (name !== 'run') f.run = name === 'walk' ? 0 : undefined;
  return f;
}

// ------------------------------------------------------------------ the gait (shared by the animator and the walker)
const reachEff = (G) => G.reach + HIP.x * Math.sin(G.hipYaw * DEG);
const strideOf = (v, full) => clamp(Math.pow(Math.max(0, v) / full, MEME_GAIT.strideExp), 0, 1);
/** The run blend for a speed, or the caller's explicit run (0..1). */
const runOf = (v, run) => (Number.isFinite(run) ? clamp(run, 0, 1) : smooth(MEME_GAIT.runFrom, MEME_GAIT.runTo, v));
/** Half the planted boot's sweep (U) at speed v and run blend r. */
const sweepOf = (v, r) => lerp(reachEff(MEME_GAIT.walk) * strideOf(v, MEME_GAIT.strideWalk), reachEff(MEME_GAIT.run) * strideOf(v, MEME_GAIT.strideRun), r);
/**
 * His stride at a speed, for the caller that drives the cycle (the walker): { travel, stance, run, hz, rate }.
 * travel: metres the planted boot sweeps back in one stance (= how far the body goes per stance with no slide);
 * stance: the stance's share of a cycle; run: the run blend; hz: the no-slide cycle rate (cycles/s, a cycle is two
 * steps); rate: hz capped at the pose's readable ceiling (MEME_GAIT maxHz). Pass run (0..1) to choose walk or run.
 */
export function memeGait(speed, run) {
  const v = Math.max(0, fin(speed)), r = runOf(v, run);
  const travel = 2 * sweepOf(v, r) * MEME_SCALE, stance = lerp(MEME_GAIT.walk.stance, MEME_GAIT.run.stance, r);
  const hz = travel > 1e-6 && v > 0.03 ? (v * stance) / travel : 0;
  return { travel, stance, run: r, hz, rate: Math.min(lerp(MEME_GAIT.walk.maxHz, MEME_GAIT.run.maxHz, r), hz) };
}

/** Per vertex, the direction the line pushes it: the mitred mean of the normals of every vertex at the same place on the
 *  same bone (d . n = 1 for each, capped), so a split edge still gets a closed line of the full width. */
function hullDirections(M) {
  const groups = new Map(), out = new Float32Array(M.nv * 3);
  for (let i = 0; i < M.nv; i++) {
    const key = `${Math.round(M.P[i * 3] / 2e-4)},${Math.round(M.P[i * 3 + 1] / 2e-4)},${Math.round(M.P[i * 3 + 2] / 2e-4)},${M.SI[i * 4]}`;
    let gr = groups.get(key); if (!gr) groups.set(key, (gr = []));
    gr.push(i);
  }
  for (const gr of groups.values()) {
    const ns = [];
    for (const i of gr) { const n = [M.N[i * 3], M.N[i * 3 + 1], M.N[i * 3 + 2]]; if (!ns.some((m) => dot(m, n) > 0.999)) ns.push(n); }
    let a = [0, 0, 0];
    for (const n of ns) a = add(a, n);
    a = mul(a, 1 / ns.length);
    const l2 = dot(a, a), d = l2 > 1e-6 ? mul(a, Math.min(1 / l2, 2.2)) : ns[0];
    for (const i of gr) { out[i * 3] = d[0]; out[i * 3 + 1] = d[1]; out[i * 3 + 2] = d[2]; }
  }
  return out;
}

// ------------------------------------------------------------------ materials
function makeBodyMaterial(THREE) {
  // a flat ramp: every light reaches both tones in full; the tone is chosen per fragment from the sun's direction
  const ramp = new THREE.DataTexture(new Uint8Array([255, 255]), 2, 1, THREE.RedFormat);
  ramp.minFilter = THREE.NearestFilter; ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
  // two-sided with the outward normal kept (the shorts' open legs show their inside in the jacket's own light)
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: ramp, side: THREE.DoubleSide });
  m.name = 'meme-body';
  const uLift = { value: 0 };
  const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLift = uLift;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 memeShade;\nattribute float memeBias;\nvarying vec3 vMemeShade;\nvarying float vMemeBias;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vMemeShade = memeShade;\n  vMemeBias = memeBias;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLift;\nvarying vec3 vMemeShade;\nvarying float vMemeBias;\nvec3 memeHue(vec3 c) { return mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, ' + f(MEME_TONE.hue) + '); }')
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(/normal \*= faceDirection;/g, '').replace(/nonPerturbedNormal \*= faceDirection;/g, ''))
      // the two tones: the sheet's shade colour where the sun does not reach (n.l < at), the lit colour where it does
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  float memeLit = 1.0;
  #if NUM_DIR_LIGHTS > 0
    memeLit = step( ${f(MEME_TONE.at)}, dot( normal, directionalLights[ 0 ].direction ) + vMemeBias );
  #endif
  diffuseColor.rgb = mix( vMemeShade * diffuse, diffuseColor.rgb, memeLit );`)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin
        .replace('getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal )', 'memeHue( getHemisphereLightIrradiance( hemisphereLights[ i ], vec3( 0.0 ) ) )')
        .replace('getAmbientLightIrradiance( ambientLightColor )', 'memeHue( getAmbientLightIrradiance( ambientLightColor ) )')
        .replace(/(get(?:Point|Spot|Directional|Sun)LightInfo\( [^;]*\);)/g, '$1\n\t\tdirectLight.color = memeHue( directLight.color );'))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uLift;');
  };
  m.customProgramCacheKey = () => 'meme-body-2';
  m.userData.uLift = uLift;
  const d0 = m.dispose.bind(m);
  m.dispose = () => { ramp.dispose(); d0(); };
  return m;
}
function makeLineMaterial(THREE) {
  // the inverted hull: back faces pushed out along the (bind-space) mitred normal by the per-vertex width; 0 = no line
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(MEME_COLORS.navy), side: THREE.BackSide });
  m.name = 'meme-line';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float hullW;\nattribute vec3 hullN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += hullN * hullW;');
  };
  m.customProgramCacheKey = () => 'meme-line-1';
  return m;
}

/** How far the ankle rises (U) so a boot pitched by p (radians, + toe up) still touches the ground with its lowest point. */
const BOOT_LIFT = (() => {
  const ankleY = HIP.y - LEG.thigh - LEG.shin, out = new Float32Array(121), [, hy, hz] = BOOT.half, r = BOOT.r;
  const prof = [];   // the boot's side profile (z, y) round the ankle: a rounded rectangle
  for (const [cz, cy, a0] of [[-1, -1, Math.PI], [1, -1, 1.5 * Math.PI], [1, 1, 0], [-1, 1, 0.5 * Math.PI]]) {
    for (let k = 0; k <= 6; k++) { const a = a0 + (k / 6) * (Math.PI / 2); prof.push([BOOT.c[2] + cz * (hz - r) + Math.cos(a) * r, BOOT.c[1] + cy * (hy - r) + Math.sin(a) * r - ankleY]); }
  }
  for (let i = 0; i <= 120; i++) {
    const p = (i - 60) * DEG, c = Math.cos(p), s = Math.sin(p);
    let lo = Infinity;
    for (const [z, y] of prof) lo = Math.min(lo, y * c - z * s);
    out[i] = Math.max(0, -lo - ankleY);
  }
  return out;
})();
const bootLift = (p) => { const f = clamp(p / DEG + 60, 0, 120), i = Math.min(119, Math.floor(f)); return lerp(BOOT_LIFT[i], BOOT_LIFT[i + 1], f - i); };

// ------------------------------------------------------------------ the animator: procedural, rotations of the groups only
function createAnimator(THREE, B, K, rig, opts = { blink: true, calm: false }) {
  const E = new THREE.Euler(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qW = new THREE.Quaternion();
  const st = {};
  const rest = new Map(); for (const b of Object.values(B)) rest.set(b, b.position.clone());
  const rot = (b, x, y, z, order = 'XYZ') => { E.set(x, y, z, order); b.quaternion.setFromEuler(E); };
  const pos = (b, dx, dy, dz) => { const r = rest.get(b); b.position.set(r.x + dx * K, r.y + dy * K, r.z + dz * K); };
  let seed = 0.41;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  function reset() {
    Object.assign(st, { t: 0, phase: 0, pose: 'idle', wWalk: 0, wRun: 0, rr: 0, air: 0, vy: 0, prevGround: true, cadence: 0, speed: 0,
      landY: 0, landV: 0, blinkT: 2.0, blinking: 0, double: 0, lookT: 3.5, lookHold: 0, lookYaw: 0, lookPitch: 0, lookYawV: 0, lookPitchV: 0, lookTo: [0, 0],
      exprForce: st.exprForce || null, upW: 0, turnW: 0, wM: 0, prevSpeed: 0, prevVy: 0, prevYaw: null, yawRate: 0, yawAcc: 0, aF: 0, aY: 0, vyAir: 0, expr: 'smile' });
    seed = 0.41;
    for (const s of springs) s.ready = false;
  }

  /** Two-bone leg in its own plane: the ankle at (forward f, up h) from where it hangs -> hip and knee angles. */
  function legIK(f, h, L1, L2) {
    const dx = f, dy = -(L1 + L2) + h;
    const d = clamp(Math.hypot(dx, dy), 0.05, (L1 + L2) * 0.9995);
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const knee = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    return { hip: Math.atan2(dx, -dy) + a, knee: -knee };
  }
  /** Turn the foot so that, in his own frame, it is level, toed out by yaw and pitched by pitch (+ toe up). */
  function footWorld(n, yaw, pitch) {
    E.set(pitch, yaw, 0, 'YXZ'); qW.setFromEuler(E);
    q1.copy(B.pelvis.quaternion).multiply(B['leg' + n].quaternion).multiply(B['shin' + n].quaternion);
    B['foot' + n].quaternion.copy(q2.copy(q1).invert().multiply(qW));
  }
  const smin = (a, b, w = 2.5) => { const h = clamp(0.5 + (0.5 * (b - a)) / w, 0, 1); return lerp(b, a, h) - w * h * (1 - h); };

  // ---- the secondary motion: particles in the root's frame (metres), verlet at a fixed rate (<= 1/120 s a substep)
  const mTmp = new THREE.Matrix4(), mPar = new THREE.Matrix4(), mHead = new THREE.Matrix4(), headInv = new THREE.Matrix4();
  const vTmp = new THREE.Vector3(), vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), vR = new THREE.Vector3(), vH = new THREE.Vector3();
  const qTmp = new THREE.Quaternion(), qA = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), mTmp2 = new THREE.Matrix4();
  const bootBall = [new THREE.Vector3(), new THREE.Vector3()];
  /** the root-frame matrix of a bone: the product of the local matrices from the skeleton's root down to it */
  function rootMat(b, out) {
    const chainB = []; for (let o = b; o && o !== B.root; o = o.parent) chainB.push(o);
    out.identity();
    for (let i = chainB.length - 1; i >= 0; i--) { const c = chainB[i]; mTmp.compose(c.position, c.quaternion, one); out.multiply(mTmp); }
    return out;
  }
  const bindOf = (b) => rig.bind.get(b);
  /** one spring chain: its bones each point their bind direction at the next particle; tipBind ends the last bone */
  function chain(name, bonesList, tipBind, P) {
    const joints = bonesList.map((b) => bindOf(b)).concat([tipBind]), segs = [];
    for (let i = 0; i < bonesList.length; i++) { const d = sub(joints[i + 1], joints[i]); segs.push({ len: len(d) * K, dir: norm(d) }); }
    const v3 = () => joints.slice(1).map(() => new THREE.Vector3());
    return { name, bones: bonesList, segs, x: v3(), xp: v3(), restW: v3(), anchor: new THREE.Vector3(), anchorPrev: new THREE.Vector3(), ready: false, P };
  }
  const springs = [];
  const tailBones = (n) => [...Array(rig.tailN).keys()].map((k) => B['tail' + n + k]);
  const tipOf = (n) => add([0, SOLE - 162, 0], rig.TP[n][rig.TP[n].length - 1]);
  // k: pull toward the rest shape (1/s^2); c: the air's drag (1/s); g: gravity's share; wind: how much the air moves it;
  // limit: the widest swing from rest. Tails: ribbons that hang and stream; the charm a free pendulum; the rest stiff.
  springs.push(chain('tailL', tailBones('L'), tipOf('L'), { k: 90, c: 3.6, g: 0.6, wind: 1.7, limit: 150 * DEG, collide: 'head', side: -1 }));
  springs.push(chain('tailR', tailBones('R'), tipOf('R'), { k: 90, c: 3.6, g: 0.6, wind: 1.4, limit: 150 * DEG, collide: 'head', side: 1 }));
  springs.push(chain('charm', [B.charm], [CHARM.at[0], CHARM.at[1] - CHARM.string - CHARM.r, CHARM.at[2]], { k: 0, c: 2.2, g: 1, wind: 0.55, limit: 72 * DEG, collide: 'seat' }));
  springs.push(chain('cowlick', [B.cowlick], add(rig.cwO, [8, 50, -8]), { k: 520, c: 11, g: 0.12, wind: 0.04, limit: 22 * DEG }));
  springs.push(chain('pack', [B.pack], [PACK.c[0], PACK.c[1] - PACK.half[1], PACK.c[2]], { k: 900, c: 24, g: 0.25, wind: 0, limit: 7 * DEG }));
  springs.push(chain('cam', [B.cam], CAM.c, { k: 260, c: 9, g: 0.5, wind: 0.08, limit: 16 * DEG, collide: 'belly' }));
  const hcU = sub([0, SOLE - 162, 0], bindOf(B.head));   // the head's centre in the head bone's frame (U)
  /** this frame's anchor (the first joint) and rest targets (the bind shape carried by the anchor's parent) */
  function restTargets(s) {
    rootMat(s.bones[0].parent, mPar);
    s.anchor.copy(s.bones[0].position).applyMatrix4(mPar);
    qTmp.setFromRotationMatrix(mPar);
    vB.copy(s.anchor);
    for (let i = 0; i < s.segs.length; i++) {
      vA.set(s.segs[i].dir[0], s.segs[i].dir[1], s.segs[i].dir[2]).applyQuaternion(qTmp).multiplyScalar(s.segs[i].len);
      vB.add(vA); s.restW[i].copy(vB);
    }
  }
  function atRest(s) { restTargets(s); for (let i = 0; i < s.x.length; i++) { s.x[i].copy(s.restW[i]); s.xp[i].copy(s.restW[i]); } s.anchorPrev.copy(s.anchor); s.ready = true; }
  const GRAV = 9.81;
  function stepSprings(dt, calm) {
    const speed = st.speed, n = Math.max(1, Math.ceil(dt * 120 - 1e-9)), h = dt / n;
    const aF = st.aF, aY = st.aY, w = st.yawRate, al = st.yawAcc;
    const breeze = calm ? 0 : 1, windK = calm ? 0.3 : 1, t0 = st.t - dt, inAir = st.air > 0.5 ? 1 : 0;
    rootMat(B.head, mHead); headInv.copy(mHead).invert();
    // the boots, as balls the float charm keeps clear of (a kicked-up heel passes right under it)
    for (const [i, n] of [[0, 'R'], [1, 'L']]) bootBall[i].set(0, (BOOT.c[1] - (HIP.y - LEG.thigh - LEG.shin)) * K, BOOT.c[2] * K).applyMatrix4(rootMat(B['foot' + n], mTmp2));
    for (const s of springs) {
      vR.copy(s.anchor);   // last frame's anchor
      restTargets(s);
      if (!s.ready) { atRest(s); continue; }
      s.anchorPrev.copy(vR);
      const P = s.P, kS = P.k * (calm ? 3 : 1), cD = P.c * (calm ? 2.2 : 1), damp = Math.exp(-0.6 * h);
      for (let q = 0; q < n; q++) {
        const f = (q + 1) / n, tt = t0 + (q + 1) * h;
        let px = lerp(s.anchorPrev.x, s.anchor.x, f), py = lerp(s.anchorPrev.y, s.anchor.y, f), pz = lerp(s.anchorPrev.z, s.anchor.z, f);
        // the air round him (root frame): he goes along -Z at `speed`, up at vy; a harbour breeze when he stands still
        const still = 1 - smooth(0.2, 1.2, speed);
        const bz = breeze * (0.5 + 0.25 * Math.sin(tt * 0.61) + 0.1 * Math.sin(tt * 1.7)) * still, bx = breeze * (0.22 * Math.sin(tt * 0.37) + 0.08 * Math.sin(tt * 1.3)) * still;
        const airX = bx * P.wind, airY = -st.vy * P.wind * 0.6 * inAir, airZ = (speed * windK + bz) * P.wind;
        for (let i = 0; i < s.x.length; i++) {
          const x = s.x[i], xp = s.xp[i];
          const vx = (x.x - xp.x) / h, vy = (x.y - xp.y) / h, vz = (x.z - xp.z) / h;
          // the frame's own motion as forces: its acceleration (aF along his front, aY up) and the turn (the centripetal
          // pull of turning while moving, the Euler force of a turn's start or stop, the Coriolis force on what swings)
          let fx = w * speed - al * x.z + w * w * x.x - 2 * w * vz, fy = -aY - GRAV * P.g, fz = aF + al * x.x + w * w * x.z + 2 * w * vx;
          fx += cD * (airX - vx); fy += cD * (airY - vy); fz += cD * (airZ - vz);
          fx += kS * (s.restW[i].x - x.x); fy += kS * (s.restW[i].y - x.y); fz += kS * (s.restW[i].z - x.z);
          const nx = x.x + (x.x - xp.x) * damp + fx * h * h, ny = x.y + (x.y - xp.y) * damp + fy * h * h, nz = x.z + (x.z - xp.z) * damp + fz * h * h;
          xp.copy(x); x.set(nx, ny, nz);
          constrain(s, i, px, py, pz);
          px = x.x; py = x.y; pz = x.z;
        }
      }
    }
  }
  /** keep a segment's length and its angle from rest, and keep it out of the body */
  function constrain(s, i, px, py, pz) {
    const x = s.x[i], L = s.segs[i].len;
    vC.set(x.x - px, x.y - py, x.z - pz);
    let d = vC.length();
    if (d < 1e-9) { vC.set(s.restW[i].x - px, s.restW[i].y - py, s.restW[i].z - pz); d = vC.length() || 1; }
    vC.multiplyScalar(1 / d);
    const r0 = i === 0 ? s.anchor : s.restW[i - 1];
    vR.copy(s.restW[i]).sub(r0).normalize();
    const c = clamp(vC.dot(vR), -1, 1), lim = s.P.limit;
    if (Math.acos(c) > lim) {
      vA.copy(vC).addScaledVector(vR, -c); const ol = vA.length();
      if (ol > 1e-6) { vA.multiplyScalar(1 / ol); vC.copy(vR).multiplyScalar(Math.cos(lim)).addScaledVector(vA, Math.sin(lim)); }
    }
    x.set(px + vC.x * L, py + vC.y * L, pz + vC.z * L);
    if (s.P.side) {   // each tail on its own side of his middle (they never cross)
      const minX = (6 + 7 * i) * K;
      if (x.x * s.P.side < minX) x.x = s.P.side * minX;
    }
    if (s.P.collide === 'head') collideHead(x);
    else if (s.P.collide === 'seat') collideSeat(x);
    else if (s.P.collide === 'belly') { const f = CAM.c[2] * K + 0.004; if (x.z > f) x.z = f; }
  }
  function collideHead(x) {
    // outside the hair (an ellipsoid round the head in the head's own frame, the ribbon's half-thickness clear of it)
    vH.copy(x).applyMatrix4(headInv);
    const hx = vH.x / K - hcU[0], hy = vH.y / K - hcU[1], hz = vH.z / K - hcU[2];
    const ax = HEAD.rx + 13, ay = HEAD.ry + 23, az = HEAD.rz + 17, e = (hx / ax) ** 2 + (hy / ay) ** 2 + (hz / az) ** 2;   // the hair's outside + the ribbon
    if (e < 1) { const sc = 1 / Math.sqrt(e); x.copy(vH.set((hx * sc + hcU[0]) * K, (hy * sc + hcU[1]) * K, (hz * sc + hcU[2]) * K).applyMatrix4(mHead)); }
    // and never into his back under the head (the hood, the backpack's top)
    if (x.y < 300 * K && x.z < 92 * K) x.z = 92 * K;
  }
  function collideSeat(x) {
    // the float stays clear of his seat and legs: a cylinder round the pelvis (r 82 U, y 30-175 U), and of each boot
    const r = 82 * K, rx = x.x, rz = x.z - 4 * K, d = Math.hypot(rx, rz);
    if (x.y < 175 * K && x.y > 30 * K && d < r) { const sc = r / (d || 1); x.x = rx * sc; x.z = rz * sc + 4 * K; }
    for (const b of bootBall) {
      const rb = (44 + CHARM.r) * K; vH.copy(x).sub(b); const db = vH.length();
      if (db < rb) x.copy(b).addScaledVector(vH, rb / (db || 1));
    }
  }
  /** Point each spring bone's bind direction at its particle (the rotation from the bind direction, in its parent's frame). */
  function applySprings() {
    for (const s of springs) {
      if (!s.ready) continue;
      rootMat(s.bones[0].parent, mPar);
      for (let i = 0; i < s.bones.length; i++) {
        const b = s.bones[i];
        vTmp.copy(b.position).applyMatrix4(mPar);
        vC.copy(s.x[i]).sub(vTmp);
        if (vC.lengthSq() > 1e-12) {
          vC.normalize().applyQuaternion(qTmp.setFromRotationMatrix(mPar).invert());
          vA.set(s.segs[i].dir[0], s.segs[i].dir[1], s.segs[i].dir[2]);
          b.quaternion.setFromUnitVectors(vA, vC);
        }
        mTmp.compose(b.position, b.quaternion, one); mPar.multiply(mTmp);
      }
    }
  }

  const legT = [{}, {}];   // reused every frame (no garbage)
  function step(dt, inp, root) {
    st.t += dt;
    const calm = !!opts.calm, cm = calm ? 0.4 : 1;
    const speed = Math.max(0, inp.speed || 0), ground = inp.onGround !== false;
    st.speed = speed;
    const k = dt > 0 ? 1 - Math.exp(-dt * 10) : 1;
    // the walk / run blend: the run's share (the caller's `run`, or by speed) and the movement (idle -> walk)
    const rT = runOf(speed, inp.run), mT = smooth(MEME_GAIT.walkFrom, MEME_GAIT.walkTo, speed);
    if (inp.forced && dt === 0) { st.rr = rT; st.wM = mT; st.air = ground ? 0 : 1; }
    st.rr = lerp(st.rr ?? rT, rT, k); st.wM = lerp(st.wM ?? mT, mT, k);
    st.air = lerp(st.air, ground ? 0 : 1, dt > 0 ? 1 - Math.exp(-dt * 16) : 0);
    const vyIn = inp.vy || 0, vyEff = ground ? 0 : vyIn;
    // the root's accelerations for the springs (clamped: a respawn or a teleport is not a force)
    if (dt > 0) {
      st.aF = clamp((speed - st.prevSpeed) / dt, -30, 30);
      st.aY = clamp((vyEff - st.prevVy) / dt, -80, 80);
      // the yaw the walker gave the root (one frame late, as placed): the turn rate and its change
      let yaw = null;
      if (root) { qA.copy(root.quaternion); vA.set(0, 0, -1).applyQuaternion(qA); yaw = Math.atan2(-vA.x, -vA.z); }
      if (yaw !== null && st.prevYaw !== null) { let d = yaw - st.prevYaw; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; const w = clamp(d / dt, -8, 8); st.yawAcc = clamp((w - st.yawRate) / dt, -60, 60); st.yawRate = w; }
      else { st.yawRate = 0; st.yawAcc = 0; }
      st.prevYaw = yaw;
    } else { st.aF = 0; st.aY = 0; st.yawAcc = 0; }
    st.prevSpeed = speed; st.prevVy = vyEff;
    st.vy = vyIn;
    // the landing: an impulse on a damped spring (the knees take it and he springs back up a touch)
    if (ground && !st.prevGround) st.landV -= clamp(1.1 + 0.2 * Math.max(0, -st.vyAir), 1.1, 2.4) * (calm ? 0.5 : 1);
    if (!ground) st.vyAir = vyIn;
    st.prevGround = ground;
    // (k 260, c 15: a quick squash, one small rebound, settled in ~0.4 s; exact substeps so any frame rate gives the same)
    if (dt > 0) { const kL = 260, cL = 15, n = Math.ceil(dt * 240), h = dt / n; for (let q = 0; q < n; q++) { st.landV += (-kL * st.landY - cL * st.landV) * h; st.landY += st.landV * h; } if (Math.abs(st.landY) < 1e-5 && Math.abs(st.landV) < 1e-4) { st.landY = 0; st.landV = 0; } }
    const land = clamp(-st.landY / 0.075, -0.35, 1);   // 1 = the deepest squash

    const rr = st.rr, wM = st.wM, wW = wM * (1 - rr), wR = wM * rr;
    const G = gaitBlend(rr);
    const sv = lerp(strideOf(speed, MEME_GAIT.strideWalk), strideOf(speed, MEME_GAIT.strideRun), rr);
    const R = sweepOf(speed, rr);   // half the planted boot's sweep (U): memeGait's own, so the walker's cadence never slides it
    // the cycle rate: the caller's `cadence` (the walker locks it to the ground speed), or the no-slide rate, capped
    let cadence;
    if (Number.isFinite(inp.cadence) && inp.cadence >= 0) cadence = inp.cadence;
    else { const travel = 2 * R * K; cadence = speed > 0.03 && travel > 1e-6 ? Math.min(G.maxHz, (speed * G.stance) / travel) : 0; }
    // turning on the spot (the walker turns him toward the stick): he steps in place, 2.6 steps a second at full turn
    st.turnW = lerp(st.turnW, opts.calm ? 0 : smooth(1.0, 2.6, Math.abs(st.yawRate)) * (1 - smooth(0.05, 0.4, speed)) * (ground ? 1 : 0), dt > 0 ? 1 - Math.exp(-dt * 8) : 1);
    st.cadence = cadence;
    st.phase = (st.phase + (cadence + 1.3 * st.turnW) * dt) % 1;
    st.pose = inp.forced || (!ground ? (st.vy > 0.3 ? 'jump' : 'fall') : wR > 0.5 ? 'run' : wW > 0.3 ? 'walk' : 'idle');

    const ph = st.phase * TAU, air = st.air, gd = 1 - air, gm = wM * gd;
    const wI = (1 - wM) * gd, br = Math.sin((st.t * TAU) / 3.4);
    if (dt > 0) st.upW = lerp(st.upW, st.vy > 0 ? 1 : 0, 1 - Math.exp(-dt * 9)); else if (inp.forced) st.upW = st.vy > 0 ? 1 : 0;
    const up = st.upW, wJ = air * up, wF = air * (1 - up);
    const cs = Math.cos(ph), sn = Math.sin(ph);
    const big = lerp(0.35, 1, sv);   // small steps lift less

    // ---- the legs' targets: F forward of the hip's neutral (U), H the ankle's rise, the boot's pitch
    const yaw = G.hipYaw * DEG * cs * gm;
    for (let li = 0; li < 2; li++) {
      const s = li === 0 ? 1 : -1, T = legT[li], p = (st.phase + (s > 0 ? 0 : 0.5)) % 1;
      let F, H, pitch, planted = 0;
      if (p < G.stance) {
        const u = p / G.stance;
        F = R * (1 - 2 * u);
        pitch = (G.heel * DEG * (1 - smooth(0, 0.26, u)) - G.toe * DEG * smooth(0.62, 1, u)) * big;
        H = bootLift(pitch);
        planted = 1;
      } else {
        const t = (p - G.stance) / (1 - G.stance), kick = Math.sin(Math.PI * clamp(t / 0.62, 0, 1)), late = Math.sin(Math.PI * clamp((t - 0.5) / 0.46, 0, 1));
        F = lerp(-R, R, smooth(0.12, 0.86, t)) + 0.06 * R * late;
        pitch = (lerp(-G.toe * DEG - G.kickPitch * DEG * kick, G.heel * DEG, smooth(0.45, 0.86, t)) + 6 * DEG * late) * big;
        H = (bootLift(-G.toe * DEG * big) * (1 - smooth(0, 0.3, t)) + G.kick * kick * (1 - t) * big + G.lift * Math.pow(Math.sin(Math.PI * t), 1.2) * big + G.highStep * late * big + bootLift(G.heel * DEG * big) * smooth(0.7, 1, t));
      }
      F *= gm; H *= gm; pitch *= gm;
      if (p >= G.stance && st.turnW > 1e-3) H += 15 * st.turnW * Math.sin(Math.PI * (p - G.stance) / (1 - G.stance));   // the step in place
      // in the air: rising, both knees tucked (his right higher); falling, the legs reach down for the ground
      const jF = s > 0 ? 18 : 2, jH = s > 0 ? 50 : 34, fF = s > 0 ? 6 : -4, fH = 6;
      F = lerp(F, lerp(fF, jF, up), air); H = lerp(H, lerp(fH, jH, up), air);
      pitch = lerp(pitch, lerp(-16, s > 0 ? -8 : -18, up) * DEG, air);
      T.F = F; T.H = H; T.pitch = pitch; T.planted = planted * gd;
      T.hipF = s * HIP.x * Math.sin(yaw);
    }

    // ---- the pelvis: down into each contact, up at the passing (walk); down mid-stance, up in the flight (run); the landing
    const cW = Math.cos(2 * (ph - 0.07 * TAU)), cRn = Math.cos(2 * (ph - (G.stance / 2) * TAU));
    const bobW = -MEME_GAIT.walk.drop * (0.5 + 0.5 * cW) + MEME_GAIT.walk.bounce * (0.5 - 0.5 * cW);
    const bobR = -MEME_GAIT.run.drop * (0.5 + 0.5 * cRn) + MEME_GAIT.run.flight * (0.5 - 0.5 * cRn);
    const bob = lerp(bobW, bobR, rr) * gm * (calm ? 0.6 : 1);
    const onG = ground ? 1 : 0;   // the landing squash is on the ground at once (not after the air pose has eased out)
    let pdy = bob - 16 * land * onG + (calm ? 0.25 : 0.6) * br * wI - 6 * wJ;
    const Lr = (LEG.thigh + LEG.shin) * 0.997;
    for (let li = 0; li < 2; li++) { const T = legT[li]; if (T.planted > 0.5) { const fh = T.F - T.hipF; pdy = smin(pdy, Math.sqrt(Math.max(0, Lr * Lr - fh * fh)) - (LEG.thigh + LEG.shin) + T.H); } }
    st.pdy = pdy;
    pos(B.pelvis, sn * 1.6 * gm * cm, pdy, 0);   // a little sway over the planted boot
    const lean = G.lean * DEG * gm + 5 * DEG * land * onG - 5 * DEG * wJ + 4 * DEG * wF;
    rot(B.pelvis, -lean * 0.35, yaw, -sn * 2.2 * DEG * gm * cm);
    rot(B.spine, -lean * 0.65 - 0.7 * DEG * br * wI * cm, -yaw * 0.85, sn * 1.6 * DEG * gm * cm);
    pos(B.spine, 0, 0.5 * br * wI * cm, 0);

    // ---- the legs: two-bone IK, the boots level in his frame and pitched as above
    for (let li = 0; li < 2; li++) {
      const s = li === 0 ? 1 : -1, n = s > 0 ? 'R' : 'L', T = legT[li];
      const { hip, knee } = legIK(T.F - T.hipF, T.H - pdy, LEG.thigh, LEG.shin);
      const splay = s * (1.5 * DEG * gd + 7 * DEG * air);
      E.set(hip, -yaw, splay, 'YXZ'); B['leg' + n].quaternion.setFromEuler(E);
      rot(B['shin' + n], knee, 0, 0);
      footWorld(n, s * (-4 * DEG * wI - 3 * DEG * wM * gd - 6 * DEG * air), T.pitch);
    }

    // ---- the head: steady over the step, a nod with each footfall, the idle's breath and look-round, the landing's dip
    lookRound(dt, wI, calm);
    const nod = Math.cos(2 * (ph - 0.14 * TAU)) * (2.2 * DEG * wW + 3 * DEG * wR) * gd * cm;
    rot(B.head, lean * 0.62 + nod + 0.8 * DEG * br * wI * cm + 7 * DEG * land * onG - 7 * DEG * wJ + 3 * DEG * wF + st.lookPitch,
      -yaw * 0.12 + st.lookYaw, sn * 1.4 * DEG * gm * cm + 2.5 * DEG * Math.sin(st.t * 0.53) * wI * cm * (1 - Math.min(1, Math.abs(st.lookYaw) * 3)), 'YXZ');

    // ---- the arms: hanging 11 deg out (the sheet), swinging against the legs, pumping in the run, up in the jump, out in the fall
    for (const s of [1, -1]) {
      const n = s > 0 ? 'R' : 'L';
      const swing = -s * cs;   // + forward: his right arm forward when his left leg is
      const fwd = swing * (MEME_GAIT.walk.arm * DEG * wW + MEME_GAIT.run.arm * DEG * wR) * gd * lerp(0.6, 1, sv) + 10 * DEG * wR * gd;
      const out = 11 * DEG * wI + 7 * DEG * wW + 9 * DEG * wR - 24 * DEG * wJ + 84 * DEG * wF + 10 * DEG * land * onG + Math.sin(st.t * 17) * 5 * DEG * wF * cm;
      const breathe = 0.9 * DEG * br * wI * cm;
      rot(B['arm' + n], fwd + breathe + 152 * DEG * wJ + 14 * DEG * wF + 12 * DEG * land * onG, 0, s * out, 'ZXY');
      pos(B['arm' + n], 0, 0.6 * br * wI * cm, 0);
      const elbow = 6 * DEG * wI + (MEME_GAIT.walk.elbow * DEG + 12 * DEG * Math.max(0, swing)) * wW + MEME_GAIT.run.elbow * DEG * wR + 22 * DEG * wJ + 16 * DEG * wF + 18 * DEG * land * onG;
      rot(B['fore' + n], elbow, 0, 0);
    }

    // ---- the face: the blink (ほっ), the jump's 見つけた, the fall's おっ
    st.blinkT -= dt;
    if (st.blinkT <= 0) { st.blinking = opts.blink ? 0.12 : 0; st.double = rnd() < 0.22 ? 0.26 : 0; st.blinkT = 2.4 + rnd() * 3.2; }
    if (st.double > 0) { st.double -= dt; if (st.double <= 0 && opts.blink) st.blinking = 0.1; }
    st.blinking = Math.max(0, st.blinking - dt);
    const expr = st.exprForce || (wJ > 0.6 ? 'wink' : wF > 0.6 ? 'o' : 'smile');
    face(expr === 'blink' ? 'smile' : expr, expr === 'blink' || (!st.exprForce && st.blinking > 0 && expr !== 'wink'));

    // ---- the secondary motion, after the body is posed
    if (dt > 0) stepSprings(dt, calm);
    else for (const s of springs) if (!s.ready) atRest(s);
    applySprings();
  }
  /** The idle's look round: now and then a glance to one side (critically damped), held, then back. Never in calm. */
  function lookRound(dt, wI, calm) {
    if (dt > 0) {
      if (calm || wI < 0.8) { st.lookTo[0] = 0; st.lookTo[1] = 0; st.lookT = Math.max(st.lookT, 2.5); }
      else {
        st.lookT -= dt;
        if (st.lookT <= 0) {
          if (st.lookHold > 0) { st.lookTo[0] = 0; st.lookTo[1] = 0; st.lookHold = 0; st.lookT = 3.5 + rnd() * 4; }
          else { const s = rnd() < 0.5 ? -1 : 1; st.lookTo[0] = s * (16 + rnd() * 16) * DEG; st.lookTo[1] = (rnd() * 8 - 3) * DEG; st.lookHold = 1; st.lookT = 0.9 + rnd() * 1.1; if (opts.blink) st.blinking = 0.12; }
        }
      }
      const w = 9;   // ~0.35 s to arrive, no overshoot
      for (const [kk, kv, to] of [['lookYaw', 'lookYawV', st.lookTo[0]], ['lookPitch', 'lookPitchV', st.lookTo[1]]]) {
        const x = st[kk] - to, v = st[kv], e = Math.exp(-w * dt), n = (v + w * x) * dt;
        st[kk] = to + (x + n) * e; st[kv] = (v - w * n) * e;
      }
    }
  }
  function face(expr, shut) {
    const show = (b, on) => b.scale.setScalar(on ? 1 : 1e-4);
    const winkR = expr === 'wink', wow = expr === 'o';   // おっ draws its own eyes (on the mouth's swap)
    show(B.eyeR, !shut && !winkR && !wow); show(B.eyeShutR, shut && !winkR && !wow); show(B.eyeWinkR, winkR);
    show(B.eyeL, !shut && !wow); show(B.eyeShutL, shut && !wow);
    show(B.mouthSmile, expr === 'smile'); show(B.mouthOpen, expr === 'wink'); show(B.mouthO, expr === 'o');
    st.expr = expr;
  }
  reset();
  return {
    step, reset, state: st, opts, springs,
    /** start every spring at its rest (after a reset and a first pose) */
    settle() { for (const s of springs) atRest(s); applySprings(); },
    blink(sec = 0.12) { st.blinking = clamp(fin(sec, 0.12), 0, 5); face(st.expr, true); },
    /** hold a face from the sheet ('smile' にこっ, 'blink' ほっ, 'wink' 見つけた, 'o' おっ); null: the poses choose */
    expression(name) { st.exprForce = EXPRESSIONS.includes(name) ? name : null; },
  };
}
/** the gait's parameters at a run blend (no garbage: one shared object) */
const GB = {}, GKEYS = Object.keys(MEME_GAIT.walk);
function gaitBlend(rr) {
  for (const k of GKEYS) GB[k] = lerp(MEME_GAIT.walk[k], MEME_GAIT.run[k], rr);
  GB.reachEff = lerp(reachEff(MEME_GAIT.walk), reachEff(MEME_GAIT.run), rr);
  return GB;
}
