// Wire shared by the Bun relay and the page. ASCII JSON only.
// A message never carries a name, a chat string, or a place outside the virtual world.
// Room codes use an alphabet a child can read aloud: no 0/O, 1/I/L, 2/Z, 5/S, 6/G, 8/B.

export const ALPHABET = 'ACDEFHJKMNPQRTUVWXY3479';
export const CODE_LEN = 4;
export const MAX_PLAYERS = 8;
export const MAX_ROOMS = 200;
export const MAX_BYTES = 512;
export const MAX_PER_SEC = 30;
export const IDLE_MS = 10 * 60 * 1000;
export const RELAY_HZ = 15;
export const RELAY_MS = 1000 / RELAY_HZ;
export const STAMP_COUNT = 4;
export const STAMP_GAP_MS = 1200;
/** Server stamps GO this far ahead, so a late packet still shows 「3」 and every client hits GO together. */
export const COUNT_LEAD_MS = 2560;
export const FINISH_MAX_MS = 30 * 60 * 1000;
export const COURSES = ['car', 'race'];

/** Real fish. ホヤ is not a fish and is not in this list. */
export const FISH = ['saba', 'iwashi', 'katsuo', 'sanma'];

/** Traditional colours (和色). The id is what the wire carries; the page speaks the colour in words. */
export const COLORS = [
  { id: 'ao', hex: '#165E83' }, // 藍色
  { id: 'kon', hex: '#223A70' }, // 紺色
  { id: 'mizu', hex: '#00A3AF' }, // 浅葱色
  { id: 'ki', hex: '#F8B500' }, // 山吹色
  { id: 'aka', hex: '#B7282E' }, // 茜色
  { id: 'momo', hex: '#F19072' }, // 東雲色
  { id: 'sumi', hex: '#595857' }, // 墨
  { id: 'sora', hex: '#89C3EB' }, // 勿忘草色
];

export const MODES = ['avatar', 'car', 'boat', 'gull', 'fish'];
export const MODE_CHAR = { avatar: 'a', car: 'c', boat: 'b', gull: 'g', fish: 'f' };
export const CHAR_MODE = { a: 'avatar', c: 'car', b: 'boat', g: 'gull', f: 'fish' };

export const DEFAULT_ORIGINS = [
  'https://kesenmemento.com',
  'https://www.kesenmemento.com',
  'https://kesennuma-living-city-production.up.railway.app',
];

const FORBIDDEN = /^(name|text|chat|msg|message|nick|lat|lon|lng|gps|email|user|username)$/i;
const WORLD_CM = 2_000_000;
const Y_LO = -10_000;
const Y_HI = 80_000;

export function utf8len(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

export function codeOk(s) {
  if (typeof s !== 'string' || s.length !== CODE_LEN) return false;
  for (let i = 0; i < CODE_LEN; i++) if (ALPHABET.indexOf(s[i]) < 0) return false;
  return true;
}

export function normCode(s) {
  if (typeof s !== 'string') return '';
  return s.trim().toUpperCase();
}

export function courseOk(c) {
  return c === 'car' || c === 'race';
}

function radToCenti(r) {
  if (typeof r !== 'number' || !Number.isFinite(r)) return null;
  let d = Math.round(r * 180 / Math.PI * 100);
  d = ((d + 18000) % 36000 + 36000) % 36000 - 18000;
  return d;
}

function centiToRad(c) {
  if (typeof c !== 'number' || !Number.isInteger(c) || c < -18000 || c > 18000) return null;
  return c * Math.PI / 180 / 100;
}

/** Metres and radians in, a fixed 8-tuple out. Null when the pose is not of this world. */
export function packPose(pose) {
  if (!pose) return null;
  const m = MODE_CHAR[pose.mode];
  if (!m) return null;
  const x = Math.round(Number(pose.x) * 100);
  const y = Math.round(Number(pose.y) * 100);
  const z = Math.round(Number(pose.z) * 100);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  if (Math.abs(x) > WORLD_CM || Math.abs(z) > WORLD_CM || y < Y_LO || y > Y_HI) return null;
  const w = radToCenti(Number(pose.yaw));
  const p = radToCenti(Number(pose.pitch) || 0);
  const l = radToCenti(Number(pose.look) || 0);
  if (w == null || p == null || l == null) return null;
  let v = pose.vehicle | 0;
  if (v < 0 || v > 15) v = 0;
  return [m, x, y, z, w, p, v, l];
}

/** The 8-tuple back into metres and radians. Null if any field is off the wire. */
export function unpackPose(d) {
  if (!Array.isArray(d) || d.length !== 8) return null;
  const mode = CHAR_MODE[d[0]];
  if (!mode) return null;
  const x = d[1], y = d[2], z = d[3];
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return null;
  if (Math.abs(x) > WORLD_CM || Math.abs(z) > WORLD_CM || y < Y_LO || y > Y_HI) return null;
  const yaw = centiToRad(d[4]), pitch = centiToRad(d[5]), look = centiToRad(d[7]);
  if (yaw == null || pitch == null || look == null) return null;
  const v = d[6];
  if (!Number.isInteger(v) || v < 0 || v > 15) return null;
  return { mode, x: x / 100, y: y / 100, z: z / 100, yaw, pitch, vehicle: v, look };
}

export function encode(obj) {
  const s = JSON.stringify(obj);
  if (utf8len(s) > MAX_BYTES) return null;
  return s;
}

export function decode(raw) {
  if (typeof raw !== 'string' || utf8len(raw) > MAX_BYTES) return { error: 'size' };
  let msg;
  try { msg = JSON.parse(raw); } catch { return { error: 'bad' }; }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return { error: 'bad' };
  for (const k in msg) if (FORBIDDEN.test(k)) return { error: 'forbidden' };
  return { msg };
}
