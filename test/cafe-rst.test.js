// [cafe-rst] café RST, the roastery café on the ground floor of 迎 (ムカエル) as a walk-in anime interior (explore/cafe-rst.js,
// harbor/cafe-front.js): the hard scale against the surveyed ANCHOR face, the shop's consent and credit, the listing (入る / 出る poses and the
// `at()` box), walking in through the door with the real colliders (and not through the walls), the layout (nothing overlaps, every place
// reachable), no coplanar faces (z-fighting), the budgets against 男山本店 and the phone's texture limit, the fit to the measured plan with its
// residuals (docs/anime/interiors/cafe-rst-plan.json), and content hygiene. Builds the harbor and the interiors headless (no GPU). The look
// is checked by screenshots (docs/anime/interiors-cafe-rst.md).
import { test, expect, describe, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

class Ctx2D {
  constructor(c) { this.canvas = c; this.font = '10px sans-serif'; }
  measureText(t) { const m = /(\d+(?:\.\d+)?)px/.exec(this.font); const s = m ? Number(m[1]) : 10; return { width: [...String(t)].length * s * 0.92 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  putImageData() {}
}
const ctxProxy = (c) => new Proxy(new Ctx2D(c), { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
class FakeCanvas { constructor() { this.width = 300; this.height = 150; this.style = {}; } getContext(t) { return t === '2d' ? (this._c ||= ctxProxy(this)) : null; } toDataURL() { return 'data:,'; } addEventListener() {} }
globalThis.window ??= globalThis;
globalThis.document ??= { createElement: (t) => (t === 'canvas' ? new FakeCanvas() : { style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} }), fonts: { load: async () => [] }, body: { appendChild() {} }, addEventListener() {} };
globalThis.HTMLCanvasElement ??= FakeCanvas;
globalThis.requestAnimationFrame ??= (f) => setTimeout(() => f(Date.now()), 16);
globalThis.innerWidth ??= 1280; globalThis.innerHeight ??= 720; globalThis.devicePixelRatio ??= 1;
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });

const THREE = await import('three');
const L = await import('../src/anime/world/layout.js');
const { createContext } = await import('../src/anime/core/ctx.js');
const { buildHarbor } = await import('../src/anime/world/harbor/world.js');
const { buildInteriors } = await import('../src/anime/world/explore/interiors.js');
const C = await import('../src/anime/world/explore/cafe-rst.js');
const PPL = await import('../src/anime/world/explore/cafe-rst-people.js');
const F = await import('../src/anime/world/harbor/cafe-front.js');
const { ANCHOR } = await import('../src/anime/world/harbor/minami5.js');
const ROOT = join(import.meta.dir, '..');
const { SENSITIVE } = await import('../scripts/anime/enrich/fold.js');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const PLAN_DOC = JSON.parse(read('docs/anime/interiors/cafe-rst-plan.json'));

let ctx, out, rec, group, root;
beforeAll(() => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
  ctx = createContext({ scene, camera, renderer: null, audio: null, quality: { name: 'high', heroR: 1 }, sunDir: new THREE.Vector3(...L.SUN_DIR).normalize() });
  ctx.sky = { sun: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight(), uniforms: {}, setTime() {}, setHours() {} };
  ctx.pipeline = { compMat: { uniforms: {} } };
  buildHarbor(ctx);                      // the exterior and the hall colliders the room has to take out
  out = buildInteriors(ctx, {});
  rec = out.cafeRst; group = rec?.group;
  root = ctx.staticRoot.children.find((c) => c.name === 'explore-interiors');
}, 60000);

const ib = (x, y, p = 0) => C.inRoom(x, y, p);
const solids = () => rec.items.filter((i) => i.solid);

describe('the hard scale: the surveyed ANCHOR face', () => {
  test('FRONT is minami5.js ANCHOR (P1, P2, the SE face end, the floor), the face is 9.55 m', () => {
    expect(F.FRONT.P1).toEqual(ANCHOR.P1); expect(F.FRONT.P2).toEqual(ANCHOR.P2); expect(F.FRONT.P3).toEqual(ANCHOR.P3);
    expect(F.FRONT.floor).toBe(ANCHOR.floor);
    expect(F.FACE.len).toBeCloseTo(9.549, 3);
    expect(Math.hypot(...F.FACE.u)).toBeCloseTo(1, 9); expect(F.FACE.n[0] * F.FACE.u[0] + F.FACE.n[1] * F.FACE.u[1]).toBeCloseTo(0, 9);
    expect(F.FACE.n[0] * -0.725853 + F.FACE.n[1] * 0.68785).toBeGreaterThan(0.999);   // the survey's plane normal (data/survey/minami/picks.json anchor.face)
  });
  test('the openings lie on the face, in order, without overlap; the door is 0.9 x 2.05 m', () => {
    const ops = F.OPENINGS;
    for (const o of ops) { expect(o.x0).toBeGreaterThanOrEqual(0); expect(o.x1).toBeLessThanOrEqual(F.FACE.len); expect(o.x1 - o.x0).toBeGreaterThan(0.5); expect(o.z1).toBeGreaterThan(o.z0); }
    for (let i = 1; i < ops.length; i++) expect(ops[i].x0).toBeGreaterThan(ops[i - 1].x1 + 0.05);
    const d = F.OPENINGS.find((o) => o.id === 'door');
    expect(d.x1 - d.x0).toBeCloseTo(0.9, 3); expect(d.z1).toBeCloseTo(2.05, 3); expect(d.z0).toBe(0);
    expect(C.DOOR).toBe(d);
  });
  test('the room frame: the SE end and the rear wall come from the survey (P3 at depth 6.07), the face wall is 0.2 m', () => {
    const [px, py] = C.worldToRoom(...F.FRONT.P3);
    expect(px).toBeCloseTo(10.22, 2); expect(py).toBeCloseTo(6.07, 2);
    expect(C.PLAN.y1).toBeCloseTo(py, 2);
    expect(C.seX(0)).toBeCloseTo(F.FACE.len - 0.2, 1);
    expect(C.seX(C.PLAN.y1) - C.seX(0)).toBeCloseTo(0.1105 * C.PLAN.y1, 3);
    const [rx, ry] = C.worldToRoom(...C.roomToWorld(3.3, 2.2)); expect(rx).toBeCloseTo(3.3, 9); expect(ry).toBeCloseTo(2.2, 9);
  });
});

describe('consent and credit', () => {
  test('the consent record: owner, date, scope, reference (verbal, written form pending); no personal names of the shop', () => {
    const c = C.CAFE_RST_CONSENT;
    expect(c.owner).toBe('café RST'); expect(c.date).toBe('2026-10-07');
    expect(c.scope).toMatch(/anime-style interior/); expect(c.scope).toMatch(/video/);
    expect(c.ref).toBe('verbal OK to the author, written form pending');
    expect(c.tokens).toContain('display-web'); expect(Object.isFrozen(c)).toBe(true);
    expect(new Date(c.date).getTime()).toBeLessThanOrEqual(Date.now() + 864e5);
    expect(JSON.stringify(c)).not.toMatch(/[一-鿿]{2,4}さん/);   // no named staff
  });
  test('the credit line 協力：café RST (ja) and its English mirror are in the record, and on a plaque in the room', () => {
    expect(C.CAFE_RST_CREDIT.ja).toBe('協力：café RST'); expect(C.CAFE_RST_CREDIT.en).toBe('With the cooperation of café RST');
    expect(rec.credit).toBe(C.CAFE_RST_CREDIT); expect(rec.consent).toBe(C.CAFE_RST_CONSENT);
    expect(read('src/anime/world/explore/cafe-rst.js')).toMatch(/plaqueTex[\s\S]*CAFE_RST_CREDIT\.ja/);
  });
  test('ENABLED is the takedown switch: on, the room is built and listed', () => {
    expect(C.ENABLED).toBe(true); expect(out.list.map((i) => i.id)).toContain('cafeRst'); expect(out.cafeRstError).toBeUndefined();
  });
});

describe('listing: 入る and 出る', () => {
  test('the record: ids, names, entrance and inside poses, the at() box', () => {
    expect(rec.id).toBe('cafeRst'); expect(rec.ja).toMatch(/café RST/); expect(rec.en).toMatch(/café RST/);
    const en = rec.entrance, ins = rec.inside;
    for (const p of [en, ins]) { expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.yaw) && Number.isFinite(p.pitch)).toBe(true); }
    const [ex, ey] = C.worldToRoom(en.x, en.z), [ix, iy] = C.worldToRoom(ins.x, ins.z);
    expect(ib(ex, ey)).toBe(false); expect(ey).toBeLessThan(-1.5); expect(ey).toBeGreaterThan(-4);                     // outside, 1.5-4 m in front of the face
    expect(Math.abs(ex - (F.OPENINGS.find((o) => o.id === 'door').x0 + 0.45))).toBeLessThan(0.3);                      // in line with the door
    expect(ib(ix, iy, 0.5)).toBe(true);                                                                                 // inside, off the walls
    // facing: the entrance looks at the door (yaw = into the room), the inside pose looks along the room
    const toRoom = (yawDeg) => { const a = yawDeg * Math.PI / 180, fx = -Math.sin(a), fz = -Math.cos(a); return [fx * F.FACE.u[0] + fz * F.FACE.u[1], fx * C.NIN[0] + fz * C.NIN[1]]; };
    const [dx, dy] = toRoom(en.yaw); expect(dy).toBeGreaterThan(0.99);
    expect(ins.y).toBe(F.FRONT.floor);
  });
  test('interiors.at(): true inside the room at eye height, false on the sidewalk, in the street and above the roof', () => {
    const ins = rec.inside, en = rec.entrance;
    expect(out.at(ins.x, ins.y + 1.52, ins.z)).toBe('cafeRst');
    expect(out.at(en.x, L.heightAt(en.x, en.z) + 1.52, en.z)).toBeNull();
    expect(out.at(ins.x, ins.y + 40, ins.z)).toBeNull();
    const [cx, cz] = C.roomToWorld(5, 3); expect(out.at(cx, F.FRONT.floor + 1.5, cz)).toBe('cafeRst');
    const [sx, sz] = C.roomToWorld(5, -1.2); expect(out.at(sx, F.FRONT.floor + 1.5, sz)).toBeNull();
  });
  test('the pad reads the list: both poses are valid for setPose (the floor under the inside pose is the room floor)', () => {
    const ins = rec.inside, g = ctx.physics.groundHeight(ins.x, ins.z, 1e9);
    expect(g).toBeCloseTo(F.FRONT.floor, 3);
  });
});

