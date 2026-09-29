// [v3:fix] 魚町 / 南町 izakaya lane kit: red 提灯 pairs at shop doors, an 行灯 standing sign (lit at dusk) with a
// fictional izakaya name, and strings of small lanterns under the eaves, on the shop fronts of the harbour-side quarters
// (the hero zone had no red lanterns or drinking-street signs). Static geometry through ctx.kit (merged by material);
// the glow comes from life's light registry (town/index.js registers out.lanterns) and harbor's night materials.
import * as THREE from 'three';
import { nightMat, nightUniform } from '../harbor/lights.js';

const NAMES = [['居酒屋', 'かもめ'], ['酒処', '浜風'], ['小料理', 'しおさい'], ['炉端', '大漁'], ['居酒屋', '港'], ['酒場', 'いさり火'], ['おでん', 'ともしび'], ['割烹', '潮見']];
const QUARTERS = ['魚町', '南町', '内湾', '八日町'];

export function buildLaneLanterns(ctx, shopFronts, out) {
  const L = ctx.L;
  const areaOf = (x, z) => { for (const a of L.AREAS || []) if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return a.name; return ''; };
  // food and drink fronts only (a florist or a barber with izakaya lanterns read wrong)
  const FOOD = /鮮魚|寿|すし|酒|食堂|ラーメン|そば|牡蠣|かき|ふかひれ|海産|乾物|居酒屋|炉端/;
  const DINE = /寿|すし|酒場|食堂|ラーメン|そば|牡蠣|かき|居酒屋|炉端/;
  const picks = shopFronts.filter((s) => QUARTERS.includes(areaOf(s.x, s.z)) && FOOD.test((s.type || '') + (s.name || '')));
  if (!picks.length) return { lanes: 0 };
  const r = ctx.rng('fix-lane-lanterns');
  const root = new THREE.Group(); root.name = 'lane-lanterns';
  const k0 = ctx.kit(root);
  const redM = nightMat(ctx, '#cf4636', '#ff7048', 1.9, { always: 0.12 });
  const capM = ctx.mat.toon('#2f2a30', { paint: 0 });
  const andonFrame = ctx.mat.toon('#4a3a30', { paint: 0.04 });
  const lantern = (k, x, y, z, s = 1) => {
    k.mesh(LANT(), redM, [x, y, z], null, [0.34 * s, 0.5 * s, 0.34 * s]);
    k.cyl(0.12 * s, 0.12 * s, 0.05 * s, capM, [x, y + 0.27 * s, z], null, 10);
    k.cyl(0.12 * s, 0.12 * s, 0.05 * s, capM, [x, y - 0.27 * s, z], null, 10);
  };
  const andonTex = new Map();
  const andonMat = (i) => {
    if (andonTex.has(i)) return andonTex.get(i);
    const [kind, name] = NAMES[i];
    const tex = ctx.tex.draw(128, 384, (g, w, h) => {
      g.fillStyle = '#f7f0de'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#b8352b'; g.fillRect(0, 0, w, 58);
      g.fillStyle = '#fbf3e2'; g.font = `700 30px "Yuji Syuku", "Noto Serif JP", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(kind, w / 2, 30);
      g.fillStyle = '#2b2530'; const chars = [...name], s = Math.min(78, 300 / chars.length);
      g.font = `700 ${s}px "Yuji Syuku", "Noto Serif JP", serif`;
      chars.forEach((c, j) => g.fillText(c, w / 2, 58 + (j + 0.5) * (300 / chars.length) + 8));
    }, { key: 'fix-andon-' + i });
    // paper lit from inside: the painted texture by day, warm and glowing (bloom) at night
    const mm = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uNight: { value: 0 } }]),
      vertexShader: '#include <common>\n#include <fog_pars_vertex>\nvarying vec2 vUvA;\nvoid main(){ vUvA = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: '#include <common>\n#include <fog_pars_fragment>\nuniform sampler2D uMap; uniform float uNight; varying vec2 vUvA;\nvoid main(){ vec3 t = texture2D(uMap, vUvA).rgb; vec3 col = mix(t * 0.9, t * vec3(1.9, 1.55, 1.1), clamp(uNight, 0.0, 1.0)); gl_FragColor = vec4(col, 1.0);\n#include <fog_fragment>\n}',
      fog: true, side: THREE.DoubleSide,
    });
    mm.uniforms.uMap.value = tex;
    mm.uniforms.uNight = nightUniform(ctx);
    mm.name = 'fix-andon-' + i;
    andonTex.set(i, mm);
    return mm;
  };
  let n = 0, strings = 0;
  for (const s of picks) {
    if (r() > 0.9) continue;
    const dine = DINE.test((s.type || '') + (s.name || ''));
    const g = new THREE.Group(); g.position.set(s.x, s.y ?? L.heightAt(s.x, s.z), s.z); g.rotation.y = s.rotY; root.add(g);
    const k = ctx.kit(g), w = s.w || 5;
    // a pair of red 提灯 hanging from the eave at the door posts
    for (const sx of [-1, 1]) {
      const x = sx * Math.min(w / 2 - 0.35, 1.6), y = 2.35, z = 0.42;
      lantern(k, x, y, z, 1);
      k.box(0.02, 0.28, 0.02, capM, [x, y + 0.42, z]);
      g.updateMatrixWorld(true);
      const p = new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld); out.lanterns.push({ x: p.x, y: p.y, z: p.z });
    }
    // an 行灯 standing sign on the pavement beside the door
    if (dine || r() < 0.35) {
      const i = Math.floor(r() * NAMES.length), ax = (r() < 0.5 ? -1 : 1) * Math.min(w / 2 + 0.1, 2.3);
      k.box(0.34, 0.08, 0.34, andonFrame, [ax, 0.04, 0.9]);
      for (const [dx, dz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) k.box(0.035, 1.18, 0.035, andonFrame, [ax + dx, 0.6, 0.9 + dz]);
      const am = andonMat(i);
      for (let f = 0; f < 4; f++) { const a = f * Math.PI / 2; const p = k.plane(0.27, 0.86, am, [ax + Math.sin(a) * 0.14, 0.66, 0.9 + Math.cos(a) * 0.14], [0, a, 0]); ctx.noOutline(p); }
      k.box(0.36, 0.05, 0.36, andonFrame, [ax, 1.2, 0.9]);
    }
    // a string of small lanterns under the eave across the frontage (every other izakaya)
    if (w > 3.2 && (dine || r() < 0.4)) {
      const m = Math.max(3, Math.floor(w / 0.9));
      const pts = [];
      for (let j = 0; j <= m; j++) { const t = j / m, x = -w / 2 + 0.2 + (w - 0.4) * t, y = 2.95 - Math.sin(Math.PI * t) * 0.25; pts.push(new THREE.Vector3(x, y, 0.35)); if (j > 0 && j < m) lantern(k, x, y - 0.2, 0.35, 0.45); }
      g.updateMatrixWorld(true);
      ctx.wires.add(pts.map((p) => p.clone().applyMatrix4(g.matrixWorld)), { width: 0.015, color: '#2f2a30' });
      strings++;
    }
    n++;
  }
  void k0;
  ctx.addStatic(root);
  return { lanes: n, strings };
}

let _l = null;
function LANT() {
  if (_l) return _l;
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.5 * Math.sin(Math.PI * (0.12 + 0.76 * t)), t - 0.5)); }
  _l = new THREE.LatheGeometry(pts, 12);
  return _l;
}
