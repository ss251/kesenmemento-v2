// KesenMemento title sounds, synthesised (no samples, nothing borrowed): the same code fills WebAudio buffers in the
// browser and renders the comp video's WAV under bun. Scale: ヨナ抜き長音階 (yonanuki major) in D: D E F# A B.
// bun sfx.mjs out.wav [timeline]      timeline: title (default)
export const SR = 48000;

// deterministic noise (mulberry32), so every render is identical
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; }; }

// RBJ biquad, one pass over a buffer
function biquad(x, type, f, q = 0.707, sr = SR) {
  const w = 2 * Math.PI * f / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
  a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
const buf = (sec) => new Float32Array(Math.ceil(sec * SR));
export const hz = (n) => 440 * 2 ** ((n - 69) / 12);       // MIDI note → Hz
const N = { D3: 50, A3: 57, D4: 62, E4: 64, 'F#4': 66, A4: 69, B4: 71, D5: 74, E5: 76, 'F#5': 78, A5: 81, B5: 83, D6: 86, E6: 88, 'F#6': 90, A6: 93, B6: 95, E7: 100 };

/** a wooden mallet (marimba-like): a fundamental, the 4th partial, and a soft click */
export function marimba(f, amp = 0.5, dur = 0.6) {
  const y = buf(dur), r = rng(f | 0);
  for (let i = 0; i < y.length; i++) {
    const t = i / SR, a = Math.min(1, t / 0.002);
    y[i] = amp * a * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.16) + 0.22 * Math.sin(2 * Math.PI * 3.93 * f * t) * Math.exp(-t / 0.035) + 0.18 * r() * Math.exp(-t / 0.004));
  }
  return y;
}

/** a plucked string (Karplus-Strong) for the koto voice: bright attack, warm tail */
export function koto(f, amp = 0.45, dur = 1.4, bright = 0.62) {
  const y = buf(dur), n = Math.max(2, Math.round(SR / f)), d = new Float32Array(n), r = rng((f * 7) | 0);
  let prev = 0; for (let i = 0; i < n; i++) { const v = r(); prev = bright * v + (1 - bright) * prev; d[i] = prev; }
  let k = 0;
  for (let i = 0; i < y.length; i++) { const a = d[k], b = d[(k + 1) % n]; const v = 0.4985 * (a + b) * 0.9992; d[k] = v; y[i] = amp * a; k = (k + 1) % n; }
  return biquad(y, 'lp', 5200);
}

/** an FM bell, for the sparkle (キラーン) */
export function bell(f, amp = 0.2, dur = 1.4) {
  const y = buf(dur);
  for (let i = 0; i < y.length; i++) { const t = i / SR, idx = 2.2 * Math.exp(-t / 0.25); y[i] = amp * Math.min(1, t / 0.001) * Math.exp(-t / 0.42) * Math.sin(2 * Math.PI * f * t + idx * Math.sin(2 * Math.PI * f * 3.5 * t)); }
  return y;
}

/** water: a bandpassed noise splash and a few droplets */
export function splash(amp = 0.5, dur = 0.5) {
  const r = rng(11), x = buf(dur);
  for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = r() * Math.min(1, t / 0.006) * Math.exp(-t / 0.09); }
  const y = biquad(biquad(x, 'bp', 1900, 0.8), 'hp', 500);
  for (const [t0, f0] of [[0.06, 1500], [0.11, 1180], [0.17, 1650], [0.24, 980]]) {
    for (let i = 0; i < 0.06 * SR; i++) { const t = i / SR, f = f0 * (1 - 0.55 * t / 0.06); const j = Math.round((t0 + t) * SR); if (j < y.length) y[j] += 0.35 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.018); }
  }
  for (let i = 0; i < y.length; i++) y[i] *= amp * 2.2;
  return y;
}

/** 決定: a bright two-step "pon" */
export function pon(amp = 0.45) {
  const y = buf(0.35);
  let ph = 0;
  for (let i = 0; i < y.length; i++) { const t = i / SR, f = t < 0.045 ? 784 : 1175; ph += 2 * Math.PI * f / SR; y[i] = amp * Math.min(1, t / 0.002) * Math.exp(-(t < 0.045 ? t : t - 0.045) / 0.09) * (Math.sin(ph) + 0.25 * Math.sin(2 * ph)); }
  return y;
}

/** a soft whoosh (bandpassed noise sweeping up) */
export function whoosh(amp = 0.3, dur = 0.7) {
  // Chamberlin state-variable filter, band output, cutoff swept 350 → 2950 Hz
  const r = rng(5), y = buf(dur); let low = 0, band = 0;
  for (let i = 0; i < y.length; i++) {
    const t = i / SR, u = t / dur, fc = 350 + 2600 * u * u, f = 2 * Math.sin(Math.PI * fc / SR), q = 0.9;
    const x = r(); low += f * band; const high = x - low - q * band; band += f * high;
    y[i] = amp * Math.sin(Math.PI * u) ** 1.6 * band;
  }
  return biquad(y, 'lp', 4000);
}

