// [v5:detail] The facade detail kit for the photo-matched waterfront (minami5.js): lit shop interiors behind mullioned
// glazing, nobori banners, bicycles, A-board menus, planters, lamp posts, café tables, seated and standing people, and the
// sign boards the author's photos show (raw/author-photos, 2026-10-01 17:07-17:22 JST). Everything is toon-shaded and
// outlined like the rest of the town; interiors are small painted canvases (256 px) so the phone tier stays light.
//
//   const D = detailKit(ctx, k);                      // k = the world kit of the caller (ctx.kit(group))
//   D.glazing({ a, u, n, s0, s1, y0, y1, cols, rows, kind, frame })   // a pane grid on a wall face
//   D.nobori(x, y, z, rotY, { text, bg, fg })  D.bike(x, y, z, rotY, colour)  D.aBoard(...)  D.person(...)
import * as THREE from 'three';
import { textTex, vTextTex, mapMat, FONT } from './util.js';
import { nightMat } from './lights.js';

const _shop = new Map();
/** Painted interior behind shop glass. kind: cafe (warm, pendant lamps, counter, shelves), shop (racks of clothes),
 *  brew (bar, taps, fridges), office (cool white ceiling panels, desks), studio (radio studio: desks, screens), dark. */
export function interiorTex(ctx, kind = 'cafe') {
  return ctx.tex.draw(256, 256, (g, w, h) => {
    const P = {
      cafe: ['#ffd9a3', '#e0a25f', '#7a4a2c', '#5a3624'], shop: ['#fff0d4', '#e8c79a', '#8b6b52', '#4f4a52'], brew: ['#ffe2a8', '#dba566', '#6d4a32', '#3a3a3e'],
      office: ['#f4f6f2', '#d8dcd6', '#9aa0a4', '#5d6266'], studio: ['#fff1d8', '#e7c79c', '#6b5a4c', '#2f3238'], dark: ['#5d636b', '#3f444b', '#2c3036', '#22252a'],
      glow: ['#ffe2b4', '#f0b878', '#c98a54', '#8a5a3a'],
    }[kind] || ['#ffd9a3', '#e0a25f', '#7a4a2c', '#5a3624'];
    const r = ctx.rng('int5' + kind);
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, P[0]); sky.addColorStop(0.55, P[1]); sky.addColorStop(1, P[2]); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    // ceiling with lamps
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, w, h * 0.12);
    for (let i = 0; i < 5; i++) { const x = 20 + i * 52 + r() * 10; g.fillStyle = kind === 'office' ? '#ffffff' : '#fff6d8'; if (kind === 'office') g.fillRect(x - 14, 6, 28, 5); else { g.fillRect(x - 0.5, 0, 1.5, 18 + r() * 14); g.beginPath(); g.arc(x, 24 + r() * 12, 5, 0, 7); g.fill(); } }
    // back wall: shelves / racks / screens
    if (kind === 'shop') for (let i = 0; i < 9; i += 2) { const x = 8 + i * 28; g.fillStyle = ['#c84a4a', '#3b5c8a', '#e6d7b8', '#55704a', '#2d2d35', '#b98a5a'][Math.floor(r() * 6)]; g.fillRect(x, h * 0.32, 18, h * 0.3 + r() * 20); g.fillStyle = '#4f4036'; g.fillRect(x - 2, h * 0.3, 24, 3); }
    else if (kind === 'office' || kind === 'studio') for (let i = 0; i < 4; i++) { g.fillStyle = kind === 'studio' ? '#2a3a4c' : '#c9ced0'; g.fillRect(14 + i * 62, h * 0.36, 40, 26); }
    else if (kind !== 'glow') for (let s = 0; s < 3; s++) { const y = h * (0.26 + s * 0.11); g.fillStyle = P[3]; g.fillRect(0, y, w, 3); for (let i = 0; i < 8; i++) { g.fillStyle = ['#f3efe6', '#c9b28c', '#8a5a3c', '#e2c46a', '#5b7a8a'][Math.floor(r() * 5)]; g.fillRect(r() * w, y - 8, 5 + r() * 6, 8); } }
    if (kind === 'brew') for (let i = 0; i < 3; i++) { g.fillStyle = '#d9e4ea'; g.fillRect(150 + i * 34, h * 0.3, 28, h * 0.5); g.fillStyle = '#ffffff'; for (let j = 0; j < 4; j++) g.fillRect(153 + i * 34, h * (0.33 + j * 0.11), 22, 3); }
    // counter / desks
    if (kind !== 'shop' && kind !== 'glow') { g.fillStyle = P[3]; g.fillRect(0, h * 0.62, w * (kind === 'brew' ? 0.55 : 0.7), h * 0.38); g.fillStyle = 'rgba(255,240,210,0.35)'; g.fillRect(0, h * 0.62, w * (kind === 'brew' ? 0.55 : 0.7), 4); }
    // people silhouettes and a plant
    for (let i = 0; i < (kind === 'dark' || kind === 'glow' ? 0 : 2); i++) { const x = 40 + r() * 180, y = h * (0.5 + r() * 0.08); g.fillStyle = ['#3d3340', '#5b4038', '#2f3a4a'][i % 3]; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillRect(x - 10, y + 6, 20, 46); }
    g.fillStyle = '#4e6e3e'; g.beginPath(); g.arc(w - 24, h * 0.66, 13, 0, 7); g.fill(); g.fillStyle = '#6b4a34'; g.fillRect(w - 31, h * 0.7, 14, 22);
    // floor glow
    const fl = g.createLinearGradient(0, h * 0.82, 0, h); fl.addColorStop(0, 'rgba(255,230,180,0)'); fl.addColorStop(1, 'rgba(255,230,180,0.25)'); g.fillStyle = fl; g.fillRect(0, h * 0.82, w, h * 0.18);
  }, { key: 'int5-' + kind, repeat: [1, 1] });
}

