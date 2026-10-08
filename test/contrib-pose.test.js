// [contrib] The camera pose of a report (core/pose.js): the ENU <-> lat / lon frame, the compass heading, the capture from a live camera,
// and the ?cam=x,y,z,heading,pitch,fov link (query round-trip), down to the Player that restores it.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import * as L from "../src/anime/world/layout.js";
import { Player } from "../src/anime/core/player.js";
import {
  ORIGIN, M_PER_DEG, MODES, round, norm360, norm180, enuToLatLon, latLonToEnu, headingFromYaw, yawFromHeading, forwardFromQuaternion, anglesFromQuaternion,
  quaternionFromYawPitch, deriveMode, deriveTimePreset, deriveSeason, viewportOf, capturePose, poseProblems, poseToCam, poseToQuery, queryToPose, poseToCamArgs,
  poseToUrl, poseToJson, presetHours,
} from "../src/anime/core/pose.js";
import { APP_VERSION, LAYOUT_VERSION } from "../src/anime/core/buildinfo.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
const lcg = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

describe("the frame: ENU metres <-> lat / lon (x east, z south, origin 38.9060 N 141.5750 E)", () => {
  test("the spec's formulas: lon = x / 86744 + 141.5750, lat = 38.9060 - z / 111014", () => {
    expect(ORIGIN).toEqual({ lat: 38.9060, lon: 141.5750 });
    expect(M_PER_DEG).toEqual({ lon: 86744, lat: 111014 });
    expect(enuToLatLon(0, 0)).toEqual({ lat: 38.906, lon: 141.575 });
    expect(enuToLatLon(86744, 0).lon).toBeCloseTo(142.575, 9);
    expect(enuToLatLon(0, 111014).lat).toBeCloseTo(37.906, 9);   // z grows SOUTH
    expect(enuToLatLon(0, -111014).lat).toBeCloseTo(39.906, 9);
    expect(enuToLatLon(500, -250)).toEqual({ lat: 38.906 + 250 / 111014, lon: 141.575 + 500 / 86744 });
  });
  test("it is the app's own frame (world/layout.js) both ways", () => {
    for (const [x, z] of [[0, 0], [341.6, -23.4], [-1200, 3300], [2776, 3244]]) {
      const a = enuToLatLon(x, z), b = L.xzToLl(x, z);
      expect(a.lat).toBeCloseTo(b.lat, 12); expect(a.lon).toBeCloseTo(b.lon, 12);
      const c = latLonToEnu(a.lat, a.lon), d = L.llToXZ(a.lat, a.lon);
      expect(c.x).toBeCloseTo(x, 6); expect(c.z).toBeCloseTo(z, 6); expect(d[0]).toBeCloseTo(x, 6); expect(d[1]).toBeCloseTo(z, 6);
    }
    expect(ORIGIN).toEqual(L.ORIGIN); expect(M_PER_DEG).toEqual(L.M_PER_DEG);
  });
  test("a round trip through lat / lon is exact to a millimetre over the whole city", () => {
    const r = lcg(7);
    for (let i = 0; i < 200; i++) {
      const x = (r() - 0.5) * 12000, z = (r() - 0.5) * 12000, ll = enuToLatLon(x, z), back = latLonToEnu(ll.lat, ll.lon);
      expect(Math.abs(back.x - x)).toBeLessThan(1e-6); expect(Math.abs(back.z - z)).toBeLessThan(1e-6);
    }
  });
});

