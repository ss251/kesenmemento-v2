// [ui-c] iPhone survival: what the page does when the phone takes its WebGL context away (mobile review F10 / T2, UI review row 10).
//
// iOS Safari drops a tab's WebGL context under memory pressure and after long backgrounding (lock the phone, switch app, come back).
// Three re-creates its own state on `webglcontextrestored`, but the phone tier frees every static batch's CPU arrays once they are on the
// GPU (main.js releaseOnUpload), so nothing can be re-uploaded. Observed with WEBGL_lose_context on the phone tier: the scene stays a flat
// pale blue and the frame loop throws on every frame after the restore. The only recovery is a reload. So:
//
//   lost      the frame loop stops drawing; a card says 再読み込みします with a 44 px button; the pose is saved (core/pose.js capturePose)
//   restored  reload at once (or after RESTORE_WAIT_MS of a visible page, if the browser never gives the context back)
//   a reload loop is refused: LOOP_MAX automatic reloads inside LOOP_WINDOW_MS leave the card up with its button ("manual")
//   next load takeResume(): the camera, the time of day and the season of the saved pose are put back, once, within MAX_AGE_MS
//
// lossStep() is the state machine as a pure reducer (test/survive.test.js drives it); createLossGuard() wires it to the canvas, the
// page's visibility, sessionStorage, a timer and the card; createLostCard() is the card (built on the first loss: nothing in the page
// and no CSS until then). Nothing here touches Math.random or draws anything, and main.js does not create the guard in a ?shot=1 frame.
import { poseProblems, poseToCamArgs, presetHours, PRESET_IDS, SEASON_IDS } from './pose.js';

export const SURVIVE = Object.freeze({
  RESTORE_WAIT_MS: 4000,     // a visible page that has not been given its context back after this long reloads anyway
  LOOP_WINDOW_MS: 120000,    // at most LOOP_MAX automatic reloads in this window; then the card waits for the visitor's tap
  LOOP_MAX: 2,
  MAX_AGE_MS: 300000,        // a saved pose older than five minutes is not worth restoring
  RESUME_KEY: 'klc.resume',  // sessionStorage: { v: 1, why, at, pose }  (the pose of core/pose.js capturePose)
  RELOADS_KEY: 'klc.reloads',// sessionStorage: [ms, ...] timestamps of the automatic reloads
});

// ------------------------------------------------------------------ the state machine
export const initialLoss = (visible = true) => ({ phase: 'ok', visible, count: 0, lostAt: 0, restored: false });

/** May the page reload by itself now? Fewer than LOOP_MAX automatic reloads in the last LOOP_WINDOW_MS. */
export const mayAutoReload = (reloads, t) => (reloads || []).filter((r) => Number.isFinite(r) && t - r >= 0 && t - r < SURVIVE.LOOP_WINDOW_MS).length < SURVIVE.LOOP_MAX;

/**
 * One step of the machine: (state, event, opts) -> { s: nextState, fx: [effects] }.
 *   phases   ok | lost (waiting for the restore) | manual (an automatic reload was refused; the card waits for a tap) | reloading
 *   events   { type: 'lost' | 'restored' | 'visible' | 'hidden' | 'tick' | 'tap', t: ms }   opts.reloads = timestamps of past automatic reloads
 *   effects  'save' (store the pose), 'arm' / 'disarm' (the restore-wait timer), 'stamp' (record an automatic reload), 'reload'
 * The card is drawn from the state after every event (createLossGuard calls ui.render(s)); only actions are effects.
 */
