// [ship:acts] ACT 1, 出船おくり: the send-off of 第一昭福丸 at the コの字岸壁 (魚浜町), 11:00 (source notes section 5:
// usually 11:00 on a 大安 or 先勝 day; families and townspeople hold five-colour paper tapes and wave 福来旗; the ship
// plays the captain's favourite music and sounds her horn; people wave until she is out of sight).
//
//   - a crowd on the quay (life's character kit: LOOKS from life/cast.js, Human + Driver), facing the ship;
//   - FIVE-COLOUR paper tapes from their hands to the ship's rail points: slack, then taut as she pulls away, then they
//     SNAP past the length of the roll, and the halves flutter down (a light verlet chain, paper drag, the wind);
//   - 福来旗 (大漁旗) waved on poles, cloth from harbor/boats.js FLAG_DESIGNS;
//   - the horn: three prolonged blasts (長音三声, the farewell), synthesized in WebAudio inside the COLREG Annex III
//     band for a vessel under 75 m (250-700 Hz, a prolonged blast 4-6 s);
//   - a music sting: an ORIGINAL pentatonic tune synthesized here (no recorded or copyrighted music). If a local
//     data/ship/sendoff-music.mp3 sits next to the data (gitignored, never committed), that plays instead.
//
//   const so = createSendoff(ctx, { ship })     so.start({ mode: 'sendoff' | 'homecoming' })   so.update(dt, t)
//   so.stats -> { people, tapes, snapped }      so.onSnap(cb)   so.horn()   so.music()   so.dispose()
// The pure parts (tapeState, hornSpec, MELODY, BUDGET) are tested in test/ship-acts.test.js.
import * as THREE from 'three';
import { Human } from '../life/characters/human.js';
import { Driver } from '../life/characters/anim.js';
import { LOOKS } from '../life/cast.js';
import { FLAG_DESIGNS, flagTex } from '../harbor/boats.js';
import { isDevHost } from './flags.js';

/** Per-tier budget (phone = the phone tier, core/tier.js). */
export const BUDGET = {
  high: { people: 14, tapes: 40, flags: 6, flagTex: 256 },
  medium: { people: 10, tapes: 28, flags: 4, flagTex: 256 },
  phone: { people: 6, tapes: 18, flags: 3, flagTex: 256 },
};
export const budgetFor = (q) => (q?.phone || q?.name === 'low' ? BUDGET.phone : q?.name === 'medium' ? BUDGET.medium : BUDGET.high);

/** 五色テープ: red, yellow, green, blue, pink. */
export const TAPE_COLOURS = ['#e8413a', '#f2c230', '#3fae5a', '#2f7fd1', '#f08ab0'];

/** A tape of roll length `len` between two points `dist` apart: slack (sagging), taut (the last 15 %), or snapped. */
export function tapeState(dist, len) {
  if (dist >= len) return { state: 'snapped', sag: 0 };
  const slackLen = Math.sqrt(Math.max(0, len * len - dist * dist));
  const sag = Math.min(4, 0.18 * slackLen);
  return { state: dist >= 0.85 * len ? 'taut' : 'slack', sag };
}

/** The ship's horn: COLREG Annex III 1(a)(iii), a vessel under 75 m sounds 250-700 Hz; Rule 32(c) a prolonged blast
 *  lasts 4-6 s. 第一昭福丸 is 58.60 m. Three prolonged blasts (長音三声) are the farewell. */
export function hornSpec() {
  return { f0: 296, third: 296 * Math.pow(2, 4 / 12), blast: 4.5, gap: 1.6, blasts: 3, attack: 0.22, release: 0.4, cutoff: 1800 };
}

/** The original send-off sting: [semitones above the tonic | null (rest), beats], a major pentatonic (yo-like) tune
 *  written for this app, 120 bpm, 8 bars. BASS: one root a bar. */
