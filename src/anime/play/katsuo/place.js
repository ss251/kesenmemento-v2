// [play] Fifty charms, placed from the city's geometry. Seeds are search points.
// The coordinates that ship are snapped: out of buildings, onto a quay, onto
// water, onto a roof. Nothing here is typed as a final position.

const CELL = 24;
const ROAD_CELL = 20;

const SEEDS = [
  // On the walk spawn's heading (yaw 111). 14 m on the open apron, clear of the stall
  // and the vending machine, then a sprint that still chains inside the combo window.
  { id: 'w-open', mode: 'walk', x: 154.9, z: -117, at: [154.9, -117], pin: true, note: '歩き出しの正面。最初に光る' },
  { id: 'w-prom', mode: 'walk', x: 85.8, z: -90.5, at: [85.8, -90.5], pin: true, note: '内湾の遊歩道' },
  { id: 'w-mukaeru', mode: 'walk', x: -19, z: 28, note: '迎のまえ' },
  { id: 'w-otokoyama', mode: 'walk', x: -36.6, z: -54.4, pin: true, note: '男山の坂の下' },
  { id: 'w-kakuboshi', mode: 'walk', x: -98.1, z: -39.4, pin: true, note: '角星の通り' },
  { id: 'w-takeyama', mode: 'walk', x: -184.5, z: -103.6, pin: true, note: '竹駒神社の参道' },
  { id: 'w-isuzu', mode: 'walk', x: 28, z: -68.6, at: [28, -68.6], pin: true, note: '遊歩道の先、男山のほう' },
  { id: 'w-ukimido', mode: 'walk', x: 300, z: -95, note: '浮見堂へ渡る岸' },
  { id: 'w-kumano', mode: 'walk', x: -141, z: -164, note: '熊野神社の石段' },
  { id: 'w-hogenji', mode: 'walk', x: -116, z: -376, note: '宝厳寺の門前' },
  { id: 'w-catholic', mode: 'walk', x: -340, z: -26, note: 'カトリック教会の坂' },
  { id: 'w-atago', mode: 'walk', x: -502, z: -453, note: '愛宕神社の下' },
  { id: 'w-kannon', mode: 'walk', x: -796, z: 409, note: '観音寺の参道' },
  { id: 'w-library', mode: 'walk', x: -201, z: 441, note: '図書館の前' },
  { id: 'w-civic', mode: 'walk', x: -190, z: 574, note: '市民会館の前' },
  { id: 'w-mambo', mode: 'walk', x: -160, z: 142, note: 'マンボウの広場' },
  { id: 'w-nakamachi', mode: 'walk', x: 136, z: 1005, note: '仲町の公園' },
  { id: 'w-okawa', mode: 'walk', x: -341, z: 993, note: '大川の公園' },
  { id: 'w-shishiori', mode: 'walk', x: 708, z: -1224, note: '鹿折のまちなか' },
  { id: 'w-post', mode: 'walk', x: -509, z: -143, note: '郵便局の角' },

  { id: 'd-plaza', mode: 'fly', x: 307, z: 209, note: 'プラザホテルの屋根の裏側' },
  { id: 'd-hall', mode: 'fly', x: -430, z: -238, note: '市役所の塔の格子' },
  { id: 'd-anba', mode: 'fly', x: -494, z: -990, note: '安波山の見晴台' },
  { id: 'd-market', mode: 'fly', x: 596, z: 777, note: '魚市場のクレーン' },
  { id: 'd-kanae', mode: 'fly', x: 1492, z: 1465, note: 'かなえおおはしの塔' },
  { id: 'd-pearl', mode: 'fly', x: -1421, z: -350, note: 'パールシティの屋根' },
  { id: 'd-park', mode: 'fly', x: 563, z: 930, note: 'パークホテルの屋根' },
  { id: 'd-station', mode: 'fly', x: -1376, z: -419, note: '駅の屋根' },
  { id: 'd-rias', mode: 'fly', x: -2176, z: 2771, note: 'リアスアークの屋根' },
  { id: 'd-oshima', mode: 'fly', x: 2711, z: 3025, note: '大島の高台' },
  { id: 'd-umi', mode: 'fly', x: 395, z: 656, note: '海の市の屋根' },
  { id: 'd-crane', mode: 'fly', x: -862, z: 1277, note: '新しい庁舎のクレーン' },
  { id: 'd-cape', mode: 'fly', x: 352, z: -90, note: '神明崎の灯台のそば' },
  { id: 'd-ferry', mode: 'fly', x: 40, z: 120, note: '桟橋の屋根' },

  { id: 's-bay', mode: 'sail', x: 180, z: -40, note: '内湾のブイ' },
  { id: 's-cape', mode: 'sail', x: 390, z: -70, note: '神明崎の沖' },
  { id: 's-mid', mode: 'sail', x: 420, z: -210, note: '湾のまんなか' },
  { id: 's-pier', mode: 'sail', x: 90, z: 50, note: '七番埠頭の沖' },
  { id: 's-kanae', mode: 'sail', x: 1456, z: 1527, note: 'かなえおおはしの下' },
  { id: 's-channel', mode: 'sail', x: 1800, z: 1900, note: '大島へ向かう水道' },

  { id: 'c-market', mode: 'drive', x: 520, z: 640, note: '魚市場への道' },
  { id: 'c-shishiori', mode: 'drive', x: 620, z: -1100, note: '鹿折の橋' },
  { id: 'c-ohashi', mode: 'drive', x: -243, z: 1200, note: '気仙沼大橋' },
  { id: 'c-minato', mode: 'drive', x: 200, z: 120, note: '港町の道' },
  { id: 'c-south', mode: 'drive', x: 10, z: 90, note: '南町の道' },
  { id: 'c-station', mode: 'drive', x: -1340, z: -390, note: '駅前の道' },
  { id: 'c-national', mode: 'drive', x: -200, z: 400, note: 'まちを抜ける道' },

  // Underwater lane, 7 Oct. Metres, y above the bed and under the surface. These replace the gas tank, the spare buoy, and the surface charm that sat on the shallows.
  { id: 'u-raft', mode: 'swim', x: 1620, y: -6.5, z: 3644, pin: true, note: '南の筏の下。縄を見上げる' },
  { id: 'u-wakame', mode: 'swim', x: 1700, y: -5, z: 7520, pin: true, note: '湾口のわかめの縄' },
  { id: 'u-shallows', mode: 'swim', x: 348, y: -1.5, z: 8, pin: true, note: '浮見堂の浅瀬' },
];

