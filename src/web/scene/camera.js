// Camera v2 (package v2:portal-cinema): the fly controller, cinematic spline paths, the tour director and the film sampler.
//
//   createFlyCamera({ camera, dom, heightAt })  drag/WASD/wheel/pinch free flight, plus `rails` (a pose function of time)
//   keyTrack / poseTrack                         time-keyed Catmull-Rom (non-uniform, C1) tracks with eased ends
//   orbitPose(stop, t)                           the slow bounded orbit + dolly at a stop (deterministic in t)
//   transitionPath(from, to, opts)               an arcing spline between two poses, continuing the current velocity
//   createTour({ fly, stops })                   goto / play (auto tour ~90 s) / pause, emitting tourEvents
//   createFilm(spec)                             deterministic film sampler: frame(i) -> { t, pos, look, fov, hours }
//   installCinema({ RT, fly, camera, stops })    loads data/tour.json, builds the tour + film, publishes __RT.tour / __RT.film
//
// Everything that decides where the camera is at time t is a pure function of t (no Math.random, no wall clock), so
// the film render (scripts/render/film.js) and the tests sample exactly the same poses.
import * as THREE from "three";
import { hourForElevation, toJst } from "../lib/solar.js";
import { LAT0, LON0 } from "../../core/geo.js";

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const smootherstep = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (t * 6 - 15) + 10); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEG = Math.PI / 180;

// ------------------------------------------------------------------ events
/** Tiny emitter: on(type, fn) -> off, once, off, emit. `*` listens to everything (fn(detail, type)). */
export function createEmitter() {
  const map = new Map();
  const api = {
    on(type, fn) { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(fn); return () => api.off(type, fn); },
    once(type, fn) { const off = api.on(type, (d, t) => { off(); fn(d, t); }); return off; },
    off(type, fn) { map.get(type)?.delete(fn); },
    emit(type, detail = {}) {
      for (const fn of [...(map.get(type) ?? []), ...(map.get("*") ?? [])]) { try { fn(detail, type); } catch (e) { console.error(`tour event ${type} listener failed`, e); } }
    },
  };
  return api;
}
/**
 * Tour and opening events (see the package report for the list):
 *   tour:start {from}  tour:end {}  tour:pause {index}
 *   stop:leave {index,id}  stop:enter {index,id,stop,dur}  stop:arrive {index,id,stop}  stop:dwell {index,id,remaining}
 *   opening:gallery  opening:dive  opening:handoff  reveal:start  reveal:end  opening:end
 */
export const tourEvents = createEmitter();

// ------------------------------------------------------------------ vector helpers (plain arrays; pure)
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map((v) => v * s);
const len = (a) => Math.hypot(...a);
const lerpA = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const asArr = (v) => (Array.isArray(v) ? v.slice() : typeof v === "number" ? [v] : [v.x, v.y, v.z]);

/**
 * Time-keyed spline through keys [{ t, v, vel? }] (v: number or array). Catmull-Rom with non-uniform knots: the tangent
 * at an inner key is the time-weighted blend of the neighbouring segment velocities, so speed is continuous (C1) across
 * keys. End keys default to zero velocity (ease in / ease out); a key's explicit `vel` (units per second) overrides.
 * `monotone: true` (scalars) limits tangents (Fritsch-Carlson) so e.g. the clock never runs backwards.
 */