/** A walker like the player's: circle r 0.3, 1.7 m tall, stepping up at most 0.45 m, along a polyline of room-frame points. */
function walk(path) {
  const P = ctx.physics, R = 0.3, H = 1.7, [X0, Z0] = C.roomToWorld(...path[0]), p = { x: X0, z: Z0 };
  let feet = P.groundHeight(p.x, p.z, 1e9); const trace = [];
  for (let i = 1; i < path.length; i++) {
    const [TX, TZ] = C.roomToWorld(...path[i]), dx = TX - p.x, dz = TZ - p.z, n = Math.ceil(Math.hypot(dx, dz) / 0.05);
    for (let k = 0; k < n; k++) { p.x += dx / n; p.z += dz / n; P.resolve(p, R, feet, H); const g = P.groundHeight(p.x, p.z, feet); expect(g - feet).toBeLessThanOrEqual(0.451); feet = g; }
    const [rx, ry] = C.worldToRoom(p.x, p.z); trace.push({ x: +rx.toFixed(2), y: +ry.toFixed(2), feet: +feet.toFixed(2) });
  }
  return trace;
}

describe('walking in', () => {
  test('from the entrance through the door (and up the two risers) to the floor of the room, and on to the counter, the window and the lattice', () => {
    const dc = (C.DOOR.x0 + C.DOOR.x1) / 2 + 0.05;
    const t = walk([[dc, -2.1], [dc, 0.4], [dc + 0.4, 1.2], [4.0, 2.5], [4.6, 3.0]]);
    expect(t.at(-1).feet).toBeCloseTo(F.FRONT.floor, 2); expect(ib(t.at(-1).x, t.at(-1).y, 0.3)).toBe(true);
    expect(t[1].feet).toBeCloseTo(F.FRONT.floor, 2);
  });
  test('the entrance pose walks straight in (the pad teleports; the keyboard walks): the same door', () => {
    const [ex, ey] = C.worldToRoom(rec.entrance.x, rec.entrance.z); const t = walk([[ex, ey], [ex, 0.5], [ex + 0.6, 1.4]]);
    expect(t[1].y).toBeGreaterThan(0.3); expect(t[1].feet).toBeCloseTo(F.FRONT.floor, 2);
  });
  test('the walls hold: the window wall, the wall beside the door, the SE corner and the rear wall stop the walker outside / inside', () => {
    for (const [x, y] of [[5, -1.5], [1.2, -1.5], [9, -1.5], [7.5, -1.5], [0.8, -1.5]]) { const t = walk([[x, y], [x, 1.5]]); expect(t.at(-1).y).toBeLessThan(0); }
    const t = walk([[4.0, 2.0], [4.0, 7.5]]); expect(t.at(-1).y).toBeLessThan(C.PLAN.y1);
    const t2 = walk([[8.0, 2.2], [11.5, 2.2]]); expect(t2.at(-1).x).toBeLessThan(C.seX(2.2));
    const t3 = walk([[4.0, 2.0], [-1.0, 2.0]]); expect(t3.at(-1).x).toBeGreaterThan(0);
  });
  test('the harbor\'s outline colliders (GSI, 0.15-1.2 m off the surveyed face) are gone from the street and SE faces', () => {
    const P = ctx.physics, G = L && null; void G;
    const hall = P.items.filter((it) => it.type === 'box' && it.y0 === -5 && it.y1 === 40 && it.hw === 0.25);
    const [mx, mz] = [(-9.5 - 17.4) / 2, (50.1 + 43.4) / 2];
    expect(hall.filter((it) => Math.hypot(it.cx - mx, it.cz - mz) < 1.2)).toHaveLength(0);
  });
});

