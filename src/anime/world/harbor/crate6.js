// [v6:fix3] The fish tubs of the north-facility hall as separate crates (IMG_0853 / 0855 / 0860 / 0861; docs/anime/survey/market.md fix 3).
// Each crate is its own object: four ribbed walls with a draft, an interior floor, the pale rim lip with its two hinged latches, a
// skirt with fork pockets and corner feet, and the white plates the photos read ("4382 / 気仙沼" on the narrow face, "H23補助 / 魚市場"
// and "寄贈 農林中央金庫 / 魚市場" on the wide one). 1.44 x 1.19 x 0.74 m is the rim rectangle cut from the two camera stands
// (market_hall.py: opposite sides 1.44 / 1.45 and 1.18 / 1.20 m; height 0.74 m), the standard 1 m3 fish tub.
// Quay-frame placement: a along the quay (group local z), d out to sea (local x), y T.P.
import * as THREE from 'three';
import { textTex, mapMat, FONT } from './util.js';

const NUMS = ['4382', '3331', '4484', '4383', '3247', '3419', '4381', '3332', '4385', '3330', '4486', '3250'];

export function crateMats(ctx) {
  const t = (c, o) => ctx.mat.toon(c, o);
  const ribs = ctx.tex.draw(256, 128, (g) => {
    g.fillStyle = '#2a5fa3'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#2f6aac'; g.lineWidth = 1.5;
    for (let y = 8; y < 128; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    for (let x = 0; x < 256; x += 21.3) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
    g.strokeStyle = '#1f4a86'; g.lineWidth = 1; for (let y = 20; y < 128; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  }, { key: 'crate-ribs' });
  return {
    body: mapMat(ctx, 'toon', '#ffffff', ribs, { paint: 0.03 }), inner: t('#3d86c9', { paint: 0.02 }), rim: t('#aebcc2', { paint: 0.02 }), latch: t('#cdbd8c', { paint: 0.02 }), foot: t('#25508c', { paint: 0.02 }),
  };
}

function plateMat(ctx, kind, num) {
  const key = `crate-plate|${kind}|${num}`;
  const tex = ctx.tex.draw(256, 192, (g) => {
    g.fillStyle = '#e9edf0'; g.fillRect(0, 0, 256, 192);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (kind === 'num') {
      g.fillStyle = '#b3262d'; g.font = `900 40px ${FONT.sans}`;
      [...num].forEach((c, i) => g.fillText(c, 128, 26 + i * 36));
      g.fillStyle = '#26282c'; g.font = `800 34px ${FONT.sans}`; g.fillText('気仙沼', 128, 176);
    } else if (kind === 'sub') {
      g.fillStyle = '#26282c'; g.font = `800 36px ${FONT.sans}`; g.fillText('H23補助', 128, 40); g.font = `900 52px ${FONT.sans}`; g.fillText('魚市場', 128, 120);
    } else {
      g.fillStyle = '#26282c'; g.font = `700 28px ${FONT.sans}`; g.fillText('寄贈', 128, 30); g.fillText('農林中央金庫', 128, 72); g.font = `900 56px ${FONT.sans}`; g.fillText('魚市場', 128, 140);
    }
  }, { key });
  return mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0 });
}

const _ringCache = new Map();
/** A rounded-rectangle ring (outer w x l, wall `th`, corner radius r) extruded upward by `h`: the rim collar of a crate, one smooth piece. */
function collarGeo(w, l, th, r, h) {
  const key = [w, l, th, r, h].join('|'); if (_ringCache.has(key)) return _ringCache.get(key);
  const rr = (s, w_, l_, r_) => { const x = w_ / 2, y = l_ / 2; s.moveTo(-x + r_, -y); s.lineTo(x - r_, -y); s.quadraticCurveTo(x, -y, x, -y + r_); s.lineTo(x, y - r_); s.quadraticCurveTo(x, y, x - r_, y); s.lineTo(-x + r_, y); s.quadraticCurveTo(-x, y, -x, y - r_); s.lineTo(-x, -y + r_); s.quadraticCurveTo(-x, -y, -x + r_, -y); return s; };
  const shape = rr(new THREE.Shape(), w, l, r), hole = rr(new THREE.Path(), w - 2 * th, l - 2 * th, Math.max(0.01, r - th)); shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 }); g.rotateX(-Math.PI / 2);   // shape x,y -> ground x (a), z (-d)
  _ringCache.set(key, g); return g;
}

