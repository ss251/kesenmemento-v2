// NOAA solar position (general solar position equations, accuracy ~0.1 deg for this use).
// sunPosition(date, lat, lon) -> { azimuth (deg clockwise from north), elevation (deg, refraction-corrected) }.
// Kept inside the web package; if src/core/sun.js lands with the same signature the app can switch to it.
const rad = Math.PI / 180;

export function sunPosition(date, lat, lon) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const jc = (jd - 2451545) / 36525;
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C = Math.sin(M * rad) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * jc) + Math.sin(3 * M * rad) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * jc;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad)) / rad;
  const y = Math.tan((eps / 2) * rad) ** 2;
  const eqTime = 4 / rad * (y * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad) + 4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad)
    - 0.5 * y * y * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad));
  const utcMin = ((date.getTime() / 60000) % 1440 + 1440) % 1440;
  let tst = (utcMin + eqTime + 4 * lon) % 1440; if (tst < 0) tst += 1440;
  let ha = tst / 4 - 180; if (ha < -180) ha += 360;
  const cosZen = Math.sin(lat * rad) * Math.sin(decl * rad) + Math.cos(lat * rad) * Math.cos(decl * rad) * Math.cos(ha * rad);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen))) / rad;
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat * rad) * Math.cos(zen * rad) - Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.sin(zen * rad))))) / rad;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  const elev0 = 90 - zen;
  let refr = 0;                                               // atmospheric refraction (NOAA piecewise fit), arcsec -> deg
  if (elev0 <= 85) {
    const te = Math.tan(elev0 * rad);
    if (elev0 > 5) refr = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
    else if (elev0 > -0.575) refr = 1735 + elev0 * (-518.2 + elev0 * (103.4 + elev0 * (-12.79 + elev0 * 0.711)));
    else refr = -20.772 / te;
    refr /= 3600;
  }
  return { azimuth: az, elevation: elev0 + refr };
}

/** JST wall-clock hours (0-24, fractional) on the given JST calendar date -> Date. */
export function jstDate(ymd, hours) {
  const [Y, M, D] = ymd.split("-").map(Number);
  return new Date(Date.UTC(Y, M - 1, D, 0, 0, 0) + (hours - 9) * 3600000);
}
/** Date -> { ymd, hours } in JST. */
export function toJst(date) {
  const j = new Date(date.getTime() + 9 * 3600000);
  return { ymd: j.toISOString().slice(0, 10), hours: j.getUTCHours() + j.getUTCMinutes() / 60 + j.getUTCSeconds() / 3600 };
}

/** Afternoon JST hour at which the sun passes `elev` degrees (bisection), for the golden-hour preset. */
export function hourForElevation(ymd, lat, lon, elev, from = 12, to = 20) {
  let a = from, b = to;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (sunPosition(jstDate(ymd, m), lat, lon).elevation > elev) a = m; else b = m;
  }
  return (a + b) / 2;
}