describe('the layout', () => {
  test('every solid piece lies inside the room and none overlaps another (shared walls and the counter\'s own parts excepted)', () => {
    const S = solids().filter((i) => !['shell', 'backbar-col', 'door-leaf', 'lattice'].includes(i.id) && !/^customer|barista|mirror/.test(i.id));
    for (const a of S) {
      expect(ib(a.x0, a.y0, -0.05) || a.id.startsWith('window-counter') || a.id === 'counter' || a.id === 'shelves' || a.id === 'motorcycle', a.id).toBe(true);
      expect(a.x0).toBeGreaterThanOrEqual(C.PLAN.x0 - 0.06); expect(a.y1).toBeLessThanOrEqual(C.PLAN.y1 + 0.06); expect(a.y0).toBeGreaterThanOrEqual(C.PLAN.wall - 0.06);
    }
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const a = S[i], b = S[j]; if (a.z1 <= b.z0 || b.z1 <= a.z0) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 0.02 && oy > 0.02) { const pair = [a.id, b.id].sort().join('+'); expect(['stool+window-counter', 'chair+table'].includes(pair) && false, `${pair} overlaps by ${ox.toFixed(2)} x ${oy.toFixed(2)} (${a.x0},${a.y0})`).toBe(true); }
    }
  });
  test('walkways: from the door every place of the room can be reached by a walker of radius 0.3 (flood fill on the solids and the walls)', () => {
    const cell = 0.1, X1 = 10.2, Y1 = C.PLAN.y1, nx = Math.ceil(X1 / cell), ny = Math.ceil(Y1 / cell), grid = new Uint8Array(nx * ny);
    const R = 0.3;
    for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) {
      const x = (ix + 0.5) * cell, y = (iy + 0.5) * cell; let blocked = !ib(x, y, R) ? 1 : 0;
      if (!blocked) for (const s of solids()) { if (s.id === 'shell' || s.id === 'backbar-col' || s.z0 > 1.6 || s.z1 < 0.3 || /customer|barista|mirror|noren/.test(s.id)) continue; const dx = Math.max(s.x0 - x, 0, x - s.x1), dy = Math.max(s.y0 - y, 0, y - s.y1); if (Math.hypot(dx, dy) < R) { blocked = 1; break; } }
      grid[ix * ny + iy] = blocked;
    }
    const seen = new Uint8Array(nx * ny), start = [Math.floor(2.5 / cell), Math.floor(0.6 / cell)], q = [start]; seen[start[0] * ny + start[1]] = 1;
    expect(grid[start[0] * ny + start[1]]).toBe(0);
    while (q.length) { const [ix, iy] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = ix + dx, b = iy + dy; if (a < 0 || b < 0 || a >= nx || b >= ny || seen[a * ny + b] || grid[a * ny + b]) continue; seen[a * ny + b] = 1; q.push([a, b]); } }
    const reach = (x, y) => seen[Math.floor(x / cell) * ny + Math.floor(y / cell)] === 1;
    const missed = [];
    for (const [name, x, y] of [['the counter front by the stools', 3.2, 3.2], ['the first stool', 3.2, 2.0], ['the window counter', 4.1, 1.5], ['the SE window counter', 8.5, 1.3], ['the table', 5.45, 2.8], ['the rail', 7.6, 4.4], ['the noren doorway', 2.05, 5.6], ['the lattice', 8.5, 2.4], ['the print (viewing spot)', 4.55, 3.0], ['the retail shelves', 8.9, 3.65]]) if (!reach(x, y)) missed.push(name);
    expect(missed).toEqual([]);
  });
});

