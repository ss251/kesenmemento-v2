// Open Waters / aisstream vessels, as pure data. Positions are used as reported.
// Nothing here moves a ship from one sea to another: a Tokyo Bay recording stays a Tokyo Bay recording.

export const KN_TO_MS = 0.514444;
/** Kesennuma poll box, lat,lon order, as Open Waters expects it. */
export const KESEN_BBOX = Object.freeze({ lat1: 38.7, lon1: 141.45, lat2: 38.98, lon2: 141.8 });
export const OPEN_WATERS_URL = `https://ais.openwaters.io/v1/vessels?bbox=${KESEN_BBOX.lat1},${KESEN_BBOX.lon1},${KESEN_BBOX.lat2},${KESEN_BBOX.lon2}`;
const STALE_S = 600;

const num = (v) => {
  const n = +v;
  return Number.isFinite(n) ? n : null;
};

/** AIS ship type -> fishing | cargo | tanker | passenger | other. */
export function aisKind(type) {
  const t = Number(type);
  if (!Number.isFinite(t)) return 'other';
  if (t >= 30 && t <= 39) return 'fishing';
  if (t >= 60 && t <= 69) return 'passenger';
  if (t >= 70 && t <= 79) return 'cargo';
  if (t >= 80 && t <= 89) return 'tanker';
  return 'other';
}

/** One GeoJSON feature -> a vessel, or null. Coordinates stay [lon, lat] as published. */
export function vesselFromFeature(f) {
  const p = f?.properties || {};
  const c = f?.geometry?.coordinates;
  const lon = num(c?.[0]), lat = num(c?.[1]);
  const mmsi = String(p.mmsi ?? '').trim();
  if (!mmsi || lat == null || lon == null) return null;
  return {
    mmsi, name: String(p.name || '').trim() || mmsi,
    sog: num(p.sog) ?? 0, cog: num(p.cog) ?? 0,
    type: num(p.type), length: num(p.length), beam: num(p.beam),
    seen: p.seen || null, source: p.source || null, station: p.station || null,
    lat, lon, kind: aisKind(p.type),
  };
}

/** Open Waters FeatureCollection -> vessels. Does not relocate them. */
export function parseOpenWaters(geo) {
  const features = Array.isArray(geo?.features) ? geo.features : [];
  const out = [];
  for (const f of features) {
    const v = vesselFromFeature(f);
    if (v) out.push(v);
  }
  return out;
}

/** aisstream.io PositionReport message, or an AIS-catcher HTTP/UDP JSON body, or `{ vessels }`. */
export function parseAisMessage(body) {
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.vessels)) return body.vessels.map(normalizeLoose).filter(Boolean);
  if (Array.isArray(body.features)) return parseOpenWaters(body);
  if (Array.isArray(body.msgs)) {
    const out = [];
    for (const m of body.msgs) {
      const v = fromCatcherMsg(m, body.stationid);
      if (v) out.push(v);
    }
    return out;
  }
  const one = fromStream(body);
  return one ? [one] : [];
}

function normalizeLoose(v) {
  const lat = num(v?.lat ?? v?.latitude), lon = num(v?.lon ?? v?.longitude);
  const mmsi = String(v?.mmsi ?? '').trim();
  if (!mmsi || lat == null || lon == null) return null;
  return {
    mmsi, name: String(v.name || mmsi).trim(),
    sog: num(v.sog) ?? 0, cog: num(v.cog) ?? 0,
    type: num(v.type), length: num(v.length), beam: num(v.beam),
    seen: v.seen || null, source: v.source || null, station: v.station || null,
    lat, lon, kind: aisKind(v.type),
  };
}

function fromCatcherMsg(m, station) {
  const p = m?.PositionReport || m?.Message?.PositionReport || m;
  const lat = num(p?.Latitude ?? p?.latitude ?? m?.lat);
  const lon = num(p?.Longitude ?? p?.longitude ?? m?.lon);
  const mmsi = String(p?.UserID ?? m?.mmsi ?? m?.MetaData?.MMSI ?? '').trim();
  if (!mmsi || lat == null || lon == null) return null;
  const name = String(m?.MetaData?.ShipName || p?.name || m?.name || mmsi).trim();
  return {
    mmsi, name, lat, lon,
    sog: num(p?.Sog ?? p?.sog) ?? 0, cog: num(p?.Cog ?? p?.cog) ?? 0,
    type: num(p?.Type ?? p?.type ?? m?.type),
    length: num(p?.length ?? m?.length), beam: num(p?.beam ?? m?.beam),
    seen: m?.MetaData?.time_utc || m?.rxtime || null,
    source: 'receiver', station: station || m?.station || null,
    kind: aisKind(p?.Type ?? p?.type ?? m?.type),
  };
}

function fromStream(body) {
  if (body.MessageType !== 'PositionReport' && !body.Message?.PositionReport && !body.MetaData) return null;
  const v = fromCatcherMsg(body, null);
  if (!v) return null;
  v.source = 'aisstream';
  return v;
}

/** Credit lines Open Waters actually sent, for the sources present in `vessels`. Empty when there are no ships. */
export function attributionLines(vessels, map) {
  if (!vessels?.length) return [];
  const lines = [];
  const seen = new Set();
  for (const v of vessels) {
    const key = v.source || '';
    const line = (map && (map[key] || map[key.toLowerCase()])) || (key ? key : '');
    if (line && !seen.has(line)) { seen.add(line); lines.push(line); }
  }
  return lines;
}

export function packAis(vessels, { attributionMap = null, fetchedAt = null, source = 'openwaters' } = {}) {
  const list = vessels || [];
  return {
    vessels: list,
    source,
    attribution: attributionLines(list, attributionMap),
    coverage: list.length ? 'live' : 'empty',
    fetchedAt,
  };
}

/**
 * Dead reckoning from the last fix. Writes into `out` (no allocation).
 * out.ok is false when the fix is older than 10 minutes.
 * deast / dnorth are metres from the reported position. yaw is the engine's heading (bow +Z, north is −Z).
 */
export function projectVessel(v, nowMs, out) {
  const seen = v?.seen ? Date.parse(v.seen) : nowMs;
  let age = (nowMs - seen) / 1000;
  if (!Number.isFinite(age) || age < 0) age = 0;
  if (age > STALE_S) { out.ok = false; return out; }
  const cog = ((num(v.cog) ?? 0) * Math.PI) / 180;
  const ms = (num(v.sog) ?? 0) * KN_TO_MS;
  out.ok = true;
  out.age = age;
  out.deast = ms * Math.sin(cog) * age;
  out.dnorth = ms * Math.cos(cog) * age;
  out.yaw = Math.atan2(Math.sin(cog), -Math.cos(cog));
  out.sog = num(v.sog) ?? 0;
  return out;
}

/** Exponential smoothing toward a target. One number, no objects. */
export function smoothToward(cur, target, dt, tau = 1.4) {
  const k = 1 - Math.exp(-Math.max(0, dt) / tau);
  return cur + (target - cur) * k;
}

/** Hide a point that is not on water. Returns null on land. */
export function onWater(x, z, isWater) {
  if (typeof isWater === 'function' && !isWater(x, z)) return null;
  return { x, z };
}
