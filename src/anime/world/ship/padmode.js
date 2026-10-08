// [ship:pad] 第一昭福丸 on the touch pad (ui/touchpad.js, docs/MOBILE-CONTROLS.md "Registering a mode").
//
//   Mode 'sail': the pad's analog stick is the helm (up / down = the engine telegraph, which stays where you leave it; left / right =
//   the rudder, back to midships when released: explore/sail.js reads pad.move), a drag on the right looks around the chase camera
//   (player.lookSink, set by sail.enter), and four buttons: 停止 (X, the big one), 自動操船 (P, a toggle that follows the autopilot),
//   4× (hold: Shift, the time compression) and 町へ戻る (Esc: leaves the voyage). Labels are data/ship/i18n.json (ship.pad.*, ship.btn.exit).
//
//   While the voyage runs the pad is in mode 'sail' (setMode('sail')); when it ends, setMode(null) hands the buttons back to walk / fly /
//   drive. The stick and the buttons mean something only at the helm (the sail mode, Act 1's transit): in every other beat (the
//   berth, the send-off, the ocean, the haul with its キープ / 放流 choices, the chain cards, the homecoming, the final card) the voyage
//   UI owns the bottom of the screen, so the pad is hidden with pad.suppress and nothing of it can sit on those panels.
//
//   const sync = mountSailPad(ctx, { sail, voyage })   sync.step()  (also run every frame by ctx.onUpdate)   sync.spec
import DATA from '../../../../data/ship/i18n.json';

/** Card-only beats (no helm, no ocean scene behind a bottom panel): the chain cards and the final card. */
export const CARD_STATES = new Set(['TRANSSHIP_LAS_PALMAS', 'REEFER', 'SHIMIZU_WEIGH', 'CARD']);

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
/** Icons that are not in the pad's own set (touchpad.js ICONS): a ship's wheel, a stop square, fast forward, back to town. */
export const ICONS = {
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2.5"/>'),
  wheel: svg('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 4v5M12 15v5M4 12h5M15 12h5M6.3 6.3l3.2 3.2M14.5 14.5l3.2 3.2M17.7 6.3l-3.2 3.2M9.5 14.5l-3.2 3.2"/>'),
  fast: svg('<path d="M5 6l7 6-7 6zM13 6l7 6-7 6z"/>'),
  town: svg('<path d="M4 11.5L12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/><path d="M10.5 19v-5h3v5"/>'),
};

/** The label of a ship string as the { ja, en } the pad's text() takes. */
export const label = (key) => ({ ja: DATA.ja[key] ?? key, en: DATA.en[key] ?? DATA.ja[key] ?? key });

/** The mode spec for pad.registerMode (pure data plus the three game calls). `sail` is createSail's api, `voyage` createVoyage's. */
export function sailPadSpec({ sail, voyage }) {
  const helm = () => !!sail?.active;
  return {
    stick: 'analog',
    buttons: [
      { id: 'stop', label: label('ship.pad.stop'), icon: ICONS.stop, visible: helm, onDown: () => sail.stop() },
      { id: 'auto', label: label('ship.pad.auto'), icon: ICONS.wheel, toggle: true, visible: () => helm() && sail.boatKind !== 'katsuo', onDown: (pad, on) => sail.setAutopilot(!!on) },
      { id: 'x4', label: label('ship.pad.x4'), icon: ICONS.fast, hold: true, visible: helm, onDown: () => sail.speed(true), onUp: () => sail.speed(false) },
      { id: 'home', label: label('ship.btn.exit'), icon: ICONS.town, onDown: () => { if (voyage?.active) voyage.exit(); else sail?.exit?.(); } },
    ],
    onExit: () => sail?.speed?.(false),
  };
}

/**
 * Keep the pad in step with the voyage. The pad is made after the world modules (main.js), so it is looked up lazily, once per frame, until it
 * appears; without one (desktop, tests) nothing happens. Returns { step, spec, state }.
 */
export function mountSailPad(ctx, { sail, voyage }) {
  const spec = sailPadSpec({ sail, voyage });
  const st = { registered: false, voyage: false, helm: false, beat: false, card: false };
  function step() {
    const pad = ctx.pad;
    if (!pad || typeof pad.registerMode !== 'function' || !voyage) return;
    if (!st.registered) { try { pad.registerMode('sail', spec); st.registered = true; } catch (e) { console.error('[ship] pad.registerMode', e); st.registered = true; return; } }
    const on = !!voyage.active;
    // 第五凪丸 keeps her own pad modes (play/ippon). This pad stays with 第一昭福丸.
    const mode = on ? 'sail' : null;
    if (st.mode !== mode) {
      if (!(st.mode === undefined && mode === null)) { try { pad.setMode(mode); } catch (e) { console.error('[ship] pad.setMode', e); } }
      st.mode = mode;
    }
    st.voyage = on;
    const helm = on && !!sail?.active, beat = on && !helm, card = on && CARD_STATES.has(voyage.state);
    if (beat !== st.beat) { st.beat = beat; pad.suppress?.('ship-beat', beat); }   // not at the helm: the voyage UI owns the bottom of the screen
    if (card !== st.card) { st.card = card; pad.suppress?.('ship-card', card); }   // the chain cards and the final card: no pad at all
    st.helm = helm;
    if (helm && sail.state) pad.setToggle?.('auto', !!sail.state.autopilot);
  }
  ctx.onUpdate?.(() => step());
  return { step, spec, state: st };
}
