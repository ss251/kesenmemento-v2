// [play:hoya3d] The 3D ホヤぼーや (src/anime/play/avatar/hoya-model.js): builds headless, keeps the manual's rules
// (colours, line weight, no deformation), switches poses, and holds its budgets (triangles, draw calls).
import { describe, test, expect } from "bun:test";
import * as THREE from "three";
import { buildHoya, POSES, HOYA_COLORS, HOYA_LINE, HOYA_SCALE, HOYA_HEIGHT, HOYA_QUALITIES, FACE_VIEW, faceWarp, faceViewK, faceEyeK, faceWarpRow, HOYA_TONE, HOYA_GAIT, hoyaGait } from "../src/anime/play/avatar/hoya-model.js";

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
    // the walk's knee: the largest bend over one cycle (a cycle is two steps; the cadence is the pose's own)
    let knee = 0; h.poseAt("walk", 1); const hz = h.cadence;
    for (let i = 0; i < 16; i++) { h.poseAt("walk", 1 + i / 16 / hz); knee = Math.max(knee, ang(B.shinR.quaternion.clone(), idle.shinR)); }
    expect(hz).toBeGreaterThan(2);
    expect(knee).toBeGreaterThan(40);
    h.poseAt("walk", 1.1); const walk = snap();
    h.poseAt("run", 1.05); const run = snap();
    h.poseAt("jump", 0.4); const jump = snap();
    h.poseAt("fall", 0.4); const fall = snap();
    expect(ang(run.spine, idle.spine)).toBeGreaterThan(5);      // he leans into the run
    expect(ang(run.cape1, idle.cape1)).toBeGreaterThan(8);      // and the cape lifts behind him
    expect(ang(jump.shinR, idle.shinR)).toBeGreaterThan(60);    // tucked (NO.1-16)
    h.poseAt("jump", 0.4);
    expect(ang(B.legR.quaternion.clone(), B.legL.quaternion.clone())).toBeGreaterThan(35);   // NO.1-16: one knee up in front, the other leg back
    expect(B.eyeCL.scale.x > 0.5 && B.eyeR.scale.x > 0.5).toBe(true);                        // and his left eye winks (the manual's own ⌒)
    expect(ang(fall.shinR, jump.shinR)).toBeGreaterThan(30);    // the fall is not the jump
    h.dispose();
  });

  test("the cape: NO.1-1's at rest, its sides flaring out in motion as NO.9-1 draws it from behind", () => {
    const h = buildHoya(THREE, { quality: "phone" }), B = h.bones, I = new THREE.Quaternion(), deg = (q) => (q.angleTo(I) * 180) / Math.PI;
    h.poseAt("idle", 1);
    expect(deg(B.capeL.quaternion)).toBeLessThan(1e-3);
    expect(deg(B.capeR.quaternion)).toBeLessThan(1e-3);
    h.poseAt("walk", 1.2);
    expect(deg(B.capeL.quaternion)).toBeGreaterThan(10);
    expect(deg(B.capeR.quaternion)).toBeGreaterThan(10);
    h.poseAt("run", 1.2);
    expect(deg(B.capeL.quaternion)).toBeGreaterThan(20);
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

// ---------------------------------------------------------------------------------------------------- [hoya-accuracy]
const DEG = Math.PI / 180;
/** The face view on the CPU, as the vertex shader does it: the warped bind-space position of vertex i at boost k. */
function warped(h, i, k) {
  const g = h.mesh.geometry, P = g.attributes.position, W = g.attributes.hoyaW, K = HOYA_SCALE;
  const x = P.getX(i), y = P.getY(i), z = P.getZ(i), m = W.getX(i);
  if (m < 0.5) return [x, y, z];
  const RX = 1.0 * K, RZ = 0.95 * K, HY = 2.632 * K;
  const a = m > 1.5 ? W.getY(i) : Math.atan2(-x / RX, -z / RZ), yy = m > 1.5 ? W.getZ(i) : (y - HY) / K;
  const d = (faceWarp(a, m > 2.5 ? faceEyeK(k) : k) - a) * faceWarpRow(yy), ex = -x / RX, ez = -z / RZ, c = Math.cos(d), s = Math.sin(d);
  return [-(ex * c + ez * s) * RX, y, -(ez * c - ex * s) * RZ];
}

describe("the face view (the manual's off-axis drawings)", () => {
  test("the boost: 1 from the front and the back (NO.1-1, NO.9-1 exact), 1.07 at NO.16-15's 12.5 deg, 2.45 in profile", () => {
    expect(faceViewK(0)).toBe(1);
    expect(faceViewK(Math.PI)).toBeCloseTo(1, 9);
    expect(faceViewK(-Math.PI)).toBeCloseTo(1, 9);
    expect(faceViewK(12.5 * DEG)).toBeCloseTo(1.068, 3);
    expect(faceEyeK(faceViewK(12.5 * DEG))).toBeCloseTo(1.08, 2);
    expect(faceViewK(90 * DEG)).toBeCloseTo(2.45, 9);
    expect(faceViewK(-90 * DEG)).toBeCloseTo(2.45, 9);
    expect(faceViewK(90 * DEG, 90 * DEG)).toBeCloseTo(1, 9);   // from straight above: none
    expect(faceViewK(135 * DEG)).toBeLessThan(1.4);            // behind him it eases off
  });

  test("the warp: monotonic, the face's centre line and the back stay put", () => {
    for (const k of [1, 1.08, 1.85, 2.7]) {
      expect(faceWarp(0, k)).toBe(0);
      expect(faceWarp(Math.PI - 1e-9, k)).toBeCloseTo(Math.PI, 5);
      let prev = -Infinity;
      for (let a = -179; a <= 179; a += 1) { const w = faceWarp(a * DEG, k); expect(w).toBeGreaterThan(prev); prev = w; }
    }
    expect(faceWarpRow(0)).toBe(1);                       // the eyes' row: all of it
    expect(faceWarpRow(-0.9)).toBe(0);                    // under the chin: none
  });

  test("it fits the manual: NO.16-15 (12.5 deg) and the profile NO.15-31 (90 deg)", () => {
    // NO.16-15, eye row, measured at 321 px/U: face edges -0.893 / +0.555 U, eyes -0.52 / +0.10 U (screen, from the head centre)
    const k = faceViewK(12.5 * DEG), ke = faceEyeK(k), at = (phi, kk) => Math.sin(faceWarp(phi, kk) - 12.5 * DEG) * 0.99;   // the head's radius at the eye row
    const edge = Math.asin(0.68 / 0.99), eye = Math.asin(0.295 / 0.99);
    expect(Math.abs(at(-edge, k) - -0.893)).toBeLessThan(0.06);
    expect(Math.abs(at(edge, k) - 0.555)).toBeLessThan(0.03);
    expect(Math.abs(at(-eye, ke) - -0.52)).toBeLessThan(0.02);
    expect(Math.abs(at(eye, ke) - 0.10)).toBeLessThan(0.02);
    // NO.15-31 / NO.10-7, as a share of the head's depth from its front at the eye row: the eye 0.146-0.195, the face's
    // edge 0.472 (both drawings). Here (1 - cos W) / 2 on the head's circle (the renders measure 0.16 and 0.475)
    const k90 = faceViewK(90 * DEG), share = (w) => (1 - Math.cos(w)) / 2;
    expect(share(faceWarp(eye, faceEyeK(k90)))).toBeGreaterThan(0.13);
    expect(share(faceWarp(eye, faceEyeK(k90)))).toBeLessThan(0.195);
    expect(Math.abs(share(faceWarp(edge, k90)) - 0.472)).toBeLessThan(0.025);
  });

  test("it never changes his shape: every point of the head stays on the head, at any boost (no deformation)", () => {
    for (const q of HOYA_QUALITIES) {
      const h = buildHoya(THREE, { quality: q }), g = h.mesh.geometry, P = g.attributes.position, W = g.attributes.hoyaW, K = HOYA_SCALE;
      const e = (p) => (p[0] / K) ** 2 + ((p[1] / K - 2.632) / 0.866) ** 2 + (p[2] / (0.95 * K)) ** 2;
      let n = 0;
      for (let i = 0; i < P.count; i++) {
        if (W.getX(i) !== 1) continue;
        const p0 = [P.getX(i), P.getY(i), P.getZ(i)], e0 = e(p0);
        for (const k of [1.5, 2.7]) { const p1 = warped(h, i, k); expect(Math.abs(e(p1) - e0)).toBeLessThan(1e-6); expect(p1[1]).toBe(p0[1]); }
        n++;
      }
      expect(n).toBeGreaterThan(300);
      h.dispose();
    }
  });

  test("the eyes and the nose move whole (never stretched); the parts off the head never move", () => {
    const h = buildHoya(THREE, { quality: "high" }), W = h.mesh.geometry.attributes.hoyaW, col = h.mesh.geometry.attributes.color;
    const nose = new THREE.Color(HOYA_COLORS.nose), anchors = new Set();
    for (let i = 0; i < W.count; i++) {
      if (Math.abs(col.getX(i) - nose.r) < 1e-3 && Math.abs(col.getY(i) - nose.g) < 1e-3 && Math.abs(col.getZ(i) - nose.b) < 1e-3) {
        expect(W.getX(i)).toBe(2); anchors.add(W.getY(i));
      }
    }
    expect([...anchors]).toEqual([0]);   // the nose sits on the face's centre line: it never moves
    // every vertex weighted to an eye bone moves as one (mode 2, one anchor per eye)
    const SI = h.mesh.geometry.attributes.skinIndex, eyeBones = new Set(["eyeOpenR", "eyeOpenL", "eyeShutR", "eyeShutL"].map((n) => h.skeleton.bones.findIndex((b) => b.name === n)));
    const per = new Map();
    for (let i = 0; i < W.count; i++) if (eyeBones.has(SI.getX(i))) { expect(W.getX(i)).toBe(3); const b = SI.getX(i); (per.get(b) || per.set(b, new Set()).get(b)).add(W.getY(i).toFixed(6)); }
    for (const s of per.values()) expect(s.size).toBe(1);
    // nothing below the head (body, arms, legs, cape, sword) is part of the head's drawing
    const P = h.mesh.geometry.attributes.position;
    for (let i = 0; i < W.count; i++) if (P.getY(i) < (2.632 - 0.95) * HOYA_SCALE) expect(W.getX(i)).toBe(0);
    h.dispose();
  });
});

describe("the manual's flat colour (two tones, no gradients)", () => {
  test("two tones only; no soft shadow on him; his own ramp", () => {
    const h = buildHoya(THREE, { quality: "phone" }), ramp = h.mesh.material.gradientMap;
    expect(new Set(ramp.image.data).size).toBe(2);
    expect([...new Set(ramp.image.data)].sort((a, b) => a - b)).toEqual([Math.round(HOYA_TONE.shade * 255), 255]);
    expect(ramp.minFilter).toBe(THREE.NearestFilter);
    expect(h.mesh.receiveShadow).toBe(false);
    expect(h.mesh.castShadow).toBe(true);
    h.dispose();
  });

  test("setFaceView(false) gives the rigid head (the boost stays 1)", () => {
    const h = buildHoya(THREE, { quality: "phone" });
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 50); cam.position.set(-4, 0.8, 0); cam.lookAt(0, 0.8, 0); cam.updateMatrixWorld(true);
    h.root.updateMatrixWorld(true);
    h.mesh.onBeforeRender(null, null, cam);
    expect(h.faceK).toBeGreaterThan(2.3);   // he faces -Z; the camera is at his left: a profile
    h.setFaceView(false);
    h.mesh.onBeforeRender(null, null, cam);
    expect(h.faceK).toBe(1);
    h.dispose();
  });
});

describe("the gait the movement lane drives (cadence in, hoyaGait out)", () => {
  test("hoyaGait: a walk stride of ~0.20 m and a run of ~0.20 m per stance, 0 standing; run can be chosen", () => {
    expect(hoyaGait(0).travel).toBe(0);
    const w = hoyaGait(1.3), r = hoyaGait(4.2);
    expect(w.travel).toBeGreaterThan(0.18); expect(w.travel).toBeLessThan(0.22);
    expect(w.stance).toBeCloseTo(HOYA_GAIT.walk.stance, 6);
    expect(r.travel).toBeGreaterThan(0.18); expect(r.travel).toBeLessThan(0.22);
    expect(r.stance).toBeCloseTo(HOYA_GAIT.run.stance, 6);
    expect(hoyaGait(1.3, 1).run).toBe(1);                 // an explicit run at a walking speed
    expect(hoyaGait(1.3, 1).stance).toBeCloseTo(HOYA_GAIT.run.stance, 6);
    expect(w.hz).toBeCloseTo((1.3 * w.stance) / w.travel, 9);
  });

  test("update() takes the caller's cadence (cycles per second); the model carries gait() (the movement lane's driver)", () => {
    const h = buildHoya(THREE, { quality: "phone" });
    expect(h.gait(1.3)).toEqual(hoyaGait(1.3));
    h.setPose("auto");
    for (let i = 0; i < 30; i++) h.update(1 / 60, { speed: 1.2, cadence: 3.25 });
    expect(h.cadence).toBe(3.25);
    for (let i = 0; i < 30; i++) h.update(1 / 60, { speed: 1.2 });
    expect(h.cadence).toBeCloseTo(hoyaGait(1.2).rate, 3);  // without one: his own (no slide, capped): hoyaGait().rate
    h.dispose();
  });

  for (const [name, v, run] of [["walk", 1.1, undefined], ["run", 3.0, 1]]) {
    test(`${name}: with cadence = hoyaGait(${v}).hz the planted boot sweeps back at his speed (no slide), and never sideways`, () => {
      const h = buildHoya(THREE, { quality: "phone" }), g = hoyaGait(v, run), dt = 1 / 240, p = new THREE.Vector3();
      h.setPose("auto");
      for (let i = 0; i < 480; i++) h.update(dt, { speed: v, cadence: g.hz, run });
      const xs = [], ys = [], zs = [];
      for (let i = 0; i < Math.ceil(240 / g.hz); i++) { h.update(dt, { speed: v, cadence: g.hz, run }); h.root.updateMatrixWorld(true); h.bones.footR.getWorldPosition(p); xs.push(p.x); ys.push(p.y); zs.push(p.z); }
      // the planted stretch: the ankle within 1.2 cm of its lowest (the heel roll, the mid-stance rise and the toe roll stay
      // under that; the swing is far above it)
      const lo = Math.min(...ys), v2 = [], side = [];
      for (let i = 1; i < ys.length; i++) if (ys[i] < lo + 0.012 && ys[i - 1] < lo + 0.012) { v2.push((zs[i] - zs[i - 1]) / dt); side.push(Math.abs(xs[i] - xs[i - 1]) / dt); }
      expect(v2.length).toBeGreaterThanOrEqual(3);
      const mean = v2.reduce((a, b) => a + b, 0) / v2.length;
      expect(Math.abs(mean - v) / v).toBeLessThan(0.12);   // backward (+Z) at his own speed
      // the hips turn 17-18 deg with the stride, and the thighs turn back against it: the planted boot stays in its line
      // (it was carried sideways at ~0.5 m/s, 1.4-2.1 cm a stance, when the leg swung in the hips' plane)
      expect(side.reduce((a, b) => a + b, 0) / side.length).toBeLessThan(0.2);
      h.dispose();
    });
  }
});