export function keyTrack(keys, { monotone = false } = {}) {
  const K = keys.map((k) => ({ t: k.t, v: asArr(k.v), vel: k.vel != null ? asArr(k.vel) : null })).sort((a, b) => a.t - b.t);
  if (!K.length) throw new Error("keyTrack: no keys");
  const n = K.length, dim = K[0].v.length;
  const m = K.map((k, i) => {
    if (k.vel) return k.vel;
    if (i === 0 || i === n - 1) return new Array(dim).fill(0);
    const a = K[i - 1], b = K[i + 1], d0 = k.t - a.t, d1 = b.t - k.t;
    const v0 = mul(sub(k.v, a.v), 1 / d0), v1 = mul(sub(b.v, k.v), 1 / d1);
    return v0.map((x, j) => (x * d1 + v1[j] * d0) / (d0 + d1));
  });
  if (monotone) for (let i = 0; i < n - 1; i++) for (let j = 0; j < dim; j++) {
    const d = (K[i + 1].v[j] - K[i].v[j]) / (K[i + 1].t - K[i].t);
    if (d === 0) { m[i][j] = 0; m[i + 1][j] = 0; continue; }
    if (Math.sign(m[i][j]) !== Math.sign(d)) m[i][j] = 0;
    if (Math.sign(m[i + 1][j]) !== Math.sign(d)) m[i + 1][j] = 0;
    const a = m[i][j] / d, b = m[i + 1][j] / d, s = a * a + b * b;
    if (s > 9) { const tau = 3 / Math.sqrt(s); m[i][j] = tau * a * d; m[i + 1][j] = tau * b * d; }
  }
  function at(t) {
    if (t <= K[0].t) return n > 1 && K[0].vel ? add(K[0].v, mul(m[0], t - K[0].t)) : K[0].v.slice();
    if (t >= K[n - 1].t) return K[n - 1].v.slice();
    let i = 0; while (i < n - 2 && t > K[i + 1].t) i++;
    const a = K[i], b = K[i + 1], dt = b.t - a.t, u = (t - a.t) / dt, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    return a.v.map((p0, j) => h00 * p0 + h10 * dt * m[i][j] + h01 * b.v[j] + h11 * dt * m[i + 1][j]);
  }
  at.start = K[0].t; at.end = K[n - 1].t; at.keys = K;
  return at;
}
const scalar = (track) => (t) => track(t)[0];

/**
 * Pose track from keys [{ t, pos, look, fov?, hours? }] -> (t) => { pos, look, fov, hours }. Missing fov/hours carry
 * the previous key's value. `startVel`/`startLookVel` continue a moving camera without a jolt.
 */
export function poseTrack(keys, { startVel = null, startLookVel = null, defaultFov = 40 } = {}) {
  let fov = defaultFov, hours = null;
  const filled = keys.map((k) => { fov = k.fov ?? fov; hours = k.hours ?? hours; return { ...k, fov, hours }; });
  const pos = keyTrack(filled.map((k, i) => ({ t: k.t, v: k.pos, vel: i === 0 ? startVel : k.vel ?? null })));
  const look = keyTrack(filled.map((k, i) => ({ t: k.t, v: k.look, vel: i === 0 ? startLookVel : k.lookVel ?? null })));
  const fovT = scalar(keyTrack(filled.map((k) => ({ t: k.t, v: k.fov }))));
  const hasHours = filled.some((k) => k.hours != null);
  const hoursT = hasHours ? scalar(keyTrack(filled.filter((k) => k.hours != null).map((k) => ({ t: k.t, v: k.hours })), { monotone: true })) : null;
  const f = (t) => ({ pos: pos(t), look: look(t), fov: fovT(t), hours: hoursT ? hoursT(t) : null });
  f.start = pos.start; f.end = pos.end; f.duration = pos.end - pos.start;
  return f;
}

// ------------------------------------------------------------------ stop orbit and transitions
export const ORBIT_DEFAULTS = { rate: 0.55, max: 12, dir: 1, dolly: 0.05, rise: 0, ramp: 1.6, settle: 9 };
/**
 * Deterministic "breathing" orbit at a stop, t seconds after arrival. The yaw around the look point eases in from
 * zero speed (ramp), runs at `rate` deg/s and saturates softly at `max` degrees (tanh), so a stop left alone for
 * minutes never drifts out of its designed framing. `dolly` pulls in by that fraction, `rise` lifts in metres.
 */
