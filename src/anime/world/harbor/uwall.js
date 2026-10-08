// [v4:landmarks-A] The 魚町 inner-bay seawall as built (harbor/real.js UWALL; docs/anime/landmarks/seawall-promenade.md):
// a low, smooth light-concrete wall on the landward edge of the waterside apron, crest T.P. 4.1 m, only 1.3 m above the
// pavement behind it (the design kept it low so the bay shows over it), topped by a band of 21 flap gates of 13.7 m that
// lie flat and rise by themselves with the sea (no power, no operator); stair-shaped rest decks cross it at intervals (their white blocks are
// on the z18 photo), a strip of pale grey concrete block paving runs along the road side ([v5:fix1] Google Earth
// 2026-03-11; it was warm pink-red), low footlights light it at night.
// There are no windows in the real wall. 311 m, 土木学会デザイン賞 2022; heights: imakawa.net/blog/4847.
// Returns { line, crest, gates, stairs, wallDist(x, z) }.
import * as THREE from 'three';
import { UWALL } from './real.js';
import { resample, sweepSlab, worldKit, seg, lineLen, atLen, paint } from './lmkit.js';
import { nightMat, registry } from './lights.js';
import { mapMat } from './util.js';

const C = { wall: '#c9c8c1', wallShade: '#b3b2ab', gate: '#8d9296', gateDark: '#6f757b', pave: '#b8b6b2', paveJoint: '#9d9b97', step: '#d6d4cc', timber: '#a98464' };

/** Signed distance (m) from (x, z) to the wall line: + on the water side, - on the land side. */
export function wallSide(x, z) {
  let best = null;
  const P = UWALL.line;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) { const l = Math.sqrt(l2); const side = ((x - a[0]) * (-dz / l) + (z - a[1]) * (dx / l)); best = { d, s: side >= 0 ? d : -d }; }
  }
  return best ? best.s : 1e9;
}