/** Shop glass: by day the interior shows dimly through a sky-tinted pane; as the night factor or the look's uLit rises
 *  the interior lights (ShaderMaterial: survives static batching like harbor nightMat). */
export function shopGlass(ctx, kind = 'cafe', gain = 1.0) {
  const key = kind + '|' + gain;
  if (_shop.has(key) && _shop.get(key).ctx === ctx) return _shop.get(key).m;
  const S = ctx.shared; S.uLit ??= { value: 0 }; S.uNight ??= { value: 0 };
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uGain: { value: gain }, uGlass: { value: new THREE.Color('#7f93a6') } }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv; varying vec3 vN;
      void main(){ vUv = uv; vec4 wp = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp; vN = normalize(mat3(modelMatrix) * normal); vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D map; uniform float uNight, uLit, uGain; uniform vec3 uGlass; varying vec2 vUv; varying vec3 vN;
      void main(){
        vec3 t = texture2D(map, vUv).rgb;
        float k = clamp(max(uNight, uLit), 0.0, 1.0);
        vec3 day = mix(t * 0.32, uGlass, 0.55) * (0.9 + 0.1 * vUv.y);
        vec3 col = mix(day, t * uGain * (0.92 + 0.12 * vUv.y), k);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
    fog: true,
  });
  m.uniforms.map.value = interiorTex(ctx, kind);
  m.uniforms.uNight = S.uNight; m.uniforms.uLit = S.uLit;
  m.name = 'shopGlass';
  _shop.set(key, { ctx, m });
  return m;
}

