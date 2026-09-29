// v2 cinema (package v2:portal-cinema): spline math, film determinism, tour data, the tour director, the opening
// timeline and the gallery <-> city mapping. Pure: no browser needed.
//   env -u NODE_OPTIONS bun test test/v2-cinema.test.js
import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import * as THREE from "three";
import { keyTrack, poseTrack, createFilm, orbitPose, transitionPath, createTour, createFlyCamera, createEmitter, mergeStops, smootherstep, fitFov, ORBIT_DEFAULTS } from "../src/web/scene/camera.js";
import { galleryToEnu, enuToGallery, dissolveAt, openingTrack, TIMELINE, DISSOLVE_MIN_H, DEFAULT_MAP, OPENING_DEFAULTS, PIER7, GLASS_Y } from "../src/web/scene/portal.js";
import { attributionParts, machine } from "../scripts/render/cdp.js";
import { framePlan, previewPlan } from "../scripts/render/film.js";

const ROOT = resolve(import.meta.dir, "..");
const tour = await Bun.file(resolve(ROOT, "data/tour.json")).json();
const landmarks = await Bun.file(resolve(ROOT, "data/landmarks.json")).json();
const splats = await Bun.file(resolve(ROOT, "data/splats/splats.json")).json().catch(() => null);
const close = (a, b, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const vel = (f, t, h = 1e-4) => { const a = f(t - h), b = f(t + h); return a.map((v, i) => (b[i] - v) / (2 * h)); };
const velL = (f, t, h = 1e-4) => { const a = f(t - h), b = f(t); return a.map((v, i) => (b[i] - v) / h); };
const velR = (f, t, h = 1e-4) => { const a = f(t), b = f(t + h); return a.map((v, i) => (b[i] - v) / h); };

describe("keyTrack (time-keyed Catmull-Rom)", () => {
  const keys = [{ t: 0, v: [0, 100, 0] }, { t: 2, v: [50, 80, 10] }, { t: 5, v: [60, 60, 90] }, { t: 6, v: [200, 40, 100] }];
  const f = keyTrack(keys);
  test("passes through every key", () => { for (const k of keys) expect(close(f(k.t), k.v)).toBe(true); });
  test("eases in and out (zero velocity at the ends)", () => {
    expect(Math.hypot(...velR(f, 0, 1e-5))).toBeLessThan(0.01);
    expect(Math.hypot(...velL(f, 6, 1e-5))).toBeLessThan(0.01);
  });
  test("C1: speed is continuous across inner keys (non-uniform knot spacing)", () => {
    for (const t of [2, 5]) { const l = velL(f, t, 1e-6), r = velR(f, t, 1e-6); expect(close(l, r, 1e-2)).toBe(true); }
  });
  test("clamps outside the key range", () => { expect(close(f(-3), keys[0].v)).toBe(true); expect(close(f(99), keys[3].v)).toBe(true); });
  test("monotone scalar tracks never run backwards", () => {
    const h = keyTrack([{ t: 0, v: 17 }, { t: 1, v: 17.05 }, { t: 2, v: 19.3 }, { t: 3, v: 19.31 }, { t: 6, v: 19.6 }], { monotone: true });
    let prev = -Infinity; for (let t = 0; t <= 6; t += 0.01) { const v = h(t)[0]; expect(v).toBeGreaterThanOrEqual(prev - 1e-12); prev = v; }
  });
  test("explicit start velocity is honoured", () => {
    const g = keyTrack([{ t: 0, v: [0, 0, 0], vel: [10, 0, -5] }, { t: 4, v: [100, 0, 0] }]);
    expect(close(velR(g, 0, 1e-6), [10, 0, -5], 1e-3)).toBe(true);
  });
});

describe("film: deterministic spline sampling", () => {
  const spec = tour.film;
  const a = createFilm(spec), b = createFilm(JSON.parse(JSON.stringify(spec)));
  test("spec: 30 s, 30 fps, 3840x2160, keys inside [0, duration]", () => {
    expect(a.fps).toBe(30); expect(a.duration).toBe(30); expect(a.frames).toBe(900);
    expect([a.width, a.height]).toEqual([3840, 2160]);
    for (const k of spec.keys) { expect(k.t).toBeGreaterThanOrEqual(0); expect(k.t).toBeLessThanOrEqual(30); }
    expect(spec.keys[0].t).toBe(0); expect(spec.keys.at(-1).t).toBe(30);
  });
  test("frame(i) is a pure function of i: identical across calls and instances", () => {
    for (const i of [0, 1, 17, 180, 450, 777, 899]) {
      const p = a.pose(i), q = b.pose(i), r = a.pose(i);
      expect(p).toEqual(q); expect(p).toEqual(r);
    }
  });
  test("--preview (5 fps) samples the very same curve", () => {
    expect(a.frameCount(5)).toBe(150);
    for (let k = 0; k < 150; k += 7) expect(a.pose(k, 5)).toEqual(a.pose(k * 6, 30));
  });
  test("no NaN, sane fov, camera always well above the sea", () => {
    for (let i = 0; i < 900; i++) {
      const p = a.pose(i);
      for (const v of [...p.pos, ...p.look, p.fov, p.hours]) expect(Number.isFinite(v)).toBe(true);
      expect(p.fov).toBeGreaterThan(25); expect(p.fov).toBeLessThan(60);
      expect(p.pos[1]).toBeGreaterThan(40);
    }
  });
  test("smooth motion: no frame-to-frame jump above 3x the median step", () => {
    const steps = []; for (let i = 1; i < 900; i++) { const p = a.pose(i - 1).pos, q = a.pose(i).pos; steps.push(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])); }
    const sorted = [...steps].sort((x, y) => x - y), med = sorted[450];
    const jerk = steps.slice(1).map((s, i) => Math.abs(s - steps[i]));
    expect(Math.max(...jerk)).toBeLessThan(med * 0.25);
  });
  test("shot list covers the film; the clock only moves forward and ends at night", () => {
    const shots = spec.shots; expect(shots[0].from).toBe(0); expect(shots.at(-1).to).toBe(30);
    for (let i = 1; i < shots.length; i++) expect(shots[i].from).toBe(shots[i - 1].to);
    let prev = 0; for (let i = 0; i < 900; i++) { const h = a.pose(i).hours; expect(h).toBeGreaterThanOrEqual(prev - 1e-9); prev = h; }
    expect(a.pose(0).hours).toBeLessThan(17.1); expect(a.pose(899).hours).toBeGreaterThan(19.3);
  });
  test("title card fades in only at the end", () => {
    expect(a.pose(0).title).toBe(0); expect(a.pose(Math.floor(spec.title.from * 30) - 1).title).toBe(0);
    expect(a.pose(899).title).toBeGreaterThan(0.99);
  });
  test("render plans: full = 900 frames at 3840x2160, preview = 150 frames at 960x540, same poses", () => {
    const full = framePlan(spec), prev = previewPlan(spec);
    expect(full.frames.length).toBe(900); expect([full.width, full.height]).toEqual([3840, 2160]);
    expect(prev.frames.length).toBe(150); expect([prev.width, prev.height, prev.fps]).toEqual([960, 540, 5]);
    expect(prev.frames[10].pose).toEqual(full.frames[60].pose);
    expect(full.frames[899].file).toBe("f00899.jpg");
  });
});