export function buildUwall(ctx) {
  const L = ctx.L, U = UWALL;
  const { k } = worldKit(ctx, 'uomachi-wall');
  const t = (c, o) => ctx.mat.toon(c, o);
  const paveTex = paint(ctx, 'pave', 256, 256, (g, w, h) => {
    const r = ctx.rng('lm4-pave');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { g.fillStyle = r.pick(['#b8b6b2', '#b2b0ac', '#bebcb7', '#aeaca8', '#bbb9b5']); g.fillRect(x * 64 + (y % 2) * 32 - 32, y * 32, 64, 32); g.fillRect(x * 64 + (y % 2) * 32 + 224, y * 32, 64, 32); }   // [v5:fix1] pale grey concrete blocks (Google Earth 2026-03-11; was pink-red)
    g.strokeStyle = C.paveJoint; g.lineWidth = 2;
    for (let y = 0; y <= 8; y++) { g.beginPath(); g.moveTo(0, y * 32); g.lineTo(w, y * 32); g.stroke(); for (let x = -1; x <= 4; x++) { const xx = x * 64 + (y % 2) * 32; g.beginPath(); g.moveTo(xx, y * 32); g.lineTo(xx, y * 32 + 32); g.stroke(); } }
  }, [1, 1]);
  const m = {
    wall: t(C.wall, { paint: 0.07 }), shade: t(C.wallShade, { paint: 0.06 }), gate: t(C.gate, { paint: 0.02 }), gateDark: t(C.gateDark, { paint: 0 }),
    pave: mapMat(ctx, 'toon', '#ffffff', paveTex, { paint: 0.03, polygonOffset: -1 }), step: t(C.step, { paint: 0.06 }), timber: t(C.timber, { paint: 0.06 }),
    foot: nightMat(ctx, '#d6d2c6', '#ffe2b0', 1.9),
  };
  const line = resample(U.line, 2);
  const g = (p, l) => L.heightAt(p.x - p.uz * l, p.z + p.ux * l);   // terrain at a lateral offset (+ = water side)
  // the wall body: crest 4.1, 0.7 m thick, from below the lower of the two grounds; a slightly proud cap
  const lowY = Math.min(...line.map((p) => Math.min(g(p, 1.5), g(p, -1.5)))) - 0.8;
  k.mesh(sweepSlab(line.map((p) => ({ ...p, y: U.crest - 0.12 })), { l0: -0.35, l1: 0.35, th: U.crest - 0.12 - lowY, tile: 3 }), m.wall);
  k.mesh(sweepSlab(line.map((p) => ({ ...p, y: U.crest })), { l0: -0.42, l1: 0.42, th: 0.14, tile: 3 }), m.shade);
  // the flap-gate band lying flat on the crest (steel grey), a hinge line on the water side, joints every 13.7 m
  const total = lineLen(U.line), gates = [];
  const gl = total / U.gates;
  for (let i = 0; i < U.gates; i++) {
    const s0 = i * gl + 0.15, s1 = (i + 1) * gl - 0.15;
    const pts = resample([[atLen(U.line, s0).x, atLen(U.line, s0).z], [atLen(U.line, (s0 + s1) / 2).x, atLen(U.line, (s0 + s1) / 2).z], [atLen(U.line, s1).x, atLen(U.line, s1).z]], 3).map((p) => ({ ...p, y: U.crest + 0.12 }));
    k.mesh(sweepSlab(pts, { l0: -0.38, l1: 0.38, th: 0.1, tile: 2 }), m.gate);
    k.mesh(sweepSlab(pts.map((p) => ({ ...p, y: p.y + 0.02 })), { l0: 0.3, l1: 0.38, th: 0.05, tile: 2, sides: false }), m.gateDark);
    gates.push({ s0, s1 });
  }
  // low footlights along the land side of the wall, one per gate
  for (let i = 0; i < U.gates; i++) {
    const p = atLen(U.line, (i + 0.5) * gl), x = p.x + p.uz * 0.45, z = p.z - p.ux * 0.45, y = L.heightAt(x, z);
    k.box(0.25, 0.12, 0.5, m.foot, [x, Math.min(U.crest - 0.6, y + 0.45), z], [0, Math.atan2(p.ux, p.uz), 0]);
    registry(ctx)?.point({ x, y: y + 0.5, z, color: '#ffe2b0', size: 0.45, intensity: 1.3, mode: 'lamps' });
  }
  // the pale grey block paving on the road side (3.2 m wide), following the ground
  k.mesh(sweepSlab(line.map((p) => ({ ...p, y: g(p, -2.0) + 0.04 })), { l0: -3.8, l1: -0.4, th: 0.3, tile: 4, bottom: false }), m.pave);
  // stair-shaped rest decks across the wall: wide concrete steps up from the pavement, a landing on the crest (a timber
  // seat top), steps down to the apron
  const stairs = [];
  for (const [sx, sz] of U.stairs) {
    let best = null; line.forEach((p) => { const d = Math.hypot(p.x - sx, p.z - sz); if (!best || d < best.d) best = { d, p }; });
    const p = best.p, rot = Math.atan2(p.ux, p.uz), across = [-p.uz, p.ux];
    const grp = k.group([p.x, 0, p.z], rot), kk = ctx.kit(grp);   // local +Z along the wall, local +X = the land side
    const yLand = g(p, -3), ySea = g(p, 3.5), wide = 3.6;
    // land side: 5 steps up (local x < 0)
    const nL = Math.max(2, Math.round((U.crest - yLand) / 0.26));
    for (let i = 0; i < nL; i++) { const y = yLand + (U.crest - yLand) * (i + 1) / nL; kk.box(0.4, y - yLand + 0.3, wide, m.step, [0.45 + (nL - i) * 0.4 - 0.2, (y + yLand - 0.3) / 2, 0]); }   // local +X is the land side
    kk.box(1.3, 0.16, wide, m.timber, [0, U.crest + 0.2, 0]);
    // water side: steps down to the apron
    const nS = Math.max(2, Math.round((U.crest - ySea) / 0.26));
    for (let i = 0; i < nS; i++) { const y = ySea + (U.crest - ySea) * (nS - i) / nS; kk.box(0.4, y - ySea + 0.3, wide, m.step, [-(0.45 + i * 0.4 + 0.2), (y + ySea - 0.3) / 2, 0]); }
    void across;
    if (ctx.physics?.addWalkRamp) {
      const lx = -0.45 - nL * 0.2, sxW = 0.45 + nS * 0.2;
      const cL = [p.x + (-p.uz) * lx, p.z + p.ux * lx], cS = [p.x + (-p.uz) * sxW, p.z + p.ux * sxW];
      ctx.physics.addWalkRamp(cL[0], cL[1], wide, nL * 0.4, rot + Math.PI / 2, U.crest, yLand);
      ctx.physics.addWalkRamp(cS[0], cS[1], wide, nS * 0.4, rot + Math.PI / 2, ySea, U.crest);
      ctx.physics.addWalkBox(p.x, p.z, wide, 1.3, rot + Math.PI / 2, U.crest + 0.28, U.crest - 1.2);
    }
    stairs.push({ x: p.x, z: p.z });
  }
  // the wall blocks walkers except at the stairs
  if (ctx.physics?.addBox) {
    const sm = resample(U.line, 4);
    for (let i = 0; i < sm.length - 1; i++) {
      const a = sm[i], b = sm[i + 1], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      if (stairs.some((s) => Math.hypot(s.x - mx, s.z - mz) < 2.6)) continue;
      const s = seg([a.x, a.z], [b.x, b.z]); ctx.physics.addBox(s.x, s.z, 0.8, s.len, s.rotY, lowY, U.crest + 0.25);
    }
  }
  return { line: U.line, crest: U.crest, gates: gates.length, gateLen: +gl.toFixed(1), len: Math.round(total), stairs };
}
