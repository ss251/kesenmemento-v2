// [mobile-play] kit/lazy.js: a play mode's world is built when the mode starts, compiled behind the title card, and freed on a
// phone when the player leaves. Deploy #5 built every mode's world at startup (+49 programs at the phone's start view).
import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import { lazyWorld, lazyStats, freeTree, _resetLazy } from '../src/anime/play/kit/lazy.js';
import { courseModeList } from '../src/anime/play/courses/hub.js';

function fakeCtx({ phone = true } = {}) {
  const scene = new THREE.Scene();
  const dynamicRoot = new THREE.Group(); dynamicRoot.name = 'dynamic';
  scene.add(dynamicRoot);
  const _updates = [];
  const compiled = [];
  return {
    scene, dynamicRoot, _updates, compiled,
    camera: new THREE.PerspectiveCamera(),
    renderer: { compileAsync: async (obj, cam, target) => { compiled.push({ obj, cam, target }); return obj; } },
    quality: { phone },
    mat: { shared: new THREE.MeshBasicMaterial() },
    add(o) { o.traverse((c) => { c.userData.dynamic = true; }); dynamicRoot.add(o); return o; },
    onUpdate(fn) { _updates.push(fn); },
    onStep(fn) { fn.__step = true; _updates.push(fn); },
  };
}

/** A world like a mode's: its own geometry, material and texture, an instanced mesh, one shared material, an update. */
function buildInto(w, root, log) {
  const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const own = new THREE.MeshBasicMaterial({ map: tex });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), own);
  const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(), own, 8);
  const shared = new THREE.Mesh(new THREE.BoxGeometry(), w.mat.shared);
  mesh.visible = false;
  w.add(mesh); w.add(inst); w.add(shared);
  w.onUpdate(() => { log.push('tick'); });
  return { mesh, inst, shared, own, tex, root };
}

const disposed = (o) => { let n = 0; o.addEventListener('dispose', () => { n++; }); return () => n; };
const tick = (ctx) => { for (const fn of [...ctx._updates]) fn(1 / 60, 0); };

describe('a lazy world', () => {
  test('nothing is built until it is asked for; then once, into one group marked as play', () => {
    _resetLazy();
    const ctx = fakeCtx();
    let builds = 0;
    const w = lazyWorld(ctx, 'test', (wctx, root) => { builds++; return buildInto(wctx, root, []); });
    expect(w.built).toBe(false);
    expect(ctx.dynamicRoot.children.length).toBe(0);
    const p = w.ensure();
    expect(builds).toBe(1);
    expect(w.ensure()).toBe(p);
    expect(builds).toBe(1);
    expect(ctx.dynamicRoot.children).toEqual([w.root]);
    expect(w.root.name).toBe('play:test');
    let all = true; w.root.traverse((o) => { if (o.userData.play !== 'test' || !o.userData.noBatch || !o.userData.dynamic) all = false; });
    expect(all).toBe(true);
    expect(lazyStats().test).toMatchObject({ built: true, builds: 1, frees: 0 });
  });

  test('prepare() builds, compiles against the live scene, warms every object and puts the hidden ones back', async () => {
    _resetLazy();
    const ctx = fakeCtx();
    const w = lazyWorld(ctx, 'test', (wctx, root) => buildInto(wctx, root, []));
    const p = await w.prepare();
    expect(ctx.compiled).toHaveLength(1);
    expect(ctx.compiled[0].obj).toBe(w.root);
    expect(ctx.compiled[0].target).toBe(ctx.scene);
    expect(p.mesh.visible).toBe(false);
    expect(p.inst.frustumCulled).toBe(true);
    expect(w.ready).toBe(true);
    await w.prepare();
    expect(ctx.compiled).toHaveLength(1);   // a warm world is not compiled again
  });

  test('on a phone, leaving frees what only the world used and keeps what the town shares', async () => {
    _resetLazy();
    const ctx = fakeCtx({ phone: true });
    const town = new THREE.Mesh(new THREE.BoxGeometry(), ctx.mat.shared);
    ctx.scene.add(town);
    const log = [];
    const w = lazyWorld(ctx, 'test', (wctx, root) => buildInto(wctx, root, log));
    const p = w.ensure();
    const ownGeo = disposed(p.mesh.geometry), ownMat = disposed(p.own), ownTex = disposed(p.tex), inst = disposed(p.inst), shared = disposed(ctx.mat.shared);
    tick(ctx);
    expect(log).toEqual(['tick']);
    w.leave();
    expect(w.built).toBe(false);
    expect(ctx.dynamicRoot.children.length).toBe(0);
    expect(ownGeo()).toBe(1); expect(ownMat()).toBe(1); expect(ownTex()).toBe(1); expect(inst()).toBe(1);
    expect(shared()).toBe(0);
    tick(ctx);
    expect(log).toEqual(['tick']);   // its update is retired at once...
    await new Promise((r) => setTimeout(r, 5));
    expect(ctx._updates.length).toBe(0);   // ...and off the list after the frame
    expect(lazyStats().test).toMatchObject({ built: false, builds: 1, frees: 1 });
    // the next start builds it again
    w.ensure();
    expect(lazyStats().test).toMatchObject({ built: true, builds: 2 });
    tick(ctx);
    expect(log).toEqual(['tick', 'tick']);
  });

  test('a desktop keeps the world when the player leaves (the next start is instant)', () => {
    _resetLazy();
    const ctx = fakeCtx({ phone: false });
    const w = lazyWorld(ctx, 'test', (wctx, root) => buildInto(wctx, root, []));
    const p = w.ensure();
    w.leave();
    expect(w.built).toBe(true);
    expect(w.ensure()).toBe(p);
  });
});

