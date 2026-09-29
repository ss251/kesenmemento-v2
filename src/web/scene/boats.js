// Boats v2 (V2-SPEC §8): today's 気仙沼漁協 arrivals as credible vessels at true scale, gliding from the bay mouth up
// the 西湾, under the かなえ大橋 and alongside the fish-market quay, on a water-only route baked from the GSI DEM and
// coastline (boats/routes.json, scripts/live/build-boat-routes.js). PBR hulls, foam wakes, directional nav lights at
// night, deck floodlights on moored boats, and serif name labels.
//
// API (v1-compatible, used by main.js):
//   createBoats({ heightAt, waterY }) -> { group, setArrivals(list), update(hours, time, night), arrivals, voyages,
//                                          replay({ duration }), setClock(h|null), setLabels(on), stats() }
//   update() also runs by itself from __RT.onFrame when main.js does not call it (it is a no-op when already called
//   this frame). The group lives in __RT.world, the glow lights in __RT.fx when the pipeline provides them.
//   window.__RT.boats = { replay, stopReplay, list, setLabels, setClock, stats } for the UI, the tour and the film.
import * as THREE from "three";
import { RT } from "../lib/rt.js";
import { buildVessel, SPECS } from "./boats/hulls.js";
import { createWakes } from "./boats/wake.js";
import { createLights, LIGHT } from "./boats/lights.js";
import { createLabels, labelParts } from "./boats/labels.js";
import { ROUTES, planVoyages, voyageAt, replayWindow, parseHM } from "./boats/timeline.js";

const KINDS = ["pole", "longline", "saury", "seine"], TRIMS = ["navy", "red", "teal"];

const deckGlow = { value: 0 };                                   // moored boats' deck floods lighting their own paint at night
function materials() {
  const paint = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.28, side: THREE.DoubleSide });
  paint.onBeforeCompile = (s) => {
    s.uniforms.uDeckGlow = deckGlow;
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uDeckGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * vec3(1.0, 0.8, 0.6) * uDeckGlow;");
  };
  paint.customProgramCacheKey = () => "klc-boat-paint";
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.85, emissive: new THREE.Color("#ffc58a"), emissiveIntensity: 0 });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.6, side: THREE.DoubleSide });
  const lamp = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0 });
  lamp.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;"); };
  lamp.customProgramCacheKey = () => "klc-boat-lamp";
  return { paint, glass, metal, lamp };
}

