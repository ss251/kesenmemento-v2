// [play:underwater] Pure swim, breach, species, farm ropes and fish-school step.
// No three.js and no allocations on the hot path: callers pass the state and the arrays.

import { TUNE } from './tune.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createState(x, y, z, yaw = 0, species = 'ainame') {
  return {
    x, y, z, yaw, pitch: 0,
    vx: 0, vy: 0, vz: 0,
    px: x, py: y, pz: z,
    stamina: TUNE.staminaMax,
    mode: 'swim',
    breachT: 0,
    tail: 0,
    species,
    splash: 0,
    dashing: false,
    breachN: 0,
    slowLeft: 0,
    slowUsed: 0,
    spin: 0,
    spinV: 0,
    trick: 0,
    trickShown: 0,
  };
}

/** カツオ seaward of the bay-mouth gate; アイナメ everywhere inside the bay. */
export function speciesAt(x, z, mouth = TUNE.mouth) {
  const dx = x - mouth.x, dz = z - mouth.z;
  if (dx * dx + dz * dz > mouth.r * mouth.r && z > mouth.z - mouth.r * 0.15) return 'katsuo';
  return 'ainame';
}

/** Walk: standing on the land side of the waterline. Sail: the boat is barely moving. */
export function canDive(kind, shore, boatSpeed) {
  if (kind === 'sail') return Math.abs(boatSpeed) < 0.35;
  if (kind === 'walk') return shore < -0.25 && shore > -7.5;
  return false;
}

/** Eight taps. The direction where the shore distance grows fastest is seaward. */
export function seaward(x, z, shoreDist) {
  let bx = 0, bz = 1, best = -1e9;
  const here = shoreDist(x, z);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    const g = shoreDist(x + dx * 4, z + dz * 4) - here;
    if (g > best) { best = g; bx = dx; bz = dz; }
  }
  return { x: bx, z: bz, gain: best };
}

/** Where the body goes when you leave the quay or the boat. y is kept above the bed. */
export function entryPose(x, z, yaw, env, T = TUNE) {
  const sea = env.seaward ? env.seaward : seaward(x, z, env.shore);
  const px = x + sea.x * 3.4, pz = z + sea.z * 3.4;
  const bed = env.bed(px, pz);
  const y = Math.min(-0.85, Math.max(bed + T.clearance + 0.35, -1.7));
  return { x: px, y, z: pz, yaw, species: speciesAt(px, pz, T.mouth) };
}

/**
 * The quay steps nearest a spawn, one stroke under: the closest waterline to (x, z) on a ring search (1 m steps out
 * to 120 m), then entryPose from there, facing out to sea. Null if no waterline is in reach.
 */
export function quayStart(x, z, env, T = TUNE) {
  for (let r = 2; r < 120; r += 1) {
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      const qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r;
      const s = env.shore(qx, qz);
      if (s > -0.6 && s < 0.4) {
        const sea = seaward(qx, qz, env.shore);
        const yaw = Math.atan2(-sea.x, -sea.z);
        // 7.5 m out, so the follow camera (3.5 m behind) is in the water, with the quay at its back
        const px = qx + sea.x * 7.5, pz = qz + sea.z * 7.5;
        const y = Math.min(-0.9, Math.max(env.bed(px, pz) + T.clearance + 0.35, -1.7));
        return { x: px, y, z: pz, yaw, pitch: -0.08, species: speciesAt(px, pz, T.mouth) };
      }
    }
  }
  return null;
}

const W = { wx: 0, wy: 0, wz: 0, wl: 0 };
function wish(s, input, T) {
  const f = clamp(input.thrust || 0, -1, 1);
  const st = clamp(input.strafe || 0, -1, 1);
  const lift = clamp(input.lift || 0, -1, 1);
  const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
  const fx = -Math.sin(s.yaw) * cp, fy = sp, fz = -Math.cos(s.yaw) * cp;
  const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
  W.wx = fx * f + rx * st * T.strafe;
  W.wy = fy * f + lift * T.lift;
  W.wz = fz * f + rz * st * T.strafe;
  W.wl = Math.hypot(W.wx, W.wy, W.wz);
  return W;
}