/** a small taiko: a pitched-down thump and a skin slap */
export function taiko(amp = 0.55) {
  const y = buf(0.5), r = rng(3); let ph = 0;
  for (let i = 0; i < y.length; i++) { const t = i / SR, f = 55 + 70 * Math.exp(-t / 0.03); ph += 2 * Math.PI * f / SR; y[i] = amp * (Math.sin(ph) * Math.exp(-t / 0.2) + 0.25 * r() * Math.exp(-t / 0.012)); }
  return biquad(y, 'lp', 1800);
}

/** shaker tick */
export function shaker(amp = 0.08) { const r = rng(9), y = buf(0.09); for (let i = 0; i < y.length; i++) { const t = i / SR; y[i] = amp * r() * Math.min(1, t / 0.01) * Math.exp(-t / 0.025); } return biquad(y, 'hp', 5000); }

/** the harbour: slow swells of soft surf, very low */
export function harbour(sec, amp = 0.16) {
  const r = rng(21), x = buf(sec);
  for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = r() * (0.55 + 0.45 * Math.sin(2 * Math.PI * t / 5.2 - 1.2)); }
  const y = biquad(biquad(x, 'lp', 620), 'hp', 90);
  for (let i = 0; i < y.length; i++) y[i] *= amp * 3;
  return y;
}

/** the title sting: a koto phrase over taiko and shaker, 140 bpm, eighths */
export function sting(t0) {
  const e = 60 / 140 / 2, ev = [];
  const mel = [['D5', 1], ['E5', 1], ['F#5', 1], ['A5', 1], ['B5', 2], ['A5', 1], ['F#5', 1], ['A5', 4]];
  let t = t0; for (const [n, l] of mel) { ev.push([t, koto(hz(N[n]), 0.42, Math.max(0.9, l * e + 0.6))]); ev.push([t, koto(hz(N[n] - 12), 0.16, 0.8)]); t += l * e; }
  for (const k of [0, 2, 4, 6, 7, 8]) ev.push([t0 + k * e, taiko(k === 8 ? 0.6 : 0.42)]);
  for (let k = 1; k < 12; k += 2) ev.push([t0 + k * e, shaker()]);
  ev.push([t0, koto(hz(N.D3), 0.3, 1.8)]); ev.push([t0 + 8 * e, koto(hz(N.A3), 0.26, 1.6)]); ev.push([t0 + 8 * e, koto(hz(N.D4), 0.22, 1.8)]);
  return ev;
}

/** the comp timeline (seconds), mirroring title.html's animation clock */
export const LETTER_T = (i) => 0.15 + i * 0.09 + 0.21;   // title-motion.js: a letter lands at its start + 0.5 of 0.42 s
export function titleTimeline(dur = 6.2, tapAt = 4.7) {
  const ev = [[0, harbour(dur)]];
  ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6'].forEach((n, i) => ev.push([LETTER_T(i), marimba(hz(N[n]), 0.36)]));
  ev.push([1.05, splash(0.45)]);
  ev.push([1.36, bell(hz(N.E7), 0.16)]); ev.push([1.42, bell(hz(N.B6), 0.12)]);
  ev.push(...sting(1.62));
  ev.push([tapAt, pon(0.5)]); ev.push([tapAt + 0.04, whoosh(0.22, 0.8)]);
  return { dur, ev };
}

export function mix({ dur, ev }) {
  const L = buf(dur), R = buf(dur);
  ev.forEach(([t, s], k) => { const o = Math.round(t * SR), pan = Math.sin(k * 1.7) * 0.25; for (let i = 0; i < s.length && o + i < L.length; i++) { L[o + i] += s[i] * (1 - pan); R[o + i] += s[i] * (1 + pan); } });
  let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const g = pk > 0.89 ? 0.89 / pk : 1; for (let i = 0; i < L.length; i++) { L[i] = Math.tanh(L[i] * g * 1.1); R[i] = Math.tanh(R[i] * g * 1.1); }
  return [L, R];
}

export function wav([L, R]) {
  const n = L.length, b = new DataView(new ArrayBuffer(44 + n * 4));
  const s = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); b.setUint32(4, 36 + n * 4, true); s(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 2, true);
  b.setUint32(24, SR, true); b.setUint32(28, SR * 4, true); b.setUint16(32, 4, true); b.setUint16(34, 16, true); s(36, 'data'); b.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { b.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); b.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  return new Uint8Array(b.buffer);
}

