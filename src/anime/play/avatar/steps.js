// [play] Soft footsteps by surface. The engine's 'footstep' one-shot stays silent.
// The spacing matches the foot that is actually planting: the original rig's
// cycle, or ホヤぼーや's cadence (hoya-model.js, not edited here).

import { cycleLength } from './pose.js';

/** Cycles per second in the ホヤぼーや animator: clamp(1.9 + speed * 0.42, 1.9, 3.6). */
export function hoyaCadence(speed) {
  if (!(speed > 0.03)) return 0;
  const c = 1.9 + speed * 0.42;
  return c < 1.9 ? 1.9 : c > 3.6 ? 3.6 : c;
}

/** Metres between footfalls. Two plants per cycle. [feel] `cadence`: the cycle the walk drives (avatar/index.js gaitCadence), else his own. */
export function stepSpacing(speed, model, k, cadence) {
  if (!(speed > 0.45)) return 0;
  if (model === 'hoya') {
    const c = cadence > 0 ? cadence : hoyaCadence(speed);
    return c > 0 ? speed / (c * 2) : 0;
  }
  return cycleLength(speed, k) / 2;
}

export function surfaceKind(o) {
  if (o && o.deck) return 'wood';
  if (o && o.sand) return 'sand';
  return 'asphalt';
}

/**
 * Deck: the collider floor is clearly above the terrain (a quay, a promenade).
 * Sand: land, close to the water, low, and not a deck.
 */
export function classifySurface(x, z, groundY, world) {
  const sea = world.heightAt ? world.heightAt(x, z) : 0;
  const water = world.isWater ? world.isWater(x, z) : false;
  const deck = !water && groundY > sea + 0.2;
  const shore = world.shoreDist ? world.shoreDist(x, z) : -100;
  const sand = !deck && !water && shore < -0.4 && shore > -22 && groundY < sea + 1.6;
  return surfaceKind({ deck, sand });
}

/** Mutates `st` ({ acc, hit }). A hit is one footfall. `spacing` is metres between plants. */
export function stepTick(st, speed, dt, onGround, spacing) {
  st.hit = false;
  if (!onGround || !(speed > 0.45) || !(dt > 0)) { st.acc = 0; return st; }
  const every = spacing > 0 ? spacing : (speed > 4.6 ? 0.62 : 0.78);
  st.acc += speed * dt;
  if (st.acc >= every) {
    st.acc -= every;
    if (st.acc > every) st.acc = 0;
    st.hit = true;
  }
  return st;
}

function hash(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** A short noise tap. Wood is higher, sand is duller, asphalt is in between. */
export function footstep(sr, kind) {
  const dur = kind === 'sand' ? 0.09 : 0.055;
  const n = Math.max(1, (sr * dur) | 0);
  const a = new Float32Array(n);
  const f = kind === 'wood' ? 210 : kind === 'sand' ? 80 : 160;
  const decay = kind === 'sand' ? 22 : 46;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * decay);
    a[i] = (hash(i + (kind === 'wood' ? 3 : kind === 'sand' ? 9 : 1)) * 2 - 1) * env * 0.28
      + Math.sin(t * f * Math.PI * 2) * env * 0.08;
  }
  return a;
}
