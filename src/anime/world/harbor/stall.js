// [v3:fix] The promenade's signature props (V3-SPEC wow frame 2): a waterfront fish stall (鮮魚 浜よし) with an indigo
// 暖簾 and a hand-painted kanban, a red 提灯 pair, an ice counter of autumn fish (秋刀魚, 戻り鰹), a chalk A-board, fish
// boxes, and a 係船柱 bollard on the lawn edge for a harbour cat (published in out.bollards: life seats a cat on the
// first free cap ahead of the promenade walk spot). The vending machine next to the stall is town's full Sakura machine
// (town/props.js PROMENADE_VENDING). Everything sits in the first 30 m ahead of L.HERO.walk on the landward lawn
// between the promenade deck and the harbour road, so the wow2b frame (168,4.4,-122 > 120,5,-104) holds all three.
import * as THREE from 'three';
import { hmats, bollard, boxStack } from './props.js';
import { nightMat, registry } from './lights.js';
import { FONT, mapMat } from './util.js';

// the promenade frame: along the seawall walking west from the hero walk spot, and the landward normal
export const PROM = { p0: [163.8, -116.6], u: [-0.8316, 0.5555], n: [-0.5555, -0.8316] };
export const promAt = (s, d) => [PROM.p0[0] + PROM.u[0] * s + PROM.n[0] * d, PROM.p0[1] + PROM.u[1] * s + PROM.n[1] * d];
/** rotY facing the water (local +Z toward the promenade) */
export const PROM_FACE = Math.atan2(-PROM.n[0], -PROM.n[1]);
/** rotY half-turned toward a walker coming from the hero walk spot (the fronts read in the wow2 frames) */
export const PROM_WALKER = (() => { const fx = 0.35 * -PROM.n[0] + 0.65 * -PROM.u[0], fz = 0.35 * -PROM.n[1] + 0.65 * -PROM.u[1]; return Math.atan2(fx, fz); })();
/** where town puts the promenade vending machine (s, d, rotY) */
export const PROM_VENDING = { s: 15.4, d: 7.5, rotY: PROM_WALKER };

