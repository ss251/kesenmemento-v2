// [v3:foundation] environment — the land of Kesennuma: terrain skin (land cover from the aerial photos, snapped to
// the anime palette), painted forest crowns on every hill (cedar / broadleaf patches, scattered early autumn colour),
// clustered 3D trees where the camera gets close (神明崎, the hills behind the inner bay), ridges and far mountains
// beyond the city bbox, aerial layering through the fog. Publishes ctx.services.environment.
import * as L from './layout.js';
import { loadLandcover, terrainMaterial, buildTerrain, worldHeight } from './environment/terrain.js';
import { buildTrees } from './environment/trees.js';

export async function build(ctx) {
  const t0 = performance.now();
  const stats = {};
  const lc = await loadLandcover();
  const mat = terrainMaterial(ctx, lc);
  const terrain = buildTerrain(ctx, mat);
  stats.terrain = terrain.stats;
  let trees = null;
  try { trees = await buildTrees(ctx, lc); stats.trees = trees?.stats; } catch (e) { console.error('[environment] trees', e); stats.treesError = String(e); }
  ctx.services.environment = {
    groundAt: L.groundAt, worldHeight, terrainMaterial: mat, landcover: lc.meta,
    forestAt: trees?.forestAt || (() => 0), trees: trees?.list || [],
  };
  stats.ms = Math.round(performance.now() - t0);
  if (typeof window !== 'undefined') window.__env = stats;
  return stats;
}