export const MELODY = [
  [7, 1], [9, 0.5], [12, 0.5], [9, 1], [7, 1],
  [4, 1], [7, 1], [9, 2],
  [12, 1], [14, 0.5], [12, 0.5], [9, 1], [7, 1],
  [9, 1], [4, 1], [7, 2],
  [4, 0.5], [7, 0.5], [9, 1], [12, 1], [9, 1],
  [7, 1], [9, 0.5], [7, 0.5], [4, 2],
  [2, 1], [4, 1], [7, 1], [9, 1],
  [12, 3], [null, 1],
];
export const BASS = [-12, -17, -15, -17, -12, -15, -10, -12];
export const TEMPO = 120;
export const MUSIC_OVERRIDE = 'data/ship/sendoff-music.mp3';

// ------------------------------------------------------------------------------------------------ audio
/** The WebAudio context (the app's, else our own, created on a user gesture) and a gain that follows the mute. */
function audioOut(ctx) {
  let ac = ctx.audio?.context || null;
  try { if (!ac && typeof AudioContext !== 'undefined') ac = ctx.__shipAC || (ctx.__shipAC = new AudioContext()); } catch (e) { ac = null; }
  if (!ac) return null;
  try { if (ac.state === 'suspended') ac.resume(); } catch (e) { /* */ }
  const g = ac.createGain(); g.gain.value = ctx.audio?.muted ? 0 : 0.55 * (ctx.audio?.master ?? 1);
  g.connect(ac.destination);
  return { ac, out: g };
}

/** Three prolonged blasts. Returns the length in seconds (0 when audio is unavailable). */
export function playHorn(ctx, { blasts } = {}) {
  const A = audioOut(ctx); const H = hornSpec(); const n = blasts ?? H.blasts;
  if (!A) return n * (H.blast + H.gap);
  const { ac, out } = A;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = H.cutoff; lp.Q.value = 0.9;
  const body = ac.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = H.f0 * 2; body.gain.value = 5; body.Q.value = 1.2;
  lp.connect(body); body.connect(out);
  let t = ac.currentTime + 0.05;
  for (let i = 0; i < n; i++) {
    const env = ac.createGain(); env.gain.value = 0; env.connect(lp);
    for (const [f, v] of [[H.f0, 0.34], [H.f0 * 1.003, 0.22], [H.third, 0.16], [H.f0 * 2, 0.06]]) {
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.96, t); o.frequency.exponentialRampToValueAtTime(f, t + H.attack * 1.4);
      const g = ac.createGain(); g.gain.value = v; o.connect(g); g.connect(env);
      o.start(t); o.stop(t + H.blast + H.release + 0.1);
    }
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1, t + H.attack);
    env.gain.setValueAtTime(1, t + H.blast); env.gain.linearRampToValueAtTime(0, t + H.blast + H.release);
    t += H.blast + H.gap;
  }
  return n * (H.blast + H.gap);
}

/** Look for the optional local music file? On a local host (flags.js isDevHost: localhost, 127.0.0.1, *.localhost) in a
 *  real browser,
 *  never in shot mode or under automation (a missing file would log a 404 in QA); ?music=local forces it, ?music=0
 *  turns it off. A public deploy never asks for the file. */
export function musicProbeAllowed({ host = '', search = '', webdriver = false } = {}) {
  const q = new URLSearchParams(search);
  if (q.get('music') === '0') return false;
  if (q.get('music') === 'local') return true;
  if (q.has('shot') || webdriver) return false;
  return isDevHost(host);
}