describe("angles: the engine's yaw is the negative of a compass heading", () => {
  test("round() never gives -0; norm360 / norm180 wrap", () => {
    expect(Object.is(round(-0.001, 2), 0)).toBe(true);
    expect(norm360(-90)).toBe(270); expect(norm360(360)).toBe(0); expect(norm360(725)).toBe(5); expect(norm360(-720.5)).toBe(359.5);
    expect(norm180(270)).toBe(-90); expect(norm180(180)).toBe(180); expect(norm180(-180)).toBe(180); expect(norm180(540)).toBe(180);
  });
  test("yaw 0 looks north = heading 0; yaw +90 looks west = heading 270; yaw -90 looks east = heading 90", () => {
    expect(headingFromYaw(0)).toBe(0); expect(headingFromYaw(90)).toBe(270); expect(headingFromYaw(-90)).toBe(90); expect(headingFromYaw(180)).toBe(180);
    expect(yawFromHeading(0)).toBe(0); expect(yawFromHeading(270)).toBe(90); expect(yawFromHeading(90)).toBe(-90);
    for (const h of [0, 1, 45, 90, 179.5, 180, 270, 359.5]) expect(headingFromYaw(yawFromHeading(h))).toBeCloseTo(h, 9);
  });
  test("tools/anime/photo-pairs.mjs does the same: __camSpec(... -heading ...)", () => {
    expect(read("tools/anime/photo-pairs.mjs")).toContain("${-p.heading}");
  });
  test("forward / heading / pitch of the engine's camera quaternion (Euler YXZ, as Player.applyCamera sets it)", () => {
    const r = lcg(11), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ");
    for (let i = 0; i < 300; i++) {
      const yaw = (r() - 0.5) * 720, pitch = (r() - 0.5) * 170;
      e.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, "YXZ"); q.setFromEuler(e);
      const a = anglesFromQuaternion(q);
      expect(Math.abs(norm180(a.heading - headingFromYaw(yaw)))).toBeLessThan(1e-6);
      expect(Math.abs(a.pitch - pitch)).toBeLessThan(1e-6);
      const f = forwardFromQuaternion(q), t = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      expect(f.x).toBeCloseTo(t.x, 9); expect(f.y).toBeCloseTo(t.y, 9); expect(f.z).toBeCloseTo(t.z, 9);
      const mine = quaternionFromYawPitch(yaw, pitch), sign = Math.sign(mine.x * q.x + mine.y * q.y + mine.z * q.z + mine.w * q.w);   // (q and -q are the same rotation)
      expect(mine.x * sign).toBeCloseTo(q.x, 9); expect(mine.y * sign).toBeCloseTo(q.y, 9); expect(mine.z * sign).toBeCloseTo(q.z, 9); expect(mine.w * sign).toBeCloseTo(q.w, 9);
    }
  });
  test("the poles: looking straight up / down gives pitch +-90 (no NaN from asin)", () => {
    expect(anglesFromQuaternion(quaternionFromYawPitch(30, 90)).pitch).toBeCloseTo(90, 6);
    expect(anglesFromQuaternion(quaternionFromYawPitch(30, -90)).pitch).toBeCloseTo(-90, 6);
  });
});

/** A context like the app's: a real PerspectiveCamera plus the services the pose reads. */
function fakeCtx({ pos = [120.5, 30.25, -60.126], yaw = 33, pitch = -12, fov = 55, mode = "walk", preset = "yugata", season = "autumn", clock = "16:30" } = {}) {
  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 30000);
  camera.position.set(...pos); camera.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, "YXZ");
  const S = { time: { preset, clock: () => clock }, season: { id: season }, life: { hud: { view: "drone" }, tour: { flying: false, playing: false } }, explore: { drive: { active: false } } };
  const ctx = { camera, services: S, playerObj: { fly: false } };
  if (mode === "drive") S.explore.drive.active = true;
  if (mode === "fly") { ctx.playerObj.fly = true; S.life.hud.view = "walk"; }
  if (mode === "drone") ctx.playerObj.fly = true;
  if (mode === "sail") S.sail = { active: true };
  return ctx;
}

