// [play:hoya3d] The 3D ホヤぼーや (src/anime/play/avatar/hoya-model.js): builds headless, keeps the manual's rules
// (colours, line weight, no deformation), switches poses, and holds its budgets (triangles, draw calls).
import { describe, test, expect } from "bun:test";
import * as THREE from "three";
import { buildHoya, POSES, HOYA_COLORS, HOYA_LINE, HOYA_SCALE, HOYA_HEIGHT, HOYA_QUALITIES } from "../src/anime/play/avatar/hoya-model.js";

// DOM stubs (canvas drawing is a no-op), as in test/ship-sail.test.js: the model itself draws no canvas, but the
// world's material helpers may, and nothing here may need a browser.
class Ctx2D {
  constructor(c) { this.canvas = c; this.font = "10px sans-serif"; }
  measureText(t) { return { width: [...String(t)].length * 9 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  putImageData() {}
}
const ctxProxy = (c) => new Proxy(new Ctx2D(c), { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
class FakeCanvas { constructor() { this.width = 300; this.height = 150; this.style = {}; } getContext(t) { return t === "2d" ? (this._c ||= ctxProxy(this)) : null; } toDataURL() { return "data:,"; } addEventListener() {} }
globalThis.window ??= globalThis;
globalThis.document ??= { createElement: (t) => (t === "canvas" ? new FakeCanvas() : { style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} }, addEventListener() {} };

const BUDGET = { high: 6000, phone: 3000 };
const meshes = (h) => { const m = []; h.root.traverse((o) => { if (o.isMesh) m.push(o); }); return m; };
/** Skinned (posed) positions of the body, in the root's frame. */
function posed(h) {
  h.root.updateMatrixWorld(true);
  h.skeleton.update();
  const p = h.mesh.geometry.attributes.position, v = new THREE.Vector3(), out = [];
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); h.mesh.applyBoneTransform(i, v); out.push(v.clone()); }
  return out;
}
const colourKey = (r, g, b) => [r, g, b].map((x) => Math.round(x * 1000)).join(",");
const PALETTE = new Map(Object.entries(HOYA_COLORS).map(([k, hex]) => { const c = new THREE.Color(hex); return [colourKey(c.r, c.g, c.b), k]; }));

describe("build", () => {
  for (const q of HOYA_QUALITIES) {
    test(`${q}: one group, a cel body and a black line, both skinned to the same parts`, () => {
      const h = buildHoya(THREE, { quality: q });
      expect(h.root.isGroup).toBe(true);
      expect(h.root.name).toBe("hoya3d");
      const m = meshes(h);
      expect(m.length).toBe(2);
      expect(m.every((o) => o.isSkinnedMesh && o.skeleton === h.skeleton)).toBe(true);
      expect(h.hull.layers.mask).toBe(1 << 1);              // LAYER_NO_OUTLINE: the world's edge pre-pass skips it
      expect(h.mesh.layers.mask & 1).toBe(1);               // the body stays in the pre-pass (outlines, occlusion)
      expect(h.mesh.material.vertexColors).toBe(true);
      expect(h.hull.material.side).toBe(THREE.BackSide);
      expect(h.hull.material.color.getHex()).toBe(0x000000);
      // the line pass shares every buffer with the body: no second copy of the geometry
      for (const k of ["position", "normal", "skinIndex", "skinWeight", "hullW"]) expect(h.hull.geometry.attributes[k]).toBe(h.mesh.geometry.attributes[k]);
      h.dispose();
    });
  }

  test("feet at y = 0, 1.10 m to the top of the siphon knobs, facing -Z, the sword in the right hand (+X)", () => {
    const h = buildHoya(THREE, { quality: "high" });
    h.poseAt("idle", 0);
    const col = h.mesh.geometry.attributes.color, p = posed(h);
    expect(Math.abs(Math.min(...p.map((v) => v.y)))).toBeLessThan(0.004);   // the soles on the ground (the line pass is extra)
    const pick = (hex) => { const c = new THREE.Color(hex), k = colourKey(c.r, c.g, c.b), out = []; for (let i = 0; i < col.count; i++) if (colourKey(col.getX(i), col.getY(i), col.getZ(i)) === k) out.push(p[i]); return out; };
    const mean = (a, k) => a.reduce((s, v) => s + v[k], 0) / a.length;
    expect(mean(pick(HOYA_COLORS.nose), "z")).toBeLessThan(-0.2);      // the nose is on the front, the front is -Z
    expect(mean(pick(HOYA_COLORS.face), "z")).toBeLessThan(-0.1);
    expect(mean(pick(HOYA_COLORS.sanma), "x")).toBeGreaterThan(0.2);   // the サンマ sword: his right hand, +X
    const swordTop = Math.max(...pick(HOYA_COLORS.sanma).map((v) => v.y));
    expect(swordTop).toBeGreaterThan(1.0);                              // the standard pose holds it up (p.2)
    // 1.10 m to the top of the siphon knobs, standing straight (the bind pose; the A-stance then sets him 5 mm lower)
    const P0 = h.mesh.geometry.attributes.position, hoya = new THREE.Color(HOYA_COLORS.hoya);
    let top = -1; for (let i = 0; i < P0.count; i++) if (colourKey(col.getX(i), col.getY(i), col.getZ(i)) === colourKey(hoya.r, hoya.g, hoya.b)) top = Math.max(top, P0.getY(i));
    expect(top).toBeCloseTo(HOYA_HEIGHT, 3);
    h.dispose();
  });
});

describe("the manual's rules (p.2, p.5)", () => {
  test("only the official colours: every vertex is one of the eight (p.2), each one is used", () => {
    for (const q of HOYA_QUALITIES) {
      const h = buildHoya(THREE, { quality: q }), col = h.mesh.geometry.attributes.color, used = new Set();
      for (let i = 0; i < col.count; i++) {
        const k = colourKey(col.getX(i), col.getY(i), col.getZ(i));
        expect(PALETTE.has(k)).toBe(true);
        used.add(PALETTE.get(k));
      }
      expect([...used].sort()).toEqual(Object.keys(HOYA_COLORS).sort());
      h.dispose();
    }
  });

  test("the line is never thicker than the manual draws it (NG: 輪郭の線を太くする); lineScale > 1 is refused", () => {
    const max = HOYA_LINE.outline * HOYA_SCALE + 1e-7;
    for (const lineScale of [1, 3]) {
      const h = buildHoya(THREE, { quality: "high", lineScale }), w = h.mesh.geometry.attributes.hullW;
      let m = 0; for (let i = 0; i < w.count; i++) m = Math.max(m, w.getX(i));
      expect(m).toBeLessThanOrEqual(max);
      expect(m).toBeGreaterThan(max * 0.99);
      h.dispose();
    }
    const thin = buildHoya(THREE, { quality: "high", lineScale: 0.5 }), w = thin.mesh.geometry.attributes.hullW;
    let m = 0; for (let i = 0; i < w.count; i++) m = Math.max(m, w.getX(i));
    expect(m).toBeCloseTo(HOYA_LINE.outline * HOYA_SCALE * 0.5, 6);
    thin.dispose();
  });

  test("no deformation (NG: 変形させる): in every pose and through a long run, no part is ever scaled", () => {
    const h = buildHoya(THREE, { quality: "phone" });
    const eyes = new Set(["eyeOpenR", "eyeOpenL", "eyeShutR", "eyeShutL"]);   // the blink swaps the two eye shapes
    const check = () => {
      expect(h.root.scale.toArray()).toEqual([1, 1, 1]);
      for (const b of h.skeleton.bones) if (!eyes.has(b.name)) expect(Math.abs(b.scale.x - 1) + Math.abs(b.scale.y - 1) + Math.abs(b.scale.z - 1)).toBeLessThan(1e-9);
    };
    for (const p of POSES) { h.poseAt(p, 0.7); check(); }
    h.setPose("auto");
    let vy = 0;
    for (let i = 0; i < 900; i++) {
      const t = i / 60, speed = 3 * (0.5 + 0.5 * Math.sin(t)), air = i % 240 > 200;
      vy = air ? vy - 9.8 / 60 : 4;
      h.update(1 / 60, { speed, onGround: !air, vy });
      if (i % 30 === 0) check();
    }
    h.dispose();
  });

  test("the eyes: open dots, or the manual's closed ⌒ (NO.15-3), one at a time; no blink when asked", () => {
    const h = buildHoya(THREE, { quality: "phone" }), b = h.bones;
    const open = () => b.eyeR.scale.x > 0.5 && b.eyeL.scale.x > 0.5, shut = () => b.eyeCR.scale.x > 0.5 && b.eyeCL.scale.x > 0.5;
    h.update(1 / 60); expect(open() && !shut()).toBe(true);
    h.blink(0.12); expect(shut() && !open()).toBe(true);
    h.update(0.1); h.update(0.1); expect(open() && !shut()).toBe(true);   // update() steps at most 0.1 s
    let blinks = 0, was = false;
    for (let i = 0; i < 60 * 20; i++) { h.update(1 / 60); const s = shut(); if (s && !was) blinks++; was = s; expect(open() !== s).toBe(true); }
    expect(blinks).toBeGreaterThanOrEqual(3);   // every 2.5-5.5 s
    expect(blinks).toBeLessThanOrEqual(9);
    const still = buildHoya(THREE, { quality: "phone", blink: false });
    for (let i = 0; i < 60 * 12; i++) { still.update(1 / 60); expect(still.bones.eyeCR.scale.x).toBeLessThan(0.5); }
    h.dispose(); still.dispose();
  });
});

describe("poses", () => {
  test("setPose forces each pose; 'auto' hands it back to the inputs; an unknown pose throws", () => {
    const h = buildHoya(THREE, { quality: "phone" });
    for (const p of POSES) { h.setPose(p); expect(h.update(1 / 60)).toBe(p); expect(h.pose).toBe(p); }
    expect(() => h.setPose("dance")).toThrow();
    h.setPose("auto");
    const settle = (inp) => { let r; for (let i = 0; i < 60; i++) r = h.update(1 / 60, inp); return r; };
    expect(settle({ speed: 0 })).toBe("idle");
    expect(settle({ speed: 1.3 })).toBe("walk");
    expect(settle({ speed: 4.5 })).toBe("run");
    expect(settle({ speed: 0, onGround: false, vy: 3 })).toBe("jump");
    expect(settle({ speed: 0, onGround: false, vy: -2 })).toBe("fall");
    expect(settle({ speed: 0, onGround: true })).toBe("idle");
    h.dispose();
  });

  test("the poses differ where they should: the walk steps, the run leans and kicks, the jump tucks, the fall dangles", () => {
    const h = buildHoya(THREE, { quality: "phone" }), B = h.bones;
    const snap = () => ({ legR: B.legR.quaternion.clone(), shinR: B.shinR.quaternion.clone(), spine: B.spine.quaternion.clone(), cape1: B.cape1.quaternion.clone() });
    const ang = (a, b) => a.angleTo(b) * 180 / Math.PI;
    h.poseAt("idle", 1); const idle = snap();
    h.poseAt("walk", 1.1); const walk = snap();
    h.poseAt("run", 1.05); const run = snap();
    h.poseAt("jump", 0.4); const jump = snap();
    h.poseAt("fall", 0.4); const fall = snap();
    expect(ang(walk.shinR, idle.shinR)).toBeGreaterThan(20);    // the knee bends in the swing
    expect(ang(run.spine, idle.spine)).toBeGreaterThan(5);      // he leans into the run
    expect(ang(run.cape1, idle.cape1)).toBeGreaterThan(8);      // and the cape lifts behind him
    expect(ang(jump.shinR, idle.shinR)).toBeGreaterThan(60);    // tucked (NO.1-16)
    expect(ang(fall.shinR, jump.shinR)).toBeGreaterThan(30);    // the fall is not the jump
    h.dispose();
  });

  test("deterministic: the same pose at the same time is the same frame", () => {
    const h = buildHoya(THREE, { quality: "phone" });
    const grab = () => h.skeleton.bones.map((b) => [...b.quaternion.toArray(), ...b.position.toArray()]);
    h.poseAt("walk", 1.37); const a = grab();
    h.poseAt("run", 0.5);
    h.poseAt("walk", 1.37); const b = grab();
    expect(b).toEqual(a);
    h.dispose();
  });

  test("feet stay on the ground while standing and walking; the soles stay level in the stance", () => {
    const h = buildHoya(THREE, { quality: "phone" });
    for (const [p, t] of [["idle", 1], ["walk", 1], ["walk", 1.13], ["walk", 1.26]]) {
      h.poseAt(p, t);
      const minY = Math.min(...posed(h).map((v) => v.y));
      expect(Math.abs(minY)).toBeLessThan(0.02);   // within 2 cm of the ground (the swing foot lifts, one foot stays down)
    }
    h.dispose();
  });
});

describe("budgets", () => {
  for (const q of HOYA_QUALITIES) {
    test(`${q}: <= ${BUDGET[q]} triangles, 2 draw calls (<= 8), the line pass no larger than the body`, () => {
      const h = buildHoya(THREE, { quality: q });
      const tris = h.mesh.geometry.index.count / 3, line = h.hull.geometry.index.count / 3;
      expect(tris).toBe(h.stats.triangles);
      expect(tris).toBeLessThanOrEqual(BUDGET[q]);
      expect(line).toBeLessThanOrEqual(tris);
      expect(meshes(h).length).toBeLessThanOrEqual(8);
      expect(h.stats.drawCalls).toBe(2);
      expect(h.skeleton.bones.length).toBeLessThanOrEqual(32);
      h.dispose();
    });
  }

  test("phone is lighter than high; update() stays well under a millisecond", () => {
    const hi = buildHoya(THREE, { quality: "high" }), ph = buildHoya(THREE, { quality: "phone" });
    expect(ph.stats.triangles).toBeLessThan(hi.stats.triangles * 0.6);
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) ph.update(1 / 60, { speed: (i % 200) / 50, onGround: true, vy: 0 });
    expect((performance.now() - t0) / 600).toBeLessThan(1);
    hi.dispose(); ph.dispose();
  });

  test("bounds fit every pose (no wrong culling): the run, the jump and the sword stay inside", () => {
    const h = buildHoya(THREE, { quality: "phone" });
    for (const [p, t] of [["idle", 1], ["walk", 1.2], ["run", 1.1], ["jump", 0.4], ["fall", 0.4]]) {
      h.poseAt(p, t);
      for (const v of posed(h)) expect(h.mesh.boundingSphere.distanceToPoint(v)).toBeLessThanOrEqual(0);
    }
    expect(h.hull.boundingSphere.radius).toBe(h.mesh.boundingSphere.radius);
    h.dispose();
  });

  test("dispose() takes him out of the scene", () => {
    const scene = new THREE.Scene(), h = buildHoya(THREE, { quality: "phone" });
    scene.add(h.root);
    h.dispose();
    expect(h.root.parent).toBe(null);
  });
});
