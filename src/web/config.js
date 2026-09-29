// Web app constants: looks (BUILD-SPEC §1), quality tiers (§7), the physical model (ADDENDUM) and scene props.
import { llToEnu } from "../core/geo.js";

// The physical scale model of the inner bay: which part of the real city it shows and at what scale.
// center/extent are ENU metres; scale is model metres per real metre. Verify against the capture on site.
export const MODEL = { center: [300, -150], extent: [1800, 1400], scale: 1 / 450 };

// FogExp2 densities in the spec are quoted per 10 m of scene (a 1 km view at 0.003 would be white);
// the app multiplies by FOG_SCALE so the golden-hour haze reads like the reference at city scale.
export const FOG_SCALE = 0.1;

// Look keyframes by sun elevation (degrees). Values between keys are interpolated.
export const LOOKS = [
  { elev: -12, env: 0.12, fog: "#0a1420", density: 0.006, exposure: 0.6, bloom: 0.18, sun: "#6d7fa8", sunI: 0, amb: 0.22, night: 1,
    sky: { turbidity: 2, rayleigh: 0.5, mie: 0.005, mieG: 0.8 } },
  { elev: -4, env: 0.3, fog: "#27324a", density: 0.0045, exposure: 0.72, bloom: 0.15, sun: "#ff9a6a", sunI: 0, amb: 0.35, night: 0.75,
    sky: { turbidity: 5, rayleigh: 2.5, mie: 0.008, mieG: 0.85 } },
  { elev: 2, env: 0.5, fog: "#d9957a", density: 0.0034, exposure: 0.95, bloom: 0.1, sun: "#ff9562", sunI: 1.6, amb: 0.5, night: 0.25,
    sky: { turbidity: 7, rayleigh: 2.5, mie: 0.008, mieG: 0.85 } },
  { elev: 8, env: 0.6, fog: "#e8b98a", density: 0.003, exposure: 1.05, bloom: 0.08, sun: "#ffb072", sunI: 2.6, amb: 0.6, night: 0,
    sky: { turbidity: 7, rayleigh: 2.5, mie: 0.008, mieG: 0.85 } },
  { elev: 25, env: 0.3, fog: "#c9d3d9", density: 0.0022, exposure: 0.85, bloom: 0.05, sun: "#fff4e8", sunI: 2.7, amb: 0.55, night: 0,
    sky: { turbidity: 4, rayleigh: 1.4, mie: 0.005, mieG: 0.8 } },
];

// Building colours: photo-terrain look (spec §1) and the physical-model look (ADDENDUM).
export const BUILDING = { wall: "#e9e4dc", roof: "#c9c0b4", jitter: 0.06, window: "#ffd9a0", windowI: 1.2, litShare: 0.35 };
export const MODEL_LOOK = { wall: "#f3f1ec", terrain: "#e7e0d2", forest: "#8fae7c", water: "#a9bcc4", road: "#d4d3cf", tree: ["#6f9a5a", "#86ab6c", "#5d8a4e", "#7ba062"] };

export const WATER = { color: 0x123329, distortion: 2.0, y: 0.35 };

// Night props. Kanae bridge: main-span midpoint and axis from data/landmarks.json's verification note
// (mid 38.89267N 141.59239E; OSM way centre on the SW approach 38.88954N 141.59005E -> axis bearing ~30 deg).
const KANAE_MID = llToEnu(38.89267, 141.59239), KANAE_SW = llToEnu(38.88954, 141.59005);
const kAxis = (() => { const dx = KANAE_MID.x - KANAE_SW.x, dz = KANAE_MID.z - KANAE_SW.z, l = Math.hypot(dx, dz); return [dx / l, dz / l]; })();
export const NIGHT = {
  flood: "#ffb066",
  floods: [[38.899, 141.58187], [38.8998, 141.5808], [38.9047, 141.5759]],          // fish market quay x2, Pier 7 (60 m S of the capture spot)
  kanae: [{ x: KANAE_MID.x - kAxis[0] * 360, z: KANAE_MID.z - kAxis[1] * 360 }, { x: KANAE_MID.x + kAxis[0] * 360, z: KANAE_MID.z + kAxis[1] * 360 }],
};