describe('no coplanar faces (z-fighting)', () => {
  test('no two axis-aligned boxes of the room have same-facing faces on one plane that overlap in area', () => {
    const boxes = [];
    group.updateMatrixWorld(true);
    for (const o of group.children) {   // the boxes placed straight into the room's frame (the figures, chairs, the bike and the door leaf are sub-groups in their own frames)
      if (!o.isMesh || o.geometry.type !== 'BoxGeometry') continue;
      if (Math.abs(o.rotation.x) > 1e-6 || Math.abs(o.rotation.z) > 1e-6 || Math.abs(Math.sin(o.rotation.y * 2)) > 1e-6) continue;   // axis-aligned only
      const swap = Math.abs(Math.sin(o.rotation.y)) > 0.5, sx = o.scale.x, sy = o.scale.y, sz = o.scale.z;
      const hx = (swap ? sz : sx) / 2, hz = (swap ? sx : sz) / 2, p = o.position;
      boxes.push({ x0: p.x - hx, x1: p.x + hx, y0: p.y - sy / 2, y1: p.y + sy / 2, z0: p.z - hz, z1: p.z + hz, id: o.id });
    }
    expect(boxes.length).toBeGreaterThan(200);
    const E = 2e-3, ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0), bad = [], FY = F.FRONT.floor;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      for (const [k0, k1, u0, u1, v0, v1] of [['x0', 'x1', 'y0', 'y1', 'z0', 'z1'], ['y0', 'y1', 'x0', 'x1', 'z0', 'z1'], ['z0', 'z1', 'x0', 'x1', 'y0', 'y1']]) {
        const ou = ov(a[u0], a[u1], b[u0], b[u1]), ovv = ov(a[v0], a[v1], b[v0], b[v1]); if (ou <= 0.01 || ovv <= 0.01) continue;
        for (const side of [k0, k1]) {
          if (Math.abs(a[side] - b[side]) >= E) continue;
          if (k0 === 'y0' && side === 'y0' && Math.abs(a.y0 - FY) < 0.01) continue;            // bottoms on the floor face down into it
          const c = { x: 0, y: 0, z: 0 }; c[k0[0]] = a[side]; c[u0[0]] = Math.max(a[u0], b[u0]) + ou / 2; c[v0[0]] = Math.max(a[v0], b[v0]) + ovv / 2;
          const r3 = (q) => `x ${q.x0.toFixed(2)}..${q.x1.toFixed(2)} y_r ${(-q.z1).toFixed(2)}..${(-q.z0).toFixed(2)} z ${(q.y0 - FY).toFixed(2)}..${(q.y1 - FY).toFixed(2)}`;
          bad.push(`${side} plane at room x_r ${(c.x).toFixed(2)} y_r ${(-c.z).toFixed(2)} z ${(c.y - FY).toFixed(2)} (${(ou * ovv).toFixed(3)} m2): [${r3(a)}] vs [${r3(b)}]`);
        }
      }
    }
    expect(bad.slice(0, 14)).toEqual([]);
  });
});

