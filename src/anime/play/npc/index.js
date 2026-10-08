// [play:missions] The town's quest people. At most two are posed a frame.
// A figure stays up while their balloon can still be read, so a 「！」 at 60 m has a person under it.
import * as L from '../../world/layout.js';
import NPCS from '../../../../data/play/npcs.json';
import { makeTreeAt } from '../../world/explore/places.js';
import { clearStance, standingClear } from '../missions/place.js';
import { buildFigure, poseFigure, lookPoint } from './figures.js';
import { freeTree } from '../kit/lazy.js';

const SHOW = 108;
const BUILD = 120;
// [mobile-play] A pool: a figure is built within BUILD of the player and freed past FREE (one a frame), so a long walk
// across town does not keep all fifteen (a skinned body, two painted faces each) on a phone.
const FREE = 180;
const SHOW2 = SHOW * SHOW;
const BUILD2 = BUILD * BUILD;
const FREE2 = FREE * FREE;

function trunkNear(trees) {
  const G = new Map(), key = (i, j) => i * 100003 + j;
  for (let n = 0; n < (trees ? trees.length : 0); n++) {
    const t = trees[n];
    if (!t || !Number.isFinite(t.x)) continue;
    const i = Math.floor(t.x / 16), j = Math.floor(t.z / 16), k = key(i, j);
    let a = G.get(k);
    if (!a) G.set(k, (a = []));
    a.push(t.x, t.z);
  }
  return (x, z) => {
    const i = Math.floor(x / 16), j = Math.floor(z / 16);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const a = G.get(key(i + di, j + dj));
      if (!a) continue;
      for (let n = 0; n < a.length; n += 2) {
        const dx = a[n] - x, dz = a[n + 1] - z;
        if (dx * dx + dz * dz < 0.81) return true;
      }
    }
    return false;
  };
}

function ground(x, z) {
  try { return L.groundAt(x, z); } catch { return 0; }
}

/**
 * @param {object} ctx
 * @returns {{ list: object[], buildOne: Function, pose: Function }}
 */