/**
 * One crate with its near-left corner at (a, d), footprint w (along a) x l (along d), standing on y0.
 * `K` is a kit on the quay-frame group (x = d, z = a). `i` picks the plate numbers. The body is one smooth rounded shell (injection-moulded
 * corners: no hard crease edges), the rim collar one rounded ring, the base a continuous skirt (runners with fork pockets on `pockets`).
 */
export function fishTub(ctx, K, M, { a, d, y0, w = 1.19, l = 1.44, h = 0.74, i = 0, plates = true, pockets = false, shellW = null }) {
  const bx = (mat, a0, a1, d0, d1, ya, yb) => K.box(d1 - d0, yb - ya, a1 - a0, mat, [(d0 + d1) / 2, (ya + yb) / 2, (a0 + a1) / 2]);
  const top = y0 + h, ca = a + w / 2, cd = d + l / 2;
  // smooth outer shell below the collar, running down to the floor: neighbours in a row touch (`shellW` = the pitch), so the 0.04 m slit between the
  // rims is open at the top only (below it the slit is black and shut in the photos); the row-end tub stands on its two runners (fork pocket between)
  const sw = shellW ?? w - 0.02;
  const shell = (h0, h1) => (shellW ? K.box(l - 0.02, h1 - h0, sw, M.body, [cd, (h0 + h1) / 2, ca]) : K.rbox(l - 0.02, h1 - h0, sw, 0.07, M.body, [cd, (h0 + h1) / 2, ca]));   // in a row: square so the touching neighbours leave no groove
  if (pockets) {
    shell(y0 + 0.11, top - 0.14);
    for (const fa of [a + 0.05, a + w - 0.27]) K.rbox(l - 0.1, 0.13, 0.22, 0.04, M.foot, [cd, y0 + 0.065, fa + 0.11]);
  } else shell(y0 + 0.02, top - 0.14);
  // rim collar: one ring, 0.14 m deep, 0.06 m wall, pale; interior floor 0.14 m below the rim
  const th = 0.045, ch = 0.14;
  K.mesh(collarGeo(w + 0.024, l + 0.024, th, 0.07, ch), M.rim, [cd, top - ch, ca], [0, Math.PI / 2, 0]);
  bx(M.inner, a + th, a + w - th, d + th, d + l - th, top - ch - 0.01, top - ch + 0.005);
  for (const f of [0.25, 0.7]) { bx(M.latch, a + w * f - 0.07, a + w * f + 0.07, d - 0.02, d + 0.05, top, top + 0.03); bx(M.latch, a + w * f - 0.07, a + w * f + 0.07, d + l - 0.05, d + l + 0.02, top, top + 0.03); }
  if (plates) {
    const num = NUMS[i % NUMS.length], yc = y0 + h * 0.46;
    // plates face the camera side (-d) and the quay-end side (-a): the narrow face carries the number plate, the wide one two plates
    K.plane(0.34, 0.26, plateMat(ctx, 'num', num), [d + 0.004, yc + 0.02, a + w * 0.3], [0, -Math.PI / 2, 0]);
    K.plane(0.34, 0.26, plateMat(ctx, 'don', ''), [d + 0.004, yc + 0.02, a + w * 0.74], [0, -Math.PI / 2, 0]);
    K.plane(0.34, 0.26, plateMat(ctx, 'num', NUMS[(i + 5) % NUMS.length]), [d + l * 0.28, yc + 0.02, ca - sw / 2 - 0.004], [0, Math.PI, 0]);
    K.plane(0.34, 0.26, plateMat(ctx, 'sub', ''), [d + l * 0.72, yc + 0.02, ca - sw / 2 - 0.004], [0, Math.PI, 0]);
  }
}
