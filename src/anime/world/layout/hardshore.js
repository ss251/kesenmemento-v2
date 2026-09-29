// [v3:fix] Hard shores: the built quay / seawall / promenade lines of L.QUAYS (hero + mid zones).
// A vertical quay wall drops straight into deep water, so the terrain in front of it is pushed under the sea and the
// water's shallow teal band is drawn only along natural shores (beaches, rocks).
//
//   const H = hardShores(L)
//   H.clampY(x, z, y)     terrain y, pushed to <= SEA - 2 m in front of (and 3 m behind) a hard face line
//   H.near(x, z)          0..1 how close (x, z) is to a hard shore (1 within 6 m, 0 beyond 18 m)
//   H.inApron(x, z, pad)  on a built apron / promenade deck (town keeps guardrails and poles off it)
//   H.seaward(x, z)       in front of a hard face: the sea for walkers (core/ctx.js physics)
//   H.maskTexture(THREE, box, cell)   R8 DataTexture of near() over box {x0, z0, x1, z1} ({ tex, box })
export const HARD_KINDS = new Set(['quay', 'seawall', 'promenade']);
/** Apron widths the harbor builds behind each kind of face (harbor/world.js buildQuay calls), metres. */
export const APRON = { quay: 4, seawall: 3.2, promenade: 7 };

export function hardShores(L, { cell = 24 } = {}) {
  const segs = [];
  for (const q of L.QUAYS || []) {
    if (!HARD_KINDS.has(q.kind)) continue;
    const dx = q.b[0] - q.a[0], dz = q.b[1] - q.a[1], len = Math.hypot(dx, dz);
    if (len < 0.3) continue;
    const ux = dx / len, uz = dz / len;
    let nx = uz, nz = -ux;                      // candidate water side
    const mx = (q.a[0] + q.b[0]) / 2, mz = (q.a[1] + q.b[1]) / 2;
    const w1 = L.isWater(mx + nx * 6, mz + nz * 6), w2 = L.isWater(mx - nx * 6, mz - nz * 6);
    if (!w1 && w2) { nx = -nx; nz = -nz; } else if (!w1 && !w2) continue;
    segs.push({ ax: q.a[0], az: q.a[1], ux, uz, nx, nz, len, top: q.top ?? 2, apron: APRON[q.kind] ?? 4 });
  }
  const grid = new Map();
  const key = (i, j) => i * 100003 + j;
  const pad = 20;
  for (const s of segs) {
    const xs = [s.ax, s.ax + s.ux * s.len], zs = [s.az, s.az + s.uz * s.len];
    const i0 = Math.floor((Math.min(...xs) - pad) / cell), i1 = Math.floor((Math.max(...xs) + pad) / cell);
    const j0 = Math.floor((Math.min(...zs) - pad) / cell), j1 = Math.floor((Math.max(...zs) + pad) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(s); }
  }
  const cellSegs = (x, z) => grid.get(key(Math.floor(x / cell), Math.floor(z / cell)));
  /** Unsigned distance to the nearest hard line (m), and the signed offset toward its water side. */
  function nearest(x, z) {
    const a = cellSegs(x, z); if (!a) return null;
    let best = null;
    for (const s of a) {
      const t = (x - s.ax) * s.ux + (z - s.az) * s.uz;
      const tc = Math.max(0, Math.min(s.len, t));
      const px = s.ax + s.ux * tc, pz = s.az + s.uz * tc;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, off: (x - s.ax) * s.nx + (z - s.az) * s.nz, inside: t >= -1.5 && t <= s.len + 1.5, s };
    }
    return best;
  }
  const sea = () => (L.SEA?.level ?? 0);
  return {
    segs,
    clampY(x, z, y) {
      const n = nearest(x, z);
      if (!n || !n.inside || n.d > 8) return y;
      // in front of the face (off > -1 m) the ground drops under the water: no sand slope against the wall
      if (n.off > -3.0) return Math.min(y, sea() - 2.0);   // up to 3 m behind the line: hidden under the quay fill anyway
      return y;
    },
    /** In front of a hard face (on the sea side of a quay / seawall line, within 10 m): the sea for walkers, even where
     *  the DEM still has a strip of low ground there. */
    seaward(x, z, margin = 0.15) {
      const n = nearest(x, z);
      return !!n && n.inside && n.d < 10 && n.off > margin;
    },
    /** On a built quay apron / promenade deck (behind a hard face, within its apron + pad)? Town keeps street
     *  furniture (guardrails, poles) off it. */
    inApron(x, z, pad = 0.5) {
      const a = cellSegs(x, z); if (!a) return false;
      for (const s of a) {
        const t = (x - s.ax) * s.ux + (z - s.az) * s.uz;
        if (t < -1 || t > s.len + 1) continue;
        const off = (x - s.ax) * s.nx + (z - s.az) * s.nz;
        if (off <= 1 && off >= -(s.apron + pad)) return true;
      }
      return false;
    },
    near(x, z) {
      const n = nearest(x, z);
      if (!n) return 0;
      return 1 - Math.min(1, Math.max(0, (n.d - 6) / 12));
    },
    maskTexture(THREE, box, step = 4) {
      const w = Math.max(1, Math.round((box.x1 - box.x0) / step)), h = Math.max(1, Math.round((box.z1 - box.z0) / step));
      const data = new Uint8Array(w * h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const x = box.x0 + (i + 0.5) * step, z = box.z0 + (j + 0.5) * step;
        if (!cellSegs(x, z)) continue;
        data[j * w + i] = Math.round(this.near(x, z) * 255);
      }
      const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = false; tex.flipY = false; tex.needsUpdate = true;
      return { tex, box, w, h };
    },
  };
}

let _cached = null;
/** One shared instance per layout (terrain and water both use it). */
export function sharedHardShores(L) { if (!_cached || _cached.L !== L) _cached = { L, H: hardShores(L) }; return _cached.H; }