export function mountNpcs(ctx) {
  const list = NPCS.npcs.map((n) => ({
    ...n,
    y: ground(n.x, n.z),
    h: null,
    d: null,
    built: false,
    posed: false,
  }));
  const look = { x: 0, y: 0, z: 0 };
  const feet = { x: 0, y: 0, z: 0 };
  let cursor = 0;
  let settled = false;
  let tries = 0;
  let sample = () => false;
  let sampleReady = false;

  function worldSample(x, z, y) {
    if (L.isWater?.(x, z) && ground(x, z) < 0.35) return true;
    return sample(x, z, y);
  }

  function ensureSample() {
    if (sampleReady) return;
    const trees = ctx.services?.environment?.trees;
    const physics = ctx.physics;
    const treeAt = makeTreeAt(trees, ctx.services?.poles?.poles);
    // A forest record's trunk test is 0.5 m. The mesh is scaled by the crown, so a person can
    // stand inside the drawn trunk while the point test says the spot is free. Keep 0.9 m clear.
    const trunks = trunkNear(trees);
    sample = (x, z, y) => {
      try { if (physics && physics.solidAt(x, z, y)) return true; } catch { /* physics not ready */ }
      try { if (treeAt(x, z, y)) return true; } catch { /* */ }
      if (trunks(x, z)) return true;
      return false;
    };
    sampleReady = true;
  }

  function placeOne(n) {
    ensureSample();
    if (standingClear(n.x, n.z, n.y, worldSample)) return;
    const next = clearStance(n, worldSample, ground);
    if (!next.moved) return;
    n.x = next.x;
    n.z = next.z;
    n.y = next.y;
    n.yaw = next.yaw;
    n.shifted = true;
  }

  function trySettle() {
    if (settled) return;
    tries++;
    const trees = ctx.services?.environment?.trees;
    const physics = ctx.physics;
    // Street trees are cylinders added with the town. The forest list is ready first, so a
    // settle on frame 1 never sees them. Wait, then keep checking until the street is in.
    if ((!trees || !trees.length) && !physics?.solidAt && tries < 90) return;
    if (tries < 12) return;
    for (let i = 0; i < list.length; i++) placeOne(list[i]);
    if (tries >= 45) settled = true;
  }

  function buildOne(npc) {
    trySettle();
    if (npc) placeOne(npc);
    if (!npc || npc.built) return npc;
    npc.built = true;
    try {
      const fig = buildFigure(ctx, npc);
      npc.h = fig.h;
      npc.d = fig.d;
      npc.h.group.visible = false;
      ctx.add(npc.h.group);
      if (!npc.solid) {
        npc.solid = true;   // (the collider stays when the figure is freed: the next build does not add a second one)
        try { ctx.physics?.addCylinder?.(npc.x, npc.z, 0.28, npc.y, npc.y + 1.75); } catch { /* no collider */ }
      }
    } catch (e) {
      console.error('[play:npc]', npc.id, e);
    }
    return npc;
  }

  /** Free a far figure: its body, both faces and their painted maps. It is built again when the player comes back. */
  function freeOne(npc) {
    const h = npc.h;
    npc.h = null; npc.d = null; npc.built = false; npc.posed = false;
    if (!h) return;
    try { freeTree(ctx, h.group, { extra: Object.values(h.mats || {}) }); } catch (e) { console.error('[play:npc] free', npc.id, e); }
    frees++;
  }
  let frees = 0;

  function pose(dt, t, priorityId) {
    trySettle();
    const p = ctx.player?.position;
    if (p) { feet.x = p.x; feet.y = p.y; feet.z = p.z; }
    for (let k = 0; k < list.length; k++) {
      const i = (cursor + k) % list.length;
      const n = list[i];
      if (n.built) continue;
      const dx = n.x - feet.x, dz = n.z - feet.z;
      if (n.id !== priorityId && dx * dx + dz * dz > BUILD2) continue;
      buildOne(n);
      cursor = (i + 1) % list.length;
      break;
    }
    let i0 = -1, i1 = -1, d0 = 1e18, d1 = 1e18, pri = -1;
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const dx = n.x - feet.x, dz = n.z - feet.z;
      const d2 = dx * dx + dz * dz;
      const near = d2 <= SHOW2 || n.id === priorityId;
      if (n.id === priorityId) pri = i;
      if (!near) {
        if (n.h) n.h.group.visible = false;
        continue;
      }
      if (d2 < d0) { d1 = d0; i1 = i0; d0 = d2; i0 = i; }
      else if (d2 < d1) { d1 = d2; i1 = i; }
    }
    const a = pri >= 0 ? pri : i0;
    const b = pri >= 0 && i0 !== pri ? i0 : i1;
    poseAt(a, dt, t);
    if (b !== a) poseAt(b, dt, t);
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (!n.h) continue;
      const on = n.posed && (i === a || i === b);
      n.h.group.visible = on;
    }
    // [mobile-play] one far figure a frame goes back to the pool (never the one the player is talking to)
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (!n.h || n.id === priorityId) continue;
      const dx = n.x - feet.x, dz = n.z - feet.z;
      if (dx * dx + dz * dz > FREE2) { freeOne(n); break; }
    }
  }

  function poseAt(i, dt, t) {
    if (i < 0) return;
    const n = list[i];
    if (!n.h) return;
    lookPoint(n, feet, look);
    try { poseFigure(n, t, dt, look); n.posed = true; } catch (e) {
      if (!n._poseErr) { n._poseErr = 1; console.error('[play:npc] pose', n.id, e); }
    }
  }

  return {
    list, buildOne, pose, blocked: (x, z, y) => worldSample(x, z, y),
    /** [mobile-play] how many figures are built now, and how many were freed (the census and the tests read it) */
    get built() { return list.reduce((k, n) => k + (n.h ? 1 : 0), 0); },
    get frees() { return frees; },
  };
}