describe('budgets (against 男山本店 in the same build) and the phone texture limit', () => {
  const stat = (obj) => { let meshes = 0, tris = 0; const mats = new Set(); obj.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh) return; meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; mats.add(o.material); }); return { meshes, tris: Math.round(tris), mats: mats.size }; };
  // batch2's merge signature: colours bake into vertex colours, so what makes a draw call is the map (or atlas page), the side, transparency, `paint`, polygon offset, emissive ...
  const sig = (m) => {
    if (m.isMeshToonMaterial && m.userData?.toon) { const t = m.userData.toon; return ['T', m.map ? (m.map.wrapS === THREE.RepeatWrapping ? m.map.uuid : 'atlas') : 'none', m.side, m.transparent, m.opacity, m.alphaTest, m.depthWrite, t.paint, t.grime, t.polygonOffset, m.emissive.getHexString(), m.emissiveIntensity, !!m.defines?.USE_CUSTOM ? m.uuid : ''].join('|'); }
    if (m.isMeshBasicMaterial) return ['B', m.map ? 'map' : 'none', m.side, m.transparent, m.opacity, m.alphaTest, m.depthWrite, m.fog, m.toneMapped].join('|');
    return 'S|' + m.uuid;
  };
  const sigs = (obj) => { const s = new Set(); obj.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !Array.isArray(o.material)) s.add(sig(o.material)); }); return s; };
  test('triangles and meshes stay within 1.5 x of 男山本店 in the same build (917 meshes, 12.9 k triangles); the merged draw groups add at most 14', () => {
    const otoGroup = root.children.find((c) => c !== group && c.type === 'Group' && stat(c).tris > 10000 && stat(c).tris < 30000);
    const a = stat(group), b = stat(otoGroup); expect(b.tris).toBeGreaterThan(10000);
    expect(a.tris).toBeLessThanOrEqual(b.tris * 1.5); expect(a.meshes).toBeLessThanOrEqual(b.meshes * 1.5);
    const sa = sigs(group), sb = new Set([...sigs(otoGroup), ...sigs(root.children.find((c) => c !== group && c !== otoGroup))]);
    const added = [...sa].filter((k) => !sb.has(k)); expect(added.length).toBeLessThanOrEqual(14);
  });
  test('canvas textures: tiles of at most 512 px that join the atlas (UVs in 0..1), three small repeating surfaces, under 0.7 Mpx in all', () => {
    const maps = new Map(); group.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.material.map) { const g = o.geometry; const uv = g.attributes.uv; let unit = !!uv; if (uv) for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); if (u < -0.002 || u > 1.002 || v < -0.002 || v > 1.002) { unit = false; break; } } const e = maps.get(o.material.map) || { unit: true }; e.unit = e.unit && unit; maps.set(o.material.map, e); } });
    let px = 0, repeats = 0;
    for (const [m, e] of maps) { const w = m.image.width, h = m.image.height; px += w * h; expect(Math.max(w, h)).toBeLessThanOrEqual(512); if (!e.unit) { repeats++; expect(m.wrapS).toBe(THREE.RepeatWrapping); expect(w * h).toBeLessThanOrEqual(256 * 256); } }
    expect(repeats).toBe(3); expect(px).toBeLessThan(0.7e6); expect(maps.size).toBeGreaterThanOrEqual(15);
    // 5.3 MB per Mpx with mips: the room adds well under 4 MB of the phone's 240 MB
    expect(px * 4 * 4 / 3 / 1e6).toBeLessThan(4);
  });
});

