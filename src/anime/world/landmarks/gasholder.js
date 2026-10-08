// [v4:landmarks-B] [v6:c9r3] The spherical gas holder of the ガス課 works at 幸町 1丁目 (ENU -352, 889): a pale blue-white sphere about 15 m
// across, round at every height (it was drawn as a 14 m flat-topped drum, a cylinder with a lid).
// Evidence: Google Earth 2026-03-11 c9/C top + o0 + o180 + o270 / l45 (the sphere's shading and shadow; the crest reads
// about 15-17 m above the ground). The GSI photo shows two holders; the south one (OSM w928759461) is now an empty round
// pad (the plaza polygon c9 landuse/4), so only this one is built. The lot ovr:c9:gas-holder (data/anime/overrides/c9.json)
// keeps the footprint, the collider and the map; LOT_FIX tags it `landmark: 'gasHolder'` so town leaves it and this draws it.
import * as THREE from 'three';
import { group, groundSpan, colliders } from './kit.js';

export const GAS_HOLDER = { id: 'ovr:c9:gas-holder', at: [-352, 889], r: 7.5, lift: 1.0, color: '#d3dce2', foot: '#a8a59d' };

export function buildGasHolder(ctx) {
  const L = ctx.L, G = GAS_HOLDER, lot = L.LOTS.find((l) => l.id === G.id);
  if (!lot) return { built: false };
  const { k } = group(ctx, 'lmC-gasholder');
  const [x, z] = G.at, gs = groundSpan(L, lot.poly), y0 = L.heightAt(x, z);
  const cy = y0 + G.lift + G.r;
  const t = (c, o) => ctx.mat.toon(c, o);
  // the sphere rests on a squat concrete foot (a hidden bearing ring: no legs are asserted)
  k.cyl(3.4, 3.8, G.lift + G.r * 0.5, t(G.foot, { paint: 0.05 }), [x, y0 - 0.3 + (G.lift + G.r * 0.5) / 2, z], null, 20);
  k.mesh(new THREE.SphereGeometry(G.r, 36, 24), t(G.color, { paint: 0.03 }), [x, cy, z]);
  colliders(ctx, lot.poly, gs.lo - 1, cy + G.r);
  return { built: true, crest: Math.round((cy + G.r - y0) * 10) / 10, at: G.at };
}
