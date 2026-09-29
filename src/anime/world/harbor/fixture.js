// [v3:harbor] Local stand-in for src/anime/world/layout.js (V3-SPEC section 3 shapes), used only when the real
// layout contract is absent. Coordinates are ENU metres (origin 38.9060 N 141.5750 E, +X east, -Z north), read from
// data/ortho/core.jpg, data/landmarks.json and src/web/scene/boats/routes.json. The foundation's layout wins.
export const __fixture = true;
export const ORIGIN = { lat: 38.9060, lon: 141.5750 };
export const ZONES = { hero: { cx: 150, cz: 0, r: 380 }, mid: { cx: 300, cz: 300, r: 1100 }, far: { x0: -6500, z0: -9300, x1: 10800, z1: 8500 } };
export const SEA = { level: 0.0 };
export function heightAt() { return 0; }
export function isWater() { return false; }
export const WATER = [];
export const QUAYS = [
  // inner bay south quay (南町 / Pier 7 frontage), fish market quay
  { a: [110, 72], b: [330, 105], top: 2.2, kind: 'promenade' },
  { a: [543.6, 589.9], b: [840.1, 1238.1], top: 2.4, kind: 'quay' },
];
export const ROADS = [];
export const LOTS = [];
export function lotFrame(lot) { return { x: lot.obb.cx, y: 0, z: lot.obb.cz, rotY: lot.front?.rotY || 0 }; }
export const POLE_RUNS = [];
export const SPOTS = {
  ukimido: { x: 339, z: -27, rotY: Math.PI * 0.95 },          // south tip of 神明崎
  isuzuTorii: { x: 322, z: -118, rotY: Math.PI },              // shore torii below the shrine (approx.)
  isuzuShrine: { x: 352, z: -85, rotY: Math.PI * 0.9 },
  pier7: { x: 34.7, z: 88.8 },
  fishMarket: { a: [543.6, 589.9], b: [840.1, 1238.1] },
  kanae: { a: [1180, 1600], b: [1810, 1330] },               // approx. crossing of the bay mouth (foundation refines)
  oshima: { a: [2640, 2900], b: [2780, 3150] },
  anbaLookout: { x: -493.6, y: 238.4, z: -990.2, rotY: Math.PI * 0.85 },
  promenade: [],
};
export const TOUR = [];
export const HERO = { drone: { pos: [-27.7, 122.2, 150.5], look: [332.9, 16.5, -210.1] }, walk: { x: 34.7, z: 88.8, yaw: 0, pitch: 0 } };
export function sunDirAt() { return [-0.85, 0.3, 0.4]; }