function cruiseStep(s, input, dt, env, T) {
  const w = wish(s, input, T);
  // a fresh dash needs a third of the tank, so an empty ring has to refill before the next leap
  const gate = s.dashing ? 0 : T.staminaMax * T.staminaRestart;
  s.dashing = !!(input.dash && w.wl > 0.08 && s.stamina > gate);
  const top = s.dashing ? T.dash : T.cruise;
  const gain = w.wl > 1e-5 ? (top * Math.min(1, w.wl)) / w.wl : 0;
  const tx = w.wx * gain, ty = w.wy * gain, tz = w.wz * gain;
  const rate = w.wl > 0.06 ? T.accel : T.drag;
  const a = 1 - Math.exp(-rate * dt);
  s.vx += (tx - s.vx) * a;
  s.vy += (ty - s.vy) * a;
  s.vz += (tz - s.vz) * a;
  if (s.dashing) s.stamina = Math.max(0, s.stamina - T.staminaCost * dt);
  else s.stamina = Math.min(T.staminaMax, s.stamina + T.staminaRegen * dt);
  if (s.stamina <= 0) s.dashing = false;

  s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
  const bed = env.bed(s.x, s.z);
  if (s.y < bed + T.clearance) { s.y = bed + T.clearance; if (s.vy < 0) s.vy = 0; }
  if (env.shore(s.x, s.z) < T.shoreKeep) {
    s.x = s.px; s.z = s.pz; s.vx = 0; s.vz = 0;
  }
  const sp = Math.hypot(s.vx, s.vy, s.vz);
  if (s.y > T.surfaceHold) {
    if (s.vy > T.breachVy && sp > T.breachSpeed) {
      s.mode = 'breach';
      s.breachT = 0;
      s.breachN += 1;
      s.trick = 0;
      s.trickShown = 0;
      s.spin = 0;
      s.spinV = 0;
      s.slowLeft = 0;
      s.vy = Math.max(s.vy, T.breachKick);
      s.splash = 1;
      s.y = Math.max(s.y, 0.05);
    } else {
      s.y = T.surfaceHold;
      if (s.vy > 0) s.vy *= 0.15;
    }
  }
  s.tail += dt * (6.2 + sp * 1.35);
}

function breachStep(s, dt, env, T) {
  let sim = dt;
  if (s.slowLeft > 0) {
    sim = dt * T.apexScale;
    s.slowLeft = Math.max(0, s.slowLeft - dt);
  }
  const prevVy = s.vy;
  s.breachT += sim;
  s.dashing = false;
  s.vy -= T.breachG * sim;
  const drag = Math.exp(-0.12 * sim);
  s.vx *= drag;
  s.vz *= drag;
  s.x += s.vx * sim; s.y += s.vy * sim; s.z += s.vz * sim;
  s.spin += s.spinV * sim;
  s.spinV *= Math.exp(-T.spinDrag * sim);
  if (s.breachN === 1 && !s.slowUsed && prevVy > 0 && s.vy <= 0 && s.y > 0.8) {
    s.slowUsed = 1;
    s.slowLeft = T.apexHold;
  }
  if (env.shore(s.x, s.z) < 0.2) { s.x = s.px; s.z = s.pz; s.vx = 0; s.vz = 0; }
  s.tail += sim * 16;
  if (s.y < T.reenterY && s.vy < 0) {
    s.mode = 'swim';
    s.y = T.reenterY;
    s.vy *= 0.28;
    s.splash = 2;
    const bed = env.bed(s.x, s.z);
    if (s.y < bed + T.clearance) s.y = bed + T.clearance;
  }
}

/** One simulation step. Mutates s. splash is 1 on the leap, 2 on the re-entry, else 0. */
export function swimStep(s, input, dt, env, T = TUNE) {
  if (!(dt > 0)) return s;
  s.px = s.x; s.py = s.y; s.pz = s.z;
  s.splash = 0;
  if (s.mode === 'breach') breachStep(s, dt, env, T);
  else cruiseStep(s, input, dt, env, T);
  s.species = speciesAt(s.x, s.z, T.mouth);
  return s;
}