export function lossStep(s, ev, o = {}) {
  const t = ev.t ?? 0, fx = [];
  const same = { s, fx };
  /** a restore (or the wait running out) on a lost page: reload, unless that would loop */
  const recover = () => {
    if (mayAutoReload(o.reloads, t)) { fx.push('disarm', 'stamp', 'reload'); return { s: { ...s, phase: 'reloading', restored: ev.type === 'restored' || s.restored }, fx }; }
    fx.push('disarm');
    return { s: { ...s, phase: 'manual', restored: ev.type === 'restored' || s.restored }, fx };
  };
  switch (ev.type) {
    case 'lost':
      if (s.phase === 'reloading') return same;
      if (s.phase === 'ok') { fx.push('save'); if (s.visible) fx.push('arm'); return { s: { ...s, phase: 'lost', count: s.count + 1, lostAt: t, restored: false }, fx }; }
      return { s: { ...s, count: s.count + 1, restored: false }, fx };   // lost again while waiting / after giving up: counted, nothing else
    case 'restored':
      if (s.phase === 'lost') return recover();
      if (s.phase === 'manual') return { s: { ...s, restored: true }, fx };
      return same;                                                    // ok: a restore we never saw the loss of; reloading: already on its way
    case 'tick':
      return s.phase === 'lost' && s.visible ? recover() : same;
    case 'visible':
      if (s.visible && s.phase !== 'lost') return same;
      if (s.phase === 'lost') fx.push('arm');                         // the wait starts when the visitor can see the page again
      return { s: { ...s, visible: true }, fx };
    case 'hidden':
      if (s.phase === 'lost') fx.push('disarm');
      return { s: { ...s, visible: false }, fx };
    case 'tap':                                                       // the button: always reloads (a human press is not a loop), even if the first reload did not take
      if (s.phase === 'ok') return same;
      fx.push('disarm', 'reload');
      return { s: { ...s, phase: 'reloading' }, fx };
    default:
      return same;
  }
}

// ------------------------------------------------------------------ the runtime
/** sessionStorage behind try/catch (private mode, blocked storage): get / set / remove never throw. */
export function sessionStore(win = typeof window !== 'undefined' ? window : null) {
  const st = () => { try { return win?.sessionStorage || null; } catch { return null; } };
  return {
    get(k) { try { return st()?.getItem(k) ?? null; } catch { return null; } },
    set(k, v) { try { const s = st(); if (!s) return false; s.setItem(k, v); return true; } catch { return false; } },
    remove(k) { try { st()?.removeItem(k); } catch { /* nothing to remove */ } },
  };
}

/**
 * Wire the machine to a page. o = { canvas, doc, store, reload, capture, ui, now, setTimer, clearTimer }: canvas and doc are event
 * targets (the doc has visibilityState), store = sessionStore(), reload() reloads the page, capture() -> the pose to save (or null),
 * ui = { render(state) }. Returns { phase, lost, count, state, tap(), dispose() }.
 */