function obbLocal(lot, x, z) {
  const o = lot.obb;
  const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
  const dx = x - o.cx, dz = z - o.cz;
  return [dx * c - dz * s, dx * s + dz * c];
}

function footprint(lot, x, z, margin) {
  if (!lot?.obb) return false;
  const [lx, lz] = obbLocal(lot, x, z);
  return Math.abs(lx) <= lot.obb.w / 2 + margin && Math.abs(lz) <= lot.obb.d / 2 + margin;
}

function roofOf(lot) {
  const base = lot.groundY || 0;
  return base + (lot.height > 0 ? lot.height : (lot.storeys || 1) * 3.1);
}

function inVolume(lot, x, y, z) {
  if (!footprint(lot, x, z, 0)) return false;
  const base = lot.groundY || 0;
  const top = roofOf(lot);
  return y > base + 0.35 && y < top - 0.25;
}

/**
 * The lots by 24 m cell. [mobile-play] A compact grid: one start offset per cell of the town's box and one Int32Array of
 * lot ids, in the same order the per-cell arrays had, so every lookup returns the same lots. The Map of 'i,j' strings to
 * arrays it replaces kept ~17 MB of heap for the whole session (50,817 lots, 60k cells, 180k objects); this is ~2.8 MB.
 */
function indexLots(lots) {
  const n = lots.length;
  const box = new Int32Array(n * 4);
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const o = lots[i].obb;
    if (!o) { box[i * 4] = 1; box[i * 4 + 1] = 0; continue; }   // an empty range: no cells
    const r = Math.hypot(o.w, o.d) * 0.5 + 2;
    const a = Math.floor((o.cx - r) / CELL), b = Math.floor((o.cx + r) / CELL);
    const c = Math.floor((o.cz - r) / CELL), d = Math.floor((o.cz + r) / CELL);
    box[i * 4] = a; box[i * 4 + 1] = b; box[i * 4 + 2] = c; box[i * 4 + 3] = d;
    if (a < i0) i0 = a;
    if (b > i1) i1 = b;
    if (c < j0) j0 = c;
    if (d > j1) j1 = d;
  }
  if (!(i0 <= i1)) return { i0: 0, j0: 0, ni: 0, nj: 0, start: new Int32Array(1), ids: new Int32Array(0) };
  const ni = i1 - i0 + 1, nj = j1 - j0 + 1;
  const start = new Int32Array(ni * nj + 1);
  for (let i = 0; i < n; i++) {
    for (let ix = box[i * 4]; ix <= box[i * 4 + 1]; ix++) {
      for (let iz = box[i * 4 + 2]; iz <= box[i * 4 + 3]; iz++) start[(ix - i0) * nj + (iz - j0) + 1]++;
    }
  }
  for (let k = 1; k < start.length; k++) start[k] += start[k - 1];
  const ids = new Int32Array(start[start.length - 1]);
  const put = start.slice(0, ni * nj);
  for (let i = 0; i < n; i++) {
    for (let ix = box[i * 4]; ix <= box[i * 4 + 1]; ix++) {
      for (let iz = box[i * 4 + 2]; iz <= box[i * 4 + 3]; iz++) ids[put[(ix - i0) * nj + (iz - j0)]++] = i;
    }
  }
  return { i0, j0, ni, nj, start, ids };
}