/** Camera offset for this moment. reduced motion keeps the steady follow; the fish still leaps. */
export function cameraBeat(mode, breachT, reduced, T = TUNE, out = null) {
  const o = out || { back: 0, up: 0, fov: 0, roll: 0 };
  o.back = T.camBack; o.up = T.camUp; o.fov = 0; o.roll = 0;
  if (reduced || mode !== 'breach') return o;
  const hang = Math.max(0.4, (2 * T.breachKick) / T.breachG);
  const k = Math.sin(clamp(breachT / hang, 0, 1) * Math.PI);
  o.back = T.camBack + T.beatBack * k;
  o.up = T.camUp + T.beatUp * k;
  o.fov = T.beatFov * k;
  o.roll = T.beatRoll * k;
  return o;
}

/**
 * The water look. fog.js builds its GLSL from these numbers, so the tests below check what the GPU draws.
 * ext: extinction per channel (1/m) and the curve's shape: about 22 m of visibility, red lost first.
 * stops: the depth ramp, metres: 浅葱 (surface) → 青緑-浅葱 by 7 m → 藍 by 16 m → 鉄紺 by 32 m.
 */
export const WATER = {
  ext: [0.091, 0.074, 0.077],
  shape: 1.55,
  stops: { mid: [0, 7], deep: [5, 16], far: [14, 32] },
  ior: 1.333,
};

function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Caustic cells per metre (one cell is about 57 cm in the shallows). */
export const CAUSTIC_SCALE = 1.75;

/**
 * The caustic net's origin near the eye: o is a whole number of cells, a multiple of 256 (exact in float32), and q the
 * eye's offset from it in cells (small, so exact). The shader adds q to the eye-relative position. Writes o and q.
 */
export function causticOrigin(x, z, o, q) {
  const cx = x * CAUSTIC_SCALE, cz = z * CAUSTIC_SCALE;
  o.x = Math.floor(cx / 256) * 256; o.y = Math.floor(cz / 256) * 256;
  q.x = cx - o.x; q.y = cz - o.y;
  return o;
}

/** Fraction of a surface's colour lost to the water over dist metres, per channel [r, g, b]. Mirrors sw_fogK. */
export function fogK(dist, out = [0, 0, 0]) {
  for (let c = 0; c < 3; c++) out[c] = 1 - Math.exp(-Math.pow(Math.max(0, dist) * WATER.ext[c], WATER.shape));
  return out;
}

/** Weights of the four depth colours [near, mid, deep, far] at a depth in metres. Mirrors sw_water. */
export function waterMix(depth, out = [0, 0, 0, 0]) {
  const S = WATER.stops;
  const a = smooth(S.mid[0], S.mid[1], depth);
  const b = smooth(S.deep[0], S.deep[1], depth);
  const c = smooth(S.far[0], S.far[1], depth);
  // c = mix(mix(mix(near, mid, a), deep, b), far, c)
  out[0] = (1 - a) * (1 - b) * (1 - c);
  out[1] = a * (1 - b) * (1 - c);
  out[2] = b * (1 - c);
  out[3] = c;
  return out;
}

/** Radius of Snell's window on the surface, seen from depth metres down (the critical angle is about 48.6°). */
export function snellRadius(depth) {
  return Math.max(0, depth) * Math.tan(Math.asin(1 / WATER.ior));
}

/**
 * The sun as seen under the water: the horizontal part shrinks by 1/ior (Snell), so even a low sun comes down steeply.
 * sun: unit vector toward the sun in the air. Writes into out and returns it. No allocation.
 */
export function refractSun(sun, out) {
  let hx = sun.x / WATER.ior, hz = sun.z / WATER.ior;
  const h2 = hx * hx + hz * hz;
  if (h2 > 0.98) { const k = Math.sqrt(0.98 / h2); hx *= k; hz *= k; }
  out.x = hx; out.z = hz; out.y = Math.sqrt(Math.max(0.0001, 1 - hx * hx - hz * hz));
  return out;
}

