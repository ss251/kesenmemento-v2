// [v3:harbor] Arriving boats: today's 気仙沼漁協 入船情報 (life's ctx.services.arrivals, or any list passed to
// setArrivals) glide in from the bay mouth along water-only routes, berth at the fish market, unload for a few hours
// and leave. Each boat carries a floating label with the real vessel name, its catch and the ETA (サンプル when the
// list is the saved sample, V3-SPEC 4 "live").
//
//   const A = createArrivals(ctx, { avoid })       // built by buildHarbor; ctx.services.harbor.setArrivals = A.setArrivals
//   A.setArrivals(list, { sample })   list: [{ vessel, time: 'HH:MM', h?, type?, kind?, catch?, kg? }]
//   A.state()                          [{ vessel, type, phase: 'sea'|'approach'|'berthed'|'gone', x, z, slot, eta }]
//
// Timing is a pure function of the time of day (ctx.sky.hours) plus a gentle drift with sim time (x RATE), so a frozen
// time preset still shows boats moving at a harbour pace, and screenshots/films stay deterministic.
// Routes: src/web/scene/boats/routes.json (built from the GSI DEM + coastline with >= 30 m clearance; re-checked here
// against the anime water mask L.isWater, every 5 m).
import * as THREE from 'three';
import ROUTES from '../../../web/scene/boats/routes.json';
import { buildBoat, BOAT_SPECS } from './boats.js';
import { batchStatic } from '../../core/batch2.js';
import { FONT } from './util.js';

export const RATE = 4;              // arrival clock seconds per sim second while a time preset is held
export const SPEED = 1.6;           // m/s on the arrival clock (≈ 3 knots in the harbour; ×RATE on screen)
export const APPROACH = 3600;       // metres of route shown before the berth
export const DWELL = 3.0;           // minimum hours berthed (unloading) after the ETA
/** [v3:fix] a boat that came in today stays at the market quay for the rest of the day (the harbour was empty by 16:30). */
export const dwellFor = (h) => Math.max(DWELL, 24 - h);
const EASE = 70;                    // seconds (arrival clock) of deceleration into the berth
const QGAP = 220 / SPEED / 3600;    // hours between berthings: ~220 m of channel between arriving hulls

/** Arrival slots at the market quay (routes.json berths): inner row first, then rafted outside. */
export const SLOT_ORDER = [[0, 142], [0, 286], [0, 430], [0, 574], [1, 142], [1, 286], [1, 430], [1, 574], [0, 646], [1, 646]];
export function arrivalSlots() {
  const by = new Map(ROUTES.berths.map((b) => [`${b.row}|${b.s}`, b]));
  return SLOT_ORDER.map(([row, s]) => by.get(`${row}|${s}`)).filter(Boolean);
}
/** Circles [x, z, r] the static market boats must keep clear of (inner-row arrival slots). */
export function slotAvoid() { return arrivalSlots().filter((b) => b.row === 0).map((b) => [b.pos[0], b.pos[1], 40]); }

export function boatTypeFor(a) {
  const k = `${a.kind || ''} ${a.typeEn || ''} ${a.type || ''}`;
  if (/pole|一本釣|かつお|skipjack/i.test(k)) return 'katsuo';
  if (/saury|さんま|棒受/i.test(k)) return 'sanma';
  if (/small|coastal|定置|小型/i.test(k)) return 'small';
  return 'maguro';   // longline / seine / trawl: the long white working hull reads right
}
export function etaHours(a) {
  if (Number.isFinite(a.h)) return a.h;
  const m = String(a.time || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
}

// ---------------------------------------------------------------------------------------------- routes
function polyline(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = acc[acc.length - 1];
  const at = (s) => {
    s = Math.max(0, Math.min(len, s));
    let lo = 0, hi = acc.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acc[m] <= s) lo = m; else hi = m; }
    const t = (s - acc[lo]) / Math.max(1e-6, acc[hi] - acc[lo]);
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
  };
  return { pts, len, at };
}
/** The route for one berth: the bay-mouth channel then the berth leg. Checked against isWater every 5 m. */
export function routeFor(berth, isWater = () => true) {
  const pts = ROUTES.main.map((p) => [p[0], p[1]]);
  for (const p of berth.leg) { const q = pts[pts.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5) pts.push([p[0], p[1]]); }
  const end = pts[pts.length - 1];
  if (Math.hypot(berth.pos[0] - end[0], berth.pos[1] - end[1]) > 0.5) pts.push([berth.pos[0], berth.pos[1]]);
  const P = polyline(pts);
  let dry = 0;
  for (let s = 0; s <= P.len; s += 5) { const [x, z] = P.at(s); if (!isWater(x, z)) dry++; }
  return { ...P, dry, heading: berth.heading, berth };
}