/** The detail kit bound to a world kit. */
export function detailKit(ctx, k) {
  const t = (c, o = { paint: 0.03 }) => ctx.mat.toon(c, o);
  const M = {
    frameW: t('#f3f3ef'), frameB: t('#2c2a2a', { paint: 0 }), frameD: t('#4a3a2e'), frameS: t('#9ea4a8', { paint: 0 }), steel: t('#3d4146', { paint: 0 }), rail: t('#b7bec4', { paint: 0 }),
    pole: t('#d9dbd8', { paint: 0 }), base: t('#e9e9e4', { paint: 0.02 }), tyre: t('#1f2023', { paint: 0 }), board: t('#3a2c22'), wood: t('#9c7350'), woodL: t('#b88e64'),
    leaf: t('#5f8a4a', { paint: 0.08 }), leafB: t('#7aa05a', { paint: 0.08 }), soil: t('#4b3f33'), skin: t('#e2b896', { paint: 0 }), red: t('#b8322c'), white: t('#f1f1ee'),
    glow: nightMat(ctx, '#efe6c8', '#ffd890', 2.2), spot: nightMat(ctx, '#e9e4d6', '#fff2d6', 2.6),
  };
  const D = { M };
  const ry = (n) => Math.atan2(n[0], n[1]);
  /** A pane grid on a wall face: a = the face start [x, z], u = along the face, n = outward normal, s0..s1 metres along,
   *  y0..y1 heights. Interior planes sit 0.06 m inside the frame; mullions every (s1 - s0) / cols, transoms per rows
   *  (or an explicit list of transom heights). */
  D.glazing = ({ a, u, n, s0, s1, y0, y1, cols = 1, rows = 1, transoms = null, kind = 'cafe', frame = M.frameW, fw = 0.09, gain = 1.0, depth = 0.08, out = 0.0, glass = null }) => {
    const gm = glass || shopGlass(ctx, kind, gain), rot = ry(n), w = s1 - s0, at = (s, d) => [a[0] + u[0] * s + n[0] * d, a[1] + u[1] * s + n[1] * d];
    const T = transoms || Array.from({ length: rows - 1 }, (_, i) => y0 + (y1 - y0) * (i + 1) / rows);
    const ys = [y0, ...T, y1];
    for (let c = 0; c < cols; c++) for (let r = 0; r < ys.length - 1; r++) {
      const sa = s0 + w * c / cols, sb = s0 + w * (c + 1) / cols, [x, z] = at((sa + sb) / 2, out - 0.02);
      k.plane(sb - sa - fw * 0.5, ys[r + 1] - ys[r] - fw * 0.5, gm, [x, (ys[r] + ys[r + 1]) / 2, z], [0, rot, 0]);
    }
    for (let c = 0; c <= cols; c++) { const [x, z] = at(s0 + w * c / cols, out + depth / 2); k.box(fw, y1 - y0 + fw, depth, frame, [x, (y0 + y1) / 2, z], [0, rot, 0]); }
    for (const y of ys) { const [x, z] = at((s0 + s1) / 2, out + depth / 2); k.box(w + fw, fw, depth, frame, [x, y, z], [0, rot, 0]); }
  };
  /** A vertical text sign on glass or a wall (decal). */
  D.text = (text, w, h, x, y, z, rotY, { color = '#f4f2ea', font = FONT.sans, weight = 900, size = 0.72, bg = null, glow = 0 } = {}) => {
    // texture width from the text length (a single letter needs 256 px, a long line 1024), height to the plane's aspect,
    // capped at 512 so the phone tier's texture memory stays modest
    const tw = Math.min(512, Math.max(128, 2 ** Math.ceil(Math.log2([...text].length * 96)))), th = Math.min(256, Math.max(32, Math.round(tw * h / w)));
    const tex = textTex(ctx, text, { w: tw, h: th, color, bg, font, weight, size });
    const mat = glow ? glowMat(ctx, tex, glow) : mapMat(ctx, bg ? 'toon' : 'decal', '#ffffff', tex, bg ? { paint: 0 } : { transparent: true, alphaTest: 0.3 });
    return k.plane(w, h, mat, [x, y, z], [0, rotY, 0]);
  };
  /** 幟 (nobori): white pole, top bar, the banner, a water-weight base. */
  D.nobori = (x, y, z, rotY, { text = '営業中', bg = '#5b2a4a', fg = '#f6efe6', h = 2.6, w = 0.6, border = null, font = FONT.brush } = {}) => {
    const g = k.group([x, y, z], rotY), kk = ctx.kit(g);
    kk.cyl(0.025, 0.025, h + 0.4, M.pole, [0, (h + 0.4) / 2, 0], null, 6);
    kk.box(w + 0.05, 0.03, 0.03, M.pole, [w / 2, h + 0.3, 0]);
    kk.cyl(0.22, 0.26, 0.28, M.base, [0, 0.14, 0], null, 10);
    const tex = vTextTex(ctx, text, { w: 64, h: 256, color: fg, bg, font, weight: 700, border });
    kk.plane(w, h - 0.5, mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0, side: 'double' }), [w / 2, 0.5 + (h - 0.5) / 2 + 0.25, 0], [0, 0, 0]);
    return g;
  };
  /** A bicycle (1.7 m), wheels as rings, frame bars, saddle and bar. */
  D.bike = (x, y, z, rotY, colour = '#2a2b2e') => {
    const g = k.group([x, y, z], rotY), kk = ctx.kit(g), fm = t(colour, { paint: 0 });
    for (const s of [-0.53, 0.53]) { kk.mesh(new THREE.TorusGeometry(0.33, 0.035, 5, 18), M.tyre, [0, 0.35, s], [0, Math.PI / 2, 0]); kk.box(0.02, 0.62, 0.02, M.frameS, [0, 0.35, s], [Math.PI / 2, 0, 0]); }
    const bar = (p, q, r2 = 0.025) => { const dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dy, dz); return kk.box(r2, r2, L, fm, [0, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], [Math.atan2(-dy, dz), 0, 0]); };
    bar([0, 0.35, -0.53], [0, 0.42, 0]); bar([0, 0.42, 0], [0, 0.82, -0.18]); bar([0, 0.82, -0.18], [0, 0.85, 0.36]); bar([0, 0.42, 0], [0, 0.85, 0.36]); bar([0, 0.85, 0.36], [0, 0.35, 0.53]); bar([0, 0.82, -0.18], [0, 0.35, -0.53]);
    kk.box(0.12, 0.05, 0.24, M.tyre, [0, 0.92, -0.2]); kk.box(0.5, 0.03, 0.03, M.tyre, [0, 1.02, 0.4]); kk.box(0.03, 0.18, 0.03, M.tyre, [0, 0.93, 0.38]);
    kk.box(0.3, 0.16, 0.22, t('#3a3a3d', { paint: 0 }), [0, 0.92, 0.6]);   // front basket
    return g;
  };
  /** A-board menu stand facing rotY. */
  D.aBoard = (x, y, z, rotY, { bg = '#2d2b2a', fg = '#f1ead8', h = 1.0, w = 0.6, text = 'MENU' } = {}) => {
    const g = k.group([x, y, z], rotY), kk = ctx.kit(g);
    for (const s of [-1, 1]) { const p = kk.box(w, h, 0.03, M.wood, [0, h / 2 - 0.02, s * 0.14]); p.rotation.x = s * 0.17; }
    const tex = textTex(ctx, text, { w: 128, h: 192, color: fg, bg, font: FONT.hand, weight: 400, size: 0.22 });
    const pl = kk.plane(w * 0.86, h * 0.8, mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0 }), [0, h / 2, 0.165]); pl.rotation.x = 0.17;
    return g;
  };
  /** A planter box with a low shrub. */
  D.planter = (x, y, z, rotY, { w = 1.2, d = 0.45, h = 0.45, mat = M.wood } = {}) => {
    const g = k.group([x, y, z], rotY), kk = ctx.kit(g);
    kk.box(w, h, d, mat, [0, h / 2, 0]);
    for (let i = 0; i < Math.max(1, Math.round(w / 0.5)); i++) kk.mesh(new THREE.IcosahedronGeometry(0.3, 0), i % 2 ? M.leaf : M.leafB, [-w / 2 + 0.25 + i * 0.5, h + 0.15, 0], [i, i * 0.7, 0], [1, 0.7, 0.8]);
    return g;
  };
  /** A low shrub clump on the ground. */
  D.shrub = (x, y, z, s = 1) => { for (let i = 0; i < 3; i++) k.mesh(new THREE.IcosahedronGeometry(0.32 * s, 0), i % 2 ? M.leaf : M.leafB, [x + (i - 1) * 0.3 * s, y + 0.18 * s, z + ((i * 7) % 3 - 1) * 0.15 * s], [i, i, 0], [1, 0.75, 1]); };
  /** A slim lamp post (h m) with a lit head. */
  D.lampPost = (x, y, z, h = 4.0, { arm = 0, rotY = 0, mat = M.steel } = {}) => {
    k.cyl(0.06, 0.08, h, mat, [x, y + h / 2, z], null, 8);
    if (arm) { const ax = x + Math.sin(rotY) * arm / 2, az = z + Math.cos(rotY) * arm / 2; k.box(0.06, 0.06, arm, mat, [ax, y + h - 0.05, az], [0, rotY, 0]); k.box(0.34, 0.12, 0.2, M.glow, [x + Math.sin(rotY) * arm, y + h - 0.15, z + Math.cos(rotY) * arm], [0, rotY, 0]); }
    else k.box(0.2, 0.32, 0.2, M.glow, [x, y + h + 0.1, z]);
  };
  /** A low bollard light (0.7 m). */
  D.bollardLight = (x, y, z, h = 0.7) => { k.cyl(0.08, 0.08, h, M.steel, [x, y + h / 2, z], null, 8); k.cyl(0.085, 0.085, 0.12, M.glow, [x, y + h - 0.12, z], null, 8); };
  /** A small café table with two stools. */
  D.cafeSet = (x, y, z, rotY, { top = M.wood, stool = M.red } = {}) => {
    const g = k.group([x, y, z], rotY), kk = ctx.kit(g);
    kk.box(1.1, 0.05, 0.6, top, [0, 0.95, 0]); for (const s of [-0.48, 0.48]) for (const q of [-0.24, 0.24]) kk.box(0.04, 0.95, 0.04, M.steel, [s, 0.475, q]);
    for (const s of [-0.75, 0.75]) { kk.cyl(0.17, 0.17, 0.04, stool, [s, 0.66, 0.45], null, 10); kk.cyl(0.02, 0.02, 0.64, M.steel, [s, 0.33, 0.45], null, 5); }
    return g;
  };
  /** A person (1.65 m): standing or seated (sit = the seat height), simple cel-shaded silhouette. */
  D.person = (x, y, z, rotY, { sit = 0, top = '#2f3440', bottom = '#2a2a30', hair = '#1d1a1a' } = {}) => {
    const g = k.group([x, y, z], rotY), kk = ctx.kit(g), mt = t(top, { paint: 0 }), mb = t(bottom, { paint: 0 }), mh = t(hair, { paint: 0 });
    if (sit) {
      kk.box(0.36, 0.14, 0.5, mb, [0, sit + 0.07, 0.12]); for (const s of [-0.1, 0.1]) kk.box(0.13, sit, 0.13, mb, [s, sit / 2, 0.36]);
      kk.box(0.4, 0.55, 0.24, mt, [0, sit + 0.42, -0.04]); kk.sphere(0.12, M.skin, [0, sit + 0.85, -0.02], 8); kk.sphere(0.125, mh, [0, sit + 0.89, -0.05], 8);
    } else {
      for (const s of [-0.1, 0.1]) kk.box(0.14, 0.82, 0.16, mb, [s, 0.41, 0]);
      kk.box(0.42, 0.62, 0.24, mt, [0, 1.12, 0]); for (const s of [-0.26, 0.26]) kk.box(0.1, 0.56, 0.12, mt, [s, 1.1, 0]);
      kk.sphere(0.12, M.skin, [0, 1.55, 0], 8); kk.sphere(0.125, mh, [0, 1.59, -0.03], 8);
    }
    return g;
  };
  /** A parked car (kei 3.4 m or compact 4.4 m): rounded body, glass cabin with a body-colour roof, wheels, lamps. */
  D.car = (x, y, z, rotY, { color = '#7a1f2e', kind = 'kei' } = {}) => {
    const g = k.group([x, y, z], rotY), kk = ctx.kit(g), body = t(color, { paint: 0.01 }), glass = t('#2e3a48', { paint: 0 });
    const L = kind === 'kei' ? 3.4 : kind === 'van' ? 4.7 : 4.4, W = kind === 'kei' ? 1.48 : 1.74, cab = kind === 'kei' ? 0.78 : kind === 'van' ? 0.8 : 0.6, ch = kind === 'kei' ? 0.72 : kind === 'van' ? 0.85 : 0.56;
    kk.rbox(W, 0.66, L, 0.14, body, [0, 0.6, 0]);
    kk.rbox(W * 0.93, ch, L * cab, 0.12, glass, [0, 0.9 + ch / 2, -L * (kind === 'kei' ? 0.04 : 0.06)]);
    kk.rbox(W * 0.95, 0.08, L * cab * 0.94, 0.03, body, [0, 0.92 + ch, -L * (kind === 'kei' ? 0.04 : 0.06)]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kk.cyl(0.3, 0.3, 0.2, M.tyre, [sx * (W / 2 - 0.08), 0.3, sz * (L / 2 - 0.62)], [0, 0, Math.PI / 2], 12);
    for (const sx of [-1, 1]) { kk.box(0.3, 0.12, 0.05, M.white, [sx * (W / 2 - 0.3), 0.72, L / 2 + 0.01]); kk.box(0.26, 0.12, 0.05, t('#b3262c', { paint: 0 }), [sx * (W / 2 - 0.25), 0.78, -L / 2 - 0.01]); }
    return g;
  };
  /** A wall spot lamp (gooseneck) pointing out along n. */
  D.gooseneck = (x, y, z, n) => { k.box(0.04, 0.04, 0.5, M.steel, [x + n[0] * 0.25, y, z + n[1] * 0.25], [0, ry(n), 0]); k.box(0.16, 0.1, 0.16, M.spot, [x + n[0] * 0.5, y - 0.05, z + n[1] * 0.5], [0, ry(n), 0]); };
  return D;
}