/** Light and caustic levels for the time of day: { light, caustic } in 0..1. night 0..1, sunY the sun's height. */
export function swimLight(sunY, night, out = { light: 1, caustic: 1 }) {
  const n = night > 0 ? Math.min(1, night) : 0;
  out.light = 1 - n * 0.86;
  out.caustic = (1 - n) * clamp((Math.max(0.05, sunY) - 0.02) / 0.25, 0, 1);
  return out;
}

/**
 * A tap in the air. The first one of a leap arms a barrel roll, unless reduced motion is on
 * (the toast still fires; the body does not spin).
 */
export function airTap(s, T = TUNE, reduced = false) {
  if (!s || s.mode !== 'breach' || s.y < T.trickMinY || s.trick) return false;
  s.trick = 1;
  if (!reduced) s.spinV = T.spinRate;
  return true;
}

function ropeEnd(bed, T) {
  return Math.max(bed + 0.85, -T.ropeDepth);
}

/**
 * Hanging ropes under rafts and along longlines, and kelp standing on the bed.
 * Each drop is {x, z, y0, y1, kind}: y0 is the shallow end, y1 the deep end, and y1 stays above the bed.
 * A rope needs 1.4 m of water. Kelp is shorter and grows in the shallows.
 */
export function planDrops(rafts, lines, kelp, bedAt, fieldKind, T = TUNE) {
  const out = [];
  const push = (x, z, kind, phase) => {
    const bed = bedAt(x, z);
    if (kind === 'kelp') {
      const y1 = bed + 0.12;
      const y0 = Math.min(-0.45, y1 + 1.7);
      if (y0 - y1 < 0.55) return;
      out.push({ x, z, y0, y1, kind, phase });
      return;
    }
    const y1 = ropeEnd(bed, T);
    const y0 = -0.35;
    if (y1 >= y0 - 1.4) return;
    out.push({ x, z, y0, y1, kind, phase });
  };
  for (let i = 0; i < rafts.length; i++) {
    const r = rafts[i];
    const kind = fieldKind[r.field] || 'oyster';
    const n = 5;
    for (let k = 0; k < n; k++) {
      const ox = ((k % 3) - 1) * 2.1;
      const oz = (Math.floor(k / 2) - 1) * 3.2;
      push(r.x + ox, r.z + oz, kind, i * 0.17 + k);
    }
  }
  for (const line of lines) {
    const n = line.ropes;
    const hx = Math.sin(line.yaw), hz = Math.cos(line.yaw);
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : (k / (n - 1) - 0.5) * line.length;
      push(line.x + hx * t, line.z + hz * t, line.kind, k * 0.31);
    }
  }
  for (const patch of kelp) {
    for (let k = 0; k < patch.n; k++) {
      const a = k * 2.399;
      const rad = patch.r * (0.25 + (k % 5) / 6);
      push(patch.x + Math.cos(a) * rad, patch.z + Math.sin(a) * rad, 'kelp', k);
    }
  }
  return out;
}