const nearBuf = new Int32Array(160);
function lotsNear(map, lots, x, z, rad) {
  const i0 = Math.max(map.i0, Math.floor((x - rad) / CELL)), i1 = Math.min(map.i0 + map.ni - 1, Math.floor((x + rad) / CELL));
  const j0 = Math.max(map.j0, Math.floor((z - rad) / CELL)), j1 = Math.min(map.j0 + map.nj - 1, Math.floor((z + rad) / CELL));
  let n = 0;
  for (let ix = i0; ix <= i1; ix++) {
    for (let iz = j0; iz <= j1; iz++) {
      const c = (ix - map.i0) * map.nj + (iz - map.j0);
      for (let k = map.start[c], e = map.start[c + 1]; k < e && n < nearBuf.length; k++) nearBuf[n++] = map.ids[k];
    }
  }
  return n;
}

function hitVolume(map, lots, x, y, z) {
  const n = lotsNear(map, lots, x, z, 18);
  for (let i = 0; i < n; i++) if (inVolume(lots[nearBuf[i]], x, y, z)) return true;
  return false;
}

function hitFoot(map, lots, x, z, margin) {
  const n = lotsNear(map, lots, x, z, 18 + margin);
  for (let i = 0; i < n; i++) if (footprint(lots[nearBuf[i]], x, z, margin)) return true;
  return false;
}

function nearestLot(map, lots, x, z, rad) {
  const n = lotsNear(map, lots, x, z, rad);
  let best = null, bd = rad;
  for (let i = 0; i < n; i++) {
    const lot = lots[nearBuf[i]];
    const d = Math.hypot(lot.obb.cx - x, lot.obb.cz - z);
    if (d < bd) { bd = d; best = lot; }
  }
  return best;
}

function indexRoads(roads) {
  const map = new Map();
  for (const r of roads) {
    const pts = r.pts;
    if (!pts || pts.length < 2) continue;
    const drive = r.kind === 'city' || r.kind === 'prefectural' || r.kind === 'national' || r.kind === 'bridge';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const n = Math.max(1, Math.ceil(len / 8));
      const px = -(b[1] - a[1]) / len, pz = (b[0] - a[0]) / len;
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        const rec = { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, px, pz, drive, w: r.width || 4 };
        const key = Math.floor(rec.x / ROAD_CELL) + ',' + Math.floor(rec.z / ROAD_CELL);
        let arr = map.get(key);
        if (!arr) map.set(key, arr = []);
        arr.push(rec);
      }
    }
  }
  return map;
}

