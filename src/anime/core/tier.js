// [v4:phone] Quality tiers and the device check that forces the phone tier.
//
// iOS Safari reloads a tab ("A problem repeatedly occurred") when the page's JS heap, canvases and GPU buffers together
// pass about 1-1.5 GB, and less on older phones. The phone tier builds a smaller world (hero radius, far town, trees,
// boats, poles), caps canvas textures at 512 px, keeps atlas pages at 2048 px, and frees the CPU copy of the static
// batches once they are on the GPU. A device that looks like a phone or a tablet always gets it: the stored quality
// setting and `?q=` cannot raise it (only `?unsafe=1`, for testing), and nothing upgrades it automatically.
//
// Evaluated once at import (layout.js reads it before main.js runs). Outside a browser (bun tests, tools) it is 'high'.

export const QUALITY_NAMES = ['high', 'medium', 'low', 'phone'];

/**
 * Tier settings. `name` is what the modules test (the phone tier is a stricter 'low': every `quality.name === 'low'`
 * branch applies to it too); `tier` is the selected tier; the phone-only knobs are read with `quality.phone`.
 */
export function qualityPreset(tier, { dpr = 1, touch = false } = {}) {
  const Q = {
    high: { name: 'high', pixelRatio: Math.min(dpr, 1.5), msaa: 4, shadowMap: 4096, shadowSize: 75, petals: 1.0, heroR: 1.0 },
    medium: { name: 'medium', pixelRatio: Math.min(dpr, 1.0), msaa: 4, shadowMap: 2048, shadowSize: 60, petals: 0.6, heroR: 0.8 },
    low: { name: 'low', pixelRatio: touch ? Math.min(dpr, 1.25) : 0.75,   // [v3:fix] phones: 0.75 CSS px looked soft (292x633 on a DPR-3 phone)
      msaa: 0, shadowMap: 2048, shadowSize: 45, petals: 0.35, heroR: 0.55 },
    phone: { ...PHONE_BASE, pixelRatio: Math.min(dpr, PHONE.pixelRatio) },
  };
  return { ...(Q[tier] || Q.high), tier: Q[tier] ? tier : 'high' };
}

/** The phone tier's build limits (metres unless noted). Tested against the budgets in test/v4-phone.test.js. */
export const PHONE = {
  pixelRatio: 1.25,        // CSS px -> device px (a DPR-3 phone renders 488 x 1055 for a 390 x 844 screen)
  canvasMax: 512,          // every canvas texture (signs, facades, labels) at most 512 px on a side
  atlasPage: 2048,         // static-batch atlas pages
  heroR: 0.45,             // x the hero zone radius (380 m): Sakura-kit lots, lamps, cast paths
  farDist: 2200,           // far-town instances within this distance of the hero zone
  farSmall: 1000,          // ... and buildings under 70 m² only within this distance (high: 2000)
  tinyR: 0.25,             // static meshes smaller than this (bounding radius, m) are dropped: cans, bolts, clutter
  streetStep: [3, 8],      // asphalt drape sampling, hero / mid roads (m; high: 2 / 4)
  heroLod: [60, 160],      // kit detail 2 within 60 m of a street heart, 1 within 160 m (high: 100 / 220)
  gardens: 380,            // gardens within this distance
  poleR: 190,              // utility poles (and their wires) within this distance of the hero centre
  landuseR: 560,           // town's OSM land-use polygons within this distance of the mid centre
  treeFarKeep: 0.35,       // share of the trees beyond `treeNear2` that are kept (their crowns are painted on the ground)
  treeNear2: 650,
  treeNear: 140,           // full tree models within this distance of the camera
  maxBoats: 6,             // moored boats along the quays (low: 18, high: 64)
  rowsEvery: 5,            // the stern-to longliner rows: one boat in five
  arrivals: 4,             // today's arriving boats drawn (the next four by ETA; high: 14)
  bikes: 6,                // parked bicycles (each ~1.6 k triangles)
  terrainStep: 5,          // hero terrain grid (m; high: 3.5)
  riverStep: 8,            // river channel sampling (m; high: 4)
  streetR: 950,            // town's street surfaces within this distance of the hero centre (the map keeps every road)
  lineRange: 700,          // outline pre-pass range cap (m)
  drawMax: 2600,           // colour pass: static cells beyond this are skipped (low: 3500)
  shadowEvery: 3,          // shadow map re-rendered every n-th frame, and at once when the camera moves 3 m or the sun turns
  shadowMax: 280,          // the shadow box stops growing with altitude here (m; others: 700): 0.27 m texels on 1024²
};
const PHONE_BASE = { name: 'low', phone: true, msaa: 0, shadowMap: 1024, shadowSize: 40, shadowMax: PHONE.shadowMax, petals: 0.25, heroR: PHONE.heroR };

/**
 * Does this device look like a phone or a tablet? Touch as the primary pointer on a small screen, an iPad in desktop
 * mode (Macintosh UA with touch points), a mobile UA with touch, or navigator.deviceMemory <= 4 GB.
 * env: { coarse, maxTouchPoints, screenW, screenH, deviceMemory, ua }
 */
export function looksLikePhone(env = {}) {
  const { coarse = false, maxTouchPoints = 0, screenW = 1920, screenH = 1080, deviceMemory = null, ua = '' } = env;
  if (typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory <= 4) return true;
  const short = Math.min(screenW || 1e4, screenH || 1e4);
  const mobileUA = /iPhone|iPad|iPod|Android|Mobile|Silk|Kindle/i.test(ua);
  const iPadDesktop = /Macintosh/i.test(ua) && maxTouchPoints > 1;
  if (mobileUA && (coarse || maxTouchPoints > 0)) return true;
  if (iPadDesktop) return true;
  if (coarse && short <= 1100) return true;
  return false;
}

/**
 * The tier to run. A phone-like device is forced to 'phone' whatever was stored or asked for (unless `unsafe`);
 * elsewhere `?q=` wins over the stored choice, and the default is 'high'.
 * -> { tier, forced }
 */
export function pickTier({ param = null, stored = null, phone = false, unsafe = false } = {}) {
  if (phone && !unsafe) return { tier: 'phone', forced: true };
  const want = [param, stored].find((q) => QUALITY_NAMES.includes(q));
  return { tier: want || (phone ? 'phone' : 'high'), forced: false };
}

function browserEnv() {
  const nav = navigator, mm = (q) => { try { return matchMedia(q).matches; } catch (e) { return false; } };
  return { coarse: mm('(pointer: coarse)'), maxTouchPoints: nav.maxTouchPoints || 0, screenW: screen?.width, screenH: screen?.height, deviceMemory: nav.deviceMemory ?? null, ua: nav.userAgent || '' };
}

const IS_BROWSER = typeof window !== 'undefined' && typeof navigator !== 'undefined' && typeof Bun === 'undefined';
/** The tier of this page: { tier, forced, phone (device check), touch, quality } */
export const TIER = (() => {
  if (!IS_BROWSER) return { tier: 'high', forced: false, phone: false, touch: false, quality: qualityPreset('high') };
  const env = browserEnv();
  const params = new URLSearchParams(location.search);
  let stored = null; try { stored = localStorage.getItem('klc.q'); } catch (e) { /* private mode */ }
  const phone = looksLikePhone(env);
  const pick = pickTier({ param: params.get('q'), stored, phone, unsafe: params.get('unsafe') === '1' });
  const touch = env.coarse;
  return { ...pick, phone, touch, quality: qualityPreset(pick.tier, { dpr: devicePixelRatio || 1, touch }) };
})();
