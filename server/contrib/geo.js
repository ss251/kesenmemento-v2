// Contributor backend: the app's local ENU frame (docs/ARCHITECTURE.md, src/core/geo.js).
//
//   x = east  = (lon - 141.5750) * 86744
//   z = south = -(lat - 38.9060) * 111014        (the app's +z points SOUTH)
//
// The service is deployable on its own, so the three constants are repeated here instead of importing
// src/core/geo.js; test/contrib-geo.test.js asserts the two stay identical.

export const LAT0 = 38.906;
export const LON0 = 141.575;
export const M_PER_DEG_LON = 86744;
export const M_PER_DEG_LAT = 111014;

/**
 * Geographic position to the app's ENU metres.
 * @param {number} lat degrees north
 * @param {number} lon degrees east
 * @returns {{x: number, z: number}}
 */
export function latLonToEnu(lat, lon) {
  return { x: (lon - LON0) * M_PER_DEG_LON, z: -(lat - LAT0) * M_PER_DEG_LAT };
}

/**
 * Inverse of latLonToEnu.
 * @param {number} x metres east of the origin
 * @param {number} z metres south of the origin
 * @returns {{lat: number, lon: number}}
 */
export function enuToLatLon(x, z) {
  return { lat: LAT0 - z / M_PER_DEG_LAT, lon: x / M_PER_DEG_LON + LON0 };
}

/** True for a finite WGS84 position (and not the (0, 0) "null island" that cameras write when they have no fix). */
export function isUsableLatLon(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
}

/** Ground distance in metres between two ENU points (x, z). */
export function enuDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** The GSI (Geospatial Information Authority of Japan) map link for a position. */
export function gsiUrl(lat, lon, zoom = 18) {
  return `https://maps.gsi.go.jp/#${zoom}/${Number(lat).toFixed(6)}/${Number(lon).toFixed(6)}/`;
}