function nearestRoad(roads, x, z, rad, driveOnly) {
  const i0 = Math.floor((x - rad) / ROAD_CELL), i1 = Math.floor((x + rad) / ROAD_CELL);
  const j0 = Math.floor((z - rad) / ROAD_CELL), j1 = Math.floor((z + rad) / ROAD_CELL);
  let best = null, bd = rad;
  for (let ix = i0; ix <= i1; ix++) {
    for (let iz = j0; iz <= j1; iz++) {
      const arr = roads.get(ix + ',' + iz);
      if (!arr) continue;
      for (let k = 0; k < arr.length; k++) {
        const rec = arr[k];
        if (driveOnly && !rec.drive) continue;
        const d = Math.hypot(rec.x - x, rec.z - z);
        if (d < bd) { bd = d; best = rec; }
      }
    }
  }
  return best;
}

function quayTop(quays, x, z) {
  let top = null, bd = 6;
  for (let i = 0; i < quays.length; i++) {
    const q = quays[i];
    const ax = q.a[0], az = q.a[1], bx = q.b[0], bz = q.b[1];
    const ex = bx - ax, ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
    const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
    if (d < bd) { bd = d; top = q.top; }
  }
  return top;
}

function cleanDistrict(ja) {
  return String(ja || '').replace(/[0-9０-９一二三四五六七八九十]+丁目/g, '').replace(/（[^）]*）/g, '').trim();
}

function districtAt(L, x, z) {
  const a = L.areaPolyAt(x, z);
  if (a?.ja) {
    const name = cleanDistrict(a.ja);
    if (name) return name;
  }
  if (x >= -20 && x <= 370 && z >= -190 && z <= 100) return '内湾';
  let best = null, bd = 800, bx = 0, bz = 0;
  for (const p of L.AREA_POLYS) {
    let sx = 0, sz = 0;
    const ring = p.ring;
    const step = Math.max(1, Math.floor(ring.length / 12));
    let n = 0;
    for (let i = 0; i < ring.length; i += step) { sx += ring[i][0]; sz += ring[i][1]; n++; }
    if (!n) continue;
    sx /= n; sz /= n;
    const d = Math.hypot(sx - x, sz - z);
    if (d < bd) { bd = d; best = cleanDistrict(p.ja); bx = sx; bz = sz; }
  }
  return best || '内湾';
}

function standY(L, x, z) {
  let y = L.groundAt(x, z) + 1.15;
  const q = quayTop(L.QUAYS, x, z);
  if (q != null) y = Math.max(y, q + 1.15);
  return y;
}

function pathBetween(L, map, lots, x0, z0, x1, z1) {
  const dist = Math.hypot(x1 - x0, z1 - z0);
  if (dist > 90) return null;
  const n = Math.max(1, Math.ceil(dist / 1.5));
  let prev = L.groundAt(x0, z0);
  const path = [[x0, z0]];
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
    if (L.isWater(x, z) && L.shoreDist(x, z) > 1.2) return null;
    if (Math.hypot(x - x0, z - z0) > 2.4 && hitFoot(map, lots, x, z, 0.25)) return null;
    const g = L.groundAt(x, z);
    if (g - prev > 0.55) return null;
    prev = g;
    path.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
  }
  return path;
}

function escapeVolume(L, map, lots, x, z) {
  for (let rad = 0; rad <= 30; rad += 1.5) {
    const steps = rad === 0 ? 1 : 8;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2 + rad * 0.3;
      const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
      if (L.isWater(px, pz) || L.shoreDist(px, pz) > -6) continue;
      if (L.waterClass(px, pz) === 2) continue;
      const y = standY(L, px, pz);
      if (!hitVolume(map, lots, px, y, pz)) return { x: px, y, z: pz };
    }
  }
  return null;
}

