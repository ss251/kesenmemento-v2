// [play] The walk boom also stops on building boxes. On the phone tier a hero
// lot outside the kit radius is a solid mid mesh with no wall collider, so
// physics.solidAt lets the camera sit in the awning (魚町, −96, −72). The box
// is the footprint the mesh is drawn from, plus the shop awning on its street
// face. A lot the phone kit did build keeps its own walls and interiors; only
// the awning is added there, and on every other tier. No allocation after the
// first visit to a lot.

import { wings } from '../../world/town/wings.js';

/** Phone kit radius is the hero disc times this (core/tier.js PHONE.heroR). */
export const PHONE_HERO_SCALE = 0.45;

// mid.js shop awning: street face is local +Z, 1.1 m past the wall, cloth from
// fy+1.8 to fy+2.5. A little past the cloth so the boom sphere is not in it.
const AWN = { depth: 1.36, y0: 1.7, y1: 2.75, reach: 12 };

const rectCache = new WeakMap();
let stamp = 1;

function rectsOf(lot) {
  let r = rectCache.get(lot);
  if (r) return r;
  const o = lot.obb;
  const whole = [{ cx: 0, cz: 0, w: o.w, d: o.d }];
  if (!lot.poly) r = whole;
  else {
    try {
      const w = wings(lot);
      r = w.rects && w.rects.length ? w.rects : whole;
    } catch (e) { r = whole; }
  }
  rectCache.set(lot, r);
  return r;
}

/** Lots whose footprint cells fall inside `radius` of (x, z). Reuses `out`. */
export function gatherLots(index, x, z, radius, out) {
  out.length = 0;
  const grid = index && index.grid;
  if (!grid || !grid.map) return out;
  const s = ++stamp;
  if (stamp > 1e9) stamp = 1;
  const c = grid.cell || 24;
  const i0 = Math.floor((x - radius) / c), i1 = Math.floor((x + radius) / c);
  const j0 = Math.floor((z - radius) / c), j1 = Math.floor((z + radius) / c);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const a = grid.map.get(grid.key(i, j));
    if (!a) continue;
    for (let k = 0; k < a.length; k++) {
      const lot = a[k];
      if (lot._boomQs === s) continue;
      lot._boomQs = s;
      out.push(lot);
    }
  }
  return out;
}

export function localOf(obb, x, z, out) {
  const c = Math.cos(obb.rotY), s = Math.sin(obb.rotY);
  const dx = x - obb.cx, dz = z - obb.cz;
  out.lx = dx * c - dz * s;
  out.lz = dx * s + dz * c;
  return out;
}

/** True when the phone tier did not build this lot as a hero kit (no wall collider). */
export function outsidePhoneKit(lot, hero, scale = PHONE_HERO_SCALE) {
  if (!hero || !lot || !lot.obb) return false;
  const r = hero.r * scale;
  const dx = lot.obb.cx - hero.cx, dz = lot.obb.cz - hero.cz;
  return dx * dx + dz * dz > r * r;
}

function mainWing(lot) {
  const rects = rectsOf(lot);
  let main = rects[0];
  for (let i = 1; i < rects.length; i++) {
    const r = rects[i];
    if (r.w * r.d > main.w * main.d) main = r;
  }
  return main;
}

/** The shop cloth on the street face of the main wing (mid.js, local +Z). */
export function inAwing(lot, x, y, z, loc) {
  if (!lot || (lot.kind !== 'shop' && lot.facade !== 'shop') || !lot.obb) return false;
  const gy = lot.groundY || 0;
  if (y < gy + AWN.y0 || y > gy + AWN.y1) return false;
  localOf(lot.obb, x, z, loc);
  const main = mainWing(lot);
  const aw = Math.min(Math.max(0.4, main.w - 0.4), AWN.reach);
  const front = main.cz + main.d / 2;
  if (Math.abs(loc.lx - main.cx) > aw / 2) return false;
  return loc.lz > front - 0.02 && loc.lz < front + AWN.depth;
}

export function inBody(lot, x, y, z, loc) {
  if (!lot || !lot.obb || lot.kind === 'carpark') return false;
  const gy = lot.groundY ?? 0;
  const top = gy + Math.max(2.8, Math.min(60, lot.height || 3)) + 0.55;
  if (y <= gy - 0.35 || y >= top) return false;
  localOf(lot.obb, x, z, loc);
  const rects = rectsOf(lot);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (Math.abs(loc.lx - r.cx) <= r.w / 2 && Math.abs(loc.lz - r.cz) <= r.d / 2) return true;
  }
  return false;
}

/**
 * `opts.phone` enables the solid body for lots outside the phone kit.
 * The awning is solid at every tier. `loc` is a reused { lx, lz }.
 */
export function boxHit(lots, x, y, z, opts, loc) {
  const phone = !!(opts && opts.phone);
  const hero = opts && opts.hero;
  const scale = opts && opts.scale != null ? opts.scale : PHONE_HERO_SCALE;
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (inAwing(lot, x, y, z, loc)) return true;
    if (phone && outsidePhoneKit(lot, hero, scale) && inBody(lot, x, y, z, loc)) return true;
  }
  return false;
}

/** A probe the chase prepares once a frame, then samples with no allocation. */
export function createBuildingProbe(getIndex, getOpts) {
  const near = [];
  const loc = { lx: 0, lz: 0 };
  return {
    prepare(x, z) {
      const index = typeof getIndex === 'function' ? getIndex() : getIndex;
      if (!index) { near.length = 0; return near; }
      return gatherLots(index, x, z, 8, near);
    },
    hit(x, y, z) {
      if (!near.length) return false;
      const opts = typeof getOpts === 'function' ? getOpts() : getOpts;
      return boxHit(near, x, y, z, opts, loc);
    },
  };
}
