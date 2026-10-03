// [ship] Debug entry for headless shots of sail mode (tools/anime/shot.mjs --entry tools/anime/debug/sail/index.html):
// the full app plus window.__sailShot(kind) which poses 第一昭福丸 (the real model when wired, else the true-size
// stand-in) and frames her with the sail chase camera. Not shipped (tools/ is outside the app bundle).
import '../../../../src/anime/main.js';
import { createSail } from '../../../../src/anime/world/explore/sail.js';
import { OUTBOUND_PATH, KANAE_CROSSING, BERTH } from '../../../../src/anime/world/ship/route.js';

let sail = null;
window.__sailShot = (kind = 'berth') => {
  const ctx = window.__ctx;
  if (!sail) sail = createSail(ctx, {});
  window.__sail = sail;
  const at = (s) => { const [x, z] = OUTBOUND_PATH.at(s), [dx, dz] = OUTBOUND_PATH.dirAt(s); return { x, z, yaw: Math.atan2(dx, dz) }; };
  if (kind === 'berth') { sail.enter({ ...BERTH, autopilot: true }); for (let i = 0; i < 40; i++) sail.update(0.05); }
  else if (kind === 'depart') { sail.enter({ ...BERTH, autopilot: true }); for (let i = 0; i < 1800; i++) sail.update(0.05); }
  else if (kind === 'kanae') { sail.enter({ ...at(KANAE_CROSSING.s - 260), u: 3.0, autopilot: true }); for (let i = 0; i < 1400; i++) sail.update(0.05); }
  const s = sail.state;
  return { x: Math.round(s.x), z: Math.round(s.z), yaw: +s.yaw.toFixed(3), kn: +s.kn.toFixed(2), tc: +s.tc.toFixed(2), s: Math.round(s.s), xte: Math.round(s.xte), events: s.events.map((e) => e.type) };
};
