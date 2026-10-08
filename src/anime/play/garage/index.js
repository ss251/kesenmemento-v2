// The notebook's ガレージ tab. Quest rewards are granted with unlock(id); the missions lane uses QUEST_GARAGE_IDS.
import { PAINTS, LIVERIES, WHEELS, ROOFS, PLATES, paintById, itemUnlocked, grantUnlock, QUEST_GARAGE_IDS } from './catalog.js';
import { dressCar } from './apply.js';
import { readCar, writeCar } from '../car/save.js';

export { QUEST_GARAGE_IDS, grantUnlock };

const CSS = `
#klc-play .car-g { display: grid; gap: 4px; }
#klc-play .car-g h3 { margin: 10px 0 6px; font: 700 13px/1.3 var(--k-round); color: var(--k-navy); }
#klc-play .car-g .sw { display: flex; flex-wrap: wrap; gap: 8px; }
#klc-play .car-g .sw button { width: 44px; height: 44px; border-radius: 12px; box-shadow: inset 0 0 0 1px rgba(23,24,75,.18); }
#klc-play .car-g .sw button[aria-pressed="true"] { box-shadow: 0 0 0 2px #fff, 0 0 0 5px #00838F; }
#klc-play .car-g .sw button.lock, #klc-play .car-g .ch button.lock { position: relative; opacity: 1; }
#klc-play .car-g button.lock::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: rgba(23,24,75,.42); }
#klc-play .car-g button.lock span { position: absolute; z-index: 1; inset: 0; display: grid; place-items: center; font-size: 16px; }
#klc-play .car-g .ch { display: flex; flex-wrap: wrap; gap: 8px; }
#klc-play .car-g .ch button { position: relative; border-radius: 999px; padding: 0 14px; background: rgba(34,58,112,.08); font: 700 13px/1 var(--k-round); color: var(--k-navy); }
#klc-play .car-g .ch button[aria-pressed="true"] { background: var(--k-navy); color: #fff; }
#klc-play .car-g .blurb { margin: 8px 0 0; font-size: 13px; line-height: 1.6; color: #55596f; }
#klc-play .sheet[hidden], #klc-play .veil[hidden] { display: none !important; }
@media (min-width: 721px) {
  #klc-play.klc-garage .sheet { place-items: center end; padding-right: 28px; background: rgba(23, 24, 75, 0.22); }
  #klc-play.klc-garage .sheet .panel { width: min(640px, 46vw); max-height: min(88vh, 860px); }
}
#klc-play .car-g .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; margin-top: 8px; }
#klc-play .car-g .row p { margin: 0; font-size: 13px; color: #55596f; }
#klc-play .car-g .row button { border-radius: 999px; padding: 0 16px; background: var(--k-navy); color: #fff; font: 700 14px/1 var(--k-round); }
#klc-play .car-g .race { width: 100%; margin-top: 12px; border-radius: 12px; background: #B7282E; color: #fff; font: 700 15px/1 var(--k-round); }
`;