function placeAnchor(L, map, lots, roads, seed) {
  const x = seed.at[0], z = seed.at[1];
  if (L.isWater(x, z) || L.shoreDist(x, z) > -4 || L.waterClass(x, z) === 2) return null;
  const y = standY(L, x, z);
  if (hitVolume(map, lots, x, y, z)) return null;
  const road = nearestRoad(roads, x, z, 80, false);
  const path = (road && pathBetween(L, map, lots, road.x, road.z, x, z))
    || [[Math.round(x * 10) / 10, Math.round(z * 10) / 10]];
  return finish(L, seed, x, y, z, path);
}

function placeSwim(L, seed) {
  if (!L.isWater(seed.x, seed.z)) return null;
  if (!(seed.y < -0.4)) return null;
  return finish(L, seed, seed.x, seed.y, seed.z, null);
}

function placeWalk(L, map, lots, roads, seed) {
  if (seed.at) {
    const spot = placeAnchor(L, map, lots, roads, seed);
    if (!spot) throw new Error('charm ' + seed.id + ' anchor has no place');
    return spot;
  }
  const road = nearestRoad(roads, seed.x, seed.z, 160, false);
  if (!road) return null;
  const band = (road.w || 4) * 0.5 + 1.8;
  const accept = (px, pz) => {
    const free = escapeVolume(L, map, lots, px, pz);
    if (!free) return null;
    const path = pathBetween(L, map, lots, road.x, road.z, free.x, free.z)
      || (Math.hypot(free.x - road.x, free.z - road.z) < 8 ? [[road.x, road.z], [free.x, free.z]] : null);
    if (!path) return null;
    return finish(L, seed, free.x, free.y, free.z, path);
  };
  for (let u = 0; u <= 1.001; u += 0.08) {
    const x = seed.x + (road.x - seed.x) * u;
    const z = seed.z + (road.z - seed.z) * u;
    for (const [ox, oz] of [[0, 0], [2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4]]) {
      if (L.isWater(x + ox, z + oz)) continue;
      const onRoad = Math.hypot(x + ox - road.x, z + oz - road.z) <= band;
      if (!onRoad && hitFoot(map, lots, x + ox, z + oz, 0.5)) continue;
      const spot = accept(x + ox, z + oz);
      if (spot) return spot;
    }
  }
  for (const sign of [1, -1]) {
    const spot = accept(road.x + road.px * band * sign, road.z + road.pz * band * sign);
    if (spot) return spot;
  }
  return accept(road.x, road.z);
}

function placeDrive(L, map, lots, roads, seed) {
  const road = nearestRoad(roads, seed.x, seed.z, 40, true) || nearestRoad(roads, seed.x, seed.z, 90, true);
  if (!road) return null;
  for (const sign of [1, -1]) {
    const off = Math.max(2.2, (road.w || 4) * 0.5 + 0.8);
    const x = road.x + road.px * off * sign;
    const z = road.z + road.pz * off * sign;
    if (L.isWater(x, z)) continue;
    const y = L.groundAt(x, z) + 1.1;
    if (hitFoot(map, lots, x, z, 0.4) || hitVolume(map, lots, x, y, z)) continue;
    return finish(L, seed, x, y, z, [[road.x, road.z], [x, z]]);
  }
  return null;
}

function placeSail(L, map, lots, seed) {
  for (let rad = 0; rad <= 80; rad += 8) {
    const steps = rad === 0 ? 1 : 12;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const x = seed.x + Math.cos(a) * rad;
      const z = seed.z + Math.sin(a) * rad;
      if (!L.isWater(x, z) || L.shoreDist(x, z) < 8) continue;
      const y = 2;
      if (hitVolume(map, lots, x, y, z)) continue;
      return finish(L, seed, x, y, z, null);
    }
  }
  return null;
}

