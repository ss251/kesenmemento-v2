// [v3:life] Walking paths for townspeople: sidewalk polylines beside the real hero-zone streets (ROADS offset by
// half the road width + ~0.9 m, cut wherever they would enter a building footprint or the sea), plus the seawall
// promenade from SPOTS.promenade. Deterministic (no randomness at all).
//
//   const P = buildPaths(ctx)  ->  { paths: [{ id, kind: 'sidewalk'|'promenade', pts: [[x,z],...], cum: [...], len, top }] ,
//                                    at(path, s, out) -> { x, z, dx, dz } (s in metres along the path, clamped) }
// Other packages may publish their own via ctx.services.street?.walkPaths ([[x,z],...] polylines): used first.

function buildLotGrid(L, cx, cz, R) {
  const cell = 16, grid = new Map();
  for (const lot of L.LOTS) {
    if (lot.zone === 'far') continue;
    const o = lot.obb; if (Math.hypot(o.cx - cx, o.cz - cz) > R + 60) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of lot.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
      const k = i + ',' + j; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(lot.poly);
    }
  }
  const inPoly = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  return {
    blocked(x, z, pad = 0.7) {
      for (const [dx, dz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) {
        const px = x + dx, pz = z + dz;
        const list = grid.get(Math.floor(px / cell) + ',' + Math.floor(pz / cell));
        if (list) for (const p of list) if (inPoly(p, px, pz)) return true;
      }
      return false;
    },
  };
}

/** Step a point away from the sea until it is `margin` metres from any water (8 directions). */
export function landward(L, x, z, margin = 2.2) {
  for (let k = 0; k < 40; k++) {
    let wx = 0, wz = 0, n = 0;
    for (let a = 0; a < 16; a++) { const c = Math.cos(a * Math.PI / 8), s = Math.sin(a * Math.PI / 8); if (L.isWater(x + c * margin, z + s * margin)) { wx += c; wz += s; n++; } }
    if (!n && !L.isWater(x, z)) return [x, z];
    const l = Math.hypot(wx, wz) || 1; x -= (wx / l) * 0.5; z -= (wz / l) * 0.5;
  }
  return [x, z];
}
function resample(pts, step) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / step));
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
function offset(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    out.push([pts[i][0] + tz * d, pts[i][1] - tx * d]);       // right-hand normal (tz, -tx)
  }
  return out;
}
function withCum(p) { const cum = [0]; for (let i = 1; i < p.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1])); p.cum = cum; p.len = cum[cum.length - 1]; return p; }
/** Chaikin smoothing keeps corners soft so walkers never snap-turn. */
function chaikin(pts, it = 2) { let p = pts; for (let k = 0; k < it; k++) { const o = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const [ax, az] = p[i], [bx, bz] = p[i + 1]; o.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]); } o.push(p[p.length - 1]); p = o; } return p; }

export function buildPaths(ctx, o = {}) {
  const L = ctx.L;
  const Z = L.ZONES.hero;
  const R = (o.radius ?? Z.r) * (ctx.quality?.heroR ?? 1);
  const grid = buildLotGrid(L, Z.cx, Z.cz, R);
  const paths = [];
  const ok = (x, z) => !L.isWater(x, z) && !L.isWater(x + 1.2, z) && !L.isWater(x - 1.2, z) && !L.isWater(x, z + 1.2) && !L.isWater(x, z - 1.2) && !grid.blocked(x, z);

  // ---- 0. paths published by the town package (preferred when present)
  for (const [i, pl] of (ctx.services.street?.walkPaths || []).entries()) if (pl?.length > 1) paths.push(withCum({ id: 'town' + i, kind: 'sidewalk', pts: pl.map((p) => [p[0], p[1]]) }));

  // ---- 1. the seawall promenade (ordered anchors along the inner bay)
  const prom = (L.SPOTS.promenade || []).filter((p) => Math.hypot(p.x - Z.cx, p.z - Z.cz) < R + 40);
  if (prom.length > 1) {
    // the anchors sit on the seawall edge: keep the walking line 2.2 m inland of the water, on solid ground; where it
    // still crosses a cove, split it into separate runs
    const pts = resample(chaikin(prom.map((p) => [p.x, p.z]), 2), 3).map(([x, z]) => landward(L, x, z, 2.2));
    const top = prom.reduce((a, p) => a + (p.top || 0), 0) / prom.length;
    let run = [], k = 0;
    const flush = () => { if (run.length > 8) paths.push(withCum({ id: 'promenade' + (k ? k : ''), kind: 'promenade', pts: run, top })), k++; run = []; };
    for (const [x, z] of pts) { if (ok(x, z) && L.heightAt(x, z) > -0.3) run.push([x, z]); else flush(); }
    flush();
  }

  // ---- 2. sidewalks beside the real streets, nearest the bay first
  const bay = L.SPOTS.innerBay || { x: Z.cx, z: Z.cz };
  const roads = L.ROADS.filter((r) => r.zone === 'hero' && (r.kind === 'city' || r.kind === 'prefectural') && r.pts.length > 1)
    .map((r) => { let len = 0; for (let i = 1; i < r.pts.length; i++) len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); const m = r.pts[Math.floor(r.pts.length / 2)]; return { r, len, d: Math.hypot(m[0] - bay.x, m[1] - bay.z) }; })
    .filter((x) => x.len > 30 && x.d < R)
    .sort((a, b) => a.d - b.d || a.r.id.localeCompare(b.r.id));
  const want = o.max ?? 26;
  for (const { r } of roads) {
    if (paths.length >= want) break;
    const base = resample(r.pts, 2);
    for (const side of [1, -1]) {
      const off = offset(base, side * (Math.max(3, r.width || 4) / 2 + 0.9));
      // longest run of walkable points
      let best = null, cur = [];
      for (const p of off) {
        if (ok(p[0], p[1])) cur.push(p);
        else { if (!best || cur.length > best.length) best = cur; cur = []; }
      }
      if (!best || cur.length > best.length) best = cur;
      if (best.length * 2 >= 28) { paths.push(withCum({ id: r.id + (side > 0 ? 'R' : 'L'), kind: 'sidewalk', road: r.id, pts: chaikin(best, 1) })); break; }
    }
  }

  const at = (p, s, out = {}) => {
    s = Math.max(0, Math.min(p.len, s));
    let i = 1; while (i < p.cum.length - 1 && p.cum[i] < s) i++;
    const a = p.pts[i - 1], b = p.pts[i], l = (p.cum[i] - p.cum[i - 1]) || 1, u = (s - p.cum[i - 1]) / l;
    out.x = a[0] + (b[0] - a[0]) * u; out.z = a[1] + (b[1] - a[1]) * u; out.dx = (b[0] - a[0]) / l; out.dz = (b[1] - a[1]) / l;
    return out;
  };
  return { paths, at, blocked: (x, z) => !ok(x, z) };
}