export function orbitPose(stop, t) {
  const o = { ...ORBIT_DEFAULTS, ...(stop.orbit ?? {}) };
  const cam = stop.cam;
  const s = Math.max(0, t - o.ramp * (1 - Math.exp(-t / o.ramp)));
  const ang = o.max > 0 ? o.max * Math.tanh((o.rate * s) / o.max) * o.dir * DEG : 0;
  const settle = 1 - Math.exp(-s / o.settle);                                          // eased like the yaw: no jolt on arrival
  const off = sub(cam.pos, cam.look), c = Math.cos(ang), sn = Math.sin(ang);
  const rot = [off[0] * c - off[2] * sn, off[1], off[0] * sn + off[2] * c];           // yaw about +y
  const k = 1 - o.dolly * settle;
  const pos = [cam.look[0] + rot[0] * k, cam.look[1] + rot[1] * k + o.rise * settle, cam.look[2] + rot[2] * k];
  return { pos, look: cam.look.slice(), fov: cam.fov ?? 40, hours: null };
}

/**
 * Arc from pose `from` (with velocity `vel`, units/s) to stop pose `to`. Long hops rise through a lifted midpoint so the
 * camera climbs, glides and descends instead of skimming the ground. Returns a poseTrack starting at t = 0.
 */
export function transitionPath(from, to, { vel = null, lookVel = null, dur = null, lift = null } = {}) {
  const dist = len(sub(to.pos, from.pos));
  const D = dur ?? clamp(3.2 + dist / 1400, 3.6, 8);
  const keys = [{ t: 0, pos: from.pos, look: from.look, fov: from.fov ?? 40 }];
  const L = lift ?? Math.min(dist * 0.16, 520);
  if (dist > 180) {
    const mid = lerpA(from.pos, to.pos, 0.5), midLook = lerpA(from.look, to.look, 0.62);
    mid[1] = Math.max(mid[1], (from.pos[1] + to.pos[1]) / 2 + L);
    keys.push({ t: D * 0.5, pos: mid, look: midLook, fov: ((from.fov ?? 40) + (to.fov ?? 40)) / 2 });
  }
  keys.push({ t: D, pos: to.pos, look: to.look, fov: to.fov ?? 40 });
  const tr = poseTrack(keys, { startVel: vel, startLookVel: lookVel });
  tr.dist = dist;
  return tr;
}

// ------------------------------------------------------------------ fly camera
/**
 * Vertical fov for a pose designed on a 16:9 screen, widened on portrait/narrow screens so the subject still fits
 * (phones): keeps ~62% of the 16:9 horizontal coverage, softened (^0.8) to limit wide-angle stretch, capped at 80 deg.
 */