function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Individuals on the ropes, in rope order (rope = the drop's index), so a near set can take whole ropes.
 * マボヤ grow in clumps of three to five all down a hanging rope, 11–18 cm tall, each rooted on the rope and leaning out.
 * An oyster rope carries a rough clump every 30 cm. A scallop rope carries one tiered lantern net.
 * Wakame stays a ribbon on the culture mesh. Built once.
 */
export const FARM = {
  hoyaStep: 0.42, hoyaStepPhone: 0.5,
  hoyaMin: 0.11, hoyaMax: 0.18,
  oysterStep: 0.3,
  lanternTiers: 9, lanternTier: 0.13,
};

export function planOrganisms(drops, opts = {}) {
  const phone = !!opts.phone;
  const hoya = [], scallop = [], oyster = [], clumps = [];
  for (let di = 0; di < drops.length; di++) {
    const d = drops[di];
    const top = d.y0 - 0.55, bottom = d.y1 + 0.25;
    // sway weight: the rope's own parameter (0 at its top end, 1 at the bottom), and the rope's phase, so nothing slides
    const along = (y) => clamp((d.y0 - y) / Math.max(0.1, d.y0 - d.y1), 0, 1);
    if (d.kind === 'hoya') {
      const step = phone ? FARM.hoyaStepPhone : FARM.hoyaStep;
      let k = 0;
      for (let y = top; y > bottom; y -= step, k++) {
        const n = 3 + Math.floor(hash01(di * 31.7 + k * 7.3) * 3);
        const spin = hash01(di * 1.37 + k * 0.71) * Math.PI * 2;
        const hang = along(y);
        clumps.push({ x: d.x, y, z: d.z, n, yaw: spin, hang, phase: d.phase, rope: di });
        for (let i = 0; i < n; i++) {
          const u = hash01(di * 17.1 + k * 3.7 + i * 1.31);
          const v = hash01(di * 3.3 + k * 11.9 + i * 5.1);
          // spread round the rope and staggered in height, leaning well out, so no two bodies share a surface
          const ang = spin + (i / n) * Math.PI * 2 + (u - 0.5) * 0.5;
          const r = FARM.hoyaMin + u * (FARM.hoyaMax - FARM.hoyaMin);
          const out = 0.026;
          const hy = y + ((i % 2) - 0.5) * 0.09 + (v - 0.5) * 0.06;
          hoya.push({
            x: d.x + Math.cos(ang) * out, y: hy, z: d.z + Math.sin(ang) * out,
            r, yaw: ang, lean: 0.75 + v * 0.7, roll: u * Math.PI * 2,
            phase: d.phase, hang: along(hy), rope: di,
          });
        }
      }
    } else if (d.kind === 'scallop') {
      const h = FARM.lanternTiers * FARM.lanternTier;
      scallop.push({
        x: d.x, z: d.z, y: d.y0 - 0.9, yaw: d.phase, phase: d.phase, hang: along(d.y0 - 0.9 - h * 0.5), lantern: 1, tiers: FARM.lanternTiers, rope: di,
      });
    } else if (d.kind === 'oyster') {
      let k = 0;
      for (let y = top; y > bottom; y -= FARM.oysterStep, k++) {
        const u = hash01(di * 5.9 + k * 2.3);
        oyster.push({
          x: d.x, y, z: d.z, yaw: u * Math.PI * 2, r: 0.85 + hash01(di + k * 7.7) * 0.4,
          phase: d.phase, hang: along(y), cluster: 7, rope: di,
        });
      }
    }
  }
  return { hoya, scallop, oyster, clumps };
}

/**
 * Which ropes are near the eye: fills near and far (Int32Array of rope indices, -1 terminated) by distance in the
 * horizontal plane. ropes: Float32Array of x, z pairs. No allocation.
 */
export function nearRopes(ropes, n, x, z, nearR, farR, near, far) {
  let a = 0, b = 0;
  const n2 = nearR * nearR, f2 = farR * farR;
  for (let i = 0; i < n; i++) {
    const dx = ropes[i * 2] - x, dz = ropes[i * 2 + 1] - z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= n2) { if (a < near.length - 1) near[a++] = i; } else if (d2 <= f2) { if (b < far.length - 1) far[b++] = i; }
  }
  near[a] = -1; far[b] = -1;
  return a + b;
}

/**
 * The seabed's furniture, deterministic. Rocks on a jittered 9 m grid where the bed is 1.5–12 m down; アマモ meadows
 * (shoots of three to five blades) in the shallows round 浮見堂, the start and the school's home, 2.5–6.5 m down.
 * Everything sits on the bed (min(-0.55, height + 0.18), the same floor the bed mesh uses).
 */
export const MEADOWS = [
  [363, 4, 4.5], [185, 11, 4], [352, -4, 6], [340, 16, 5], [386, 2, 5], [370, 40, 6], [300, 22, 6], [178, 2, 6], [204, 30, 5], [240, -4, 5], [262, 46, 5],
];