describe("capturePose: the camera now, as the JSON that goes with a report", () => {
  const now = new Date("2026-10-05T03:04:05.678Z"), win = { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2 };
  test("every field of the spec's pose, rounded", () => {
    const p = capturePose(fakeCtx(), { now, win });
    expect(Object.keys(p).sort()).toEqual(["appVersion", "at", "enu", "fov", "heading", "latlon", "layoutVersion", "mode", "pitch", "season", "timePreset", "viewport"]);
    expect(p.enu).toEqual([120.5, 30.25, -60.13]);   // (-60.126 rounds to -60.13: the pose is to a centimetre)
    const ll = enuToLatLon(120.5, -60.126);
    expect(p.latlon).toEqual([round(ll.lat, 7), round(ll.lon, 7)]);
    expect(p.heading).toBe(327);   // yaw 33 -> compass 327 (north-west-ish: turned to the west of north)
    expect(p.pitch).toBe(-12); expect(p.fov).toBe(55);
    expect(p.mode).toBe("walk"); expect(p.at).toBe("2026-10-05T03:04:05.678Z");
    expect(p.timePreset).toBe("yugata"); expect(p.season).toBe("autumn");
    expect(p.viewport).toEqual({ w: 1440, h: 900, dpr: 2 });
    expect(p.appVersion).toBe(APP_VERSION); expect(p.layoutVersion).toBe(LAYOUT_VERSION);
    expect(typeof APP_VERSION).toBe("string"); expect(APP_VERSION.length).toBeGreaterThan(0); expect(LAYOUT_VERSION.length).toBeGreaterThan(0);
  });
  test("it validates, survives JSON, and the build stamps are injectable", () => {
    const p = capturePose(fakeCtx(), { now, win, appVersion: "0.1.0+abc1234", layoutVersion: "v1.deadbeef" });
    expect(poseProblems(p)).toEqual([]);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    expect(p.appVersion).toBe("0.1.0+abc1234"); expect(p.layoutVersion).toBe("v1.deadbeef");
  });
  test("heading is a compass heading whatever the yaw (north 0, east 90, south 180, west 270)", () => {
    for (const [yaw, h] of [[0, 0], [-90, 90], [180, 180], [-180, 180], [90, 270], [270, 90], [360, 0], [-0.001, 0]]) {
      expect(capturePose(fakeCtx({ yaw, pitch: 0 }), { now, win }).heading).toBe(h);
    }
  });
  test("a heading that rounds up to 360 is 0 (north), never 360", () => {
    expect(capturePose(fakeCtx({ yaw: 0.0001 }), { now, win }).heading).toBe(0);
    expect(capturePose(fakeCtx({ yaw: -0.0001 }), { now, win }).heading).toBe(0);
  });
  test("poseProblems names the fields that are wrong", () => {
    const p = capturePose(fakeCtx(), { now, win });
    expect(poseProblems(null)).toEqual(["pose"]);
    expect(poseProblems({ ...p, enu: [1, 2] })).toEqual(["enu"]);
    expect(poseProblems({ ...p, latlon: [100, 0] })).toEqual(["latlon"]);
    expect(poseProblems({ ...p, heading: 360 })).toEqual(["heading"]);
    expect(poseProblems({ ...p, pitch: 91 })).toEqual(["pitch"]);
    expect(poseProblems({ ...p, fov: 0 })).toEqual(["fov"]);
    expect(poseProblems({ ...p, mode: "swim" })).toEqual(["mode"]);
    expect(poseProblems({ ...p, at: "yesterday" })).toEqual(["at"]);
    expect(poseProblems({ ...p, enu: [NaN, 0, 0], mode: "x" }).sort()).toEqual(["enu", "mode"]);
  });
  test("viewportOf reads the window (CSS px and the pixel ratio)", () => {
    expect(viewportOf({ innerWidth: 390.4, innerHeight: 843.6, devicePixelRatio: 3 })).toEqual({ w: 390, h: 844, dpr: 3 });
    expect(viewportOf({ innerWidth: 800, innerHeight: 600 })).toEqual({ w: 800, h: 600, dpr: 1 });
    expect(viewportOf(null)).toEqual({ w: 0, h: 0, dpr: 1 });
  });
});