/** The original sting (or the optional local file when present). Returns the length in seconds. */
export async function playSting(ctx, { tonicHz = 523.25 } = {}) {
  const beat = 60 / TEMPO, dur = MELODY.reduce((s, [, b]) => s + b, 0) * beat;
  // an optional local music file next to the data (never bundled or committed)
  try {
    const probe = typeof location !== 'undefined' && musicProbeAllowed({ host: location.hostname, search: location.search, webdriver: typeof navigator !== 'undefined' && !!navigator.webdriver });
    if (probe && typeof fetch === 'function' && typeof Audio !== 'undefined' && !ctx.audio?.muted) {
      const r = await fetch(MUSIC_OVERRIDE, { method: 'HEAD' });
      if (r.ok && /audio|mpeg|octet/.test(r.headers.get('content-type') || 'audio')) {
        const el = new Audio(MUSIC_OVERRIDE); el.volume = 0.7; await el.play(); ctx.__shipMusic = el; return el.duration || 30;
      }
    }
  } catch (e) { /* no override: synthesize */ }
  const A = audioOut(ctx);
  if (!A) return dur;
  const { ac, out } = A;
  const hz = (semi) => tonicHz * Math.pow(2, semi / 12);
  let t = ac.currentTime + 0.08;
  const t0 = t;
  for (const [semi, b] of MELODY) {
    const d = b * beat;
    if (semi !== null) {
      const env = ac.createGain(); env.gain.value = 0; env.connect(out);
      const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(semi);
      const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz(semi + 12);
      const vib = ac.createOscillator(); vib.frequency.value = 5.5; const vg = ac.createGain(); vg.gain.value = hz(semi) * 0.006; vib.connect(vg); vg.connect(o.frequency);
      const g2 = ac.createGain(); g2.gain.value = 0.18; o2.connect(g2); g2.connect(env); o.connect(env);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.28, t + 0.02); env.gain.setTargetAtTime(0.17, t + 0.03, 0.12);
      env.gain.setTargetAtTime(0, t + d * 0.92, 0.04);
      for (const x of [o, o2, vib]) { x.start(t); x.stop(t + d + 0.3); }
    }
    t += d;
  }
  // bass (one root a bar) and a taiko-like ドン on beats 1 and 3
  BASS.forEach((semi, bar) => {
    const tb = t0 + bar * 4 * beat;
    const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = hz(semi);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const g = ac.createGain(); g.gain.value = 0;
    o.connect(lp); lp.connect(g); g.connect(out);
    g.gain.setValueAtTime(0, tb); g.gain.linearRampToValueAtTime(0.09, tb + 0.03); g.gain.setTargetAtTime(0, tb + 4 * beat * 0.9, 0.08);
    o.start(tb); o.stop(tb + 4 * beat + 0.4);
    for (const k of [0, 2]) {
      const td = tb + k * beat;
      const d = ac.createOscillator(); d.type = 'sine'; d.frequency.setValueAtTime(110, td); d.frequency.exponentialRampToValueAtTime(52, td + 0.25);
      const dg = ac.createGain(); dg.gain.setValueAtTime(0.0001, td); dg.gain.exponentialRampToValueAtTime(0.5, td + 0.01); dg.gain.exponentialRampToValueAtTime(0.0001, td + 0.45);
      d.connect(dg); dg.connect(out); d.start(td); d.stop(td + 0.5);
    }
  });
  return dur;
}

// ------------------------------------------------------------------------------------------------ helpers
const V = (a) => (a?.isVector3 ? a.clone() : Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : new THREE.Vector3(a?.x || 0, a?.y || 0, a?.z || 0));
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Rail points on one side of the ship (local), from the ship's anchors or along the sheer. side: +1 port, -1 starboard. */
export function railPointsOn(anchors, side, n = 12) {
  const all = (anchors?.railPoints || []).map(V);
  const pts = all.filter((p) => Math.sign(p.x) === side);
  if (pts.length >= 3) return pts;
  const out = [];
  for (let i = 0; i < n; i++) { const z = -22 + (44 * i) / (n - 1); out.push(new THREE.Vector3(side * 4.45, 5.0 + Math.max(0, z - 12) * 0.08, z)); }
  return out;
}