export function createLossGuard(o) {
  const { canvas, doc, store, reload, capture, ui } = o;
  const now = o.now || (() => Date.now()), setTimer = o.setTimer || ((f, ms) => setTimeout(f, ms)), clearTimer = o.clearTimer || ((id) => clearTimeout(id));
  let s = initialLoss(doc?.visibilityState !== 'hidden'), timer = null;
  const readReloads = () => { try { const a = JSON.parse(store?.get(SURVIVE.RELOADS_KEY) || '[]'); return Array.isArray(a) ? a.filter(Number.isFinite) : []; } catch { return []; } };
  function run(fxName, t) {
    switch (fxName) {
      case 'save':
        try { const pose = capture?.(); if (pose) store?.set(SURVIVE.RESUME_KEY, JSON.stringify({ v: 1, why: 'webgl-context-lost', at: t, pose })); } catch (e) { /* a pose we cannot capture: the reload still helps */ }
        break;
      case 'arm': if (timer !== null) clearTimer(timer); timer = setTimer(() => { timer = null; dispatch('tick'); }, SURVIVE.RESTORE_WAIT_MS); break;
      case 'disarm': if (timer !== null) clearTimer(timer); timer = null; break;
      case 'stamp': try { store?.set(SURVIVE.RELOADS_KEY, JSON.stringify([...readReloads().filter((r) => t - r < SURVIVE.LOOP_WINDOW_MS), t])); } catch (e) { /* storage refused: the reload still happens */ } break;
      case 'reload': try { reload?.(); } catch (e) { try { console.warn('reload failed', e); } catch { /* no console */ } } break;
      default: break;
    }
  }
  function dispatch(type) {
    const t = now();
    const r = lossStep(s, { type, t }, { reloads: readReloads() });
    s = r.s;
    for (const f of r.fx) run(f, t);
    try { ui?.render?.(s); } catch (e) { /* the card is a courtesy */ }
    return s;
  }
  const onLost = (e) => { try { e?.preventDefault?.(); } catch { /* not cancelable */ } dispatch('lost'); };   // preventDefault: without it the browser never restores the context
  const onRestored = () => dispatch('restored');
  const onVis = () => dispatch(doc?.visibilityState === 'hidden' ? 'hidden' : 'visible');
  canvas?.addEventListener?.('webglcontextlost', onLost, false);
  canvas?.addEventListener?.('webglcontextrestored', onRestored, false);
  doc?.addEventListener?.('visibilitychange', onVis);
  return {
    get phase() { return s.phase; }, get lost() { return s.phase !== 'ok'; }, get count() { return s.count; }, get state() { return { ...s }; },
    tap: () => dispatch('tap'),
    dispose() { if (timer !== null) clearTimer(timer); timer = null; canvas?.removeEventListener?.('webglcontextlost', onLost, false); canvas?.removeEventListener?.('webglcontextrestored', onRestored, false); doc?.removeEventListener?.('visibilitychange', onVis); },
  };
}

// ------------------------------------------------------------------ resume (the next load)
/**
 * Read and consume the saved record: { pose, why, ageMs }, or null (nothing saved, too old, not ours, or a pose that does not validate).
 * The record is removed whatever it holds, so a stale pose can never come back on a later reload.
 */