export function fitFov(fov, aspect) {
  const need = (16 / 9) * 0.62;
  if (!(aspect > 0) || aspect >= need) return fov;
  const k = Math.pow(need / aspect, 0.8);
  return Math.min(80, (2 * Math.atan(Math.tan((fov * DEG) / 2) * k)) / DEG);
}
/** Apply { pos, look, fov } to a three camera (up = +y); fov is fitted to the camera's aspect (fitFov). */
export function applyPose(camera, p) {
  camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
  camera.lookAt(p.look[0], p.look[1], p.look[2]);
  const fov = p.fov ? fitFov(p.fov, camera.aspect) : null;
  if (fov && Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
}

let activeFly = null;
/** The fly controller main.js created (portal.js and the film hook drive the same camera through it). */
export const getFly = () => activeFly;

export function createFlyCamera({ camera, dom, heightAt = () => 0 }) {
  const look = new THREE.Vector3(0, 0, -1);
  let yaw = 0, pitch = -0.3, enabled = true, rails = null;
  const keys = new Set();
  const listeners = { interact: [], rails: [] };
  const emit = (e, d) => listeners[e]?.forEach((f) => f(d));
  const updaters = new Set();
  // velocity estimate (units/s) of position and look point, for seamless path hand-offs
  const last = { pos: null, look: null, vel: [0, 0, 0], lookVel: [0, 0, 0] };

  function setFromLook(pos, target) {
    camera.position.copy(pos); camera.lookAt(target);
    const d = target.clone().sub(pos).normalize();
    yaw = Math.atan2(d.x, -d.z); pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    look.copy(target);
  }
  function dirFromAngles(out = new THREE.Vector3()) { return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); }
  function applyAngles() { const d = dirFromAngles(); camera.lookAt(camera.position.clone().add(d)); look.copy(camera.position).addScaledVector(d, Math.max(50, altitude() * 2)); }
  function pose() { return { pos: camera.position.toArray(), look: look.toArray(), fov: camera.fov }; }

  /**
   * Put the camera on rails: fn(t) -> { pos, look, fov } for t seconds since start. Ends after `dur` (calls onEnd) or
   * runs until replaced. `clampGround: false` lets cinematic paths (the portal) go anywhere.
   */
  function setRails(fn, { dur = Infinity, onEnd = null, clampGround: cg = true, name = "path" } = {}) {
    rails = fn ? { fn, t: 0, dur, onEnd, cg, name } : null;
    if (fn) { const p = fn(0); applyPoseTracked(p, cg); }
    emit("rails", rails?.name ?? null);
  }
  function applyPoseTracked(p, cg) {
    applyPose(camera, p); look.fromArray(p.look);
    const d = look.clone().sub(camera.position).normalize(); yaw = Math.atan2(d.x, -d.z); pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    if (cg) clampGround();
  }

  /** Fly to { pos, look, fov? } in `dur` s (0 = jump) along an arcing spline, then settle into a gentle orbit. */
  function flyTo(cam, dur = 4, { orbit = cam.orbit } = {}) {
    const to = { pos: asArr(cam.pos), look: asArr(cam.look), fov: cam.fov ?? camera.fov };
    const stop = { cam: to, orbit };
    if (dur <= 0) { setRails((t) => orbitPose(stop, t), { name: "orbit" }); return Promise.resolve(); }
    const path = transitionPath(pose(), to, { vel: last.vel, lookVel: last.lookVel, dur });
    return new Promise((resolve) => setRails(path, { dur: path.duration, name: "transition", onEnd: () => { setRails((t) => orbitPose(stop, t), { name: "orbit" }); resolve(); } }));
  }
  /** v1 compat: slow orbit around `center` from the current position. */
  function startDrift(center) { const c = asArr(center); setRails((t) => orbitPose({ cam: { pos: camera.position.toArray(), look: c, fov: camera.fov }, orbit: { max: 20, rate: 0.6 } }, t), { name: "orbit" }); }

  let drag = null, pinch = null;
  const interrupt = () => { if (rails) setRails(null); emit("interact"); };
  dom.addEventListener("pointerdown", (e) => { if (!enabled) return; drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; dom.setPointerCapture?.(e.pointerId); interrupt(); });
  dom.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id || pinch) return;
    yaw += (e.clientX - drag.x) * 0.0042; pitch = THREE.MathUtils.clamp(pitch - (e.clientY - drag.y) * 0.0042, -1.45, 1.2);
    drag.x = e.clientX; drag.y = e.clientY; applyAngles();
  });
  const end = () => { drag = null; };
  dom.addEventListener("pointerup", end); dom.addEventListener("pointercancel", end);
  dom.addEventListener("wheel", (e) => { if (!enabled) return; e.preventDefault(); interrupt(); glide(-Math.sign(e.deltaY) * speed() * 0.35); }, { passive: false });
  dom.addEventListener("touchstart", (e) => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
  dom.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 2 || pinch == null) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    glide((d - pinch) * speed() * 0.01); pinch = d;
  }, { passive: true });
  dom.addEventListener("touchend", () => { pinch = null; }, { passive: true });
  addEventListener("keydown", (e) => { if (e.target.closest?.("input,textarea,select")) return; keys.add(e.code); if (/^Key[WASDQE]$/.test(e.code) && enabled) interrupt(); });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());

  function altitude() { return camera.position.y - heightAt(camera.position.x, camera.position.z); }
  function speed() { return THREE.MathUtils.clamp(Math.abs(altitude()) * 0.9, 6, 700); }
  function glide(dist) { camera.position.addScaledVector(dirFromAngles(), dist); clampGround(); }
  function clampGround() { const g = heightAt(camera.position.x, camera.position.z); if (camera.position.y < g + 1.4) camera.position.y = g + 1.4; }

  function update(dt) {
    for (const u of updaters) { try { u(dt); } catch (e) { console.error("fly updater failed", e); } }
    if (rails) {
      rails.t += dt;
      const r = rails, t = Math.min(r.t, r.dur);
      applyPoseTracked(r.fn(t), r.cg);
      if (r.t >= r.dur && rails === r) { rails = null; r.onEnd?.(); }
    } else if (keys.size && enabled) {
      const s = speed() * dt * (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3 : 1);
      const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
      if (keys.has("KeyW")) camera.position.addScaledVector(fwd, s); if (keys.has("KeyS")) camera.position.addScaledVector(fwd, -s);
      if (keys.has("KeyD")) camera.position.addScaledVector(right, s); if (keys.has("KeyA")) camera.position.addScaledVector(right, -s);
      if (keys.has("KeyE")) camera.position.y += s; if (keys.has("KeyQ")) camera.position.y -= s;
      applyAngles(); clampGround();
    }
    if (dt > 0) {
      const p = camera.position.toArray(), l = look.toArray();
      if (last.pos) { last.vel = mul(sub(p, last.pos), 1 / dt); last.lookVel = mul(sub(l, last.look), 1 / dt); }
      last.pos = p; last.look = l;
    }
    const near = THREE.MathUtils.clamp(altitude() * 0.04, 0.12, 4);
    if (Math.abs(near - camera.near) / camera.near > 0.15) { camera.near = near; camera.updateProjectionMatrix(); return true; }
    return false;
  }
  const api = {
    flyTo, update, setFromLook, startDrift, altitude, pose, setRails,
    get tweening() { return rails?.name === "transition"; },
    get rails() { return rails?.name ?? null; },
    get velocity() { return last.vel.slice(); },
    get lookVelocity() { return last.lookVel.slice(); },
    set enabled(v) { enabled = v; }, get enabled() { return enabled; },
    on: (e, f) => { (listeners[e] ??= []).push(f); },
    addUpdater: (fn) => { updaters.add(fn); return () => updaters.delete(fn); },
    stopDrift: () => { if (rails?.name === "orbit") setRails(null); },
  };
  activeFly = api;
  return api;
}

