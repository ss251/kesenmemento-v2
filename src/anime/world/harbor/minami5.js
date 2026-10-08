// [v5:photos] 南町 / 内湾 waterfront rebuilt against the author's own photos (raw/author-photos, 2026-10-01 17:07-17:22
// JST, IMG_0799-0842; the highest-priority source, docs/anime/OVERRIDES.md). Called from harbor/minami.js.
//
//   PIER7 bay side (IMG_0800-0806, 0814-0817): the T.P. 6.2 m seawall IS the bay-side ground storey (board-formed concrete),
//        the 2F terrace runs on top of it, and a 3.6 m deck on slim white stilts (white tie rods) stands out over the quay
//        asphalt with a stainless wire rail hung with string lights (GSI deck footprints pier7Deck / pier7Deck2). The 2F is
//        glazed with a dark-brown vertical-board band at its head; the 3F (street side) is glazed under a low gable roof
//        with deep eaves and exposed white rafters. NW end: a single glazed room on the deck under its own big gable roof
//        (ラヂオ気仙沼's studio); SE end: a white vertical-board block whose NW face carries 「PIER7」 and a painting of the bay.
//   PIER7 street NW corner (IMG_0799, 0823): glass 1F box, a timber deck with steps and the rust-brown NAIWAN 創 totem, a
//        timber stair up to the 2F along the street face, the roof eave carried on clusters of white slender columns.
//   the plaza (IMG_0800-0813): flat at quay level, rectangular grey-beige pavers with bands of small granite setts, the
//        three white ring benches (stepped rings round a sunken lawn with a young tree and two lamp posts), the 陸閘 winch,
//        reddish composite bleachers rising NW to the lawn, a 2-storey white mesh stair cage, and the elevated walkway
//        (concrete deck, dark fascia, stainless rail with lights) that bridges the gate opening between 迎's terrace and
//        PIER7's deck (GSI mukaeruDeck + pier7Deck) on concrete piers; the gate post with the yellow 注意 board.
//   迎 ムカエル (IMG_0808, 0824-0828): from the SE: the ANCHOR café (khaki render, ANCHOR clerestory letters, café RST neon,
//        HAVE A NICE COFFEE oval, Lander Blue / SHARKS boards, glazed COFFEE DONUTS corner), a tall grey ribbed-metal 3F box
//        with an external steel stair, then the lower wings (charcoal boards and 「nine one」 on the street, dark timber on
//        the bay) under a gull-wing wavy roof; the purple NAIWAN 迎 WELCOME HOUSE totem on a composite deck with steps and a
//        broad composite stair up to the 2F terrace.
//   結 ユワエル (IMG_0821, 0830, 0834-0842): single-storey shops in natural cedar boards behind a colonnade of weathered posts
//        under a white corrugated fascia (BLACK TIDE BREWING in green letters), a taller white corrugated back volume, the
//        light-blue NAIWAN 結 totem and the 「Kesennuma slow street 結」 map board; 拓 ヒラケル (IMG_0831, 0833, 0840): white
//        corrugated + grey timber panels, 「Kesennuma Amway House Hirakeru」, a timber pergola with かつお banners; the slow
//        street between them: pavers with red and dark bands, string lights criss-crossing overhead.
//   the convenience store across 魚町港町線 (IMG_0820, 0822, 0829): a generic striped storefront with a brick end wall, a
//        solar roof, and a "7"-style pole sign (no trademark copied).
//   road markings (IMG_0821, 0828-0832): the zebra crossings at the 結 junction, the hatched median (導流帯), the ◇
//        crossing-ahead marks and black bollards with white bands.
import * as THREE from 'three';
import { SITES, MINAMI } from './real.js';
import { prismWalls, capGeo, offsetRing, obbOf, seg, barAlong, openRing, signedArea, paint, resample } from './lmkit.js';
import { nightMat, registry } from './lights.js';
import { mapMat, textTex, FONT } from './util.js';
import { detailKit, glowMat as glowMat5, ovalTex, shopGlass } from './detail5.js';   // [v5:detail]
import { OPENINGS as CAFE_OPENINGS } from './cafe-front.js';   // [cafe-rst] the café RST's ground-floor openings in the ANCHOR face

export const C5 = {
  wall: '#9c9b99', wallDark: '#8f8e89', deck: '#9c7c60', stilt: '#f2f2ef', rail: '#b7bec4', dbrown: '#5b4232', soffit: '#9a7452',
  roofLight: '#dfe1df', roofDark: '#77767a', fascia: '#f1f1ee', wboard: '#eef0ee', khaki: '#8f7d66', rib: '#c4c9cc', charcoal: '#4f5257',
  timberDark: '#5a4130', comp: '#93695a', paver: '#a59f96', sett: '#7d7c7e', cedar: '#c9a477', gtimber: '#9c958b', corr: '#e4e5e2',
  post: '#857d72', steel: '#5d6168', mesh: '#f4f4f2', purple: '#3b3577', rust: '#6b3a2a', aqua: '#4aa8d6', yellow: '#e8c93a',
};

/** The plaza between 迎 and PIER7, at quay level (the old stepped-garden outline plus the strip under the walkway). */
export const PLAZA = [[-0.1, 33], [16.8, 24.5], [40.2, 64.8], [23.9, 72.6], [7.6, 67.8], [-4.5, 74.9], [-9.5, 50.1], [-3.9, 47.4]];
/** The seawall line on PIER7's bay side: the inner edge of the GSI deck footprints (pier7Deck, pier7Deck2), from the gate
 *  post north of PIER7 to the SE end; the stilted deck stands 3.6 m out from it. */
export const P7WALL = [[10, 64.1], [19.9, 80.1], [27.5, 89], [36.5, 96.9], [49.1, 107.1], [65.5, 122.5]];
/** The elevated walkway at the wall crest: from 迎's deck (GSI mukaeruDeck) over the gate opening to PIER7's NW face (its
 *  underside fills the top of IMG_0820 from 11 m away; IMG_0799 / 0823 show it arriving at PIER7's NW end). */
export const WALKWAY = [[2.3, 48.6], [3.4, 55.0], [4.1, 60.5], [6.1, 63.7], [8.7, 65.4]];   // [v6:fix3] the walkway bends east to PIER7's NW terrace: its pier is the one at the left edge of IMG_0819 (7 m from the camera) and beside IMG_0799's 92 deg bearing
/** [v6:rebuild] The walkway over the gate opening (IMG_0799, 0807, 0808, 0819, 0820): it leaves the cage's deck at the
 *  front face and crosses south to PIER7's NW terrace (the cage itself carries the deck along 迎's terrace, so the old
 *  polyline's north half ran through it); deck top, thickness, the board-formed piers (pier 1 from IMG_0808 + 0818
 *  vertical edges; pier 2 under PIER7's NW terrace, IMG_0799). */
export const WALK6 = { top: 5.5, th: 0.8, w: 3.4, piers: [[3.9, 52.7]], gatePost: [8.8, 66.0] };   // [v6:fix3] re-solved: IMG_0819's right-edge ray (bearing 235.6 deg from 14.64, 60.75: the pier is the strip at the far left, 7 m away) x IMG_0799's 94.5 deg to its SW edge put its centre at (8.80, 66.00) +-0.4 m (0.85 / 0.01 deg residuals); the plaza photos (0807 / 0806: 24-26 m, nearly parallel to the 0819 ray) leave +-1.1 m along that ray   // [v6:fix1] gatePost re-solved: IMG_0807 (pier 2.2 x 1.3 m, front face bearing 241 deg from the plaza spot) + IMG_0819's right-edge ray (bearing 235 deg from 14.6, 60.8) put it at the walkway's south end (4.7, 66.0), not 2.2 m west of it (IMG_0819 / 0821 show no column mid-frame)
/** The 陸閘's east post (board-formed concrete, the yellow 注意 board on its plaza face) carrying the walkway's south end: the
 *  plaza station's bearing 243 deg to the board (IMG_0806, 0807) crossed with IMG_0799's bearing 92 deg to the same post. */
/** The convenience store across 魚町港町線 (Google Earth 2026-03-11 shed with a solar roof, c6.json; IMG_0822 / 0829). */
/** [v6:rebuild] The plaza as the photo survey measured it (docs/anime/survey/minami.md, data/survey/minami/features.json;
 *  ENU metres, T.P. heights). The builder and the feature export (plazaFeatures) share these constants.
 *  PLAZA_Y: the paving (the cage foot 1.82, the ring and winch feet 1.84 from the SfM ground points; the DEM's 2.1 is the
 *  pre-2018 ground). */
export const PLAZA_Y = 1.83;
/** The paved forecourt north of PLAZA, in front of the bleachers' far block (flat at PLAZA_Y). */
export const PLAZA_N = [[-0.1, 33], [-9.6, 31.4], [-9.2, 14.5], [4, 10.5], [16.8, 24.5]];
/** The lawn bank behind the bleachers (IMG_0808, 0809: it rises north-west of the far block, beyond the asphalt; the DEM's
 *  mound at x < -6). Replaces real.js MINAMI.lawn, whose east half lay over the forecourt. */
export const LAWN6 = [[-26, 6], [-6, 4], [-9.4, 14], [-9.8, 31.2], [-12, 30]];
/** The white mesh cage at 迎's SE end (IMG_0807, 0808, 0809, 0818): a 21.3 m x 3.6 m steel frame along 迎's bay terrace.
 *  TL = the front face's left top corner (the box on the concrete 陸閘 gate post, under the red beacon), CR = the corner
 *  column, EN = the last post of the long side face; BL = TL + (EN - CR) closes the footprint (the front face runs at 53 deg,
 *  the side at 150 deg). Heights: foot 1.82; a white plinth to 2.04, mesh rows to 3.13 and 4.35, the deck beam at 5.70 (the
 *  box bottom over the gate post) carrying the deck at the wall crest, a mesh rail band to the top rail at 7.24 (the
 *  terrace rail). 9 bays of 2.36 m on the long faces, two mesh panels each. */
export const CAGE6 = { TL: [0.83, 49.50], CR: [3.73, 47.34], EN: [-6.95, 28.94], foot: 1.82, plinth: 2.04, rows: [3.13, 4.35], beam: 5.70, top: 7.24, bays: 9 };
/** The 陸閘 winch (IMG_0807, 0808): two pointed posts 2.67 m tall, 2.40 m apart (feet a, b), gearboxes, a shaft and a hand
 *  wheel on a steel channel over a grating. */
export const WINCH6 = { a: [22.60, 49.86], b: [21.22, 47.89], h: 2.67 };
/** The composite bleachers against the cage's long face (IMG_0808, 0809; one standing spot, so depth comes from the cage
 *  face and the paving): five tiers A-E whose left ends abut the cage face (O = tier A's, w = their set-back along the
 *  up-slope axis W) and whose fronts run at 32.5 deg (perpendicular to the stair, whose left edge is radial from the
 *  plaza camera: a vertical line in IMG_0808 at x 3164); the stair (2.4 m) rises to the top deck at T.P. 5.27; right of it
 *  the far block of seat steps and the landing where people sit (~45 m from the camera, flat paving). */
export const BLEACH6 = {
  O: [2.40, 45.05], U: [0.537, -0.843], W: [-0.843, -0.537], cage: 0.517,      // u along the fronts, w up-slope; the cage face u = 0.517 w
  tiers: [[0, 2.475], [1.159, 3.093], [2.308, 3.898], [4.70, 4.605], [6.947, 5.27]], back: 13.0, uS: 9.96, stairW: 2.1, risers: 16,
  far: { w0: 13.81, w1: 16.7, u0: 12.36, u1: 17.2, steps: [2.07, 2.52, 2.92, 3.43], tread: 0.9 },
};
/** The three white ring benches (survey: ring centres from rim picks, ring B confirmed by its tree from two standing
 *  spots): outer diameter, rim height 0.27 m at the front. [v6:fix1] Ring C is an open C: its far (west) wall has a 2.3 m
 *  gap (IMG_0807: the back wall drops to the inner seat between x 362 and 520; the end faces seen close up in IMG_0800 /
 *  0801), refitted from the foot / top-edge contours of IMG_0807 and 0808 (centre 22.1, 54.2 / 21.8, 54.4, d 5.4 / 6.2) and
 *  IMG_0801's near arc (west edge x 20.2); each ring's tree crown from IMG_0803 / 0807 (top T.P., width, depth m). */
export const RINGS6 = [
  { c: [33.63, 60.44], d: 4.31, tree: [33.75, 60.75], crown: { top: 4.7, w: 3.5, h: 2.0 } },
  { c: [28.01, 62.67], d: 5.02, tree: [28.05, 63.02], crown: { top: 5.1, w: 3.5, h: 2.1 } },
  { c: [22.1, 54.1], d: 5.6, tree: [22.1, 54.1], crown: { top: 5.35, w: 4.5, h: 2.6 }, gap: [147, 192] },
];
export const RING_H = 0.27;
/** Ring B's young tree, triangulated from both plaza standing spots (IMG_0800, 0801, 0803). */
export const RING_TREE_B = [28.05, 63.02];
/** [v6:fix1] The plaza paving as the photos lay it: pavers (0.4 x 0.2 m, long side along the bands) and sett bands run at
 *  compass bearing 328 deg (IMG_0809: three parallel bands to the vanishing point; 0803, 0811, 0812 the same direction, ground
 *  cuts at T.P. 1.83). e1 runs along the bands (SE), e2 across (ENE); t = e2 . (x, z) is a band's lateral offset (m) and
 *  [t, width] its measured centre line: 0809 (-7.5, -1.6, +4.8), 0803 (-4.2, -1.6), 0812 (+6.7). */
export const PAV6 = { e1: [0.530, 0.848], e2: [0.848, -0.530], bands: [{ t: -7.5, w: 0.8, u0: 15, u1: 56 }, { t: -4.2, w: 0.9, u0: 30, u1: 76 }, { t: -1.6, w: 1.15, u0: 15, u1: 78 }, { t: 4.8, w: 1.0, u0: 15, u1: 52 }, { t: 6.7, w: 0.9, u0: 45, u1: 76 }] };   // u = e1 . (x, z): the along-band extent each is seen over
/** [v6:fix1] The paving east of PLAZA out to the quay edge (IMG_0809-0812: tile paving with sett bands right up to a white pipe
 *  railing on the edge; the GSI quay line moved 1.5 m seaward to the post lines of IMG_0810 / 0811). EDGE6 = the paved edge,
 *  RAIL6 = the railing 0.8 m inside it. */
export const EDGE6 = [[29.8, 23.8], [35.0, 32.2], [41.4, 45.7], [42.5, 45.0], [48.6, 55.3]];
export const RAIL6 = [[29.1, 24.2], [34.3, 32.6], [40.7, 46.1]];
export const PLAZA_E = [[14.8, 24.5], ...EDGE6, [40.2, 64.8], [38.0, 64.8]];   // overlaps PLAZA by 2 m so no sliver of the base ground shows between the sheets
/** [v6:rebuild] PIER7's levels (T.P. m) from the survey's SfM points along its bay face and the photo picks: f2 = the 2F floor
 *  and the bay deck on the seawall, f3 = the 3F floor, tops = the eave heights of the NW pavilion, the main block and the SE
 *  block; out = the deck's stilt line from the wall (P7WALL). */
export const PIER7_6 = { f2: 4.95, deck: 4.2, f3: 8.6, tops: { nw: 8.75, main: 11.9, se: 12.6 }, out: 4.1, stilt: 3.5, cuts: [2.0, 39.0] };   // [v6:fix2] the NW seam 2.5 m further SE: the survey cloud's main-roof eave (T.P. 11.9, 2.2 m out) starts at s = 2.0 (first point (18.9, 12.0, 77.2)) and IMG_0814's rake edge says the same
/** PIER7's 2F / 3F bay face: P7WALL 1.5 m inland (SfM points of the glass), from the NW face to the SE end. */
export const BAYFACE6 = [[9.75, 66.54], [18.68, 80.99], [26.43, 90.06], [35.53, 98.05], [48.11, 108.23], [64.76, 123.86]];
/** PIER7's NW street corner (IMG_0799, 0823): the frame sa (the GSI corner), su (along the street face), sn (out to the
 *  street); the deck spans along -3.6..8.0 and out -3.8..0.9 at T.P. 2.45, the stair along 1.2..7.2, the column clusters,
 *  the roof eave T.P. 8.05. */
export const PIER7_NW6 = { sa: [-4.5, 74.9], su: [0.5, 0.866], sn: [-0.866, 0.5], deck: [-3.6, 8.0, 0.9], deckY: 2.45, stair: [1.2, 7.2], cols: [0.6, 7.8], eave: 8.05 };
/** [v6:fix3] The NW block of PIER7 (the radio studio's corner, IMG_0799 / 0823 / 0907 / 0908) in its own frame, solved from the
 *  survey (tools/survey/tri3.py; data/survey/minami/picks.json `picks_fix3`): origin K = the 1F shop's NW / street corner
 *  (bearings from 0907 + 0799 + 0823, 0.01 m residual), ea = inland along the NW face (bearing 61 deg), eb = along the street
 *  face (bearing 151 deg), y = T.P.  The 1F shop is 8.15 m (NW face: 4.87 m glass, then plaster with a side door) by 11.8 m
 *  (street face: 4.7 m glass, then timber behind the stair); its flat roof is a terrace (slab top 5.3) railed 0.98 m;
 *  the studio (glass box, head 8.0) is set 4.48 m back from the NW face; the swept roof is a 11.7 x 12.1 m square whose
 *  eave corners were triangulated in three views (8.3 / 8.8 / 8.3 m: the GSI corner is its street tip); the stair
 *  (2.4 m wide, 15 risers, T.P. 2.35 -> 5.3) climbs along the street face between two column clusters (feet bearings
 *  from three views); the timber hall wall carries the 「PIER 7」 lettering (cut on its plane a = 0 in 0908). */
export const NW7 = {
  K: [-1.98, 71.37], ea: [0.876, -0.482], eb: [0.482, 0.876],
  deck: 2.35, sill: 2.45, slab: 5.3, slabBot: 4.9, rail: 0.98,
  shop: { a1: 8.15, glassA: 4.87, glassB: 4.7, b1: 11.8 },
  studio: { a0: 0.5, a1: 6.25, b0: 4.48, b1: 11.5, head: 8.0 },
  roof: { a0: -3.8, a1: 7.9, b0: 2.5, b1: 14.6, eave: [8.3, 8.8, 9.0, 8.3], th: 0.24, rise: 0.9 },
  stair: { a0: -2.4, a1: 0, b0: 4.7, b1: 9.3, n: 15 },
  cols: [[-2.8, 4.7], [-2.9, 10.0]], hall: { b0: 6.05, b1: 11.5, top: 7.8 }, letters: { b0: 6.1, b1: 9.05, y0: 5.38, y1: 6.93 }, slabEnd: 4.56,
  board: { a: -1.6, b: 10.8, w: 1.35, y0: 2.55, y1: 3.65, top: 4.0 },
  seam: 12.4, deckRect: { a0: -4.6, a1: 1.6, b0: -1.8, b1: 12.5 },
};
/** NW7 frame -> ENU [x, z]. */
export const nwA = (a, b) => [NW7.K[0] + NW7.ea[0] * a + NW7.eb[0] * b, NW7.K[1] + NW7.ea[1] * a + NW7.eb[1] * b];
/** [v6:fix3] The 1F footprint of the part of PIER7 SE of the NW shop (the shop itself is NW7, built in buildPier7Photos): from the street
 *  face at b = 11.8 along that line to the bay face, then the bay face and the SE end. */
export const P7_1F6 = [[50.6, 132.6], [4.1, 89.8], [0.5 + 3.29, 83.56 - 1.9 + 0.0], [15.21, 75.38], [18.68, 80.99], [26.43, 90.06], [35.53, 98.05], [48.11, 108.23], [64.76, 123.86], [59.9, 131], [54.8, 126.8]];
/** PIER7's footprint with that bay face (GSI's street side and ends). */
export const P7POLY6 = [[50.6, 132.6], [4.1, 89.8], [-4.5, 74.9], ...BAYFACE6, [59.9, 131], [54.8, 126.8]];
/** [v6:fix2] The 港町ブルース monument from IMG_0893 alone: c = the plaque plane's centre, n = its normal (to the viewer), u = its right; plinth (front = 0.29 m in front of the plaque plane). */
export const MON6 = { c: [132.18, 64.92], n: [-0.44, 0.898], u: [0.898, 0.44], gy: 1.9, plinth: { len: 2.97, dep: 1.1, h: 0.46, fw: 1.56, fh: 0.81, front: 0.286 } };
export const KONBINI = { poly: [[-80.8, 36], [-70.3, 32.3], [-62, 49.5], [-72.5, 53.3]], front: 1, brick: 2, pole: [-39.5, 49.2], poleFoot: 2.38 };   // [v6:fix1] the pole sign triangulated from IMG_0829 + 0822 (rays 0.07 m apart): base (-39.5, 49.2), panel T.P. 9.73-12.3

const lerp = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
function edgesOf(poly, fn) {
  const P = openRing(poly), sign = Math.sign(signedArea(P)) || 1;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.3) continue; const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]; fn(a, b, len, sign > 0 ? [u[1], -u[0]] : [-u[1], u[0]], u, i); }
}
const inPoly = (x, z, poly) => { let c = false; const P = openRing(poly); for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
/** Clip a ring to lo <= (p - o)·u <= hi. */
export function clipAxis(ring, o, u, lo, hi) {
  const pr = (p) => (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1];
  const clip = (R, keep) => { const out = []; for (let i = 0; i < R.length; i++) { const p = R[i], q = R[(i + 1) % R.length], kp = keep(pr(p)), kq = keep(pr(q)); if (kp.in) out.push(p); if (kp.in !== kq.in) { const t = kp.d / (kp.d - kq.d); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } return out; };
  return clip(clip(openRing(ring), (v) => ({ in: v >= lo, d: v - lo })), (v) => ({ in: v <= hi, d: hi - v }));
}
const ry = (n) => Math.atan2(n[0], n[1]);
/** [v5:detail] A paving sheet draped over the ground inside polygon P (1 m cells, uv = metres / 8). */
export function drapeGeo(P, yfn, G = 1.0, uvf = null) {
  const o = obbOf(P), pos = [], uv = [], idx = [], nu = Math.ceil(o.d / G) + 1, nv = Math.ceil(o.w / G) + 1, id = new Map();
  const ptAt = (i, j) => [o.cx + o.ux * (-o.d / 2 - G / 2 + i * G) - o.uz * (-o.w / 2 - G / 2 + j * G), o.cz + o.uz * (-o.d / 2 - G / 2 + i * G) + o.ux * (-o.w / 2 - G / 2 + j * G)];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const q = [ptAt(i, j), ptAt(i + 1, j), ptAt(i + 1, j + 1), ptAt(i, j + 1)], c = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
    if (!inPoly(c[0], c[1], P)) continue;
    const vi = q.map(([x, z], t2) => { const key = (i + (t2 === 1 || t2 === 2 ? 1 : 0)) + ',' + (j + (t2 >= 2 ? 1 : 0)); if (!id.has(key)) { id.set(key, pos.length / 3); pos.push(x, yfn(x, z), z); if (uvf) uv.push(...uvf(x, z)); else uv.push(x / 8, z / 8); } return id.get(key); });
    idx.push(vi[0], vi[2], vi[1], vi[0], vi[3], vi[2]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  if (g.attributes.normal.count && g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let t2 = 0; t2 < ix.length; t2 += 3) { const tmp = ix[t2 + 1]; ix[t2 + 1] = ix[t2 + 2]; ix[t2 + 2] = tmp; } g.computeVertexNormals(); }
  return g;
}

/** Materials and painted textures (cached on ctx). */
export function mats5(ctx) {
  if (ctx.__m5) return ctx.__m5;
  const t = (c, o) => ctx.mat.toon(c, o);
  const tex = (key, w, h, fn) => paint(ctx, 'p5-' + key, w, h, fn, [1, 1]);
  const boards = (key, base, line, vertical, pitch, knots = 0) => tex(key, 256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = ctx.rng('p5' + key);
    for (let i = 0; i < w; i += pitch) { g.fillStyle = line; if (vertical) g.fillRect(i, 0, 1.5, h); else g.fillRect(0, i, w, 1.5); g.globalAlpha = 0.12; g.fillStyle = r() < 0.5 ? '#ffffff' : '#000000'; if (vertical) g.fillRect(i + 2, 0, pitch - 3, h); else g.fillRect(0, i + 2, w, pitch - 3); g.globalAlpha = 1; }
    for (let i = 0; i < knots; i++) { g.fillStyle = 'rgba(90,60,35,0.45)'; g.beginPath(); g.ellipse(r() * w, r() * h, 2 + r() * 2, 1.5, 0, 0, 7); g.fill(); }
  });
  const T = {
    wall: tex('wall', 256, 256, (g, w, h) => {   // board-formed seawall concrete: form panels, tie holes, run-off streaks
      g.fillStyle = C5.wall; g.fillRect(0, 0, w, h);
      const r = ctx.rng('p5wall');
      for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 128) { g.fillStyle = r() < 0.5 ? '#a8a7a1' : '#9d9c96'; g.fillRect(x + 1, y + 1, 126, 62); for (const [tx, ty] of [[24, 16], [104, 16], [24, 48], [104, 48]]) { g.fillStyle = '#7f7e7a'; g.fillRect(x + tx, y + ty, 3, 3); } }
      g.globalAlpha = 0.18; for (let i = 0; i < 26; i++) { g.fillStyle = r() < 0.6 ? '#5f5e5a' : '#c4c3bd'; g.fillRect(r() * w, r() * h * 0.3, 2 + r() * 4, 40 + r() * 140); } g.globalAlpha = 1;
    }),
    dbrown: boards('dbrown', C5.dbrown, '#3f2d22', true, 10),
    cedar: boards('cedar', C5.cedar, '#a6855b', false, 18, 26),
    gtimber: boards('gtimber', C5.gtimber, '#7c766d', false, 16, 10),
    corr: boards('corr', C5.corr, '#c9cbc8', true, 6),
    corrH: boards('corrH', C5.corr, '#c9cbc8', false, 6),
    rib: boards('rib', C5.rib, '#9fa09c', true, 22),
    wboard: boards('wboard', C5.wboard, '#d4d7d5', true, 9),
    charcoal: boards('charcoal', C5.charcoal, '#3e4044', true, 12),
    timberDark: boards('timberDark', C5.timberDark, '#3f2d21', true, 9),
    comp: boards('comp', C5.comp, '#6f4436', false, 20),
    deck: boards('deck', C5.deck, '#7a5c45', false, 14),
    paver: tex('paver', 512, 512, (g, w, h) => {   // [v6:fix1] 8 m tile: 0.444 x 0.148 m pavers in running bond (IMG_0809 close-up: ~0.16 x 0.45 m, long side along the bands), grey-beige mix
      g.fillStyle = '#857f78'; g.fillRect(0, 0, w, h);
      const r = ctx.rng('p5paver'), px = w / 8, cols = ['#a59f96', '#9b958c', '#ada79d', '#958f87', '#a0a09a', '#b1aba1'], bl = 8 / 18, bw = 8 / 54;
      for (let row = 0; row < 54; row++) { const y = row * bw * px, off = (row % 2) * bl / 2 * px; for (let x = -off; x < w; x += bl * px) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x + 0.8, y + 0.6, bl * px - 1.6, bw * px - 1.2); } }
    }),
    sett: tex('sett', 128, 128, (g, w, h) => { g.fillStyle = '#5f5f62'; g.fillRect(0, 0, w, h); const r = ctx.rng('p5sett'); for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { g.fillStyle = ['#7d7c7e', '#87868a', '#737275', '#8e8d90'][Math.floor(r() * 4)]; g.fillRect(x + 1.5, y + 1.5, 13, 13); } }),
    grating: tex('grating', 128, 128, (g, w, h) => {   // [v6:fix1] the cage's light-grey fine perforated sheet (IMG_0808 close-up: vertical slots ~4 cm x 11 cm on a 9 x 14 cm pitch), 0.64 m per tile
      g.fillStyle = '#c3c7c8'; g.fillRect(0, 0, w, h); g.fillStyle = '#5d6366';
      for (let y2 = 0; y2 < h; y2 += 22) for (let x2 = 0; x2 < w; x2 += 13) g.fillRect(x2 + 4, y2 + 4, 5, 15);
    }),
    net: tex('net', 64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#1e2124'; g.lineWidth = 1.6; for (let i = -h; i < w + h; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); } }),
    mesh: tex('mesh', 128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = C5.mesh; g.lineWidth = 3; for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }),
    painting: tex('painting', 512, 256, (g, w, h) => {   // the bay painting on PIER7's SE block: sky, hills, the bay and boats
      const sky = g.createLinearGradient(0, 0, 0, h * 0.5); sky.addColorStop(0, '#9fc4e4'); sky.addColorStop(1, '#e4eef2'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = '#5e8a58'; g.beginPath(); g.moveTo(0, h * 0.55); for (let x = 0; x <= w; x += 16) g.lineTo(x, h * (0.42 + 0.1 * Math.sin(x / 70) + 0.05 * Math.sin(x / 23))); g.lineTo(w, h * 0.6); g.lineTo(0, h * 0.6); g.fill();
      g.fillStyle = '#3d74a8'; g.fillRect(0, h * 0.58, w, h * 0.42); g.fillStyle = '#6aa0cf'; for (let i = 0; i < 9; i++) g.fillRect(i * 57, h * (0.66 + (i % 3) * 0.08), 30, 3);
      for (const [x, c] of [[90, '#ffffff'], [230, '#f0e2c4'], [370, '#ffffff']]) { g.fillStyle = c; g.beginPath(); g.moveTo(x, h * 0.7); g.lineTo(x + 60, h * 0.7); g.lineTo(x + 50, h * 0.76); g.lineTo(x + 8, h * 0.76); g.fill(); g.fillRect(x + 20, h * 0.63, 18, h * 0.07); }
      g.strokeStyle = '#2f3c4a'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    }),
    stripes: tex('stripes', 256, 64, (g, w, h) => {   // a generic convenience-store fascia: white with orange / green / red bands (no logo)
      g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ef7d2b'; g.fillRect(0, h * 0.18, w, h * 0.16); g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.34, w, h * 0.06); g.fillStyle = '#2a9a4e'; g.fillRect(0, h * 0.4, w, h * 0.16); g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.56, w, h * 0.06); g.fillStyle = '#d6343a'; g.fillRect(0, h * 0.62, w, h * 0.16);
    }),
    brick: tex('brick', 128, 128, (g, w, h) => { g.fillStyle = '#6e3a2c'; g.fillRect(0, 0, w, h); const r = ctx.rng('p5brick'); for (let y = 0; y < h; y += 8) for (let x = -((y / 8) % 2) * 8; x < w; x += 16) { g.fillStyle = ['#8d4a38', '#97543f', '#834434'][Math.floor(r() * 3)]; g.fillRect(x + 1, y + 1, 14, 6); } }),
  };
  const mm = (key, o = { paint: 0.04 }) => mapMat(ctx, 'toon', '#ffffff', T[key], o);
  const m = {
    wall: mm('wall'), dbrown: mm('dbrown'), cedar: mm('cedar'), gtimber: mm('gtimber'), corr: mm('corr'), corrH: mm('corrH'), rib: mm('rib'),
    wboard: mm('wboard'), charcoal: mm('charcoal'), timberDark: mm('timberDark'), comp: mm('comp'), deck: mm('deck', { paint: 0.04, side: 'double' }),
    paver: mm('paver', { paint: 0.02, polygonOffset: -2 }), sett: mm('sett', { paint: 0.02, polygonOffset: -3 }), brick: mm('brick'),
    net: mapMat(ctx, 'decal', '#ffffff', T.net, { transparent: true, alphaTest: 0.4, side: 'double' }),
    mesh: mapMat(ctx, 'decal', '#ffffff', T.mesh, { transparent: true, alphaTest: 0.4, side: 'double' }), grating: mapMat(ctx, 'toon', '#ffffff', T.grating, { paint: 0.02, side: 'double' }),
    painting: mapMat(ctx, 'toon', '#ffffff', T.painting, { paint: 0 }), stripes: mapMat(ctx, 'toon', '#ffffff', T.stripes, { paint: 0 }),
    stilt: t(C5.stilt, { paint: 0.02 }), rail: t(C5.rail, { paint: 0 }), soffit: t(C5.soffit, { paint: 0.04, side: 'double' }),
    roofLight: t(C5.roofLight, { paint: 0.03, side: 'double' }), roofDark: t(C5.roofDark, { paint: 0.03, side: 'double' }), fascia: t(C5.fascia, { paint: 0.02 }),
    khaki: t(C5.khaki, { paint: 0.05 }), steel: t(C5.steel, { paint: 0 }), white: t('#f1f1ee', { paint: 0.03 }), whiteD: t('#f1f1ee', { paint: 0.03, side: 'double' }), concrete: t('#b4b2ab', { paint: 0.06 }),
    darkConcrete: t('#4f555c', { paint: 0.03 }), greySoffit: t('#c4c6c4', { paint: 0.03, side: 'double' }), lawn: t('#7d9f58', { paint: 0.08 }), soil: t('#4f4a3e', { paint: 0.08 }), trunk: t('#6e5646', { paint: 0 }),
    leaf: t('#6f9a5a', { paint: 0.07 }), leafB: t('#86ad6a', { paint: 0.07 }), black: t('#26272a', { paint: 0 }), yellow: t(C5.yellow, { paint: 0 }),
    purple: t(C5.purple, { paint: 0.02 }), rust: t(C5.rust, { paint: 0.03 }), aqua: t(C5.aqua, { paint: 0.02 }), grey: t('#8f9396', { paint: 0.03 }), post: t(C5.post, { paint: 0.05 }),
    cgray: t('#a9a7a1', { paint: 0.04 }), navy: t('#39425a', { paint: 0.03 }), cage: t('#d3d6d3', { paint: 0.03 }), cageD: t('#d3d6d3', { paint: 0.03, side: 'double' }), galv: t('#a4acb1', { paint: 0.05 }), galvD: t('#8e979c', { paint: 0.05 }), pipe: t('#eceeed', { paint: 0 }),
    burgundy: t('#4a2433', { paint: 0.03 }), orange: t('#e2572e', { paint: 0.02 }), asphalt: t('#56575c', { paint: 0.03, polygonOffset: -1 }),
    roadWhite: t('#efefe9', { paint: 0.01, polygonOffset: -3 }), pv: t('#2b3444', { paint: 0 }), red: t('#c8372d', { paint: 0.02 }),
    glass: nightMat(ctx, '#8aa4b8', '#ffdcaa', 1.3), glassDim: nightMat(ctx, '#6c7a84', '#ffd9a0', 1.5), glassWarm: nightMat(ctx, '#9fb2bd', '#ffd9a0', 1.45), glassShop: nightMat(ctx, '#8e9ea6', '#ffe2b0', 1.6),
    bulb: nightMat(ctx, '#efe6c8', '#ffd890', 2.4), lamp: nightMat(ctx, '#e8e6dc', '#fff0d0', 2.2), neonBlue: nightMat(ctx, '#3d7fd0', '#5cc8ff', 2.4), neonRed: nightMat(ctx, '#d84a5a', '#ff6f86', 2.4),
  };
  ctx.__m5 = m;
  return m;
}

