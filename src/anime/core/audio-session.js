// [ui-c] Web Audio on an iPhone (mobile review F12 / T6, UI review row 10): sound with the ring/silent switch on, and sound back after an interruption.
//
//   * The ring/silent switch mutes Web Audio on iOS unless the page's audio session is "playback". Where Safari has the Audio Session
//     API (navigator.audioSession, iOS 16.4+), `type = 'playback'` is all it takes. On an older iOS the old trick is a silent looping
//     <audio> element started from a touch (HTMLMediaElement playback uses the playback category); it is used only on an iPhone / iPad
//     whose Safari lacks the API, and paused whenever the sound is muted or the page is hidden.
//   * After an interruption (a call, Siri, the lock screen) the AudioContext is "interrupted" or "suspended" and Safari only lets it
//     resume from a user gesture. audio.js resumed it on visibilitychange and on the mute toggle, neither of which is a gesture after a
//     call. So every touchend / pointerup / click / keydown now tries again, until the context runs: a touch brings the sound back.
//
// Trade-off to know about: a "playback" session interrupts other apps' audio (a song playing in the background stops) while this page
// makes sound; the page suspends its context when it is hidden or muted, which releases the session.
// Untested on a device (headless Chrome has neither the silent switch nor audioSession): test/audio-session.test.js drives it with fakes;
// the phone check is on the Friday list (the UI round notes (ui-c, not included)).
//
//   const s = createAudioSession({ getContext, isMuted, isHidden })   s.apply() before the AudioContext is created, s.arm() once, s.sync() on mute
//   s.stats -> { type, supported, fallback, resumes, armed, error }

export const GESTURES = ['touchend', 'pointerup', 'click', 'keydown'];

/** A silent mono 16-bit PCM WAV (the older-iOS fallback's source). */
export function silentWavBytes(ms = 120, rate = 8000) {
  const n = Math.max(1, Math.round(rate * ms / 1000)), data = n * 2, b = new Uint8Array(44 + data), v = new DataView(b.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + data, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, data, true);
  return b;
}
export function silentWavUri(ms, rate) {
  const b = silentWavBytes(ms, rate); let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return 'data:audio/wav;base64,' + btoa(s);
}

/** An iPhone, iPod or iPad (including an iPad that asks for the desktop site: Macintosh with touch points). */
export const isIOS = (nav) => { const ua = nav?.userAgent || ''; return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints || 0) > 1); };

/**
 * env = { nav, doc, win, getContext, isMuted, isHidden, makeAudio } (every one injectable; the defaults are the page's own).
 * getContext() -> the AudioContext or null (read lazily, so arm() may run before the context exists).
 */
export function createAudioSession(env = {}) {
  const nav = env.nav !== undefined ? env.nav : typeof navigator !== 'undefined' ? navigator : null;
  const doc = env.doc !== undefined ? env.doc : typeof document !== 'undefined' ? document : null;
  const win = env.win !== undefined ? env.win : typeof window !== 'undefined' ? window : null;
  const getContext = env.getContext || (() => null), isMuted = env.isMuted || (() => false);
  const isHidden = env.isHidden || (() => doc?.visibilityState === 'hidden');
  const makeAudio = env.makeAudio || (() => (typeof Audio !== 'undefined' ? new Audio() : null));
  const stats = { type: null, supported: false, fallback: false, resumes: 0, armed: false, error: null };
  let silent = null;
  const wantSound = () => !isMuted() && !isHidden();

  /** Set the audio session to playback (call before the AudioContext is created, from the gesture that starts the sound). */
  function apply() {
    try {
      const s = nav?.audioSession;
      if (s) { stats.supported = true; if (s.type !== 'playback') s.type = 'playback'; stats.type = s.type; return stats.type; }
    } catch (e) { stats.error = String(e?.message || e); }
    if (isIOS(nav)) startSilent();
    return stats.type;
  }
  function startSilent() {
    if (silent) return;
    try {
      const a = makeAudio(); if (!a) return;
      a.setAttribute?.('x-webkit-airplay', 'deny'); a.setAttribute?.('playsinline', '');
      a.loop = true; a.preload = 'auto'; a.controls = false; a.disableRemotePlayback = true; a.src = silentWavUri();
      silent = a; stats.fallback = true; sync();
    } catch (e) { stats.error = String(e?.message || e); }
  }
  /** The silent element (older iOS only) plays while there is sound to hear, and not otherwise. */
  function sync() {
    if (!silent) return;
    try {
      if (wantSound()) { if (silent.paused) { const p = silent.play(); p?.catch?.(() => {}); } }
      else if (!silent.paused) silent.pause();
    } catch (e) { stats.error = String(e?.message || e); }
  }
  /** Try to bring the context back (a call, Siri or the lock screen leaves it interrupted or suspended). Returns whether a resume was attempted. */
  function resume() {
    const ac = getContext();
    if (!ac || ac.state === 'running' || ac.state === 'closed' || !wantSound()) return false;
    stats.resumes++;
    try { const p = ac.resume(); p?.catch?.(() => {}); } catch (e) { stats.error = String(e?.message || e); }
    return true;
  }
  function onGesture() {
    try { const s = nav?.audioSession; if (s && s.type !== 'playback') { s.type = 'playback'; stats.type = s.type; } } catch (e) { /* the session is read-only here */ }
    resume(); sync();
  }
  /** Listen for touches (capture, passive: the touch pad's own handlers cannot stop them) and for the page coming back from the cache. */
  function arm() {
    if (stats.armed || !doc?.addEventListener) return;
    stats.armed = true;
    for (const t of GESTURES) doc.addEventListener(t, onGesture, { capture: true, passive: true });
    win?.addEventListener?.('pageshow', onGesture);
  }
  function disarm() {
    if (!stats.armed) return;
    stats.armed = false;
    for (const t of GESTURES) doc.removeEventListener?.(t, onGesture, { capture: true });
    win?.removeEventListener?.('pageshow', onGesture);
  }
  return { apply, arm, disarm, resume, sync, stats, get silent() { return silent; } };
}
