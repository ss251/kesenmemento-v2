// [mobile-play] 一本釣り's trip meshes (the spray, the deck fish, the crew and the angler) are built when a trip needs them,
// not when the town loads, and on a phone freed when it is over; the view stops setting the camera's field of view ashore.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import * as THREE from 'three';

const KEYS = ['document', 'window'];
const saved = {};
let createContext, createView, boatStations, _resetLazy;

beforeAll(async () => {
  for (const k of KEYS) saved[k] = globalThis[k];
  class Ctx2D { measureText() { return { width: 10 }; } createLinearGradient() { return { addColorStop() {} }; } createRadialGradient() { return { addColorStop() {} }; } }
  const ctxProxy = () => new Proxy(new Ctx2D(), {
    get(t, k) { if (k in t) return t[k]; if (k === 'canvas') return { width: 512, height: 512 }; return () => {}; },
    set(t, k, v) { t[k] = v; return true; },
  });
  class FakeCanvas { constructor() { this.width = 512; this.height = 512; this.style = {}; } getContext() { return ctxProxy(); } toDataURL() { return 'data:,'; } }
  globalThis.document = { createElement: () => new FakeCanvas(), body: { appendChild() {} }, addEventListener() {}, fonts: { load: async () => [] } };
  globalThis.window = globalThis;
  ({ createContext } = await import('../src/anime/core/ctx.js'));
  ({ createView } = await import('../src/anime/play/ippon/view.js'));
  ({ boatStations } = await import('../src/anime/world/ship/katsuo-boat.js'));
  ({ _resetLazy } = await import('../src/anime/play/kit/lazy.js'));
});
afterAll(() => { for (const k of KEYS) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; } });

function setup(phone = true) {
  _resetLazy();
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 390 / 844);
  const ctx = createContext({ scene, camera, renderer: null, audio: null, quality: { name: 'low', phone }, sunDir: new THREE.Vector3(0.2, 1, 0.2) });
  ctx.fovFor = () => 88;
  camera.fov = 88;
  const view = createView(ctx, boatStations(), { phone });
  const schools = [{ x: 900, z: 900 }, { x: 950, z: 900 }, { x: 900, z: 950 }];
  const vis = { ship: { x: 579.5, z: 650.4, yaw: -2.7, y: 0 }, schools, nSchools: 3, nabura: 0, phase: 'quay', spray: 0, baitPulse: 0, fishN: 0, dist: 999, near: 0, t: 0, aboard: 0, ownCam: 0, flyStart: 0, justLanded: 0, perfect: 0, previewArc: 0, firstCatch: 0, look: '', kick: 0 };
  return { ctx, view, vis, camera };
}
const named = (ctx, name) => { let hit = null; ctx.scene.traverse((o) => { if (o.name === name) hit = o; }); return hit; };

describe('一本釣り builds its trip when a trip needs it', () => {
  test('ashore: no trip meshes, the flag over the boat, and the screen keeps its field of view', () => {
    const { ctx, view, vis, camera } = setup();
    for (let i = 0; i < 3; i++) view.update(vis, 1 / 60);
    expect(named(ctx, 'ippon:crew')).toBe(null);
    expect(named(ctx, 'ippon:fish')).toBe(null);
    expect(named(ctx, 'ippon:spray')).toBe(null);
    expect(named(ctx, 'ippon:flag')).not.toBe(null);
    expect(named(ctx, 'gulls')).toBe(null);   // the birds over the schools come with the trip
    expect(camera.fov).toBe(88);   // deploy #5 set 50 here every frame
  });

  test('aboard: built and shown; ashore again on a phone: freed, and the field of view comes back', () => {
    const { ctx, view, vis, camera } = setup(true);
    vis.aboard = 1;
    view.update(vis, 1 / 60);
    const crew = named(ctx, 'ippon:crew');
    expect(crew).not.toBe(null);
    expect(named(ctx, 'ippon:fish')).not.toBe(null);
    expect(named(ctx, 'gulls')).not.toBe(null);
    expect(view.trip.root.visible).toBe(true);
    expect(camera.fov).toBe(50);   // the trip's own camera
    let gone = 0; crew.geometry.addEventListener('dispose', () => { gone++; });
    vis.aboard = 0;
    view.update(vis, 1 / 60);
    expect(named(ctx, 'ippon:crew')).toBe(null);
    expect(gone).toBe(1);
    expect(camera.fov).toBe(88);
    // the next trip builds it again, and the cached fish material is patched once, not twice
    vis.aboard = 1;
    view.update(vis, 1 / 60);
    const fish = named(ctx, 'ippon:fish');
    expect(fish).not.toBe(null);
    const sh = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>', uniforms: {} };
    fish.material.onBeforeCompile(sh, null);
    expect(sh.vertexShader.split('attribute float aLand').length - 1).toBe(1);
  });

  test('a desktop keeps the trip built and hides it ashore', () => {
    const { ctx, view, vis } = setup(false);
    vis.aboard = 1;
    view.update(vis, 1 / 60);
    vis.aboard = 0;
    view.update(vis, 1 / 60);
    expect(named(ctx, 'ippon:crew')).not.toBe(null);
    expect(view.trip.root.visible).toBe(false);
  });
});