// ---------------------------------------------------------------------------------------------- visuals
export function wakeTexture(ctx) {   // [v3:polish] shared with traffic.js (the inner bay's working boats)
  return ctx.tex.draw(256, 512, (g) => {
    g.clearRect(0, 0, 256, 512);
    // painted V wake: two broken foam arms + a churned centre streak, fading aft. t = 0 at the stern: canvas bottom,
    // which lands at local +Z (toward the hull) once the plane is laid flat.
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 220; i++) {
      const t = i / 220, y = 506 - t * 500, spread = 14 + t * 104, a = (1 - t) ** 1.6;
      for (const s of [-1, 1]) {
        if (rnd() < 0.18 + t * 0.4) continue;                      // broken, painterly arms
        g.fillStyle = `rgba(244,248,246,${(0.8 * a).toFixed(3)})`;
        g.beginPath(); g.ellipse(128 + s * (spread + (rnd() - 0.5) * 6), y, 9 * (1 - t * 0.4), 3.4, s * 0.42, 0, 7); g.fill();
        if (rnd() < 0.35) { g.beginPath(); g.ellipse(128 + s * (spread - 8 - rnd() * 10), y + 3, 4, 2, s * 0.4, 0, 7); g.fill(); }
      }
      if (t < 0.55) { g.fillStyle = `rgba(244,248,246,${(0.55 * a * (1 - t * 1.6)).toFixed(3)})`; g.beginPath(); g.ellipse(128 + Math.sin(i * 0.9) * 7, y, 16 * (1 - t), 5, 0, 0, 7); g.fill(); }
    }
  }, { key: 'harbor-wake' });
}

function labelTexture(ctx, a, sample) {
  const name = a.vessel;
  const eta = a.time || '';
  const what = [a.catch, a.kg ? `${a.kg >= 1000 ? Math.round(a.kg / 100) / 10 + 't' : a.kg + 'kg'}` : null].filter(Boolean).join(' ');
  return ctx.tex.draw(512, 160, (g) => {
    g.clearRect(0, 0, 512, 160);
    const r = 26, x0 = 8, y0 = 8, w = 496, h = 118;
    g.fillStyle = 'rgba(31,42,68,0.86)';
    g.beginPath(); g.moveTo(x0 + r, y0); g.arcTo(x0 + w, y0, x0 + w, y0 + h, r); g.arcTo(x0 + w, y0 + h, x0, y0 + h, r); g.arcTo(x0, y0 + h, x0, y0, r); g.arcTo(x0, y0, x0 + w, y0, r); g.closePath(); g.fill();
    // pointer
    g.beginPath(); g.moveTo(236, y0 + h); g.lineTo(256, 152); g.lineTo(276, y0 + h); g.closePath(); g.fill();
    g.fillStyle = '#ff7a4a'; g.beginPath(); g.arc(44, 50, 9, 0, 7); g.fill();
    g.fillStyle = '#f7f2e6'; g.textBaseline = 'middle';
    g.font = `900 46px ${FONT.serif}`; g.fillText(name, 66, 52, 300);
    g.font = `700 26px ${FONT.sans}`; g.fillStyle = '#ffd9a0';
    g.fillText(`入港 ${eta}${what ? '　' + what : ''}`, 30, 102, 452);
    if (sample) {
      g.fillStyle = '#f2c23a'; g.beginPath(); g.roundRect ? g.roundRect(390, 28, 100, 40, 12) : g.rect(390, 28, 100, 40); g.fill();
      g.fillStyle = '#2b2a33'; g.font = `800 24px ${FONT.sans}`; g.fillText('サンプル', 395, 49, 92);
    }
  }, { key: `harbor-label|${name}|${eta}|${what}|${sample ? 1 : 0}` });
}

/**
 * Pure schedule: slots assigned greedily by ETA (inner row first, rafted outside only alongside a berthed boat), berth
 * times queued QGAP apart on the shared channel; a slot is free again once its boat has left (berth + DWELL).
 * Returns [{ a, h (berth hour), si (slot index) }]; boats that find no free berth are skipped.
 */