const SOUND_KEY = 'klc.titleSound';
const LETTERS = ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6'];

/** Remembered choice. Sound stays off until a gesture creates the AudioContext. */
export function titleSoundPref() {
  try { return localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; }
}

/**
 * The title's sounds on the page. Buffers are built on the first gesture, off the critical path (idle slices).
 * Intro cues follow the motion clock (or the current moment, if sound is switched on mid-intro).
 * The koto sting plays when loading completes. ポン and the whoosh play on the tap.
 */
export function createTitleSound() {
  let ctx = null, bank = null, on = false, building = null, nodes = [];
  function remember(v) { try { localStorage.setItem(SOUND_KEY, v ? '1' : '0'); } catch { /* private mode */ } }
  function stop() { for (const n of nodes) { try { n.stop(); } catch { /* already ended */ } } nodes = []; }
  function toBuf(samples) {
    const b = ctx.createBuffer(1, samples.length, SR);
    b.copyToChannel(samples, 0);
    return b;
  }
  function play(buffer, when, offset = 0) {
    if (!buffer || !on) return;
    const dur = buffer.duration;
    if (offset >= dur - 0.02) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.connect(ctx.destination);
    src.start(when, Math.max(0, offset));
    nodes.push(src);
  }
  function build() {
    if (bank) return Promise.resolve(bank);
    if (building) return building;
    const slices = [
      () => ({ harbour: toBuf(harbour(8)) }),
      () => { const o = {}; LETTERS.forEach((n, i) => { o['m' + i] = toBuf(marimba(hz(N[n]), 0.36)); }); return o; },
      () => ({ splash: toBuf(splash(0.45)), bell1: toBuf(bell(hz(N.E7), 0.16)), bell2: toBuf(bell(hz(N.B6), 0.12)) }),
      () => ({ pon: toBuf(pon(0.5)), whoosh: toBuf(whoosh(0.22, 0.8)) }),
      () => ({ sting: sting(0).map(([t, s]) => [t, toBuf(s)]) }),
    ];
    building = new Promise((resolve) => {
      const acc = {}; let i = 0;
      const step = () => {
        Object.assign(acc, slices[i++]());
        if (i < slices.length) {
          const ric = globalThis.requestIdleCallback;
          if (ric) ric(step, { timeout: 400 }); else setTimeout(step, 16);
        } else { bank = acc; resolve(acc); }
      };
      const ric = globalThis.requestIdleCallback;
      if (ric) ric(step, { timeout: 400 }); else setTimeout(step, 16);
    });
    return building;
  }
  function sync(motionT, stingAt) {
    if (!bank || !ctx || !on) return;
    const now = ctx.currentTime + 0.03;
    play(bank.harbour, now, motionT);
    LETTERS.forEach((_, i) => {
      const te = LETTER_T(i), off = motionT - te;
      play(bank['m' + i], off < 0 ? now + (te - motionT) : now, off < 0 ? 0 : off);
    });
    for (const [name, te] of [['splash', 1.05], ['bell1', 1.36], ['bell2', 1.42]]) {
      const off = motionT - te;
      play(bank[name], off < 0 ? now + (te - motionT) : now, off < 0 ? 0 : off);
    }
    if (stingAt != null) stingFrom(motionT, stingAt);
  }
  function stingFrom(motionT, stingAt) {
    if (!bank || !on) return;
    const now = ctx.currentTime + 0.03, late = Math.max(0, motionT - stingAt);
    for (const [t, buf] of bank.sting) {
      const off = late - t;
      play(buf, off < 0 ? now + (t - late) : now, off < 0 ? 0 : off);
    }
  }
  return {
    get on() { return on; },
    /** Call inside the gesture. `getT` reads the motion clock once the buffers exist. */
    enable(getT, stingAt) {
      on = true; remember(true);
      if (!ctx) ctx = new AudioContext();
      const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
      return resume.then(() => build()).then(() => { if (on) sync(getT(), stingAt); });
    },
    disable() { on = false; remember(false); stop(); },
    /** Loading has reached 1. `at` is the motion time of that moment. */
    sting(getT, at) { if (!on) return; build().then(() => { if (on) stingFrom(getT(), at); }); },
    tap() {
      if (!on || !bank) return;
      const now = ctx.currentTime + 0.02;
      play(bank.pon, now, 0); play(bank.whoosh, now, 0);
    },
  };
}

if (typeof Bun !== 'undefined' && import.meta.main) {
  const out = process.argv[2] || 'title.wav';
  await Bun.write(out, wav(mix(titleTimeline())));
  console.log('wrote', out);
}
