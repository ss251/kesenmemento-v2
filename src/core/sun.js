// Solar position for Kesennuma Living City (BUILD-SPEC §6). NOAA "general solar position" equations
// (Meeus-based, the NOAA solar calculator spreadsheet), accurate to ~0.01-0.05 deg for 1900-2100.
// Pure ES module, no dependencies: used by the browser app and by the Bun live server.
//
//   sunPosition(date, lat, lon) -> { azimuth (deg clockwise from north), elevation (deg, refraction-corrected),
//                                    elevationGeometric, declination, eqTime (min) }
//   sunTimes(ymd, lat, lon)     -> { sunrise, noon, sunset: Date, noonElevation, riseAzimuth, setAzimuth }
//   jstDate(ymd, hours) / toJst(date) — JST wall-clock helpers (Japan has no DST).
const RAD = Math.PI / 180;

function julianCentury(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  return (jd - 2451545) / 36525;
}

function solarTerms(jc) {
  const L0 = (((280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C = Math.sin(M * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * jc) + Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * jc;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const declination = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime = (4 / RAD) * (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD)
    - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  return { declination, eqTime };
}

/** Atmospheric refraction in degrees for a geometric elevation (NOAA piecewise fit). */
export function refraction(elev) {
  if (elev > 85) return 0;
  const te = Math.tan(elev * RAD);
  let r;
  if (elev > 5) r = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elev > -0.575) r = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
  else r = -20.772 / te;
  return r / 3600;
}

/** Sun position at `date` (a Date, any time zone) for latitude/longitude in degrees (east positive). */
export function sunPosition(date, lat, lon) {
  const { declination, eqTime } = solarTerms(julianCentury(date));
  const utcMin = (((date.getTime() / 60000) % 1440) + 1440) % 1440;
  const tst = (((utcMin + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  let ha = tst / 4 - 180;
  if (ha < -180) ha += 360;
  const cosZen = Math.sin(lat * RAD) * Math.sin(declination * RAD) + Math.cos(lat * RAD) * Math.cos(declination * RAD) * Math.cos(ha * RAD);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen))) / RAD;
  const den = Math.cos(lat * RAD) * Math.sin(zen * RAD);
  let az = den === 0 ? 180 : Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat * RAD) * Math.cos(zen * RAD) - Math.sin(declination * RAD)) / den))) / RAD;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  const elevationGeometric = 90 - zen;
  return { azimuth: az, elevation: elevationGeometric + refraction(elevationGeometric), elevationGeometric, declination, eqTime };
}

/** JST wall-clock hours (0-24, fractional) on the JST calendar date "YYYY-MM-DD" -> Date. */
export function jstDate(ymd, hours = 0) {
  const [Y, M, D] = ymd.split("-").map(Number);
  return new Date(Date.UTC(Y, M - 1, D) + (hours - 9) * 3600000);
}

/** Date -> { ymd, hours, hm } in JST. */
export function toJst(date) {
  const j = new Date(date.getTime() + 9 * 3600000);
  const hours = j.getUTCHours() + j.getUTCMinutes() / 60 + j.getUTCSeconds() / 3600;
  return { ymd: j.toISOString().slice(0, 10), hours, hm: j.toISOString().slice(11, 16) };
}

/** Hour (JST, fractional) in [a,b] where f(h) crosses zero, by bisection; null if no sign change. */
function bisect(f, a, b) {
  let fa = f(a);
  if (Math.sign(fa) === Math.sign(f(b))) return null;
  for (let i = 0; i < 50; i++) {
    const m = (a + b) / 2, fm = f(m);
    if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

/**
 * Sunrise / solar noon / sunset on a JST date. Rise and set follow the almanac convention (upper limb on the
 * horizon, standard refraction): geometric centre elevation = -0.833 deg, so they match NAOJ / NOAA tables.
 */
export function sunTimes(ymd, lat, lon) {
  const geo = (h) => sunPosition(jstDate(ymd, h), lat, lon).elevationGeometric + 0.833;
  // solar noon: maximum elevation, golden-section on [6,18]
  let a = 6, b = 18;
  const el = (h) => sunPosition(jstDate(ymd, h), lat, lon).elevationGeometric;
  for (let i = 0; i < 60; i++) {
    const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618;
    if (el(m1) < el(m2)) a = m1; else b = m2;
  }
  const noonH = (a + b) / 2;
  const riseH = bisect(geo, 0, noonH), setH = bisect(geo, noonH, 24);
  const at = (h) => (h == null ? null : jstDate(ymd, h));
  const noon = at(noonH), sunrise = at(riseH), sunset = at(setH);
  return {
    sunrise, noon, sunset,
    noonElevation: sunPosition(noon, lat, lon).elevation,
    riseAzimuth: sunrise ? sunPosition(sunrise, lat, lon).azimuth : null,
    setAzimuth: sunset ? sunPosition(sunset, lat, lon).azimuth : null,
  };
}

/** JST hour between `from` and `to` at which the (apparent) elevation crosses `elev` degrees; null if none. */
export function hourForElevation(ymd, lat, lon, elev, from = 12, to = 20) {
  return bisect((h) => sunPosition(jstDate(ymd, h), lat, lon).elevation - elev, from, to);
}