describe("tour data (data/tour.json v2)", () => {
  const stops = mergeStops(landmarks, tour);
  test("7 stops in landmark order, each with a v2 camera", () => {
    expect(stops.map((s) => s.id)).toEqual(landmarks.map((s) => s.id));
    for (const s of stops) {
      expect(s.cam.pos.length).toBe(3); expect(s.cam.look.length).toBe(3);
      expect(s.cam.fov).toBeGreaterThanOrEqual(30); expect(s.cam.fov).toBeLessThanOrEqual(55);
      expect(s.ja && s.en && s.blurb?.ja && s.blurb?.en).toBeTruthy();
    }
  });
  test("each camera frames its landmark (landmark within 25 deg of the view axis)", () => {
    const L = new Map(landmarks.map((s) => [s.id, s]));
    for (const s of stops) {
      const e = L.get(s.id).enu, c = s.cam;
      if (s.vantage) { expect(Math.hypot(c.pos[0] - e[0], c.pos[2] - e[2])).toBeLessThan(1500); continue; }   // the view *from* the landmark
      const d = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]], w = [e[0] - c.pos[0], e[1] - c.pos[1], e[2] - c.pos[2]];
      const cos = (d[0] * w[0] + d[1] * w[1] + d[2] * w[2]) / (Math.hypot(...d) * Math.hypot(...w));
      expect(Math.acos(Math.min(1, cos)) * 180 / Math.PI).toBeLessThan(25);
    }
  });
  test("orbit parameters are gentle and bounded", () => {
    for (const s of stops) { const o = { ...ORBIT_DEFAULTS, ...s.orbit }; expect(o.rate).toBeLessThanOrEqual(1); expect(o.max).toBeLessThanOrEqual(20); expect(Math.abs(o.dolly)).toBeLessThan(0.15); }
  });
  test("v1-compatible fields kept for the tour.json fallback", () => {
    for (const s of tour.stops) { expect(typeof s.lat).toBe("number"); expect(typeof s.lon).toBe("number"); expect(s.cam).toBeTruthy(); }
  });
});

