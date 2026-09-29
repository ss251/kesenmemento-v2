// Sun and moon for the day (JST). The sun reuses the web app's NOAA solution (src/web/lib/solar.js) so the server,
// the slider and the renderer agree; the moon uses astronomy-engine (already a dependency of @takram/three-atmosphere).
import * as A from "astronomy-engine";
import { sunPosition, jstDate } from "../../src/web/lib/solar.js";
import { LAT0, LON0 } from "../../src/core/geo.js";

/** JST hour in [from, to] at which the sun crosses `elev` degrees, rising (dir +1) or setting (dir -1). */
export function crossing(ymd, elev, dir, from, to, lat = LAT0, lon = LON0) {
  const f = (h) => sunPosition(jstDate(ymd, h), lat, lon).elevation - elev;
  let a = from, b = to;
  if (Math.sign(f(a)) === Math.sign(f(b))) return null;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if ((f(m) > 0) === (dir > 0)) b = m; else a = m; }
  return (a + b) / 2;
}

export function sunTimes(ymd, lat = LAT0, lon = LON0) {
  const r = (e, d, a, b) => crossing(ymd, e, d, a, b, lat, lon);
  return {
    dawn: r(-6, 1, 2, 12), sunrise: r(-0.833, 1, 2, 12), goldenMorningEnd: r(8, 1, 2, 12),
    goldenEveningStart: r(8, -1, 12, 22), sunset: r(-0.833, -1, 12, 22), dusk: r(-6, -1, 12, 22), night: r(-12, -1, 12, 23.9),
  };
}

const toJstHours = (date, ymd) => {
  if (!date) return null;
  const ms = (date.date ?? date).getTime() - jstDate(ymd, 0).getTime();
  return +(ms / 3600000).toFixed(3);
};

/** Moon for the JST day: phase angle (0 new, 180 full), illuminated fraction, rise/set hours (JST, may be <0 or >24). */
export function moonInfo(ymd, hours = 21, lat = LAT0, lon = LON0) {
  const obs = new A.Observer(lat, lon, 0);
  const t = jstDate(ymd, hours), t0 = jstDate(ymd, 0);
  const phase = A.MoonPhase(t), ill = A.Illumination(A.Body.Moon, t);
  const rise = A.SearchRiseSet(A.Body.Moon, obs, +1, t0, 1), set = A.SearchRiseSet(A.Body.Moon, obs, -1, t0, 1);
  const eq = A.Equator(A.Body.Moon, t, obs, true, true), hor = A.Horizon(t, obs, eq.ra, eq.dec, "normal");
  const name = phase < 22.5 || phase >= 337.5 ? "new" : phase < 67.5 ? "waxing-crescent" : phase < 112.5 ? "first-quarter" : phase < 157.5 ? "waxing-gibbous"
    : phase < 202.5 ? "full" : phase < 247.5 ? "waning-gibbous" : phase < 292.5 ? "last-quarter" : "waning-crescent";
  return { phase: +phase.toFixed(1), illum: +ill.phase_fraction.toFixed(3), name, rise: toJstHours(rise, ymd), set: toJstHours(set, ymd),
    at: { hours, azimuth: +hor.azimuth.toFixed(1), elevation: +hor.altitude.toFixed(1) } };
}

export function skyState(ymd, hours) {
  const sp = sunPosition(jstDate(ymd, hours), LAT0, LON0);
  return { sun: { azimuth: +sp.azimuth.toFixed(1), elevation: +sp.elevation.toFixed(1), ...roundAll(sunTimes(ymd)) }, moon: moonInfo(ymd, hours) };
}
const roundAll = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? null : +v.toFixed(3)]));