describe("mode, time and season come from the app's services", () => {
  test("deriveMode: sail > drive > walk, then drone vs fly by the HUD's view", () => {
    for (const m of MODES) expect(deriveMode(fakeCtx({ mode: m }))).toBe(m);
    expect(deriveMode({})).toBe("walk"); expect(deriveMode(null)).toBe("walk");
    const c = fakeCtx({ mode: "fly" }); c.services.life.tour.flying = true; expect(deriveMode(c)).toBe("drone");   // an auto-tour flight
    const d = fakeCtx({ mode: "fly" }); d.services.life.tour.playing = true; expect(deriveMode(d)).toBe("drone");
    const v = fakeCtx({ mode: "walk" }); v.services.ship = { voyage: { active: true } }; expect(deriveMode(v)).toBe("sail");
    const s = fakeCtx({ mode: "drive" }); s.services.ship = { sail: { active: true } }; expect(deriveMode(s)).toBe("sail");
    const w = fakeCtx({ mode: "drive" }); w.playerObj.fly = true; expect(deriveMode(w)).toBe("drive");   // driving wins over a stale fly flag
  });
  test("deriveTimePreset: the preset id, else the JST clock, else null", () => {
    expect(deriveTimePreset(fakeCtx({ preset: "yoru" }))).toBe("yoru");
    expect(deriveTimePreset(fakeCtx({ preset: null, clock: "17:05" }))).toBe("17:05");
    expect(deriveTimePreset(fakeCtx({ preset: null, clock: "garbage" }))).toBeNull();
    expect(deriveTimePreset({ services: {} })).toBeNull();
  });
  test("deriveSeason: the season service, else life's", () => {
    expect(deriveSeason(fakeCtx({ season: "winter" }))).toBe("winter");
    expect(deriveSeason({ services: { life: { season: { id: "spring" } } } })).toBe("spring");
    expect(deriveSeason({ services: {} })).toBeNull();
    expect(deriveSeason({ services: { season: { id: "" } } })).toBeNull();   // (the backend refuses an empty string and accepts null)
    expect(capturePose({ camera: { position: { x: 0, y: 1.6, z: 0 }, quaternion: quaternionFromYawPitch(0, 0), fov: 55 }, services: { season: { id: "" } } }, { win: { innerWidth: 10, innerHeight: 10 } }).season).toBeNull();
  });
});