// ------------------------------------------------------------------ tour director
/**
 * The tour: stops [{ id, ja, en, cam:{pos,look,fov}, orbit?, dwell? }]. goto(i) glides there (arcing spline that
 * continues the current motion) and settles into the stop's orbit. play() runs the auto tour: every stop in order,
 * dwelling `dwell` seconds (default 8), about 90 s for the 7 stops, then emits tour:end. Any user input pauses it.
 */
export function createTour({ fly, stops, events = tourEvents, loop = false, defaultDwell = 8 }) {
  const st = { index: -1, playing: false, phase: "idle", dwellLeft: 0, arrivedAt: 0, clock: 0 };
  function goto(i, { dur = null, instant = false } = {}) {
    const s = stops[i]; if (!s) return Promise.resolve();
    if (st.index >= 0 && st.index !== i) events.emit("stop:leave", { index: st.index, id: stops[st.index]?.id });
    st.index = i; st.phase = "transition";
    const to = { pos: s.cam.pos, look: s.cam.look, fov: s.cam.fov ?? 40 };
    const arrive = () => { st.phase = "stop"; st.arrivedAt = st.clock; st.dwellLeft = s.dwell ?? defaultDwell; events.emit("stop:arrive", { index: i, id: s.id, stop: s }); };
    if (instant) {
      events.emit("stop:enter", { index: i, id: s.id, stop: s, dur: 0 });
      fly.setRails((t) => orbitPose(s, t), { name: "orbit" }); arrive(); return Promise.resolve();
    }
    const path = transitionPath(fly.pose(), to, { vel: fly.velocity, lookVel: fly.lookVelocity, dur });
    events.emit("stop:enter", { index: i, id: s.id, stop: s, dur: path.duration });
    return new Promise((resolve) => fly.setRails(path, {
      dur: path.duration, name: "transition",
      onEnd: () => { fly.setRails((t) => orbitPose(s, t), { name: "orbit" }); arrive(); resolve(); },
    }));
  }
  function play({ from = 0 } = {}) {
    st.playing = true; events.emit("tour:start", { from, stops: stops.length });
    return goto(from);
  }
  function pause() { if (st.playing) { st.playing = false; events.emit("tour:pause", { index: st.index }); } }
  const off = fly.addUpdater((dt) => {
    st.clock += dt;
    if (!st.playing || st.phase !== "stop") return;
    st.dwellLeft -= dt;
    if (st.dwellLeft <= 0) {
      if (st.index < stops.length - 1) goto(st.index + 1);
      else if (loop) goto(0);
      else { st.playing = false; st.phase = "stop"; events.emit("tour:end", { index: st.index }); }
    }
  });
  fly.on("interact", pause);
  /** Estimated auto-tour length from the current stop layout (s). */
  function estimate(fromPose = null) {
    let T = 0, prev = fromPose;
    for (const s of stops) {
      if (prev) T += transitionPath(prev, s.cam).duration;
      T += s.dwell ?? defaultDwell; prev = { pos: s.cam.pos, look: s.cam.look, fov: s.cam.fov };
    }
    return T;
  }
  return {
    goto, play, pause, estimate, stops, dispose: off,
    next: () => goto((st.index + 1) % stops.length), prev: () => goto((st.index - 1 + stops.length) % stops.length),
    on: events.on, once: events.once, off: events.off,
    get index() { return st.index; }, get playing() { return st.playing; }, get phase() { return st.phase; },
  };
}