function placeFly(L, map, lots, seed) {
  const lot = nearestLot(map, lots, seed.x, seed.z, 70) || nearestLot(map, lots, seed.x, seed.z, 140);
  if (lot) {
    const o = lot.obb;
    const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
    // Near the back corner, where a pitched roof is lowest, and high enough to clear the ridge.
    const lx = -o.w * 0.42, lz = -o.d * 0.42;
    const x = o.cx + lx * c + lz * s;
    const z = o.cz - lx * s + lz * c;
    const rise = Math.min(5.5, 0.18 * Math.min(o.w, o.d));
    const y = roofOf(lot) + 5.2 + rise;
    if (!inVolume(lot, x, y, z)) return finish(L, seed, x, y, z, null);
  }
  const x = seed.x, z = seed.z;
  const y = Math.max(L.groundAt(x, z), 0) + 14;
  if (!hitVolume(map, lots, x, y, z)) return finish(L, seed, x, y, z, null);
  return null;
}

function finish(L, seed, x, y, z, reach) {
  return {
    id: seed.id,
    mode: seed.mode,
    note: seed.note,
    pin: !!seed.pin,
    district: districtAt(L, x, z),
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 100) / 100,
    z: Math.round(z * 10) / 10,
    reach,
  };
}

function resnap(L, map, lots, roads, spot, x, z) {
  const seed = { id: spot.id, mode: spot.mode, x, z, pin: spot.pin, note: spot.note };
  if (spot.mode === 'walk') return placeWalk(L, map, lots, roads, seed);
  if (spot.mode === 'drive') return placeDrive(L, map, lots, roads, seed);
  if (spot.mode === 'sail') return placeSail(L, map, lots, seed);
  return placeFly(L, map, lots, seed);
}

function farEnough(spots, skip, x, z) {
  for (let i = 0; i < spots.length; i++) {
    if (spots[i] === skip) continue;
    if (Math.hypot(spots[i].x - x, spots[i].z - z) < 60) return false;
  }
  return true;
}

function separate(L, map, lots, roads, spots) {
  for (let iter = 0; iter < 64; iter++) {
    let moved = false;
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const a = spots[i], b = spots[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz) || 0.01;
        if (d >= 60) continue;
        if (a.pin && b.pin) continue;
        const target = a.pin ? b : b.pin ? a : b;
        const ux = (b.x - a.x) / d, uz = (b.z - a.z) / d;
        const sign = target === b ? 1 : -1;
        let placed = null;
        for (let k = 0; k < 8 && !placed; k++) {
          const ang = Math.atan2(uz * sign, ux * sign) + k * 0.7;
          const push = 64 - d + k * 14;
          const next = resnap(L, map, lots, roads, target, target.x + Math.cos(ang) * push, target.z + Math.sin(ang) * push);
          if (next && farEnough(spots, target, next.x, next.z)) placed = next;
        }
        if (!placed) continue;
        if (target === b) spots[j] = placed; else spots[i] = placed;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return spots;
}

let cache = null;

/** Fifty spots. `L` is the layout module. Deterministic. */
export function designSpots(L) {
  if (cache && cache.L === L) return cache.spots;
  const map = indexLots(L.LOTS);
  const roads = indexRoads(L.ROADS);
  const spots = [];
  for (const seed of SEEDS) {
    let spot = null;
    if (seed.mode === 'walk') spot = placeWalk(L, map, L.LOTS, roads, seed);
    else if (seed.mode === 'drive') spot = placeDrive(L, map, L.LOTS, roads, seed);
    else if (seed.mode === 'sail') spot = placeSail(L, map, L.LOTS, seed);
    else if (seed.mode === 'swim') spot = placeSwim(L, seed);
    else spot = placeFly(L, map, L.LOTS, seed);
    if (!spot) throw new Error('charm ' + seed.id + ' has no place');
    spots.push(spot);
  }
  separate(L, map, L.LOTS, roads, spots);
  cache = { L, spots };
  return spots;
}

/** Design-time indexes, reused by the live occlusion test. */
export function lotIndex(lots) { return indexLots(lots); }
export function volumeAt(map, lots, x, y, z) { return hitVolume(map, lots, x, y, z); }

export function _resetSpots() { cache = null; }
