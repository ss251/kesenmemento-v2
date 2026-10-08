// [v3:life] Tour camera: smooth drone flights between the tour stops (L.TOUR, L.HERO) and walk spots.
//
//   const tour = createTour(ctx)
//   tour.flyTo(id | { pos, look }, { duration?, cinematic? })   drone flight from the current camera: a lifted Catmull-Rom arc flown by arc
//                                                     length with a Hermite ease that starts moving at once (easeFly), the view panned and
//                                                     tilted (never a look point lerped through the town), the speed kept when a flight is
//                                                     retargeted. A pick takes flightSeconds(d): 1.8 s for a hop, 4.5 s across the town.
//                                                     { cinematic: true } is the auto tour's own length and soft start (flightSecondsCinematic)
//   tour.skip(cut?) -> bool                           finish the flight in progress (a key, a press or a touch): far from the destination
//                                                     cut(fn) hides the jump (a veil dip), near it a 0.25 s glide; false when idle or on tour
//   tour.walkTo(id)                                  drop to the stop's walk spot (street level, walk mode)
//   tour.play() / tour.stop() / tour.playing         auto tour: fly stop to stop, dwell with a slow orbit drift
//   tour.filmPose(t, out) -> { pos:[x,y,z], look:[x,y,z] }   pure function of t along FILM_PATH (deterministic film)
//   tour.stops  [{ id, ja, en, drone, walk }]         tour.onChange(fn(state))
import * as THREE from 'three';

