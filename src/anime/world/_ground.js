// [v3:foundation] DEV-ONLY placeholder (not in main.js MODULES): grey road ribbons draped on the terrain and simple
// lot blocks (wall colour + roof colour from the layout) over the hero and mid zones, so module agents can see
// context in screenshots before town/harbor exist:  tools/anime/shot.mjs --only environment,water,_ground,<module>
import * as THREE from 'three';
import * as L from './layout.js';

export function build(ctx) {
  const g = new THREE.Group(); g.name = '_ground';
  // ---- roads: flat ribbons 12 cm above the terrain
  const pos = [], col = [], cRoad = new THREE.Color('#7d7f86'), cMain = new THREE.Color('#6f7178');
  for (const r of L.ROADS) {
    if (r.zone === 'far') continue;
    const c = r.kind === 'national' || r.kind === 'prefectural' ? cMain : cRoad;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); if (l < 0.1) continue;
      const nx = -dz / l * r.width / 2, nz = dx / l * r.width / 2;
      const n = Math.max(1, Math.ceil(l / 4));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const p0 = [a[0] + dx * t0, a[1] + dz * t0], p1 = [a[0] + dx * t1, a[1] + dz * t1];
        const y = (x, z) => (r.kind === 'bridge' ? Math.max(L.groundAt(x, z), 4) : L.groundAt(x, z)) + 0.12;
        const q = [[p0[0] + nx, p0[1] + nz], [p0[0] - nx, p0[1] - nz], [p1[0] - nx, p1[1] - nz], [p1[0] + nx, p1[1] + nz]].map((p) => [p[0], y(p[0], p[1]), p[1]]);
        for (const idx of [0, 2, 1, 0, 3, 2]) { pos.push(...q[idx]); col.push(c.r, c.g, c.b); }
      }
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  rg.computeVertexNormals();
  const roads = new THREE.Mesh(rg, ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.02, polygonOffset: -1 }));
  roads.receiveShadow = true; g.add(roads);
  // ---- lot blocks: walls + a flat roof cap in the roof colour
  const wall = new THREE.Color(), roof = new THREE.Color();
  const bp = [], bc = [];
  const box = (l) => {
    const f = L.lotFrame(l), s = Math.sin(f.rotY), c = Math.cos(f.rotY);
    const w = Math.max(1, l.obb.w - 0.4), d = Math.max(1, l.obb.d - 0.4), h = l.height;
    const P = (lx, y, lz) => [f.x + lx * c + lz * s, f.y + y, f.z - lx * s + lz * c];
    const x0 = -w / 2, x1 = w / 2, z0 = -d - 0.2, z1 = -0.2;
    wall.set(l.wall); roof.set(l.roof.color);
    const quad = (a, b, cc, dd, colr) => { for (const v of [a, b, cc, a, cc, dd]) { bp.push(...v); bc.push(colr.r, colr.g, colr.b); } };
    const yb = -1.5;
    quad(P(x0, yb, z1), P(x1, yb, z1), P(x1, h, z1), P(x0, h, z1), wall);
    quad(P(x1, yb, z0), P(x0, yb, z0), P(x0, h, z0), P(x1, h, z0), wall);
    quad(P(x1, yb, z1), P(x1, yb, z0), P(x1, h, z0), P(x1, h, z1), wall);
    quad(P(x0, yb, z0), P(x0, yb, z1), P(x0, h, z1), P(x0, h, z0), wall);
    quad(P(x0, h, z1), P(x1, h, z1), P(x1, h, z0), P(x0, h, z0), roof);
  };
  // with the first-look houses (?only=...,_houses) the placeholder draws roads only
  const withHouses = typeof location !== 'undefined' && (new URLSearchParams(location.search).get('only') || '').includes('_houses');
  if (!withHouses) for (const l of L.LOTS) if (l.zone !== 'far') box(l);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
  bg.computeVertexNormals();
  const blocks = new THREE.Mesh(bg, ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.03 }));
  blocks.castShadow = true; blocks.receiveShadow = true; g.add(blocks);
  ctx.addStatic(g);
}