export function planBed(isWater, heightAt, opts = {}) {
  const phone = !!opts.phone;
  const floor = (x, z) => Math.min(-0.55, heightAt(x, z) + 0.18);
  const rocks = [], grass = [];
  const rockCap = phone ? 90 : 170;
  const areas = [[140, 470, -40, 90], [1480, 1860, 3500, 4140]];
  for (const [x0, x1, z0, z1] of areas) {
    for (let gx = x0; gx < x1 && rocks.length < rockCap; gx += 9) {
      for (let gz = z0; gz < z1 && rocks.length < rockCap; gz += 9) {
        const u = hash01(gx * 0.37 + gz * 1.13);
        if (u > 0.42) continue;
        const x = gx + hash01(gx + gz * 3.1) * 9, z = gz + hash01(gz - gx * 2.7) * 9;
        if (!isWater(x, z)) continue;
        const y = floor(x, z);
        if (y > -1.5 || y < -12) continue;
        const big = hash01(x * 0.71 + z) > 0.9;
        rocks.push({ x, y: y - 0.06, z, s: big ? 0.9 + u * 1.2 : 0.25 + u * 1.1, seed: gx * 7 + gz });
      }
    }
  }
  const shootCap = phone ? 480 : 950;
  let shoots = 0;
  for (let m = 0; m < MEADOWS.length && shoots < shootCap; m++) {
    const [cx, cz, r] = MEADOWS[m];
    const n = Math.round(Math.PI * r * r * (phone ? 1.6 : 3.2));
    for (let k = 0; k < n && shoots < shootCap; k++) {
      // a sunflower spiral, thinned toward the edge, so the meadow is dense in the middle and frays out
      const a = k * 2.39996 + m;
      const rr = r * Math.sqrt((k + 0.5) / n) * (0.85 + hash01(k + m * 31) * 0.3);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (hash01(x * 1.3 + z * 0.7) < (rr / r) * 0.55) continue;
      if (!isWater(x, z)) continue;
      const y = floor(x, z);
      if (y > -2.5 || y < -6.5) continue;
      shoots++;
      const blades = 3 + Math.floor(hash01(x + z * 1.7) * 3);
      for (let b = 0; b < blades; b++) {
        const v = hash01(x * 3.3 + b * 1.9 + z);
        grass.push({
          x: x + (v - 0.5) * 0.06, y: y - 0.02, z: z + (hash01(b + x) - 0.5) * 0.06,
          len: 0.6 + v * 0.75, w: 0.015 + hash01(b * 5 + z) * 0.01,
          yaw: v * Math.PI * 2 + b * 2.1, bend: 0.1 + v * 0.28,
          // a wave rolls through the meadow: the phase follows the ground
          phase: x * 0.35 + z * 0.21,
        });
      }
    }
  }
  return { rocks, grass, shoots };
}