// Boat route (lat, lon) from the open bay through the Oshima strait to the fish market quay. Each point is
// snapped to the nearest water cell of the terrain at load, so the route stays on the sea.
export const BOAT_ROUTE = [[38.835, 141.6005], [38.862, 141.6025], [38.8788, 141.6045], [38.887, 141.5965], [38.8935, 141.5885], [38.8975, 141.5838], [38.8988, 141.5828]];

// Quality tiers (spec §7 performance budgets).
// `real` = the photoreal pipeline per tier (V2-SPEC §10): clouds full/half/none, tiles errorTarget, DPR cap.
export const TIERS = {
  high: { real: { errorTarget: 8, dpr: 2, clouds: "high", water: "env" }, dpr: 1.5, gtao: true, csm: { cascades: 4, size: 2048 }, mirror: true, bloomScale: 1, trees: 40000, cityTrees: 6000, coreStep: 11, cityStep: 40, ortho: "core", lodSplatScale: 1, smaa: true, tilt: true },
  med: { real: { errorTarget: 12, dpr: 1.5, clouds: "med", water: "env" }, dpr: 1.25, gtao: false, csm: { cascades: 3, size: 1024 }, mirror: false, bloomScale: 0.5, trees: 16000, cityTrees: 5000, coreStep: 14.8, cityStep: 48, ortho: "core", lodSplatScale: 1.2, smaa: true, tilt: true },
  low: { real: { errorTarget: 20, dpr: 1, clouds: "off", water: "env" }, dpr: 1.5, gtao: false, csm: { cascades: 2, size: 1024 }, mirror: false, bloomScale: 0.5, trees: 6000, cityTrees: 0, coreStep: 14.8, cityStep: 64, coreOnlyBuildings: true, ortho: "core_2k", lodSplatScale: 1.5, smaa: false, tilt: false },
};

export const JST_OFFSET_H = 9;

// ------------------------------------------------------------------ v2: the photoreal look (V2-SPEC §5, §6, §9)
// Time presets in JST hours: golden hour 17:05, night 19:40 (late-September sunset ≈ 17:30).
export const TIME_PRESETS = { golden: 17 + 5 / 60, night: 19 + 40 / 60, dusk: 17.5, day: 11, morning: 7.5 };

// Live weather -> cloud coverage (§5). JMA wording: 晴 clear, 曇 cloudy, 雨 rain, 雪 snow.
export function weatherCoverage(text) {
  const s = String(text ?? "");
  if (/雨|雪|rain|snow|shower/i.test(s)) return 0.85;
  if (/曇|くもり|cloud|overcast/i.test(s)) return 0.65;
  if (/晴|clear|sun|fair/i.test(s)) return 0.25;
  return null;
}

// Look constants for the photoreal pipeline (takram radiance units; tuned by eye against Google Earth captures).
export const REAL = {
  defaultCoverage: 0.3,
  cloudDriftPerMs: 1.2e-5,     // local-weather tiles per second per m/s of wind
  waterBase: 0.35,             // m: water plane above T.P. 0 so Google's own sea never pokes through
  tileWaterCut: 0.12,          // m above the water plane: tile fragments below are discarded (their photogrammetry sea)
  albedoScale: 1.0,            // AerialPerspectiveEffect albedo scale for Google's baked textures
  // exposure by sun elevation (deg -> linear multiplier), interpolated; the eye adapts as the light goes
  exposure: [[-12, 170], [-8, 140], [-4, 95], [-1, 62], [2, 44], [5, 32], [10, 22], [20, 15], [40, 11], [90, 10]],
  tileTint: [1.05, 1.0, 0.92],  // albedo white balance for Google's cool textures
  tileSat: 1.12,
  waterRefl: 1.0,              // reflection gain (screen-space planar + sky), Fresnel-weighted in the shader
  exposureCoverLift: 0.7,      // exposure × (1 + lift·cover) by day, so overcast light is not read as dusk
  stagedMaxCoverage: 0.35,     // cloud cover cap for preset / tour / slider times (live "now" time follows JMA)
  bloomDay: 0.12, bloomNight: 0.9,
  bloomThresholdDay: 1.6, bloomThresholdNight: 0.55,
  prelitSun: 1.0,              // v1 lights (massing, boats) = takram sun radiance × this
  prelitSky: 1.0,
  skyIrrFromSH: 3.5449,        // SH L0 coefficient -> irradiance (2·sqrt(pi))
  revealGlow: 2.5,
};