describe("orbit and transitions", () => {
  const stop = { cam: { pos: [0, 100, 300], look: [0, 0, 0], fov: 40 }, orbit: { rate: 0.6, max: 10, dolly: 0.05 } };
  test("orbit starts exactly on the stop pose with zero speed", () => {
    expect(close(orbitPose(stop, 0).pos, stop.cam.pos)).toBe(true);
    const f = (t) => orbitPose(stop, t).pos; expect(Math.hypot(...velR(f, 0, 1e-5))).toBeLessThan(0.05);
  });
  test("orbit yaw saturates at `max` degrees, however long the visitor stays", () => {
    const p = orbitPose(stop, 1e5).pos, ang = Math.atan2(p[0], p[2]) * 180 / Math.PI;
    expect(Math.abs(ang)).toBeLessThanOrEqual(10.0001); expect(Math.abs(ang)).toBeGreaterThan(9.9);
  });
  test("transition starts at the current pose with the current velocity, ends on the stop", () => {
    const from = { pos: [0, 150, 0], look: [100, 0, 0], fov: 40 }, to = { pos: [2000, 200, 1500], look: [2400, 0, 1700], fov: 44 };
    const tr = transitionPath(from, to, { vel: [3, 0, -2] });
    expect(close(tr(0).pos, from.pos)).toBe(true); expect(close(tr(tr.duration).pos, to.pos)).toBe(true);
    expect(close(velR((t) => tr(t).pos, 0, 1e-6), [3, 0, -2], 1e-3)).toBe(true);
    expect(tr(tr.duration / 2).pos[1]).toBeGreaterThan(200);                         // lifted arc on a long hop
    expect(tr.duration).toBeGreaterThanOrEqual(3.6); expect(tr.duration).toBeLessThanOrEqual(8);
  });
});

describe("phone framing", () => {
  test("fitFov keeps desktop poses, widens portrait (bounded)", () => {
    expect(fitFov(42, 16 / 9)).toBe(42); expect(fitFov(42, 4 / 3)).toBe(42); expect(fitFov(42, 0.9)).toBeGreaterThan(42);
    const phone = fitFov(42, 390 / 844); expect(phone).toBeGreaterThan(60); expect(phone).toBeLessThanOrEqual(80);
    // the 16:9 horizontal coverage kept on the phone is at least 55%
    const h169 = 2 * Math.atan(Math.tan(21 * Math.PI / 180) * 16 / 9), hPh = 2 * Math.atan(Math.tan(phone / 2 * Math.PI / 180) * 390 / 844);
    expect(hPh / h169).toBeGreaterThan(0.55);
  });
});

