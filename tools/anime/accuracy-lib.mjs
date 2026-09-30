// [v4:town-accuracy] Pure helpers of tools/anime/accuracy.mjs (raster masks and colour difference), tested in
// test/v4-town-accuracy.test.js.

/** scanline fill of a ring (+ holes cleared) into mask (px x px) of a tile; val bit */
export function fillRing(mask, px, x0, z0, res, ring, val, clear = false) {
  let zmin = Infinity, zmax = -Infinity; for (const p of ring) { zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
  const j0 = Math.max(0, Math.floor((zmin - z0) / res)), j1 = Math.min(px - 1, Math.ceil((zmax - z0) / res));
  for (let j = j0; j <= j1; j++) {
    const zz = z0 + (j + 0.5) * res, xs = [];
    for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) { const [xa, za] = ring[i], [xb, zb] = ring[k]; if ((za > zz) !== (zb > zz)) xs.push(xa + ((zz - za) / (zb - za)) * (xb - xa)); }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - x0) / res - 0.5)), i1 = Math.min(px - 1, Math.floor((xs[q + 1] - x0) / res - 0.5));
      for (let i = i0; i <= i1; i++) { if (clear) mask[j * px + i] &= ~val; else mask[j * px + i] |= val; }
    }
  }
}
/** thick polyline into a mask (disc stamps every res/2 along the line) */
export function stampLine(mask, px, x0, z0, res, pts, halfW, val) {
  const r = Math.max(res * 0.5, halfW), ri = Math.ceil(r / res);
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / (res * 0.5)));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n, ci = Math.floor((x - x0) / res), cj = Math.floor((z - z0) / res);
      for (let dj = -ri; dj <= ri; dj++) for (let di = -ri; di <= ri; di++) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= px || j >= px) continue;
        const qx = x0 + (i + 0.5) * res - x, qz = z0 + (j + 0.5) * res - z; if (qx * qx + qz * qz <= r * r) mask[j * px + i] |= val;
      }
    }
  }
}
// sRGB -> Lab (D65) and CIEDE2000
export function lab([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  X = t(X); Y = t(Y); Z = t(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
export function dE2000(l1, l2) {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2, rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G), C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a, b) => { if (a === 0 && b === 0) return 0; const x = Math.atan2(b, a) / rad; return x < 0 ? x + 360 : x; };
  const h1 = h(a1p, b1), h2 = h(a2p, b2), dL = L2 - L1, dC = C2p - C1p;
  let dh = 0; if (C1p * C2p) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad), Lm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hm = h1 + h2; if (C1p * C2p) { if (Math.abs(h1 - h2) > 180) hm += h1 + h2 < 360 ? 360 : -360; hm /= 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const dT = 30 * Math.exp(-(((hm - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T, Rt = -Math.sin(2 * dT * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}