describe("the link: ?cam=x,y,z,heading,pitch,fov (query round-trip)", () => {
  const pose = { enu: [120.5, 30.25, -60.13], latlon: [38.9065, 141.5764], heading: 327, pitch: -12, fov: 55 };
  test("poseToCam / poseToQuery are six plain numbers, commas unescaped", () => {
    expect(poseToCam(pose)).toBe("120.5,30.25,-60.13,327,-12,55");
    expect(poseToQuery(pose)).toBe("cam=120.5,30.25,-60.13,327,-12,55");
    expect(poseToCam({ ...pose, heading: -90 })).toBe("120.5,30.25,-60.13,270,-12,55");
    expect(poseToCam({ ...pose, heading: 359.999, pitch: -0.0001 })).toBe("120.5,30.25,-60.13,0,0,55");   // (no 360, no -0)
  });
  test("queryToPose reads the bare value, cam=..., ?cam=..., a full URL, a URL and a URLSearchParams", () => {
    const want = queryToPose("120.5,30.25,-60.13,327,-12,55");
    expect(want.enu).toEqual([120.5, 30.25, -60.13]); expect(want.heading).toBe(327); expect(want.pitch).toBe(-12); expect(want.fov).toBe(55);
    expect(want.latlon).toEqual([round(enuToLatLon(120.5, -60.13).lat, 7), round(enuToLatLon(120.5, -60.13).lon, 7)]);
    for (const input of ["cam=120.5,30.25,-60.13,327,-12,55", "?cam=120.5,30.25,-60.13,327,-12,55&preset=hiru", "https://app.example/index.html?lang=en&cam=120.5,30.25,-60.13,327,-12,55#x",
      "?cam=120.5%2C30.25%2C-60.13%2C327%2C-12%2C55", new URL("https://app.example/?cam=120.5,30.25,-60.13,327,-12,55"), new URLSearchParams("cam=120.5,30.25,-60.13,327,-12,55")]) expect(queryToPose(input)).toEqual(want);
  });
  test("round trip: queryToPose(poseToQuery(p)) gives the pose back for 500 random views", () => {
    const r = lcg(2026);
    for (let i = 0; i < 500; i++) {
      const p = { enu: [round((r() - 0.5) * 8000, 2), round(r() * 400 - 5, 2), round((r() - 0.5) * 8000, 2)], heading: round(r() * 359.99, 2), pitch: round((r() - 0.5) * 170, 2), fov: round(30 + r() * 60, 2) };
      const q = queryToPose(poseToQuery(p)), ll = enuToLatLon(p.enu[0], p.enu[2]);
      expect(q.enu).toEqual(p.enu); expect(q.heading).toBe(p.heading); expect(q.pitch).toBe(p.pitch); expect(q.fov).toBe(p.fov);
      expect(q.latlon).toEqual([round(ll.lat, 7), round(ll.lon, 7)]);
      expect(queryToPose(poseToUrl(p, "https://app.example/index.html?old=1#frag")).enu).toEqual(p.enu);   // a whole link
    }
  });
  test("what is not six finite numbers in range is null: 5 numbers (the legacy yaw spec), 7, words, gaps, NaN, Infinity, out of range", () => {
    for (const bad of [null, undefined, "", "hero", "walk", "tour:market", "1,2,3,4,5", "1,2,3,4,5,6,7", "1,2,3,4,5,", "1,,3,4,5,6", "1,2,3,4,5,abc", "1,2,3,4,5,NaN", "1,2,3,4,5,Infinity",
      "1,2,3,4,95,55", "1,2,3,4,-95,55", "1,2,3,4,5,0", "1,2,3,4,5,200", "1e9,2,3,4,5,55", "1,2,1e9,4,5,55", "1,-900,3,4,5,55", "1,99999,3,4,5,55", "cam=", "?cam", "x=1", "1,2,3>4,5,6"]) expect([bad, queryToPose(bad)]).toEqual([bad, null]);
  });
  test("headings are normalised: 720 and -90 are 0 and 270; 360 is 0", () => {
    expect(queryToPose("0,10,0,720,0,55").heading).toBe(0); expect(queryToPose("0,10,0,-90,0,55").heading).toBe(270); expect(queryToPose("0,10,0,360,0,55").heading).toBe(0);
  });
  test("poseToCamArgs gives Player.setPose its yaw (negative heading), eye height and the fov", () => {
    expect(poseToCamArgs({ enu: [10, 25, -30], heading: 90, pitch: 5, fov: 60 })).toEqual({ x: 10, y: 25, z: -30, yaw: -90, pitch: 5, fov: 60 });
    expect(poseToCamArgs({ enu: [0, 0, 0], heading: 270, pitch: 0, fov: 55 }).yaw).toBe(90);
  });
  test("poseToUrl: the cam plus the light and the season of the screenshot", () => {
    const p = { ...pose, timePreset: "yuyake", season: "winter" };
    expect(poseToUrl(p, "https://app.example/")).toBe("https://app.example/?cam=120.5,30.25,-60.13,327,-12,55&preset=yuyake&season=winter");
    expect(poseToUrl({ ...p, timePreset: "17:05", season: null }, "https://app.example/index.html?old=1#x")).toBe("https://app.example/index.html?cam=120.5,30.25,-60.13,327,-12,55&hours=17.083");
    expect(poseToUrl({ ...p, timePreset: null, season: "nope" }, "")).toBe("?cam=120.5,30.25,-60.13,327,-12,55");
    expect(presetHours("yugata")).toBe(16.5); expect(presetHours("x")).toBeNull();
  });
  test("poseToJson is ASCII (tEXt is Latin-1): non-ASCII is escaped and parses back", () => {
    const j = poseToJson({ ...pose, note: "気仙沼 ✓ é" });
    expect(/^[\x20-\x7e]*$/.test(j)).toBe(true);
    expect(JSON.parse(j).note).toBe("気仙沼 ✓ é");
  });
});