export function planArrivals(list, slots = arrivalSlots()) {
  const busy = slots.map(() => -Infinity);
  const out = [];
  for (const a of list) {
    const h = etaHours(a); if (h == null) continue;
    // queue on the shared channel: berth times at least QGAP apart so hulls never overlap on the way in
    const he = Math.max(h, (out.length ? out[out.length - 1].h : -Infinity) + QGAP);
    const free = (i) => busy[i] <= he - 0.9;
    // inner row first; the outer (rafted) row only alongside a boat that is berthed then
    let si = slots.findIndex((b, i) => b.row === 0 && free(i));
    if (si < 0) si = slots.findIndex((b, i) => b.row === 1 && free(i) && busy[slots.findIndex((c) => c.row === 0 && c.s === b.s)] > he);
    if (si < 0) si = slots.findIndex((b, i) => free(i));
    if (si < 0) continue;                                   // more boats than berths at once: skip (never overlap)
    busy[si] = he + dwellFor(he);   // [v3:fix]
    out.push({ a, h: he, si });
  }
  return out;
}

// [ship] Yield to 第一昭福丸 under way (explore/sail.js publishes ctx.services.sail). Pure; returns the number of boats
// holding. An arriving boat holds its position (its schedule slips by the time it waited, `delay` seconds on the
// arrival clock, so it resumes from where it stopped once she has passed) when it is
//   - within YIELD_R of her, or
//   - in her swept lane ahead or abeam (|lateral| < her half-beam + its half-beam + YIELD_LANE.extra, up to
//     YIELD_LANE.ahead metres ahead), measured on her route (`path`, sail's OUTBOUND) while she is on it, else on her
//     heading.
// A boat in her lane also eases aside (`offT`, metres to its own starboard, COLREG rule 14: both keep to starboard and
// pass port to port) by up to YIELD_LANE.shift m, far enough to clear the lane, onto water at least YIELD_LANE.shore m
// from the shore at its bow, midship and stern; if its starboard side has no room, it tries its port side. The offset
// is chosen once per encounter (latched) from the boat's un-offset route position (bx, bz), and released (eased back
// to 0 by update()) once she is past. Boats keep the pure stop when they are clear of her lane.
export const YIELD_R = 120;   // [ship]
export const YIELD_LANE = { ahead: 400, extra: 10, shift: 25, minShift: 6, shore: 10, ease: 4 };   // [ship] ease: m/s
const SHIP_HALF = { L: 58.6 / 2, B: 9.2 / 2 };   // [ship] 第一昭福丸 (ship/route.js SHIP_DIMS)
export function yieldHold(boats, ship, dt, { radius = YIELD_R, rate = RATE, path = null, shoreDist = null, lane = YIELD_LANE, half = SHIP_HALF } = {}) {   // [ship]
  let n = 0;
  const onRoute = !!(ship && path && Number.isFinite(ship.s) && !(ship.xte > 30));
  // her frame for a point: { along (m ahead of her midship), lat (m to her port) }
  const frame = (x, z) => {
    if (onRoute) { const q = path.project(x, z, Math.max(0, ship.s - 200), ship.s + lane.ahead + 100); return { along: q.s - ship.s, lat: q.d * (q.side || 1) }; }
    const sy = Math.sin(ship.yaw || 0), cy = Math.cos(ship.yaw || 0), dx = x - ship.x, dz = z - ship.z;
    return { along: dx * sy + dz * cy, lat: dx * cy - dz * sy };
  };
  for (const b of boats) {
    if (!ship || b.phase !== 'approach') { b.yielding = false; b.inLane = false; b.offT = 0; b.shift = null; continue; }
    const bx = b.bx ?? b.x, bz = b.bz ?? b.z, hb = (b.S?.B ?? 9) / 2, hl = (b.S?.L ?? 50) / 2;
    const f = frame(bx, bz), laneHalf = half.B + hb + lane.extra;
    const inLane = Math.abs(f.lat) < laneHalf && f.along > -(half.L + hl + 5) && f.along < lane.ahead;
    const hold = inLane || Math.hypot(b.x - ship.x, b.z - ship.z) < radius;
    b.yielding = hold; b.inLane = inLane;
    if (hold) { b.delay = (b.delay || 0) + dt * rate; n++; }
    if (!inLane) { b.offT = 0; b.shift = null; continue; }
    if (b.shift == null) b.shift = chooseShift(b, bx, bz, frame, laneHalf, lane, shoreDist);
    b.offT = b.shift;
  }
  return n;
}
/** The smallest-sufficient sidestep (m, + = the boat's starboard) that leaves her lane on water; 0 if none fits. */
function chooseShift(b, bx, bz, frame, laneHalf, lane, shoreDist) {   // [ship]
  const yaw = b.yaw ?? 0, sx = -Math.cos(yaw), sz = Math.sin(yaw);   // starboard of a heading (sin yaw, cos yaw)
  const fx = Math.sin(yaw), fz = Math.cos(yaw), hl = (b.S?.L ?? 50) / 2;
  const wet = (x, z) => !shoreDist || [-hl, 0, hl].every((k) => shoreDist(x + fx * k, z + fz * k) >= lane.shore);
  let fallback = 0;
  for (const side of [1, -1]) {
    for (let o = lane.minShift; o <= lane.shift + 1e-9; o += 1) {
      const x = bx + sx * side * o, z = bz + sz * side * o;
      if (!wet(x, z)) break;   // further out on this side is the shore
      if (side === 1) fallback = o;
      if (Math.abs(frame(x, z).lat) >= laneHalf + 2) return side * Math.min(lane.shift, o + 4);   // a few metres spare
    }
  }
  return fallback;   // no room to clear the lane: as far to starboard as the water allows (and it holds)
}

