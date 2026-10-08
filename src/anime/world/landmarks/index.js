// [v4:landmarks-B] World module: the civic landmarks rebuilt at true dimensions from their reference sheets
// (docs/anime/landmarks/*.md, V3-SPEC section 10): 気仙沼市役所 (八日町) and the new city hall under construction at
// 田中, JR/BRT 気仙沼駅 with its square, platforms, rails and an enterable waiting hall, リアス・アーク美術館, the
// hospitals, the schools, the temples, shrines and the Orthodox church, and 大島 (亀山テラス360°, the monorail, 浦の浜).
// The GSI lots these replace are tagged `landmark` by scripts/anime/build-layout.js (sites.js siteOfLotB), so town
// skips them. Builds after harbor; publishes ctx.services.landmarks.
import { buildStation, buildRails } from './station.js';
import { buildCityHall } from './cityhall.js';
import { buildRiasArk } from './riasark.js';
import { buildHospitals } from './hospitals.js';
import { buildSchools } from './schools.js';
import { buildTemples } from './temples.js';
import { buildOshima } from './oshima.js';
import { buildGasHolder } from './gasholder.js';   // [v6:c9r3]
import { buildFarGround } from './farground.js';
import { PLACES_B } from './sites.js';

const BUILDERS = [
  ['station', buildStation],
  ['rails', buildRails],
  ['cityHall', buildCityHall],
  ['riasArk', buildRiasArk],
  ['hospitals', buildHospitals],
  ['schools', buildSchools],
  ['temples', buildTemples],
  ['oshima', buildOshima],
  ['gasHolder', buildGasHolder],
  ['ground', buildFarGround],
];

export async function build(ctx) {
  const out = {}, errors = [], ms = {};
  for (const [id, fn] of BUILDERS) {
    const t0 = performance.now();
    try { out[id] = await fn(ctx); } catch (e) { errors.push({ id, message: String(e?.message || e) }); console.warn('[landmarks]', id, e); }
    ms[id] = Math.round(performance.now() - t0);
  }
  const L = ctx.L;
  // places for search, labels and the tour: a drone framing looking at each from the south-east
  const places = PLACES_B.map((p) => { const y = L.groundAt(p.at[0], p.at[1]); return { ...p, y, drone: { pos: [p.at[0] + 55, y + 42, p.at[1] + 55], look: [p.at[0], y + 8, p.at[1]] } }; });
  // walk-in interiors other modules (explore's interiors list, the tour) can drop the player into
  const interiors = [];
  if (out.station?.hall) interiors.push({ id: 'station', ja: '気仙沼駅 待合室', en: 'Kesennuma Station waiting hall', ...out.station.hall });
  ctx.services.landmarks = { built: out, places, interiors, errors, ms };
  return ctx.services.landmarks;
}
