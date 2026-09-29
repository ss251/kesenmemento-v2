// [v3:life] Harbour soundscape, synthesized in the style of Sakuragaoka Station's audio.js (Kenton-GMI, MIT): no
// sample files, seeded variation, nothing before the user's first gesture. It rides on the engine's AudioContext
// (ctx.audio.context, created by audio.start() in main.js) with its own small graph, and follows ctx.audio.muted.
//
//   waves      low swell + water lapping on the quays; loud near the shore, fades with height and distance inland
//   wind       airy band-passed noise; rises with altitude (drone) and the live wind speed
//   gulls      ウミネコ cries (みゃあ): short formant calls near flocks (ctx.services.harbor.gulls) and the bay
//   engines    a diesel putter at the nearest boat (ctx.services.harbor.boats), within ~160 m
//   rain       hiss + patter by ctx.shared.uRain;   insects  autumn 虫の声 on land at night
//
//   const snd = createSoundscape(ctx)   ->  { update(dt), stats }
const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function prng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function noiseBuffer(ac, sec, r, pink = false) {
  const n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    if (pink) { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; }
    else d[i] = w * 0.5;
  }
  // crossfade the loop seam
  const f = Math.floor(ac.sampleRate * 0.05); for (let i = 0; i < f; i++) { const u = i / f; d[n - f + i] = d[n - f + i] * (1 - u) + d[i] * u; }
  return b;
}
/** ウミネコ: a nasal "myaa(-o)" — harmonic source with a rising-then-falling pitch through two formants. */
function gullBuffer(ac, r) {
  const sr = ac.sampleRate, dur = 0.42 + r() * 0.3, n = Math.floor(sr * dur), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0);
  const f0 = 620 + r() * 260, peak = f0 * (1.35 + r() * 0.25), end = f0 * (0.78 + r() * 0.1);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, t = i / sr;
    const f = u < 0.25 ? f0 + (peak - f0) * (u / 0.25) : peak + (end - peak) * ((u - 0.25) / 0.75);
    ph += f / sr;
    const env = Math.min(1, u / 0.06) * Math.pow(1 - u, 1.4) * (1 + 0.25 * Math.sin(TAU * 23 * t));
    // bright nasal harmonics (formants near 1.4 kHz and 2.9 kHz)
    let s = 0; for (let h = 1; h <= 7; h++) { const fh = f * h; const w = Math.exp(-(((fh - 1400) / 700) ** 2)) + 0.6 * Math.exp(-(((fh - 2900) / 900) ** 2)) + 0.15 / h; s += Math.sin(TAU * ph * h) * w; }
    d[i] = s * env * 0.22 + (r() * 2 - 1) * env * 0.02;
  }
  return b;
}
function chirpBuffer(ac, r) {       // one 鈴虫-like "riin" pulse train
  const sr = ac.sampleRate, dur = 0.5, n = Math.floor(sr * dur), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0);
  const f = 4200 + r() * 700;
  for (let i = 0; i < n; i++) { const t = i / sr, u = i / n; const am = 0.5 + 0.5 * Math.sin(TAU * 38 * t); d[i] = Math.sin(TAU * f * t) * am * Math.min(1, u / 0.05) * Math.pow(1 - u, 0.8) * 0.25; }
  return b;
}

