// [v3:life] Tour camera: smooth drone flights between the tour stops (L.TOUR, L.HERO) and walk spots.
//
//   const tour = createTour(ctx)
//   tour.flyTo(id | { pos, look }, { duration? })   drone flight from the current camera: a lifted Catmull-Rom arc,
//                                                     eased, the look target blended along it
//   tour.walkTo(id)                                  drop to the stop's walk spot (street level, walk mode)
//   tour.play() / tour.stop() / tour.playing         auto tour: fly stop to stop, dwell with a slow orbit drift
//   tour.filmPose(t, out) -> { pos:[x,y,z], look:[x,y,z] }   pure function of t along FILM_PATH (deterministic film)
//   tour.stops  [{ id, ja, en, drone, walk }]         tour.onChange(fn(state))
import * as THREE from 'three';

const DEG = 180 / Math.PI;
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

// Beauty framings for the real tour stops (L.TOUR from data/landmarks.json), chosen by screenshot at 1600x900 over every
// time preset: the drone views keep a landmark, water and a skyline in frame; the walk spots stand on real quays and
// decks, clear of the townspeople. Anything missing falls back to the layout's own framing.
export const FRAMES = {
  hero:   { drone: { pos: [428, 126, 130], look: [56, -18, -174] }, portrait: { pos: [310, 160, 70], look: [10, -60, -230] },   /* [v3:polish3] portrait (phone, ~48 deg across): closer and steeper, so 安波山 crowns the frame and the town fills its upper half above the dock (the landscape pose left a thin strip over empty bay) */   /* [v3:polish2] higher, further back, tilted down: 浮見堂 + torii whole in the lower-right third, the moored boats whole */ walk: { x: 168, z: -122, yaw: 111, pitch: 2 } },   // [v3:integrate] walk: the promenade deck looking west along the seawall (was blocked by a lamp post)
  ukimido:{ drone: { pos: [420, 30, 40], look: [341, 4, -25] } },
  // [v3:fix] walk spots re-authored by screenshot for every stop (qa3 checks each one: on land, outside every building,
  // no single colour over 45 % of the frame): Pier 7 at the 迎 quay corner looking across the bay, the market apron
  // beside a moored skipjack boat, the shore under かなえ大橋, the mainland slope below the 大島大橋 arch
  pier7:  { drone: { pos: [-60, 40, 210], look: [150, 8, -80] }, walk: { x: 51, z: 69, yaw: -84, pitch: 1 } },   // [v3:polish3] pitch -4 -> 1: less blank concrete slab   // [v3:polish2] down the quay at the moored row and the working buildings (half the frame was sky + blank slab)
  market: { drone: { pos: [760, 28, 900], look: [575, 8, 715] } /* [v3:polish3] low over the water off the berth: the canopy leads to 安波山, the moored boats in front (a warehouse roof filled a quarter; the review's [880,55,760] looked into the sun at a thin strip) */, walk: { x: 654.5, z: 836.1, yaw: -155, pitch: 2 } },   // [v3:fix] 15 m back: the unloading scene (harbor/unload.js) now fills the old spot; it lies ahead in view
  kanae:  { drone: { pos: [1560, 110, 2050], look: [1492, 40, 1465] }, walk: { x: 1528, z: 1747, yaw: 14, pitch: 4 } },   // [v3:polish3] pitch 12 -> 4, yaw 6 -> 14: less empty sky, off the bare slope   // [v3:polish] at the water's edge (a flat mustard slope filled 40 %)
  oshima: { walk: { x: 2776, z: 3244, yaw: 17, pitch: 2 } },   // [v3:polish3] 8 m uphill, pitch 2: off the bare slab
  anba:   { walk: { x: -490.6, z: -986.1, yaw: -128, pitch: -10 } },   // [v3:polish2] 1.1 m on, ~0.5 m from the rail, looking down: the top bar drops below the bay line
};
/** [v3:fix] stops left out of the UI tour: 唐桑 has no forest or villages beyond the city grid yet (a camouflage plain). */
export const HIDDEN_STOPS = new Set(['karakuwa']);
const NAMES = { hero: ['内湾（空から）', 'Inner bay (drone)'], ukimido: ['浮見堂', 'Ukimido pavilion'] };

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
  const state = { flight: null, playing: false, current: 'hero', dwell: 0, orbit: null };
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
    const to = s ? s.drone : target;
    if (!to) return;
    const from = { pos: [cam.position.x, cam.position.y, cam.position.z], look: currentLook(Math.max(60, Math.hypot(to.pos[0] - cam.position.x, to.pos[2] - cam.position.z) * 0.3)) };
    const dist = Math.hypot(to.pos[0] - from.pos[0], to.pos[1] - from.pos[1], to.pos[2] - from.pos[2]);
    // lifted mid-point: long hops rise over the town so the whole bay reads on the way
    const lift = Math.min(420, 30 + dist * 0.28);
    const mid = [(from.pos[0] + to.pos[0]) / 2, Math.max(from.pos[1], to.pos[1]) + lift, (from.pos[2] + to.pos[2]) / 2];
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(...from.pos), new THREE.Vector3(...mid), new THREE.Vector3(...to.pos)], false, 'centripetal');
    const dur = o.duration ?? Math.min(11, Math.max(3.2, 2.2 + Math.sqrt(dist) * 0.16));
    state.flight = { curve, from, to, t: 0, dur, id: s?.id || null };
    if (s) state.current = s.id;
    state.orbit = null;
    emit();
  }
  /** Cut straight to a stop's drone framing (stills, film, the shot tools). */
  function jumpTo(id) {
    const s = byId.get(id); if (!s) return false;
    state.flight = null; state.orbit = null; state.current = id;
    const p = player(); if (p) p.fly = true;
    setCam(s.drone.pos, s.drone.look); emit(); return true;
  }
  function walkTo(id) {
    const s = byId.get(id); if (!s?.walk) return false;
    state.flight = null; state.playing = false; state.orbit = null;
    const p = player();
    if (p) { p.fly = false; p.setPose(s.walk.x, s.walk.z, s.walk.yaw, s.walk.pitch); }
    state.current = id; emit(); return true;
  }
  const _p = new THREE.Vector3();
  function update(dt) {
    const f = state.flight;
    if (f && dt > 0) {
      f.t += dt;
      const u = Math.min(1, f.t / f.dur), e = ease(u);
      f.curve.getPoint(e, _p);
      const k = ease(Math.min(1, u * 1.25));
      const look = [f.from.look[0] + (f.to.look[0] - f.from.look[0]) * k, f.from.look[1] + (f.to.look[1] - f.from.look[1]) * k, f.from.look[2] + (f.to.look[2] - f.from.look[2]) * k];
      setCam([_p.x, _p.y, _p.z], look);
      if (u >= 1) { state.flight = null; state.dwell = 0; if (state.playing) state.orbit = { pos: f.to.pos.slice(), look: f.to.look.slice(), a: 0 }; emit(); }
      return;
    }
    if (state.playing && dt > 0) {
      state.dwell += dt;
      const o = state.orbit;
      if (o) { // gentle orbit drift round the look point while dwelling
        o.a += dt * 0.035;
        const dx = o.pos[0] - o.look[0], dz = o.pos[2] - o.look[2], c = Math.cos(o.a), s = Math.sin(o.a);
        setCam([o.look[0] + dx * c - dz * s, o.pos[1], o.look[2] + dx * s + dz * c], o.look);
      }
      if (state.dwell > 7.5) { const i = stops.findIndex((s) => s.id === state.current); flyTo(stops[(i + 1) % stops.length].id); }
    }
  }
  function play() { state.playing = true; const i = stops.findIndex((s) => s.id === state.current); flyTo(stops[(i + 1) % stops.length].id); emit(); }
  function stop() { state.playing = false; state.orbit = null; emit(); }

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

  const api = {
    stops, flyTo, jumpTo, walkTo, play, stop, update, filmPose, applyFilm,
    get playing() { return state.playing; }, get flying() { return !!state.flight; }, get current() { return state.current; },
    onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
  };
  return api;
}
