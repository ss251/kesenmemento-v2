// [play] ウミネコ voice. Registered into ctx.audio so mute (M / ♪) owns it.
// The harbor's gullBuffer stays private; this is the player's own cry.

export function cry(sr) {
  const dur = 0.38;
  const n = Math.max(1, (sr * dur) | 0);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 1280 + 740 * Math.sin(t * 46) * Math.exp(-t * 2.4);
    const env = Math.min(1, t * 50) * Math.exp(-t * 6.5);
    a[i] = Math.sin(2 * Math.PI * f * t) * env * 0.42;
  }
  return a;
}

/** Louder as the bird goes faster. A perch is almost still air. */
export function windGain(speed, perched) {
  if (perched) return 0.035;
  const t = Math.max(0, speed) / 28;
  return Math.min(0.62, 0.05 + t * t * 0.9);
}

/** Pink-ish rush. The loop's setParam('speed') opens it. Position comes from the caller. */
export function registerGullAudio(audio, footstep) {
  if (!audio || audio.__gullVoice) return false;
  if (typeof audio.registerBuffer !== 'function') return false;
  audio.__gullVoice = true;
  audio.registerBuffer('play-gull-cry', (sr) => cry(sr));
  audio.registerSfx('play-gull-cry', { ref: 10, range: 90, gain: 0.4, wet: 'lo', buf: ['play-gull-cry'], jitter: 0.05 });
  for (const kind of ['asphalt', 'wood', 'sand']) {
    const key = 'play-step-' + kind;
    audio.registerBuffer(key, (sr) => footstep(sr, kind));
    audio.registerSfx(key, { ref: 2, range: 14, gain: 0.16, buf: [key], jitter: 0.04 });
  }
  audio.registerLoop('play-gull-wind', {
    ref: 6, roll: 0.45, range: 40, gain: 1,
    build(I, now, tools) {
      const n = tools.NOISE('pink', now);
      const f = tools.BQ('bandpass', 700, 0.65);
      const g = tools.G(0.15);
      n.connect(f); f.connect(g); g.connect(I.in);
      I.srcs.push(n); I.nodes.push(f, g);
      I.setParam = (k, v) => {
        if (k !== 'speed') return;
        const s = Math.max(0, +v || 0);
        g.gain.value = Math.min(0.5, s / 48);
        f.frequency.value = 380 + s * 36;
      };
    },
  });
  return true;
}