describe("tour director + events", () => {
  globalThis.addEventListener ??= () => {};
  const mkFly = () => createFlyCamera({ camera: new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 60000), dom: new EventTarget(), heightAt: () => 0 });
  test("emitter: on / off / once / *", () => {
    const e = createEmitter(), got = [];
    const off = e.on("a", (d) => got.push(["a", d.x])); e.once("b", () => got.push(["b"])); e.on("*", (d, t) => got.push(["*", t]));
    e.emit("a", { x: 1 }); e.emit("b"); e.emit("b"); off(); e.emit("a", { x: 2 });
    expect(got).toEqual([["a", 1], ["*", "a"], ["b"], ["*", "b"], ["*", "b"], ["*", "a"]]);
  });
  test("auto tour visits the 7 stops in order in about 90 s and emits enter/arrive/leave/end", () => {
    const fly = mkFly(), events = createEmitter(), log = [];
    events.on("*", (d, t) => log.push([t, d.index ?? null]));
    const stops = mergeStops(landmarks, tour);
    fly.setFromLook(new THREE.Vector3(...stops[0].cam.pos), new THREE.Vector3(...stops[0].cam.look));
    const tr = createTour({ fly, stops, events });
    tr.goto(0, { instant: true }); log.length = 0;
    tr.play({ from: 0 });
    let T = 0; const dt = 1 / 30;
    while (T < 200 && !log.some(([t]) => t === "tour:end")) { fly.update(dt); T += dt; }
    const arrivals = log.filter(([t]) => t === "stop:arrive").map(([, i]) => i);
    expect(arrivals).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(log.filter(([t]) => t === "stop:leave").map(([, i]) => i)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(log[0][0]).toBe("tour:start");
    expect(T).toBeGreaterThan(80); expect(T).toBeLessThan(100);
    // the camera ends on the last stop's orbit, close to its designed pose
    const last = stops[6].cam.pos, p = fly.pose().pos;
    expect(Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2])).toBeLessThan(Math.hypot(...last.map((v, i) => v - stops[6].cam.look[i])) * 0.25);
  });
  test("user input pauses the auto tour", () => {
    const fly = mkFly(), events = createEmitter(), stops = mergeStops(landmarks, tour);
    const tr = createTour({ fly, stops, events }); let paused = false; events.on("tour:pause", () => (paused = true));
    tr.play(); for (let i = 0; i < 30; i++) fly.update(1 / 30);
    fly.setRails(null); /* simulate */ tr.pause();
    expect(paused).toBe(true); expect(tr.playing).toBe(false);
  });
});