let styled = false;
function styleOnce() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function mountGarage(ctx, kit, drive, onRace) {
  const { ui, sfx } = kit;
  const saved = readCar(kit.store);
  let look = saved.look;
  let unlocked = Object.assign({}, saved.unlocked);
  let assist = saved.assist !== false;
  drive.setAssist(assist);
  drive.setDress((g, live) => { try { dressCar(g, live); ctx.noOutline?.(g.getObjectByName('play-dress')); } catch (e) { console.error('[play:car] dress', e); } });
  drive.setLook({ color: paintById(look.paint).hex, ...look });

  function persist() {
    writeCar(kit.store, { look: { ...look }, assist, unlocked });
  }

  function choose(group, id) {
    const item = group.find((it) => it.id === id);
    if (!item || !itemUnlocked(item, unlocked)) return;
    if (group === PAINTS) look = { ...look, paint: id };
    if (group === LIVERIES) look = { ...look, livery: id };
    if (group === WHEELS) look = { ...look, wheel: id };
    if (group === ROOFS) look = { ...look, roof: id };
    if (group === PLATES) look = { ...look, plate: id };
    drive.setLook({ color: paintById(look.paint).hex, ...look });
    persist();
    sfx.play('tap');
    ui.notebook.refresh?.('garage');
  }

  function swatch(group, id, label, color) {
    const item = group.find((it) => it.id === id);
    const on = (group === PAINTS ? look.paint : group === LIVERIES ? look.livery : group === WHEELS ? look.wheel : group === ROOFS ? look.roof : look.plate) === id;
    const open = itemUnlocked(item, unlocked);
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', label);
    if (!open) {
      b.disabled = true;
      b.classList.add('lock');
      b.setAttribute('aria-label', label + ' ' + ui.t('play.car.locked'));
    }
    if (color) {
      b.style.background = color;
      if (!open) {
        const mark = document.createElement('span');
        mark.textContent = '🔒';
        mark.setAttribute('aria-hidden', 'true');
        b.append(mark);
      }
    } else b.textContent = open ? label : '🔒 ' + label;
    b.addEventListener('click', () => choose(group, id));
    return b;
  }

  function section(title, node) {
    const h = document.createElement('h3');
    h.textContent = title;
    const wrap = document.createElement('div');
    wrap.append(h, node);
    return wrap;
  }

  function nameOf(it) {
    if (it.ja) {
      const root = typeof document !== 'undefined' ? document.getElementById('klc-play') : null;
      return root?.lang === 'en' ? it.en : it.ja;
    }
    return ui.t(it.key);
  }

  function chips(group) {
    const row = document.createElement('div');
    row.className = 'ch';
    for (const it of group) row.append(swatch(group, it.id, nameOf(it), it.hex || null));
    return row;
  }

  function render(el) {
    styleOnce();
    el.replaceChildren();
    const root = document.createElement('div');
    root.className = 'car-g';
    const paints = document.createElement('div');
    paints.className = 'sw';
    for (const p of PAINTS) paints.append(swatch(PAINTS, p.id, nameOf(p), p.hex));
    root.append(
      section(ui.t('play.car.paint'), paints),
      section(ui.t('play.car.livery'), chips(LIVERIES)),
      section(ui.t('play.car.wheels'), chips(WHEELS)),
      section(ui.t('play.car.roof'), chips(ROOFS)),
      section(ui.t('play.car.plate'), chips(PLATES)),
    );
    const row = document.createElement('div');
    row.className = 'row';
    const copy = document.createElement('div');
    const h = document.createElement('h3');
    h.textContent = ui.t('play.car.assist');
    h.style.margin = '0';
    const p = document.createElement('p');
    p.textContent = ui.t('play.car.assistHint');
    copy.append(h, p);
    const tog = document.createElement('button');
    tog.type = 'button';
    tog.setAttribute('aria-pressed', assist ? 'true' : 'false');
    tog.textContent = assist ? ui.t('play.car.on') : ui.t('play.car.off');
    tog.addEventListener('click', () => {
      assist = !assist;
      drive.setAssist(assist);
      persist();
      sfx.play('tap');
      ui.notebook.refresh?.('garage');
    });
    row.append(copy, tog);
    root.append(row);
    const note = document.createElement('p');
    note.textContent = ui.t('play.car.streetNote');
    root.append(note);
    const race = document.createElement('button');
    race.type = 'button';
    race.className = 'race';
    race.textContent = ui.t('play.car.raceGo');
    race.addEventListener('click', () => { sfx.play('tap'); onRace?.(); });
    const blurb = document.createElement('p');
    blurb.className = 'blurb';
    blurb.textContent = ui.t('play.car.raceBlurb');
    root.append(blurb, race);
    el.append(root);
  }

  ui.notebook.register('garage', { label: ui.t('play.car.garage'), render });

  return {
    open() { ui.notebook.open?.('garage'); },
    unlock(id) {
      let ok = false;
      unlocked = Object.assign({}, unlocked);
      ok = grantUnlock(unlocked, id);
      if (ok) persist();
      ui.notebook.refresh?.('garage');
      return ok;
    },
    get look() { return look; },
  };
}
