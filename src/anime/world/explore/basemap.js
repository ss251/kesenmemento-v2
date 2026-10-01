// [v4:explore] The map the minimap and the full map draw from: painted once, in slices over a few frames, from the
// same real data the world is built from: the sea and rivers from the terrain grids (GSI), a soft hillshade from the
// DEM, OSM land use (parks, schools, car parks, cemeteries, fields), every building footprint (GSI) and every road
// centre-line at its measured width, national and prefectural roads in their map colours.
//
//   const bm = createBaseMap(L, { roads, core, quality })   bm.step(budgetMs) -> done   bm.ready
//   bm.core = { canvas, x0, z0, mpp }  (2 m per pixel over the core; 3 m on the low tier)
//   bm.city = { canvas, x0, z0, mpp }  (8 m per pixel over the whole city; 12 on the low tier) [v4:polish1]
//   bm.pick(x, z, mpp) -> the layer to sample for a given scale
export const MAP_COLORS = {
  land: '#f1ebdc', sea: '#9ccfe6', seaEdge: '#7fb7d4', river: '#a7d6ea',
  // [v4:polish1] darker road edges and buildings: the minimap read as blank paper at street scale
  building: '#c9b595', buildingEdge: '#bba88c', road: '#ffffff', roadEdge: '#a39a88', national: '#ffe08a', nationalEdge: '#d7b35a', pref: '#fff2c2',
  rail: '#8b8f9a',
  landuse: { park: '#cfe6b4', grass: '#d9ecc2', forest: '#bfdca6', cedar: '#b2d39c', felled: '#e4dccb', scrub: '#cfe2b2', field: '#e6efc4', cemetery: '#d9dfcc', school: '#f0dcb4', sport: '#cfe9bd', parking: '#e1e2e5', gravel: '#e3dfd6', plaza: '#ebe7df', apron: '#e1e2e5', weeds: '#d6dcbf', religious: '#ecd9c9', industrial: '#e6e1ea', commercial: '#f4e0d6', construction: '#eadfcf', beach: '#f3e6c0', rock: '#dedad2', aquaculture: '#a9d4e6', water: '#9ccfe6' },
};

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