describe('freeing one figure (the mission people past 180 m, the 一本釣り captain past 220 m)', () => {
  test('its body, both faces and their painted maps go; what the town still draws stays', () => {
    const ctx = fakeCtx();
    const sharedMap = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const town = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: sharedMap }));
    ctx.scene.add(town);
    const openMap = new THREE.DataTexture(new Uint8Array(4), 1, 1), blinkMap = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const open = new THREE.MeshBasicMaterial({ map: openMap }), blink = new THREE.MeshBasicMaterial({ map: blinkMap });
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(), open);
    const hat = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: sharedMap }));
    group.add(body, hat);
    ctx.add(group);
    const n = { body: disposed(body.geometry), open: disposed(open), blink: disposed(blink), openMap: disposed(openMap), blinkMap: disposed(blinkMap), shared: disposed(sharedMap) };
    freeTree(ctx, group, { extra: [open, blink] });
    expect(group.parent).toBe(null);
    expect(n.body()).toBe(1); expect(n.open()).toBe(1); expect(n.blink()).toBe(1);
    expect(n.openMap()).toBe(1); expect(n.blinkMap()).toBe(1);
    expect(n.shared()).toBe(0);   // the town's map is still drawn
  });
});

describe('the course cards build their rings behind the hub card', () => {
  const courses = [{ id: 'anba' }, { id: 'minato' }];
  const opts = { rows: () => [], strings: { ja: {}, en: {} }, start: () => {} };
  test('with prepare, each card prepares its own course; without, the card has none', async () => {
    const asked = [];
    const withPrep = courseModeList(courses, { ...opts, prepare: (id) => { asked.push(id); return Promise.resolve(); } });
    await withPrep[1].prepare();
    expect(asked).toEqual(['minato']);
    expect(courseModeList(courses, opts).every((m) => !('prepare' in m))).toBe(true);
  });
});

describe('prepare() compiles for the frame it will be drawn in', () => {
  test("the colour pass's linear target is set while the programs are made, then put back", async () => {
    _resetLazy();
    const ctx = fakeCtx();
    const rtColor = { name: 'rtColor' }, before = { name: 'whatever was bound' };
    let bound = before;
    const seen = [];
    ctx.pipeline = { targets: { rtColor } };
    ctx.renderer = {
      getRenderTarget: () => bound,
      setRenderTarget: (t) => { bound = t; },
      compileAsync: async (obj) => { seen.push(bound); return obj; },
    };
    const w = lazyWorld(ctx, 'test', (wctx, root) => buildInto(wctx, root, []));
    await w.prepare();
    expect(seen).toEqual([rtColor]);
    expect(bound).toBe(before);
  });
});
