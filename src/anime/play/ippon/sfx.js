// [play:ippon] Cues through the play kit, which plays on ctx.audio and honours mute.
// The kit has no thud, flap, hiss or bird: those map onto plop, whoosh and buoy.
// No voices. The research found no deck chant.

import { sfx as kit } from '../kit/sfx.js';

function play(name, o) {
  try { kit.play(name, o); } catch { /* audio not started, or muted */ }
}

export function createSfx() {
  return {
    cue() { play('bite', { pitch: 3, gain: 0.7 }); },
    splash() { play('splash', { pitch: 1 }); },
    thud() { play('plop', { pitch: -5, gain: 0.8 }); },
    flap() { play('whoosh', { pitch: 4, gain: 0.45 }); },
    miss() { play('tap', { pitch: -3, gain: 0.4 }); },
    set() { play('bite', { pitch: 6 }); },
    ice() { play('tap', { pitch: 8, gain: 0.28 }); },
    bell() { play('fanfare'); },
    chime(combo) { play('chime', { pitch: Math.max(0, Math.min(14, ((combo | 0) - 1) * 2)) }); },
    hiss() { play('whoosh', { pitch: -8, gain: 0.32 }); },
    bird() { play('buoy', { pitch: 7, gain: 0.38 }); },
    ready() { play('chime', { pitch: -4, gain: 0.45 }); },
    horn() { play('buoy', { pitch: -10, gain: 0.85 }); play('whoosh', { pitch: -6, gain: 0.4 }); },
  };
}
