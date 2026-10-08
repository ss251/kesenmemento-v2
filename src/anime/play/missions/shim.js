// [play:missions] A local stand-in for KIT-API.md until src/anime/play/kit/index.js exists.
// Do not import that file from here. The bundler fails the build when the module is missing.
// Sound goes through ctx.audio and stays silent while it is muted or not running.

const KEY = 'klc.play.v1';

function blank() {
  return { v: 1, katsuo: { found: {} }, courses: {}, fish: {}, meta: {}, quests: {} };
}

function clone(o) {
  try { return JSON.parse(JSON.stringify(o ?? {})); } catch { return {}; }
}

function memory() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function storageOf(given) {
  if (given) return given;
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* private */ }
  return memory();
}

/** A short wood blip. No-op when the town audio is muted or has not been started. */
function tone(ctx, freq, when, dur, gain) {
  const audio = ctx?.audio;
  if (!audio || audio.muted) return;
  const ac = audio.context;
  if (!ac || ac.state !== 'running') return;
  try {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ac.destination);
    const t = when ?? ac.currentTime;
    g.gain.setValueAtTime(Math.max(0.0001, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* context gone */ }
}

/**
 * @param {object} ctx game context (audio, services, player, onUpdate, onStep)
 * @param {{ storage?: Storage, now?: () => number }} [opts]
 */
export function createShim(ctx, opts = {}) {
  const storage = storageOf(opts.storage);
  const listeners = Object.create(null);
  let data = load();

  function load() {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return blank();
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return blank();
      const b = blank();
      for (const k in b) if (o[k] && typeof o[k] === 'object') b[k] = o[k];
      b.v = 1;
      return b;
    } catch { return blank(); }
  }
  function save() {
    try { storage.setItem(KEY, JSON.stringify(data)); } catch { /* quota: the memory copy still holds */ }
  }
  function emit(section) {
    const list = listeners[section];
    if (!list || !list.length) return;
    const snap = clone(data[section]);
    for (let i = 0; i < list.length; i++) {
      try { list[i](snap); } catch { /* a listener must not break the save */ }
    }
  }

  const store = {
    get(section) {
      if (!data[section] || typeof data[section] !== 'object') data[section] = {};
      return clone(data[section]);
    },
    update(section, fn) {
      if (!data[section] || typeof data[section] !== 'object') data[section] = {};
      const draft = clone(data[section]);
      const ret = fn(draft);
      data[section] = ret && typeof ret === 'object' ? ret : draft;
      save();
      emit(section);
    },
    on(section, fn) {
      (listeners[section] ||= []).push(fn);
      return () => {
        const a = listeners[section];
        if (!a) return;
        const i = a.indexOf(fn);
        if (i >= 0) a.splice(i, 1);
      };
    },
    reset() {
      data = blank();
      try { storage.removeItem(KEY); } catch { /* already gone */ }
      for (const k in data) emit(k);
    },
  };

  const sfx = {
    play(name, o = {}) {
      const gain = o.gain == null ? 0.08 : o.gain * 0.08;
      const pitch = o.pitch || 0;
      const ac = ctx?.audio?.context;
      const t0 = ac?.currentTime || 0;
      const f = (n) => n * (2 ** (pitch / 12));
      if (name === 'fanfare') {
        tone(ctx, f(523), t0, 0.18, gain);
        tone(ctx, f(659), t0 + 0.09, 0.2, gain);
        tone(ctx, f(784), t0 + 0.18, 0.32, gain * 1.1);
        return;
      }
      if (name === 'stamp') { tone(ctx, f(196), t0, 0.12, gain * 1.4); return; }
      if (name === 'tap') { tone(ctx, f(880), t0, 0.05, gain); }
    },
  };

  const fx = { burst() {}, ripple() {}, flyToHud() {}, fireworks() {} };
  const tabs = [];
  const ui = {
    counter() { return { set() {}, bump() {} }; },
    toast() {},
    prompt() { return { hide() {} }; },
    countdown() {},
    timer() { return { start() {}, stop: () => 0, splitAt() {}, hide() {} }; },
    edgeArrow() { return { hide() {} }; },
    resultCard() {},
    card() {},
    notebook: {
      register(tabId, spec) {
        const tab = { id: tabId, label: spec?.label || tabId, render: spec?.render };
        tabs.push(tab);
        return () => {
          const i = tabs.indexOf(tab);
          if (i >= 0) tabs.splice(i, 1);
        };
      },
      tabs() { return tabs.slice(); },
    },
  };

  function onPlayTick(fn) {
    let on = true;
    const wrap = (dt, t) => { if (on) fn(dt, t); };
    if (ctx?.onStep) ctx.onStep(wrap);
    else if (ctx?.onUpdate) ctx.onUpdate(wrap);
    return () => { on = false; };
  }

  function playMode() {
    const s = ctx?.services || {};
    if (ctx?.planet?.active) return 'menu';
    if (s.explore?.drive?.active || s.drive?.active) return 'drive';
    if (s.sail?.active || s.ship?.voyage?.active) return 'sail';
    if (s.photo?.active) return 'photo';
    if (ctx?.playerObj?.fly) return 'fly';
    const at = s.explore?.interiors?.at;
    const p = ctx?.player?.position;
    if (typeof at === 'function' && p && at(p.x, p.y, p.z)) return 'interior';
    return 'walk';
  }

  function playerPos(out) {
    if (!out) return out;
    const s = ctx?.services || {};
    const drive = s.explore?.drive || s.drive;
    if (drive?.active && drive.state) {
      out.x = drive.state.x; out.y = drive.state.y || 0; out.z = drive.state.z;
      return out;
    }
    const sail = s.sail;
    if (sail?.active && sail.boat) {
      out.x = sail.boat.x; out.y = sail.boat.y || 0; out.z = sail.boat.z;
      return out;
    }
    const p = ctx?.player?.position;
    if (p) { out.x = p.x; out.y = p.y; out.z = p.z; }
    return out;
  }

  return { store, sfx, fx, ui, onPlayTick, playMode, playerPos, __shim: true };
}