describe("opening: gallery <-> city mapping and the dive timeline", () => {
  const map = splats?.model?.enu ? { scale: splats.model.enu.scale, translation: splats.model.enu.translation } : DEFAULT_MAP;
  test("DEFAULT_MAP matches data/splats/splats.json model.enu", () => {
    if (!splats) return;
    expect(DEFAULT_MAP.scale).toBeCloseTo(splats.model.enu.scale, 6); expect(DEFAULT_MAP.translation).toEqual(splats.model.enu.translation);
  });
  test("gallery -> ENU -> gallery round-trips; the P3 portal suggestion maps to its stated ENU pose", () => {
    const g = [-0.9, 0.55, 1];
    expect(close(enuToGallery(galleryToEnu(g, map), map), g, 1e-9)).toBe(true);
    if (splats?.model?.portal) expect(close(galleryToEnu(splats.model.portal.gallery.pos, map), splats.model.portal.enu.pos, 0.06)).toBe(true);
  });
  test("Pier 7 lies inside the model (the reveal starts on the table)", () => {
    const g = enuToGallery(PIER7, map), w = splats?.model?.widthMetres ?? 3.06, d = splats?.model?.depthMetres ?? 1.76;
    expect(Math.abs(g[0])).toBeLessThan(w / 2); expect(Math.abs(g[2])).toBeLessThan(d / 2);
  });
  const stop0 = mergeStops(landmarks, tour)[0];
  const tr = openingTrack({ stop: stop0, map });
  test("timeline: 3.5 s dive, 6 s reveal, then stop 01", () => {
    expect(TIMELINE.dive).toBe(3.5); expect(TIMELINE.reveal).toBe(6);
    expect(tr.times.handoff).toBe(3.5); expect(tr.times.revealEnd).toBe(9.5);
    expect(close(tr(tr.times.end).pos, stop0.cam.pos)).toBe(true); expect(close(tr(tr.times.end).look, stop0.cam.look)).toBe(true);
  });
  test("the splat is fully dissolved before the camera drops below 0.3 m gallery height", () => {
    let minVisibleH = Infinity;
    for (let t = 0; t <= tr.times.end; t += 0.01) {
      const hG = enuToGallery(tr(t).pos, map)[1];
      if (dissolveAt(t) > 0) minVisibleH = Math.min(minVisibleH, hG);
    }
    expect(minVisibleH).toBeGreaterThan(DISSOLVE_MIN_H + 0.05);
    expect(dissolveAt(TIMELINE.dive - 1e-6)).toBe(0);
  });
  test("the gallery camera never passes through the glass while the gallery shows", () => {
    for (let t = 0; t <= TIMELINE.dissolve[1]; t += 0.01) expect(enuToGallery(tr(t).pos, map)[1]).toBeGreaterThan(GLASS_Y + 0.05);
  });
  test("dive starts on the idle gallery pose; handoff frames the reveal centre", () => {
    expect(close(enuToGallery(tr(0).pos, map), OPENING_DEFAULTS.idle.pos, 1e-9)).toBe(true);
    const p = tr(TIMELINE.dive), d = p.look.map((v, i) => v - p.pos[i]), w = PIER7.map((v, i) => v - p.pos[i]);
    const cos = (d[0] * w[0] + d[1] * w[1] + d[2] * w[2]) / (Math.hypot(...d) * Math.hypot(...w));
    expect(Math.acos(cos) * 180 / Math.PI).toBeLessThan(p.fov * 0.5);             // Pier 7 inside the vertical fov cone
  });
  test("camera speed is continuous through the handoff (no jolt when the city takes over)", () => {
    const f = (t) => tr(t).pos, l = velL(f, TIMELINE.dive, 1e-5), r = velR(f, TIMELINE.dive, 1e-5);
    expect(Math.hypot(...l.map((v, i) => v - r[i]))).toBeLessThan(1);
  });
  test("dissolve curve is monotone 1 -> 0", () => {
    let prev = 1; for (let t = 0; t < 4; t += 0.01) { const m = dissolveAt(t); expect(m).toBeLessThanOrEqual(prev + 1e-12); prev = m; }
    expect(dissolveAt(0)).toBe(1); expect(smootherstep(0.5)).toBeCloseTo(0.5, 9);
  });
});

describe("render helpers: attribution + machine gates", () => {
  test("attribution parts: text, html (logo img + text), typed items", () => {
    const p = attributionParts([{ text: "出典：国土地理院" }, { html: '<img src="https://x/logo.png"> Data &copy; Google' }, { type: "string", value: "Cesium ion" }, "plain"]);
    expect(p.texts).toContain("出典：国土地理院"); expect(p.texts).toContain("Data © Google"); expect(p.texts).toContain("Cesium ion"); expect(p.images).toEqual(["https://x/logo.png"]);
  });
  test("film gate: 4K film only before 12:45Z finishing by 14:00Z, or after 02:00Z; never 14:00Z-02:00Z", () => {
    const at = (h, m) => new Date(Date.UTC(2026, 8, 29, h, m));
    expect(machine.filmGate(30 * 60000, at(10, 0)).ok).toBe(true);
    expect(machine.filmGate(30 * 60000, at(12, 50)).ok).toBe(false);
    expect(machine.filmGate(90 * 60000, at(12, 40)).ok).toBe(false);
    expect(machine.filmGate(10 * 60000, at(15, 0)).ok).toBe(false);
    expect(machine.filmGate(10 * 60000, at(1, 30)).ok).toBe(false);
    expect(machine.filmGate(60 * 60000, at(2, 30)).ok).toBe(true);
  });
});
