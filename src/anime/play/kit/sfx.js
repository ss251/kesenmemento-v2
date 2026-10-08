// [play] Names the features call. They register into ctx.audio (one context,
// one mute). A play before the first gesture, or while ♪ is off, is a no-op.
//
// World sounds (chime, combo, shimmer, splash, plop) take a position.
// UI sounds (count, go, stamp, fanfare) do not.

import * as V from './voices.js';

export const SOUND_NAMES = [
  'chime', 'combo', 'shimmer', 'ring', 'checkpoint', 'buoy',
  'count', 'go', 'stamp', 'plop', 'nibble', 'bite', 'catch',
  'splash', 'fanfare', 'firework', 'tap', 'whoosh', 'blip',
];

const D5 = 587.33;
const A5 = 880;

let audio = null;
let boundAudio = null;

function buf(fn) {
  return (sr) => fn(sr);
}

export function bindSfx(ctxAudio) {
  audio = ctxAudio || null;
  if (!audio || boundAudio === audio) return;
  if (typeof audio.registerBuffer !== 'function') return;
  boundAudio = audio;
  audio.registerBuffer('play-marimba', buf((sr) => V.marimba(sr, D5)));
  audio.registerBuffer('play-combo', buf((sr) => V.marimba(sr, D5, 0.42)));
  audio.registerBuffer('play-bell-lo', buf((sr) => V.bell(sr, D5, 0.9)));
  audio.registerBuffer('play-bell-hi', buf((sr) => V.bell(sr, A5, 0.9)));
  audio.registerBuffer('play-bell', buf((sr) => V.bell(sr, 988, 0.7)));
  audio.registerBuffer('play-splash', buf((sr) => V.splash(sr)));
  audio.registerBuffer('play-pon', buf((sr) => V.pon(sr)));
  audio.registerBuffer('play-whoosh', buf((sr) => V.whoosh(sr)));
  audio.registerBuffer('play-taiko', buf((sr) => V.taiko(sr)));
  audio.registerBuffer('play-shaker', buf((sr) => V.shaker(sr)));
  audio.registerBuffer('play-whistle', buf((sr) => V.whistle(sr)));
  audio.registerBuffer('play-fanfare', buf((sr) => V.fanfare(sr)));
  audio.registerBuffer('play-firework', buf((sr) => V.firework(sr)));
  audio.registerBuffer('play-catch', buf((sr) => V.catchPhrase(sr)));
  audio.registerBuffer('play-nibble', buf((sr) => V.marimba(sr, 392, 0.18)));
  audio.registerBuffer('play-blip', buf((sr) => V.marimba(sr, D5, 0.09)));
  audio.registerBuffer('play-go', buf((sr) => V.goCue(sr)));
  audio.registerBuffer('play-ring', buf((sr) => V.ringCue(sr)));

  const one = (name, key, extra) => audio.registerSfx('play-' + name, Object.assign({ buf: [key], range: 40 }, extra));
  one('chime', 'play-marimba', { gain: 0.55, ref: 18, roll: 0.4, range: 70 });
  one('combo', 'play-combo', { gain: 0.5, ref: 18, roll: 0.4, range: 70 });
  one('ring', 'play-ring', { gain: 0.4, ref: 22, roll: 0.35, range: 80 });
  one('checkpoint', 'play-pon', { gain: 0.5 });
  one('buoy', 'play-bell', { gain: 0.35, ref: 28, roll: 0.3, range: 90 });
  one('count', 'play-taiko', { gain: 0.62 });
  one('go', 'play-go', { gain: 0.5 });
  one('stamp', 'play-taiko', { gain: 0.7 });
  one('plop', 'play-splash', { gain: 0.4, ref: 10, roll: 0.5 });
  one('nibble', 'play-nibble', { gain: 0.28 });
  one('bite', 'play-pon', { gain: 0.45 });
  one('catch', 'play-catch', { gain: 0.5 });
  one('splash', 'play-splash', { gain: 0.55, ref: 14, roll: 0.45, range: 50 });
  one('fanfare', 'play-fanfare', { gain: 0.48 });
  one('firework', 'play-firework', { gain: 0.42, ref: 80, roll: 0.2, range: 400 });
  one('tap', 'play-pon', { gain: 0.22 });
  one('blip', 'play-blip', { gain: 0.32, range: 30 });
  one('whoosh', 'play-whoosh', { gain: 0.4 });

  // Two bells a fifth apart, retriggered. setGain is the loudness (nearest
  // charm, squared falloff). The engine's distance curve stays gentle.
  audio.registerLoop('play-shimmer', {
    ref: 16, roll: 0.25, range: 48,
    build(I, now, tools) {
      const strike = () => {
        if (I.h.stopped || !tools.ac) return;
        const t = tools.ac.currentTime;
        tools.playSrc('play-bell-lo', I.in, t, 0.45, 1, 1.2);
        tools.playSrc('play-bell-hi', I.in, t, 0.32, 1, 1.2);
      };
      strike();
      const id = setInterval(strike, 1700);
      I.stop = () => clearInterval(id);
    },
  });
}

function live() {
  return !!(audio && audio.ready && !audio.muted);
}

export const sfx = {
  play(name, o = {}) {
    if (!live()) return;
    const opt = {};
    if (o.pitch) opt.pitch = o.pitch;
    if (o.gain != null) opt.volume = o.gain;
    if (o.pan) opt.pan = o.pan;
    if (o.position) opt.position = o.position;
    try { audio.play('play-' + name, opt); } catch (e) { /* a missing buffer stays quiet */ }
  },
  /** `{ setGain(g), stop() }`. Gain 0 stops the voice so a silent loop isn't still chiming. */
  loop(name, o = {}) {
    let handle = null;
    let stopped = false;
    const pos = o.position || null;
    const start = (g) => {
      if (!live()) return;
      try { handle = audio.loop('play-' + name, { volume: g, position: pos }); } catch (e) { handle = null; }
    };
    if ((Number(o.gain) || 0) > 0.0008) start(o.gain);
    return {
      setGain(g) {
        if (stopped) return;
        const v = Math.max(0, Number(g) || 0);
        if (v <= 0.0008) { this.stop(); return; }
        if (!handle) start(v);
        else { try { handle.setVolume(v, 0.08); } catch (e) { /* */ } }
      },
      stop() {
        if (stopped) return;
        stopped = true;
        try { handle?.stop(); } catch (e) { /* */ }
        handle = null;
      },
    };
  },
};