export function createSoundscape(ctx) {
  const A = ctx.audio;
  const L = ctx.L;
  const S = ctx.shared;
  const r = prng(0x6b6573);
  let ac = null, G = null;
  const stats = { started: false, gulls: 0, laps: 0 };
  let nextLap = 0, nextGull = 0, nextBug = 0;
  const cam = ctx.camera;

  function start() {
    ac = A.context; if (!ac) return false;
    const master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(master);
    const pink = noiseBuffer(ac, 6, r, true), white = noiseBuffer(ac, 4, r, false);
    const loop = (buf) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0; s.start(ac.currentTime + r() * 0.1, r() * buf.duration); return s; };
    // waves: pink noise -> lowpass, gain swells
    const wv = loop(pink), wlp = ac.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 520; wlp.Q.value = 0.4;
    const wg = ac.createGain(); wg.gain.value = 0; wv.connect(wlp).connect(wg).connect(comp);
    // wind: white -> bandpass (moving centre)
    const wd = loop(white), wbp = ac.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 480; wbp.Q.value = 0.7;
    const wdg = ac.createGain(); wdg.gain.value = 0; wd.connect(wbp).connect(wdg).connect(comp);
    // rain: white -> highpass hiss
    const rn = loop(white), rhp = ac.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 2400;
    const rg = ac.createGain(); rg.gain.value = 0; rn.connect(rhp).connect(rg).connect(comp);
    // engine: two detuned saws -> lowpass, amplitude-modulated at the firing rate, stereo-panned by bearing
    const e1 = ac.createOscillator(), e2 = ac.createOscillator(); e1.type = 'sawtooth'; e2.type = 'sawtooth'; e1.frequency.value = 43; e2.frequency.value = 43.7;
    const elp = ac.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 260; elp.Q.value = 1.2;
    const eam = ac.createGain(); eam.gain.value = 0.5; const lfo = ac.createOscillator(); lfo.frequency.value = 7.2; const lfg = ac.createGain(); lfg.gain.value = 0.45; lfo.connect(lfg).connect(eam.gain);
    const eg = ac.createGain(); eg.gain.value = 0; const ep = ac.createStereoPanner();
    e1.connect(elp); e2.connect(elp); elp.connect(eam).connect(eg).connect(ep).connect(comp);
    e1.start(); e2.start(); lfo.start();
    const gulls = [0, 1, 2, 3, 4, 5].map(() => gullBuffer(ac, r));
    const bugs = [0, 1, 2].map(() => chirpBuffer(ac, r));
    G = { master, comp, wg, wlp, wdg, wbp, rg, eg, ep, e1, e2, lfo, gulls, bugs, pink };
    stats.started = true;
    return true;
  }
  function oneShot(buf, gain, pan = 0, rate = 1, filter = null) {
    const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ac.createGain(); g.gain.value = gain; const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    let node = s; if (filter) { const f = ac.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.f; f.Q.value = filter.q ?? 0.7; s.connect(f); node = f; }
    node.connect(g).connect(p).connect(G.comp); s.start(); s.onended = () => { try { p.disconnect(); } catch (e) { /* ok */ } };
  }
  /** stereo pan for a world point, relative to the camera's right vector */
  function panOf(x, z) {
    const dx = x - cam.position.x, dz = z - cam.position.z, l = Math.hypot(dx, dz) || 1;
    const yaw = cam.rotation.y; const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    return (dx * rx + dz * rz) / l;
  }

  let tAcc = 0;
  function update(dt) {
    if (!G) { if (A?.ready && A.context && !stats.started) start(); if (!G) return; }
    const now = ac.currentTime;
    tAcc += dt;
    const muted = !!A.muted;
    G.master.gain.setTargetAtTime(muted ? 0 : 0.8, now, 0.3);
    if (muted) return;
    const p = cam.position;
    const ground = Math.max(L.heightAt(p.x, p.z), 0);
    const alt = Math.max(0, p.y - ground);
    const shore = L.shoreDist ? L.shoreDist(p.x, p.z) : (L.isWater(p.x, p.z) ? 10 : -100);   // + sea, - land
    const nearSea = clamp01(1 - Math.max(0, -shore - 8) / 90) * clamp01(1 - alt / 260);
    const T = ctx.services.time;
    const wind = T?.weather?.wind ?? 3, rain = S.uRain?.value ?? 0, night = S.uNight?.value ?? 0;
    // waves: slow swell
    const swell = 0.55 + 0.25 * Math.sin(tAcc * 0.8) + 0.2 * Math.sin(tAcc * 0.37 + 1.3);
    G.wg.gain.setTargetAtTime(0.5 * nearSea * swell + 0.04 * clamp01(1 - alt / 800), now, 0.4);
    G.wlp.frequency.setTargetAtTime(380 + 320 * swell, now, 0.5);
    // lapping bursts on the quays
    if (tAcc > nextLap && nearSea > 0.25 && alt < 40) {
      oneShot(G.pink, 0.55 * nearSea, (r() - 0.5) * 1.2, 0.7 + r() * 0.5, { type: 'bandpass', f: 380 + r() * 500, q: 1.4 });
      nextLap = tAcc + 0.9 + r() * 2.2; stats.laps++;
    }
    // wind: altitude + live wind
    const wk = clamp01(0.12 + wind / 14 + alt / 300);
    G.wdg.gain.setTargetAtTime(0.16 * wk * (0.75 + 0.25 * (S.uGust?.value ?? 0.5)), now, 0.6);
    G.wbp.frequency.setTargetAtTime(320 + 520 * (S.uGust?.value ?? 0.5) + alt * 0.8, now, 0.8);
    // rain
    G.rg.gain.setTargetAtTime(0.28 * rain * clamp01(1 - alt / 500), now, 0.6);
    // gulls near the harbour (flocks, bay)
    const hs = ctx.services.harbor;
    if (tAcc > nextGull) {
      let gx = null, gz = null, d = 1e9;
      const pos = hs?.gulls?.positions?.(ctx.time || 0);
      if (pos && pos.length) for (const q of pos) { const x = q.x ?? q[0], z = q.z ?? q[2]; const dd = Math.hypot(x - p.x, z - p.z); if (dd < d) { d = dd; gx = x; gz = z; } }
      if (gx === null) { const b = L.SPOTS.innerBay || { x: 156, z: -33 }; gx = b.x; gz = b.z; d = Math.hypot(b.x - p.x, b.z - p.z) + 40; }
      const k = clamp01(1 - d / 220) * (0.4 + 0.6 * (1 - night));
      if (k > 0.05) {
        const buf = G.gulls[Math.floor(r() * G.gulls.length)];
        const calls = 1 + Math.floor(r() * 3);
        for (let i = 0; i < calls; i++) setTimeout(() => oneShot(buf, 0.28 * k, panOf(gx, gz) * 0.8, 0.94 + r() * 0.12, { type: 'lowpass', f: 2600 + 3000 * clamp01(1 - d / 150) }), i * (380 + r() * 180));
        stats.gulls++;
      }
      nextGull = tAcc + 2.2 + r() * 6 * (1 + night * 2);
    }
    // engine at the nearest boat
    let bd = 1e9, bx = 0, bz = 0;
    for (const b of hs?.boats || []) { const dd = Math.hypot(b.x - p.x, b.z - p.z); if (dd < bd) { bd = dd; bx = b.x; bz = b.z; } }
    const ek = clamp01(1 - bd / 160) * clamp01(1 - alt / 200);
    G.eg.gain.setTargetAtTime(0.22 * ek * ek, now, 0.5);
    if (ek > 0) G.ep.pan.setTargetAtTime(panOf(bx, bz) * 0.7, now, 0.3);
    // autumn insects at night, on land
    if (night > 0.5 && shore < -15 && alt < 30 && tAcc > nextBug) {
      oneShot(G.bugs[Math.floor(r() * G.bugs.length)], 0.05 * night, (r() - 0.5) * 1.6, 0.97 + r() * 0.06, { type: 'highpass', f: 2500 });
      nextBug = tAcc + 0.35 + r() * 0.9;
    }
  }
  return { update, stats };
}