describe("the round trip through the real Player: pose -> link -> setPose -> camera -> pose", () => {
  const mkPlayer = () => {
    globalThis.addEventListener ??= () => {};
    const dom = { addEventListener() {}, requestPointerLock() {} };
    const physics = { groundHeight: () => 0, resolve() {}, standable: () => true };
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
    return { p: new Player(camera, dom, physics, { x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 }), camera };
  };
  test("what main.js camSpec does with a six-number link reproduces the contributor's view to the centimetre and the hundredth of a degree", () => {
    const r = lcg(99), now = new Date("2026-10-05T00:00:00Z");
    for (let i = 0; i < 100; i++) {
      const ctx = fakeCtx({ pos: [(r() - 0.5) * 5000, r() * 300 + 2, (r() - 0.5) * 5000], yaw: (r() - 0.5) * 720, pitch: (r() - 0.5) * 160, fov: 40 + r() * 40 });
      const a = capturePose(ctx, { now });
      const link = queryToPose(poseToQuery(a));
      const { p, camera } = mkPlayer(), args = poseToCamArgs(link);
      p.setPose(args.x, args.z, args.yaw, args.pitch, args.y); camera.fov = args.fov;
      const b = capturePose({ ...ctx, camera }, { now });
      expect(b.enu).toEqual(a.enu); expect(b.fov).toBe(a.fov);
      expect(Math.abs(norm180(b.heading - a.heading))).toBeLessThanOrEqual(0.011); expect(Math.abs(b.pitch - a.pitch)).toBeLessThanOrEqual(0.011);
      expect(p.fly).toBe(true);   // an exact eye position is a free camera
    }
  });
});

describe("main.js and photo mode are wired to it", () => {
  const main = read("src/anime/main.js");
  test("camSpec restores a six-number link and pins the fov so resize() keeps it; the legacy forms are untouched", () => {
    expect(main).toContain("import { queryToPose, poseToCamArgs } from './core/pose.js'");
    expect(main).toContain("const link = queryToPose(s);");
    expect(main).toMatch(/player\.setPose\(a\.x, a\.z, a\.yaw, a\.pitch, a\.y\); fovPin = a\.fov;/);
    // [ui-c2] resize() asks ctx.fovFor, the one field-of-view function (core/fov.js), and that function lets a pinned fov win: so resize() still keeps the pin
    expect(main).toContain("ctx.fovFor = (aspect) => fovPin ?? fovFor(aspect);");
    expect(main).toContain("camera.fov = ctx.fovFor(camera.aspect);");
    expect(main).toMatch(/let fovPin = params\.get\('fov'\) \? Number\(params\.get\('fov'\)\) : null;/);
    // the older grammar is still there, in the same order
    expect(main).toContain("if (s.includes('>')) { const [a, b] = s.split('>')");
    expect(main).toContain("if ((v.length !== 4 && v.length < 5) || v.some((n) => !Number.isFinite(n))) throw new Error('camera spec does not resolve: ' + s);");
    expect(main.indexOf("queryToPose(s)")).toBeGreaterThan(main.indexOf("s.includes('>')"));
    expect(main.indexOf("queryToPose(s)")).toBeLessThan(main.indexOf("const v = s.split(',').map(Number);"));
  });
  test("photo mode reads the pose before it resizes the renderer and embeds it after the camera is back", () => {
    const photo = read("src/anime/ui/photo.js");
    expect(photo).toContain("capturePose(ctx)");
    expect(photo.indexOf("capturePose(ctx)")).toBeLessThan(photo.indexOf("r.setSize(W, H, false)"));
    expect(photo.indexOf("embedTextInBlob(blob, POSE_KEY, json)")).toBeGreaterThan(photo.indexOf("dispatchEvent(new Event('resize'))"));
    expect(photo).toContain("embedTextInDataUrl(url, POSE_KEY, json)");
  });
});