/** A self-lit textured material (neon and lit sign faces), cached per texture. */
const _glow = new Map();
function glowMat(ctx, tex, k = 1.25) { const key = tex.uuid + '|' + k; if (!_glow.has(key)) { const mm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, toneMapped: false, depthWrite: false }); mm.color.setScalar(k); _glow.set(key, mm); } return _glow.get(key); }
/** A text plane; bg makes it an opaque board. */
function sign(ctx, k, text, w, h, x, y, z, rotY, { color = '#2b2a33', bg = null, font = FONT.sans, weight = 900, size = 0.72, emissive = false } = {}) {
  const tex = textTex(ctx, text, { w: 1024, h: Math.max(64, Math.round(1024 * h / w)), color, bg, font, weight, size });
  const mat = emissive ? glowMat(ctx, tex) : mapMat(ctx, bg ? 'toon' : 'decal', '#ffffff', tex, bg ? { paint: 0 } : { transparent: true, alphaTest: 0.3 });
  return k.plane(w, h, mat, [x, y, z], [0, rotY, 0]);
}

/** A low gable roof over a quad-ish footprint: ridge along the long axis, deep eaves with a timber soffit, white fascia and
 *  exposed rafters. eaveY = the eave height at the wall line. */
export function gableRoof(k, m, poly, eaveY, { eave = 2.0, pitch = 0.16, light = 'roofLight', dark = 'roofDark', rafters = 1.2, darkSide = null, along = null } = {}) {
  // [v6:rebuild] along: force the ridge direction (unit [x, z]); otherwise the footprint's long axis
  const o = along ? obbAlong(poly, along) : obbOf(poly), hw = o.w / 2 + eave, hl = o.d / 2 + eave, rise = hw * pitch, slope = Math.hypot(hw, rise), a = Math.atan2(rise, hw);
  const vx = -o.uz, vz = o.ux;   // across the ridge
  for (const sd of [-1, 1]) {
    const cx = o.cx + vx * sd * hw / 2, cz = o.cz + vz * sd * hw / 2, y = eaveY + rise / 2 - eave * pitch;
    const darkHere = darkSide === null ? sd > 0 : sd === darkSide;
    const top = k.box(slope, 0.16, hl * 2, darkHere ? m[dark] : m[light], [cx, y + 0.12, cz]); top.rotation.order = 'YXZ'; top.rotation.set(0, o.rotY, sd * a);
    const sof = k.box(slope, 0.1, hl * 2, m.soffit, [cx, y - 0.03, cz]); sof.rotation.order = 'YXZ'; sof.rotation.set(0, o.rotY, sd * a);
    // fascia along the eave edge
    const ex = o.cx + vx * sd * hw, ez = o.cz + vz * sd * hw;
    k.box(0.12, 0.42, hl * 2, m.fascia, [ex, eaveY - eave * pitch, ez], [0, o.rotY, 0]);
    // rafters from the wall line out to the fascia
    if (rafters) for (let s = -hl + 0.6; s <= hl - 0.6; s += rafters) {
      const mx = o.cx + vx * sd * (o.w / 2 + eave / 2) + o.ux * s, mz = o.cz + vz * sd * (o.w / 2 + eave / 2) + o.uz * s;
      k.box(eave + 0.4, 0.22, 0.09, m.fascia, [mx, eaveY - eave * pitch / 2 - 0.2, mz], [0, o.rotY, 0]);
    }
  }
  // gable ends: triangles closing the roof void
  const tri = new THREE.BufferGeometry(), P = [];
  for (const se of [-1, 1]) {
    const bx = o.cx + o.ux * se * (o.d / 2), bz = o.cz + o.uz * se * (o.d / 2);
    P.push(bx + vx * (o.w / 2), eaveY + eave * pitch * 0 - 0.05, bz + vz * (o.w / 2), bx - vx * (o.w / 2), eaveY - 0.05, bz - vz * (o.w / 2), bx, eaveY + (o.w / 2) * pitch, bz);
  }
  tri.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); tri.computeVertexNormals();
  k.mesh(tri, m.whiteD);
  return { ridgeY: eaveY + rise - eave * pitch, o };
}

/** [v6:fix1] A low hip roof over a quad (corner heights hs, the ridge point `rise` above their mean): dark top, timber soffit
 *  0.3 m under it, a dark fascia all round. */
function hipRoof(k, m, P, hs, rise, th = 0.3) {
  const cx = P.reduce((a, p) => a + p[0], 0) / 4, cz = P.reduce((a, p) => a + p[1], 0) / 4, cy = hs.reduce((a, h) => a + h, 0) / 4 + rise;
  const top = [], bot = [], fas = [];
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], ha = hs[i], hb = hs[(i + 1) % 4];
    top.push(cx, cy, cz, a[0], ha, a[1], b[0], hb, b[1]); bot.push(cx, cy - th, cz, b[0], hb - th, b[1], a[0], ha - th, a[1]);
    fas.push(a[0], ha - th, a[1], b[0], hb - th, b[1], b[0], hb, b[1], a[0], ha - th, a[1], b[0], hb, b[1], a[0], ha, a[1]);
  }
  for (const [arr, mat] of [[top, m.roofDark], [bot, m.soffit], [fas, m.charcoal]]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(arr.length / 3 * 2).fill(0), 2)); g.computeVertexNormals(); k.mesh(g, mat); }
}
/** [v6:rebuild] An oriented box of a ring with its length along the unit vector u (obbOf's fields). */
function obbAlong(poly, u) {
  const P = openRing(poly), v = [-u[1], u[0]], pu = P.map((p) => p[0] * u[0] + p[1] * u[1]), pv = P.map((p) => p[0] * v[0] + p[1] * v[1]);
  const u0 = Math.min(...pu), u1 = Math.max(...pu), v0 = Math.min(...pv), v1 = Math.max(...pv), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return { cx: u[0] * cu + v[0] * cv, cz: u[1] * cu + v[1] * cv, d: u1 - u0, w: v1 - v0, ux: u[0], uz: u[1], rotY: Math.atan2(u[0], u[1]) };
}
/** String lights: warm bulbs every `step` m along a sagging line between a and b ([x, y, z]). */
function stringLights(k, m, a, b, step = 0.7, sag = 0.25) {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]); const n = Math.max(2, Math.round(len / step));
  // [v5:detail] small bulbs on a visible dark wire (IMG_0815 / 0840: fine festoons, not lanterns)
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const f = i / n, y = a[1] + (b[1] - a[1]) * f - sag * 4 * f * (1 - f), p = [a[0] + (b[0] - a[0]) * f, y, a[2] + (b[2] - a[2]) * f];
    k.box(0.045, 0.06, 0.045, m.bulb, [p[0], p[1] - 0.04, p[2]]);
    if (prev) { const dx = p[0] - prev[0], dy = p[1] - prev[1], dz = p[2] - prev[2], h = Math.hypot(dx, dz), w = k.box(0.014, 0.014, Math.hypot(h, dy), m.black, [(p[0] + prev[0]) / 2, (p[1] + prev[1]) / 2, (p[2] + prev[2]) / 2]); w.rotation.order = 'YXZ'; w.rotation.set(-Math.atan2(dy, h), Math.atan2(dx, dz), 0); w.castShadow = false; }
    prev = p;
  }
}
/** A stainless rail along a polyline: posts, top rail, three wires, optional lights. */
function railAlong(k, m, pts, y, { lights = true, h = 1.1 } = {}) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], s = seg(a, b);
    barAlong(k, a, b, y + h, 0.06, 0.06, m.rail);
    for (const f of [0.35, 0.6, 0.85]) barAlong(k, a, b, y + h * f, 0.02, 0.02, m.rail);
    for (let d = 0; d <= s.len; d += 1.6) k.box(0.05, h, 0.05, m.rail, [a[0] + s.ux * d, y + h / 2, a[1] + s.uz * d]);
    if (lights) stringLights(k, m, [a[0], y + h + 0.02, a[1]], [b[0], y + h + 0.02, b[1]], 0.8, 0.12);
  }
}
/** A young tree: a thin staked trunk forking into a few branches, an airy crown of small leaf clumps with gaps
 *  ([v5:detail] the plaza and street trees are young zelkovas / maples, IMG_0801, 0806, 0828: not a lollipop). */
function youngTree(k, m, x, y, z, s = 1, r = Math.random) {
  k.cyl(0.06 * s, 0.09 * s, 2.4 * s, m.trunk, [x, y + 1.2 * s, z], null, 6);
  k.cyl(0.025, 0.025, 1.6, m.trunk, [x + 0.25, y + 0.8, z], [0, 0, 0.08], 4);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = i * 2 * Math.PI / n + r() * 0.6, tilt = 0.35 + r() * 0.25, L = (1.4 + r() * 0.6) * s;
    const bx = Math.sin(tilt) * Math.cos(a) * L, bz = Math.sin(tilt) * Math.sin(a) * L, by = Math.cos(tilt) * L;
    const br = k.cyl(0.025 * s, 0.045 * s, L, m.trunk, [x + bx / 2, y + 2.2 * s + by / 2, z + bz / 2], null, 5); br.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    for (let j = 0; j < 2; j++) { const t2 = 0.7 + j * 0.3, rr = (0.24 + r() * 0.1) * s; const g = new THREE.IcosahedronGeometry(rr, 0); k.mesh(g, (i + j) % 2 ? m.leaf : m.leafB, [x + bx * t2 + (r() - 0.5) * 0.5 * s, y + 2.2 * s + by * t2 + (r() - 0.3) * 0.4 * s, z + bz * t2 + (r() - 0.5) * 0.5 * s], [r(), r(), 0], [1, 0.75, 1]); }
  }
  k.mesh(new THREE.IcosahedronGeometry(0.34 * s, 0), m.leafB, [x, y + 3.9 * s, z], [r(), r(), 0], [1, 0.8, 1]);
}
/** [v6:fix1] A broad rounded crown on a forked trunk (the plaza's young zelkovas, IMG_0803 / 0807: crown 3.5-4.5 m wide, 2-2.6 m
 *  deep, its top a measured T.P.): leaf clumps packed in an ellipsoid, the trunk forking into four limbs under it. */
function crownTree(k, m, x, y, z, { top, w, h }, r = Math.random) {
  const cy = top - h / 2, base = cy - h / 2, rx = w / 2, ry2 = h / 2;
  k.cyl(0.07, 0.1, base - y + 0.5, m.trunk, [x, y + (base - y + 0.5) / 2, z], null, 6);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.5 + r() * 0.5, tx = Math.cos(a) * rx * 0.55, tz = Math.sin(a) * rx * 0.55, y0 = base - 0.1, y1 = cy + h * 0.1, L = Math.hypot(tx, y1 - y0, tz);
    const br = k.cyl(0.03, 0.05, L, m.trunk, [x + tx / 2, (y0 + y1) / 2, z + tz / 2], null, 5); br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(tx, y1 - y0, tz).normalize());
  }
  const n = 24;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, ph = i * 2.399963, rr = Math.sqrt(u) * 0.78, lx = Math.cos(ph) * rr * rx, lz = Math.sin(ph) * rr * rx, ly = (r() - 0.45) * ry2 * 1.5 * (1 - rr * 0.35) + (rr < 0.3 ? ry2 * 0.2 : 0);
    const s = (0.5 + r() * 0.3) * Math.min(rx, 1.5) * 0.46;
    const yy = Math.min(top - s * 0.6, Math.max(base + s * 0.5, cy + ly));
    k.mesh(new THREE.IcosahedronGeometry(s, 0), i % 2 ? m.leaf : m.leafB, [x + lx, yy, z + lz], [r() * 3, r() * 3, 0], [1, 0.8, 1]);
  }
  k.mesh(new THREE.IcosahedronGeometry(Math.min(rx, 1.5) * 0.5, 0), m.leafB, [x, top - Math.min(rx, 1.5) * 0.4, z], [r(), r(), 0], [1, 0.75, 1]);
}
/** [v6:fix1] A tube between two 3D points (pipe railings, rack frames). */
function pipe(k, mat, a, b, rad = 0.025) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(), c = k.cyl(rad, rad, L, mat, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], null, 6);
  c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); c.castShadow = false; return c;
}
/** [v6:fix1] A solid annular sector (x, z centre; radii r0 < r1; angles t0..t1 deg, x = cx + r cos t, z = cz + r sin t) from y0 to y1:
 *  top, outer and inner walls and, for an open arc, the two end faces. Flat-shaded, double sided material expected. */