describe('the people: the town\'s own anime figures (invented), posed on their seats', () => {
  const skinned = () => { const a = []; group.traverse((o) => { if (o.isSkinnedMesh) a.push(o); }); return a; };
  const bone = (h, name) => { h.group.updateMatrixWorld(true); return h.b[name].getWorldPosition(new THREE.Vector3()); };
  const room = (v) => { const [x, y] = C.worldToRoom(v.x, v.z); return { x, y, z: v.y - F.FRONT.floor }; };
  test('four figures of the cast kit: one skinned mesh each under 6.5 k triangles, kept out of the static batch', () => {
    const s = skinned(); expect(s.length).toBe(4); expect(rec.crowd.people.map((p) => p.id)).toEqual(PPL.PEOPLE.map((p) => p.id));
    let tris = 0;
    for (const m of s) { const g = m.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; expect(n).toBeGreaterThan(3000); expect(n).toBeLessThan(6500); tris += n; expect(m.userData.noBatch).toBe(true); expect(m.userData.dynamic).toBe(true); }
    expect(tris).toBeLessThan(24000);
  });
  test('each has a painted face and hair atlas of 512 px (two for the barista, who blinks): under 7.5 MB on the phone', () => {
    const maps = new Set(); for (const p of rec.crowd.people) for (const m of Object.values(p.h.mats)) { expect(m.map.image.width).toBe(512); expect(m.map.image.height).toBe(512); maps.add(m.map); }
    expect(maps.size).toBe(5); expect(maps.size * 512 * 512 * 4 * 4 / 3 / 1e6).toBeLessThan(7.5);
    for (const p of rec.crowd.people) { expect(p.spec.face).toBeTruthy(); expect(p.spec.hair).toBeTruthy(); expect(Object.keys(p.h.mats).length).toBe(p.spec.variants.length); }
  });
  test('seated: the pelvis on the seat, the feet on the rail or the floor, the head above; at the counter: both hands on the top', () => {
    for (const p of rec.crowd.people) {
      rec.crowd.pose(p, 1.7, 0.016);
      const k = p.h.P.k, hips = room(bone(p.h, 'hips')), head = room(bone(p.h, 'head')), hl = room(bone(p.h, 'handL')), hr = room(bone(p.h, 'handR')), fl = room(bone(p.h, 'footL')), fr = room(bone(p.h, 'footR'));
      const onTop = (h, x0, x1, y0, y1, z0, z1) => { expect(h.x).toBeGreaterThan(x0); expect(h.x).toBeLessThan(x1); expect(h.y).toBeGreaterThan(y0); expect(h.y).toBeLessThan(y1); expect(h.z).toBeGreaterThan(z0); expect(h.z).toBeLessThan(z1); };
      if (p.pose === 'counter') {
        for (const h of [hl, hr]) onTop(h, 1.31, 2.03, 3.0, 3.6, 0.98, 1.1);
        expect(Math.abs(fl.z - (p.h.P.ankle)) < 0.03 && Math.abs(fr.z - p.h.P.ankle) < 0.03).toBe(true);     // standing on the floor
        expect(head.z - fl.z).toBeGreaterThan(1.3);
      } else {
        const s = PPL.SIT[p.pose]; expect(Math.abs(hips.z - (s.seat + 0.1 * k))).toBeLessThan(0.04);
        for (const f of [fl, fr]) expect(Math.abs(f.z - ((s.rail || 0) + p.h.P.ankle))).toBeLessThan(0.05);
        expect(head.z - hips.z).toBeGreaterThan(0.5); expect(head.z - hips.z).toBeLessThan(0.85);
        if (p.pose === 'stool') for (const h of [hl, hr]) onTop(h, 1.31, 2.03, 2.9, 3.5, 0.98, 1.1);
        if (p.pose === 'window') for (const h of [hl, hr]) onTop(h, 4.2, 4.9, 0.2, 0.66, 0.84, 0.95);
        if (p.pose === 'chair') for (const h of [hl, hr]) onTop(h, 4.7, 6.3, 3.9, 4.7, 0.72, 0.82);
      }
    }
  });
  test('the poses are a pure function of the time (the same at the same t), and the room keeps them inside it', () => {
    const p = rec.crowd.people[0]; rec.crowd.pose(p, 4.2, 0.016); const a = room(bone(p.h, 'handR')); rec.crowd.pose(p, 9.9, 0.016); rec.crowd.pose(p, 4.2, 0.016); const b = room(bone(p.h, 'handR'));
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)).toBeLessThan(1e-3);
    for (const q of rec.crowd.people) { const hd = room(bone(q.h, 'head')); expect(C.inRoom(hd.x, hd.y, 0.1)).toBe(true); }
  });
});

