// [v3:town] copied from src/anime/world/_houses/apartment.js (foundation first-look vendoring of Sakuragaoka Station, MIT); town owns this copy.
// Vendored from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station). [v3:foundation] first-look only; town owns buildings.
// 2-storey wooden apartment (アパート「コーポ桜ヶ丘」): 4 units per floor, rear external corridor with
// steel stairs (walkable), front balconies with partitions + laundry, bike shelter, mailbox bank.
import { WALLS, buildWindow } from './house.js';

/** F: lot frame at the frontage centre (+z toward the lane). Lot local x in [-w/2, w/2], z in [-depth, 0]. */
export function buildApartment(H, F, w, depth, r) {
  const { M, A, P, L } = H;
  const gy = (x, z) => H.gy(F, x, z);
  const res = { bikeSpots: [], gardenSpots: [], wallTops: [] };
  const FH = 2.8;
  const bx0 = -w / 2 + 2.6, bx1 = w / 2 - 0.5;     // building x extent
  const bz1 = -2.6, bz0 = bz1 - 6.0;                 // building z extent (front at bz1)
  const cz0 = bz0 - 1.25;                            // corridor outer edge
  let gmax = -1e9, gmin = 1e9;
  for (const [x, z] of [[bx0, bz0], [bx1, bz0], [bx0, bz1], [bx1, bz1], [bx0 - 1.3, cz0], [bx1, cz0]]) { const g = gy(x, z); gmax = Math.max(gmax, g); gmin = Math.min(gmin, g); }
  const fy = gmax + 0.35;
  const top = fy + 2 * FH;
  const wallC = '#e9e1cf', trim = '#6b5242', steel = '#5b5450';
  const bw = bx1 - bx0, bd = bz1 - bz0, bcx = (bx0 + bx1) / 2, bcz = (bz0 + bz1) / 2;
  const S = { rng: r, floorY: fy, fh: FH, groundMin: gmin, lod: 2, frameColor: '#8e949b', sillColor: '#8e949b', grilleColor: '#8e949b', shutterColor: '#b9bcbf', shutterStyle: 'none', trim, interiors: null, roof: { mat: 'metal', color: '#6d7680' }, wall: { kind: 'siding', color: wallC } };
  // foundation + walls
  F.boxB(M.concrete, '#bdbcb5', bw - 0.04, fy - gmin + 0.14, bd - 0.04, bcx, gmin - 0.14, bcz, { uv: { world: 2 } });
  F.boxB(M.siding, wallC, bw, 2 * FH + 0.02, bd, bcx, fy - 0.02, bcz, { uv: { world: 1.2 } });
  F.boxB(M.plain, trim, bw + 0.05, 0.16, bd + 0.05, bcx, fy + FH - 0.08, bcz);
  H.col(F, bcx, bcz, bw + 0.05, bd + 0.05, 0, gmin - 1, top + 2);
  // low-pitch metal gable roof (ridge along x)
  const o = 0.45, p = 0.22, tv = 0.1;
  const hx = bw / 2 + 0.35, hz = bd / 2 + o, yE = top + tv - o * p, yR = yE + hz * p;
  const RF = F.sub(bcx, 0, bcz, 0);
  const slabF = H.slab;
  for (const s of [1, -1]) {
    const pts = [[-hx, yE, s * hz], [hx, yE, s * hz], [hx, yR, 0], [-hx, yR, 0]];
    const sl = slabF(pts, tv, (q) => [q[0] / 1.08, -(hz - s * q[2]) * 1.02]);
    H.gb.mesh(M.metal, '#6d7680', sl.p, sl.n, sl.u, sl.i, RF.M(0, 0, 0));
    RF.box(M.plain, '#e9e6df', 2 * hx, 0.2, 0.04, 0, yE - tv - 0.05, s * (hz - 0.02));
    RF.box(M.plain, '#e9e6df', 2 * hx - 0.04, 0.02, o - 0.04, 0, yE - tv - 0.12, s * (bd / 2 + o / 2));
    RF.box(M.plain, '#8e949b', 2 * hx, 0.09, 0.1, 0, yE - tv - 0.06, s * (hz + 0.05));
  }
  for (const sx of [-1, 1]) {
    const pg = H.poly([[sx * bw / 2, top - 0.01, bd / 2], [sx * bw / 2, top - 0.01, -bd / 2], [sx * bw / 2, top + bd / 2 * p, 0]], [sx, 0, 0], (q) => [q[2] / 1.2, q[1] / 1.2]);
    H.gb.mesh(M.siding, wallC, pg.p, pg.n, pg.u, pg.i, RF.M(0, 0, 0));
    for (const sz of [-1, 1]) RF.beam(M.plain, '#e9e6df', [sx * (hx + 0.015), yE - 0.06, sz * hz], [sx * (hx + 0.015), yR - 0.06, 0], 0.045, 0.22, { extend: 0.1 });
  }
  RF.beam(M.plain, '#6d7680', [-hx, yR + 0.02, 0], [hx, yR + 0.02, 0], 0.2, 0.06);
  // sign on the west gable wall (faces the plaza)
  const WF = F.sub(bx0, 0, bcz, -Math.PI / 2);
  WF.box(M.atlas, '#ffffff', 2.2, 0.55, 0.04, 0, fy + 2 * FH - 0.6, 0.02, { uv: { rect: A.rects.apt_sign, white: A.white } });
  buildWindow(H, WF, -1.6, fy + FH + 1.0, 0.74, 0.9, 'small', S, r, 2, 'side', 1);
  buildWindow(H, WF, -1.6, fy + 1.0, 0.74, 0.9, 'small', S, r, 2, 'side', 0);
  // units
  const n = 4, uw = bw / n;
  const FR = F.sub(bcx, 0, bz1, 0);          // front face frame (+z to the lane)
  const BK = F.sub(bcx, 0, bz0, Math.PI);    // back face frame (+z to the corridor / north)
  for (let fl = 0; fl < 2; fl++) {
    const y0 = fy + fl * FH;
    for (let i = 0; i < n; i++) {
      const uc = -bw / 2 + uw * (i + 0.5);
      const room = String((fl + 1) * 100 + i + 1);
      // front: balcony door (big window) + small window
      buildWindow(H, FR, uc - 0.35, y0 + 0.08, 1.69, 1.9, 'big', { ...S, shutterStyle: 'none' }, r, 2, 'balc', 0);
      // back (corridor side, u mirrored): steel door, frosted kitchen window with grille, meter box, lamp
      const ub = -uc;
      BK.box(M.plain, '#8e949b', 0.98, 2.06, 0.06, ub + 0.55, y0 + 1.03, 0.03);
      BK.box(M.atlas, '#ffffff', 0.86, 1.98, 0.03, ub + 0.55, y0 + 1.0, 0.05, { uv: { rect: A.rects.door_steel, white: A.white } });
      BK.box(M.atlas, '#ffffff', 0.22, 0.11, 0.02, ub + 0.55, y0 + 2.22, 0.02, { uv: { rect: A.rects['room' + room], white: A.white } });
      buildWindow(H, BK, ub - 0.65, y0 + 1.05, 0.74, 0.8, 'small', S, r, 2, 'back', fl);
      BK.box(M.plain, '#d6d0c2', 0.5, 0.9, 0.12, ub + 1.28, y0 + 1.3, 0.06);   // meter cabinet (PS)
      BK.box(M.plain, '#8e949b', 0.46, 0.02, 0.02, ub + 1.28, y0 + 1.3, 0.125);
      BK.box(M.lampDim, null, 0.16, 0.06, 0.16, ub + 0.55, y0 + FH - 0.12, 0.6, { shadow: false });
      // front 1F: tiny private garden; 2F: balcony
      if (fl === 1) {
        const BF = FR;
        BF.box(M.plain, '#dcd6c8', uw, 0.16, 0.95, uc, y0 - 0.06, 0.475);
        BF.boxB(M.plain, '#d8d2c4', uw, 1.0, 0.07, uc, y0 + 0.03, 0.915);
        BF.box(M.plain, trim, uw, 0.05, 0.1, uc, y0 + 1.06, 0.915);
        if (i < n - 1) BF.boxB(M.plain, '#cfd6da', 0.04, 1.8, 0.9, uc + uw / 2, y0 + 0.03, 0.45); // partition 隔て板
        // laundry pole + stuff
        const py = y0 + 1.8;
        BF.cyl(M.plain, '#8fb3c9', 0.016, uw - 0.4, uc, py, 0.55, { rz: Math.PI / 2, seg: 6 });
        for (const s of [-1, 1]) BF.box(M.plain, '#c9ccd1', 0.03, 0.03, 0.6, uc + s * (uw / 2 - 0.25), py + 0.02, 0.3);
        if (r() < 0.75) H.laundry.line(BF, uc - uw / 2 + 0.3, uc + uw / 2 - 0.3, py, 0.55, r, 'apartment');
        if (r() < 0.8) P.acUnit(BF, uc + uw / 2 - 0.55, y0 + 0.03, 0.3, 0);
        if (r() < 0.3) P.futon(BF, uc - 0.3, y0 + 1.08, 0.915, r);
        if (r() < 0.4) P.dish(BF, uc - uw / 2 + 0.3, y0 + 0.85, 1.0, 0);
      } else {
        // 1F garden fence + AC on the ground
        FR.boxB(M.plain, '#8e949b', 0.04, 0.8, 0.04, uc + uw / 2 - 0.05, gy(bcx + uc + uw / 2, bz1 + 1.2), 1.2);
        if (r() < 0.8) P.acUnit(FR, uc + uw / 2 - 0.6, gy(bcx + uc, bz1 + 0.3), 0.3, 0);
        if (r() < 0.5) P.pot(FR, uc - 0.9, gy(bcx + uc - 0.9, bz1 + 0.6), 0.6, r, 1);
      }
    }
  }
  // 1F front fence line
  H.slopedWall(F, bx0, bx1, bz1 + 1.3, 0.75, 0.05, M.plain, '#8e949b', 0, 0, 0.1);
  // ---------------------------------------------------------------- corridor + stairs (rear)
  const yC = fy + FH;
  const cxa = bx0 - 1.35, cxb = bx1; // corridor spans over the stair head too
  const czm = (bz0 + cz0) / 2;
  F.box(M.plain, '#cfcac0', cxb - bx0, 0.2, bz0 - cz0, (bx0 + cxb) / 2, yC - 0.1, czm);
  F.boxB(M.plain, '#dcd6c8', cxb - bx0, 1.0, 0.08, (bx0 + cxb) / 2, yC, cz0 + 0.04);
  F.box(M.plain, steel, cxb - bx0 + 0.04, 0.05, 0.12, (bx0 + cxb) / 2, yC + 1.02, cz0 + 0.04);
  for (let k = 0; k <= 4; k++) { const x = bx0 + 0.1 + k * (cxb - bx0 - 0.2) / 4; F.boxB(M.plain, steel, 0.12, yC - 0.2 - gy(x, cz0 + 0.1), 0.12, x, gy(x, cz0 + 0.1), cz0 + 0.12); H.col(F, x, cz0 + 0.12, 0.14, 0.14, 0, gy(x, cz0) - 0.5, yC); }
  H.walk(F, (bx0 + cxb) / 2, czm, cxb - bx0, bz0 - cz0, 0, yC);
  H.col(F, (bx0 + cxb) / 2, cz0 + 0.04, cxb - bx0, 0.1, 0, yC - 0.3, yC + 1.05);
  // stair: straight steel flight along -z at x = bx0 - 0.65, from ground (front) up to the corridor landing (back)
  const sx = bx0 - 0.68, swd = 1.0;
  const sz1 = bz0 - 0.05, g0 = gy(sx, bz0 + 3.9);
  const rise = yC - g0, nSt = Math.round(rise / 0.19), run = nSt * 0.25;
  const szStart = sz1 + run;   // bottom (front side)
  // landing at the top (west of the corridor)
  F.box(M.plain, '#cfcac0', swd + 0.1, 0.18, bz0 - cz0, sx, yC - 0.09, czm);
  H.walk(F, sx, czm, swd + 0.1, bz0 - cz0, 0, yC);
  for (let i = 0; i < nSt; i++) {
    const yT = g0 + rise * (i + 1) / nSt;
    const zc = szStart - 0.25 * (i + 0.5);
    F.box(M.plain, '#a9a49b', swd, 0.04, 0.27, sx, yT - 0.02, zc);
    F.box(M.plain, steel, swd, 0.19, 0.02, sx, yT - 0.1, zc + 0.125);
  }
  H.gb.box; // (no-op reference)
  for (const s of [-1, 1]) {
    F.beam(M.plain, steel, [sx + s * (swd / 2 + 0.02), g0 - 0.05, szStart], [sx + s * (swd / 2 + 0.02), yC - 0.05, sz1], 0.05, 0.24);
    F.beam(M.plain, steel, [sx + s * (swd / 2 + 0.03), g0 + 0.9, szStart], [sx + s * (swd / 2 + 0.03), yC + 0.9, sz1], 0.04, 0.05);
    for (let k = 0; k <= 5; k++) { const t = k / 5; const zz = szStart + (sz1 - szStart) * t; const yy = g0 + rise * t; F.box(M.plain, steel, 0.025, 0.9, 0.025, sx + s * (swd / 2 + 0.03), yy + 0.45, zz); }
  }
  F.boxB(M.plain, steel, 0.12, yC - g0, 0.12, sx - swd / 2, g0, sz1 - 0.05);
  F.boxB(M.plain, steel, 0.12, yC - g0, 0.12, sx - swd / 2, g0, cz0 + 0.06);
  // walkable stair (as a ramp rising toward -z): addWalkRamp rises along local +z, so rotate by PI
  { const pc = F.w(sx, 0, (szStart + sz1) / 2); H.ctx.physics.addWalkRamp(pc.x, pc.z, swd, run, F.ry + Math.PI, pc.y + g0, pc.y + yC); }
  for (const s of [-1, 1]) { const pc = F.w(sx + s * (swd / 2 + 0.05), 0, (szStart + sz1) / 2); H.ctx.physics.addBox(pc.x, pc.z, 0.08, run, F.ry, pc.y + g0 - 0.5, pc.y + yC + 1.0); }
  H.col(F, sx - swd / 2 - 0.05, czm, 0.08, bz0 - cz0, 0, yC - 0.3, yC + 1.05);
  // mailbox bank + bike shelter at the front west corner
  const mbx = bx0 - 0.9, mbz = bz1 + 0.2;
  F.boxB(M.atlas, '#ffffff', 0.9, 0.45, 0.3, mbx, gy(mbx, mbz) + 0.8, mbz, { uv: { rect: A.rects.posts, white: A.white } });
  F.boxB(M.plain, '#8e949b', 0.06, 0.8, 0.06, mbx - 0.4, gy(mbx, mbz), mbz); F.boxB(M.plain, '#8e949b', 0.06, 0.8, 0.06, mbx + 0.4, gy(mbx, mbz), mbz);
  // bike shelter (駐輪場) along the front
  const shx0 = bx0 + 0.3, shx1 = bx0 + 5.6, shz = -1.2;
  for (const x of [shx0, shx1]) for (const z of [shz - 0.8, shz + 0.8]) { F.boxB(M.plain, '#8e949b', 0.07, 2.1, 0.07, x, gy(x, z) - 0.05, z); H.colC(F, x, z, 0.06, gy(x, z) - 0.5, gy(x, z) + 2.1); }
  const shY = Math.max(gy(shx0, shz), gy(shx1, shz)) + 2.1;
  F.box(M.plain, '#8e949b', shx1 - shx0 + 0.1, 0.08, 0.08, (shx0 + shx1) / 2, shY, shz - 0.8);
  F.box(M.plain, '#8e949b', shx1 - shx0 + 0.1, 0.08, 0.08, (shx0 + shx1) / 2, shY, shz + 0.8);
  F.box(M.poly, null, shx1 - shx0 + 0.3, 0.02, 1.9, (shx0 + shx1) / 2, shY + 0.07, shz, { noOutline: true, rx: 0.05 });
  H.groundRect(F, shx0 - 0.2, shz - 1.0, shx1 + 0.2, shz + 1.0, M.concrete, '#c9c7c0', 0.04, 2);
  for (let k = 0; k < 4; k++) { const x = shx0 + 0.8 + k * 1.2; const p = F.w(x, 0, shz); res.bikeSpots.push({ x: p.x, z: p.z, rotY: F.ry + Math.PI }); }
  // paths & ground
  H.groundRect(F, -w / 2 + 0.05, -depth + 0.05, w / 2 - 0.05, -0.05, M.gravel, '#d6d0c4', 0.02, 1.5);
  H.groundRect(F, bx0 - 1.3, cz0, bx1, bz0, M.concrete, '#c9c7c0', 0.035, 2);
  H.groundRect(F, sx - 0.7, bz0, sx + 0.7, -0.05, M.concrete, '#c9c7c0', 0.035, 2);
  // boundary walls (sides + back), low block along the front with an opening at the path
  const { boundarySeg, boundarySegZ } = H.bnd;
  boundarySeg(H, F, sx + 0.8, w / 2 - 0.06, -0.15, 'low', 0.5, '#c9c7c0', r, gy, 2, null, true);
  boundarySeg(H, F, -w / 2 + 0.06, -w / 2 + 0.5, -0.15, 'low', 0.5, '#c9c7c0', r, gy, 2, null, true);
  boundarySegZ(H, F, w / 2 - 0.07, -0.3, -depth + 0.08, 'block', 1.1, '#c9c7c0', r, gy);
  boundarySeg(H, F, -w / 2 + 0.07, w / 2 - 0.07, -depth + 0.08, 'mesh', 1.2, '#c9c7c0', r, gy, 2, null, false);
  // gomi station by the lane
  P.gomiStation(F, w / 2 - 1.4, gy(w / 2 - 1.4, -0.8), -0.8, r);
  H.col(F, w / 2 - 1.4, -0.8, 1.9, 1.0, 0, gy(w / 2 - 1.4, -0.8) - 0.5, gy(w / 2 - 1.4, -0.8) + 1.1);
  return res;
}