export function buildPromenadeStall(ctx, out = {}) {
  const L = ctx.L, T = ctx.tex;
  const M = hmats(ctx);
  const [sx, sz] = promAt(15.2, 10.2);
  const rot = PROM_WALKER, c = Math.cos(rot), s = Math.sin(rot);
  const W = 3.6, D = 2.3;
  // floor on the highest corner (the lawn slopes up to the road): a low concrete plinth covers the step
  let gMin = 1e9, gMax = -1e9;
  for (const [lx, lz] of [[-W / 2, 0], [W / 2, 0], [-W / 2, -D], [W / 2, -D]]) { const g = L.heightAt(sx + lx * c + lz * s, sz - lx * s + lz * c); gMin = Math.min(gMin, g); gMax = Math.max(gMax, g); }
  const y0 = gMax + 0.12;
  const g = new THREE.Group(); g.name = 'promenade-stall';
  g.position.set(sx, y0, sz); g.rotation.y = rot;
  const k = ctx.kit(g);

  // ---- textures (hand-painted, ≤ 512 px)
  const boardsTex = T.draw(256, 256, (x, w, h) => {
    x.fillStyle = '#7d5c45'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { x.fillStyle = ['#80604a', '#76563f', '#846450', '#6f513d'][i % 4]; x.fillRect(i * 32 + 2, 0, 28, h); x.fillStyle = '#5b4232'; x.fillRect(i * 32, 0, 2, h); }
    x.globalAlpha = 0.16; x.fillStyle = '#3d2c22'; for (let j = 0; j < 30; j++) x.fillRect((j * 67) % w, (j * 131) % h, 2, 18 + (j % 5) * 6); x.globalAlpha = 1;
  }, { key: 'fix-stall-boards', repeat: [1, 1] });
  const kanbanTex = T.draw(1024, 256, (x, w, h) => {
    // weathered cedar board, dark frame, brush lettering, a red 丸 crest (a fictional shop)
    x.fillStyle = '#e4cfa6'; x.fillRect(0, 0, w, h);
    x.globalAlpha = 0.22; x.strokeStyle = '#a07d52'; x.lineWidth = 2;
    for (let i = 0; i < 18; i++) { x.beginPath(); const yy = 12 + i * 13.5; x.moveTo(0, yy); for (let xx = 0; xx <= w; xx += 32) x.lineTo(xx, yy + Math.sin(xx * 0.013 + i) * 3); x.stroke(); }
    x.globalAlpha = 1; x.strokeStyle = '#4a3527'; x.lineWidth = 16; x.strokeRect(8, 8, w - 16, h - 16);
    x.fillStyle = '#c23b2e'; x.beginPath(); x.arc(128, h / 2, 74, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f6ecd8'; x.font = `700 92px ${FONT.brush}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('浜', 128, h / 2 + 4);
    x.fillStyle = '#2b2530'; x.font = `700 150px ${FONT.brush}`; x.fillText('鮮魚', 400, h / 2 + 8);
    x.font = `700 132px ${FONT.brush}`; x.fillText('浜よし', 760, h / 2 + 8);
    x.globalAlpha = 0.12; x.fillStyle = '#2b2530'; for (let i = 0; i < 40; i++) x.fillRect((i * 97) % w, (i * 53) % h, 3, 3); x.globalAlpha = 1;
  }, { key: 'fix-stall-kanban' });
  const norenTex = T.draw(512, 160, (x, w, h) => {
    x.fillStyle = '#2d3f68'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#26365c'; x.fillRect(0, 0, w, 14);
    x.fillStyle = '#f3efe4'; x.font = `700 84px ${FONT.serif}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    ['鮮', '魚', '浜', 'よし'].forEach((t, i) => { x.font = `700 ${t.length > 1 ? 58 : 84}px ${FONT.serif}`; x.fillText(t, w * (i + 0.5) / 4, h * 0.58); });
    x.fillStyle = '#1d2a47'; for (let i = 1; i < 4; i++) x.fillRect(w * i / 4 - 3, 14, 6, h);   // the slits between panels
  }, { key: 'fix-stall-noren' });
  const iceTex = T.draw(512, 256, (x, w, h) => {
    x.fillStyle = '#dfeaf0'; x.fillRect(0, 0, w, h);
    x.globalAlpha = 0.5; for (let i = 0; i < 160; i++) { x.fillStyle = i % 3 ? '#ffffff' : '#bcd3e0'; x.fillRect((i * 83) % w, (i * 47) % h, 7, 5); } x.globalAlpha = 1;
    // three trays: 秋刀魚 (slim silver-blue), 戻り鰹 (striped belly), キンキ (red)
    const fish = (cx, cy, len, body, belly, stripe) => {
      x.save(); x.translate(cx, cy); x.rotate(-0.12);
      x.fillStyle = body; x.beginPath(); x.ellipse(0, 0, len / 2, len * 0.13, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = belly; x.beginPath(); x.ellipse(0, len * 0.05, len * 0.42, len * 0.06, 0, 0, Math.PI * 2); x.fill();
      if (stripe) { x.strokeStyle = stripe; x.lineWidth = 2; for (let j = -2; j <= 2; j++) { x.beginPath(); x.moveTo(-len * 0.3, len * 0.04 + j * 3); x.lineTo(len * 0.3, len * 0.04 + j * 3); x.stroke(); } }
      x.fillStyle = body; x.beginPath(); x.moveTo(-len / 2, 0); x.lineTo(-len / 2 - len * 0.12, -len * 0.1); x.lineTo(-len / 2 - len * 0.12, len * 0.1); x.fill();
      x.fillStyle = '#23202a'; x.beginPath(); x.arc(len * 0.4, -len * 0.02, 3, 0, Math.PI * 2); x.fill();
      x.restore();
    };
    for (let i = 0; i < 7; i++) fish(90, 40 + i * 30, 140, '#5f7896', '#dfe6ee');
    for (let i = 0; i < 3; i++) fish(260, 60 + i * 70, 150, '#3f4a66', '#d9dee6', '#7d8aa3');
    for (let i = 0; i < 4; i++) fish(420, 50 + i * 52, 110, '#d0473b', '#f2b3a2');
    x.strokeStyle = '#9fb3c0'; x.lineWidth = 6; for (const xx of [172, 344]) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, h); x.stroke(); }
  }, { key: 'fix-stall-ice' });
  const tagTex = T.draw(512, 96, (x, w, h) => {
    x.fillStyle = '#fbf6e8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#c23b2e'; x.font = `700 40px ${FONT.hand}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('さんま 150円', w * 0.17, h / 2); x.fillStyle = '#2b2530'; x.fillText('戻りかつお', w * 0.5, h / 2); x.fillStyle = '#c23b2e'; x.fillText('きんき', w * 0.83, h / 2);
  }, { key: 'fix-stall-tags' });
  const chalkTex = T.draw(256, 384, (x, w, h) => {
    x.fillStyle = '#3f5a4c'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#8a6446'; x.lineWidth = 18; x.strokeRect(0, 0, w, h);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#f4eedc'; x.font = `700 44px ${FONT.hand}`; x.fillText('本日の', w / 2, 64);
    x.fillText('おすすめ', w / 2, 116);
    x.fillStyle = '#f2c35a'; x.font = `700 52px ${FONT.hand}`; x.fillText('戻りかつお', w / 2, 196);
    x.fillStyle = '#f39aa6'; x.font = `700 40px ${FONT.hand}`; x.fillText('刺身あります', w / 2, 272);
    x.fillStyle = '#f4eedc'; x.font = `700 30px ${FONT.hand}`; x.fillText('〜17:00', w / 2, 330);
  }, { key: 'fix-stall-chalk' });

  // ---- structure: plinth, back + side walls (vertical cedar boards), shed roof with a deep front eave
  const wood = mapMat(ctx, 'toon', '#ffffff', boardsTex, { paint: 0.04 });
  const post = ctx.mat.toon('#5b4232', { paint: 0.04 });
  const conc = ctx.mat.toon('#bdb8ac', { paint: 0.08 });
  k.box(W + 0.3, y0 - gMin + 0.06, D + 0.4, conc, [0, -(y0 - gMin + 0.06) / 2 + 0.03, -D / 2 + 0.05]);
  k.box(W, 2.45, 0.12, wood, [0, 1.225, -D]);
  for (const sx2 of [-W / 2, W / 2]) k.box(0.12, 2.45, D, wood, [sx2, 1.225, -D / 2]);
  for (const sx2 of [-W / 2 + 0.06, W / 2 - 0.06]) k.box(0.12, 2.45, 0.12, post, [sx2, 1.225, -0.06]);
  // warm interior: back wall panel that glows at night (a bare bulb inside)
  const inner = nightMat(ctx, '#8a6b52', '#ffcf8f', 0.95);
  k.box(W - 0.3, 1.2, 0.02, inner, [0, 1.75, -D + 0.08]);
  // roof: slate tiles, sloping back, 0.7 m front eave; a fascia board
  const roofM = ctx.mat.toon('#4b5767', { paint: 0.06 });
  const roof = k.box(W + 0.6, 0.1, D + 1.0, roofM, [0, 2.62, -D / 2 + 0.2]); roof.rotation.x = -0.14;
  for (let i = 0; i < 9; i++) k.box(0.04, 0.05, D + 1.0, ctx.mat.toon('#3f4a59', { paint: 0 }), [-W / 2 - 0.2 + i * (W + 0.4) / 8, 2.69, -D / 2 + 0.2]).rotation.x = -0.14;
  k.box(W + 0.62, 0.16, 0.05, post, [0, 2.57, 0.7]);
  // the hand-painted kanban standing on the eave
  const kb = mapMat(ctx, 'toon', '#ffffff', kanbanTex, { paint: 0.02 });
  k.box(W - 0.2, 0.78, 0.06, post, [0, 3.18, 0.1]);
  const kp = k.plane(W - 0.34, 0.66, kb, [0, 3.18, 0.135]);
  for (const sx2 of [-1.2, 1.2]) k.box(0.06, 0.4, 0.06, post, [sx2, 2.78, 0.1]);
  // noren on a bamboo rod under the eave
  const rod = ctx.mat.toon('#c8b27a', { paint: 0 });
  k.cyl(0.025, 0.025, W - 0.1, rod, [0, 2.3, 0.08], [0, 0, Math.PI / 2], 6);
  const nm = mapMat(ctx, 'toon', '#ffffff', norenTex, { paint: 0.02, side: 'double' });
  const np = k.plane(W - 0.3, 0.72, nm, [0, 1.93, 0.1]); np.rotation.x = 0.06;
  ctx.noOutline(np);
  // counter: a slanted ice display (fish on crushed ice) with a hand-written price strip
  const counterM = ctx.mat.toon('#e6e2d6', { paint: 0.05 });
  k.box(W - 0.3, 0.82, 0.62, counterM, [0, 0.41, -0.2]);
  k.box(W - 0.3, 0.05, 0.05, ctx.mat.toon('#3f78b9', { paint: 0.02 }), [0, 0.8, 0.12]);
  const ice = mapMat(ctx, 'toon', '#ffffff', iceTex, { paint: 0 });
  const ip = k.plane(W - 0.4, 0.62, ice, [0, 0.92, -0.2]); ip.rotation.x = -Math.PI / 2 + 0.32;
  const tg = mapMat(ctx, 'toon', '#ffffff', tagTex, { paint: 0 });
  k.plane(W - 0.5, 0.22, tg, [0, 0.66, 0.115]);
  // a bare bulb under the eave + two red 提灯 at the front posts
  const bulb = nightMat(ctx, '#e9dfc6', '#ffd9a0', 2.6);
  k.sphere(0.07, bulb, [0, 2.2, -0.35], 8);
  const lantM = nightMat(ctx, '#c9453a', '#ff7a4a', 1.9, { always: 0.15 });
  const capM = ctx.mat.toon('#2f2b33', { paint: 0 });
  for (const sx2 of [-W / 2 + 0.06, W / 2 - 0.06]) {
    const lz = 0.18;
    k.mesh(LANTERN(), lantM, [sx2, 2.02, lz], null, [0.22, 0.34, 0.22]);
    k.cyl(0.08, 0.08, 0.04, capM, [sx2, 2.2, lz], null, 10); k.cyl(0.08, 0.08, 0.04, capM, [sx2, 1.84, lz], null, 10);
  }
  // chalk A-board and fish boxes at the side
  const ch = mapMat(ctx, 'toon', '#ffffff', chalkTex, { paint: 0 });
  const ab = new THREE.Group(); ab.position.set(W / 2 + 0.65, 0, 0.45); ab.rotation.y = -0.35; g.add(ab);
  const ak = ctx.kit(ab);
  const fr = ak.box(0.62, 0.92, 0.04, ctx.mat.toon('#8a6446', { paint: 0.04 }), [0, 0.46, 0.18]); fr.rotation.x = -0.2;
  const cp = ak.plane(0.52, 0.8, ch, [0, 0.47, 0.205]); cp.rotation.x = -0.2;
  const bk = ak.box(0.62, 0.92, 0.04, ctx.mat.toon('#8a6446', { paint: 0.04 }), [0, 0.46, -0.18]); bk.rotation.x = 0.2;
  boxStack(k, M, -W / 2 - 0.55, 0, -0.5, { n: 4, color: 'blue', rotY: 0.2 });
  boxStack(k, M, -W / 2 - 0.5, 0, -1.3, { n: 3, color: 'white', rotY: -0.1 });
  ctx.addStatic(g);
  g.updateWorldMatrix(true, true);
  const wp = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(g.matrixWorld);
  const R = registry(ctx);
  { const b = wp(0, 2.2, -0.35); R?.point({ x: b.x, y: b.y, z: b.z, color: '#ffd9a0', size: 0.5, intensity: 1.8, mode: 'lamps' }); }
  for (const sx2 of [-W / 2 + 0.06, W / 2 - 0.06]) { const p = wp(sx2, 2.02, 0.18); R?.lantern({ x: p.x, y: p.y, z: p.z }); }
  if (ctx.physics?.addBox) { const cc = wp(0, 0, -D / 2); ctx.physics.addBox(cc.x, cc.z, W + 0.2, D + 0.3, rot, gMin, y0 + 2.6); }

  // ---- the 係船柱 on the lawn edge beside the deck (a harbour cat's seat), yellow cap
  const [bx, bz] = promAt(10.4, 7.1);
  const by = L.heightAt(bx, bz);
  const bg = new THREE.Group(); bg.name = 'promenade-bollard'; const bk2 = ctx.kit(bg);
  bk2.cyl(0.42, 0.46, Math.max(0.12, by - gMin + 0.1), conc, [bx, by - 0.02, bz], null, 12);
  bollard(bk2, M, bx, by + 0.04, bz, { big: true });
  ctx.addStatic(bg);
  ctx.physics?.addCylinder?.(bx, bz, 0.35, by, by + 0.85);
  const top = new THREE.Vector3(bx, by + 0.04 + 0.62 * 1.35, bz);
  (out.bollards ||= []).unshift(top);
  out.stall = { x: sx, z: sz, rotY: rot, bollard: top };
  return out;
}

let _lantern = null;
function LANTERN() {
  if (_lantern) return _lantern;
  // a 提灯: a sphere squashed into a barrel, with ribs from the lathe
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10, y = t - 0.5; pts.push(new THREE.Vector2(0.5 * Math.sin(Math.PI * (0.12 + 0.76 * t)) + 0.02 * ((i % 2) ? 1 : 0), y)); }
  _lantern = new THREE.LatheGeometry(pts, 12);
  return _lantern;
}
