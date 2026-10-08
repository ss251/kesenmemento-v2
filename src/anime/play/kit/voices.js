// [play] The voices behind the play names.
// Borrowed from the sfx.mjs of the title's design comps, which is not included (marimba, koto,
// bell, splash, pon, whoosh, taiko, shaker) and rendered at the AudioContext's
// own rate. src/anime/audio/title-sfx.js is the title lane's copy of the same
// shapes. When that file lands, these two should share one module. Do not edit
// title-sfx.js from this lane.
//
// Every function returns a Float32Array. Nothing here touches an AudioContext.

const TAU = Math.PI * 2;

function mix(n, fn) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0.001 ? 0.82 / peak : 1;
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}

function env(i, n, a, d) {
  const t = i / n;
  if (t < a) return t / a;
  return Math.exp(-((t - a) / d));
}

/** Wooden bar. f is Hz. */
export function marimba(sr, f = 587, dur = 0.55) {
  const n = (dur * sr) | 0;
  return mix(n, (i) => {
    const t = i / sr;
    const e = env(i, n, 0.004, 0.16);
    return e * (Math.sin(TAU * f * t) * 0.7
      + Math.sin(TAU * f * 4.05 * t) * 0.28 * Math.exp(-t * 28)
      + Math.sin(TAU * f * 9.2 * t) * 0.06 * Math.exp(-t * 40));
  });
}

/** Plucked string, Karplus-Strong. */
export function koto(sr, f = 392, dur = 0.9) {
  const n = (dur * sr) | 0;
  const period = Math.max(2, (sr / f) | 0);
  const buf = new Float32Array(period);
  for (let i = 0; i < period; i++) buf[i] = Math.random() * 2 - 1;
  const out = new Float32Array(n);
  let p = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const s = buf[p];
    const next = (s + prev) * 0.5 * 0.996;
    buf[p] = next;
    prev = s;
    p = (p + 1) % period;
    out[i] = next;
  }
  return mix(n, (i) => out[i]);
}

/** FM bell. A fifth above the marimba is the shimmer's second voice. */
export function bell(sr, f = 880, dur = 1.1) {
  const n = (dur * sr) | 0;
  return mix(n, (i) => {
    const t = i / sr;
    const mod = Math.sin(TAU * f * 1.414 * t) * Math.exp(-t * 4) * 3.2;
    return Math.sin(TAU * f * t + mod) * Math.exp(-t * 2.4) * 0.7
      + Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 6) * 0.15;
  });
}

export function splash(sr, dur = 0.45) {
  const n = (dur * sr) | 0;
  return mix(n, (i) => {
    const t = i / n;
    const noise = Math.random() * 2 - 1;
    const burst = noise * Math.exp(-t * 14) * (t < 0.08 ? 1 : 0.4);
    const bubble = Math.sin(TAU * (600 + 400 * t) * (i / sr)) * Math.exp(-t * 8) * 0.25;
    return (burst + bubble) * Math.min(1, t * 40);
  });
}

export function pon(sr, dur = 0.32) {
  const n = (dur * sr) | 0;
  return mix(n, (i) => {
    const t = i / sr;
    return Math.sin(TAU * 740 * t) * Math.exp(-t * 18) * 0.6
      + Math.sin(TAU * 1480 * t) * Math.exp(-t * 30) * 0.2
      + (Math.random() * 2 - 1) * Math.exp(-t * 80) * 0.15;
  });
}

export function whoosh(sr, dur = 0.55) {
  const n = (dur * sr) | 0;
  return mix(n, (i) => {
    const t = i / n;
    const amp = Math.sin(Math.PI * t) ** 1.4;
    return (Math.random() * 2 - 1) * amp * 0.55;
  });
}

export function taiko(sr, dur = 0.42) {
  const n = (dur * sr) | 0;
  return mix(n, (i) => {
    const t = i / sr;
    const f = 140 * Math.exp(-t * 8) + 55;
    return Math.sin(TAU * f * t) * Math.exp(-t * 6)
      + (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.3;
  });
}

export function shaker(sr, dur = 0.08) {
  const n = (dur * sr) | 0;
  return mix(n, (i) => (Math.random() * 2 - 1) * Math.exp(-(i / n) * 10));
}

export function whistle(sr, dur = 0.32) {
  const n = (dur * sr) | 0;
  return mix(n, (i) => {
    const t = i / sr;
    const f = 880 + 420 * Math.min(1, t / 0.08);
    return Math.sin(TAU * f * t) * Math.exp(-t * 7) * 0.7;
  });
}

/** A short koto phrase on the ヨナ抜き steps. The milestone sting. */
export function fanfare(sr) {
  const notes = [587.33, 659.25, 739.99, 880];
  const step = (0.22 * sr) | 0;
  const n = step * notes.length + (0.7 * sr) | 0;
  const out = new Float32Array(n);
  notes.forEach((f, k) => {
    const hit = koto(sr, f, 0.85);
    const at = k * step;
    for (let i = 0; i < hit.length && at + i < n; i++) out[at + i] += hit[i] * 0.55;
  });
  return mix(n, (i) => out[i]);
}

/** Whistle then a soft pon. The countdown's GO. */
export function goCue(sr) {
  const a = whistle(sr, 0.32);
  const b = pon(sr, 0.28);
  const n = Math.max(a.length, b.length);
  return mix(n, (i) => (a[i] || 0) * 0.7 + (b[i] || 0) * 0.4);
}

/** A whoosh with a bell inside it. Crossing a ring. */
export function ringCue(sr) {
  const a = whoosh(sr, 0.4);
  const b = bell(sr, 988, 0.55);
  const n = Math.max(a.length, b.length);
  return mix(n, (i) => (a[i] || 0) * 0.45 + (b[i] || 0) * 0.55);
}

/** Bell plus a soft taiko, the firework crack. */
export function firework(sr) {
  const a = bell(sr, 1174, 0.8);
  const b = taiko(sr, 0.28);
  const n = Math.max(a.length, b.length);
  return mix(n, (i) => (a[i] || 0) * 0.7 + (b[i] || 0) * 0.45);
}

/** Three koto notes, the catch. */
export function catchPhrase(sr) {
  const notes = [523.25, 659.25, 783.99];
  const step = (0.16 * sr) | 0;
  const n = step * notes.length + (0.55 * sr) | 0;
  const out = new Float32Array(n);
  notes.forEach((f, k) => {
    const hit = koto(sr, f, 0.7);
    const at = k * step;
    for (let i = 0; i < hit.length && at + i < n; i++) out[at + i] += hit[i] * 0.5;
  });
  return mix(n, (i) => out[i]);
}
