// One mount for the garage, the night race and the drift meter. Idempotent: the kit may call it once.
import { playCost } from '../kit/runtime.js';
import { createDriftMeter, stepDrift } from './drift.js';
import { raceModeSpec } from './mode.js';
import { mountGarage } from '../garage/index.js';
import { mountRace } from '../race/index.js';
import { minatoCourse } from '../race/course.js';

let mounted = false;

export function mount(ctx, kit) {
  if (mounted) return ctx?.services?.playCar || null;
  const drive = ctx?.services?.explore?.drive;
  if (!ctx || !kit || !drive) return null;
  mounted = true;

  const api = { quiet: false, unlock: () => false, cost: playCost };
  ctx.services.playCar = api;
  if (typeof window !== 'undefined') window.__playCar = api;

  const race = mountRace(ctx, kit, drive);
  const garage = mountGarage(ctx, kit, drive, () => race.goToLine());
  api.race = race;
  api.garage = garage;
  api.unlock = (id) => garage.unlock(id);
  const mode = raceModeSpec({
    store: kit.store,
    garage: !!garage,
    start: () => race.start(),
  });
  mode.prepare = () => race.prepare();   // [mobile-play] the arches are built behind the hub's title card
  api.mode = mode;
  if (typeof kit.registerMode === 'function') kit.registerMode(mode);

  const meter = createDriftMeter();
  const driftEl = document.createElement('div');
  driftEl.id = 'klc-drift';
  driftEl.hidden = true;
  const driftNum = document.createElement('b');
  driftNum.textContent = '0';
  const driftTrack = document.createElement('span');
  driftTrack.className = 'track';
  const driftBar = document.createElement('i');
  driftTrack.append(driftBar);
  driftEl.append(driftNum, driftTrack);
  const driftStyle = document.createElement('style');
  driftStyle.textContent = `#klc-drift { position: fixed; left: 16px; top: calc(156px + env(safe-area-inset-top, 0px)); z-index: 8;
  width: 132px; padding: 8px 12px 10px; pointer-events: none; border-radius: 16px;
  background: rgba(34, 58, 112, 0.88); color: #FBFAF5;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.7), 0 0 0 1px rgba(23,24,75,.4), 0 4px 12px rgba(23,24,75,.35);
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; }
#klc-drift[hidden] { display: none !important; }
#klc-drift b { display: block; margin: 0 0 6px; color: #FBFAF5; font: 800 22px/1 "Zen Maru Gothic", sans-serif;
  letter-spacing: 0.04em; font-variant-numeric: tabular-nums; }
#klc-drift .track { display: block; height: 8px; border-radius: 999px; background: rgba(251,250,245,.28); overflow: hidden; }
#klc-drift i { display: block; height: 100%; width: 100%; transform-origin: left center; transform: scaleX(0); background: #F8B500; }
@media (max-width: 720px) {
  #klc-drift { left: 12px; top: calc(120px + env(safe-area-inset-top, 0px)); width: 116px; }
}`;
  document.head.appendChild(driftStyle);
  document.body.appendChild(driftEl);
  let driftShown = -1;
  let driftHold = 0;
  let driftOpen = false;
  let driftFrozen = 0;
  drive.onShift(() => { try { kit.sfx.play('tap', { pitch: 5, gain: 0.7 }); } catch { /* muted */ } });
  kit.onPlayTick((dt) => {
    if (!drive.active) {
      if (driftOpen) { driftOpen = false; driftEl.hidden = true; }
      return;
    }
    const d = stepDrift(meter, !!drive.state.skid, drive.state.driftStep || 0, dt);
    if (d.toast) { driftHold = 1.3; driftFrozen = Math.round(d.score); }
    else if (!d.live) driftHold = driftHold > 0 ? driftHold - dt : 0;
    const show = d.live || driftHold > 0;
    const raw = d.live ? d.score : driftFrozen;
    const score = Math.round(raw * 10);
    if (show !== driftOpen || (show && score !== driftShown)) {
      driftOpen = show;
      driftShown = score;
      driftEl.hidden = !show;
      if (show) {
        driftNum.textContent = String(score);
        const fill = raw > 4 ? 1 : raw / 4;
        driftBar.style.transform = 'scaleX(' + fill + ')';
      }
    }
    if (!d.toast) return;
    const text = d.combo > 1 ? kit.ui.t('play.car.nice') + ' ×' + d.combo : kit.ui.t('play.car.nice');
    kit.ui.toast(text, { big: true });
    kit.sfx.play('combo');
  });

  let orbitYaw = 0.6;
  let garageOn = false;
  let sheetEl = null;
  ctx.onUpdate((dt) => {
    if (!sheetEl) sheetEl = document.querySelector('#klc-play .sheet');
    const open = !!(sheetEl && !sheetEl.hidden);
    if (!open) {
      if (garageOn) { garageOn = false; document.getElementById('klc-play')?.classList.remove('klc-garage'); }
      return;
    }
    const tab = document.querySelector('#klc-play .tabs button[aria-selected="true"]');
    const want = !!(tab && tab.dataset.tab === 'garage' && drive.active);
    if (want !== garageOn) {
      garageOn = want;
      document.getElementById('klc-play')?.classList.toggle('klc-garage', want);
    }
    if (!want) return;
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduce = false; }
    if (reduce) drive.lookOrbit(0.85, -0.12, 0.5);
    else {
      orbitYaw += Math.min(0.05, dt || 0) * 0.42;
      drive.lookOrbit(orbitYaw, -0.14, 0.5);
    }
  });

  let booted = false;
  ctx.onUpdate(() => {
    if (booted) return;
    const body = typeof document !== 'undefined' ? document.body : null;
    if (!body?.classList.contains('playing') && !body?.classList.contains('shot')) return;
    if (body.classList.contains('shot')) body.classList.add('playing');
    booted = true;
    let q = '';
    try { q = new URLSearchParams(location.search).get('car') || ''; } catch { q = ''; }
    if (q !== 'garage' && q !== 'race' && q !== 'drift' && q !== 'finish') return;
    const c = minatoCourse();
    const ok = drive.enter({ x: c.start[0], z: c.start[1], yaw: c.startYaw });
    if (ok) drive.place(0);
    if (q === 'garage') garage.open();
    if (q === 'race') race.start();
    if (q === 'finish') {
      document.body.classList.add('klc-racing');
      race.holdNight();
      kit.ui.resultCard({
        title: kit.ui.t('play.car.raceTitle'),
        medal: 'gold',
        timeMs: 148200,
        isBest: true,
        onRetry() {},
        onQuit() {},
      });
    }
  });

  return api;
}