const DEG = 180 / Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** [ui-c] Hermite ease of a flight: e(0) = 0, e(1) = 1, e'(0) = s0, e'(1) = 0 (monotone for 0 <= s0 <= 3). s0 = 1.2 starts at 1.2x the mean speed: the first 1 % of the path
 *  takes 0.8 % of the time (the old in-out cubic spent 13.6 % of it, so a place pick showed nothing for about a second); s0 = 0 is a smoothstep (the auto tour's soft start). */
export const easeFly = (u, s0 = 1.2) => { const u2 = u * u, u3 = u2 * u; return s0 * (u3 - 2 * u2 + u) + 3 * u2 - 2 * u3; };
/** A flight the visitor asked for (a place pick, the 歩く / ドローン toggle): 1.8 s for a short hop, 4.5 s across the town. */
export const flightSeconds = (dist) => clamp(1.4 + 0.08 * Math.sqrt(dist), 1.8, 4.5);
/** The auto tour's own length (the formula flights always had): 3.2 s to 11 s. Unchanged. */
export const flightSecondsCinematic = (dist) => clamp(2.2 + Math.sqrt(dist) * 0.16, 3.2, 11);
/** How far the view tips down toward the town at mid-flight (radians); 0 is a pure turn. Tune by eye: 18 degrees keeps the horizon in view, 50 to 60 degrees brings back the
 *  old top-down moment (steepest pitch -63 to -73 degrees) without its spin. */
const FLY_DIP = 30 * Math.PI / 180;
const PITCH_MAX = 85 * Math.PI / 180;   // the player's own pitch clamp
/** Yaw (0 looks along -z, turning toward -x: the derivation setCam uses) and pitch (up is positive) of a direction. The view is turned by this pair, so it never rolls. */
const yawPitch = (v) => [Math.atan2(-v.x, -v.z), Math.asin(Math.max(-1, Math.min(1, v.y)))];
/** A settle or a skip is a short straight glide: no lifted arc (a 30 m hump in a quarter of a second reads as a bounce). */
const SETTLE = { duration: 0.25, s0: 2.4, straight: true };

// Beauty framings for the real tour stops (L.TOUR from data/landmarks.json), chosen by screenshot at 1600x900 over every
// time preset: the drone views keep a landmark, water and a skyline in frame; the walk spots stand on real quays and
// decks, clear of the townspeople. Anything missing falls back to the layout's own framing.
export const FRAMES = {
  hero:   { drone: { pos: [428, 126, 130], look: [56, -18, -174] }, portrait: { pos: [310, 160, 70], look: [10, -60, -230] },   /* [v3:polish3] portrait (phone, ~48 deg across): closer and steeper, so 安波山 crowns the frame and the town fills its upper half above the dock (the landscape pose left a thin strip over empty bay) */   /* [v3:polish2] higher, further back, tilted down: 浮見堂 + torii whole in the lower-right third, the moored boats whole */ walk: { x: 168, z: -122, yaw: 111, pitch: 2 } },   // [v3:integrate] walk: the promenade deck looking west along the seawall (was blocked by a lamp post)
  ukimido:{ drone: { pos: [420, 30, 40], look: [341, 4, -25] } },
  // [v3:fix] walk spots re-authored by screenshot for every stop (qa3 checks each one: on land, outside every building,
  // no single colour over 45 % of the frame): Pier 7 at the 迎 quay corner looking across the bay, the market apron
  // beside a moored skipjack boat, the shore under かなえ大橋, the mainland slope below the 大島大橋 arch
  pier7:  { drone: { pos: [-60, 40, 210], look: [150, 8, -80] }, walk: { x: 5, z: 40, yaw: -130, pitch: 1 } },   // [v5:fix1] at the head of the stepped garden: the ring planters, the pontoons and PIER7's bay face (it stood nose-to-glass at (51, 69))   // [v3:polish3] pitch -4 -> 1: less blank concrete slab   // [v3:polish2] down the quay at the moored row and the working buildings (half the frame was sky + blank slab)
  market: { drone: { pos: [760, 28, 900], look: [575, 8, 715] } /* [v3:polish3] low over the water off the berth: the canopy leads to 安波山, the moored boats in front (a warehouse roof filled a quarter; the review's [880,55,760] looked into the sun at a thin strip) */, walk: { x: 654.5, z: 836.1, yaw: -155, pitch: 2 } },   // [v3:fix] 15 m back: the unloading scene (harbor/unload.js) now fills the old spot; it lies ahead in view
  kanae:  { drone: { pos: [1560, 110, 2050], look: [1456, 40, 1527] /* [v4:landmarks-A] the measured main-span centre */ }, walk: { x: 1528, z: 1747, yaw: 14, pitch: 4 } },   // [v3:polish3] pitch 12 -> 4, yaw 6 -> 14: less empty sky, off the bare slope   // [v3:polish] at the water's edge (a flat mustard slope filled 40 %)
  oshima: { walk: { x: 2776, z: 3244, yaw: 17, pitch: 2 } },   // [v3:polish3] 8 m uphill, pitch 2: off the bare slab
  anba:   { walk: { x: -490.6, z: -986.1, yaw: -128, pitch: -10 } },   // [v3:polish2] 1.1 m on, ~0.5 m from the rail, looking down: the top bar drops below the bay line
};
/** [v3:fix] stops left out of the UI tour: 唐桑 has no forest or villages beyond the city grid yet (a camouflage plain). */
export const HIDDEN_STOPS = new Set(['karakuwa']);
const NAMES = { hero: ['内湾（空から）', 'Inner bay (drone)'], ukimido: ['浮見堂', 'Ukimido pavilion'], pier7: ['PIER7（ピアセブン）', 'PIER7 (Pier Seven)'] };   // [v4:integrate] the plaza's real name (the layout's 第7岸壁（撮影地点） was the v1 capture label)

/** True on a portrait viewport (the renderer canvas when there is one, else the window). */
export function isPortrait() {
  if (typeof window === 'undefined') return false;
  try {
    const c = typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('scene') : null;
    const w = c?.clientWidth || window.innerWidth, h = c?.clientHeight || window.innerHeight;
    return !!w && !!h && w / h < 1;
  } catch { return false; }
}

/** The tour: the inner bay first, 浮見堂 after Pier 7, then the layout's stops in order, re-framed by FRAMES. */
export function tourStops(L, harbor = null) {
  const base = [{ id: 'hero', drone: L.HERO.drone, walk: L.HERO.walk }, ...L.TOUR.filter((t) => t.id !== 'bay' && !HIDDEN_STOPS.has(t.id))];
  const i7 = base.findIndex((s) => s.id === 'pier7');
  const uk = L.SPOTS?.ukimido;
  if (uk) {
    // walk: on the vermilion walkway, looking out at the pavilion (harbor publishes the walkway polyline)
    const w = harbor?.ukimido?.walk;
    const walk = w?.length > 1 ? { x: w[1][0], z: w[1][1], yaw: Math.atan2(-(w[0][0] - w[1][0]), -(w[0][1] - w[1][1])) * DEG, pitch: 1 } : null;
    base.splice(i7 >= 0 ? i7 + 1 : 1, 0, { id: 'ukimido', drone: null, walk });
  }
  return base.map((s) => {
    const f = FRAMES[s.id] || {}, n = NAMES[s.id];
    const land = f.drone || s.drone, port = f.portrait || null;
    // [v3:polish3] a portrait viewport (phones) takes the stop's portrait framing when it has one
    return { id: s.id, ja: n?.[0] ?? s.ja, en: n?.[1] ?? s.en, get drone() { return port && isPortrait() ? port : land; }, droneLandscape: land, dronePortrait: port, walk: f.walk || s.walk || null };
  }).filter((s) => s.drone);
}

export function createTour(ctx) {
  const L = ctx.L;
  const stops = tourStops(L, ctx.services?.harbor);
  const byId = new Map(stops.map((s) => [s.id, s]));
  const listeners = new Set();
  const cam = ctx.camera;
  // vel / velN / n / last / lastOk: the camera's own velocity during a flight, so a retarget carries it (see flyTo)
  const state = { flight: null, playing: false, current: 'hero', dwell: 0, orbit: null, vel: new THREE.Vector3(), velN: -99, n: 0, last: new THREE.Vector3(), lastOk: false };
  const _v = new THREE.Vector3(), _t = new THREE.Vector3();
  const emit = () => { for (const f of listeners) try { f(api); } catch (e) { console.error(e); } };

  function player() { return ctx.playerObj; }
  function setCam(pos, look) {
    const dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
    const yaw = Math.atan2(-dx, -dz) * DEG, pitch = Math.atan2(dy, Math.hypot(dx, dz)) * DEG;
    const p = player();
    if (p) p.setPose(pos[0], pos[2], yaw, pitch, pos[1]);
    else if (cam) { cam.position.set(pos[0], pos[1], pos[2]); cam.lookAt(look[0], look[1], look[2]); }
  }
  function currentLook(dist = 120) {
    const d = new THREE.Vector3(); cam.getWorldDirection(d);
    return [cam.position.x + d.x * dist, cam.position.y + d.y * dist, cam.position.z + d.z * dist];
  }

  function flyTo(target, o = {}) {
    const s = typeof target === 'string' ? byId.get(target) : null;
    const to = s ? s.drone : typeof target === 'string' ? null : target;   // [ui-c] an unknown id is no flight (it used to throw on to.pos)
    if (!to || !to.pos || !to.look) return;
    const from = { pos: [cam.position.x, cam.position.y, cam.position.z], look: currentLook(Math.max(60, Math.hypot(to.pos[0] - cam.position.x, to.pos[2] - cam.position.z) * 0.3)) };
    const dist = Math.hypot(to.pos[0] - from.pos[0], to.pos[1] - from.pos[1], to.pos[2] - from.pos[2]);
    // lifted mid-point: long hops rise over the town so the whole bay reads on the way (a straight glide has none)
    const lift = Math.min(420, 30 + dist * 0.28);
    const mid = o.straight ? [(from.pos[0] + to.pos[0]) / 2, (from.pos[1] + to.pos[1]) / 2, (from.pos[2] + to.pos[2]) / 2]
      : [(from.pos[0] + to.pos[0]) / 2, Math.max(from.pos[1], to.pos[1]) + lift, (from.pos[2] + to.pos[2]) / 2];
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(...from.pos), new THREE.Vector3(...mid), new THREE.Vector3(...to.pos)], false, 'centripetal');
    const len = curve.getLength();
    const dur = o.duration ?? (o.cinematic ? flightSecondsCinematic(dist) : flightSeconds(dist));
    const s0 = o.s0 ?? (o.cinematic ? 0 : 1.2);
    // a camera that is already moving keeps its velocity: the gap between that velocity and the new path's own start velocity is added as a bump
    // t * (1 - t / T)^2, which is 0 at both ends, so the speed is continuous and the arrival stays exact (the callers retarget with stop() then
    // flyTo(), and stop() keeps state.vel on purpose: a retarget used to collapse 124 m/s to 0 in one frame)
    let dv = null;
    const T = Math.min(0.6, dur * 0.4);
    if (state.vel.lengthSq() > 4 && state.n - state.velN <= 2) {   // the last flight frame was at most two updates ago
      curve.getTangentAt(0, _t);
      dv = state.vel.clone().sub(_t.multiplyScalar(s0 * len / dur));
    }
    // the view pans and tilts from where the camera looks now to the framing's own direction, the way round that is at most half a turn. (A world-space
    // lerp of the look POINT whipped the camera round where the lifted path passed near it: measured 22 deg of yaw in one frame and 320 deg in all for a
    // net turn of 39.5. Yaw and pitch have no degenerate case: a slerp between two exactly opposite directions picks an arbitrary plane and flips 180 deg in one frame.)
    const [y0, p0] = yawPitch(new THREE.Vector3(from.look[0] - from.pos[0], from.look[1] - from.pos[1], from.look[2] - from.pos[2]).normalize());
    const [y1, p1] = yawPitch(new THREE.Vector3(to.look[0] - to.pos[0], to.look[1] - to.pos[1], to.look[2] - to.pos[2]).normalize());
    const dyaw = Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0));
    state.flight = { curve, from, to, t: 0, dur, s0, dv, T, y0, p0, dyaw, dp: p1 - p0, id: s?.id || null };
    if (s) state.current = s.id;
    state.orbit = null;
    emit();
  }
  /**
   * Finish the flight in progress (any key, press or touch while flying). Far from the destination the caller's `cut(fn)` (a veil dip) hides the jump. Otherwise a
   * straight glide settles the camera: a quarter of a second when it is near and the view already points at the framing, longer (at most 1.2 s) when the remaining
   * distance (no veil to hide a cut) or the remaining turn of the view needs it, so a view that points the wrong way never whips round. Never while the auto tour
   * plays (it has its own pause). -> whether a flight was finished.
   */
  function skip(cut = null) {
    const f = state.flight;
    if (!f || state.playing) return false;
    const rest = Math.hypot(f.to.pos[0] - cam.position.x, f.to.pos[1] - cam.position.y, f.to.pos[2] - cam.position.z);
    // (the cut may run after a veil dip: only if this flight is still the one running, never over a place picked in the meantime)
    if (rest > 150 && cut) { cut(() => { if (state.flight !== f) return; state.flight = null; state.velN = -99; setCam(f.to.pos, f.to.look); emit(); }); return true; }
    cam.getWorldDirection(_t);
    _v.set(f.to.look[0] - f.to.pos[0], f.to.look[1] - f.to.pos[1], f.to.look[2] - f.to.pos[2]).normalize();
    const turn = Math.acos(clamp(_t.dot(_v), -1, 1));   // radians the view still has to turn
    flyTo(f.to, { ...SETTLE, duration: clamp(Math.max(0.25 + (rest > 150 ? rest / 1500 : 0), turn / (150 / DEG)), 0.25, 1.2) });
    return true;
  }
  /** Cut straight to a stop's drone framing (stills, film, the shot tools). */
  function jumpTo(id) {
    const s = byId.get(id); if (!s) return false;
    state.flight = null; state.orbit = null; state.current = id; state.velN = -99;   // [ui-c] a cut carries no velocity into the next flight
    const p = player(); if (p) p.fly = true;
    setCam(s.drone.pos, s.drone.look); emit(); return true;
  }
  function walkTo(id) {
    const s = byId.get(id); if (!s?.walk) return false;
    state.flight = null; state.playing = false; state.orbit = null; state.velN = -99;
    const p = player();
    if (p) {
      p.fly = false; p.setPose(s.walk.x, s.walk.z, s.walk.yaw, s.walk.pitch);
      try { p.arrive?.(s.walk); } catch (e) { /* the arrival's courtesy to the third-person camera (avatar.js) must never fail the walk */ }
    }
    state.current = id; emit(); return true;
  }
  const _p = new THREE.Vector3();
  function update(dt) {
    state.n++;
    const f = state.flight;
    if (f && dt > 0) {
      f.t += dt;
      const u = Math.min(1, f.t / f.dur), e = easeFly(u, f.s0);
      f.curve.getPointAt(e, _p);                       // arc length, so the ease maps to distance and not to the spline parameter (which jumped 3x in speed at the mid-knot)
      if (f.dv && f.t < f.T) { const k = f.t * (1 - f.t / f.T) ** 2; _p.x += f.dv.x * k; _p.y += f.dv.y * k; _p.z += f.dv.z * k; }
      const k = easeFly(Math.min(1, u * 1.25), 1.2);   // the view finishes turning at 80 % of the flight
      const yaw = f.y0 + f.dyaw * k, pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, f.p0 + f.dp * k - FLY_DIP * Math.sin(Math.PI * k))), c = Math.cos(pitch);   // the dip is a nod toward the town mid-flight
      const look = [_p.x - Math.sin(yaw) * c * 100, _p.y + Math.sin(pitch) * 100, _p.z - Math.cos(yaw) * c * 100];
      if (state.lastOk) { _v.copy(_p).sub(state.last).divideScalar(dt); state.vel.lerp(_v, 0.6); state.velN = state.n; }
      state.last.copy(_p); state.lastOk = true;
      setCam([_p.x, _p.y, _p.z], look);
      if (u >= 1) { state.flight = null; state.dwell = 0; if (state.playing) state.orbit = { pos: f.to.pos.slice(), look: f.to.look.slice(), a: 0 }; emit(); }
      return;
    }
    state.lastOk = false;
    if (state.playing && dt > 0) {
      state.dwell += dt;
      const o = state.orbit;
      if (o) { // gentle orbit drift round the look point while dwelling
        o.a += dt * 0.035;
        const dx = o.pos[0] - o.look[0], dz = o.pos[2] - o.look[2], c = Math.cos(o.a), s = Math.sin(o.a);
        setCam([o.look[0] + dx * c - dz * s, o.pos[1], o.look[2] + dx * s + dz * c], o.look);
      }
      if (state.dwell > 7.5) { const i = stops.findIndex((s) => s.id === state.current); flyTo(stops[(i + 1) % stops.length].id, { cinematic: true }); }
    }
  }
  function play() { state.playing = true; const i = stops.findIndex((s) => s.id === state.current); flyTo(stops[(i + 1) % stops.length].id, { cinematic: true }); emit(); }
  // [v5] stop() ends a flight in progress too: a pose set right after it (explore's walk-to-place, the far-core walk)
  // was overwritten by the rest of the flight
  function stop() { state.playing = false; state.orbit = null; state.flight = null; emit(); }

  // ------------------------------------------------------------------ deterministic film path (scripts/render/film.js)
  // 30 s: high over the bay -> down along the inner bay -> 浮見堂 -> Pier 7 -> rise to the whole-bay view.
  const SP = L.SPOTS;
  const uk = SP.ukimido || { x: 340, z: -23 };
  const FILM = [
    { pos: [620, 260, 420], look: [120, 0, -120] },
    { pos: [400, 95, 90], look: [80, 10, -220] },
    { pos: [260, 34, -40], look: [60, 6, -160] },
    { pos: [uk.x - 70, 14, uk.z + 30], look: [uk.x, 3, uk.z] },
    { pos: [uk.x - 40, 9, uk.z - 60], look: [uk.x + 10, 3, uk.z] },
    { pos: [140, 22, 40], look: [30, 4, 90] },
    { pos: [-120, 180, 420], look: [300, 0, -60] },
  ];
  const filmPos = new THREE.CatmullRomCurve3(FILM.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal');
  const filmLook = new THREE.CatmullRomCurve3(FILM.map((k) => new THREE.Vector3(...k.look)), false, 'centripetal');
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function filmPose(t, dur = 30) {
    const u = Math.min(1, Math.max(0, t / dur));
    const e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;       // gentle ease in/out, never stopping
    filmPos.getPoint(e, _a); filmLook.getPoint(e, _b);
    return { pos: [_a.x, _a.y, _a.z], look: [_b.x, _b.y, _b.z] };
  }
  function applyFilm(t, dur) { const p = filmPose(t, dur); setCam(p.pos, p.look); return p; }

  /** [v4:explore] More stops after the built-in ones (explore's real places): { id, ja, en, drone: { pos, look }, walk }. */
  function add(list) {
    let n = 0;
    for (const s of list) { if (!s?.id || byId.has(s.id) || !s.drone) continue; stops.push(s); byId.set(s.id, s); n++; }
    if (n) emit();
    return n;
  }
  const api = {
    stops, flyTo, skip, jumpTo, walkTo, play, stop, update, filmPose, applyFilm, add,
    get playing() { return state.playing; }, get flying() { return !!state.flight; }, get current() { return state.current; },
    onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
  };
  return api;
}
