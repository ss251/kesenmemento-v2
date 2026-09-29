// [v3:foundation] Solar position for Kesennuma (NOAA general solar position equations).
export const LAT = 38.906, LON = 141.575, TZ = 9;
const D2R = Math.PI / 180;

/** Day of year (1..366) for a Date (local calendar of that date). */
export function dayOfYear(d = new Date()) { const s = Date.UTC(d.getFullYear(), 0, 0); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - s) / 86400000); }

/** { az (deg from north, clockwise), el (deg), dir: [x,y,z] unit vector TO the sun in ENU (+X east, +Y up, -Z north) }. */
export function sunPosition(hoursJST, doy = 274, lat = LAT, lon = LON) {
  const g = 2 * Math.PI / 365 * (doy - 1 + (hoursJST - TZ - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hoursJST * 60 + eqt + 4 * lon - 60 * TZ;
  const ha = (tst / 4 - 180) * D2R, phi = lat * D2R;
  const cz = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const el = Math.asin(Math.max(-1, Math.min(1, cz)));
  let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
  az = ((az % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const ce = Math.cos(el);
  return { az: az / D2R, el: el / D2R, dir: [Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce] };
}

/** Direction TO the sun ([x,y,z], unit) at JST hours on a day of year. */
export function sunDirAt(hoursJST, doy = 274) { return sunPosition(hoursJST, doy).dir; }