// ------------------------------------------------------------------ film
/**
 * Film sampler from data/tour.json `film`: { fps, duration, width, height, keys:[{ t, pos, look, fov, hours }], title }.
 * poseAt(t) is a pure function of t; frame(i) = poseAt(i / fps). Keys are clamped to [0, duration].
 */
export function createFilm(spec) {
  const fps = spec.fps ?? 30, duration = spec.duration ?? 30;
  const track = poseTrack(spec.keys, { defaultFov: spec.fov ?? 40 });
  const frames = Math.round(fps * duration);
  const poseAt = (t) => { const p = track(clamp(t, 0, duration)); return { t, ...p }; };
  const titleFrom = spec.title?.from ?? duration;
  return {
    fps, duration, frames, width: spec.width ?? 3840, height: spec.height ?? 2160, title: spec.title ?? null, shots: spec.shots ?? [],
    poseAt,
    /** Pose of frame i at `rate` fps (default the film fps; --preview samples the same curve at 5 fps). */
    pose(i, rate = fps) { const p = poseAt(i / rate); p.title = p.t >= titleFrom ? smootherstep((p.t - titleFrom) / (spec.title?.fade ?? 1.2)) : 0; return p; },
    frameCount: (rate = fps) => Math.round(rate * duration),
  };
}

