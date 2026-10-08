// [play:underwater] A local KIT-API stand-in. One-shots go through ctx.audio's context and honour mute.
// The splash of the leap is left bright. Everything else sits behind a low-pass while the camera is under.

const bag = Object.create(null);
const ears = new Set();

let filt = null;
function dest(ac, under) {
  if (!filt || filt.context !== ac) {
    filt = ac.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 0.7;
    filt.connect(ac.destination);
  }
  filt.frequency.value = under ? 700 : 18000;
  return filt;
}

export function shimUnder(on) {
  if (filt) filt.frequency.value = on ? 700 : 18000;
}

function tone(ctx, name) {
  const a = ctx.audio;
  if (!a || a.muted || !a.context) return;
  const ac = a.context;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  const bright = name === 'splash' || name === 'whoosh';
  o.connect(g);
  g.connect(bright ? ac.destination : dest(ac, false));
  if (name === 'splash') {
    o.type = 'triangle';
    o.frequency.setValueAtTime(480, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.32);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    o.start(t); o.stop(t + 0.48);
  } else if (name === 'stamp') {
    o.type = 'sine';
    o.frequency.setValueAtTime(92, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.28);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.start(t); o.stop(t + 0.44);
  } else if (name === 'whoosh') {
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(720, t + 0.22);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.start(t); o.stop(t + 0.36);
  } else {
    o.type = 'sine';
    o.frequency.setValueAtTime(520, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.start(t); o.stop(t + 0.14);
  }
}

/** kit-shaped object. hooks.burst(x, z) is the lane's own splash ring. */
export function shimKit(ctx, hooks = {}) {
  return {
    shim: true,
    store: {
      get: (k) => bag[k],
      update(k, fn) { const v = fn(bag[k]); bag[k] = v; for (const f of ears) f(k, v); return v; },
      on(fn) { ears.add(fn); return () => ears.delete(fn); },
      reset() { for (const k of Object.keys(bag)) delete bag[k]; },
    },
    sfx: {
      play(name) { try { tone(ctx, name); } catch (e) { /* no audio yet */ } },
      loop() { return { stop() {} }; },
    },
    fx: {
      burst(_pos, _kind) {},
      ripple(pos) { if (pos) hooks.burst?.(pos.x, pos.z); },
      flyToHud() {},
      fireworks() {},
    },
    ui: {
      toast(msg) { hooks.toast?.(msg); },
      prompt() {},
      counter() { return { set() {} }; },
      countdown() {},
      timer() { return { set() {} }; },
      edgeArrow() {},
      resultCard() {},
      card() {},
      notebook: {
        register(id, tab) { hooks.notebook?.(id, tab); },
      },
    },
  };
}