// [v3:fix] stills hide the floating name labels (a UI element, and the fixture's サンプル tag floated over the market
// hero frame): URL ?labels=0 or window.__klcLabels = false
let _labelsParam = null;
const LABELS_ON = () => {
  if (typeof window === 'undefined') return true;
  if (window.__klcLabels === false) return false;
  if (_labelsParam === null) { try { _labelsParam = new URLSearchParams(window.location.search).get('labels') !== '0'; } catch (e) { _labelsParam = true; } }
  return _labelsParam;
};
// ---------------------------------------------------------------------------------------------- the system
export function createArrivals(ctx, opts = {}) {
  const L = ctx.L;
  const isWater = opts.isWater || L?.isWater || (() => true);
  const slots = arrivalSlots();
  const routes = new Map();                                  // slot index -> route
  const routeOf = (i) => { if (!routes.has(i)) routes.set(i, routeFor(slots[i], isWater)); return routes.get(i); };
  let boats = [];                                            // live arriving boats
  let listSig = '';
  const clock = { lastH: null, t0: 0 };
  const stats = { boats: 0, dryRoutePts: 0, built: 0, ms: 0 };

  function hoursNow() { return ctx.sky?.hours ?? ctx.services?.time?.hours ?? 16.5; }

  function clear() {
    for (const b of boats) { b.carrier.parent?.remove(b.carrier); b.label?.parent?.remove(b.label); b.handle?.setOn?.(0); }
    boats = [];
  }

  const assign = (list) => planArrivals(list, slots);

  function setArrivals(list = [], o = {}) {
    const t0 = performance.now();
    const sample = !!o.sample;
    const sorted = (list || []).filter((a) => a && a.vessel).slice().sort((p, q) => (etaHours(p) ?? 99) - (etaHours(q) ?? 99)).slice(0, opts.max ?? 14);
    const sig = JSON.stringify(sorted.map((a) => [a.vessel, a.time, a.kind, a.catch, a.kg])) + sample;
    if (sig === listSig) return api;
    listSig = sig;
    clear();
    const wakeTex = wakeTexture(ctx);
    for (const { a, h, si } of assign(sorted)) {
      const type = boatTypeFor(a), S = BOAT_SPECS[type];
      const route = routeOf(si);
      stats.dryRoutePts = Math.max(stats.dryRoutePts, route.dry);
      const b = buildBoat(ctx, type, { x: 0, y: 0, z: 0, rotY: 0 }, { seed: `arrival|${a.vessel}`, name: a.vessel, dynamic: true, flags: type === 'katsuo', deck: '#6aa58a' });
      // one boat = a handful of draw calls: merge its meshes by material in boat-local space
      b.group.updateMatrixWorld(true);
      try { batchStatic(b.group, { mat: ctx.mat, nearCell: 4000, farCell: 4000, farR: 1e9 }); } catch (e) { /* unbatched still renders */ }
      b.group.traverse((o2) => { o2.userData.dynamic = true; o2.matrixAutoUpdate = true; });
      // distance LOD: beyond ~420 m only the merged cel body draws (names, glass, lamps, flags are sub-pixel there;
      // the life registry's glow sprites carry the night lights at any distance)
      const detail = [];
      b.group.traverse((o2) => { if (!o2.isMesh || o2 === b.group) return; const m = o2.material; const body = m && m.isMeshToonMaterial && m.vertexColors && !m.map && !m.transparent; if (!body) { detail.push(o2); o2.castShadow = false; if (m?.map || m?.transparent) ctx.noOutline(o2); } });
      // carrier: position + heading only (the wake rides on it, flat on the water); the hull pitches and rolls inside
      const carrier = new THREE.Group(); carrier.name = 'arrival:' + a.vessel; ctx.add(carrier); carrier.add(b.group);
      // wake (local +Z = bow; the wake trails toward -Z)
      const wakeMat = new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, depthWrite: false, opacity: 0, toneMapped: false, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const wl = S.L * 1.9, ww = S.B * 3.6;
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(ww, wl).rotateX(-Math.PI / 2), wakeMat);
      wake.position.set(0, 0.06, -S.L * 0.36 - wl / 2); wake.renderOrder = 2; wake.name = 'wake';
      ctx.noOutline(wake); carrier.add(wake);
      // label
      const lm = new THREE.SpriteMaterial({ map: labelTexture(ctx, a, sample), transparent: true, depthWrite: false, toneMapped: false, sizeAttenuation: false });
      const label = new THREE.Sprite(lm); label.center.set(0.5, 0); label.scale.set(0.2, 0.0625, 1); label.renderOrder = 20; label.name = 'arrival-label';
      ctx.noOutline(label); ctx.add(label);
      boats.push({ a, h, si, type, S, route, carrier, group: b.group, wake, label, detail, lod: true, handle: b.anchors.lightHandle, air: (b.dims.air || 14) + 6, phase: 'sea', x: 0, z: 0 });
    }
    stats.boats = boats.length; stats.built += boats.length; stats.ms = Math.round(performance.now() - t0);
    clock.lastH = null;
    update(0, lastT);
    return api;
  }

  const _q = new THREE.Vector3();
  let lastT = 0;
  function update(dt, t) {
    lastT = t;
    const H = hoursNow();
    if (clock.lastH == null || Math.abs(H - clock.lastH) > 1e-5) { clock.lastH = H; clock.t0 = t; }
    const A0 = H + ((t - clock.t0) * RATE) / 3600;            // the arrival clock (hours)   // [ship] A0: per boat A below
    const cam = ctx.camera?.position;
    for (const b of boats) {
      const A = A0 - (b.delay || 0) / 3600;                  // [ship] this boat's clock, less the time it held for the ship
      const tau = (b.h - A) * 3600;                          // seconds until berthed
      const R = b.route;
      let phase, dist;                                        // dist = metres still to go
      const dw = dwellFor(b.h);   // [v3:fix] berthed until the end of the day
      if (A > b.h + dw || A < b.h - (Math.min(APPROACH, R.len) + (SPEED * EASE) / 2) / SPEED / 3600) phase = A > b.h + dw ? 'gone' : 'sea';
      else if (tau > 0) { phase = 'approach'; dist = tau > EASE ? SPEED * (tau - EASE / 2) : (SPEED * tau * tau) / (2 * EASE); }
      else { phase = 'berthed'; dist = 0; }
      b.phase = phase;
      const vis = phase === 'approach' || phase === 'berthed';
      b.carrier.visible = vis; b.handle?.setOn?.(vis ? 1 : 0);
      if (!vis) { b.label.visible = false; b.off = b.offT = 0; continue; }   // [ship] b.off: never aside off screen
      const s = R.len - dist;
      const [x, z] = R.at(s);
      const [xa, za] = R.at(s + 14), [xb, zb] = R.at(s - 14);
      let yaw = Math.atan2(xa - xb, za - zb);
      if (dist < 40) { const k = 1 - dist / 40; let d = R.heading - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * k * k * (3 - 2 * k); }
      const speed = phase === 'approach' ? Math.min(1, dist / (SPEED * EASE)) : 0;
      // [ship] the sidestep for 第一昭福丸 (yieldHold sets offT): eased, along the boat's own starboard
      b.bx = x; b.bz = z; b.yaw = yaw;
      if (phase !== 'approach') b.offT = 0;
      const E = YIELD_LANE.ease * Math.max(0, Math.min(dt || 0, 0.25)) * RATE;   // [ship]
      b.off = (b.off || 0) + Math.max(-E, Math.min(E, (b.offT || 0) - (b.off || 0)));   // [ship]
      const xo = x - Math.cos(yaw) * b.off, zo = z + Math.sin(yaw) * b.off;   // [ship]
      b.carrier.position.set(xo, L?.SEA?.level ?? 0, zo); b.carrier.rotation.set(0, yaw, 0);
      b.group.rotation.set(Math.sin(t * 0.7 + b.si) * 0.006, 0, Math.sin(t * 0.9 + b.si * 2) * 0.02 * (0.4 + speed));
      b.group.position.y = Math.sin(t * 1.1 + b.si) * 0.06;
      b.wake.material.opacity = 0.85 * speed;
      b.wake.visible = speed > 0.02;
      b.x = xo; b.z = zo;   // [ship]
      // label: above the mast, hidden when very far or right on top of the camera
      _q.set(xo, b.air, zo);   // [ship]
      const d = cam ? cam.distanceTo(_q) : 100;
      const near = d < 420;
      if (near !== b.lod) { b.lod = near; for (const o2 of b.detail) o2.visible = near; }
      // approaching boats are always named; berthed ones only up close (no clutter over the market from high up)
      const far = phase === 'approach' ? 4200 : 900;
      // [v3:fix] the name label follows a boat in and through its first two hours at the quay (boats now stay all day)
      b.label.visible = LABELS_ON() && d > 18 && d < far && (phase === 'approach' || A < b.h + 2.0);   // [v3:fix] off in stills (?labels=0)
      b.label.position.copy(_q);
      b.label.position.y += (b.route.berth.row === 1 ? 9 : 0) * Math.min(1, d / 300);
      b.label.material.opacity = Math.min(1, (far - d) / 300) * Math.min(1, (d - 18) / 30);
    }
    // [ship] boats near the sailing ship hold position next frame (their own clock stops)
    const sail = ctx.services?.sail;
    yieldHold(boats, sail?.active ? sail.state : null, Math.max(0, Math.min(dt || 0, 0.25)), { path: sail?.path || null, shoreDist: L?.shoreDist || null });   // [ship]
    declutter();
  }

  // screen-space declutter: a label that would overlap a nearer one hides (both boats stay visible)
  const _p = new THREE.Vector3();
  function declutter() {
    const cam = ctx.camera; if (!cam) return;
    const shown = boats.filter((b) => b.label.visible).map((b) => { _p.copy(b.label.position).project(cam); return { b, x: _p.x, y: _p.y, d: cam.position.distanceTo(b.label.position) }; }).sort((p, q) => p.d - q.d);
    const kept = [];
    for (const s of shown) { if (kept.some((k) => Math.abs(k.x - s.x) < 0.32 && Math.abs(k.y - s.y) < 0.2)) s.b.label.visible = false; else kept.push(s); }
  }

  function state() { return boats.map((b) => ({ vessel: b.a.vessel, type: b.type, phase: b.phase, eta: b.a.time, slot: b.si, x: Math.round(b.x), z: Math.round(b.z), dry: b.route.dry, yielding: !!b.yielding, delay: Math.round(b.delay || 0), yaw: b.yaw ?? 0, px: b.x, pz: b.z, L: b.S.L, B: b.S.B, off: b.off || 0 })); }   // [ship] yielding, delay, the pose and the sidestep

  // follow life's live list (life builds after harbor: subscribe on the first frame it exists)
  let subscribed = false;
  ctx.onUpdate((dt, t) => {
    if (!subscribed && opts.follow !== false && ctx.services?.arrivals?.onChange) {
      subscribed = true;
      const svc = ctx.services.arrivals;
      svc.onChange((s) => setArrivals(s.list, { sample: s.sample }));
      if (svc.list?.length) setArrivals(svc.list, { sample: svc.sample });
    }
    update(dt, t);
  });

  const api = { setArrivals, state, update, slots, stats, clear };
  return api;
}
