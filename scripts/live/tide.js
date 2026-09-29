// JMA predicted tides (潮位表) for 大船渡 (OF), the nearest JMA tide station to Kesennuma (~25 km NNE, same coast).
//   https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/{YYYY}/OF.txt   (one line per day, fixed width)
// Line layout (JMA "潮位表テキスト形式"):
//   cols  1-72  hourly heights 0..23 h, 3 chars each, cm above the tide-table datum (潮位表基準面)
//   cols 73-78  date YY MM DD (2 chars each, space padded)       cols 79-80  station code
//   cols 81-108 up to 4 high waters, each hhmm (4) + cm (3); 9999999 = none
//   cols 109-136 up to 4 low waters, same layout
// Datum: JMA's station list gives 大船渡's 潮位表基準面 = T.P. -100.0 cm (and MSL = datum +88 cm), so
// height above T.P. (the frame's y = 0) is (cm - 100) / 100 m.

export const TIDE = {
  station: "大船渡", code: "OF", datumTPcm: -100.0, msl_cm: 88.0,
  url: (year) => `https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/${year}/OF.txt`,
};

const num = (s) => { const t = s.trim(); return t === "" ? null : Number(t); };

/** One fixed-width line -> { ymd, code, hourly[24], highs[{hm, cm}], lows[...] } or null. */
export function parseTideLine(line, century = 2000) {
  if (!line || line.length < 80) return null;
  const hourly = []; for (let i = 0; i < 24; i++) hourly.push(num(line.slice(i * 3, i * 3 + 3)));
  const yy = num(line.slice(72, 74)), mm = num(line.slice(74, 76)), dd = num(line.slice(76, 78));
  if (yy == null || mm == null || dd == null || hourly.some((v) => v == null)) return null;
  const events = (from) => {
    const out = [];
    for (let k = 0; k < 4; k++) {
      const s = line.slice(from + k * 7, from + k * 7 + 7);
      if (s.length < 7 || s.slice(0, 4) === "9999") continue;
      const hh = num(s.slice(0, 2)), mi = num(s.slice(2, 4)), cm = num(s.slice(4, 7));
      if (hh == null || mi == null || cm == null || hh > 24 || mi > 59) continue;
      out.push({ hm: `${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}`, h: hh + mi / 60, cm });
    }
    return out;
  };
  return {
    ymd: `${century + yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`,
    code: line.slice(78, 80).trim(),
    hourly, highs: events(80), lows: events(108),
  };
}

export function parseTideTable(text) {
  const days = new Map();
  for (const line of String(text).split(/\r?\n/)) { const d = parseTideLine(line); if (d) days.set(d.ymd, d); }
  return days;
}

/** Height (cm above datum) at JST decimal hour h on day d, cubic (Catmull-Rom) through the hourly values. */
export function heightAt(day, h, nextDay = null) {
  const H = day.hourly, ext = nextDay?.hourly ?? [H[23] + (H[23] - H[22])];
  const at = (i) => (i < 0 ? H[0] - (H[1] - H[0]) * -i : i < 24 ? H[i] : ext[i - 24] ?? ext[ext.length - 1]);
  const i = Math.floor(h), t = h - i, p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Table + JST date/hour -> the state's tide block (v1 fields height_cm and next[], plus tp_m and the day's curve). */
export function toTideState(days, ymd, hours) {
  const day = days.get(ymd);
  if (!day) return null;
  const next = days.get(addDays(ymd, 1));
  const cm = heightAt(day, hours, next);
  const ev = [...day.highs.map((e) => ({ ...e, ymd, type: "high" })), ...day.lows.map((e) => ({ ...e, ymd, type: "low" })),
    ...(next ? [...next.highs.map((e) => ({ ...e, ymd: next.ymd, h: e.h + 24, type: "high" })), ...next.lows.map((e) => ({ ...e, ymd: next.ymd, h: e.h + 24, type: "low" }))] : [])]
    .sort((a, b) => a.h - b.h);
  const upcoming = ev.filter((e) => e.h > hours).slice(0, 2).map((e) => ({ t: `${e.ymd}T${e.hm}:00+09:00`, type: e.type, cm: e.cm }));
  const rising = heightAt(day, Math.min(23.99, hours + 0.25), next) > cm;
  return {
    source: "気象庁 潮位表（大船渡）", station: TIDE.station, code: TIDE.code, date: ymd,
    height_cm: Math.round(cm), tp_m: +((cm + TIDE.datumTPcm) / 100).toFixed(2), rising,
    next: upcoming,
    events: ev.filter((e) => e.ymd === ymd).map((e) => ({ t: `${e.ymd}T${e.hm}:00+09:00`, type: e.type, cm: e.cm })),
    hourly: day.hourly, datum: "cm above 潮位表基準面 (T.P. -1.00 m)",
  };
}
