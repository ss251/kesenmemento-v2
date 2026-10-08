// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Simple, deterministic walking physics: oriented boxes, cylinders, walkable tops and ramps,
// terrain height function. Player = vertical capsule approximated by a circle in XZ.
import * as THREE from 'three';

const CELL = 8;
export const STEP_HEIGHT = 0.45;
// [smooth] grid keys are numbers (a cell's x and z packed), not "x,z" strings: a query made a string per cell and a Set per call, the walker,
// the car and the labels' occlusion test ran thousands of them a second (megabytes of garbage a second, collected in GC pauses)
const OFF = 32768, cellKey = (ix, iz) => (ix + OFF) * 65536 + (iz + OFF);

export class Physics {
  constructor(heightAt, isWater = null) {
    this.heightAt = heightAt;
    this.isWater = isWater;   // [v3:fix] sea test: walkers never step off a quay into the bay
    this.grid = new Map();
    this.items = [];
    this.dynamic = [];
    this._dynItems = [];
    // [v4:explore] colliders of streamed tiles: while `tag` is set, new colliders carry it and removeTag(tag) takes
    // every one of them out again when the tile unloads (explore/stream.js)
    this.tag = null;
    this._tagged = new Map();
    // [smooth] _query() results: reused arrays (a stack of them, so a query made while another's result is being read gets its own) and
    // a stamp per item instead of a Set for the de-duplication; _local() writes into _lv
    this._qPool = []; this._qDepth = 0; this._qStamp = 0; this._lv = [0, 0];
  }
  _cells(minx, minz, maxx, maxz, fn) {
    const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL), z0 = Math.floor(minz / CELL), z1 = Math.floor(maxz / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) fn(cellKey(ix, iz));
  }
  _insert(it) {
    const r = it.type === 'cyl' ? it.r : Math.hypot(it.hw, it.hd);
    if (this.tag !== null) {   // [v4:explore] tagged: remember its cells for removeTag (untagged items stay in `items`)
      it.tag = this.tag; it._cells = [];
      let list = this._tagged.get(this.tag); if (!list) this._tagged.set(this.tag, (list = [])); list.push(it);
      this._cells(it.cx - r, it.cz - r, it.cx + r, it.cz + r, (k) => { let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(it); it._cells.push(k); });
      return it;
    }
    this.items.push(it);
    this._cells(it.cx - r, it.cz - r, it.cx + r, it.cz + r, (k) => { let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(it); });
    return it;
  }
  /** [v4:explore] Remove every collider added while `tag` was set. Returns how many were removed. */
  removeTag(tag) {
    const list = this._tagged.get(tag); if (!list) return 0;
    for (const it of list) for (const k of it._cells) { const a = this.grid.get(k); if (!a) continue; const i = a.indexOf(it); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } if (!a.length) this.grid.delete(k); }
    this._tagged.delete(tag);
    return list.length;
  }
  /** [v4:explore] Remove the colliders near (x, z) (within r of their centre) that `fn(item)` accepts: a doorway cut
   *  into a wall another module built (the fish market's visitor entrance). Returns the removed colliders. */
  removeNear(x, z, r, fn = () => true) {
    const gone = new Set();
    this._cells(x - r - 20, z - r - 20, x + r + 20, z + r + 20, (k) => { const a = this.grid.get(k); if (a) for (const it of a) if (!gone.has(it) && Math.hypot(it.cx - x, it.cz - z) <= r && fn(it)) gone.add(it); });
    if (!gone.size) return [];
    for (const [k, a] of this.grid) { const b = a.filter((it) => !gone.has(it)); if (b.length !== a.length) { if (b.length) this.grid.set(k, b); else this.grid.delete(k); } }
    this.items = this.items.filter((it) => !gone.has(it));
    for (const [t, list] of this._tagged) this._tagged.set(t, list.filter((it) => !gone.has(it)));
    return [...gone];
  }
  /** [v4:explore] Number of colliders carrying `tag` (tests, stats). */
  tagged(tag) { return tag === undefined ? [...this._tagged.values()].reduce((s, l) => s + l.length, 0) : this._tagged.get(tag)?.length || 0; }
  _obb(type, cx, cz, w, d, rotY, extra) {
    return { type, cx, cz, hw: w / 2, hd: d / 2, c: Math.cos(rotY), s: Math.sin(rotY), rotY, ...extra };
  }

  /** Solid oriented box: footprint w (local x) × d (local z) rotated by rotY about its centre; vertical range y0..y1. */
  addBox(cx, cz, w, d, rotY = 0, y0 = -50, y1 = 200) { return this._insert(this._obb('box', cx, cz, w, d, rotY, { y0, y1 })); }
  /** Solid axis-aligned box from min/max corners. */
  addAABB(minx, minz, maxx, maxz, y0 = -50, y1 = 200) { return this.addBox((minx + maxx) / 2, (minz + maxz) / 2, maxx - minx, maxz - minz, 0, y0, y1); }
  /** Solid vertical cylinder. */
  addCylinder(cx, cz, r, y0 = -50, y1 = 200) { return this._insert({ type: 'cyl', cx, cz, r, y0, y1 }); }
  /** Walkable flat top (floor, platform, step, bench-free deck). Blocks the player like a wall when
   *  its top is more than STEP_HEIGHT above the feet. bottom: y below which it no longer blocks. */
  addWalkBox(cx, cz, w, d, rotY, topY, bottom = -50) { return this._insert(this._obb('walk', cx, cz, w, d, rotY, { top: topY, y0: bottom })); }
  /** Walkable ramp: local z from -d/2 (height yA) to +d/2 (height yB). */
  addWalkRamp(cx, cz, w, d, rotY, yA, yB) { return this._insert(this._obb('ramp', cx, cz, w, d, rotY, { yA, yB, y0: Math.min(yA, yB) - 50 })); }
  /** Stairs helper: n steps rising along local +z from y0 to y1 inside footprint (w × d). */
  addStairs(cx, cz, w, d, rotY, y0, y1, n) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    for (let i = 0; i < n; i++) {
      const lz = -d / 2 + d * (i + 0.5) / n;
      this.addWalkBox(cx + lz * s, cz + lz * c, w, d / n, rotY, y0 + (y1 - y0) * (i + 1) / n);
    }
  }
  /** Solid box from an Object3D's world-space AABB (call after positioning it). pad expands XZ. */
  addFromObject(obj, pad = 0) {
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj);
    if (b.isEmpty()) return null;
    return this.addAABB(b.min.x - pad, b.min.z - pad, b.max.x + pad, b.max.z + pad, b.min.y, b.max.y);
  }
  /** Moving colliders: fn() returns an array of {cx,cz,w,d,rotY,y0,y1} each frame. */
  addDynamic(fn) { this.dynamic.push(fn); }

  /** The point (x, z) in the item's frame: [lx, lz] in a reused array (read it before the next call). */
  _local(it, x, z) { const dx = x - it.cx, dz = z - it.cz, v = this._lv; v[0] = dx * it.c - dz * it.s; v[1] = dx * it.s + dz * it.c; return v; }
  /** Every item whose cells meet the square of half-size r round (x, z), each once, in the order a Set gave them (cell by cell, x then
   *  z, then the moving ones). [smooth] The array is reused: iterate it with queryEnd() after, or not at all past the next query. */
  _query(x, z, r) {
    const out = this._qPool[this._qDepth] || (this._qPool[this._qDepth] = []);
    out.length = 0;
    const stamp = ++this._qStamp;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.grid.get(cellKey(ix, iz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) { const it = a[i]; if (it._qs !== stamp) { it._qs = stamp; out.push(it); } }
    }
    const d = this._dynItems;
    for (let i = 0; i < d.length; i++) { const it = d[i]; if (it._qs !== stamp) { it._qs = stamp; out.push(it); } }
    return out;
  }
  refreshDynamic() {
    // [smooth] the moving colliders' boxes are reused, not made again every frame
    const pool = this._dynPool || (this._dynPool = []);
    let n = 0;
    for (const fn of this.dynamic) {
      const arr = fn() || [];
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i], rotY = b.rotY || 0;
        const it = pool[n] || (pool[n] = { type: 'box', cx: 0, cz: 0, hw: 0, hd: 0, c: 1, s: 0, rotY: 0, y0: 0, y1: 0, _qs: 0 });
        it.cx = b.cx; it.cz = b.cz; it.hw = b.w / 2; it.hd = b.d / 2; it.c = Math.cos(rotY); it.s = Math.sin(rotY); it.rotY = rotY; it.y0 = b.y0 ?? -50; it.y1 = b.y1 ?? 200;
        n++;
      }
    }
    const d = this._dynItems; d.length = n;
    for (let i = 0; i < n; i++) d[i] = pool[i];
  }

  /** Surface height under (x,z) for feet at feetY (highest walkable top not above feet+STEP). */
  groundHeight(x, z, feetY = 1e9) {
    let g = this.heightAt(x, z);
    const Q = this._query(x, z, 0.01);
    for (let qi = 0; qi < Q.length; qi++) {
      const it = Q[qi];
      if (it.type !== 'walk' && it.type !== 'ramp') continue;
      const lv = this._local(it, x, z), lx = lv[0], lz = lv[1];
      if (Math.abs(lx) > it.hw || Math.abs(lz) > it.hd) continue;
      const top = it.type === 'walk' ? it.top : it.yA + (it.yB - it.yA) * (lz / (2 * it.hd) + 0.5);
      if (top <= feetY + STEP_HEIGHT && top > g) g = top;
    }
    return g;
  }

  /** [v4:integrate] Is (x, y, z) inside a solid (box or cylinder collider)? Walk boxes and ramps are floors, not solids. */
  solidAt(x, z, y) {
    const Q = this._query(x, z, 0.01);
    for (let qi = 0; qi < Q.length; qi++) {
      const it = Q[qi];
      if (it.type === 'cyl') { if (y > it.y0 && y < it.y1 && Math.hypot(x - it.cx, z - it.cz) < it.r) return true; continue; }
      if (it.type !== 'box' || y <= it.y0 || y >= it.y1) continue;
      const lv = this._local(it, x, z), lx = lv[0], lz = lv[1];
      if (Math.abs(lx) <= it.hw && Math.abs(lz) <= it.hd) return true;
    }
    return false;
  }

  /** [v3:fix] Can a walker stand at (x, z)? Land, or a walkable deck (walk box / ramp) over the sea. */
  standable(x, z, feetY = 1e9) {
    if (!this.isWater || !this.isWater(x, z)) return true;
    return this.groundHeight(x, z, feetY) > this.heightAt(x, z) + 0.05 && this.groundHeight(x, z, feetY) > -0.2;
  }

  /** Push circle (x,z,r) out of solids overlapping the vertical span [feetY, feetY+height]. Mutates p. */
  resolve(p, r, feetY, height) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const Q = this._query(p.x, p.z, r + 0.5);
      for (let qi = 0; qi < Q.length; qi++) {
        const it = Q[qi];
        let y0, y1;
        if (it.type === 'box') { y0 = it.y0; y1 = it.y1; if (feetY + STEP_HEIGHT >= y1 || feetY + height <= y0) continue; }
        else if (it.type === 'cyl') { if (feetY + STEP_HEIGHT >= it.y1 || feetY + height <= it.y0) continue; }
        else if (it.type === 'walk') { if (it.top <= feetY + STEP_HEIGHT || feetY + height <= it.y0) continue; }
        else if (it.type === 'ramp') {
          // blocks only where the ramp surface is far above feet
          const lv = this._local(it, p.x, p.z), lx = lv[0], lz = lv[1];
          const lzC = Math.max(-it.hd, Math.min(it.hd, lz));
          const top = it.yA + (it.yB - it.yA) * (lzC / (2 * it.hd) + 0.5);
          if (top <= feetY + STEP_HEIGHT) continue;
        }
        if (it.type === 'cyl') {
          const dx = p.x - it.cx, dz = p.z - it.cz, d = Math.hypot(dx, dz), m = r + it.r;
          if (d < m) { const k = d > 1e-6 ? (m - d) / d : 0; p.x += dx * k; p.z += dz * k; if (d <= 1e-6) p.x += m; moved = true; }
          continue;
        }
        const lv = this._local(it, p.x, p.z), lx = lv[0], lz = lv[1];
        const qx = Math.max(-it.hw, Math.min(it.hw, lx)), qz = Math.max(-it.hd, Math.min(it.hd, lz));
        let dx = lx - qx, dz = lz - qz, d = Math.hypot(dx, dz);
        let nx, nz, pen;
        if (d > 1e-6) { if (d >= r) continue; nx = dx / d; nz = dz / d; pen = r - d; }
        else { // centre inside: push out along the smallest axis
          const ex = it.hw - Math.abs(lx), ez = it.hd - Math.abs(lz);
          if (ex < ez) { nx = Math.sign(lx) || 1; nz = 0; pen = ex + r; } else { nx = 0; nz = Math.sign(lz) || 1; pen = ez + r; }
        }
        // local -> world (inverse rotation)
        const wx = nx * it.c + nz * it.s, wz = -nx * it.s + nz * it.c;
        p.x += wx * pen; p.z += wz * pen; moved = true;
      }
      if (!moved) break;
    }
    return p;
  }

  get count() { return this.items.length + this.tagged(); }   // [v4:explore] + streamed colliders
}