function arcSolid(cx, cz, r0, r1, t0, t1, y0, y1, { seg = 5 } = {}) {
  const pos = [], uv = [], a0 = t0 * Math.PI / 180, a1 = t1 * Math.PI / 180, N = Math.max(2, Math.ceil(Math.abs(t1 - t0) / seg)), P = (r, t, y) => [cx + r * Math.cos(t), y, cz + r * Math.sin(t)];
  const quad = (A, B, C, D, flip) => { const o = flip ? [A, C, B, A, D, C] : [A, B, C, A, C, D]; for (const q of o) pos.push(...q); for (let i = 0; i < 6; i++) uv.push(0, 0); };
  for (let i = 0; i < N; i++) {
    const ta = a0 + (a1 - a0) * i / N, tb = a0 + (a1 - a0) * (i + 1) / N;
    quad(P(r0, ta, y1), P(r1, ta, y1), P(r1, tb, y1), P(r0, tb, y1), false);
    quad(P(r1, ta, y0), P(r1, tb, y0), P(r1, tb, y1), P(r1, ta, y1), false);
    quad(P(r0, ta, y0), P(r0, tb, y0), P(r0, tb, y1), P(r0, ta, y1), true);
  }
  if (Math.abs(t1 - t0) < 359.9) { quad(P(r0, a0, y0), P(r1, a0, y0), P(r1, a0, y1), P(r0, a0, y1), false); quad(P(r0, a1, y0), P(r1, a1, y0), P(r1, a1, y1), P(r0, a1, y1), true); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
/** A NAIWAN totem: a tall board with a pointed crown, the name in white. */
function totem(ctx, k, m, x, y, z, rotY, { mat, title, sub, h = 3.0, w = 1.15, feature = null, logo = null, pointed = true }) {
  const g = k.group([x, y, z], rotY), kk = ctx.kit(g);
  if (feature) ctx.features?.add('minami', feature, [x, y + h * 0.62, z]);   // [v6:survey] the glyph centre
  kk.box(w, h, 0.28, mat, [0, h / 2, 0]);
  // [v6:fix1] the NAIWAN totems are flat-topped tablets (IMG_0823 / 0907 / 0824: 迎 1.56 m, PIER7 ~1.8 m); no cone cap
  if (pointed) { const crown = new THREE.ConeGeometry(w * 0.62, 0.45, 4); kk.mesh(crown, mat, [0, h + 0.2, 0], [0, Math.PI / 4, 0], [1, 1, 0.3]); }
  else { const gb = 0.13 * w / 0.9, tg = new THREE.CylinderGeometry(1, 1, 1, 3); tg.rotateX(-Math.PI / 2); kk.mesh(tg, mat, [0, h + gb * 0.5, 0], [0, 0, 0], [w / 1.732, gb / 1.5, 0.28]); }   // [v6:fix3] the tablets carry a shallow gable (IMG_0907 close-up: peak 0.12 m over 0.9 m, the five-sided house shape), not a flat top
  for (const f of [1, -1]) {
    let tt;
    if (logo === 'oval') tt = ctx.tex.draw(256, 320, (c, W, H) => {   // [v6:fix3] the NAIWAN maze oval as IMG_0907 shows it: an outer ring open at the top right, a second ring open at the bottom left, a disc in a loop above a hooked stem
      c.clearRect(0, 0, W, H); c.strokeStyle = '#f1efe9'; c.fillStyle = '#f1efe9'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 15;
      const cx = W / 2, cy = H * 0.52;
      c.beginPath(); c.ellipse(cx, cy, W * 0.43, H * 0.43, 0, -1.35, -1.35 + 2 * Math.PI - 0.4); c.stroke();
      c.beginPath(); c.ellipse(cx, cy, W * 0.31, H * 0.325, 0, 1.2 + 0.0, 1.2 + 2 * Math.PI - 0.7); c.stroke();
      c.beginPath(); c.ellipse(cx - 2, cy - H * 0.13, W * 0.105, H * 0.085, 0, 0, 7); c.fill();
      c.beginPath(); c.ellipse(cx - 2, cy - H * 0.115, W * 0.19, H * 0.145, 0, 0.2, 2 * Math.PI - 0.2); c.stroke();
      c.beginPath(); c.moveTo(cx - W * 0.15, cy - H * 0.04); c.lineTo(cx - W * 0.15, cy + H * 0.15); c.quadraticCurveTo(cx - W * 0.15, cy + H * 0.27, cx - W * 0.02, cy + H * 0.26); c.lineTo(cx + W * 0.04, cy + H * 0.1); c.stroke();
      c.beginPath(); c.moveTo(cx + W * 0.09, cy + H * 0.02); c.lineTo(cx + W * 0.09, cy + H * 0.2); c.stroke();
    }, { key: 'p5-ovallogo3' });
    else tt = textTex(ctx, title, { w: 256, h: 256, color: '#f4f2ea', font: FONT.brush, weight: 700, size: 0.8 });
    kk.plane(w * 0.85, logo === 'oval' ? w * 1.06 : w * 0.85, mapMat(ctx, 'decal', '#ffffff', tt, { transparent: true, alphaTest: 0.3 }), [0, h * 0.62, f * 0.15], [0, f > 0 ? 0 : Math.PI, 0]);
    const st = textTex(ctx, sub, { w: 512, h: 128, color: '#f4f2ea', font: FONT.sans, weight: 900, size: 0.7 });
    kk.plane(w * 0.85, w * 0.22, mapMat(ctx, 'decal', '#ffffff', st, { transparent: true, alphaTest: 0.3 }), [0, h * 0.18, f * 0.15], [0, f > 0 ? 0 : Math.PI, 0]);
    const nw = ctx.tex.draw(256, 128, (c, W2, H2) => { c.clearRect(0, 0, W2, H2); c.fillStyle = '#f4f2ea'; c.font = `900 ${H2 * 0.46}px ${FONT.sans}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText('NAI', W2 / 2, H2 * 0.48); c.fillText('WAN', W2 / 2, H2 * 0.96); }, { key: 'p5-naiwan2' });   // [v6:fix3] two lines (IMG_0907: NAI over WAN)
    kk.plane(w * 0.34, w * 0.17, mapMat(ctx, 'decal', '#ffffff', nw, { transparent: true, alphaTest: 0.3 }), [0, h * 0.9, f * 0.15], [0, f > 0 ? 0 : Math.PI, 0]);
  }
  return g;
}

// ======================================================================================================== PIER7
/** PIER7's bay side and ends ([v5:photos]); called from buildMinami's PIER7 block with its storey heights. */
export function buildPier7Photos(ctx, k, { L, P, g0, f2, f3, T, tops, mid = null }) {
  const m = mats5(ctx), phys = ctx.physics, out = {};
  const quay = (x, z) => Math.max(1.9, L.heightAt(x, z));
  // ---- the seawall (the bay-side ground storey), the terrace on its crest, the stilted deck in front
  const dY = PIER7_6.deck;   // [v6:rebuild] the bay deck on the wall: T.P. 4.2 (IMG_0802, 0817 cuts)
  const W = P7WALL, nW = [];
  for (let i = 1; i < W.length; i++) { const s = seg(W[i - 1], W[i]); let n = [s.uz, -s.ux]; if ((n[0] * 0.684 - n[1] * 0.729) < 0) n = [-n[0], -n[1]]; nW.push(n); }
  const nAt = (i) => { const a = nW[Math.max(0, i - 1)], b = nW[Math.min(nW.length - 1, i)]; const v = [a[0] + b[0], a[1] + b[1]], l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
  const DOUT = PIER7_6.out + 0.25, OUT = W.map((p, i) => [p[0] + nAt(i)[0] * DOUT, p[1] + nAt(i)[1] * DOUT]);   // [v6:rebuild] stilts 4.1 m out (SfM)
  // [v6:fix2] the stilts stand 3.5 m apart on ONE continuous line along the deck edge (a fit of IMG_0817's seven columns: pitch 3.5 m, first 1.2 m from the NW end, mean
  // 0.1 m); the old build restarted a 4.2 m pitch on every leg of the wall (irregular gaps up to 6 m, one column too many per leg)
  const legLen = (i) => Math.hypot(OUT[i][0] - OUT[i - 1][0], OUT[i][1] - OUT[i - 1][1]), legCum = [0]; for (let i = 1; i < OUT.length; i++) legCum.push(legCum[i - 1] + legLen(i));
  const stiltDs = (i, withK = false) => { const out2 = []; for (let kk = 0, sK = 1.2; sK < legCum[legCum.length - 1]; kk++, sK = 1.2 + PIER7_6.stilt * kk) if (sK >= legCum[i - 1] && sK < legCum[i]) out2.push(withK ? { d: sK - legCum[i - 1], k: kk } : sK - legCum[i - 1]); return out2; };
  for (let i = 1; i < W.length; i++) {
    const a = W[i - 1], b = W[i], s = seg(a, b), yb = Math.min(quay(a[0], a[1]), quay(b[0], b[1])) - 0.4;
    k.box(0.8, dY - yb, s.len + 0.6, m.wall, [s.x - nW[i - 1][0] * 0.4, (dY + yb) / 2, s.z - nW[i - 1][1] * 0.4], [0, s.rotY, 0]);
    // the stilted deck: timber top, white edge beam, white posts with tie rods back to the wall
    const qa = OUT[i - 1], qb = OUT[i], dq = [lerp(a, qa, 0.5), lerp(b, qb, 0.5)];
    const ds = seg(dq[0], dq[1]);
    k.box(DOUT, 0.28, ds.len + 0.2, m.deck, [ds.x, dY - 0.14, ds.z], [0, ds.rotY, 0]);
    barAlong(k, qa, qb, dY - 0.32, 0.18, 0.5, m.stilt, 0.1);
    const os = seg(qa, qb);
    for (const d of stiltDs(i)) {
      const px = qa[0] + os.ux * d - nW[i - 1][0] * 0.25, pz = qa[1] + os.uz * d - nW[i - 1][1] * 0.25, py = quay(px, pz);
      k.box(0.24, dY - 0.5 - py, 0.24, m.stilt, [px, (dY - 0.5 + py) / 2, pz]);
      const wx = a[0] + s.ux * (d * s.len / os.len), wz = a[1] + s.uz * (d * s.len / os.len);
      const tie = seg([px, pz], [wx, wz]); const yA = dY - 2.2, yB = dY - 0.45, b2 = k.box(0.05, 0.05, Math.hypot(tie.len, yB - yA), m.stilt, [(px + wx) / 2, (yA + yB) / 2, (pz + wz) / 2]); b2.rotation.order = 'YXZ'; b2.rotation.set(-Math.atan2(yB - yA, tie.len), tie.rotY, 0);
      if (i % 2 === 0 && d < 3) { k.cyl(0.09, 0.09, 0.7, m.grey, [px + nW[i - 1][0] * 0.9, py + 0.35, pz + nW[i - 1][1] * 0.9], null, 8); k.box(0.14, 0.12, 0.14, m.lamp, [px + nW[i - 1][0] * 0.9, py + 0.74, pz + nW[i - 1][1] * 0.9]); }
    }
    if (phys?.addWalkBox) { const o = obbOf([a, b, qb, qa]); phys.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, dY, dY - 1); }
  }
  railAlong(k, m, OUT, dY);
  // [v5:detail] festoons swagging between the stilts under the deck edge and a low lamp in every bay at the wall foot
  // (IMG_0802, 0815-0817: the warm swags are the bay side's signature at dusk)
  { const D = detailKit(ctx, k);
    for (let i = 1; i < W.length; i++) {
      const qa = OUT[i - 1], qb = OUT[i], os = seg(qa, qb), pts = [];
      for (const d of stiltDs(i)) pts.push([qa[0] + os.ux * d - nW[i - 1][0] * 0.1, qa[1] + os.uz * d - nW[i - 1][1] * 0.1]);
      for (let j = 1; j < pts.length; j++) stringLights(k, m, [pts[j - 1][0], dY - 0.28, pts[j - 1][1]], [pts[j][0], dY - 0.28, pts[j][1]], 0.28, 0.3);   // [v6:fix1] shallow scallops just under the deck edge (IMG_0815 / 0817: the old swags hung ~0.3 m too low, 0.75 m deep)
      const a = W[i - 1], s = seg(a, W[i]);
      // [v6:fix2] the low lamps stand at every second stilt (IMG_0817: lamps at the feet of columns 8, 10, 12, 14 from the NW end = 7 m apart), 0.6 m off the wall foot
      { const qa2 = OUT[i - 1], os2 = seg(qa2, OUT[i]); for (const { d, k: kk } of stiltDs(i, true)) { if (kk % 2) continue; const px = qa2[0] + os2.ux * d - nW[i - 1][0] * (DOUT - 0.6), pz = qa2[1] + os2.uz * d - nW[i - 1][1] * (DOUT - 0.6); D.bollardLight(px, quay(px, pz), pz, 0.55); } }
    } }
  // terrace on the wall crest between the building's bay face and the wall line
  const bay = BAYFACE6;   // [v6:rebuild]
  const terr = [...bay, ...W.slice(1).reverse()];
  k.mesh(capGeo(terr, dY + 0.02, { tile: 2 }), m.deck);
  if (phys?.addWalkBox) for (let i = 2; i < W.length; i++) { const o = obbOf([W[i - 1], W[i], [W[i][0] - nW[i - 1][0] * 4.2, W[i][1] - nW[i - 1][1] * 4.2], [W[i - 1][0] - nW[i - 1][0] * 4.2, W[i - 1][1] - nW[i - 1][1] * 4.2]]); phys.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, dY, dY - 1); }
  // timber A-frame stands stored under the deck (IMG_0802, 0806)
  for (const [x, z, n] of [[24.8, 88.8, 6], [33.0, 96.6, 5], [11.6, 65.5, 4]]) { const s = seg(W[2], W[3]); for (let j = 0; j < n; j++) { const px = x + s.ux * j * 0.55, pz = z + s.uz * j * 0.55, py = quay(px, pz); for (const sd of [-1, 1]) { const b = k.box(0.07, 1.7, 0.1, m.cedar, [px, py + 0.8, pz + 0], [0, s.rotY + Math.PI / 2, sd * 0.32]); void b; /* [v6:fix1] pale timber (IMG_0815: the racks are light wood A-frames, not white) */ } } }
  out.wall = { line: W, out: OUT };

  // ---- the 2F's dark-brown board band at its head on the bay faces
  edgesOf(mid || clipAxis(P, T.axis.o, T.axis.u, -2.5, 40.6), (a, b, len, n) => {
    if (len < 6 || (n[0] * 0.684 - n[1] * 0.729) < 0.5) return;
    const s = seg(a, b); k.box(0.2, 1.3, len, m.dbrown, [s.x + n[0] * 0.12, f3 - 0.6, s.z + n[1] * 0.12], [0, s.rotY, 0]);
  });
  // ---- the NW pavilion (v6:fix3: rebuilt from the survey, see NW7): a small 1F shop whose flat roof is a railed terrace, the
  //      glass studio set back on it, the stair along the street face between two column clusters, the timber hall wall with the
  //      lettering, all under one swept roof (eaves 8.3 - 9.0, columns to its soffit)
  const ax = T.axis, [cut0, cut1] = PIER7_6.cuts;   // [v6:rebuild]
  const seFull = clipAxis(P, ax.o, ax.u, cut1, 1e3);
  {
    const Z = NW7, A = nwA, RYb = Math.atan2(Z.eb[0], Z.eb[1]), S = Z.shop, ST = Z.studio, RF = Z.roof, SR = Z.stair;
    const cream = ctx.mat.toon('#e6dcc6', { paint: 0.04 }), creamD = ctx.mat.toon('#d9ceb4', { paint: 0.04 });
    const boxAB = (a0, a1, b0, b1, y0, y1, mat) => { const [x, z] = A((a0 + a1) / 2, (b0 + b1) / 2); return k.box(a1 - a0, y1 - y0, b1 - b0, mat, [x, (y0 + y1) / 2, z], [0, RYb, 0]); };
    const ringAB = (a0, a1, b0, b1) => [A(a0, b0), A(a1, b0), A(a1, b1), A(a0, b1)];
    const bar3 = (p, q, w, h, mat) => { const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], hl = Math.hypot(dx, dz), r = k.box(w, h, Math.hypot(hl, dy), mat, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]); r.rotation.order = 'YXZ'; r.rotation.set(-Math.atan2(dy, hl), Math.atan2(dx, dz), 0); return r; };
    const P3 = (a, b, y) => { const [x, z] = A(a, b); return [x, y, z]; };
    const glassBox = (a0, a1, b0, b1, y0, y1, kind) => k.mesh(prismWalls(ringAB(a0, a1, b0, b1), y0, y1, { tile: Math.max(1.5, y1 - y0) }), shopGlass(ctx, kind, 0.95));
    const deckY = Z.deck, sill = Z.sill, slab = Z.slab, slabBot = Z.slabBot;
    // ---- the 1F shop: glass on the NW face (a 0 .. 4.87) and the street face (b 0 .. 4.7), plaster and timber beyond, on the corner deck
    k.mesh(prismWalls(ringAB(-0.05, S.a1, -0.05, S.b1), g0 - 1, sill, { tile: 3 }), m.concrete);
    glassBox(0, S.glassA, -0.02, 0.06, sill, slabBot - 0.05, 'shop');
    glassBox(-0.02, 0.06, 0, S.glassB, sill, slabBot - 0.05, 'shop');
    for (let a = 0; a <= S.glassA + 0.01; a += S.glassA / 4) boxAB(a - 0.04, a + 0.04, -0.08, 0.06, sill, slabBot - 0.05, m.galv);   // 1.22 m panes (IMG_0799 / 0823)
    for (let b = 0; b <= S.glassB + 0.01; b += S.glassB / 4) boxAB(-0.08, 0.06, b - 0.04, b + 0.04, sill, slabBot - 0.05, m.galv);
    boxAB(0, S.glassA, -0.08, 0.06, sill + 0.0, sill + 0.1, m.galv); boxAB(0, S.glassA, -0.08, 0.06, slabBot - 0.2, slabBot - 0.1, m.galv);   // sill and head rails
    boxAB(S.glassA, S.a1, -0.04, 0.3, sill, slabBot, cream);                                  // the plaster end of the NW face (the side door's wall)
    boxAB(6.25, 7.15, -0.07, -0.03, sill, sill + 2.1, m.cgray);                                // the side door (IMG_0799: a pale door with a push plate)
    boxAB(-0.04, 0.3, S.glassB, 6.3, sill, slabBot, cream);                                   // the street face beyond the glass: plaster, then the stair's timber wall
    boxAB(-0.15, 0.1, 6.3, S.b1, deckY, slabBot, m.dbrown);
    boxAB(S.a1 - 0.2, S.a1, 0, S.b1, sill, slabBot, creamD); boxAB(0, S.a1, S.b1 - 0.2, S.b1, sill, slabBot, creamD);   // back walls (hidden: the glass is lit from inside)
    k.mesh(capGeo(ringAB(0, S.a1, 0, S.b1), sill + 0.02, { tile: 2 }), m.deck);
    // ---- the roof slab = the terrace (T.P. 5.3), 0.45 m overhang, dark concrete fascia, grey soffit, decked top, the studio and the railing on it
    { const rs = [A(-0.45, -0.45), A(S.a1 + 0.1, -0.45), A(S.a1 + 0.1, S.b1 + 0.2), A(0, S.b1 + 0.2), A(0, Z.slabEnd), A(-0.45, Z.slabEnd)];   // the overhang stops at b = 4.56 (IMG_0907 / 0799: the slab end), beyond it the fascia is flush with the wall
      k.mesh(prismWalls(rs, slabBot, slab, { tile: 3 }), m.darkConcrete); k.mesh(capGeo(rs, slab + 0.01, { tile: 2 }), m.deck); k.mesh(capGeo(rs, slabBot, { down: true, tile: 2 }), m.greySoffit); }
    // the railing (timber top rail, steel posts, three wires, lights): along the NW edge, round the street corner, back to the studio (IMG_0907: it ends at the glass)
    { const R = Z.rail, pts = [A(S.a1 + 1.0, -0.3), A(-0.3, -0.3), A(-0.3, ST.b0 + 0.07), A(ST.a0, ST.b0 + 0.07)];
      railAlong(k, m, pts, slab, { lights: true, h: R });
      for (let i = 1; i < pts.length; i++) barAlong(k, pts[i - 1], pts[i], slab + R + 0.01, 0.09, 0.05, m.cedar); }
    // ---- the studio: a glass box 5.75 x 7.0 m on the terrace (NW face 4.48 m back from the shop's), head at T.P. 8.0
    glassBox(ST.a0, ST.a1, ST.b0, ST.b1, slab + 0.05, ST.head, 'studio');
    { const hh = ST.head - slab - 0.05, ym = slab + 0.05 + hh / 2;
      for (let a = ST.a0; a <= ST.a1 + 0.01; a += (ST.a1 - ST.a0) / 6) boxAB(a - 0.04, a + 0.04, ST.b0 - 0.05, ST.b0 + 0.05, slab + 0.05, ST.head, m.galv);   // 0.96 m panes on the NW face (IMG_0799)
      for (let b = ST.b0; b <= ST.b1 + 0.01; b += 0.95) boxAB(ST.a0 - 0.05, ST.a0 + 0.05, b - 0.04, b + 0.04, slab + 0.05, ST.head, m.galv);
      boxAB(ST.a0 - 0.05, ST.a1 + 0.05, ST.b0 - 0.05, ST.b0 + 0.05, slab + 0.05, slab + 0.2, m.galv); void ym;
      k.mesh(capGeo(ringAB(ST.a0, ST.a1, ST.b0, ST.b1), ST.head, { down: true, tile: 2 }), m.soffit); }
    // ---- the swept roof: eave corners triangulated in IMG_0799 / 0823 / 0907 (8.3 street tip, 8.8 west tip, 8.3 SE), fascia 0.42 m
    const rc = [A(RF.a0, RF.b0), A(RF.a1, RF.b0), A(RF.a1, RF.b1), A(RF.a0, RF.b1)];
    hipRoof(k, m, rc, RF.eave, RF.rise, RF.th);
    for (let a = RF.a0 + 1.0; a < RF.a1 - 0.5; a += 1.25) { const q = A(a, RF.b0 + 0.9), h = RF.eave[0] + (RF.eave[1] - RF.eave[0]) * (a - RF.a0) / (RF.a1 - RF.a0) + RF.rise * 0.15 - RF.th - 0.2; k.box(0.07, 0.15, 1.3, cream, [q[0], h, q[1]], [0, RYb, 0]); }   // the cream rafter brackets under the eave (IMG_0908)
    for (let b = RF.b0 + 1.0; b < RF.b1 - 0.5; b += 1.25) { const q = A(RF.a0 + 0.9, b), h = RF.eave[0] + (RF.eave[3] - RF.eave[0]) * (b - RF.b0) / (RF.b1 - RF.b0) + RF.rise * 0.15 - RF.th - 0.2; k.box(1.3, 0.15, 0.07, cream, [q[0], h, q[1]], [0, RYb, 0]); }
    // ---- two clusters of three slender white columns standing on the deck beside the stair, splayed to the roof (feet bearings from 0799 / 0823 / 0908)
    for (const [fa, fb] of Z.cols) for (let j = -1; j <= 1; j++) {
      const sp = fb < 7 ? 1 : 1, foot = P3(fa + 0.05 * j, fb + 0.28 * j, deckY), top = P3(fa + 0.1 + 0.03 * j, fb + 0.28 * j + 0.4, 8.05);   // [v6:fix3] near-plumb (IMG_0908: the clusters lean 4-5 deg toward +b, the old fan splayed +-0.5 m)
      pipe(k, m.stilt, foot, top, 0.115);
      k.cyl(0.2, 0.2, 0.06, m.stilt, [foot[0], deckY + 0.03, foot[2]], null, 10);   // base plate
    }
    // ---- the stair: 15 timber treads (open risers) between the street-edge rail and the wall, T.P. 2.35 -> 5.3, a landing to the hall
    const nR = SR.n, rise = (slab - deckY) / nR, run = (SR.b1 - SR.b0) / nR, aw = SR.a1 - SR.a0;
    for (let i = 0; i < nR; i++) {
      const yy = deckY + rise * (i + 1), b0 = SR.b0 + run * i;
      boxAB(SR.a0, SR.a1, b0 - 0.05, b0 + run, yy - 0.12, yy, m.comp);                  // 12 cm tread with a 5 cm nosing (IMG_0908: thick cantilevered boards)
      boxAB(SR.a0 + 0.02, SR.a1, b0 + 0.03, b0 + 0.07, yy - rise, yy - 0.12, m.dbrown);   // dark riser set back
    }
    boxAB(SR.a0, SR.a1, SR.b1, SR.b1 + 3.1, slab - 0.25, slab - 0.02, m.comp);          // the landing to the hall passage
    bar3(P3(SR.a0 + 0.04, SR.b0, deckY + 0.05), P3(SR.a0 + 0.04, SR.b1, slab - 0.05), 0.06, 0.28, m.dbrown);   // the street-side stringer
    for (const sa of [SR.a0 + 0.05, SR.a1 - 0.07]) {
      const p0 = P3(sa, SR.b0, deckY + 0.95), p1 = P3(sa, SR.b1 + 1.2, slab + 0.95);
      bar3(p0, P3(sa, SR.b1, slab + 0.95), 0.07, 0.05, m.cedar);                       // timber hand rail
      for (const f of [0.28, 0.55, 0.8]) bar3(P3(sa, SR.b0, deckY + 0.95 * f), P3(sa, SR.b1, slab + 0.95 * f), 0.012, 0.012, m.rail);   // three wires
      for (let i = 0; i <= nR; i += 3) { const b = SR.b0 + run * i - 0.02, y = deckY + rise * i; k.box(0.045, 0.95, 0.045, m.rail, [A(sa, b)[0], y + 0.475, A(sa, b)[1]]); }
      boxAB(sa - 0.04, sa + 0.04, SR.b1, SR.b1 + 1.2, slab + 0.93, slab + 0.98, m.cedar); void p1;
    }
    if (phys?.addWalkRamp) { const [x, z] = A((SR.a0 + SR.a1) / 2, (SR.b0 + SR.b1) / 2); phys.addWalkRamp(x, z, aw, SR.b1 - SR.b0, RYb, deckY, slab); }
    // ---- the stair hall's timber wall (T.P. 5.3 .. 7.8) with the lettering 「PIER 7」 (cut on its plane in IMG_0908: bottom 5.39, caps 1.07 m, the 7 1.5 m)
    { const H = Z.hall, L = Z.letters;
      boxAB(-0.15, 0.06, H.b0, H.b1, slab, H.top, m.dbrown);
      const lw = L.b1 - L.b0, lh = L.y1 - L.y0, cw = 1024, ch = Math.round(1024 * lh / lw), tex = ctx.tex.draw(cw, ch, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#1c2840'; g.textBaseline = 'alphabetic';
        const fit = (txt, capFrac, x0, x1) => { g.font = `900 ${Math.round(h * capFrac / 0.72)}px ${FONT.sans}`; const wN = g.measureText(txt).width || 1; g.save(); g.translate(x0, h - 5); g.scale((x1 - x0) / wN, 1); g.fillText(txt, 0, 0); g.restore(); };
        fit('PIER', 0.69, 0, w * 0.73); fit('7', 0.99, w * 0.755, w); }, { key: 'p7-pier7-letters' });
      const [lx, lz] = A(-0.2, (L.b0 + L.b1) / 2); k.plane(lw, lh, mapMat(ctx, 'decal', '#ffffff', tex, { transparent: true, alphaTest: 0.3 }), [lx, (L.y0 + L.y1) / 2, lz], [0, RYb - Math.PI / 2, 0]); }
    // ---- the blue Kesennuma city-area map board on two blue posts at the stair's SE end (cut in IMG_0908: panel T.P. 2.55 - 3.65, posts to 4.0)
    { const B = Z.board, [bx, bz] = A(B.a, B.b), tex = ctx.tex.draw(512, 440, (g, w, h) => { g.fillStyle = '#0f3d57'; g.fillRect(0, 0, w, h); g.fillStyle = '#e9e2b8'; g.fillRect(14, 40, w * 0.62, h - 56); g.fillStyle = '#7aa7d0'; g.fillRect(40, 60, w * 0.3, h * 0.5); g.fillStyle = '#d9cf8a'; for (let i = 0; i < 9; i++) g.fillRect(24, 54 + i * 36, w * 0.58, 2); g.fillStyle = '#f2f2ea'; g.fillRect(w * 0.68, 40, w * 0.3, h - 56); g.fillStyle = '#3a9a5a'; for (let i = 0; i < 8; i++) g.fillRect(w * 0.7, 54 + i * 40, w * 0.26, 24); g.fillStyle = '#f2f2ea'; g.font = '700 26px sans-serif'; g.fillText('Kesennuma City Area / 内湾エリア案内図', 16, 28); }, { key: 'p7-mapboard' });
      for (const sd of [-1, 1]) k.box(0.07, B.top - deckY, 0.07, m.navy, [bx + (B.w / 2 + 0.04) * sd * Z.eb[0], (B.top + deckY) / 2, bz + (B.w / 2 + 0.04) * sd * Z.eb[1]]);
      boxAB(B.a - 0.04, B.a + 0.04, B.b - B.w / 2 - 0.08, B.b + B.w / 2 + 0.08, B.top - 0.07, B.top, m.navy);
      k.plane(B.w, B.y1 - B.y0, mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0 }), [bx - 0.06 * Z.ea[0], (B.y0 + B.y1) / 2, bz - 0.06 * Z.ea[1]], [0, RYb - Math.PI / 2, 0]); }
    // ---- the corner deck (T.P. 2.35) with two steps down to the plaza round its open sides, carrying the totem
    { const D = Z.deckRect, dk = ringAB(D.a0, D.a1, D.b0, D.b1);
      for (const [off, y] of [[0.8, deckY - 0.34], [0.4, deckY - 0.17], [0, deckY]]) { const r = offsetRing(dk, off); k.mesh(prismWalls(r, g0 - 0.6, y, { tile: 2 }), m.comp); k.mesh(capGeo(r, y, { tile: 2 }), m.comp); }
      if (phys?.addWalkBox) { const o = obbOf(dk); phys.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, deckY, g0 - 1); } }
    { const [tx, ty, tz] = TOTEM6.pier7, h = 1.8; totem(ctx, k, m, tx, ty - h * 0.62, tz, Math.atan2(-0.27, -0.96), { mat: m.burgundy, title: '創', sub: 'PIER7', h, w: 0.9, feature: 'totem.pier7', logo: 'oval', pointed: false }); }   // [v6:rebuild] the surveyed logo centre; 1.8 m (IMG_0799)
    { const F = ctx.features; if (F) { const f3d = (n, a, b, y) => F.add('minami', n, P3(a, b, y)); f3d('nw.shop.corner', 0, 0, 3.5); f3d('nw.shop.glass_end', S.glassA, 0, 3.5); f3d('nw.shop.wall_end', S.a1, 0, 3.5); f3d('nw.studio.L', ST.a1, ST.b0, 6.5); F.add('minami', 'nw.slab.end', P3(-0.45, Z.slabEnd, slabBot)); f3d('nw.col1.foot', Z.cols[0][0], Z.cols[0][1], deckY); f3d('nw.col2.foot', Z.cols[1][0], Z.cols[1][1], deckY);
      F.add('minami', 'nw.roof.W', P3(RF.a1, RF.b0, RF.eave[1])); F.add('minami', 'nw.roof.A', P3(RF.a0, RF.b0, RF.eave[0])); F.dim?.('minami', 'nw.slab_y', slab); F.dim?.('minami', 'nw.studio_head', ST.head); F.dim?.('minami', 'nw.setback', ST.b0); F.dim?.('minami', 'nw.stair_rise', rise); F.dim?.('minami', 'nw.stair_w', aw); F.dim?.('minami', 'nw.shop_w', S.a1); } }
    out.street = { stair: A((SR.a0 + SR.a1) / 2, SR.b0) };
  }
  // ---- the SE block: white vertical boards, full depth, low gable; 「PIER7」 and the bay painting on its NW face
  {
    const top = tops.se;
    k.mesh(prismWalls(offsetRing(seFull, 0.04), g0 - 0.5, top, { tile: 3 }), m.wboard);
    edgesOf(seFull, (a, b, len, n, u) => { if (len < 5) return; for (let s = 2; s < len - 1.5; s += 3.2) k.plane(1.6, 1.4, shopGlass(ctx, 'office', 0.9), [a[0] + u[0] * s + n[0] * 0.08, g0 + 2.0, a[1] + u[1] * s + n[1] * 0.08], [0, ry(n), 0]); });
    gableRoof(k, m, seFull, top, { eave: 1.0, pitch: 0.18, rafters: 0, along: ax.u });
    const prA = (p) => (p[0] - ax.o[0]) * ax.u[0] + (p[1] - ax.o[1]) * ax.u[1], bayD = (p) => (p[0] - ax.o[0]) * T.bayN[0] + (p[1] - ax.o[1]) * T.bayN[1];
    const ends = openRing(seFull).filter((p) => Math.abs(prA(p) - cut1) < 0.05).sort((p, q) => bayD(p) - bayD(q)), S1 = ends[0], S2 = ends[ends.length - 1], nNW = [-ax.u[0], -ax.u[1]];   // [v6:rebuild] the SE block's NW face, street end -> bay end
    const at = (f, y, o = 0.08) => [S1[0] + (S2[0] - S1[0]) * f + nNW[0] * o, y, S1[1] + (S2[1] - S1[1]) * f + nNW[1] * o];
    // [v5:detail] on the strip the set-back 2F bares (f 0.56-1 toward the bay): the painting above the deck, 「PIER7」 lit
    // from behind above it (IMG_0816)
    const [px, py, pz] = at(0.8, f2 + 5.6); sign(ctx, k, 'PIER7', 2.8, 1.0, px, py, pz, ry(nNW), { color: '#2d3a4a', font: FONT.sans });
    { const gT = ctx.tex.draw(128, 64, (g, w, h) => { g.clearRect(0, 0, w, h); const gr = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w * 0.5); gr.addColorStop(0, 'rgba(255,220,140,0.9)'); gr.addColorStop(1, 'rgba(255,220,140,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { key: 'p5-halo' }); const [hx, hy, hz] = at(0.8, f2 + 5.6, 0.05); k.plane(3.6, 1.6, new THREE.MeshBasicMaterial({ map: gT, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.3 }), [hx, hy, hz], [0, ry(nNW), 0]); }
    const [qx, qy, qz] = at(0.78, f2 + 3.3); k.plane(3.0, 1.7, m.painting, [qx, qy, qz], [0, ry(nNW), 0]);
    out.se = { top, face: [S1, S2] };
    // [v5:detail] the composite stair from the quay up to the deck at the SE block's NW corner, outside the deck edge,
    // descending NW along the wall, stainless rails with lights (IMG_0816)
    { const wd = [0.777, 0.629], wn = [0.629, -0.777], top0 = [45.9 + wn[0] * 4.9, 104.5 + wn[1] * 4.9], n = 14, y0 = quay(top0[0] - wd[0] * 7, top0[1] - wd[1] * 7), rise = (f2 - y0) / n, run = 0.55;
      for (let i = 0; i < n; i++) { const d = run * (i + 0.5), x = top0[0] - wd[0] * (n * run - d), z = top0[1] - wd[1] * (n * run - d), yy = y0 + rise * (i + 1); k.box(2.4, yy - y0 + 0.2, run, m.comp, [x, (yy + y0 - 0.2) / 2, z], [0, Math.atan2(wd[0], wd[1]), 0]); if (phys?.addWalkBox) phys.addWalkBox(x, z, 2.4, run, Math.atan2(wd[0], wd[1]), yy, y0); }
      for (const sd of [-1.15, 1.15]) { const a2 = [top0[0] - wd[0] * n * run + wn[0] * sd, top0[1] - wd[1] * n * run + wn[1] * sd], b2 = [top0[0] + wn[0] * sd, top0[1] + wn[1] * sd], ss = seg(a2, b2), ya = y0 + 1.0, yb = f2 + 1.0; const rl = k.box(0.06, 0.06, Math.hypot(ss.len, yb - ya), m.rail, [ss.x, (ya + yb) / 2, ss.z]); rl.rotation.order = 'YXZ'; rl.rotation.set(-Math.atan2(yb - ya, ss.len), ss.rotY, 0); for (let i = 0; i <= 5; i++) { const t2 = i / 5; k.box(0.05, 1.0, 0.05, m.rail, [a2[0] + (b2[0] - a2[0]) * t2, ya - 0.5 + (yb - ya) * t2, a2[1] + (b2[1] - a2[1]) * t2]); } stringLights(k, m, [a2[0], ya + 0.03, a2[1]], [b2[0], yb + 0.03, b2[1]], 0.4, 0.1); } }
  }
  // ---- the main block's roof: a low gable, deep eaves (street slope pale, bay slope dark: Earth 2026-03-11 top) + the
  //      cantilevered 3F balcony box over the terrace (IMG_0802)
  {
    const main = { poly: clipAxis(P, ax.o, ax.u, cut0, cut1) };   // [v6:rebuild] (fix3: the main gable's NW end stays at the old seam: from IMG_0799 / 0823 it is hidden behind the pavilion's roof, i.e. at b >= 16 m)   // [v6:rebuild] over the full depth to the bay face
    gableRoof(k, m, main.poly, tops.main, { eave: 2.2, pitch: 0.14, darkSide: null, along: ax.u });
    const [a, b] = T.signEdge, n = T.bayN, f = 0.14, p = lerp(a, b, f), s = seg(a, b);
    // [v6:rebuild] the balcony cantilevers 3.2 m out of the 3F face over the terrace: a 1.4 m deep white box under its floor
    // (IMG_0802, 0817: its soffit 1.6 m over the deck rail), the rail on top
    const c = [24.9, 86.0];
    void p; void f;
    k.box(6.5, 1.4, 3.2, m.dbrown, [c[0], f3 - 0.85, c[1]], [0, s.rotY + Math.PI / 2, 0]);   // [v6:fix1] dark vertical timber at the photo's height (IMG_0814 / 0815 / 0817: the 3F band, 0.45 m higher than the old white box)
    railAlong(k, m, [[c[0] + n[0] * 1.55 - s.ux * 3.2, c[1] + n[1] * 1.55 - s.uz * 3.2], [c[0] + n[0] * 1.55 + s.ux * 3.2, c[1] + n[1] * 1.55 + s.uz * 3.2]], f3 - 0.6, { lights: false });
  }
  return out;
}

// ======================================================================================================== 迎
/** 迎's SE end in the photos (IMG_0824-0827): the ANCHOR face is the 10.4 m street segment P1 -> P2 of the footprint, the
 *  glazed corner wraps onto the 6.2 m SE face P2 -> P3. Heights are above the shop floor (T.P. 2.3, GROUND_PADS). */
export const ANCHOR = {
  // [v6:rebuild] on the surveyed façade plane (data/survey/minami/picks.json planes['anchor.face']: 197 SfM points, rms 3 cm):
  // P1 = the khaki face's NW end at the grey strip, P2 = its SE end at the corner (IMG_0826 / 0911 cuts on the plane);
  // the floor and sidewalk at T.P. 2.62 (anchor.floor)
  P1: [-15.34, 44.16], P2: [-8.77, 51.09], P3: [-3.9, 47.4], floor: 2.62,
  // the fascia over the face (fraction from P1, metres above the floor): it rises to a crest 4.2 m in and falls to the corner
  // (IMG_0826 fascia picks on the plane 0.7 m out, checked from the side in IMG_0911)
  eave: [[0, 6.2], [0.44, 6.8], [1, 6.25]],
  clere: [4.68, 5.83],         // the ANCHOR clerestory band (IMG_0826 cuts: T.P. 7.30-8.45)
  corner: { f0: 0.691, y0: 3.0, y1: 6.15 },   // the 2F glass box: from the survey's anchor.P2 (s = 0) to the corner, T.P. 5.62 up
};
/** [v6:fix2] The bay-side roof edge of 迎 (the fascia's top where the roof meets the sky in IMG_0808, cut on the vertical plane 0.5 m out from the bay face):
 *  [s along the axis (m from the footprint centre, + toward the SE end), T.P. m]. It is 1.5-2.4 m higher than the street side (the soffit shows from the
 *  plaza: the roof rises toward the bay) and has two humps (s 17.5 and 1.2) with a trough at the 3F box (s 8-15). tools/survey/minami_fix2.py. */
export const ROOF_BAY6 = [[-28, 10.0], [-17, 10.55], [-8.8, 12.15], [-1.4, 12.2], [1.2, 13.0], [4.9, 12.0], [8.2, 11.4], [11.9, 11.5], [14.8, 11.8], [17.5, 12.1], [22.3, 11.2], [26.0, 10.6], [27.9, 9.8], [29.5, 9.1], [31, 8.4]];
export const roofBayAt = (s) => { const R = ROOF_BAY6; if (s <= R[0][0]) return R[0][1]; for (let i = 1; i < R.length; i++) if (s <= R[i][0]) return R[i - 1][1] + (R[i][1] - R[i - 1][1]) * (s - R[i - 1][0]) / (R[i][0] - R[i - 1][0]); return R[R.length - 1][1]; };
/** [v6:rebuild] 迎's survey values: g0 (the street-side ground the builder keys its storeys to), the 3F box's top corners
 *  S / E and its coping T.P. (mukaeru.box.top, box_top_y), its depth along the axis. */
export const MUK6 = { g0: 2.3, box: { S: [-16.36, 40.63], E: [-8.76, 36.47], top: 14.825, depth: 6.2 } };   // depth: IMG_0808 (the bay face's far corner at x 2620)
/** The HAVE A NICE COFFEE oval on the ANCHOR face: fraction from P1, metres above the floor (IMG_0826 and IMG_0911 cut on the
 *  façade plane agree within 3 cm: s = -1.57 m from anchor.P2, T.P. 5.32). */
export const ANCHOR_OVAL = { f: 0.527, y: 2.70 };
/** The NAIWAN totems' glyph / logo centres (survey totem.mukaeru, totem.pier7). */
export const TOTEM6 = { mukaeru: [-11.71, 3.61, 60.19], pier7: [-6.04, 3.08, 72.08] };
const eaveAt = (f) => { const E = ANCHOR.eave; f = Math.max(0, Math.min(1, f)); for (let i = 1; i < E.length; i++) if (f <= E[i][0]) return E[i - 1][1] + (E[i][1] - E[i - 1][1]) * (f - E[i - 1][0]) / (E[i][0] - E[i - 1][0]); return E[E.length - 1][1]; };

/** 迎 ムカエル ([v5:photos] IMG_0808, 0824-0828; [v5:detail] the ANCHOR shopfront in full): returns { g0, roofY }. */
export function buildMukaeruPhotos(ctx, k, { L, base, wallCrest = MINAMI.wallCrest }) {
  const m = mats5(ctx), phys = ctx.physics, D = detailKit(ctx, k);
  // [v6:rebuild] the footprint with the ANCHOR face on its surveyed plane (GSI's P1 / P2 sat 0.6-2 m off); the axis frame
  // stays GSI's; g0 = the street-side ground the old builder read (T.P. 2.3), fixed so the plaza pad cannot move it
  const g0 = MUK6.g0, poly = [ANCHOR.P2, ANCHOR.P1, ...SITES.mukaeru.poly.slice(2, 4), ANCHOR.P3, ANCHOR.P2], o = obbOf(SITES.mukaeru.poly);
  const U = [o.ux, o.uz], Ctr = [o.cx, o.cz], half = o.d / 2;   // U points SSE: s = +half is the SE end
  const sOf = (p) => (p[0] - Ctr[0]) * U[0] + (p[1] - Ctr[1]) * U[1];
  const { P1, P2, P3 } = ANCHOR, gA = Math.max(g0, ANCHOR.floor);
  const cutAB = sOf(MUK6.box.S), cutBC = cutAB - MUK6.box.depth;   // A = the ANCHOR café (SE of the box), B = the grey 3F box, C = the NW wings
  const sec = (s0, s1) => clipAxis(poly, Ctr, U, s0, s1);
  const A = sec(cutAB, 1e3), Bfull = sec(cutBC, cutAB), Cn = sec(-1e3, cutBC);
  // the 3F box stands back 2.5 m from the street face (IMG_0824: its front spans 8 m from the bay edge); a two-storey grey
  // ribbed strip carrying the steel stair fills the street side in front of it (IMG_0827, 0828)
  // [v6:rebuild] the 3F box from its surveyed top corners (mukaeru.box.top: S = SE / street, E = SE / bay; IMG_0808, 0824),
  // 13 m deep along the axis; the two-storey grey strip with the steel stair fills the street side in front of it
  const VV = [-o.uz, o.ux], { S: BS, E: BE } = MUK6.box, vS = (BS[0] - Ctr[0]) * VV[0] + (BS[1] - Ctr[1]) * VV[1];
  const B = [BS, BE, [BE[0] - U[0] * MUK6.box.depth, BE[1] - U[1] * MUK6.box.depth], [BS[0] - U[0] * MUK6.box.depth, BS[1] - U[1] * MUK6.box.depth]];
  const Blow = clipAxis(Bfull, Ctr, VV, vS, 1e3), lowTop = g0 + 6.4;
  const eave = g0 + 7.4, boxTop = MUK6.box.top - 0.35;
  const street = (n) => n[0] * -0.865 + n[1] * 0.5 > 0.5, bayF = (n) => n[0] * 0.865 - n[1] * 0.5 > 0.5;
  // the ANCHOR face frame: fraction f from P1 to P2, out = metres in front of the face
  const fl = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]), fu = [(P2[0] - P1[0]) / fl, (P2[1] - P1[1]) / fl], fn = [-fu[1], fu[0]];
  const F = (f, out = 0) => [P1[0] + fu[0] * fl * f + fn[0] * out, P1[1] + fu[1] * fl * f + fn[1] * out];
  const fOfS = (s) => (s - sOf(P1)) / (sOf(P2) - sOf(P1));
  // roof heights: A follows the ANCHOR eave (a folded plate), C keeps the gull-wing wave seen from the bay (IMG_0808)
  const s0 = -half - 1.0, s1 = half + 1.0;
  const yOf = (s) => s >= cutAB - 0.01 ? gA + eaveAt(fOfS(s)) + 0.15 : eave + 0.2 * (1 - Math.cos((s - s0) / 13 * 2 * Math.PI));   // [v6:fix1] crest ~0.6 m lower, trough on the wall tops (IMG_0913 / 0824 roofline)
  // [v6:fix2] the roof surface (x, z) -> y: the street-side height of yOf across to the measured bay edge (roofBayAt) over the full width of the slab
  const hwR = o.w / 2 + 0.5, vOf = (x, z) => (x - Ctr[0]) * -o.uz + (z - Ctr[1]) * o.ux;
  const yAt = (x, z) => { const sx = sOf([x, z]), ys = yOf(sx), f = Math.max(0, Math.min(1, (hwR - vOf(x, z)) / (2 * hwR))); return ys + f * (Math.max(ys, roofBayAt(sx) - 0.05) - ys); };
  k.mesh(prismWalls(poly, g0 - 1, g0 + 0.15), m.concrete);
  k.mesh(prismWalls(A, g0 - 1, gA + 0.05), m.concrete);
  // ---- A: khaki render up to the folded eave (bay face glazed separately)
  // [cafe-rst] the ANCHOR face itself (edge P2 -> P1) is built below with the café's ground-floor openings cut (harbor/cafe-front.js): the real room stands behind them
  const near2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.05, onFace = (a, b) => (near2(a, P1) && near2(b, P2)) || (near2(a, P2) && near2(b, P1));
  k.mesh(prismWalls(A, gA, (x, z) => yAt(x, z) - 0.05, { tile: 3, skip: (i, a, b) => { const s = seg(a, b); return bayF([s.uz, -s.ux]) || onFace(a, b); } }), m.khaki);
  { const zH = Math.max(...CAFE_OPENINGS.map((o) => o.z1)) + 0.12, rotF = ry(fn);
    k.mesh(prismWalls(A, gA + zH, (x, z) => yAt(x, z) - 0.05, { tile: 3, skip: (i, a, b) => !onFace(a, b) }), m.khaki);   // whole above the heads, up to the folded eave
    const cuts = [...new Set([0, fl, ...CAFE_OPENINGS.flatMap((o) => [o.x0, o.x1])])].sort((p, q) => p - q);
    for (let i = 0; i < cuts.length - 1; i++) {   // piers and spandrels 0.18 m deep between and under the openings (the room's lining stands in front of their inner face)
      const xa = cuts[i], xb = cuts[i + 1], o = CAFE_OPENINGS.find((q) => q.x0 <= xa + 1e-6 && xb <= q.x1 + 1e-6);
      for (const [z0, z1] of o ? [[0, o.z0], [o.z1, zH]] : [[0, zH]]) { if (z1 - z0 < 0.01) continue; const [px, pz] = F((xa + xb) / 2 / fl, -0.09); k.box(xb - xa, z1 - z0, 0.18, m.khaki, [px, gA + (z0 + z1) / 2, pz], [0, rotF, 0]); }
    }
  }
  // [v6:fix1] the bay face of the café wing is a dark vertical-timber wall with two small round gold signs (IMG_0808: nothing glazed
  // there; the signs cut on the face plane at T.P. 8.35 / 8.46, x -3.64 / -4.45)
  k.mesh(prismWalls(A, gA, (x, z) => yAt(x, z) - 0.05, { tile: 3, skip: (i, a, b) => { const s = seg(a, b); return !bayF([s.uz, -s.ux]); } }), m.timberDark);
  edgesOf(A, (a, b, len, n, u) => {
    if (!bayF(n)) return;
    for (const [sx, sy, sz] of [[-3.64, 8.35, 47.84], [-4.45, 8.46, 46.45]]) k.mesh(new THREE.CircleGeometry(0.36, 20), m.bulb, [sx + n[0] * 0.07, sy, sz + n[1] * 0.07], [0, ry(n), 0]);
  });
  {
    const [x0, z0] = F(0), rot = ry(fn), at = (f, y, out = 0.04) => { const [x, z] = F(f, out); return [x, y, z]; };
    // clerestory: white-framed panes with the ANCHOR letters standing behind the glass (lit café inside)
    const cf = ANCHOR.corner.f0, [cy0, cy1] = ANCHOR.clere;
    D.glazing({ a: [x0, z0], u: fu, n: fn, s0: 0.05, s1: fl * cf, y0: gA + cy0, y1: gA + cy1, cols: 6, kind: 'glow', out: 0.02, fw: 0.11 });
    'ANCHOR'.split('').forEach((ch, i) => { /* [v6:fix3] pitch 1.05 x: IMG_0911 / 0912 photo pitch 102 px vs the app's 97 (R 20-45 px too far left) */ const f = (0.05 / fl) + (cf - 0.05 / fl) * (i + 0.5) / 6 * 1.05; D.text(ch, 0.8, 0.95, ...at(f, gA + (cy0 + cy1) / 2, 0.05), rot, { color: '#eef2ef', font: FONT.sans, weight: 700, size: 0.95 }); });
    // the glazed 2F corner box: two rows of tall panes on the ANCHOR face and round onto the SE face, steel frame
    const C = ANCHOR.corner;
    D.glazing({ a: [x0, z0], u: fu, n: fn, s0: fl * C.f0, s1: fl, y0: gA + C.y0, y1: gA + C.y1, cols: 2, transoms: [gA + 4.6], kind: 'cafe', out: 0.03, fw: 0.1, frame: D.M.frameS });
    { const sl = Math.hypot(P3[0] - P2[0], P3[1] - P2[1]), su = [(P3[0] - P2[0]) / sl, (P3[1] - P2[1]) / sl], sn = [-su[1], su[0]];
      D.glazing({ a: P2, u: su, n: sn, s0: 0, s1: sl, y0: gA + C.y0, y1: gA + C.y1, cols: 4, transoms: [gA + 4.6], kind: 'cafe', out: 0.03, fw: 0.1, frame: D.M.frameS });
      // the SE ground floor behind the broad stair: Lander Blue's glass door and a window
      D.glazing({ a: P2, u: su, n: sn, s0: 0.6, s1: 3.4, y0: gA + 0.05, y1: gA + 2.7, cols: 2, kind: 'shop', out: 0.03, frame: D.M.frameB });
      D.text('COFFEE', 1.5, 0.42, P2[0] + su[0] * 4.6 + sn[0] * 0.07, gA + 5.6, P2[1] + su[1] * 4.6 + sn[1] * 0.07, ry(sn), { color: '#f6f3ea', weight: 700 });
      k.box(0.25, C.y1 - C.y0 + 0.2, 0.25, D.M.frameS, [P2[0] + (fn[0] + sn[0]) * 0.08, gA + (C.y0 + C.y1) / 2, P2[1] + (fn[1] + sn[1]) * 0.08]); }
    D.text('COFFEE', 1.2, 0.36, ...at(0.80, gA + 5.55, 0.08), rot, { color: '#f6f3ea', weight: 700 });
    D.text('DONUTS', 1.2, 0.36, ...at(0.80, gA + 5.15, 0.08), rot, { color: '#f6f3ea', weight: 700 });
    { const tx = ctx.tex.draw(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#f2f4f0'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, h / 2, w * 0.42, 0, 7); g.stroke(); g.lineWidth = 7; g.beginPath(); g.moveTo(w / 2, h * 0.24); g.lineTo(w / 2, h * 0.78); g.moveTo(w * 0.34, h * 0.36); g.lineTo(w * 0.66, h * 0.36); g.stroke(); g.beginPath(); g.arc(w / 2, h * 0.52, w * 0.24, 0.25, Math.PI - 0.25); g.stroke(); g.beginPath(); g.arc(w / 2, h * 0.2, 7, 0, 7); g.stroke(); }, { key: 'p5-anchorlogo' });
      k.plane(1.05, 1.05, mapMat(ctx, 'decal', '#ffffff', tx, { transparent: true, alphaTest: 0.3 }), at(C.f0 + 0.055, gA + (cy0 + cy1) / 2 + 0.1, 0.08), [0, rot, 0]); }
    // the lower corner: khaki wall with the two dark timber boards (Lander Blue, SHARKS) over the deck
    D.text('Lander Blue', 1.7, 0.55, ...at(0.80, gA + 2.6, 0.09), rot, { color: '#e8edf2', bg: '#3e2f25', font: FONT.serif, size: 0.62 });   // [v6:rebuild] boards T.P. 4.25-5.51
    D.text('SHARKS', 1.7, 0.5, ...at(0.80, gA + 1.93, 0.09), rot, { color: '#d8e0e6', bg: '#3e2f25', font: FONT.serif, size: 0.6 });
    for (const [f, y, h] of [[0.80, 2.6, 0.6], [0.80, 1.93, 0.56]]) k.box(1.8, h + 0.06, 0.06, D.M.board, at(f, gA + y, 0.05), [0, rot, 0]);
    // café RST: black fascia with the pink "café" script and the blue RST neon, six gooseneck lamps above
    k.box(fl * 0.29, 0.55, 0.24, D.M.frameB, at(0.145, gA + 2.55, 0.12), [0, rot, 0]);   // [v6:rebuild] T.P. 4.89-5.44 (IMG_0826)
    D.text('café', 0.8, 0.4, ...at(0.05, gA + 2.55, 0.25), rot, { color: '#ff8fb0', font: FONT.serif, weight: 700, glow: 1.3 });
    D.text('RST', 1.45, 0.42, ...at(0.19, gA + 2.55, 0.25), rot, { color: '#7fe0ff', font: FONT.serif, weight: 900, glow: 1.3 });
    for (let i = 0; i < 6; i++) { const [x, , z] = at(0.025 + i * 0.05, 0, 0.02); D.gooseneck(x, gA + 3.05, z, fn); }
    // [cafe-rst] the shopfront (the take-away window, the door, the main café window with the ROUTE 66 neon in it) is open now: the real room is built behind it by explore/cafe-rst.js
    // the HAVE A NICE COFFEE oval, a wall spot above it
    k.plane(1.35, 0.93, mapMat(ctx, 'decal', '#ffffff', ovalTex(ctx, { lines: ['HAVE A NICE', 'COFFEE', 'RST'] }), { transparent: true, alphaTest: 0.3 }), at(ANCHOR_OVAL.f, gA + ANCHOR_OVAL.y, 0.1), [0, rot, 0]);
    { const [x, , z] = at(ANCHOR_OVAL.f - 0.07, 0, 0.02); D.gooseneck(x, gA + ANCHOR_OVAL.y + 0.8, z, fn); }
    // the sidewalk in front: nobori, bicycles, A-boards and the soft-cream stand (IMG_0825-0827)
    // [cafe-rst] the props stand on the paving (T.P. 2.1-2.3; the floor is 0.3 m higher, so at gA they hovered), the door is open now so
    // its approach is clear (the 受付 board moved to the window's end, the first bike and the nobori start past the stoop)
    const pave = (f, out) => { const [x, , z] = at(f, 0, out); return [x, L.heightAt(x, z), z]; };
    D.nobori(...pave(0.345, 1.15), rot + Math.PI / 2, { text: '自家焙煎珈琲豆', bg: '#6a3550', fg: '#f3e9e2', h: 2.5, w: 0.6 });
    D.nobori(...at(0.8, gA, 2.2), rot + Math.PI / 2, { text: 'プライベートクルーズ', bg: '#e05a2a', fg: '#2a2050', h: 3.0, w: 0.62 });
    ['#2a2b2e', '#5a2026', '#2a2b2e', '#2a2b2e', '#7a2228'].forEach((c, i) => D.bike(...pave(0.405 + i * 0.058, 0.75), rot + Math.PI / 2 + 0.35, c));
    D.aBoard(...pave(0.04, 1.2), rot, { text: 'MENU' }); D.aBoard(...pave(0.105, 1.6), rot + 0.4, { text: '受付', bg: '#22324a' });
    { const [x, y, z] = pave(0.13, 0.9); k.cyl(0.04, 0.04, 1.2, D.M.steel, [x, y + 0.6, z], null, 6); k.mesh(new THREE.ConeGeometry(0.18, 0.5, 10), m.white, [x, y + 1.05, z], [Math.PI, 0, 0]); k.sphere(0.2, m.white, [x, y + 1.38, z], 10); }
  }
  // the SE composite deck (wrapping steps) with the purple NAIWAN 迎 WELCOME HOUSE totem
  {
    // [v6:rebuild] the deck at the floor level (T.P. 2.62) reaching south past the totem, four 0.18 m steps down to the
    // ground round it (IMG_0820, 0824); the totem at its surveyed glyph centre, 1.6 m tall (IMG_0824: 0.7 m wide at 9 m)
    const dk = [F(0.68, 0), P2, [-6.6, 55.6], [-7.1, 61.6], [-13.2, 61.8], [-13.4, 51.8]];
    for (const [off, y] of [[1.05, gA - 0.54], [0.7, gA - 0.36], [0.35, gA - 0.18], [0, gA]]) { const r = offsetRing(dk, off); k.mesh(prismWalls(r, gA - 0.3, y, { tile: 2 }), m.comp); k.mesh(capGeo(r, y, { tile: 2 }), m.comp); }
    if (phys?.addWalkBox) { const ob = obbOf(dk); phys.addWalkBox(ob.cx, ob.cz, ob.w, ob.d, ob.rotY, gA, gA - 1); }
    { const [tx, ty, tz] = TOTEM6.mukaeru, h = 1.56; totem(ctx, k, m, tx, ty - h * 0.62, tz, Math.atan2(-0.05, 1), { mat: m.purple, title: '迎', sub: 'WELCOME HOUSE', h, w: 0.7, feature: 'totem.mukaeru', pointed: false }); }
    D.bollardLight(-12.0, gA, 53.6, 0.5);
  }
  // ---- B: the tall grey ribbed-metal box (3F) with windows and the external steel stair on the street side
  k.mesh(prismWalls(B, g0 + 0.1, boxTop, { tile: 4 }), m.rib);
  k.mesh(prismWalls(Blow, g0 + 0.1, lowTop, { tile: 4 }), m.rib); k.mesh(capGeo(Blow, lowTop, { tile: 3 }), m.roofDark);
  k.mesh(prismWalls(offsetRing(Blow, 0.05), lowTop - 0.25, lowTop + 0.3, { tile: 3 }), m.rib);
  k.mesh(capGeo(B, boxTop, { tile: 3 }), m.roofLight);
  k.mesh(prismWalls(offsetRing(B, 0.05), boxTop - 0.3, boxTop + 0.35, { tile: 3 }), m.rib);
  edgesOf(Blow, (a, b, len, n, u) => { if (len < 6 || !street(n)) return; D.glazing({ a, u, n, s0: len * 0.55, s1: len * 0.55 + 1.0, y0: g0 + 0.1, y1: g0 + 2.2, cols: 1, kind: 'dark', out: 0.02, frame: D.M.frameS }); D.glazing({ a, u, n, s0: len * 0.2, s1: len * 0.2 + 1.2, y0: g0 + 3.9, y1: g0 + 5.0, cols: 1, kind: 'office', out: 0.02, frame: D.M.frameS }); });
  // [v6:fix1] the 3F box (IMG_0808): its bay face carries ONE large dark 2 x 3 window block (x 586-645, y 634-686 px: 0.1-0.8 of the
  // face, T.P. 13.0-14.5), the SE face only two small vents; no windows on the left face
  edgesOf(B, (a, b, len, n, u, i) => {
    if (len < 4) return; const s = seg(a, b);
    if (i === 1 || bayF(n)) D.glazing({ a, u, n, s0: len * 0.1, s1: len * 0.8, y0: 13.0, y1: 14.5, cols: 3, transoms: [13.75], kind: 'dark', out: 0.03, frame: D.M.frameS });
    else if (len > 9) D.glazing({ a, u, n, s0: len * 0.4 - 0.5, s1: len * 0.4 + 0.5, y0: g0 + 4.9, y1: g0 + 6.1, cols: 1, kind: 'office', out: 0.03, frame: D.M.frameS });
    for (const f of [0.35, 0.5]) k.box(0.35, 0.25, 0.08, D.M.frameS, [a[0] + u[0] * len * f + n[0] * 0.05, g0 + 10.8, a[1] + u[1] * len * f + n[1] * 0.05], [0, ry(n), 0]);
  });
  edgesOf(Blow, (a, b, len, n, u) => {
    if (len < 6 || !street(n)) return; const s = seg(a, b);
    // two flights (1.1 m wide, 1.5 m off the wall) with landings at 2F and the low roof, mesh balustrades (IMG_0824, 0828)
    const L0 = [s.x + n[0] * 1.5 - u[0] * 4, s.z + n[1] * 1.5 - u[1] * 4];
    const flights = [[0, 6, g0, g0 + 3.2], [6, 0, g0 + 3.2, lowTop]];
    for (const [f0, f1, y0, y1] of flights) {
      const a2 = [L0[0] + u[0] * f0, L0[1] + u[1] * f0], b2 = [L0[0] + u[0] * f1, L0[1] + u[1] * f1], ss = seg(a2, b2), Lh = Math.hypot(ss.len, y1 - y0), pitch = -Math.atan2(y1 - y0, ss.len);
      for (const d of [-0.55, 0.55]) { const st = k.box(0.06, 0.28, Lh, D.M.steel, [ss.x + n[0] * d, (y0 + y1) / 2, ss.z + n[1] * d]); st.rotation.order = 'YXZ'; st.rotation.set(pitch, ss.rotY, 0); }
      for (let i = 1; i < 12; i++) { const t2 = i / 12; k.box(1.1, 0.04, 0.28, D.M.steel, [a2[0] + (b2[0] - a2[0]) * t2, y0 + (y1 - y0) * t2, a2[1] + (b2[1] - a2[1]) * t2], [0, ry(n), 0]); }
      const rl = k.box(0.05, 0.05, Lh, m.rail, [ss.x + n[0] * 0.58, (y0 + y1) / 2 + 1.0, ss.z + n[1] * 0.58]); rl.rotation.order = 'YXZ'; rl.rotation.set(pitch, ss.rotY, 0);
      const mp = k.plane(Lh, 0.9, m.mesh, [ss.x + n[0] * 0.6, (y0 + y1) / 2 + 0.5, ss.z + n[1] * 0.6], [0, ss.rotY + Math.PI / 2, 0]); mp.rotation.order = 'YXZ'; mp.rotation.set(0, ss.rotY + Math.PI / 2, -pitch * Math.sign(f1 - f0));
    }
    for (const [f, y] of [[6.8, g0 + 3.2], [-0.8, lowTop]]) { const p = [L0[0] + u[0] * f, L0[1] + u[1] * f]; k.box(1.6, 0.16, 1.6, D.M.steel, [p[0], y, p[1]], [0, ry(n), 0]); k.box(1.6, 1.0, 0.04, m.rail, [p[0] + n[0] * 0.8, y + 0.6, p[1] + n[1] * 0.8], [0, ry(n), 0]); k.plane(1.6, 0.9, m.mesh, [p[0] + n[0] * 0.79, y + 0.55, p[1] + n[1] * 0.79], [0, ry(n), 0]); k.box(0.08, y - g0, 0.08, D.M.steel, [p[0] + n[0] * 0.75, (y + g0) / 2, p[1] + n[1] * 0.75]); }
  });
  // ---- C: the lower NW wings: charcoal boards on the street, dark timber on the bay, windows, 「nine one」
  edgesOf(Cn, (a, b, len, n, u) => {
    const s = seg(a, b), mat = bayF(n) ? m.timberDark : m.cgray;   // [v6:fix1] the street face is light-grey panel with a navy band (IMG_0913), not charcoal
    k.box(0.2, eave - g0, len, mat, [s.x - n[0] * 0.1, (g0 + eave) / 2, s.z - n[1] * 0.1], [0, s.rotY, 0]);
    if (len < 6) return;
    for (let d = 2; d < len - 2; d += 4.2) {
      D.glazing({ a, u, n, s0: d - 1.2, s1: d + 1.2, y0: g0 + 0.3, y1: g0 + 2.6, cols: 2, kind: bayF(n) ? 'cafe' : 'shop', out: 0.02, frame: D.M.frameB });
      if (!bayF(n)) D.glazing({ a, u, n, s0: d - 0.9, s1: d + 0.9, y0: g0 + 4.5, y1: g0 + 5.6, cols: 2, kind: 'cafe', out: 0.02, frame: D.M.frameB });   // [v6:fix1] the bay-side 2F is dark timber, no glazed band (IMG_0808)
    }
    if (street(n) && len > 12) { const nb = (f0, f1, y0, y1) => { const c = [a[0] + u[0] * len * (f0 + f1) / 2 + n[0] * 0.12, a[1] + u[1] * len * (f0 + f1) / 2 + n[1] * 0.12]; k.box(0.06, y1 - y0, len * (f1 - f0), m.navy, [c[0], (y0 + y1) / 2, c[1]], [0, s.rotY, 0]); }; nb(0.06, 0.5, g0 + 3.5, g0 + 7.2);
      D.glazing({ a, u, n, s0: len * 0.1, s1: len * 0.42, y0: g0 + 4.7, y1: g0 + 5.6, cols: 5, kind: 'cafe', out: 0.16, frame: D.M.frameB }); }
    if (bayF(n)) stringLights(k, m, [a[0] + n[0] * 1.0, eave + 0.1, a[1] + n[1] * 1.0], [b[0] + n[0] * 1.0, eave + 0.1, b[1] + n[1] * 1.0], 0.7, 0.3);
  });
  // [v6:fix1] the red round 「91 nine one」 sign on the street face, cut on the face plane in IMG_0913 (along 9.6 m from the SE end, T.P. 7.1-7.4,
  // 0.75 m across), the 「nine one」 lettering under it (T.P. 6.05)
  { const nS = [-0.858, 0.513], sx = -22.32 + nS[0] * 0.06, sz = 35.17 + nS[1] * 0.06; k.mesh(new THREE.CircleGeometry(0.38, 24), m.red, [sx, 7.15, sz], [0, ry(nS), 0]); k.mesh(new THREE.RingGeometry(0.3, 0.33, 24), m.white, [sx + nS[0] * 0.01, 7.15, sz + nS[1] * 0.01], [0, ry(nS), 0]);
    sign(ctx, k, 'nine one', 1.5, 0.38, -21.9 + nS[0] * 0.06, 6.05, 35.9 + nS[1] * 0.06, ry(nS), { color: '#f4f2ea', font: FONT.sans }); }
  // the roof: one thin slab along the axis with 1 m eaves; A's part is the folded plate over the ANCHOR face, C's the
  // gull-wing wave seen from the bay (IMG_0808); B (the box) pokes through
  {
    const V = [-o.uz, o.ux], hw = o.w / 2 + 0.5, pos = [], idx = [];   // [v6:fix1] 0.5 m eaves (IMG_0913: the wing's roof barely overhangs)
    const N = 80;
    const S = []; for (let i = 0; i <= N; i++) S.push(s0 + (s1 - s0) * i / N);
    for (const f of [0, 0.36, 1]) S.push(sOf(P1) + (sOf(P2) - sOf(P1)) * f); S.push(cutAB - 0.02);
    S.sort((p, q) => p - q);
    S.push(cutBC - 0.001, cutBC + 0.02); for (const x of ROOF_BAY6) if (x[0] > s0 && x[0] < s1 && !S.includes(x[0])) S.push(x[0]);
    S.sort((p, q) => p - q);
    // [v6:fix2] bay edge at the measured height (roofBayAt), street edge at the street height; over the box (s cutBC .. cutAB) only the bay half (to v = -0.3 hw) so the stair landing stays clear
    const yEdge = (s, v, inBox) => v < 0 ? roofBayAt(s) - 0.05 : inBox ? roofBayAt(s) - 0.95 : yOf(s);
    for (const s of S) { const inBox = s > cutBC + 0.01 && s < cutAB - 0.01; for (const v of [-hw, inBox ? -0.3 * hw : hw]) pos.push(Ctr[0] + U[0] * s + V[0] * v, yEdge(s, v === -hw ? -1 : 1, inBox), Ctr[1] + U[1] * s + V[1] * v); }
    const boxS = (s) => s > cutBC + 0.01 && s < cutAB - 0.01;
    for (let i = 0; i < S.length - 1; i++) { if (S[i] >= cutAB - 0.01 || boxS(S[i]) !== boxS(S[i + 1])) continue; const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }   // C and the bay half over the box; A has its own folded plate
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    k.mesh(g, m.roofLight);   // [v6:fix1] light-grey top (IMG_0913), charcoal soffit and fascia (the bay side in IMG_0808 reads dark)
    const g2 = g.clone(); g2.translate(0, -0.12, 0); k.mesh(g2, m.charcoal);
    for (const v of [-hw, hw]) for (let i = 0; i < S.length - 1; i++) { const sA = S[i], sB = S[i + 1]; if (sB - sA < 0.05 || sA >= cutAB - 0.01 || (v > 0 && (boxS(sA) || boxS(sB) || sB > cutBC + 0.011))) continue; const yv = (q) => v < 0 ? roofBayAt(q) - 0.05 : yOf(q); const pa = [Ctr[0] + U[0] * sA + V[0] * v, Ctr[1] + U[1] * sA + V[1] * v], pb = [Ctr[0] + U[0] * sB + V[0] * v, Ctr[1] + U[1] * sB + V[1] * v], ss = seg(pa, pb); const f = k.box(0.1, 0.36, ss.len + 0.02, m.charcoal, [ss.x, (yv(sA) + yv(sB)) / 2 - 0.08, ss.z]); f.rotation.order = 'YXZ'; f.rotation.set(-Math.atan2(yv(sB) - yv(sA), ss.len), ss.rotY, 0); }
    // [v5:detail] A's roof: the folded plate follows A's own outline with a 0.8 m eave (the old full-width strip hung 5 m
    // past the ANCHOR face, which is 19 deg off the axis), split at the crease so each part is planar; fascia all round
    {
      const yA = (s2) => gA + eaveAt(fOfS(s2)) + 0.15;
      const AR = offsetRing(A, 0.8), sK = sOf(P1) + (sOf(P2) - sOf(P1)) * ANCHOR.eave[1][0];
      for (const part of [clipAxis(AR, Ctr, U, -1e3, sK), clipAxis(AR, Ctr, U, sK, 1e3)]) {
        if (part.length < 3) continue;
        for (const [mat, dy, down] of [[m.roofLight, 0, false], [m.timberDark, -0.12, true]]) { const cg = capGeo(part, 0, { tile: 3, down }); const pa = cg.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, yAt(pa.getX(i), pa.getZ(i)) + dy); cg.computeVertexNormals(); k.mesh(cg, mat); }
      }
      edgesOf(AR, (a, b, len) => { const N2 = Math.max(1, Math.ceil(len / 1.0)); for (let i = 0; i < N2; i++) { const pa = lerp(a, b, i / N2), pb = lerp(a, b, (i + 1) / N2), ss = seg(pa, pb), ya = yAt(pa[0], pa[1]), yb = yAt(pb[0], pb[1]); const f = k.box(0.1, 0.36, ss.len + 0.02, m.fascia, [ss.x, (ya + yb) / 2 - 0.08, ss.z]); f.rotation.order = 'YXZ'; f.rotation.set(-Math.atan2(yb - ya, ss.len), ss.rotY, 0); } });
    }
    // infill walls up to the wave under the roof (C)
    k.mesh(prismWalls(offsetRing(Cn, -0.15), eave - 0.1, (x, z) => Math.max(eave - 0.05, yAt(x, z) - 0.05), { tile: 3, skip: (i, a, b) => { const s2 = seg(a, b); return bayF([s2.uz, -s2.ux]); } }), m.charcoal);
    k.mesh(prismWalls(offsetRing(Cn, -0.15), eave - 0.1, (x, z) => Math.max(eave - 0.05, yAt(x, z) - 0.05), { tile: 3, skip: (i, a, b) => { const s2 = seg(a, b); return !bayF([s2.uz, -s2.ux]); } }), m.timberDark);   // [v6:fix2] the bay face is dark timber up to the roof (IMG_0808)
  }
  // the 2F terrace on the bay side (wall crest), rail with lights
  edgesOf(poly, (a, b, len, n) => {
    if (len < 30 || !bayF(n)) return;
    // [v6:rebuild] 3.0 m out to the cage's terrace-side face (the cage's deck and mesh rail band carry the terrace on beyond
    // it, IMG_0808 / 0818); the rail stands at that edge
    const d0 = [a[0] + n[0] * 1.5, a[1] + n[1] * 1.5], d1 = [b[0] + n[0] * 1.5, b[1] + n[1] * 1.5];
    barAlong(k, d0, d1, wallCrest - 0.15, 3.0, 0.3, m.deck);
    railAlong(k, m, [[a[0] + n[0] * 2.95, a[1] + n[1] * 2.95], [b[0] + n[0] * 2.95, b[1] + n[1] * 2.95]], wallCrest);
    if (phys?.addWalkBox) { const s = seg(d0, d1); phys.addWalkBox(s.x, s.z, 3.0, s.len, s.rotY, wallCrest, wallCrest - 1); }
  });
  buildStreetFront(ctx, k, { L, D, F });
  // [v6:survey] named features as built (tools/anime/survey-diff.mjs, docs/anime/survey/minami.md)
  { const Fe = ctx.features; if (Fe) { const A_ = 'minami', at3 = (f, y, o = 0) => { const [x, z] = F(f, o); return [x, y, z]; };
    Fe.add(A_, 'anchor.oval', at3(ANCHOR_OVAL.f, gA + ANCHOR_OVAL.y, 0));
    Fe.add(A_, 'anchor.P2.foot', at3(ANCHOR.corner.f0, gA)); Fe.add(A_, 'anchor.P2.eave', at3(ANCHOR.corner.f0 + 0.27 / fl, gA + eaveAt(ANCHOR.corner.f0 + 0.27 / fl)));   // [v6:fix2] the surveyed eave point is 0.27 m past the glass corner along the face (IMG_0826 / 0911 cuts); the fascia runs on there Fe.add(A_, 'anchor.P1.eave', at3(0, gA + eaveAt(0)));
    Fe.group(A_, 'mukaeru.box.top', [BS, BE].map(([x, z]) => [x, boxTop + 0.35, z])); Fe.dim(A_, 'mukaeru.box_se_w', Math.hypot(BE[0] - BS[0], BE[1] - BS[1]));
    Fe.dim(A_, 'mukaeru.box_top_y', boxTop + 0.35); Fe.dim(A_, 'anchor.floor', gA); } }
  return { g0, roofY: boxTop, eave };
}

/** [v5:detail] The east pavement of 魚町港町線 along 迎 (IMG_0826-0828): light pavers with a dark sett band, young street
 *  trees in grates at the kerb, the forecourt in front of the ANCHOR face, and the cars parked along the grey box. The
 *  kerb is 5.3 m east of the road's centre line (the bollard line of buildMarkingsPhotos). */
export function buildStreetFront(ctx, k, { L, D, F }) {
  const m = mats5(ctx);
  const N1 = [[-73, -30], [-17, 72]], t = [(N1[1][0] - N1[0][0]) / 116.35, (N1[1][1] - N1[0][1]) / 116.35], e = [t[1], -t[0]];   // e = east, away from the road
  const K = (sp, off = 0) => [N1[0][0] + (N1[1][0] - N1[0][0]) * sp + e[0] * (6.9 + off), N1[0][1] + (N1[1][1] - N1[0][1]) * sp + e[1] * (6.9 + off)];   // [v6:fix1] the kerb is 6.9 m east of N1 in the app's frame (was 5.3): IMG_0829's kerb cuts at 5.83 m by the same measure where the old one measured 4.2 (it ran 1.6 m into the road and drew the sidewalk across the foreground of 0829 / 0830)
  const yAt = (x, z) => L.heightAt(x, z) + 0.05;
  // the pavement: from the kerb to 迎's long face, round the ANCHOR forecourt to the deck
  const walk = [K(0.55), K(0.885), [-12.6, 58.4], [-12.4, 51.6], F(0.68, 0), ANCHOR.P1, [-31.0, 19.6], K(0.55, 8.3)];
  k.mesh(drapeGeo(walk, yAt), m.paver);
  // the pavement on to PIER7's NW corner deck, with a dark sett band toward it (IMG_0799, 0823)
  k.mesh(drapeGeo([[-12.6, 58.4], [-7.6, 58.8], [-2, 62], [-4.5, 74.9], [-6.2, 79], [-12.9, 69.2], [-18.5, 61.5]], yAt), m.paver);   // east of the S1 kerb
  { const a = [-14.5, 62], b = [-6.5, 74], s = seg(a, b), g = new THREE.PlaneGeometry(0.9, s.len, 1, 20); g.rotateX(-Math.PI / 2); const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) { const lx = pa.getX(i), lz = pa.getZ(i), wx = s.x + lx * Math.cos(s.rotY) + lz * Math.sin(s.rotY), wz = s.z - lx * Math.sin(s.rotY) + lz * Math.cos(s.rotY); pa.setY(i, yAt(wx, wz) + 0.012); } g.computeVertexNormals(); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.9, uv.getY(i) * s.len); k.mesh(g, m.sett, [s.x, 0, s.z], [0, s.rotY, 0]); }
  // the dark sett band 2.2 m in from the kerb (tactile line), and the kerb stones
  { const a = K(0.56, 2.2), b = K(0.875, 2.2), s = seg(a, b); const g = new THREE.PlaneGeometry(0.6, s.len, 1, 24); g.rotateX(-Math.PI / 2); const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) { const lx = pa.getX(i), lz = pa.getZ(i); const wx = s.x + lx * Math.cos(s.rotY) + lz * Math.sin(s.rotY), wz = s.z - lx * Math.sin(s.rotY) + lz * Math.cos(s.rotY); pa.setY(i, yAt(wx, wz) + 0.012); } g.computeVertexNormals(); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.6, uv.getY(i) * s.len); k.mesh(g, m.sett, [s.x, 0, s.z], [0, s.rotY, 0]); }
  { const a = K(0.55, -0.1), b = K(0.885, -0.1); for (let f = 0; f < 1; f += 0.05) { const p = lerp(a, b, f + 0.025); k.box(0.2, 0.18, 0.05 * 116.35 * 0.335 + 0.02, m.concrete, [p[0], yAt(p[0], p[1]) - 0.06, p[1]], [0, Math.atan2(t[0], t[1]), 0]); } }
  // street trees in square grates at the kerb (IMG_0828: young maples turning, staked)
  for (const sp of [0.645, 0.715, 0.785]) { const [x, z] = K(sp, 0.9), y = yAt(x, z); k.box(1.2, 0.03, 1.2, m.darkConcrete, [x, y + 0.01, z], [0, Math.atan2(t[0], t[1]), 0]); youngTree(k, m, x, y, z, 0.8, ctx.rng('p5tree' + sp)); }   // [v6:fix1] the 4th tree (3 m from the IMG_0829 camera, filling the right of the frame) is not in the photo; the rest smaller
  // cars parked along the grey box and the forecourt (IMG_0826-0828: a maroon kei nearest, white and silver beyond)
  const rot = Math.atan2(t[0], t[1]);
  D.car(...(([x, z]) => [x, L.heightAt(x, z), z])(K(0.822, 3.0)), rot, { color: '#6e1f2c', kind: 'kei' });
  D.car(...(([x, z]) => [x, L.heightAt(x, z), z])(K(0.755, 4.8)), rot + Math.PI, { color: '#e9e9e6', kind: 'compact' });
  D.car(...(([x, z]) => [x, L.heightAt(x, z), z])(K(0.715, 4.8)), rot + Math.PI, { color: '#f1f1ee', kind: 'van' });
  D.car(...(([x, z]) => [x, L.heightAt(x, z), z])(K(0.67, 4.8)), rot + Math.PI, { color: '#b9bcc0', kind: 'compact' });
}

// ======================================================================================================== the plaza
/** The flat plaza at quay level, the ring benches, the bleachers, the walkway, the stair cage, the gate post and winch. */
export function buildPlazaPhotos(ctx, k, { L, wallCrest = MINAMI.wallCrest }) {
  const m = mats5(ctx), phys = ctx.physics, r = ctx.rng('p5plaza');
  // [v6:rebuild] the paving: flat at the surveyed T.P. 1.83 inside the plaza (layout.js GROUND_PADS lowers the DEM's
  // pre-2018 2.1 m under it); outside, draped 5 cm over the terrain
  const y = PLAZA_Y, yAt = (x, z) => (inPoly(x, z, PLAZA) ? y : Math.max(y, L.heightAt(x, z) + 0.05));
  const pavUV = (x, z) => [(x * PAV6.e1[0] + z * PAV6.e1[1]) / 8, (x * PAV6.e2[0] + z * PAV6.e2[1]) / 8];   // [v6:fix1] pavers run along the bands
  { const o = obbOf(PLAZA), pos = [], uv = [], idx = [], G = 1.0, nu = Math.ceil(o.d / G), nv = Math.ceil(o.w / G), id = new Map();
    const ptAt = (i, j) => [o.cx + o.ux * (-o.d / 2 + i * G) - o.uz * (-o.w / 2 + j * G), o.cz + o.uz * (-o.d / 2 + i * G) + o.ux * (-o.w / 2 + j * G)];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const q = [ptAt(i, j), ptAt(i + 1, j), ptAt(i + 1, j + 1), ptAt(i, j + 1)], c = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
      if (!inPoly(c[0], c[1], PLAZA)) continue;
      const vi = q.map(([x, z], t) => { const key = (i + (t === 1 || t === 2 ? 1 : 0)) + ',' + (j + (t >= 2 ? 1 : 0)); if (!id.has(key)) { id.set(key, pos.length / 3); pos.push(x, yAt(x, z), z); uv.push(...pavUV(x, z)); } return id.get(key); });
      idx.push(vi[0], vi[2], vi[1], vi[0], vi[3], vi[2]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let t2 = 0; t2 < ix.length; t2 += 3) { const tmp = ix[t2 + 1]; ix[t2 + 1] = ix[t2 + 2]; ix[t2 + 2] = tmp; } g.computeVertexNormals(); }
    k.mesh(g, m.paver); }
  // [v6:rebuild] the forecourt north of the old plaza outline, up to the bleachers' far block (IMG_0808, 0809: flat paving
  // there, the far seat steps ~45 m from the plaza camera; the lawn bank and the asphalt apron lie beyond)
  k.mesh(drapeGeo(PLAZA_N, () => y, 1.0, pavUV), m.paver);
  // [v6:fix1] the paving east of the plaza out to the quay edge (IMG_0809-0812), a hair above the quay apron under it
  k.mesh(drapeGeo(PLAZA_E, () => y + 0.012, 1.0, pavUV), m.paver);
  // [v6:fix1] bands of small granite setts, all parallel at bearing 328 deg (PAV6): drawn as 1 m quads along each band's measured
  // centre line, kept where they lie on the paving and clear of the ring benches
  {
    const onPave = (x, z) => inPoly(x, z, PLAZA) || inPoly(x, z, PLAZA_N) || inPoly(x, z, PLAZA_E);
    const clear = (x, z) => RINGS6.every(({ c, d }) => Math.hypot(x - c[0], z - c[1]) > d / 2 + 0.25) && !(Math.hypot(x - 21.9, z - 48.9) < 2.2);
    for (const { t: tb, w, u0: bu0, u1: bu1 } of PAV6.bands) {
      const pos = [], uv = [], idx = [], e1 = PAV6.e1, e2 = PAV6.e2; let vi = 0;
      for (let u = bu0; u < bu1; u += 1.0) {
        const cx = e1[0] * (u + 0.5) + e2[0] * tb, cz = e1[1] * (u + 0.5) + e2[1] * tb;
        if (!onPave(cx, cz) || !clear(cx, cz)) continue;
        for (const [du, dt] of [[0, -w / 2], [1, -w / 2], [1, w / 2], [0, w / 2]]) { const x = e1[0] * (u + du) + e2[0] * (tb + dt), z = e1[1] * (u + du) + e2[1] * (tb + dt); pos.push(x, yAt(x, z) + 0.012, z); uv.push(dt / 1 + w / 2, u + du); }
        idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2); vi += 4;
      }
      if (!vi) continue;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let t2 = 0; t2 < ix.length; t2 += 3) { const tmp = ix[t2 + 1]; ix[t2 + 1] = ix[t2 + 2]; ix[t2 + 2] = tmp; } g.computeVertexNormals(); }
      k.mesh(g, m.sett);
    }
  }
  // [v6:rebuild] the ring benches at their surveyed centres and sizes (RINGS6): a white precast rim 0.27 m over the paving
  // at the front, a lower inner seat ring, a sunken lawn with a young staked tree (ring B's trunk measured from two standing
  // spots) and two low bollard lamps on the seat ring (IMG_0801, 0805, 0807, 0813)
  RINGS6.forEach(({ c: [x, z], d, tree, crown, gap }, i) => {
    const R = d / 2, W = m.whiteD, g0 = gap ? gap[0] : 0, g1 = gap ? gap[1] : 0;
    // the outer wall: a full ring, or the C (its end faces flat, IMG_0800 / 0801); inside it a lower seat ring all round
    if (gap) k.mesh(arcSolid(x, z, R - 0.42, R, g1, g0 + 360, y - 0.05, y + RING_H), W); else k.mesh(arcSolid(x, z, R - 0.42, R, 0, 360, y - 0.05, y + RING_H), W);
    k.mesh(arcSolid(x, z, R - 0.9, R - 0.42, 0, 360, y - 0.05, y + RING_H - 0.14), W);
    const lw = new THREE.CircleGeometry(R - 0.9, 32); lw.rotateX(-Math.PI / 2); k.mesh(lw, m.lawn, [x, y - 0.1, z]);
    crownTree(k, m, tree[0], y - 0.1, tree[1], crown, r);
    for (const a of (gap ? [0.6, 3.52] : [0.6, 3.3]))   // [v6:fix2] ring C's second lamp: IMG_0808's glow cuts at (20.1, T.P. 2.3, 53.3) = angle 202 deg on the inner seat (it stood at 240 deg, 1.1 m off, and shows as a bollard the photo lacks)
     { const lx = x + Math.cos(a) * (R - 0.66), lz = z + Math.sin(a) * (R - 0.66); k.cyl(0.07, 0.07, 0.55, m.grey, [lx, y + RING_H - 0.14 + 0.27, lz], null, 8); k.box(0.12, 0.12, 0.12, m.lamp, [lx, y + RING_H + 0.21, lz]); }
    phys?.addBox?.(x, z, d, d, 0, y, y + RING_H);
  });
  // [v6:fix2] the two slender young street trees in IMG_0808 (the bleachers' tier 3-4 step at (2.5, T.P. 4.0, 36.1), 32.6 m from the camera, 6.5 m tall; and one 3.3 m tall
  // on the stair's top landing at (3.8, T.P. 5.05, 30.0)): base rays of the photo cut on the bleacher surface (tools/survey/minami_fix2.py)
  youngTree(k, m, 2.55, 4.0, 36.1, 1.55, r); youngTree(k, m, 3.76, 5.05, 29.96, 0.85, r);
  ctx.features?.add('minami', 'tree.bleacher#1', [2.55, 4.0, 36.1]); ctx.features?.add('minami', 'tree.bleacher#2', [3.76, 5.05, 29.96]);
  ctx.features?.dim?.('minami', 'pier7.stilt_pitch', PIER7_6.stilt); ctx.features?.dim?.('minami', 'pier7.seam_nw', PIER7_6.cuts[0]); ctx.features?.dim?.('minami', 'pier7.roof_nw_y', 9.0);
  // [v6:fix1] the 陸閘 winch at its surveyed feet (WINCH6), as IMG_0807 / 0808 show it: galvanised grey, not white. Two 0.20 m square
  // posts 2.67 m tall with pyramid tips on cast pedestals, standing on a 2.9 m I-beam; the south post carries a round gearbox
  // (0.38-0.95 m above the paving) and the 0.58 m hand wheel 0.7 m up, its shaft running to the north post's smaller box
  // (0.30-0.80 m); a dark grating plate under it.
  { const { a, b, h } = WINCH6, s = seg(a, b), half = s.len / 2, rot = Math.atan2(-s.uz, s.ux);
    const g = k.group([s.x, y, s.z], rot), kk = ctx.kit(g);   // local x: a -> b; local +z: toward the plaza camera (east)
    kk.box(s.len + 1.0, 0.03, 2.4, m.darkConcrete, [0, 0.015, 0.7]); kk.box(1.1, 0.035, 0.9, m.rust, [0.9, 0.02, 1.4]);
    // the I-beam base: web 0.05 x 0.22, flanges 0.30 x 0.035
    kk.box(s.len + 1.0, 0.035, 0.30, m.galv, [0, 0.04, 0]); kk.box(s.len + 1.0, 0.035, 0.30, m.galv, [0, 0.255, 0]); kk.box(s.len + 1.0, 0.22, 0.05, m.galvD, [0, 0.15, 0]);
    for (const sx of [-half, half]) {
      kk.box(0.34, 0.24, 0.34, m.galvD, [sx, 0.38, 0]); kk.box(0.26, 0.2, 0.26, m.galv, [sx, 0.6, 0]);   // cast pedestal
      kk.box(0.2, h - 0.25 - 0.7, 0.2, m.galv, [sx, 0.7 + (h - 0.95) / 2, 0]);
      kk.mesh(new THREE.ConeGeometry(0.1414, 0.25, 4), m.galv, [sx, h - 0.125, 0], [0, Math.PI / 4, 0]);
    }
    // the south (a) gearbox: a round housing with the shaft boss and a bolt ring on its plaza face
    kk.box(0.5, 0.57, 0.46, m.galvD, [-half, 0.665, 0.05]); kk.cyl(0.25, 0.25, 0.1, m.galv, [-half, 0.665, 0.32], [Math.PI / 2, 0, 0], 14); kk.cyl(0.11, 0.11, 0.14, m.galvD, [-half + 0.28, 0.7, 0.02], [0, 0, Math.PI / 2], 10);
    // the north (b) gearbox
    kk.box(0.4, 0.5, 0.36, m.galvD, [half, 0.55, 0.04]); kk.cyl(0.17, 0.17, 0.08, m.galv, [half, 0.55, 0.25], [Math.PI / 2, 0, 0], 12);
    // the shaft and the 0.58 m hand wheel beside the south gearbox (plane normal along the shaft)
    kk.cyl(0.03, 0.03, s.len - 0.6, m.galv, [0, 0.7, 0.02], [0, 0, Math.PI / 2], 6);
    kk.mesh(new THREE.TorusGeometry(0.29, 0.022, 6, 24), m.galv, [-half + 0.62, 0.7, 0.02], [0, Math.PI / 2, 0]);
    for (let q = 0; q < 3; q++) kk.box(0.02, 0.58, 0.02, m.galv, [-half + 0.62, 0.7, 0.02], [q * Math.PI / 3, 0, 0]);
    kk.cyl(0.05, 0.05, 0.1, m.galvD, [-half + 0.62, 0.7, 0.02], [0, 0, Math.PI / 2], 8);
    phys?.addBox?.(s.x, s.z, s.len + 0.8, 0.6, s.rotY + Math.PI / 2, y, y + h); }
  // [v6:rebuild] the bleachers (BLEACH6): tiers A-E between the cage face and the stair, the stair to the top deck, the far
  // block of seat steps with its landing; reddish composite boards. X(u, w) maps the bleachers' frame to ENU.
  {
    const B6 = BLEACH6, X = (u, w) => [B6.O[0] + B6.U[0] * u + B6.W[0] * w, B6.O[1] + B6.U[1] * u + B6.W[1] * w];
    const solid = (P, y0, y1) => { k.mesh(prismWalls(P, y0, y1, { tile: 3 }), m.comp); k.mesh(capGeo(P, y1, { tile: 2 }), m.comp); if (phys?.addWalkBox) { const o = obbOf(P); phys.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, y1, y0); } };
    const T = B6.tiers;
    T.forEach(([w0, top], i) => { const w1 = i < T.length - 1 ? T[i + 1][0] : B6.back; solid([X(B6.cage * w0 + 0.08, w0), X(B6.uS, w0), X(B6.uS, w1), X(B6.cage * w1 + 0.08, w1)], y - 0.1, top); });
    // the stair: 16 risers of 0.215 m from the paving to the top deck, stainless rails with lamps in the cheeks
    const n = B6.risers, rise = (T[T.length - 1][1] - y) / n, run = B6.back / n, u0 = B6.uS, u1 = B6.uS + B6.stairW;
    for (let i = 0; i < n; i++) solid([X(u0, i * run), X(u1, i * run), X(u1, B6.back), X(u0, B6.back)], y - 0.1, y + rise * (i + 1));
    // [v6:fix1] no stair rails here: the photo (IMG_0808) shows the bleacher steps open, with one thin handrail on the far block only
    void u1;
    // the far block: seat steps from its front line (u0 -> u1 at w0 -> w1) back toward the lawn, the landing on top
    { const Fb = B6.far, f0 = X(Fb.u0, Fb.w0), f1 = X(Fb.u1, Fb.w1), sf = seg(f0, f1); let bn = [sf.uz, -sf.ux]; if (bn[0] * (f0[0] - 31.2) + bn[1] * (f0[1] - 51.6) < 0) bn = [-bn[0], -bn[1]];   // away from the plaza
      Fb.steps.forEach((top, i) => { const d0 = i * Fb.tread, d1 = Fb.tread * (Fb.steps.length + 3); solid([[f0[0] + bn[0] * d0, f0[1] + bn[1] * d0], [f1[0] + bn[0] * d0, f1[1] + bn[1] * d0], [f1[0] + bn[0] * d1, f1[1] + bn[1] * d1], [f0[0] + bn[0] * d1, f0[1] + bn[1] * d1]], y - 0.1, top); }); }
    // floor uplights in the tier fronts and the stair cheeks (IMG_0808: warm dots at dusk)
    T.forEach(([w0, top], i) => { for (const f of [0.3, 0.7]) { const p = X(B6.cage * w0 + (B6.uS - B6.cage * w0) * f, w0 - 0.01); k.box(0.12, 0.06, 0.02, m.lamp, [p[0], top - 0.35, p[1]], [0, Math.atan2(B6.W[0], B6.W[1]), 0]); } });
    // [v5:detail] people sitting at dusk (IMG_0808: one on tier A by the stair, two on the far landing)
    { const P2 = detailKit(ctx, k), face = Math.atan2(-B6.W[0], -B6.W[1]); for (const [u, w, yy, top, bot] of [[9.0, 0.45, T[0][1], '#2d3138', '#25262b'], [16.0, 17.6, B6.far.steps[3], '#6b5a4a', '#2b2c33'], [16.6, 18.0, B6.far.steps[3], '#c9c3b6', '#35353d']]) { const p = X(u, w); P2.person(p[0], yy, p[1], face, { sit: 0.45, top, bottom: bot }); } }
  }
  // [v6:rebuild] the elevated walkway (WALK6): concrete deck, dark fascia, stainless rail with lights, two board-formed piers
  {
    const S = resample(WALKWAY, 1.0), side = [], top = WALK6.top, th = WALK6.th, hw = WALK6.w / 2;
    for (let i = 0; i < S.length - 1; i++) { const a = [S[i].x, S[i].z], b = [S[i + 1].x, S[i + 1].z], s = seg(a, b); k.box(WALK6.w, th, s.len + 0.05, m.concrete, [s.x, top - th / 2, s.z], [0, s.rotY, 0]); for (const sd of [-1, 1]) k.box(0.12, 0.85, s.len + 0.05, m.concrete, [s.x + s.uz * sd * (hw + 0.02), top - 0.35, s.z - s.ux * sd * (hw + 0.02)], [0, s.rotY, 0]); /* [v6:fix1] light-grey board-formed fascia (IMG_0819 / 0820), not charcoal */ if (phys?.addWalkBox) phys.addWalkBox(s.x, s.z, WALK6.w, s.len + 0.05, s.rotY, top, top - 1); }
    for (const sd of [-1, 1]) { side.length = 0; for (const p of S) side.push([p.x + p.uz * sd * (hw - 0.2), p.z - p.ux * sd * (hw - 0.2)]); railAlong(k, m, side.slice(), top); }
    for (const [px, pz] of WALK6.piers) { const gy = yAt(px, pz); k.box(0.9, top - th - gy + 0.1, 0.9, m.wall, [px, (top - th + gy) / 2, pz], [0, Math.atan2(0.17, 0.98), 0]); phys?.addBox?.(px, pz, 0.9, 0.9, 0, gy, top - th); }
  }
  // [v6:fix1] the gate's east post (WALK6.gatePost): a board-formed concrete pier 2.2 x 1.3 m (IMG_0807: front face 74 px + side 43 px at 30 m)
  // carrying the walkway's south end, the yellow 注意 notice board on its plaza face: 1.7 x 1.2 m, T.P. 2.54-3.70 (3 x the old
  // 0.75 x 1.1 m, 0.7 m lower), a 0.5 m pictogram plate under it, and the camera on a bracket
  { const [x, z] = WALK6.gatePost, gy = y, top = WALK6.top - WALK6.th, nb = [0.875, -0.484], uu = [0.484, 0.875], rot = Math.atan2(-uu[1], uu[0]);
    k.box(2.2, top - gy + 0.1, 1.3, m.concrete, [x, (top + gy) / 2, z], [0, rot, 0]);
    const fx = x + nb[0] * 0.67, fz = z + nb[1] * 0.67;
    sign(ctx, k, '注意', 1.7, 1.2, fx, 3.12, fz, ry(nb), { color: '#2b2a33', bg: C5.yellow, font: FONT.sans });
    k.box(0.5, 0.45, 0.02, m.black, [fx + nb[0] * 0.01 - uu[0] * 0.5, 2.0, fz + nb[1] * 0.01 - uu[1] * 0.5], [0, ry(nb), 0]);
    k.box(0.5, 0.3, 0.3, m.white, [x + nb[0] * 0.8, top - 0.3, z + nb[1] * 0.8]); phys?.addBox?.(x, z, 2.2, 1.3, rot, gy, top); }
  // [v6:rebuild] the white mesh cage along 迎's bay terrace, as surveyed (CAGE6; IMG_0807, 0808, 0809, 0818): a steel frame
  // 21.3 m x 3.6 m, 9 bays of two mesh panels on the long faces, rails at the plinth, 3.13, 4.35, the deck beam at 5.70 and
  // the top rail at 7.24; the deck at the wall crest on the beam with a mesh rail band and string lights; on the front face
  // the concrete 陸閘 gate post under the box with the red beacon, the dark steel gate leaf in its pocket, a mesh column
  {
    const C6 = CAGE6, TL = C6.TL, CR = C6.CR, EN = C6.EN, fx = CR[0] - TL[0], fz = CR[1] - TL[1], fL = Math.hypot(fx, fz), sx = EN[0] - CR[0], sz = EN[1] - CR[1], sL = Math.hypot(sx, sz);
    const fu = [fx / fL, fz / fL], su = [sx / sL, sz / sL], P = (a, b) => [TL[0] + fu[0] * a + su[0] * b, TL[1] + fu[1] * a + su[1] * b];
    const y0 = C6.foot, white = m.cage, rotF = Math.atan2(fu[0], fu[1]), rotS = Math.atan2(su[0], su[1]);
    const post = (p, yy0, yy1, w = 0.15) => k.box(w, yy1 - yy0, w, white, [p[0], (yy0 + yy1) / 2, p[1]], [0, rotS, 0]);
    const rail = (p, q, yy, h = 0.1, w = 0.1) => barAlong(k, p, q, yy, w, h, white);
    const meshPanel = (p, q, yy0, yy1, inset = 0) => { const s = seg(p, q), W2 = s.len - 0.06, H2 = yy1 - yy0 - 0.04; if (W2 <= 0 || H2 <= 0) return; const gg = new THREE.PlaneGeometry(W2, H2); const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W2 / 0.64, uv.getY(i) * H2 / 0.64); const mm = k.mesh(gg, m.grating, [s.x, (yy0 + yy1) / 2, s.z], [0, s.rotY + Math.PI / 2, 0]); void inset; return mm; };
    const rowsY = [C6.plinth, ...C6.rows, C6.beam - 0.12];
    // the long faces (a = fL: the plaza side; a = 0: the terrace side) and the far end (b = sL)
    for (const a of [fL, 0]) {
      const bay = sL / C6.bays;
      for (let i = 0; i <= C6.bays; i++) post(P(a, i * bay), y0, C6.top, i === 0 || i === C6.bays ? 0.18 : 0.15);
      for (const yy of [...rowsY, C6.top - 0.05]) rail(P(a, 0), P(a, sL), yy, yy === C6.beam - 0.12 ? 0.26 : 0.1);
      k.mesh(prismWalls([P(a - 0.06, 0), P(a - 0.06, sL), P(a + 0.06, sL), P(a + 0.06, 0)], y0, C6.plinth), white);
      for (let i = 0; i < C6.bays; i++) for (const h2 of [0, 1]) {
        const b0 = (i + h2 / 2) * bay, b1 = (i + (h2 + 1) / 2) * bay;
        if (h2 === 1) post(P(a, b0), C6.plinth, C6.beam, 0.07);
        for (let r2 = 0; r2 < rowsY.length - 1; r2++) meshPanel(P(a, b0), P(a, b1), rowsY[r2], rowsY[r2 + 1]);
        meshPanel(P(a, b0), P(a, b1), C6.beam + 0.14, C6.top - 0.1);   // the rail band on the deck
      }
    }
    { const p = P(0, sL), q = P(fL, sL); for (const yy of [...rowsY, C6.top - 0.05]) rail(p, q, yy); for (let r2 = 0; r2 < rowsY.length - 1; r2++) meshPanel(p, q, rowsY[r2], rowsY[r2 + 1]); meshPanel(p, q, C6.beam + 0.14, C6.top - 0.1); }
    // the deck on the beam (a white grating seen from the terrace) and the string lights along the plaza-side rail band
    k.mesh(capGeo([P(0, 0), P(fL, 0), P(fL, sL), P(0, sL)], C6.beam + 0.14, { tile: 1 }), m.cageD);
    { const pa = P(fL + 0.05, 0), pb = P(fL + 0.05, sL); stringLights(k, m, [pa[0], C6.top - 0.18, pa[1]], [pb[0], C6.top - 0.18, pb[1]], 0.45, 0.06); stringLights(k, m, [pa[0], C6.beam + 0.32, pa[1]], [pb[0], C6.beam + 0.32, pb[1]], 0.45, 0.25); }
    // the front face (b = 0): the concrete gate post under the box (a -0.2..0.9, 1.1 m deep), the dark gate leaf, a dark
    // recess, the mesh column by the corner; the box above with mesh at both ends and an open middle
    // [v6:fix1] the concrete gate post fills the front face from the box's left end to the mesh column (a -0.2..2.75, light-grey
    // board-formed concrete, IMG_0808 close-up: two piers with a narrow dark slot between them), no gate leaf
    { const gp = [P(-0.2, -0.05), P(2.75, -0.05), P(2.75, 1.1), P(-0.2, 1.1)]; k.mesh(prismWalls(gp, y0 - 0.1, C6.beam, { tile: 3 }), m.concrete); k.mesh(capGeo(gp, C6.beam, { tile: 2 }), m.concrete); phys?.addBox?.(...(() => { const o = obbOf(gp); return [o.cx, o.cz, o.w, o.d, o.rotY]; })(), y0, C6.beam); }
    { const p = P(1.55, -0.07), q = P(1.85, -0.07), s2 = seg(p, q); k.box(s2.len, C6.beam - 0.3 - y0, 0.04, m.darkConcrete, [s2.x, (y0 + C6.beam - 0.3) / 2, s2.z], [0, s2.rotY + Math.PI / 2, 0]); }
    for (const a of [2.75, fL]) post(P(a, 0), y0, C6.top, a === fL ? 0.18 : 0.12);
    post(P(1.45, 0), C6.beam, C6.top, 0.1);
    post(P(0, 0), C6.beam, C6.top, 0.16);
    for (const yy of [C6.beam - 0.12, C6.top - 0.05]) rail(P(-0.05, 0), P(fL, 0), yy, yy < C6.top - 1 ? 0.26 : 0.1);
    for (const yy of rowsY.slice(0, -1)) rail(P(2.75, 0), P(fL, 0), yy);
    for (let r2 = 0; r2 < rowsY.length - 1; r2++) meshPanel(P(2.75, 0), P(fL, 0), rowsY[r2], rowsY[r2 + 1]);
    meshPanel(P(0.08, 0), P(1.4, 0), C6.beam + 0.14, C6.top - 0.1); meshPanel(P(2.82, 0), P(fL - 0.08, 0), C6.beam + 0.14, C6.top - 0.1);
    rail(P(0, 0), P(fL, 0), C6.beam + 1.05, 0.06, 0.06);
    // the red beacon and the horn speaker on the box (IMG_0818)
    { const p = P(0.35, 0.35); k.cyl(0.04, 0.04, 0.55, m.grey, [p[0], C6.top + 0.27, p[1]], null, 6); k.cyl(0.11, 0.12, 0.2, m.red, [p[0], C6.top + 0.62, p[1]], null, 10); const hp = P(0.7, 0.35); k.mesh(new THREE.ConeGeometry(0.14, 0.32, 10, 1, true), m.white, [hp[0], C6.top + 0.42, hp[1]], [0, rotF, Math.PI / 2]); }
    phys?.addBox?.(...(() => { const o = obbOf([P(0, 0), P(fL, 0), P(fL, sL), P(0, sL)]); return [o.cx, o.cz, o.w, o.d, o.rotY]; })(), y0, C6.top);
  }
  // [v5:detail] the broad composite stair runs along 迎's SE face from the deck up to the bay terrace at the wall crest
  // (IMG_0824: it rises to the right behind the totem, in front of the glazed corner; IMG_0820: seen from the east, its
  // high end to the right): 11 risers, 5 m wide, stainless rails with string lights and a middle rail
  {
    const { P2, P3 } = ANCHOR, sl = Math.hypot(P3[0] - P2[0], P3[1] - P2[1]), su = [(P3[0] - P2[0]) / sl, (P3[1] - P2[1]) / sl], sn = [-su[1], su[0]];
    const y0 = ANCHOR.floor, n = 20, run = (sl + 0.4) / n, rise = (wallCrest - y0) / n, W = 5.0, rot = Math.atan2(su[0], su[1]);   // [v6:rebuild] ~20 risers of 0.18 m (IMG_0824)
    const at = (along, out) => [P2[0] + su[0] * along + sn[0] * out, P2[1] + su[1] * along + sn[1] * out];
    for (let i = 0; i < n; i++) { const yy = y0 + rise * (i + 1), [cx, cz] = at(run * (i + 0.5), 0.3 + W / 2); k.box(W, yy - y0 + 0.3, run, m.comp, [cx, (yy + y0 - 0.3) / 2, cz], [0, rot + Math.PI / 2, 0]); if (phys?.addWalkBox) phys.addWalkBox(cx, cz, W, run, rot + Math.PI / 2, yy, y0); }
    // the side cheek: dark timber slats under the outer rail (IMG_0820)
    { const L2 = run * n, [cx, cz] = at(L2 / 2, 0.3 + W + 0.1); const g = new THREE.BufferGeometry(); const A0 = at(0, 0.3 + W + 0.12), A1 = at(L2, 0.3 + W + 0.12); g.setAttribute('position', new THREE.Float32BufferAttribute([A0[0], y0 - 0.3, A0[1], A1[0], y0 - 0.3, A1[1], A1[0], wallCrest, A1[1], A0[0], y0 - 0.3, A0[1], A1[0], wallCrest, A1[1], A0[0], y0 + rise, A0[1]], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, L2 / 2, 0, L2 / 2, 1.5, 0, 0, L2 / 2, 1.5, 0, 0.2], 2)); g.computeVertexNormals(); k.mesh(g, m.timberDark); void cx; void cz; }
    // the landing at the top, joining the terrace
    { const [cx, cz] = at(run * n + 1.2, 0.3 + W / 2); k.box(W + 0.6, 0.3, 2.4, m.comp, [cx, wallCrest - 0.15, cz], [0, rot + Math.PI / 2, 0]); if (phys?.addWalkBox) phys.addWalkBox(cx, cz, W + 0.6, 2.4, rot + Math.PI / 2, wallCrest, wallCrest - 1); }
    for (const off of [0.45, 0.3 + W / 2, 0.15 + W]) {
      const a2 = at(0, off), b2 = at(run * n, off), ss = seg(a2, b2), ya = y0 + 1.0, yb = wallCrest + 1.0;
      const rl = k.box(0.06, 0.06, Math.hypot(ss.len, yb - ya), m.rail, [ss.x, (ya + yb) / 2, ss.z]); rl.rotation.order = 'YXZ'; rl.rotation.set(-Math.atan2(yb - ya, ss.len), ss.rotY, 0);
      for (let i = 0; i <= 4; i++) { const f = i / 4, p = lerp(a2, b2, f), py = y0 + (wallCrest - y0) * f; k.box(0.05, 1.0, 0.05, m.rail, [p[0], py + 0.5, p[1]]); }
      if (off !== 0.45) stringLights(k, m, [a2[0], ya + 0.03, a2[1]], [b2[0], yb + 0.03, b2[1]], 0.5, 0.12);
    }
  }
  // [v6:fix1] the quay-edge railing, the A-frame racks and the mesh-backed benches along the paving edge (IMG_0810 / 0811: white
  // tubular A-frames about every 3.2 m (8 along the edge from IMG_0810), two long pipe rails through them at 0.4 and 1.05 m, black
  // net hung between the frames, a bench in two bays). RAIL6 is the line; frames lean 0.35 m seaward at the apex, 2.7 m high.
  {
    const R = RAIL6, lens = [], tot = (() => { let t = 0; for (let i = 1; i < R.length; i++) { const l = Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]); lens.push(l); t += l; } return t; })();
    const at = (sv) => { let i = 0, rem = Math.max(0, Math.min(tot, sv)); while (i < lens.length - 1 && rem > lens[i]) { rem -= lens[i]; i++; } const f = rem / lens[i], a = R[i], b = R[i + 1], t = [(b[0] - a[0]) / lens[i], (b[1] - a[1]) / lens[i]]; return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t, n: [t[1], -t[0]] }; };
    const y1 = y + 0.012, frames = [];
    for (let i = 0; i < 8; i++) frames.push(1.0 + i * 3.2);
    for (const sv of frames) {
      const { p, t, n } = at(sv), L1 = [p[0] - t[0] * 0.6, y1, p[1] - t[1] * 0.6], L2 = [p[0] + t[0] * 0.6, y1, p[1] + t[1] * 0.6], ap = [p[0] + n[0] * 0.35, y1 + 2.7, p[1] + n[1] * 0.35];
      pipe(k, m.pipe, L1, ap, 0.027); pipe(k, m.pipe, L2, ap, 0.027); pipe(k, m.pipe, [p[0] - t[0] * 0.3, y1 + 1.05, p[1] - t[1] * 0.3], [p[0] + t[0] * 0.3, y1 + 1.05, p[1] + t[1] * 0.3], 0.02);
      pipe(k, m.pipe, ap, [ap[0] + n[0] * 0.9, ap[1] - 0.25, ap[2] + n[1] * 0.9], 0.02);
    }
    for (const hh of [0.4, 1.05]) { const a0 = at(0.3), a1 = at(tot - 0.3); pipe(k, m.pipe, [a0.p[0], y1 + hh, a0.p[1]], [R[1][0], y1 + hh, R[1][1]], 0.022); pipe(k, m.pipe, [R[1][0], y1 + hh, R[1][1]], [a1.p[0], y1 + hh, a1.p[1]], 0.022); }
    for (let i = 0; i + 1 < frames.length; i++) {   // net panels between frames, a bench in bays 2 and 5
      const A1 = at(frames[i] + 0.7), B1 = at(frames[i + 1] - 0.7), sg = seg(A1.p, B1.p), ng = new THREE.PlaneGeometry(sg.len, 1.2), nuv = ng.attributes.uv; for (let q = 0; q < nuv.count; q++) nuv.setXY(q, nuv.getX(q) * sg.len / 0.4, nuv.getY(q) * 1.2 / 0.4); k.mesh(ng, m.net, [sg.x + A1.n[0] * 0.08, y1 + 1.0, sg.z + A1.n[1] * 0.08], [0, Math.atan2(A1.n[0], A1.n[1]), 0]);
      if (i === 1 || i === 4) { const c = at((frames[i] + frames[i + 1]) / 2), rt = Math.atan2(c.n[0], c.n[1]); k.box(1.6, 0.06, 0.42, m.deck, [c.p[0] - c.n[0] * 0.55, y1 + 0.45, c.p[1] - c.n[1] * 0.55], [0, rt, 0]); for (const q of [-0.7, 0.7]) k.box(0.06, 0.45, 0.4, m.black, [c.p[0] - c.n[0] * 0.55 + c.t[0] * q, y1 + 0.22, c.p[1] - c.n[1] * 0.55 + c.t[1] * q], [0, rt, 0]); }
    }
    phys?.addBox?.(...(() => { const o = obbOf([R[0], R[1], R[2], [R[2][0] + 0.8, R[2][1] + 0.4], [R[0][0] + 0.8, R[0][1] + 0.4]]); return [o.cx, o.cz, o.w, o.d, o.rotY]; })(), y, y + 1.2);
  }
  plazaFeatures(ctx, { y });   // [v6:survey]
  return { y, top: wallCrest, bot: y, flat: true };
}

/** [v6:survey] The plaza's named features as built (ENU metres), for tools/anime/survey-diff.mjs against the photo survey
 *  data/survey/minami/features.json (names in docs/anime/survey/minami.md; name#k groups are matched without order). */
export function plazaFeatures(ctx, { y }) {
  const F = ctx.features; if (!F) return;
  const A = 'minami', brg = (dx, dz) => ((Math.atan2(dx, -dz) * 180 / Math.PI) % 180 + 180) % 180;
  F.dim(A, 'plaza.y', y);
  // the cage: the three surveyed corners (front-left box, corner column, last post of the long face), tops and feet
  { const { TL, CR, EN, foot, beam, top } = CAGE6;
    F.group(A, 'cage.top', [TL, CR, EN].map(([x, z]) => [x, top, z])); F.group(A, 'cage.foot', [TL, CR, EN].map(([x, z]) => [x, foot, z]));
    F.add(A, 'cage.box_bottom', [TL[0], beam, TL[1]]);
    F.dim(A, 'cage.h', top - foot); F.dim(A, 'cage.front_w', Math.hypot(CR[0] - TL[0], CR[1] - TL[1])); F.dim(A, 'cage.side_len', Math.hypot(EN[0] - CR[0], EN[1] - CR[1]));
    F.dim(A, 'cage.front_azimuth_deg', brg(CR[0] - TL[0], CR[1] - TL[1])); F.dim(A, 'cage.side_azimuth_deg', brg(EN[0] - CR[0], EN[1] - CR[1])); }
  // the bleachers: tier A's front corners at both ends, tiers B-E's front corners at the cage face (left) and the stair
  // (right), the stair's first nosing
  { const B6 = BLEACH6, X = (u, w, yy) => [B6.O[0] + B6.U[0] * u + B6.W[0] * w, yy, B6.O[1] + B6.U[1] * u + B6.W[1] * w], T = B6.tiers;
    T.forEach(([w, top], i) => { const bot = i ? T[i - 1][1] : y; F.group(A, `bleach.t${i + 1}.top`, [X(B6.cage * w, w, top), X(B6.uS, w, top)]); F.group(A, `bleach.t${i + 1}.bot`, [X(B6.cage * w, w, bot), X(B6.uS, w, bot)]); });
    const rise = (T[T.length - 1][1] - y) / B6.risers;
    F.group(A, 'bleach.stair.bot', [X(B6.uS, 0, y + rise), X(B6.uS + B6.stairW, 0, y + rise)]);
    F.dim(A, 'bleach.tiers', T.length); F.dim(A, 'bleach.rise', (T[T.length - 1][1] - y) / T.length); F.dim(A, 'bleach.top_y', T[T.length - 1][1]);
    F.dim(A, 'bleach.tread', (T[T.length - 1][0] - T[0][0]) / (T.length - 1)); F.dim(A, 'bleach.front_azimuth_deg', brg(B6.U[0], B6.U[1]));
    F.dim(A, 'bleach.stair.rise', rise); F.dim(A, 'bleach.stair.risers', B6.risers); }
  // the 陸閘 winch: feet and tips of its two pointed posts
  { const { a, b, h } = WINCH6; F.group(A, 'winch.foot', [a, b].map(([x, z]) => [x, y, z])); F.group(A, 'winch.tip', [a, b].map(([x, z]) => [x, y + h, z]));
    F.dim(A, 'winch.post_h', h); F.dim(A, 'winch.span', Math.hypot(a[0] - b[0], a[1] - b[1])); }
  // the ring benches: centres at the paving, ring B's tree, outer diameter (mean of A and B, as surveyed) and rim height
  RINGS6.forEach(({ c: [x, z] }, i) => F.add(A, `ring#${i + 1}`, [x, y, z]));
  F.add(A, 'ring.tree#1', [RING_TREE_B[0], y, RING_TREE_B[1]]);
  { const rc = RINGS6[2], R = rc.d / 2, pt = (t) => [rc.c[0] + R * Math.cos(t * Math.PI / 180), y + RING_H, rc.c[1] + R * Math.sin(t * Math.PI / 180)];   // [v6:fix1] ring C's opening
    F.group(A, 'ringC.gap', [pt(rc.gap[0]), pt(rc.gap[1])]); F.dim(A, 'ringC.d_out', rc.d); F.dim(A, 'ringC.gap_deg', rc.gap[1] - rc.gap[0]);
    RINGS6.forEach((r2, i) => F.dim(A, `ring.crown_top#${'ABC'[i]}`, r2.crown.top));
    F.add(A, 'gate.post', [WALK6.gatePost[0], y, WALK6.gatePost[1]]); }
  F.dim(A, 'ring.d_out', (RINGS6[0].d + RINGS6[1].d) / 2); F.dim(A, 'ring.h', RING_H);
}

// ======================================================================================================== 結, 拓, the slow street
/** 結 ユワエル and 拓 ヒラケル, lot by lot (the GSI footprints tagged yuwaeru / hirakeru), and the slow street between. */
export function buildSlowStreetPhotos(ctx, k, { L, base }) {
  const D = detailKit(ctx, k);
  const m = mats5(ctx), r = ctx.rng('p5slow'), out = { yuwaeru: 0, hirakeru: 0 };
  const lots = (id) => (L.LOTS || []).filter((l) => l.landmark === id);
  const Y = lots('yuwaeru'), H = lots('hirakeru'), others = [...Y, ...H];
  const blocked = (x, z, self) => others.some((l) => l !== self && inPoly(x, z, l.poly));
  // [v5:detail] BLACK TIDE BREWING's front: 3 m west of 結's east corner on the slow-street face (IMG_0835 centres the sign at
  // bearing 322 from the camera; IMG_0836 at 291 shows no sign): the glazed double door under TIDE, the window over the
  // slatted counter under BLACK
  const BT = { E: [-30, 72.4], W: [-0.827, 0.562], n: [0.562, 0.827] }, MAPB = [-43.44, 83.2];
  // 結: single-storey cedar shops behind a colonnade under a white corrugated fascia; a tall white back volume on 376
  const postList = [];
  for (const lot of Y) {
    const P = lot.poly, g0 = base(P), o = obbOf(P);
    if (o.w < 3.2) {   // thin strips: canopies on posts
      k.mesh(capGeo(P, g0 + 4.1, { tile: 3 }), m.roofLight); k.mesh(prismWalls(P, g0 + 3.0, g0 + 4.15, { tile: 3 }), m.corr); k.mesh(capGeo(P, g0 + 3.0, { tile: 3, down: true }), m.soffit);
      for (let s = -o.d / 2 + 0.4; s <= o.d / 2; s += 3.2) postList.push({ px: o.cx + o.ux * s, pz: o.cz + o.uz * s, g0: g0, eaveH: g0 + 3.6, pri: 2 });   // [v6:fix2] built de-duplicated with the colonnade posts below
      continue;
    }
    const eaveH = g0 + 3.5;   // [v6:rebuild] the colonnade fascia spans 2.95-4.03 m over the paving (IMG_0835 cuts on its plane)
    k.mesh(prismWalls(P, g0 - 0.5, eaveH, { tile: 3 }), m.cedar);
    k.mesh(capGeo(P, eaveH + 0.5, { tile: 4 }), m.roofLight);
    k.mesh(prismWalls(offsetRing(P, 0.04), eaveH - 0.6, eaveH + 0.55, { tile: 3 }), m.corr);
    edgesOf(P, (a, b, len, n, u) => {
      if (len < 3) return;
      const s = seg(a, b), mid = [s.x + n[0] * 3, s.z + n[1] * 3], open = !blocked(mid[0], mid[1], lot) && !inPoly(mid[0], mid[1], SITES.mukaeru.poly);
      // [v5:detail] shopfronts (IMG_0834-0839): framed sash windows over slatted counters and glazed double doors, lit
      // interiors (the brewery's taps and fridges, clothes, the noodle bar), orange-stool tables, nobori, a planted strip
      if (!open || len < 6) { if (len >= 4) D.glazing({ a, u, n, s0: len / 2 - 0.8, s1: len / 2 + 0.8, y0: g0 + 1.0, y1: g0 + 2.2, cols: 2, kind: 'dark', out: 0.02, frame: D.M.frameS }); return; }
      const nb = Math.max(1, Math.round((len - 0.8) / 4.4)), bw = (len - 0.8) / nb, kinds = ['brew', 'shop', 'cafe', 'shop', 'brew'];
      const isBT = Math.abs((BT.E[0] - a[0]) * n[0] + (BT.E[1] - a[1]) * n[1]) < 0.8 && n[0] * BT.n[0] + n[1] * BT.n[1] > 0.95;
      const wOf = (sv) => (a[0] + u[0] * sv - BT.E[0]) * BT.W[0] + (a[1] + u[1] * sv - BT.E[1]) * BT.W[1];
      // [v6:fix2] BLACK TIDE's neighbours along the same frontage as IMG_0836 cuts them on the wall plane (W = metres west of the BLACK TIDE east corner): the clothes shop's
      // glazing W 16.7-19.5 (T.P. 2.25-3.8, lit), its small window W 15.2-16.7 (2.65-3.7), the double window W 8.6-11.3 (2.7-4.1, two sashes); cedar between (the TAKEOUT sticker at 11.9)
      if (isBT) { const w0 = wOf(0), sg = Math.sign((u[0] * BT.W[0] + u[1] * BT.W[1]) || 1), sOf2 = (w) => (w - w0) * sg;
        for (const [wa, wb, ya, yb, cols, kind] of [[8.6, 11.3, 0.98, 2.38, 3, 'brew'], [15.2, 16.7, 0.93, 1.98, 1, 'shop'], [16.7, 19.5, 0.53, 2.08, 3, 'shop']]) { const s0 = Math.min(sOf2(wa), sOf2(wb)), s1 = Math.max(sOf2(wa), sOf2(wb)); if (s1 > 0 && s0 < len) D.glazing({ a, u, n, s0: Math.max(0, s0), s1: Math.min(len, s1), y0: g0 + ya, y1: g0 + yb, cols, kind, out: 0.02, frame: D.M.frameW, fw: 0.07 }); } }
      for (let i = 0; i < nb; i++) {
        if (isBT) { const w0 = wOf(0.4 + i * bw), w1 = wOf(0.4 + (i + 1) * bw); if (Math.max(w0, w1) > 0.3 && Math.min(w0, w1) < 19.6) continue; }
        { const c = 0.4 + (i + 0.5) * bw; if (Math.hypot(a[0] + u[0] * c - MAPB[0], a[1] + u[1] * c - MAPB[1]) < 2.6) continue; }   // the map board's plain cedar wall (IMG_0842)
        const s0 = 0.4 + i * bw, kind = kinds[(i + Math.floor(r() * 3)) % kinds.length], doorFirst = (i + lot.id.length) % 2 === 0;
        const dS = doorFirst ? s0 + 0.35 : s0 + bw - 2.15, wS = doorFirst ? s0 + 2.3 : s0 + 0.35;
        D.glazing({ a, u, n, s0: dS, s1: dS + 1.8, y0: g0 + 0.05, y1: g0 + 2.35, cols: 2, transoms: [g0 + 2.0], kind, out: 0.02, frame: D.M.frameS, fw: 0.08 });
        D.glazing({ a, u, n, s0: wS, s1: wS + Math.min(1.9, bw - 2.5), y0: g0 + 0.95, y1: g0 + 2.25, cols: 2, kind, out: 0.02, frame: D.M.frameW, fw: 0.08 });
        { const c = wS + Math.min(1.9, bw - 2.5) / 2, x = a[0] + u[0] * c + n[0] * 0.08, z = a[1] + u[1] * c + n[1] * 0.08; k.box(Math.min(1.9, bw - 2.5), 0.85, 0.08, m.cedar, [x, g0 + 0.45, z], [0, ry(n), 0]); for (let q = -0.8; q <= 0.8; q += 0.2) k.box(0.05, 0.75, 0.04, m.timberDark, [x + u[0] * q + n[0] * 0.05, g0 + 0.45, z + u[1] * q + n[1] * 0.05], [0, ry(n), 0]); }
        const c2 = wS + 0.9, tx = a[0] + u[0] * c2 + n[0] * 1.3, tz = a[1] + u[1] * c2 + n[1] * 1.3;
        if (r() < 0.7) D.cafeSet(tx, g0, tz, ry(n) + Math.PI, { stool: m.orange });
        if (r() < 0.6) { const q = doorFirst ? dS - 0.3 : dS + 2.1; D.nobori(a[0] + u[0] * q + n[0] * 2.0, g0, a[1] + u[1] * q + n[1] * 2.0, ry(n) + Math.PI / 2, { text: kind === 'brew' ? 'BLACK TIDE' : kind === 'cafe' ? '麺 いちりん' : 'SALE', bg: kind === 'brew' ? '#f1ece4' : '#3a1f2b', fg: kind === 'brew' ? '#5b2338' : '#f2e6e6', h: 2.4, w: 0.55, font: FONT.sans }); }
        { const q = doorFirst ? dS + 1.95 : dS - 0.2; k.sphere(0.2, D.M.glow, [a[0] + u[0] * q + n[0] * 0.5, g0 + 2.35, a[1] + u[1] * q + n[1] * 0.5], 10); }
      }
      for (let d = 0.6; d < len - 0.4; d += 1.6) D.shrub(a[0] + u[0] * d + n[0] * 0.35, g0, a[1] + u[1] * d + n[1] * 0.35, 0.55);
      // the colonnade: fascia 2.2 m out on weathered timber posts every 3.2 m
      const p0 = [a[0] + n[0] * 2.2, a[1] + n[1] * 2.2], p1 = [b[0] + n[0] * 2.2, b[1] + n[1] * 2.2];
      barAlong(k, p0, p1, eaveH - 0.05, 0.25, 1.15, m.corrH); k.mesh(capGeo([a, b, p1, p0], eaveH + 0.5, { tile: 3 }), m.roofLight); k.mesh(capGeo([a, b, p1, p0], eaveH - 0.6, { tile: 3, down: true }), m.soffit);
      // [v6:rebuild] posts every ~1.9 m (IMG_0835: 1.85-1.95 m); [v6:fix2] on BLACK TIDE's frontage they stand where IMG_0835's feet cut on the colonnade plane put them:
      // 1.8, 3.7 and 5.6 m west of the frontage's east corner (BT.E), every 1.9 m on from there (the old phase was up to 0.95 m off, with a fourth post in the shopfront)
      const dsList = [], isBTph = Math.abs((BT.E[0] - a[0]) * n[0] + (BT.E[1] - a[1]) * n[1]) < 3.5 && n[0] * BT.n[0] + n[1] * BT.n[1] > 0.95; if (isBTph) { const w0 = wOf(0), sg = Math.sign((u[0] * BT.W[0] + u[1] * BT.W[1]) || 1); for (let j = -12; j <= 24; j++) { const sv = (1.8 + 1.9 * j - w0) * sg; if (sv >= -0.05 && sv <= len + 0.05) dsList.push(Math.max(0, Math.min(len, sv))); } } else for (let d = 0.3; d <= len; d += len / Math.max(1, Math.round(len / 1.9))) dsList.push(d);
      // [v6:fix2] and on ONE line 2.05 m out from the BLACK TIDE frontage (IMG_0835 / 0836: the lots' edges step back 0.5-1.5 m and gave a second, nearer row)
      for (const d of dsList) { if (isBTph) { const wq = wOf(d); postList.push({ px: BT.E[0] + BT.W[0] * wq + BT.n[0] * 2.05, pz: BT.E[1] + BT.W[1] * wq + BT.n[1] * 2.05, g0, eaveH, pri: 0 }); } else postList.push({ px: p0[0] + u[0] * d - n[0] * 0.15, pz: p0[1] + u[1] * d - n[1] * 0.15, g0, eaveH, pri: 1 }); }   // built once, de-duplicated, after the lots
    });
    if (o.w > 15 && o.d > 15) {   // 376: the tall white corrugated back volume with AC units
      const hx = o.d / 2 - 6.45, hz = o.w / 2 - 5, core = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([p2, q2]) => [o.cx + o.ux * p2 - o.uz * q2, o.cz + o.uz * p2 + o.ux * q2]); k.mesh(prismWalls(core, eaveH, g0 + 7.05, { tile: 3 }), m.corrH);   // [v6:fix2] IMG_0835: the back volume's top is 65 px (0.5 m) under the fix1 height and its edge 0.45 m further in   // [v5:detail] a plain box (the -4.5 m offset of 376's concave outline self-intersected) k.mesh(capGeo(core, g0 + 7.6, { tile: 4 }), m.roofLight);
      for (let i = 0; i < 3; i++) k.box(0.9, 0.7, 0.4, m.white, [o.cx + i * 1.3 - 1.3, g0 + 7.45, o.cz]);
    }
    out.yuwaeru++;
  }
  // [v6:fix2] the colonnade posts, once each: neighbouring lots' edges ran along the same line and doubled the posts (IMG_0836: one post every 1.9 m, 4 in view; the app had 5, two of them 0.5 m apart);
  // the BLACK TIDE phase (1.8 m + 1.9 j from its east corner) wins over the generic one
  { const kept = []; for (const q of postList.sort((a, b) => a.pri - b.pri)) { if (kept.some((o) => Math.hypot(o.px - q.px, o.pz - q.pz) < (q.pri ? 1.25 : 0.9))) continue;
    if (q.pri) { const rx = q.px - BT.E[0], rz = q.pz - BT.E[1], wq = rx * BT.W[0] + rz * BT.W[1], oq = rx * BT.n[0] + rz * BT.n[1]; if (wq > -3 && wq < 16 && Math.abs(oq - 2.05) < 2.2) continue; }   // a stray in the BLACK TIDE colonnade's band (one row of posts in IMG_0835 / 0836)
    kept.push(q); k.box(0.2, q.eaveH - 0.6 - q.g0, 0.2, m.post, [q.px, (q.eaveH - 0.6 + q.g0) / 2, q.pz]); ctx.physics?.addBox?.(q.px, q.pz, 0.3, 0.3, 0, q.g0, q.eaveH); } }
  // BLACK TIDE BREWING on the 結 face toward the slow-street junction; the slow street map board; the 結 totem
  const faceNear = (lots2, x, z, want) => { let best = null; for (const l of lots2) edgesOf(l.poly, (a, b, len, n) => { if (len < 5) return; const s = seg(a, b), d = Math.hypot(s.x - x, s.z - z) - (want ? (n[0] * want[0] + n[1] * want[1]) * 4 : 0); if (!best || d < best.d) best = { d, a, b, len, n, s, lot: l }; }); return best; };
  { const lot = Y.find((l) => inPoly(BT.E[0] + BT.W[0] * 3 - BT.n[0] * 1, BT.E[1] + BT.W[1] * 3 - BT.n[1] * 1, l.poly)) || Y[0], g0 = base(lot.poly);
    // [v6:fix2] IMG_0835's edges cut on the wall plane: the double door spans 1.8-3.7 m west of the east corner, T.P. 2.25-4.14 (the shop floor stands 0.5 m over the lot, on a grey concrete
    // base), the window over the slatted counter 3.7-5.5 m, T.P. 2.72-4.15 (the fix1 door stood 0.8 m too far east and 0.45 m too low)
    D.glazing({ a: BT.E, u: BT.W, n: BT.n, s0: 1.8, s1: 3.7, y0: g0 + 0.5, y1: g0 + 2.42, cols: 2, transoms: [g0 + 2.05], kind: 'brew', out: 0.02, frame: D.M.frameS });
    D.glazing({ a: BT.E, u: BT.W, n: BT.n, s0: 3.8, s1: 5.5, y0: g0 + 1.0, y1: g0 + 2.43, cols: 2, kind: 'brew', out: 0.02, frame: D.M.frameW });
    { const cB = 3.4, xb = BT.E[0] + BT.W[0] * cB + BT.n[0] * 0.1, zb = BT.E[1] + BT.W[1] * cB + BT.n[1] * 0.1; k.box(0.25, 0.5, 7.0, m.concrete, [xb, g0 + 0.25, zb], [0, ry(BT.n) + Math.PI / 2, 0]); }
    { const c = 4.65, x = BT.E[0] + BT.W[0] * c + BT.n[0] * 0.08, z = BT.E[1] + BT.W[1] * c + BT.n[1] * 0.08; k.box(1.8, 0.95, 0.08, m.cedar, [x, g0 + 0.5, z], [0, ry(BT.n), 0]); for (let q = -0.8; q <= 0.8; q += 0.2) k.box(0.05, 0.85, 0.04, m.timberDark, [x + BT.W[0] * q + BT.n[0] * 0.05, g0 + 0.5, z + BT.W[1] * q + BT.n[1] * 0.05], [0, ry(BT.n), 0]); }
    k.sphere(0.22, D.M.glow, [BT.E[0] + BT.W[0] * 0.7 + BT.n[0] * 0.6, g0 + 2.3, BT.E[1] + BT.W[1] * 0.7 + BT.n[1] * 0.6], 10);
    // [v6:fix2] one banner, maroon with the white sun logo, at the west end post: IMG_0835's base cuts on the paving at 5.7 m west of the east corner and 2.35 m out (10.8 m from the camera); the two pale ones of fix1 stood at 3.2 m / -0.4 m, not in the photo
    for (const [q, d] of [[5.7, 2.4]]) D.nobori(BT.E[0] + BT.W[0] * q + BT.n[0] * d, g0, BT.E[1] + BT.W[1] * q + BT.n[1] * d, ry(BT.n) + Math.PI / 2, { text: 'BLACK TIDE', bg: '#5d3b47', fg: '#f1ece4', h: 2.4, w: 0.6, font: FONT.sans });
    D.cafeSet(BT.E[0] + BT.W[0] * 6.6 + BT.n[0] * 1.3, g0, BT.E[1] + BT.W[1] * 6.6 + BT.n[1] * 1.3, ry(BT.n) + Math.PI, { stool: m.orange }); }
  { const f = { lot: Y.find((l) => inPoly(BT.E[0] + BT.W[0] * 3 - BT.n[0], BT.E[1] + BT.W[1] * 3 - BT.n[1], l.poly)) || Y[0], n: BT.n, s: { x: BT.E[0] + BT.W[0] * 3, z: BT.E[1] + BT.W[1] * 3 } }; if (f) { const g0 = base(f.lot.poly), p = [f.s.x + f.n[0] * 2.35, f.s.z + f.n[1] * 2.35]; const glowT = ctx.tex.draw(128, 64, (g, w, h) => { g.clearRect(0, 0, w, h); const gr = g.createRadialGradient(w / 2, h * 0.9, 4, w / 2, h * 0.9, w * 0.55); gr.addColorStop(0, 'rgba(255,214,120,0.95)'); gr.addColorStop(0.6, 'rgba(255,200,110,0.45)'); gr.addColorStop(1, 'rgba(255,200,110,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { key: 'p5-uplight' });
      const gm = new THREE.MeshBasicMaterial({ map: glowT, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.3 }); k.plane(5.0, 1.15, gm, [p[0] + f.n[0] * 0.14, g0 + 3.4, p[1] + f.n[1] * 0.14], [0, ry(f.n), 0]);   // [v6:fix1] the lettering sits ON the fascia (2.95-4.03 m over the paving; IMG_0835: it stood 45 px = ~0.5 m high on a raised box)
      sign(ctx, k, 'BLACK TIDE', 3.6, 0.55, p[0] + f.n[0] * 0.02, g0 + 3.62, p[1] + f.n[1] * 0.02, ry(f.n), { color: '#86c83e', font: FONT.sans, emissive: true }); sign(ctx, k, 'BREWING', 1.8, 0.3, p[0] + f.n[0] * 0.02, g0 + 3.16, p[1] + f.n[1] * 0.02, ry(f.n), { color: '#86c83e', font: FONT.sans, emissive: true }); out.blackTide = [+p[0].toFixed(1), +p[1].toFixed(1)]; } }
  // the map board on 結's cedar wall beside いちりん (IMG_0842: 1.3 m ahead of the camera at (-42.6, 84.2), heading 320, the board facing SE)
  { const f = { lot: Y.find((l) => inPoly(-44.2, 82.4, l.poly)) || Y[0], n: [0.643, 0.766] }; if (f.lot) { const g0 = base(f.lot.poly), p = [-43.44, 83.2]; const g = k.group([p[0], g0 + 1.6, p[1]], ry(f.n)), kk = ctx.kit(g); kk.box(1.3, 0.95, 0.04, ctx.mat.toon('#e8d590', { paint: 0.02 }), [0, 0, 0]); const tt = textTex(ctx, 'Kesennuma slow street 結', { w: 1024, h: 128, color: '#2b2f3a', font: FONT.sans, weight: 700, size: 0.6 }); kk.plane(1.15, 0.15, mapMat(ctx, 'decal', '#ffffff', tt, { transparent: true, alphaTest: 0.3 }), [0, 0.33, 0.03]); for (const [bx, bz, bw, bh] of [[-0.42, 0.08, 0.3, 0.16], [-0.05, 0.08, 0.3, 0.16], [0.34, 0.02, 0.32, 0.26], [-0.25, -0.22, 0.42, 0.22], [0.3, -0.25, 0.4, 0.14], [-0.53, -0.18, 0.1, 0.3]]) { kk.box(bw + 0.02, bh + 0.02, 0.015, ctx.mat.toon('#4f86c6', { paint: 0 }), [bx, bz, 0.025]); kk.box(bw, bh, 0.02, m.white, [bx, bz, 0.03]); kk.box(Math.min(bw, bh) * 0.35, Math.min(bw, bh) * 0.35, 0.01, m.black, [bx - bw * 0.25, bz, 0.045]); }
    { const tt2 = textTex(ctx, '↑ 現在地', { w: 256, h: 64, color: '#c8372d', font: FONT.sans, weight: 900, size: 0.7 }); kk.plane(0.22, 0.055, mapMat(ctx, 'decal', '#ffffff', tt2, { transparent: true, alphaTest: 0.3 }), [-0.05, -0.39, 0.03]); } out.mapBoard = [+p[0].toFixed(1), +p[1].toFixed(1)]; } }
  const yT = 2.4, gT = base(SITES.yuwaeru.poly);   // [v6:fix2] the survey puts the tablet's foot at T.P. 2.40 (+-0.1, IMG_0830): a low plinth carries it up from the lot level
  if (yT - gT > 0.02) k.box(0.62, yT - gT + 0.05, 0.4, m.grey, [-26.9, (yT + gT) / 2 - 0.02, 70.7], [0, ry([0.9, -0.3]), 0]);
  totem(ctx, k, m, -26.9, yT, 70.7, ry([0.9, -0.3]), { mat: m.aqua, title: '結', sub: 'UNITED VILLAGES', h: 1.7, w: 0.75, pointed: false });   // [v6:fix1] bearing 214 / 217 deg from the IMG_0830 / 0831 spots, range 17 m from its apparent size (0.75 x 1.7 m like 迎's tablet; the foot-row cut said 10.5 m but ignores the lower front-yard level): 8 m from the old spot
  ctx.features?.add('minami', 'totem.yuwaeru', [-26.9, 2.4, 70.7]);   // [v6:survey]   // [v6:fix1] foot cut on the sidewalk in IMG_0830 (far left of the frame), 5.8 m east of the old spot
  // 拓: white corrugated + grey timber panels, the name on the slow-street face, a pergola with かつお banners
  for (const lot of H) {
    const P = lot.poly, g0 = base(P), top = g0 + 5.6;
    k.mesh(capGeo(P, top, { tile: 4 }), m.roofLight); k.mesh(prismWalls(offsetRing(P, 0.04), top - 0.3, top + 0.35, { tile: 3 }), m.corr);
    edgesOf(P, (a, b, len, n, u) => {
      const s = seg(a, b);
      if (len < 10) { k.box(0.2, top - g0, len, m.corr, [s.x - n[0] * 0.1, (top + g0) / 2, s.z - n[1] * 0.1], [0, s.rotY, 0]); return; }
      const slow = n[0] * -0.69 + n[1] * -0.72 > 0.6 && len > 20;
      if (!slow) {
        const nseg = Math.max(1, Math.round(len / 7)), sl = len / nseg;
        for (let i = 0; i < nseg; i++) { const c = [a[0] + u[0] * sl * (i + 0.5), a[1] + u[1] * sl * (i + 0.5)], mat = [m.corrH, m.gtimber, m.corr, m.gtimber][i % 4]; k.box(0.2, top - g0, sl + 0.02, mat, [c[0] - n[0] * 0.1, (top + g0) / 2, c[1] - n[1] * 0.1], [0, s.rotY, 0]); if (i % 4 === 2) { D.glazing({ a, u, n, s0: sl * (i + 0.2), s1: sl * (i + 0.8), y0: g0 + 0.05, y1: g0 + 2.5, cols: 3, kind: 'shop', out: 0.02, frame: D.M.frameS }); k.box(sl * 0.75, 0.08, 1.4, m.roofLight, [c[0] + n[0] * 0.7, g0 + 2.9, c[1] + n[1] * 0.7], [0, ry(n), 0]); } }
        return;
      }
      // [v5:detail] the slow-street face (NW), f from its SW end (IMG_0833 is square-on at f 0.86; IMG_0840 / 0841 look
      // down it): the shops behind the steel pergola (f 0-0.55), grey timber, the white corrugated entrance bay with its
      // flat canopy and the KNEWS board (f 0.72-0.855), grey timber with the notice case, the name panel at the NE end
      const sw = a[1] > b[1] ? a : b, ne = sw === a ? b : a, uu = [(ne[0] - sw[0]) / len, (ne[1] - sw[1]) / len];   // f = 0 at the SW end
      const at = (f, d = 0.1) => [sw[0] + uu[0] * len * f + n[0] * d, sw[1] + uu[1] * len * f + n[1] * d];
      const panel = (f0, f1, mat) => { const [x, z] = at((f0 + f1) / 2, -0.1); k.box(0.2, top - g0, len * (f1 - f0) + 0.02, mat, [x, (top + g0) / 2, z], [0, s.rotY, 0]); };
      panel(0, 0.675, m.corrH); panel(0.675, 0.705, m.corrH); panel(0.705, 1, m.gtimber);   // [v6:fix3] IMG_0841's board edges cut on the face plane (camera as solved): KNEWS at f 0.717-0.747, the BLACK TIDE board 0.676-0.708, the glazed doors from 0.67 SW; grey timber NE of the corrugated bay (the old split put the boards 5-6 m too far NE)
      // shopfronts behind the pergola: bays of glazing with lit interiors (dresses, crafts)
      for (let f = 0.03; f < 0.62; f += 0.09) D.glazing({ a: sw, u: uu, n, s0: len * f, s1: len * f + 2.9, y0: g0 + 0.05, y1: g0 + 2.6, cols: 3, transoms: [g0 + 2.1], kind: f < 0.2 ? 'shop' : 'cafe', out: 0.02, frame: D.M.frameS, fw: 0.07 });
      // the entrance bay: glazed doors, flat white canopy with two downlights
      D.glazing({ a: sw, u: uu, n, s0: len * 0.585, s1: len * 0.585 + 2.6, y0: g0 + 0.05, y1: g0 + 2.6, cols: 2, transoms: [g0 + 2.2], kind: 'shop', out: 0.02, frame: D.M.frameS });
      { const [cx, cz] = at(0.585 + 1.3 / len, 0.75); k.box(3.4, 0.14, 1.5, m.white, [cx, g0 + 2.95, cz], [0, ry(n), 0]); for (const q of [-0.9, 0.9]) k.box(0.18, 0.04, 0.18, D.M.spot, [cx + uu[0] * q, g0 + 2.87, cz + uu[1] * q]); }
      // [v6:fix2] IMG_0841: the KNEWS board (white, 気仙沼DMC) hangs flush on the grey timber panel at the NE end, the dark BLACK TIDE BREWING board on the corrugated entrance bay beside it
      { const [x, z] = at(0.732, 0.1); const g = k.group([x, g0 + 1.7, z], ry(n)), kk = ctx.kit(g); kk.box(1.15, 1.55, 0.06, m.white, [0, 0, 0]); const kt = ctx.tex.draw(128, 170, (g2, w, h) => { g2.fillStyle = '#f6f6f2'; g2.fillRect(0, 0, w, h); g2.strokeStyle = '#1d1f2a'; g2.lineWidth = 7; for (let i = 0; i < 3; i++) { g2.beginPath(); g2.arc(w / 2, h * 0.62, w * (0.18 + i * 0.1), Math.PI, 0); g2.stroke(); } g2.fillStyle = '#d8323a'; g2.beginPath(); g2.arc(w * 0.22, h * 0.3, 7, 0, 7); g2.fill(); g2.fillStyle = '#1d1f2a'; g2.font = `900 ${h * 0.13}px ${FONT.sans}`; g2.textAlign = 'center'; g2.fillText('KNEWS', w / 2, h * 0.88); }, { key: 'p5-knews2' }); kk.plane(1.1, 1.45, mapMat(ctx, 'decal', '#ffffff', kt, { transparent: true, alphaTest: 0.3 }), [0, 0, 0.04]); }
      { const [x, z] = at(0.692, 0.1); const g = k.group([x, g0 + 1.65, z], ry(n)), kk = ctx.kit(g); kk.box(1.25, 1.55, 0.06, ctx.mat.toon('#26302b', { paint: 0.02 }), [0, 0, 0]); kk.plane(0.8, 0.14, mapMat(ctx, 'decal', '#ffffff', textTex(ctx, 'BLACK TIDE', { w: 256, h: 40, color: '#86c83e', font: FONT.sans, weight: 700, size: 0.7 }), { transparent: true, alphaTest: 0.3 }), [0, 0.05, 0.04]); }
      // the name in three grey lines on the NE panel
      { const [tx, tz] = at(0.96, 0.12); const nm = 'Kesennuma Amway House Hirakeru'.split(' '); [[nm[0], 4.25], [nm[1] + ' ' + nm[2], 3.9], [nm[3], 3.55]].forEach(([t2, y]) => sign(ctx, k, t2, 2.0, 0.3, tx, g0 + y, tz, ry(n), { color: '#55585e', font: FONT.sans, weight: 500 })); }
      // a planted strip with black bollards along the NE half, pavers up to it
      // [v6:fix2] no bollards on this face (IMG_0840 / 0841: planters and an asphalt apron to the pavers, none of the black posts the old build stood 1.6 m out)
      for (let f = 0.68; f < 0.99; f += 0.035) { const [bx, bz] = at(f, 0.7); if (Math.abs(f - 0.73) > 0.06) D.shrub(bx, g0, bz, 0.6); }
      // the pergola (IMG_0840 / 0841: pale weathered timber, 0.14 m posts, beams and purlins, not steel) with black floral nobori
      const pergM = ctx.mat.toon('#b7ab95', { paint: 0.05 });
      for (let f = 0.02; f < 0.66; f += 0.06) { const [px, pz] = at(f, 2.8); k.box(0.14, 3.2, 0.14, pergM, [px, g0 + 1.6, pz]); const [qx, qz] = at(f, 0.15); const b2 = [qx, qz]; barAlong(k, b2, [px, pz], g0 + 3.15, 0.1, 0.16, pergM); }
      { const p0 = at(0.02, 2.8), p1 = at(0.66, 2.8); barAlong(k, p0, p1, g0 + 3.2, 0.12, 0.2, pergM); for (let f = 0.03; f < 0.66; f += 0.02) { const A2 = at(f, 0.15), B2 = at(f, 2.9); barAlong(k, A2, B2, g0 + 3.33, 0.06, 0.1, pergM); } }
      // [v6:fix3] the banners are the navy 「気仙沼 かつお」 / 「ねこ」 nobori with a white-bone fish and red lettering (IMG_0840 / 0841: ten in a row along the pergola's street edge, a white water-weight base each, every ~2.4 m, then more past the entrance), not floral
      { const tex = ctx.tex.draw(96, 320, (g2, w, h) => { g2.fillStyle = '#231f3d'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#efe9e4'; g2.font = `900 ${Math.round(w * 0.42)}px ${FONT.brush || FONT.sans}`; g2.textAlign = 'center'; g2.fillText('気仙沼', w / 2, h * 0.2); g2.fillStyle = '#d7263d'; g2.font = `900 ${Math.round(w * 0.78)}px ${FONT.brush || FONT.sans}`; g2.fillText('かつお', w / 2, h * 0.52); g2.fillText('', w / 2, h * 0.8); g2.fillStyle = '#e9e4ee'; g2.beginPath(); g2.ellipse(w / 2, h * 0.8, w * 0.36, h * 0.09, 0.2, 0, 7); g2.fill(); }, { key: 'p5-katsuo' });
        const fm = mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0, side: 'double' });
        for (let f = 0.1, i = 0; f < 0.72; f += 2.4 / len, i++) { const [px, pz] = at(f, 3.5); k.box(0.035, 2.9, 0.035, m.white, [px, g0 + 1.45, pz]); k.box(0.6, 0.03, 0.03, m.white, [px + uu[0] * 0.3, g0 + 2.9, pz + uu[1] * 0.3], [0, ry(n), 0]); k.plane(0.6, 1.95, fm, [px + uu[0] * 0.3, g0 + 1.9, pz + uu[1] * 0.3], [0, ry(n), 0]); k.cyl(0.24, 0.28, 0.14, ctx.mat.toon('#f2f2ee', { paint: 0 }), [px, g0 + 0.08, pz], null, 10); } }
      for (let f = 0.1; f < 0.6; f += 0.12) D.cafeSet(...(([x, z]) => [x, g0, z])(at(f, 1.6)), ry(n) + Math.PI, { stool: m.red });
    });
    out.hirakeru++;
  }
  totem(ctx, k, m, -19.0, base(SITES.hirakeru.poly), 86.8, ry([0.5, -0.86]), { mat: m.rust, title: '拓', sub: 'HIRAKERU', h: 2.4, pointed: false });
  // the slow street: pavers with red and dark bands; string lights criss-crossing overhead on poles
  {
    const A0 = [-17.5, 75.5], B0 = [-66, 121.5], s = seg(A0, B0), n = [s.uz, -s.ux], hw = 6.5, gy = Math.max(L.heightAt(A0[0], A0[1]), L.heightAt(B0[0], B0[1])) + 0.07;
    const quad = [[A0[0] + n[0] * hw, A0[1] + n[1] * hw], [B0[0] + n[0] * hw, B0[1] + n[1] * hw], [B0[0] - n[0] * hw, B0[1] - n[1] * hw], [A0[0] - n[0] * hw, A0[1] - n[1] * hw]];
    k.mesh(capGeo(quad, gy, { tile: 8 }), m.paver);
    // [v6:fix2] the bands as the photos cut them (IMG_0840 / 0841, rays on the paving: the red band through (-28.2, 89.9) and the thin dark one 0.45 m beside it) run ACROSS the street
    // (bearing 306 deg, 80 deg to its axis), not along it: the old 0.9 m wide dark band down the middle is not in any photo
    { const rot = Math.atan2(-0.81, -0.59), t = [-0.81, -0.59], nb = [0.59, -0.81]; for (const [o2, wb, col] of [[0, 0.45, '#8a5248'], [0.45, 0.32, '#4a4b50']]) { const g = new THREE.PlaneGeometry(wb, 13); g.rotateX(-Math.PI / 2); k.mesh(g, ctx.mat.toon(col, { paint: 0.03, polygonOffset: -3 }), [-28.2 + nb[0] * o2, gy + 0.012, 89.9 + nb[1] * o2], [0, rot, 0]); } }
    // [v6:rebuild] no poles in the street (IMG_0834-0841): festoons span straight across from eave to eave every 3.5 m,
    // parallel to each other (IMG_0840 looks down a row of them), ~5 m up with a 0.5 m sag
    // [v6:fix1] festoons anchored at the fascias (~4.1 m over the paving, IMG_0837 / 0839: they rise no higher than the colonnade
    // fascia and sag 0.7 m), every 4.5 m, none within 6.5 m of the standing spot of IMG_0834-0839 (-26.4, 85.8): the old ones hung 2-5 m
    // too high and one dropped straight over the camera
    for (let d = 3; d < s.len - 1; d += 4.5) { const ax = A0[0] + s.ux * d, az = A0[1] + s.uz * d; if (Math.hypot(ax - (-26.4), az - 85.8) < 6.5) continue; const a = [ax + n[0] * hw, gy + 4.1, az + n[1] * hw], b = [ax - n[0] * hw, gy + 4.4, az - n[1] * hw]; stringLights(k, m, a, b, 0.6, 0.7); }
    out.slowStreet = { a: A0, b: B0, width: hw * 2 };
  }
  void r;
  return out;
}

// ======================================================================================================== the convenience store
export function buildKonbiniPhotos(ctx, k, { L, base }) {
  const m = mats5(ctx), P = KONBINI.poly, g0 = base(P), top = g0 + 4.6;
  k.mesh(prismWalls(P, g0 - 0.4, top, { tile: 3 }), m.white);
  k.mesh(capGeo(P, top + 0.02, { tile: 4 }), m.roofLight);
  const o = obbOf(P);
  for (let s = -o.d / 2 + 2; s < o.d / 2 - 1.5; s += 2.2) k.box(o.w - 2.2, 0.08, 1.7, m.pv, [o.cx + o.ux * s, top + 0.45, o.cz + o.uz * s], [0, o.rotY, 0.2]);
  edgesOf(P, (a, b, len, n, u, i) => {
    const s = seg(a, b);
    if (i === KONBINI.front) {
      k.box(0.1, 2.6, len - 1.0, m.glassShop, [s.x + n[0] * 0.06, g0 + 1.55, s.z + n[1] * 0.06], [0, s.rotY, 0]);
      for (let d = 0.5; d <= len - 0.5; d += (len - 1) / 6) k.box(0.12, 2.6, 0.1, m.grey, [a[0] + u[0] * d + n[0] * 0.1, g0 + 1.55, a[1] + u[1] * d + n[1] * 0.1]);
    }
    if (i === KONBINI.front || i === KONBINI.front - 1 || i === 3) { const f = k.box(0.12, 1.1, len + 0.2, m.stripes, [s.x + n[0] * 0.12, g0 + 3.55, s.z + n[1] * 0.12], [0, s.rotY + Math.PI / 2, 0]); f.rotation.set(0, ry(n), 0); f.scale.set(len + 0.2, 1.1, 0.12); }
    if (i === KONBINI.brick) k.box(0.14, top - g0, len, m.brick, [s.x + n[0] * 0.08, (top + g0) / 2, s.z + n[1] * 0.08], [0, s.rotY, 0]);
  });
  // [v6:fix1] the pole sign: a tall white pole (IMG_0829 / 0822: base T.P. 2.4, the sign from 9.73 to 12.3 m, 1.43 m wide: a 1.95 m panel with
  // the stylised 7 and a 0.6 m red ATM / 酒 / たばこ plate under it)
  { const [x, z] = KONBINI.pole, gy = Math.min(L.heightAt(x, z), KONBINI.poleFoot), H = 9.73 - gy; k.cyl(0.2, 0.24, H, m.white, [x, gy + H / 2, z], null, 12); const g = k.group([x, gy + H, z], ry([0.95, 0.32])), kk = ctx.kit(g);
    kk.box(1.43, 1.95, 0.4, m.white, [0, 0.6 + 0.975, 0]); const t7 = ctx.tex.draw(256, 256, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#ef7d2b'; c.font = `900 ${h * 0.7}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('7', w / 2, h * 0.45); c.fillStyle = '#2a9a4e'; c.fillRect(w * 0.15, h * 0.8, w * 0.7, h * 0.07); }, { key: 'p5-seven' });
    for (const f of [1, -1]) kk.plane(1.33, 1.85, glowMat(ctx, t7, 1.05), [0, 0.6 + 0.975, f * 0.21], [0, f > 0 ? 0 : Math.PI, 0]);
    kk.box(1.43, 0.6, 0.4, m.red, [0, 0.3, 0]); for (const f of [1, -1]) sign(ctx, kk, 'ATM  酒  たばこ', 1.3, 0.4, 0, 0.3, f * 0.205, f > 0 ? 0 : Math.PI, { color: '#ffffff', font: FONT.sans }); ctx.physics?.addBox?.(x, z, 0.5, 0.5, 0, gy, gy + H); }
  { const [px, pz] = KONBINI.pole; ctx.features?.add('minami', 'konbini.pole', [px, KONBINI.poleFoot, pz]);   // [v6:fix2] foot at the surveyed T.P. 2.38 (the pole base is built from there down to the lot)
    ctx.features?.add('minami', 'konbini.sign_bottom', [px, 9.73, pz]); }   // [v6:survey]
  ctx.physics?.addBox?.(o.cx, o.cz, o.w, o.d, o.rotY, g0, top);
  return { g0, top };
}

// ======================================================================================================== the east promenade
/** [v6:rebuild] The quay promenade east of PIER7 (IMG_0888-0896, 14:59 JST): a railing along the water's edge, 0.45 m in from
 *  the quay face (layout QUAYS), dark posts every 2 m, a timber top rail and two steel wires; low white bollards between. */
export function buildEastPromenade(ctx, k, { L }) {
  const m = mats5(ctx), D = detailKit(ctx, k), line = [[127.0, 67.0], [131.9, 62.0], [146.7, 66.4], [161.4, 70.7], [184.4, 76.5]];   // [v6:fix2] GSI's quay line (131.9, 62.0) -> (119, 75.5) and on east: with station B (IMG_0888-0891) moved by (-0.7, +2.6) m (tools/survey/minami_fix2.py) IMG_0891's rail-top rays lie on it
  let n = 0;
  // [v6:fix2] The promenade deck in the survey's frame: GSI's quay line (131.9, 62) -> (146.7, 66.4) -> (184.4, 76.5) and the 5 m DEM put the shore 2-4 m inside the
  // railing the photos solve (IMG_0888-0896: the phone stands on paving where the app had water), so the paving is laid as its own slab, flat at T.P. 1.9, from the quay
  // edge 8 m inland, on a board-formed face down to the water. Pieces of the old apron stay under it.
  { const segs = []; for (let i = 1; i < line.length; i++) { const s = seg(line[i - 1], line[i]); let nn = [s.uz, -s.ux]; if (L.isWater(s.x + nn[0] * 3, s.z + nn[1] * 3)) nn = [-nn[0], -nn[1]]; segs.push({ s, nn }); }
    const nAt = (i) => { const p = segs[Math.max(0, i - 1)], q = segs[Math.min(segs.length - 1, i)]; let v = [p.nn[0] + q.nn[0], p.nn[1] + q.nn[1]]; const l = Math.hypot(v[0], v[1]) || 1; v = [v[0] / l, v[1] / l]; const c = Math.max(0.5, v[0] * q.nn[0] + v[1] * q.nn[1]); return [v[0] / c, v[1] / c]; };
    const edge = line.map(([x, z]) => [x - 0.0, z]), inland = line.map(([x, z], i) => { const v = nAt(i); return [x + v[0] * 8, z + v[1] * 8]; }).reverse();
    const ring = [...edge, ...inland];
    if (signedArea(ring) < 0) ring.reverse();
    k.mesh(capGeo(ring, 1.9, { tile: 3 }), ctx.mat.toon('#8e949b', { paint: 0.05, polygonOffset: -2 }));   // [v6:fix3] blue-grey granite flags (IMG_0891 / 0893), not the plaza's beige pavers
    for (const { s } of segs) k.box(0.3, 1.9, s.len, m.wall, [s.x, 0.95, s.z], [0, s.rotY, 0]); }
  // [v6:fix2] the raised concrete kerb between the promenade and the road, with the black guard-rail bollards (yellow band, three rails): IMG_0894 and 0895 cut the bases
  // on the same line (141.9, 70.0) -> (137.5, 70.3) -> (134.4, 70.7), 1.5 m apart, on a kerb 0.45 m over the paving (T.P. 2.35)
  { const k0 = [131.5, 70.9], k1 = [153.5, 69.7], sK = seg(k0, k1), yK = 1.9 + 0.45, bolt = (i) => 134.4 + 1.5 * i;
    k.box(0.5, 0.45, sK.len, m.concrete, [sK.x, 1.9 + 0.225, sK.z], [0, sK.rotY, 0]); ctx.physics?.addBox?.(sK.x, sK.z, 0.5, sK.len, sK.rotY, 1.9, yK);
    const pts = []; for (let i = -2; bolt(i) < k1[0]; i++) { const x = bolt(i), z = 70.7 - (x - 134.4) * 0.12; if (x > k0[0]) pts.push([x, z]); }
    for (const [x, z] of pts) { k.cyl(0.085, 0.085, 0.9, m.black, [x, yK + 0.45, z], null, 8); k.cyl(0.088, 0.088, 0.08, m.yellow, [x, yK + 0.68, z], null, 8); }
    for (let i = 1; i < pts.length; i++) for (const h of [0.34, 0.62, 0.88]) barAlong(k, [pts[i - 1][0], pts[i - 1][1]], [pts[i][0], pts[i][1]], yK + h, 0.05, 0.05, m.black); }
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], s = seg(a, b); let nn = [s.uz, -s.ux]; if (L.isWater(s.x + nn[0] * 3, s.z + nn[1] * 3)) nn = [-nn[0], -nn[1]];   // inland
    const A = [a[0] + nn[0] * 0.45, a[1] + nn[1] * 0.45], B = [b[0] + nn[0] * 0.45, b[1] + nn[1] * 0.45], y0 = Math.max(1.9, L.heightAt(s.x + nn[0] * 2, s.z + nn[1] * 2) + 0.05);
    barAlong(k, A, B, y0 + 1.1, 0.06, 0.05, m.deck); for (const h of [0.3, 0.55, 0.8]) barAlong(k, A, B, y0 + h, 0.012, 0.012, m.rail);   // [v6:fix3] IMG_0891: a slim brown top rail (~6 x 5 cm, the old 12 x 8 cm read as a plank) over three thin cables
    const ss = seg(A, B); for (let d = 0; d <= ss.len; d += 2.0) { k.box(0.045, 1.08, 0.045, m.steel, [A[0] + ss.ux * d, y0 + 0.54, A[1] + ss.uz * d]); n++; }
    ctx.physics?.addBox?.(ss.x, ss.z, 0.15, ss.len, ss.rotY, y0, y0 + 1.1);
    void D;
  }
  // [v6:fix2] the 港町ブルース monument, re-measured from ONE station. The two-view triangulation of fix1 (IMG_0893 x IMG_0891) put the plaque 6.9 m
  // from IMG_0893 and its top 0.3 m under the eye, which a plinth standing on the 1.9 m paving cannot do: the two stations (0891, 0893) are tied only by
  // far hills and phone GPS, so their relative position is good to ~1.5 m. IMG_0893 alone (eye 1.43 m over the paving, its horizon on the far shore):
  // the plinth's front foot edge cuts the paving at 3.9 m (through (131.36, 64.81) and (132.79, 65.51)), its front face top edge reads T.P. 2.36
  // (0.46 m high), the stainless frame stands 0.29 m back from that face on its top, 1.56 m wide and 0.81 m high (top T.P. 3.17), the plaque centred
  // on the optical axis; the plinth is 2.97 m long (IMG_0891's ground cuts of its ends). tools/survey/minami_fix2.py.
  { const g = k.group([MON6.c[0], MON6.gy, MON6.c[1]], Math.atan2(MON6.n[0], MON6.n[1])), kk = ctx.kit(g);   // local +z = the plaque's normal (to the viewer), local +x = to its right
    const granite = ctx.mat.toon('#3b3a40', { paint: 0.04 }), steel = ctx.mat.toon('#b9c0c6', { paint: 0.02 }), brass = ctx.mat.toon('#b58f3a', { paint: 0.03 }), plate = ctx.mat.toon('#b8bbbc', { paint: 0.05 });
    const { len, dep, h, fw, fh, front } = MON6.plinth;
    kk.box(len, h, dep, granite, [0, h / 2, front - dep / 2]);
    kk.box(len * 0.96, 0.02, dep * 0.9, ctx.mat.toon('#2f2e34', { paint: 0.02 }), [0, h + 0.01, front - dep / 2 - 0.02]);
    kk.box(fw, fh, 0.1, steel, [0, h + fh / 2, 0]);
    const tx = ctx.tex.draw(256, 128, (c, w, hh) => { c.fillStyle = '#c4c7c8'; c.fillRect(0, 0, w, hh); c.fillStyle = '#2f5aa3'; for (let q = 0; q < 6; q++) for (let r = 0; r < 12; r++) c.fillRect(w * 0.05 + q * w * 0.095, hh * 0.1 + r * hh * 0.07, w * 0.012, hh * 0.05); c.font = `900 ${hh * 0.115}px sans-serif`; c.textAlign = 'center'; c.fillText('港町ブルース', w * 0.8, hh * 0.3); }, { key: 'p5-minatomachi3' });   // [v6:fix3] the whole title: ブルース (the old 0.16 em at 0.84 w ran off the plaque and read ブルー)
    kk.plane(fw * 0.9, fh * 0.84, mapMat(ctx, 'toon', '#ffffff', tx, { paint: 0 }), [0, h + fh / 2, 0.052], [0, 0, 0]);
    kk.box(0.14, 0.14, 0.05, ctx.mat.toon('#2aa86a', { paint: 0 }), [fw / 2 - 0.12, h + 0.09, 0.06]);
    // the brass three-blade propeller behind the right end (hub 0.3 m behind the plaque plane), the steel hoop (axis along the plinth) and the twin-wing pole at the left end
    kk.cyl(0.1, 0.1, 0.3, brass, [fw / 2 + 0.45, h + 0.62, -0.3], [Math.PI / 2, 0, 0], 10);
    for (let q = 0; q < 3; q++) kk.mesh(new THREE.SphereGeometry(0.5, 10, 6), brass, [fw / 2 + 0.45 + Math.sin(q * 2.094 + 0.5) * 0.46, h + 0.62 + Math.cos(q * 2.094 + 0.5) * 0.46, -0.3], [0.4, 0, q * 2.094 + 0.5], [0.3, 0.9, 0.1]);
    kk.mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.2, 28, 1, true), ctx.mat.toon('#aeb6bc', { paint: 0.02, side: 'double' }), [-fw / 2 - 0.35, h + 0.5, -0.12], [0, 0, Math.PI / 2]);
    kk.cyl(0.04, 0.04, 1.45, steel, [-fw / 2 - 0.2, h + 0.72, -0.3], null, 8);
    for (const sd of [-1, 1]) kk.mesh(new THREE.TorusGeometry(0.42, 0.01, 4, 14, Math.PI * 0.55), steel, [-fw / 2 - 0.2 + sd * 0.3, h + 1.46, -0.3], [0, 0, sd > 0 ? 0.2 : Math.PI - 0.2 - Math.PI * 0.55]);
    ctx.physics?.addBox?.(MON6.c[0], MON6.c[1] - 0.2, len, dep, Math.atan2(MON6.n[0], MON6.n[1]), MON6.gy, MON6.gy + h + 1.0);
    const tl = [MON6.c[0] - MON6.u[0] * fw / 2, MON6.gy + h + fh, MON6.c[1] - MON6.u[1] * fw / 2]; ctx.features?.add('minami', 'monument.plaque.tl', tl); ctx.features?.dim?.('minami', 'monument.plaque_w', fw); ctx.features?.dim?.('minami', 'monument.plaque_h', fh); ctx.features?.dim?.('minami', 'monument.plinth_h', h);
    const toW = (lx, lz) => [MON6.c[0] + MON6.u[0] * lx + MON6.n[0] * lz, MON6.c[1] + MON6.u[1] * lx + MON6.n[1] * lz];
    // neighbours, placed from IMG_0891's own ground cuts relative to the plinth's left-front corner: the blue information board 0.48 m left of it, the bench 6.1 m right and 0.85 m behind its face line
    const rotU = Math.atan2(MON6.n[0], MON6.n[1]), x0 = -len / 2;
    { const [x, z] = toW(x0 - 0.48, front - 0.13), blue = ctx.mat.toon('#1d3f94', { paint: 0.02 }); k.box(0.14, 1.0, 0.1, blue, [x, MON6.gy + 0.5, z], [0, rotU, 0]); const bd = k.box(0.95, 0.65, 0.05, blue, [x, MON6.gy + 1.05, z], [-0.5, rotU, 0]); void bd; k.box(0.85, 0.55, 0.01, ctx.mat.toon('#e6efe9', { paint: 0 }), [x + MON6.n[0] * 0.03, MON6.gy + 1.06, z + MON6.n[1] * 0.03], [-0.5, rotU, 0]); }
    { const [x, z] = toW(x0 + 3.4, front - 1.3); k.cyl(0.06, 0.07, 3.6, m.black, [x, MON6.gy + 1.8, z], null, 8); k.box(0.7, 0.04, 0.5, m.pv, [x, MON6.gy + 3.75, z], [-0.5, rotU, 0]); k.box(0.5, 0.1, 0.18, m.lamp, [x + MON6.u[0] * 0.45, MON6.gy + 3.3, z + MON6.u[1] * 0.45], [0, rotU, 0]); ctx.physics?.addBox?.(x, z, 0.3, 0.3, 0, MON6.gy, MON6.gy + 3.7); }
    { const [x, z] = toW(x0 + 6.12, front - 0.85); k.box(1.6, 0.06, 0.42, m.deck, [x, MON6.gy + 0.45, z], [0, rotU + Math.PI / 2, 0]); for (const q of [-0.6, 0.6]) k.box(0.1, 0.45, 0.35, m.steel, [x + MON6.u[0] * q, MON6.gy + 0.22, z + MON6.u[1] * q], [0, rotU + Math.PI / 2, 0]); } }
  // [v6:fix3] IMG_0896's roadside: the tall white curved street-lamp mast (foot cut at T.P. 2.1: (140.3, 81.7), head at T.P. 9.5, the arm curls over the road toward the NE), and the
  // leaning wooden pole beside the concrete pole cluster (feet cut at (147.4, 84.6); its top 9.6 m over the paving, 1.0 m off the plumb toward the image-left, i.e. NE)
  { const x = 140.3, z = 81.7, y0 = 2.1, dir = [0.63, -0.78], white = m.pipe, H1 = 8.1, R = 1.35;
    k.cyl(0.095, 0.115, H1, white, [x, y0 + H1 / 2, z], null, 10); k.cyl(0.17, 0.17, 0.3, white, [x, y0 + 0.15, z], null, 10);
    let prev = [x, y0 + H1, z];
    for (let i = 1; i <= 6; i++) { const t = (i / 6) * Math.PI / 2, q = [x + dir[0] * R * (1 - Math.cos(t)), y0 + H1 + R * Math.sin(t), z + dir[1] * R * (1 - Math.cos(t))]; pipe(k, white, prev, q, 0.07); prev = q; }
    const hd = k.box(0.95, 0.16, 0.34, ctx.mat.toon('#c7ccd0', { paint: 0.02 }), [prev[0] + dir[0] * 0.5, prev[1] - 0.05, prev[2] + dir[1] * 0.5], [0, Math.atan2(dir[0], dir[1]), 0]); void hd;
    k.box(0.8, 0.04, 0.26, m.lamp, [prev[0] + dir[0] * 0.5, prev[1] - 0.15, prev[2] + dir[1] * 0.5], [0, Math.atan2(dir[0], dir[1]), 0]);
    ctx.physics?.addBox?.(x, z, 0.3, 0.3, 0, y0, y0 + 9); ctx.features?.add('minami', 'lamp.0896.foot', [x, y0, z]); }
  { const f0 = [147.4, 2.1, 84.6], t0 = [147.4 + 0.63 * 1.0, 9.6, 84.6 - 0.78 * 1.0], woody = ctx.mat.toon('#8d8a80', { paint: 0.05 }); pipe(k, woody, f0, t0, 0.17); }
  return { posts: n };
}

// ======================================================================================================== road markings
/** Zebra crossings, the hatched median and ◇ marks on 魚町港町線 at the 結 junction, black bollards with white bands. */
export function buildMarkingsPhotos(ctx, k, { L }) {
  const m = mats5(ctx), yAt = (x, z) => L.heightAt(x, z) + 0.075;
  const quad = (c, t, u0, u1, v0, v1) => { const n = [-t[1], t[0]], P = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [c[0] + n[0] * u + t[0] * v, c[1] + n[1] * u + t[1] * v]); k.mesh(capGeo(P, yAt(c[0], c[1]), { tile: 2 }), m.roadWhite); };
  const roadAt = (a, b, f) => { const p = lerp(a, b, f), s = seg(a, b); return { p, t: [s.ux, s.uz] }; };
  const N1 = [[-73, -30], [-17, 72]], S1 = [[-17, 72], [0, 97]];
  const zebra = ({ p, t }, half = 4.0) => { for (let o2 = -half + 0.45; o2 <= half - 0.45; o2 += 0.9) quad(p, t, o2 - 0.225, o2 + 0.225, -2, 2); };
  zebra(roadAt(S1[0], S1[1], 0.33));
  // [v6:fix1] the markings at the 結 junction as the photos measure them (tools/survey/roadpaint.py: IMG_0829-0832, 0822, 0907,
  // 0908, 0911, 0912 back-projected onto the road plane; the paint map in N1's frame, s along N1 from its south end, l east of
  // its centre line): the 導流帯 hatch s 91-110 m, l 0.3-2.8 m, bars 0.45 m wide slanting at 50 deg every 1.95 m between two edge
  // lines; the zebra crossing at s 111.2-114.9 m with ten 0.45 m bars along the road across l -2.6..6.4 m (0.9 m pitch)
  { const o = N1[0], tt = [(N1[1][0] - o[0]) / 116.35, (N1[1][1] - o[1]) / 116.35], ee = [tt[1], -tt[0]], at = (sv, lv) => [o[0] + tt[0] * sv + ee[0] * lv, o[1] + tt[1] * sv + ee[1] * lv];
    const poly = (P) => k.mesh(capGeo(P, yAt(P[0][0], P[0][1]), { tile: 2 }), m.roadWhite);
    for (const l of [0.3, 2.8]) poly([at(91, l - 0.07), at(110, l - 0.07), at(110, l + 0.07), at(91, l + 0.07)]);
    for (let sv = 91.6; sv < 108.5; sv += 1.95) { const hw = 0.225 / Math.sin(50 * Math.PI / 180), s2 = sv + 2.1; poly([at(sv - hw * 0.5, 0.37), at(sv + hw * 0.5, 0.37), at(s2 + hw * 0.5, 2.73), at(s2 - hw * 0.5, 2.73)]); }
    for (let l = -2.2; l < 6.2; l += 0.9) poly([at(111.2, l - 0.225), at(114.9, l - 0.225), at(114.9, l + 0.225), at(111.2, l + 0.225)]); }
  // ◇ crossing-ahead marks
  for (const { p, t } of [roadAt(N1[0], N1[1], 0.55), roadAt(S1[0], S1[1], 0.85)]) for (const off of [-2, 2]) { const c = [p[0] - t[1] * off, p[1] + t[0] * off], n = [-t[1], t[0]]; const ring = [[0, 2.2], [0.75, 0], [0, -2.2], [-0.75, 0]].map(([u, v]) => [c[0] + n[0] * u + t[0] * v, c[1] + n[1] * u + t[1] * v]); const inner = [[0, 1.85], [0.6, 0], [0, -1.85], [-0.6, 0]].map(([u, v]) => [c[0] + n[0] * u + t[0] * v, c[1] + n[1] * u + t[1] * v]); k.mesh(capGeo(ring, yAt(c[0], c[1]), { tile: 2, holes: [inner] }), m.roadWhite); }
  // black bollards with white reflective bands along the kerbs at the junction
  const bol = (x, z) => { const gy = L.heightAt(x, z) + 0.15; k.cyl(0.08, 0.08, 0.85, m.black, [x, gy + 0.42, z], null, 8); k.cyl(0.085, 0.085, 0.08, m.white, [x, gy + 0.68, z], null, 8); k.cyl(0.085, 0.085, 0.06, m.white, [x, gy + 0.52, z], null, 8); ctx.physics?.addBox?.(x, z, 0.2, 0.2, 0, gy, gy + 0.9); };
  // [v6:fix1] the real bollards stand on the far (west) kerb along x -31.4 (IMG_0829: ground cuts of the row, z 43.7-56.6 every ~2.6 m); the old east-kerb row is not in the photos
  // [v6:fix3] none: IMG_0829 / 0822 show no bollards along the far kerb (the 4-6 black posts of the old row are not in the photos); the one the photo has stands in IMG_0822's foreground near the crossing
  bol(-17.3, 61.2);
  for (let i = 0; i < 9; i++) { const f = i / 8; bol(-18.9 + (-23.5 + 18.9) * f, 73.5 + (65.4 - 73.5) * f); }   // IMG_0831: nine bollards along the sidewalk edge, (-18.9, 73.5) -> (-23.5, 65.4)
  // [v6:fix1] the road sign pole of IMG_0832 (foot cut (-15.0, 63.0), top T.P. 5.2): a blue 'ahead only' disc over a school-crossing triangle, facing north
  { const x = -15.0, z = 63.0, gy = L.heightAt(x, z), top = 5.2, g = k.group([x, 0, z], Math.PI), kk = ctx.kit(g);
    k.cyl(0.045, 0.045, top - gy, m.white, [x, (gy + top) / 2, z], null, 8);
    const disc = ctx.tex.draw(128, 128, (c, w, h) => { c.fillStyle = '#1f5fb0'; c.beginPath(); c.arc(w / 2, h / 2, w * 0.48, 0, 7); c.fill(); c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.beginPath(); c.arc(w / 2, h / 2, w * 0.43, 0, 7); c.stroke(); c.fillStyle = '#ffffff'; c.fillRect(w * 0.46, h * 0.3, w * 0.08, h * 0.45); c.beginPath(); c.moveTo(w * 0.5, h * 0.18); c.lineTo(w * 0.7, h * 0.4); c.lineTo(w * 0.3, h * 0.4); c.fill(); }, { key: 'p5-ahead' });
    const tri = ctx.tex.draw(128, 128, (c, w, h) => { c.fillStyle = '#1f5fb0'; c.beginPath(); c.moveTo(w / 2, h * 0.04); c.lineTo(w * 0.97, h * 0.92); c.lineTo(w * 0.03, h * 0.92); c.closePath(); c.fill(); c.strokeStyle = '#ffffff'; c.lineWidth = 5; c.stroke(); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w * 0.4, h * 0.45, 7, 0, 7); c.arc(w * 0.6, h * 0.52, 5, 0, 7); c.fill(); c.fillRect(w * 0.37, h * 0.52, 7, 22); c.fillRect(w * 0.58, h * 0.57, 5, 16); }, { key: 'p5-school' });
    const yy = top - gy;
    for (const [tx, cy, sz] of [[disc, yy - 0.3, 0.6], [tri, yy - 1.0, 0.65]]) for (const f of [1, -1]) kk.plane(sz, sz, mapMat(ctx, 'decal', '#ffffff', tx, { transparent: true, alphaTest: 0.3 }), [0, gy + cy, f * 0.06], [0, f > 0 ? 0 : Math.PI, 0]);
    ctx.physics?.addBox?.(x, z, 0.2, 0.2, 0, gy, top); ctx.features?.add('minami', 'sign.pole.0832', [x, gy, z]); }
  // [v6:fix3] the 40 km/h speed limit over the no-parking (駐停車禁止) sign on one white pole at the convenience store's kerb (IMG_0822 + 0829: the two discs triangulate at
  // (-34.8, 5.5, 50.3) and (-35.1, 4.9, 50.1); foot on the sidewalk strip, T.P. 2.3), the discs 0.6 m across facing the cameras (east-south-east)
  { const x = -34.9, z = 50.2, gy = 2.3, top = 5.9, g = k.group([x, 0, z], Math.atan2(0.9, 0.43)), kk = ctx.kit(g);
    k.cyl(0.04, 0.04, top - gy, m.white, [x, (gy + top) / 2, z], null, 8);
    const d40 = ctx.tex.draw(128, 128, (c, w, h) => { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2, h / 2, w * 0.49, 0, 7); c.fill(); c.strokeStyle = '#c8202c'; c.lineWidth = 14; c.beginPath(); c.arc(w / 2, h / 2, w * 0.4, 0, 7); c.stroke(); c.fillStyle = '#1d3f8a'; c.font = '900 52px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('40', w / 2, h / 2 + 3); }, { key: 'sign40' });
    const dNP = ctx.tex.draw(128, 128, (c, w, h) => { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2, h / 2, w * 0.49, 0, 7); c.fill(); c.fillStyle = '#c8202c'; c.beginPath(); c.arc(w / 2, h / 2, w * 0.46, 0, 7); c.fill(); c.fillStyle = '#1b4fa6'; c.beginPath(); c.arc(w / 2, h / 2, w * 0.36, 0, 7); c.fill(); c.strokeStyle = '#c8202c'; c.lineWidth = 12; c.beginPath(); c.moveTo(w * 0.18, h * 0.82); c.lineTo(w * 0.82, h * 0.18); c.stroke(); }, { key: 'signNP' });
    for (const [tx, yy] of [[d40, 5.51], [dNP, 4.9]]) for (const f of [1, -1]) kk.plane(0.6, 0.6, mapMat(ctx, 'decal', '#ffffff', tx, { transparent: true, alphaTest: 0.3 }), [0, yy, f * 0.06], [0, f > 0 ? 0 : Math.PI, 0]);
    ctx.physics?.addBox?.(x, z, 0.2, 0.2, 0, gy, top); ctx.features?.add('minami', 'sign.40', [-34.76, 5.51, 50.27]); }
  for (let f = 0.05; f < 0.5; f += 0.06) { const { p, t } = roadAt(S1[0], S1[1], f); bol(p[0] - t[1] * 5.2, p[1] + t[0] * 5.2); }
  return { zebras: 2 };
}