const _glow = new Map();
/** A self-lit textured material (neon, lit sign faces). */
export function glowMat(ctx, tex, kk = 1.25) { const key = tex.uuid + '|' + kk; if (!_glow.has(key)) { const mm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, toneMapped: false, depthWrite: false }); mm.color.setScalar(kk); _glow.set(key, mm); } return _glow.get(key); }

/** A painted oval sign (the HAVE A NICE COFFEE oval): transparent corners. */
export function ovalTex(ctx, { lines = ['HAVE A NICE', 'COFFEE', 'RST'], fill = '#f3cfc8', ring = '#8a3c3c', ink = '#9b2f2b', key }) {
  return ctx.tex.draw(256, 176, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = ring; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 4, h / 2 - 4, 0, 0, 7); g.fill();
    g.fillStyle = fill; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 22, h / 2 - 20, 0, 0, 7); g.fill();
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${h * 0.12}px ${FONT.sans}`; g.fillText(lines[0], w / 2, h * 0.26);
    g.font = `900 ${h * 0.3}px ${FONT.sans}`; g.fillText(lines[1], w / 2, h * 0.52);
    g.font = `700 ${h * 0.1}px ${FONT.sans}`; g.fillText(lines[2], w / 2, h * 0.76);
  }, { key: key || 'oval5|' + lines.join('|') });
}