export function takeResume({ store, now = Date.now(), maxAge = SURVIVE.MAX_AGE_MS } = {}) {
  let raw = null;
  try { raw = store?.get(SURVIVE.RESUME_KEY); store?.remove?.(SURVIVE.RESUME_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const r = JSON.parse(raw);
    if (!r || r.v !== 1 || !Number.isFinite(r.at)) return null;
    const ageMs = now - r.at;
    if (ageMs < 0 || ageMs > maxAge) return null;
    if (poseProblems(r.pose).length) return null;
    return { pose: r.pose, why: String(r.why || ''), ageMs };
  } catch { return null; }
}

/** Where to put the camera for a saved pose: { walk, x, y, z, yaw, pitch } (the engine's yaw), or null for a mode that has no place to stand (the voyage, the car). */
export function resumeView(pose) {
  if (!pose || !['walk', 'fly', 'drone'].includes(pose.mode)) return null;
  const a = poseToCamArgs(pose);
  return { walk: pose.mode === 'walk', x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch };   // not a.fov: resize() owns the field of view
}

/** Put the player where resumeView says: on foot at the same ground spot, or in the air at the same height (setPose with a y is a free camera). */
export function placeCamera(player, v) {
  if (v.walk) { player.fly = false; player.setPose(v.x, v.z, v.yaw, v.pitch); } else player.setPose(v.x, v.z, v.yaw, v.pitch, v.y);
}

/** The time of day of a saved pose: { preset } for a preset id, { hours } for an off-preset clock 'HH:MM', or null. */
export function resumeClock(pose) {
  const tp = pose?.timePreset;
  if (PRESET_IDS.includes(tp)) return { preset: tp, hours: presetHours(tp) };
  const m = typeof tp === 'string' && tp.match(/^(\d{1,2}):(\d{2})$/);
  return m ? { hours: Number(m[1]) + Number(m[2]) / 60 } : null;
}
export const resumeSeason = (pose) => (SEASON_IDS.includes(pose?.season) ? pose.season : null);

// ------------------------------------------------------------------ the card
export const LOST_CARD_HTML = `<div class="c" lang="ja">
<h2><span data-p="lost">再読み込みします</span><span data-p="manual">表示が止まりました</span><span data-p="reloading">再読み込み中…</span></h2>
<p><span data-p="lost">画面の表示が一時的に止まりました。同じ場所から再開します。</span><span data-p="manual">自動の再読み込みを止めました。下のボタンを押してください。</span><span data-p="reloading">もうすぐ戻ります。</span>
<small><span data-p="lost">The picture paused. Reloading to pick up where you were.</span><span data-p="manual">Automatic reloading stopped. Tap the button to reload.</span><span data-p="reloading">Reloading…</span></small></p>
<button type="button" id="klc-lost-go">いますぐ再読み込み</button>
</div>`;

/** The card's CSS: sky-coloured veil, a paper card like the intro board, a 44 px button; no blur, no motion. Injected with the card. [ui-c2] z-index 90 (was 40): above the photo card (45), the report sheet (60) and the ship UI (40), below the ?dbg=1 strip (99): nothing may cover the card that says the page must reload. */
export const LOST_CARD_CSS = `#klc-lost{position:fixed;inset:0;z-index:90;display:grid;place-items:center;box-sizing:border-box;
padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
background:rgba(207,220,236,.94);color:#33304a;font-family:"Noto Sans JP","Yu Gothic UI","Hiragino Sans",sans-serif}
#klc-lost[hidden]{display:none}
#klc-lost .c{width:min(420px,100%);box-sizing:border-box;background:#fbf8f2;border-radius:12px;box-shadow:0 18px 50px rgba(51,48,74,.18),0 0 0 1px rgba(51,48,74,.08);padding:22px 20px 18px;display:grid;gap:12px;text-align:center}
#klc-lost h2{margin:0;font:900 22px/1.3 "Zen Maru Gothic","Noto Sans JP",sans-serif;color:#1f3a68}
#klc-lost p{margin:0;font:500 14px/1.6 "Noto Sans JP",sans-serif}
#klc-lost small{display:block;margin-top:4px;font:500 12px/1.5 "Noto Sans JP",sans-serif;color:#6d6a80}
#klc-lost button{justify-self:center;min-height:44px;padding:13px 22px;border:0;border-radius:999px;background:#1f3a68;color:#fff;font:700 16px/1 "Zen Maru Gothic","Noto Sans JP",sans-serif;cursor:pointer}
#klc-lost [data-p]{display:none}
#klc-lost[data-phase="lost"] [data-p="lost"],#klc-lost[data-phase="manual"] [data-p="manual"],#klc-lost[data-phase="reloading"] [data-p="reloading"]{display:inline}`;

/** The card, built on the first loss. render(state) shows it for any phase but ok (data-phase picks the words) and tags the body with klc-lost. */
export function createLostCard(doc, onTap) {
  let el = null;
  function build() {
    const st = doc.createElement('style'); st.id = 'klc-lost-css'; st.textContent = LOST_CARD_CSS; doc.head.appendChild(st);
    el = doc.createElement('div'); el.id = 'klc-lost'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-live', 'assertive');
    el.innerHTML = LOST_CARD_HTML;
    el.querySelector('button').addEventListener('click', () => onTap?.());
    doc.body.appendChild(el);
  }
  return {
    get el() { return el; },
    render(state) {
      if (state.phase === 'ok') { if (el) { el.hidden = true; doc.body.classList.remove('klc-lost'); } return; }
      if (!el) build();
      el.dataset.phase = state.phase; el.hidden = false; doc.body.classList.add('klc-lost');
      try { el.querySelector('button').focus({ preventScroll: true }); } catch { /* not focusable yet */ }
    },
  };
}