// ------------------------------------------------------------------ data
/** Merge data/landmarks.json (ids, names, verified coordinates) with data/tour.json v2 (cameras, orbit, dwell). */
export function mergeStops(landmarks, tour) {
  const base = Array.isArray(landmarks) ? landmarks : landmarks?.stops ?? [];
  const v2 = new Map((tour?.stops ?? []).map((s) => [s.id, s]));
  const order = tour?.order ?? (tour?.stops ?? base).map((s) => s.id);
  const byId = new Map(base.map((s) => [s.id, s]));
  return order.map((id) => {
    const b = byId.get(id) ?? v2.get(id), t = v2.get(id) ?? {};
    if (!b) return null;
    return { ...b, ...t, ja: b.ja ?? t.ja, en: b.en ?? t.en, blurb: b.blurb ?? t.blurb, cam: t.cam ?? b.cam, orbit: t.orbit ?? null, dwell: t.dwell ?? null };
  }).filter((s) => s?.cam);
}

/**
 * Wire the tour and film into the page: loads data/tour.json, publishes __RT.tour and __RT.film (never reassigning
 * __RT). setHours(h) is the fallback clock setter when __RT.setTime is still a placeholder.
 */
export async function installCinema({ RT = globalThis.__RT, fly, camera, stops: landmarkStops = null, setHours = null, fetchJson = defaultFetchJson }) {
  const tour = await fetchJson("data/tour.json");
  const landmarks = landmarkStops ?? (await fetchJson("data/landmarks.json"));
  const stops = mergeStops(landmarks, tour);
  const t = createTour({ fly, stops });
  const film = tour?.film ? createFilm(tour.film) : null;
  const setTime = (h) => { if (h == null) return; try { RT.setTime(h); } catch { setHours?.(h); } };
  const setCam = (p) => {
    try { RT.setCamera({ pos: p.pos, look: p.look, fov: p.fov }); } catch { /* placeholder: drive the camera directly */ }
    fly.setRails(() => p, { name: "film", clampGround: false });
    applyPose(camera, p);
  };
  const api = {
    tour: t, film, stops, data: tour,
    /** Golden hour for the opening/tour: the JST hour the sun sinks to `golden.elev` degrees on the page's date
     *  (?date=YYYY-MM-DD or today), capped at the spec preset 17:05 (V2-SPEC §5). */
    golden() {
      const g = tour?.golden ?? {}, cap = g.cap ?? 17 + 5 / 60;
      const ymd = new URLSearchParams(globalThis.location?.search ?? "").get("date") ?? toJst(new Date()).ymd;
      try { return Math.min(cap, hourForElevation(ymd, LAT0, LON0, g.elev ?? 4.5)); } catch { return cap; }
    },
    nightHours: tour?.night ?? 19 + 40 / 60,
  };
  if (RT) {
    RT.tour = {
      play: (o) => t.play(o), pause: () => t.pause(), goto: (i, o) => t.goto(typeof i === "string" ? stops.findIndex((s) => s.id === i) : i, o),
      next: () => t.next(), prev: () => t.prev(), on: tourEvents.on, once: tourEvents.once, off: tourEvents.off,
      get index() { return t.index; }, get playing() { return t.playing; }, get phase() { return t.phase; },
      get ids() { return stops.map((s) => s.id); }, estimate: () => t.estimate(),
      toJSON() { return { index: t.index, playing: t.playing, phase: t.phase }; },
    };
    if (film) RT.film = {
      fps: film.fps, duration: film.duration, frames: film.frames, width: film.width, height: film.height, title: film.title, shots: film.shots,
      pose: (i, rate) => film.pose(i, rate),
      /** Set time + camera for frame i (at `rate` fps) and return the pose. The caller then settles and captures. */
      frame(i, rate = film.fps) { t.pause(); const p = film.pose(i, rate); RT.clock = p.t; setTime(p.hours); setCam(p); return p; },
      /** Leave film mode: release the pinned animation clock. */
      release() { RT.clock = null; },
      toJSON() { return { fps: film.fps, duration: film.duration, frames: film.frames }; },
    };
  }
  return api;
}

async function defaultFetchJson(url) { try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; } }