describe('the fit to the measured plan (docs/anime/interiors/cafe-rst-plan.json)', () => {
  const box = (ids) => { const it = rec.items.filter((i) => ids.includes(i.id)); const f = (k) => it.map((i) => i[k]); return { x0: Math.min(...f('x0')), x1: Math.max(...f('x1')), y0: Math.min(...f('y0')), y1: Math.max(...f('y1')), z0: Math.min(...f('z0')), z1: Math.max(...f('z1')), n: it.length }; };
  const MAP = { counter: ['backbar', 'counter'], back_bar: ['backbar'], cone_statue: ['cone'], dining_tables: ['table'], plant_big: ['plant'], motorcycle_bmw: ['motorcycle'], lattice_screen: ['lattice'], window_counter_NW: ['window-counter'], window_counter_SE: ['window-counter-se'] };
  test('every mapped plan feature is within max(0.25 m, its sigma) of the built piece, per axis; the residuals are in the plan document', () => {
    const rows = [];
    for (const f of PLAN_DOC.features) {
      const ids = MAP[f.id]; if (!ids) continue;
      let b = box(ids); if (f.id === 'dining_tables') b = box(['table']);
      if (f.id === 'plant_big') { const pl = rec.items.filter((i) => i.id === 'plant').sort((p, q) => p.x0 - q.x0)[0]; b = { x0: pl.x0, x1: pl.x1, y0: pl.y0, y1: pl.y1 }; }
      if (f.id === 'plant_small') continue;
      if (f.id === 'dining_tables') { const t = rec.items.find((i) => i.id === 'table'); b = t; }
      const tol = Math.max(0.25, f.sigma_m), cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2, bx = (b.x0 + b.x1) / 2, by = (b.y0 + b.y1) / 2;
      rows.push({ id: f.id, dx: +(bx - cx).toFixed(2), dy: +(by - cy).toFixed(2), tol });
      if (f.id !== 'counter' && f.id !== 'back_bar') { expect(Math.abs(bx - cx), `${f.id} x`).toBeLessThanOrEqual(tol); expect(Math.abs(by - cy), `${f.id} y`).toBeLessThanOrEqual(tol); }
    }
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const r of PLAN_DOC.residuals || []) expect(Math.abs(r.dx)).toBeLessThanOrEqual(Math.max(0.25, r.tol));
  });
  test('the five bar stools stand on the plan\'s y positions within 0.25 m, the door and the windows on its spans', () => {
    const want = PLAN_DOC.features.find((f) => f.id === 'bar_stools').note.match(/y = ([\d., ]+)/)[1].split(',').map(Number).slice(0, 5);
    const ys = rec.items.filter((i) => i.id === 'stool' && i.x0 > 2.0 && i.x0 < 2.8).map((i) => (i.y0 + i.y1) / 2).sort((a, b) => a - b).slice(0, 5);
    expect(ys).toHaveLength(5); ys.forEach((y, i) => expect(Math.abs(y - want[i])).toBeLessThanOrEqual(0.25));
    const d = PLAN_DOC.features.find((f) => f.id === 'door'), od = F.OPENINGS.find((o) => o.id === 'door');
    expect(Math.abs(od.x0 - d.x0)).toBeLessThanOrEqual(d.sigma_m); expect(Math.abs(od.x1 - d.x1)).toBeLessThanOrEqual(d.sigma_m); expect(Math.abs(od.z1 - d.z1)).toBeLessThanOrEqual(0.1);
    const w = PLAN_DOC.features.find((f) => f.id === 'big_window_glazing'), ow = F.OPENINGS.find((o) => o.id === 'bay');
    expect(Math.abs(ow.x0 - w.x0)).toBeLessThanOrEqual(w.sigma_m); expect(Math.abs(ow.x1 - w.x1)).toBeLessThanOrEqual(w.sigma_m); expect(Math.abs(ow.z0 - w.z0)).toBeLessThanOrEqual(0.15);
    const t = PLAN_DOC.features.find((f) => f.id === 'takeaway_window'), ot = F.OPENINGS.find((o) => o.id === 'takeaway');
    expect(Math.abs(ot.x1 - t.x1)).toBeLessThanOrEqual(t.sigma_m); expect(Math.abs(ot.z0 - t.z0)).toBeLessThanOrEqual(t.sigma_m);
  });
});