export function createBaseMap(L, { roads, core, quality = 'high', doc = typeof document !== 'undefined' ? document : null } = {}) {
  if (!doc) return null;
  const mppCore = quality === 'low' ? 3 : 2;
  const mk = (w, h) => { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; };
  const C = { x0: core.x0, z0: core.z0, mpp: mppCore };
  C.canvas = mk(Math.ceil((core.x1 - core.x0) / mppCore), Math.ceil((core.z1 - core.z0) / mppCore));
  const F = L.ZONES.far;
  // [v4:polish1] 8 m per pixel over the city (16 m was pixelated west of the core on the full map); 12 on the low tier
  const mppCity = quality === 'low' ? 12 : 8;
  const Y = { x0: F.x0, z0: F.z0, mpp: mppCity };
  Y.canvas = mk(Math.ceil((F.x1 - F.x0) / mppCity), Math.ceil((F.z1 - F.z0) / mppCity));
  const gc = C.canvas.getContext('2d'), gy = Y.canvas.getContext('2d');
  const jobs = [];
  const cam = (layer, g) => ({ layer, g, px: (x) => (x - layer.x0) / layer.mpp, pz: (z) => (z - layer.z0) / layer.mpp });
  const LC = cam(C, gc), LY = cam(Y, gy);

  // ---- ground: land, hillshade, sea and rivers from a terrain grid (one pixel per grid cell, then scaled)
  function ground(layer, g, grid) {
    const w = grid.w, h = grid.h, H = grid.data.h, W = grid.data.wat;
    const tmp = mk(w, h), tg = tmp.getContext('2d'), img = tg.createImageData(w, h), d = img.data;
    const land = hexToRgb(MAP_COLORS.land), sea = hexToRgb(MAP_COLORS.sea), river = hexToRgb(MAP_COLORS.river);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, o = k * 4, wt = W[k];
      if (wt === 1 || wt === 2) { const c = wt === 1 ? sea : river; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; continue; }
      // hillshade: light from the north-west, gentle
      const hl = H[k - 1 >= j * w ? k - 1 : k], hr = H[i + 1 < w ? k + 1 : k], hu = H[j > 0 ? k - w : k], hd = H[j + 1 < h ? k + w : k];
      const sx = (hr - hl) / (2 * grid.d * 10), sz = (hd - hu) / (2 * grid.d * 10);
      const shade = Math.max(-0.2, Math.min(0.14, (-sx - sz) * 0.28));
      const hi = Math.min(1, Math.max(0, H[k] / 10 / 180));
      d[o] = land[0] * (1 + shade) - hi * 18; d[o + 1] = land[1] * (1 + shade) - hi * 6; d[o + 2] = land[2] * (1 + shade) - hi * 22; d[o + 3] = 255;
    }
    tg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    const sx0 = (grid.x0 - layer.x0) / layer.mpp, sz0 = (grid.z0 - layer.z0) / layer.mpp;
    g.drawImage(tmp, sx0, sz0, w * grid.d / layer.mpp, h * grid.d / layer.mpp);
  }
  jobs.push(() => { gy.fillStyle = MAP_COLORS.sea; gy.fillRect(0, 0, Y.canvas.width, Y.canvas.height); ground(Y, gy, L.GRIDS.city); });
  jobs.push(() => { gc.fillStyle = MAP_COLORS.land; gc.fillRect(0, 0, C.canvas.width, C.canvas.height); ground(C, gc, L.GRIDS.core); });

  // ---- land use (OSM), in the layout's paint order
  const ring = (V, g, pts) => { g.moveTo(V.px(pts[0][0]), V.pz(pts[0][1])); for (let i = 1; i < pts.length; i++) g.lineTo(V.px(pts[i][0]), V.pz(pts[i][1])); g.closePath(); };
  jobs.push(() => {
    for (const V of [LC, LY]) {
      const g = V.g;
      for (const u of L.LANDUSE) {
        const col = MAP_COLORS.landuse[u.cls]; if (!col || u.cls === 'water' || !u.ring?.length) continue;
        g.beginPath(); ring(V, g, u.ring); for (const hole of u.holes || []) ring(V, g, hole);
        g.fillStyle = col; g.globalAlpha = u.cls === 'forest' || u.cls === 'cedar' || u.cls === 'grass' ? 0.55 : 0.9; g.fill('evenodd');
      }
      g.globalAlpha = 1;
    }
  });

  // ---- buildings, in slices (the core layer only; the city layer draws them as dots of the far instanced town)
  const lots = L.LOTS;
  const SLICE = 3500;
  for (let s = 0; s < lots.length; s += SLICE) {
    jobs.push(() => {
      gc.fillStyle = MAP_COLORS.building; gc.strokeStyle = MAP_COLORS.buildingEdge; gc.lineWidth = 0.6;
      gy.fillStyle = MAP_COLORS.buildingEdge;
      for (let i = s; i < Math.min(lots.length, s + SLICE); i++) {
        const l = lots[i], o = l.obb;
        if (o.cx >= core.x0 - 20 && o.cx <= core.x1 + 20 && o.cz >= core.z0 - 20 && o.cz <= core.z1 + 20) {
          gc.beginPath(); ring(LC, gc, l.poly); gc.fill(); if (l.area > 60) gc.stroke();
        } else if (l.area > 40) {
          const px = LY.px(o.cx), pz = LY.pz(o.cz), r = Math.max(0.6, Math.sqrt(l.area) / 16);
          gy.fillRect(px - r / 2, pz - r / 2, r, r);
        }
      }
    });
  }

  // ---- roads: casing first, then the fill; wide and numbered roads on top
  const order = (r) => (r.kind === 'national' ? 3 : r.kind === 'prefectural' ? 2 : r.kind === 'alley' ? 0 : 1);
  const sorted = roads.slice().sort((a, b) => order(a) - order(b));
  const line = (V, g, pts) => { g.moveTo(V.px(pts[0][0]), V.pz(pts[0][1])); for (let i = 1; i < pts.length; i++) g.lineTo(V.px(pts[i][0]), V.pz(pts[i][1])); };
  for (const pass of ['edge', 'fill']) {
    jobs.push(() => {
      for (const V of [LC, LY]) {
        const g = V.g; g.lineCap = 'round'; g.lineJoin = 'round';
        for (const r of sorted) {
          if (!r.pts?.length || r.tunnel) continue;
          const m = V.layer.mpp, w = Math.max(r.kind === 'alley' ? 0.8 : 1.1, (r.width || 4) / m);
          if (V === LY && r.kind === 'alley') continue;
          if (V === LY && r.kind === 'city' && (r.width || 4) < 5) continue;
          const nat = r.kind === 'national', pref = r.kind === 'prefectural';
          g.beginPath(); line(V, g, r.pts);
          if (pass === 'edge') { g.strokeStyle = nat ? MAP_COLORS.nationalEdge : MAP_COLORS.roadEdge; g.lineWidth = w + (V === LY ? 0.8 : 1.4); }
          else { g.strokeStyle = nat ? MAP_COLORS.national : pref ? MAP_COLORS.pref : MAP_COLORS.road; g.lineWidth = w; }
          g.stroke();
        }
      }
    });
  }
  // ---- rail (OSM)
  jobs.push(() => {
    for (const V of [LC, LY]) {
      const g = V.g; g.setLineDash(V === LC ? [6, 5] : [3, 3]); g.strokeStyle = MAP_COLORS.rail; g.lineWidth = V === LC ? 1.6 : 1;
      for (const r of L.RAIL) { if (!r.pts?.length || r.tunnel) continue; g.beginPath(); line(V, g, r.pts); g.stroke(); }
      g.setLineDash([]);
    }
  });

  let k = 0;
  const bm = {
    core: C, city: Y,
    get ready() { return k >= jobs.length; },
    get progress() { return k / jobs.length; },
    /** Paint for up to `budget` ms. -> true once complete */
    step(budget = 6) { const t0 = performance.now(); while (k < jobs.length && performance.now() - t0 < budget) jobs[k++](); return k >= jobs.length; },
    /** The layer to sample at a scale of `mpp` metres per screen pixel around (x, z). */
    pick(x, z, mpp) {
      const inC = x > core.x0 + 60 && x < core.x1 - 60 && z > core.z0 + 60 && z < core.z1 - 60;
      return inC && mpp < 7 ? C : Y;
    },
  };
  return bm;
}