/** Distance from a point to a polyline [[x,z], ...]. */
export function pathDistance(x, z, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

/**
 * One school step. a = { n, x, y, z, vx, vy, vz } Float32Arrays (except n).
 * Fish stay inside the home sphere and sheer away from the player.
 */
export function stepSchool(a, dt, home, player, T = TUNE.school) {
  const n = a.n;
  const px = player.x, py = player.y, pz = player.z;
  for (let i = 0; i < n; i++) {
    const ix = a.x[i], iy = a.y[i], iz = a.z[i];
    let cx = 0, cy = 0, cz = 0, cvx = 0, cvy = 0, cvz = 0, sx = 0, sy = 0, sz = 0, cnt = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = a.x[j] - ix, dy = a.y[j] - iy, dz = a.z[j] - iz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > T.neigh2 || d2 < 1e-8) continue;
      cx += a.x[j]; cy += a.y[j]; cz += a.z[j];
      cvx += a.vx[j]; cvy += a.vy[j]; cvz += a.vz[j];
      cnt++;
      if (d2 < T.sep2) {
        const inv = 1 / Math.sqrt(d2);
        sx -= dx * inv; sy -= dy * inv; sz -= dz * inv;
      }
    }
    let ax = sx * T.sep, ay = sy * T.sep, az = sz * T.sep;
    if (cnt > 0) {
      const inv = 1 / cnt;
      ax += (cx * inv - ix) * T.coh;
      ay += (cy * inv - iy) * T.coh;
      az += (cz * inv - iz) * T.coh;
      ax += (cvx * inv - a.vx[i]) * T.ali;
      ay += (cvy * inv - a.vy[i]) * T.ali;
      az += (cvz * inv - a.vz[i]) * T.ali;
    }
    ax += (home.x - ix) * T.home;
    ay += (home.y - iy) * T.home;
    az += (home.z - iz) * T.home;
    const pdx = ix - px, pdy = iy - py, pdz = iz - pz;
    const pd2 = pdx * pdx + pdy * pdy + pdz * pdz;
    const fleeing = !!(player.dash || player.dashing) && pd2 < T.scatter2 && pd2 > 1e-6;
    if (pd2 < T.avoid2 && pd2 > 1e-6) {
      const inv = 1 / Math.sqrt(pd2);
      const kick = T.avoid * (fleeing ? T.scatter : 1);
      ax += pdx * inv * kick;
      ay += pdy * inv * kick;
      az += pdz * inv * kick;
    }
    if (fleeing) {
      ax *= 0.35; ay *= 0.35; az *= 0.35;
      const inv = 1 / Math.sqrt(pd2);
      ax += pdx * inv * T.avoid * T.scatter;
      ay += pdy * inv * T.avoid * T.scatter;
      az += pdz * inv * T.avoid * T.scatter;
    }
    a.vx[i] += ax * dt; a.vy[i] += ay * dt; a.vz[i] += az * dt;
    const sp = Math.hypot(a.vx[i], a.vy[i], a.vz[i]) || 1;
    const cap = fleeing ? T.scatterSpeed : T.speed;
    if (sp > cap) {
      const sc = cap / sp;
      a.vx[i] *= sc; a.vy[i] *= sc; a.vz[i] *= sc;
    }
    a.x[i] += a.vx[i] * dt; a.y[i] += a.vy[i] * dt; a.z[i] += a.vz[i] * dt;
    const hx = a.x[i] - home.x, hy = a.y[i] - home.y, hz = a.z[i] - home.z;
    const hr = Math.hypot(hx, hy, hz);
    if (hr > home.r) {
      const sc = home.r / hr;
      a.x[i] = home.x + hx * sc;
      a.y[i] = home.y + hy * sc;
      a.z[i] = home.z + hz * sc;
    }
  }
}

/**
 * After a school step: each fish faces its velocity, banks into its turn and flashes silver while it turns (the flank
 * catches the light). a.yaw, a.roll and a.flash are Float32Arrays. No allocation.
 */
export function turnFlash(a, dt) {
  if (!(dt > 0)) return;
  const ease = 1 - Math.exp(-8 * dt), fade = Math.exp(-5 * dt);
  for (let i = 0; i < a.n; i++) {
    const sp = Math.hypot(a.vx[i], a.vz[i]);
    if (sp < 1e-4) continue;
    const yaw = Math.atan2(-a.vx[i], -a.vz[i]);
    let d = yaw - a.yaw[i];
    d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    const rate = d / dt;
    a.yaw[i] = yaw;
    const bank = clamp(rate * 0.22, -0.9, 0.9);
    a.roll[i] += (bank - a.roll[i]) * ease;
    const f = clamp(Math.abs(rate) * 0.5 - 0.2, 0, 1);
    a.flash[i] = Math.max(f, a.flash[i] * fade);
  }
}

/** One larger fish on a fixed loop. Mutates p. No allocation. */
export function stepPasser(p, dt) {
  p.t += dt * p.w;
  const a = p.t;
  const dx = -Math.sin(a) * p.r;
  const dz = Math.cos(a * 0.73) * p.r * 0.73;
  p.x = p.cx + Math.cos(a) * p.r;
  p.z = p.cz + Math.sin(a * 0.73) * p.r;
  p.y = p.cy + Math.sin(a * 1.3) * 0.55;
  p.yaw = Math.atan2(-dx, -dz);
}