export function createBoats({ heightAt = () => 0, waterY = () => 0 } = {}) {
  const group = new THREE.Group(); group.name = "boats";
  const mats = materials();
  // one vessel design per (kind, trim); each design = 4 InstancedMeshes sharing one instanceMatrix
  const designs = new Map();
  const CAP = 24;
  function design(kind, trim) {
    const key = kind + "/" + trim;
    if (designs.has(key)) return designs.get(key);
    const v = buildVessel(kind, trim);
    const shared = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 16), 16); shared.setUsage(THREE.DynamicDrawUsage);
    const meshes = [];
    for (const [part, mat] of Object.entries(mats)) {
      const g = v.parts[part]; if (!g) continue;
      const m = new THREE.InstancedMesh(g, mat, CAP);
      m.instanceMatrix = shared; m.count = 0; m.frustumCulled = false; m.castShadow = part !== "glass" && part !== "lamp"; m.receiveShadow = part === "paint";
      m.name = `boat ${key} ${part}`; meshes.push(m); group.add(m);
    }
    const d = { key, v, shared, meshes, n: 0 };
    designs.set(key, d); return d;
  }
  const wakes = createWakes(40); group.add(wakes.mesh);
  const lights = createLights(640);
  const labels = typeof document !== "undefined" ? createLabels() : null;
  let lightParent = null;

  let arrivals = [], voyages = [];
  // background fleet: the finger moorings in the north basin (unlabelled scenery, not data)
  const scenery = (ROUTES.moored ?? []).map((m, i) => ({ id: "moored" + i, kind: m.kind === "longline" ? "longline" : i % 4 === 1 ? "saury" : "pole", trim: TRIMS[i % 3], pos: m.pos, heading: m.heading, scale: m.len / SPECS[m.kind === "longline" ? "longline" : i % 4 === 1 ? "saury" : "pole"].L, seed: i * 0.37 }));

  function setArrivals(list) {
    arrivals = (list ?? []).map((a) => ({ ...a, t: a.eta?.h ?? parseHM(a.time) })).filter((a) => a.t != null);
    voyages = planVoyages(arrivals);
    for (const v of voyages) design(v.kind, v.trim);
  }
  for (const s of scenery) design(s.kind, s.trim);

  // --------------------------------------------------------------- per-frame
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ"), p = new THREE.Vector3(), sc = new THREE.Vector3(), tmp = new THREE.Vector3();
  let clock = null, driven = false, lastStats = null, labelsOn = true, tint = new THREE.Color(1, 1, 1);
  const place = (d, x, y, z, heading, pitch, roll, s = 1) => {
    if (d.n >= CAP) return false;
    e.set(pitch, heading, roll); q.setFromEuler(e); p.set(x, y, z); sc.setScalar(s);
    m4.compose(p, q, sc); m4.toArray(d.shared.array, d.n * 16); d.n++; return true;
  };
  const toWorld = (local, x, y, z, heading, s = 1) => tmp.copy(local).multiplyScalar(s).applyAxisAngle(THREE.Object3D.DEFAULT_UP, heading).add(p.set(x, y, z));

  /** hours: JST scene clock; time: seconds (animation); night: 0..1 */
  function update(hours, time, night = 0) {
    driven = true;
    const h = clock ?? hours, wy = waterY() ?? 0;
    for (const d of designs.values()) d.n = 0;
    wakes.begin(); lights.begin();
    const items = [];
    const nav = night > 0.02;
    // scenery
    for (const s of scenery) {
      const d = design(s.kind, s.trim), bob = Math.sin(time * 0.7 + s.seed * 9) * 0.06;
      place(d, s.pos[0], wy + bob, s.pos[1], s.heading, Math.sin(time * 0.5 + s.seed) * 0.004, Math.sin(time * 0.43 + s.seed * 3) * 0.01, s.scale);
      if (nav) { const a = d.v.anchors; lights.add(toWorld(a.floods[1], s.pos[0], wy, s.pos[1], s.heading, s.scale).clone(), LIGHT.flood, { sizeM: 1.2, k: 0.55 }); lights.add(toWorld(a.mastTop, s.pos[0], wy, s.pos[1], s.heading, s.scale).clone(), LIGHT.white, { sizeM: 0.8, k: 0.8 }); }
    }
    // arrivals
    let under = 0, moored = 0;
    for (const v of voyages) {
      const st = voyageAt(v, h);
      if (st.state === "before") continue;
      const d = design(v.kind, v.trim), A = d.v.anchors, L = d.v.dims.L, B = d.v.dims.B;
      const moving = st.state === "under-way";
      const bob = Math.sin(time * (moving ? 1.1 : 0.7) + v.seed * 11) * (moving ? 0.12 : 0.05);
      const pitch = Math.sin(time * 0.9 + v.seed * 5) * (moving ? 0.01 : 0.003), roll = Math.sin(time * 0.62 + v.seed * 7) * (moving ? 0.022 : 0.008);
      if (!place(d, st.x, wy + bob, st.z, st.heading, pitch, roll)) continue;
      if (moving) { under++; wakes.add(st.x, wy, st.z, st.heading, L, B, st.speed01, v.seed * 17); } else moored++;
      if (nav) {
        const w = (loc) => toWorld(loc, st.x, wy + bob, st.z, st.heading).clone();
        const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
        if (moving) {
          lights.add(w(A.mastTop), LIGHT.white, { dirX: fx, dirZ: fz, arc: 225, sizeM: 1.1 });
          lights.add(w(A.port), LIGHT.red, { dirX: fx * 0.38 + fz * 0.92, dirZ: fz * 0.38 - fx * 0.92, arc: 112.5, sizeM: 1.0 });
          lights.add(w(A.stbd), LIGHT.green, { dirX: fx * 0.38 - fz * 0.92, dirZ: fz * 0.38 + fx * 0.92, arc: 112.5, sizeM: 1.0 });
          lights.add(w(A.stern), LIGHT.white, { dirX: -fx, dirZ: -fz, arc: 135, sizeM: 0.9 });
        } else {
          for (const f of A.floods) lights.add(w(f), LIGHT.flood, { sizeM: 1.6, k: 0.9 });
          lights.add(w(A.mastTop), LIGHT.white, { sizeM: 0.9, k: 0.7 });           // anchor light
        }
      }
      const lp = labelParts(v.arrival, v.kind);
      items.push({ id: v.id, anchor: toWorld(A.label, st.x, wy, st.z, st.heading).clone(), ...lp, state: st.state });
    }
    for (const d of designs.values()) { for (const m of d.meshes) m.count = d.n; d.shared.needsUpdate = true; }
    // light the glass and lamps at night; the wake follows the scene light
    mats.glass.emissiveIntensity = 2.2 * night; mats.lamp.emissiveIntensity = 0.6 * night; deckGlow.value = 0.06 * night;
    const light = 1 - 0.88 * night;
    wakes.end(time, light, tint);
    const cam = RT.camera, canvas = RT.renderer?.domElement;
    const hPx = canvas?.clientHeight || (typeof innerHeight !== "undefined" ? innerHeight : 1080);
    lights.end(Math.min(1, night * 1.4), cam, hPx);
    // lights belong in the post-atmosphere FX scene when the pipeline has one
    const want = RT.fx ?? group;
    if (lightParent !== want) { lights.points.removeFromParent(); want.add(lights.points); lightParent = want; }
    if (RT.world && group.parent !== RT.world) RT.world.add(group);
    labels?.update(items, cam, { w: canvas?.clientWidth || innerWidth, h: hPx }, labelsOn && !document.body.classList.contains("no-ui"));
    lastStats = { voyages: voyages.length, underWay: under, moored, scenery: scenery.length, lights: lights.points.geometry.drawRange.count, hours: +h.toFixed(3) };
    return under + moored + scenery.length;
  }

  // self-drive from __RT.onFrame when main.js did not call update() this frame
  RT.onFrame?.((dt, t) => {
    if (!driven) { let hh = 12, n = 0; try { hh = RT.getTime(); n = RT.nightFactor(); } catch { /* placeholders */ } update(hh, t, n); }
    driven = false;
  });

  // --------------------------------------------------------------- replay (today compressed into ~60 s)
  let replayRaf = 0;
  function replay({ duration = 60, onEnd } = {}) {
    stopReplay();
    const win = replayWindow(voyages); if (!win) return Promise.resolve(false);
    const setTime = (hh) => { try { RT.setTime(hh); } catch { clock = hh; } };
    const start = performance.now();
    RT.boats.replaying = true;
    return new Promise((resolve) => {
      const step = () => {
        const u = Math.min(1, (performance.now() - start) / (duration * 1000));
        setTime(win.from + (win.to - win.from) * u);                 // linear: the day's rhythm stays readable
        if (u < 1 && RT.boats.replaying) replayRaf = requestAnimationFrame(step);
        else { RT.boats.replaying = false; onEnd?.(); resolve(true); }
      };
      replayRaf = requestAnimationFrame(step);
    });
  }
  function stopReplay() { cancelAnimationFrame(replayRaf); if (RT.boats) RT.boats.replaying = false; }

  const api = {
    group, setArrivals, update,
    get arrivals() { return arrivals; },
    get voyages() { return voyages; },
    replay, stopReplay,
    setClock(hh) { clock = hh == null ? null : +hh; },
    setLabels(on) { labelsOn = !!on; },
    setTint(c) { tint.set(c); },
    stats: () => lastStats,
    replayWindow: () => replayWindow(voyages),
  };
  RT.boats = Object.assign(RT.boats ?? {}, {
    replay: (o) => api.replay(o), stopReplay: () => api.stopReplay(), setLabels: (on) => api.setLabels(on), setClock: (hh) => api.setClock(hh),
    list: () => voyages.map((v) => ({ vessel: v.arrival.vessel, kind: v.kind, time: v.arrival.time, departH: +v.departH.toFixed(3), berthH: +v.berthH.toFixed(3), berth: v.berth.pos })),
    stats: () => lastStats, window: () => replayWindow(voyages), replaying: false,
    toJSON() { return { voyages: voyages.length, replaying: this.replaying, stats: lastStats }; },
  });
  void heightAt;
  return api;
}