// ------------------------------------------------------------------------------------------------ the scene
export function createSendoff(ctx, { ship }) {
  const L = ctx.L;
  const B = budgetFor(ctx.quality);
  const root = new THREE.Group(); root.name = 'ship-sendoff';
  const state = { mode: null, people: [], tapes: [], flags: [], t0: 0, built: false, side: -1 };
  const snapCbs = new Set();
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _s = new THREE.Vector3();

  /** Which side of the moored ship is the quay (+1 port, -1 starboard), by sampling the sea either side. */
  function quaySide() {
    const g = ship.group; g.updateWorldMatrix(true, true);
    let best = -1, bestLand = -1;
    for (const side of [1, -1]) {
      let land = 0;
      for (const z of [-15, 0, 15]) { _v.set(side * 11, 0, z).applyMatrix4(g.matrixWorld); if (!L.isWater(_v.x, _v.z)) land++; }
      if (land > bestLand) { bestLand = land; best = side; }
    }
    return best;
  }
  function groundY(x, z) {
    const h = L.heightAt(x, z);
    const p = ctx.physics?.groundHeight ? ctx.physics.groundHeight(x, z, h + 20) : h;
    return Math.max(h, Number.isFinite(p) ? p : h);
  }
  /** A spot on land `back` m behind the quay edge, abeam local z of the ship on its quay side. */
  function quaySpot(z, back) {
    const g = ship.group, side = state.side;
    let off = 5;
    for (; off < 40; off += 0.5) { _v.set(side * off, 0, z).applyMatrix4(g.matrixWorld); if (!L.isWater(_v.x, _v.z) && L.shoreDist(_v.x, _v.z) < -0.3) break; }
    _v.set(side * (off + back), 0, z).applyMatrix4(g.matrixWorld);
    return { x: _v.x, z: _v.z, y: groundY(_v.x, _v.z) };
  }

  function buildCrowd(mode) {
    const r = prng(mode === 'homecoming' ? 917 : 411);
    const kinds = ['townWoman', 'fisherman', 'elder', 'kid', 'townMan', 'townWoman', 'kid', 'fisherman', 'elder', 'townMan', 'visitor', 'townWoman', 'kid', 'townMan'];
    const n = B.people;
    const rails = railPointsOn(ship.anchors, state.side);
    for (let i = 0; i < n; i++) {
      const kind = kinds[i % kinds.length];
      const pick = (arr) => arr[Math.floor(r() * arr.length)];
      const rr = Object.assign(() => r(), { range: (a, b) => a + (b - a) * r(), pick, chance: (p) => r() < p, int: (a, b) => Math.floor(a + (b - a + 1) * r()) });
      const spec = LOOKS[kind](rr, 40 + i);
      spec.key = `so${mode[0]}${i}_` + spec.key;
      spec.seed = 900 + i;
      const h = new Human(ctx, spec);
      const d = new Driver(ctx, h, { seed: spec.seed });
      root.add(h.group);
      const z = -20 + (40 * (i + 0.5)) / n + (r() - 0.5) * 1.2;
      const spot = quaySpot(z, 1.2 + (i % 3) * 1.1 + r() * 0.4);
      const flag = (mode === 'homecoming' ? i % 2 === 0 : i % 3 === 1) && state.flags.length < B.flags * (mode === 'homecoming' ? 2 : 1);
      const P = { h, d, kind, spot, z, flag: null, wave: r() * 6, tapes: [] };
      if (flag) P.flag = makeFlag(state.flags.length);
      state.people.push(P);
    }
    // tapes: two or three per tape holder (people without a flag), to the nearest rail points
    if (mode === 'sendoff') {
      const holders = state.people.filter((p) => !p.flag);
      for (let k = 0; k < B.tapes && holders.length; k++) {
        const P = holders[k % holders.length];
        let ri = 0, bd = 1e9;
        rails.forEach((q, j) => { const dd = Math.abs(q.z - P.z) + (j * 7.31 + k * 3.7) % 4; if (dd < bd) { bd = dd; ri = j; } });
        const T = { P, rail: rails[ri].clone().add(new THREE.Vector3(0, (k % 3) * 0.12, (k % 5 - 2) * 0.25)), len: 0, colour: TAPE_COLOURS[k % 5], state: 'slack', snapped: false, nodes: null, prev: null, seg: 0, phase: r() * 6 };
        P.tapes.push(T); state.tapes.push(T);
      }
    }
    buildTapeMesh();
  }

  // ---- 福来旗 on poles, cloth waves on the CPU (a small grid)
  function makeFlag(i) {
    const d = FLAG_DESIGNS[i % FLAG_DESIGNS.length];
    const tex = flagTex(ctx, d);
    const geo = new THREE.PlaneGeometry(1.6, 1.0, 10, 4);
    geo.translate(0.8, -0.5, 0);
    // two faces, the back one with mirrored u: the 大漁 lettering reads right from both sides (never mirrored)
    const cloth = new THREE.Group();
    const front = new THREE.Mesh(geo, ctx.mat.toon('#ffffff', { map: tex, paint: 0.02, noSnow: true }));
    const back = new THREE.Mesh(geo.clone(), ctx.mat.toon('#ffffff', { map: tex, side: 'back', paint: 0.02, noSnow: true }));
    const uv = back.geometry.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, 1 - uv.getX(k));
    back.geometry.attributes.position = geo.attributes.position;   // share the waving positions
    front.castShadow = true; cloth.add(front, back);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.6, 6).translate(0, 1.3, 0), ctx.mat.toon('#c9b48f', { noSnow: true }));
    const g = new THREE.Group(); g.add(pole); cloth.position.set(0, 2.55, 0); g.add(cloth);
    root.add(g);
    const base = Float32Array.from(geo.attributes.position.array);
    const F = { g, cloth, geo, back, base, phase: i * 1.7 };
    state.flags.push(F);
    return F;
  }
  function waveFlag(F, t, swing) {
    const pos = F.geo.attributes.position, b = F.base;
    for (let i = 0; i < pos.count; i++) {
      const x = b[i * 3], y = b[i * 3 + 1];
      const k = x / 1.6;
      pos.array[i * 3 + 2] = Math.sin(x * 3.2 - t * 7 + F.phase + y * 0.8) * 0.16 * k + swing * 0.1 * k * k;
      pos.array[i * 3 + 1] = y - k * k * 0.06 * (1 - Math.abs(swing));
    }
    pos.needsUpdate = true;
    F.geo.computeVertexNormals();
    F.back.geometry.attributes.normal = F.geo.attributes.normal;
  }

  // ---- the tapes: one mesh, every segment its own billboarded quad (a snapped tape hides its break)
  const NODES = 20;
  let tapeMesh = null;
  function buildTapeMesh() {
    const n = state.tapes.length; if (!n) return;
    const segs = NODES - 1, verts = n * segs * 4;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(verts * 3), col = new Float32Array(verts * 3), nor = new Float32Array(verts * 3);
    const idx = [];
    const c = new THREE.Color();
    state.tapes.forEach((T, ti) => {
      c.set(T.colour).convertSRGBToLinear();
      for (let s = 0; s < segs; s++) {
        const v0 = (ti * segs + s) * 4;
        for (let k = 0; k < 4; k++) { col.set([c.r, c.g, c.b], (v0 + k) * 3); nor.set([0, 1, 0], (v0 + k) * 3); }
        idx.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2);
      }
    });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(idx);
    const mat = ctx.mat.toon('#ffffff', { vertexColors: true, side: 'double', noSnow: true, emissive: '#ffffff', emissiveIntensity: 0.18 });
    tapeMesh = new THREE.Mesh(geo, mat); tapeMesh.frustumCulled = false; tapeMesh.name = 'sendoff-tapes';
    root.add(tapeMesh);
    ctx.noOutline(tapeMesh);
  }

  /** Points of an intact tape from a (hand) to b (rail), sagging. */
  function intactNodes(T, a, b, sag, t) {
    if (!T.nodes) T.nodes = Array.from({ length: NODES }, () => new THREE.Vector3());
    const W = ctx.shared.uWind.value;
    for (let i = 0; i < NODES; i++) {
      const u = i / (NODES - 1), s = 4 * u * (1 - u);
      T.nodes[i].lerpVectors(a, b, u);
      T.nodes[i].y -= sag * s;
      const fl = Math.sin(t * 5 + T.phase + u * 9) * 0.08 * s * (0.4 + sag);
      T.nodes[i].x += (W.x * 0.12 * sag + fl) * s; T.nodes[i].z += W.y * 0.12 * sag * s;
    }
  }
  function snap(T, a, b) {
    T.snapped = true; T.state = 'snapped';
    // split at the middle: nodes 0..9 hang from the hand, 10..19 from the ship's rail (10 = the free end)
    const mid = (NODES >> 1);
    const pts = T.nodes.map((p) => p.clone());
    T.prev = pts.map((p) => p.clone());
    T.nodes = pts;
    T.seg = a.distanceTo(b) / (NODES - 1);
    T.breakAt = mid - 1;
    for (const f of snapCbs) try { f(T); } catch (e) { /* */ }
  }
  function stepSnapped(T, a, b, dt, t) {
    const W = ctx.shared.uWind.value, g = -2.2, damp = 0.94;
    const N = T.nodes, Pv = T.prev, k = T.breakAt;
    for (let i = 0; i < NODES; i++) {
      if (i === 0 || i === NODES - 1) continue;
      const p = N[i], q = Pv[i];
      const vx = (p.x - q.x) * damp, vy = (p.y - q.y) * damp, vz = (p.z - q.z) * damp;
      q.copy(p);
      const fl = Math.sin(t * 6.3 + i * 1.9 + T.phase) * 0.9;
      p.x += vx + (W.x * 0.6 + fl * 0.4) * dt * dt;
      p.y += vy + g * dt * dt;
      p.z += vz + (W.y * 0.6 + Math.cos(t * 5.1 + i) * 0.35) * dt * dt;
      const fy = Math.max(L.groundAt(p.x, p.z), 0) + 0.02;
      if (p.y < fy) { p.y = fy; q.y = fy; }
    }
    N[0].copy(a); N[NODES - 1].copy(b);
    // a half far from its anchor (the ship jumped: a skip or a teleport) is re-hung straight down from it
    const half = (from, to, step, anchor) => {
      if (N[to].distanceTo(anchor) <= T.seg * (Math.abs(to - from) + 1) + 0.5) return;
      for (let i = from, n = 0; i !== to + step; i += step, n++) { N[i].set(anchor.x + 0.05 * n, anchor.y - T.seg * n * 0.95, anchor.z); Pv[i].copy(N[i]); }
    };
    half(0, k, 1, a); half(NODES - 1, k + 1, -1, b);
    // keep each half's segment length (the paper does not stretch)
    for (let it = 0; it < 3; it++) for (let i = 0; i < NODES - 1; i++) {
      if (i === k) continue;
      const p = N[i], q = N[i + 1];
      _s.subVectors(q, p); const l = _s.length() || 1e-6; const e = (l - T.seg) / l * 0.5;
      const fixP = i === 0, fixQ = i + 1 === NODES - 1;
      if (!fixP) p.addScaledVector(_s, fixQ ? e * 2 : e);
      if (!fixQ) q.addScaledVector(_s, fixP ? -e * 2 : -e);
    }
  }
  function writeTapes() {
    if (!tapeMesh) return;
    const pos = tapeMesh.geometry.attributes.position.array;
    const cam = ctx.camera.position;
    const half = 0.035;
    state.tapes.forEach((T, ti) => {
      const N = T.nodes; if (!N) return;
      for (let s = 0; s < NODES - 1; s++) {
        const o = (ti * (NODES - 1) + s) * 12;
        const p = N[s], q = N[s + 1];
        if (T.snapped && s === T.breakAt) { for (let k = 0; k < 4; k++) pos.set([p.x, p.y, p.z], o + k * 3); continue; }
        _c.addVectors(p, q).multiplyScalar(0.5); _w.subVectors(cam, _c);
        _s.subVectors(q, p).cross(_w).normalize().multiplyScalar(half);
        pos.set([p.x - _s.x, p.y - _s.y, p.z - _s.z, p.x + _s.x, p.y + _s.y, p.z + _s.z, q.x - _s.x, q.y - _s.y, q.z - _s.z, q.x + _s.x, q.y + _s.y, q.z + _s.z], o);
      }
    });
    tapeMesh.geometry.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------------------------------------------ api
  const _hand = new THREE.Vector3(), _rail = new THREE.Vector3();
  function start({ mode = 'sendoff' } = {}) {
    dispose(false);
    state.mode = mode; state.t0 = null;
    state.side = quaySide();
    if (!root.parent) ctx.add(root);
    root.visible = true;
    buildCrowd(mode);
    // the roll length of each tape: the first snap once she is ~10 m off, the last at ~45 m
    const g = ship.group; g.updateWorldMatrix(true, true);
    state.tapes.forEach((T, i) => {
      const P = T.P; _rail.copy(T.rail).applyMatrix4(g.matrixWorld);
      const d0 = Math.hypot(_rail.x - P.spot.x, _rail.z - P.spot.z) + 1;
      T.len = d0 + 4 + ((i * 0.618) % 1) * 34;
    });
    state.built = true;
    pose(0, 0);
  }
  function pose(dt, t) {
    const g = ship.group; g.updateWorldMatrix(true, true);
    const W = ctx.shared.uWind.value;
    // the ship centre, for the crowd to face
    _c.set(0, 3, 0).applyMatrix4(g.matrixWorld);
    for (const P of state.people) {
      const { h, d, spot } = P;
      const yaw = Math.atan2(_c.x - spot.x, _c.z - spot.z);
      d.place(spot.x, spot.y, spot.z, yaw); d.reset();
      d.stand({ stance: 1.1 });
      const wv = Math.sin(t * 5.5 + P.wave);
      if (P.flag) {
        d.arm('R', 2.3, 0.15, 0, 0.5); d.arm('L', 1.9, -0.05, 0, 0.9);
      } else if (P.tapes.length && P.tapes.some((T) => !T.snapped)) {
        d.arm('R', 1.35 + 0.05 * wv, 0.1, 0, 0.25); d.arm('L', 0.3, 0.12, 0, 0.5);
      } else {
        d.arm('R', 2.6, 0.45, 0, 0.5 + 0.35 * wv); d.arm('L', 0.15, 0.1, 0, 0.3);   // waving her off
      }
      d.lookAt(_c, dt);
      d.blink(t);
      d.wind?.(t, dt);
      h.group.updateMatrixWorld(true);
      if (P.flag) {
        h.b.handR.getWorldPosition(_hand);
        const F = P.flag, swing = Math.sin(t * 1.9 + F.phase);
        F.g.position.copy(_hand).add(_v.set(0, -0.9, 0));
        F.g.rotation.set(0, yaw + Math.PI / 2 + Math.atan2(W.y, W.x) * 0.0, swing * 0.45, 'YXZ');
        waveFlag(F, t, swing);
      }
    }
    for (const T of state.tapes) {
      T.P.h.b.handR.getWorldPosition(_hand);
      _rail.copy(T.rail).applyMatrix4(g.matrixWorld);
      if (!T.snapped) {
        const dist = _hand.distanceTo(_rail);
        const st = tapeState(dist, T.len);
        if (st.state === 'snapped') { if (!T.nodes) intactNodes(T, _hand, _rail, 0, t); snap(T, _hand, _rail); }
        else { T.state = st.state; intactNodes(T, _hand, _rail, st.sag, t); }
      } else if (dt > 0) stepSnapped(T, _hand, _rail, Math.min(dt, 1 / 30), t);
      else { T.nodes[0].copy(_hand); T.nodes[NODES - 1].copy(_rail); }
    }
    writeTapes();
  }
  function update(dt, t) {
    if (!state.built || !root.visible) return;
    pose(dt, t);
  }
  function dispose(full = true) {
    for (const P of state.people) { P.h.group.parent?.remove(P.h.group); P.h.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); }); }
    for (const F of state.flags) { F.g.parent?.remove(F.g); F.geo.dispose(); F.back.geometry.dispose(); }
    if (tapeMesh) { tapeMesh.parent?.remove(tapeMesh); tapeMesh.geometry.dispose(); tapeMesh = null; }
    state.people = []; state.tapes = []; state.flags = []; state.built = false;
    if (full) { root.parent?.remove(root); state.mode = null; }
  }
  return {
    root, start, update, dispose,
    get active() { return state.built; },
    get mode() { return state.mode; },
    get side() { return state.side; },
    get stats() { return { people: state.people.length, tapes: state.tapes.length, snapped: state.tapes.filter((x) => x.snapped).length, flags: state.flags.length, taut: state.tapes.filter((x) => x.state === 'taut').length }; },
    onSnap(f) { snapCbs.add(f); return () => snapCbs.delete(f); },
    hide() { root.visible = false; },
    horn: () => playHorn(ctx),
    music: () => playSting(ctx),
  };
}