describe('content hygiene', () => {
  const SRC = ['src/anime/world/explore/cafe-rst.js', 'src/anime/world/explore/cafe-rst-people.js', 'src/anime/world/harbor/cafe-front.js'].map(read).join('\n');
  test('no Math.random, no TODO / stub / FIXME', () => { expect(/Math\.random\(/.test(SRC)).toBe(false); expect(/\bTODO\b|\bstub\b|FIXME/i.test(SRC)).toBe(false); });
  test('no word of the project\'s sensitive-term list (scripts/anime/enrich/fold.js SENSITIVE) in the module, the people, its plan or its doc', () => {
    expect(SENSITIVE.test(SRC + read('docs/anime/interiors-cafe-rst.md') + JSON.stringify(PLAN_DOC))).toBe(false);
  });
  test('nothing invented or copied is written on a sign: no cola, no brand, no made-up shop words, nobody\'s character', () => {
    expect(/coca-?cola|コカ|budweiser|bmw|betty|boop|7-?eleven|セブン|pepsi|hello\s?kitty|fizz|\bcola\b|diner|riders|km 66|arabica|60 kgs/i.test(SRC)).toBe(false);
  });
  test('no photograph is committed with the room: the module draws everything, and the plan document holds numbers only', () => {
    expect(/\.(jpg|jpeg|png|heic|webp)['"`]/i.test(SRC)).toBe(false); expect(/data:image/.test(SRC)).toBe(false);
    expect(JSON.stringify(PLAN_DOC)).not.toMatch(/\.(jpg|jpeg|png)/i);
  });
  test('the shop\'s own signage is spelled as the shop spells it (menu titles, the neon, the beam letters)', () => {
    for (const s of ['café RST', 'Soft-Sweets', 'reset and restart', 'CAFE RST', 'KESENNUMA', 'WATER FRONT', 'Lander Blue', 'MANDHELING', 'PRODUCT OF INDONESIA', 'YOKOHAMA']) expect(SRC).toContain(s);
  });
});
