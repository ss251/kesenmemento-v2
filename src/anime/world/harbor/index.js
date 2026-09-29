// [v3:harbor] Harbour kit public API (V3-SPEC section 4, package harbor).
//
//   import * as Harbor from './harbor/index.js';
//   Harbor.placeBoat(ctx, 'katsuo', { x, z, rotY }, { seed, name, flags, dynamic });
//   Harbor.buildQuay(ctx, a, b, { kind: 'quay'|'seawall'|'promenade'|'rocks'|'beach', top });
//   Harbor.buildFishMarket(ctx, a, b, { top });          // quay-side market along the water edge a->b
//   Harbor.buildUkimido(ctx, pose) / buildIsuzuTorii / buildIsuzuShrine / buildAnbaLookout
//   Harbor.buildBridgeKanae(ctx, a, b, opts) / buildBridgeOshima(ctx, a, b, opts)   // a, b: [x, z] or [x, y, z] abutments
//   Harbor.buildGulls(ctx, { center, radius, count, perches })
//
// All builders take ctx (Sakura ctx API) and ENU metres; poses use the Sakura convention (local +Z forward,
// rotY 0 faces south/+Z). Static pieces go to ctx.addStatic (merged by material); animated ones to ctx.add.
// Water edges: the water lies on the LEFT of a->b (normal (uz, -ux)).
import { buildBoat, mooreAlong, BOAT_SPECS, boatName, mooringLines } from './boats.js';
import { nightUniform, nightMat, addGlint } from './lights.js';
import { buildQuay } from './quay.js';
import * as props from './props.js';

export { BOAT_SPECS, boatName, mooreAlong, mooringLines, nightUniform, nightMat, addGlint, buildQuay, props };
export { buildFishMarket, buildFishMarketLots } from './market.js';
export { buildHarbor, quayChains } from './world.js';
import { buildHarbor } from './world.js';
export { buildUkimido, buildIsuzuTorii, buildIsuzuShrine, buildAnbaLookout } from './shrine.js';
export { buildBridgeKanae, buildBridgeOshima } from './bridges.js';
export { buildGulls } from './gulls.js';

/** Place one boat. type: 'katsuo' | 'maguro' | 'sanma' | 'small' | 'ferry'. pose: {x, y?, z, rotY}. */
export function placeBoat(ctx, type, pose, opts = {}) { nightUniform(ctx); return buildBoat(ctx, type, pose, opts); }

export { createArrivals, routeFor, arrivalSlots, boatTypeFor } from './arrivals.js';
export { buildMooringRows, MOORING_ROWS } from './rows.js';

/**
 * Arriving boats: glide the vessels of `list` ([{ vessel, time:'HH:MM', kind?, catch?, kg? }], e.g. today's
 * 気仙沼漁協 入船情報) in along water-only routes to the fish market, with labels. Needs the harbor module built.
 */
export function setArrivals(ctx, list, opts = {}) { return ctx.services.harbor?.setArrivals?.(list, opts); }

/** World module entry (src/anime/world/harbor/index.js is the module "harbor" in the registry). */
export async function build(ctx) {
  const h = buildHarbor(ctx);
  if (typeof window !== 'undefined') window.__harbor = { setArrivals: (list, o) => h.arrivals?.setArrivals(list, o), state: () => h.arrivals?.state(), stats: h.stats };
  return h;
}
