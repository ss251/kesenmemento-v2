// [contrib] The markup of the 「修正を報告」 sheet (ui/contrib.js drives it): pure functions from a model and t() to HTML strings, so
// test/contrib-sheet.test.js can parse them with HTMLRewriter and check roles, labels, targets and escaping without a browser.
//
// Conventions: data-act="..." buttons (the HUD's way) handled by one delegated click listener; native radios, checkbox, file inputs, textarea and
// <progress> (keyboard and screen readers for free); every control has a visible <label> or an aria-label; [hidden] switches panels; the
// kind (issue | fix) is a data attribute on the root and CSS shows the matching hint ([data-only]) so nothing re-renders while the visitor types.
import { CATEGORIES, KINDS, LIMITS, POINTS, statusOf, pointsOf, versionLabel, fmtDate, maskCrewNo, groupCode, mbText } from './contrib-lib.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${d}</svg>`;
export const ICON = {
  flag: svg('<path d="M5.5 21V4"/><path d="M5.5 4.5h11l-2.2 4 2.2 4h-11"/>'),
  camera: svg('<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 'stroke-width="2.4"'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>', 'stroke-width="2.6"'),
  building: svg('<path d="M5.5 20.5V8.5L12 4l6.5 4.5v12"/><path d="M9.5 20.5v-5h5v5"/><path d="M9.5 11h.01M14.5 11h.01"/>'),
  road: svg('<path d="M9.5 3.5L5 20.5M14.5 3.5l4.5 17"/><path d="M12 5.5v3M12 11v3M12 16.5v3"/>'),
  shop: svg('<path d="M4 9.5L5.5 4h13L20 9.5"/><path d="M4 9.5a2.67 2.67 0 0 0 5.33 0 2.67 2.67 0 0 0 5.34 0 2.67 2.67 0 0 0 5.33 0"/><path d="M5.5 12.5v8h13v-8"/>'),
  sign: svg('<path d="M12 21V8"/><path d="M5 3.5h14v7H5z"/>'),
  landmark: svg('<path d="M3.5 20.5h17"/><path d="M6.5 20.5V10.5M12 20.5V10.5M17.5 20.5V10.5"/><path d="M3.5 10.5L12 4l8.5 6.5"/>'),
  other: svg('<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>'),
  photos: svg('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-4 4 3 3-2.2 4 3.2"/>'),
  send: svg('<path d="M4 11.5l16-7.5-5.5 16-3-6.5z"/><path d="M11.5 13.5L20 4"/>'),
  retry: svg('<path d="M4.5 12a7.5 7.5 0 1 1 2.6 5.7"/><path d="M4.5 18.5V13h5.5"/>'),
  copy: svg('<rect x="8.5" y="8.5" width="11" height="12" rx="2.2"/><path d="M5 15.5V6.5A2.2 2.2 0 0 1 7.2 4.5H15"/>'),
  shield: svg('<path d="M12 3l7 3v5c0 4.7-3 7.8-7 10-4-2.2-7-5.3-7-10V6z"/>'),
  phone: svg('<rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 18h2"/>'),
  back: svg('<path d="M14.5 5.5L8 12l6.5 6.5"/>', 'stroke-width="2.4"'),
  heic: svg('<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="M9 15l2.2-3 1.8 2 1.3-1.5 2 2.5"/>'),
  heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
};
const CAT_ICON = { building: ICON.building, road: ICON.road, shop: ICON.shop, sign: ICON.sign, landmark: ICON.landmark, other: ICON.other };

// ------------------------------------------------------------------ the shell
/** The whole sheet: scrim, dialog, header with tabs, the three panels, the footer. */
export function shellHtml(m, t) {
  return `<div class="kc-scrim" data-act="scrim" aria-hidden="true"></div>
<section class="kc-sheet" id="kc-sheet" role="dialog" aria-modal="true" aria-labelledby="kc-title" tabindex="-1">
${headHtml(m, t)}
  <div class="kc-body" data-scroll>
    <section class="kc-panel" id="kc-p-report" role="tabpanel" aria-labelledby="kc-tab-report" data-panel="report">
      <div data-sub="form">${formHtml(m, t)}</div>
      <div data-sub="done" hidden></div>
      <div data-sub="privacy" hidden>${privacyHtml(t, m)}</div>
    </section>
    <section class="kc-panel" id="kc-p-mine" role="tabpanel" aria-labelledby="kc-tab-mine" data-panel="mine" hidden></section>
    <section class="kc-panel" id="kc-p-board" role="tabpanel" aria-labelledby="kc-tab-board" data-panel="board" hidden></section>
  </div>
${footHtml(m, t)}
  <div class="kc-live" role="status" aria-live="polite" aria-atomic="true"></div>
</section>`;
}

const TABS = [['report', 'contrib.tab.report', 'flag'], ['mine', 'contrib.tab.mine', 'photos'], ['board', 'contrib.tab.board', 'heart']];
export function headHtml(m, t) {
  return `  <header class="kc-head">
    <div class="kc-title">
      <h2 id="kc-title">${esc(t('contrib.title'))}</h2>${m.langBtn ? `
      <button type="button" class="kc-lang" data-act="lang" aria-label="${esc(m.langBtn.aria)}">${esc(m.langBtn.text)}</button>` : ''}
      <button type="button" class="kc-x" data-act="close" aria-label="${esc(t('contrib.close'))}">${ICON.close}</button>
    </div>
    <div class="kc-tabs" role="tablist" aria-label="${esc(t('contrib.tabs'))}">
${TABS.map(([id, key]) => `      <button type="button" role="tab" id="kc-tab-${id}" class="kc-tab" data-act="tab" data-tab="${id}" aria-selected="${m.tab === id}" aria-controls="kc-p-${id}" tabindex="${m.tab === id ? 0 : -1}">${esc(t(key))}</button>`).join('\n')}
    </div>${m.testHost ? `\n    <p class="kc-warn" role="note">${esc(t('contrib.testserver', { host: m.testHost }))}</p>` : ''}
  </header>`;
}

// ------------------------------------------------------------------ the report form
export function formHtml(m, t) {
  if (m.closed) return closedHtml(t);
  const lim = m.limits || LIMITS, pts = m.points || POINTS;   // (the numbers the backend announced, else the built-in ones)
  const kindCard = (k, icon) => `<label class="kc-kindcard"><input type="radio" name="kind" value="${k}" data-kind="${k}"${m.kind === k ? ' checked' : ''}><span class="kc-card kc-card-${k}"><span class="kc-card-ico">${icon}</span><b>${esc(t('contrib.kind.' + k))}</b></span></label>`;
  const chip = (c) => `<label class="kc-chip"><input type="radio" name="category" value="${c}"${m.category === c ? ' checked' : ''} aria-describedby="kc-e-category"><span class="kc-chipbody"><span class="kc-chip-ico">${CAT_ICON[c]}</span><b class="kc-chip-name">${esc(t('contrib.cat.' + c))}</b><small class="kc-chip-ex">${esc(t('contrib.cat.' + c + '.ex'))}</small></span></label>`;
  return `<form class="kc-form" id="kc-form" novalidate autocomplete="off">
      <fieldset class="kc-fs kc-kind">
        <legend class="kc-label">${esc(t('contrib.kind.label'))}</legend>
        <div class="kc-kinds">${kindCard('issue', ICON.flag)}${kindCard('fix', ICON.camera)}</div>
        <div class="kc-descs"><p class="kc-hint" data-only="issue">${esc(t('contrib.kind.issue.desc'))}</p><p class="kc-hint" data-only="fix">${esc(t('contrib.kind.fix.desc'))}</p></div>
      </fieldset>
${shotHtml(m, t)}
      <fieldset class="kc-fs kc-cats">
        <legend class="kc-label">${esc(t('contrib.cat.label'))}</legend>
        <div class="kc-chips" role="radiogroup" aria-label="${esc(t('contrib.cat.label'))}">${CATEGORIES.map(chip).join('')}</div>
        <p class="kc-err" id="kc-e-category" role="alert" hidden></p>
      </fieldset>
      <div class="kc-field">
        <label class="kc-label" for="kc-note">${esc(t('contrib.note.label'))}</label>
        <textarea id="kc-note" name="note" rows="4" maxlength="${lim.note}" placeholder="${esc(t('contrib.note.placeholder'))}" aria-describedby="kc-note-n kc-e-note">${esc(m.note)}</textarea>
        <p class="kc-count" id="kc-note-n"><span data-f="note-n">${String(m.note || '').length}</span> / <span data-f="note-max">${lim.note}</span></p>
        <p class="kc-err" id="kc-e-note" role="alert" hidden></p>
      </div>
      <fieldset class="kc-fs kc-photos">
        <legend class="kc-label"><span data-only="issue">${esc(t('contrib.photos.label.issue'))}</span><span data-only="fix">${esc(t('contrib.photos.label.fix'))}</span></legend>
        <div class="kc-addrow">
          <label class="kc-btn kc-pick" for="kc-file">${ICON.photos}<span>${esc(t('contrib.photos.pick'))}</span><input class="kc-file" id="kc-file" type="file" accept="image/*" multiple data-f="file"></label>
          <label class="kc-btn kc-camera" for="kc-cam" data-only-touch>${ICON.camera}<span>${esc(t('contrib.photos.camera'))}</span><input class="kc-file" id="kc-cam" type="file" accept="image/*" capture="environment" data-f="cam"></label>
        </div>
        <ul class="kc-tiles" id="kc-tiles" aria-label="${esc(t('contrib.photos.count', { n: m.photos.length, max: lim.photos }))}">${tilesHtml(m, t)}</ul>
        <p class="kc-count" id="kc-photos-n" data-f="photos-n">${esc(t('contrib.photos.count', { n: m.photos.length, max: lim.photos }))}</p>
        <p class="kc-hint" data-f="photos-hint">${esc(t('contrib.photos.hint', { mb: mbText(lim.photoBytes) }))}</p>
        <p class="kc-err" id="kc-e-photos" role="alert" hidden></p>
      </fieldset>
      <fieldset class="kc-fs kc-who">
        <div class="kc-field">
          <label class="kc-label" for="kc-nick">${esc(t('contrib.nick.label'))}</label>
          <input id="kc-nick" name="nickname" type="text" maxlength="${LIMITS.nickname}" autocomplete="nickname" autocapitalize="none" spellcheck="false" placeholder="${esc(t('contrib.nick.placeholder'))}" value="${esc(m.nickname)}" aria-describedby="kc-nick-h kc-e-nick">
          <p class="kc-hint" id="kc-nick-h">${esc(t('contrib.nick.hint'))}</p>
          <p class="kc-err" id="kc-e-nick" role="alert" hidden></p>
        </div>
        <div class="kc-field">
          <label class="kc-label" for="kc-crew">${esc(t('contrib.crew.label'))}</label>
          <input id="kc-crew" name="crewNo" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="${esc(t('contrib.crew.placeholder'))}" value="${esc(m.crewNo)}" aria-describedby="kc-crew-h kc-e-crew">
          <p class="kc-hint" id="kc-crew-h">${esc(t('contrib.crew.hint'))}</p>
          <p class="kc-err" id="kc-e-crew" role="alert" hidden></p>
        </div>
      </fieldset>
      <p class="kc-points" data-f="points">${esc(t('contrib.points', pts))}</p>
      <div class="kc-consent">
        <p class="kc-privsum" id="kc-privsum">${esc(t('contrib.privacy.summary'))}</p>
        <label class="kc-check"><input type="checkbox" name="consent" value="1"${m.consent ? ' checked' : ''} aria-describedby="kc-privsum kc-e-consent"><span class="kc-box">${ICON.check}</span><span class="kc-ctext">${esc(t('contrib.consent'))}</span></label>
        <button type="button" class="kc-link" data-act="privacy">${ICON.shield}<span>${esc(t('contrib.privacy.link'))}</span></button>
        <p class="kc-err" id="kc-e-consent" role="alert" hidden></p>
      </div>
      <div class="kc-alert" id="kc-alert" role="alert" hidden></div>
    </form>`;
}

/** The screenshot card: a box that already has the viewport's shape (no jump when the picture arrives), the picture, and the words. */
export function shotHtml(m, t) {
  const s = m.shot || { state: 'wait' };
  const a = m.aspect > 0 ? m.aspect : 16 / 9;
  const h = 96, w = Math.round(h * a);
  const img = s.state === 'ok' && s.thumb ? `<img src="${esc(s.thumb)}" width="${s.thumbW || w}" height="${s.thumbH || h}" alt="${esc(t('contrib.shot.alt'))}" decoding="async">` : '';
  return `      <section class="kc-shot" id="kc-shot" data-state="${esc(s.state)}" aria-labelledby="kc-shot-t">
        <div class="kc-shot-img" style="--kc-w:${w}px;--kc-h:${h}px;aspect-ratio:${w} / ${h}">${img}</div>
        <div class="kc-shot-txt">
          <h3 id="kc-shot-t">${esc(t('contrib.shot.title'))}</h3>
          <p data-f="shot-t">${esc(s.state === 'wait' ? t('contrib.shot.wait') : s.state === 'fail' ? t('contrib.shot.fail') : t('contrib.shot.auto'))}</p>
          <p class="kc-meta" data-f="shot-meta">${(m.meta || []).map((x) => `<span>${esc(x)}</span>`).join('')}</p>
        </div>
      </section>`;
}

/** The picked photos: a fixed-size tile each (nothing moves when a thumbnail arrives) with a 44 px remove button. */
export function tilesHtml(m, t) {
  return m.photos.map((p) => `<li class="kc-tile" data-id="${esc(p.id)}"><span class="kc-thumb">${p.thumb ? `<img src="${esc(p.thumb)}" alt="" decoding="async">` : `<span class="kc-thumb-none">${ICON.heic}<small>${esc(String(p.name).split('.').pop().slice(0, 5).toUpperCase())}</small></span>`}</span><span class="kc-tile-name">${esc(p.name)}</span><button type="button" class="kc-rm" data-act="rm" data-id="${esc(p.id)}" aria-label="${esc(t('contrib.photos.remove', { name: p.name }))}">${ICON.close}</button></li>`).join('');
}

/** Reports are not being accepted: one calm line, in the sheet's language. No form, so nothing can be sent. */
export function closedHtml(t) {
  return `<p class="kc-closed" role="status">${esc(t('contrib.closed'))}</p>`;
}

export function footHtml(m, t) {
  if (m.closed) return `  <footer class="kc-foot" data-for="form" hidden></footer>`;
  return `  <footer class="kc-foot" data-for="form">
    <div class="kc-prog" hidden><progress class="kc-bar" max="100" value="0" aria-label="${esc(t('contrib.progress'))}"></progress><span class="kc-prog-t" data-f="prog-t"></span></div>
    <div class="kc-actions">
      <button type="button" class="kc-btn ghost" data-act="cancel" hidden>${esc(t('contrib.cancel'))}</button>
      <button type="submit" form="kc-form" class="kc-btn primary kc-send" data-act="send"><span class="kc-send-ico">${ICON.send}</span><span data-f="send-t">${esc(t('contrib.submit'))}</span></button>
    </div>
  </footer>`;
}

// ------------------------------------------------------------------ after sending
export function doneHtml(t, m = {}) {
  const pts = m.points || POINTS;
  return `<div class="kc-done">
        <div class="kc-done-ico" aria-hidden="true">${ICON.check}</div>
        <h3 id="kc-done-t" tabindex="-1">${esc(t('contrib.done.title'))}</h3>
        <p>${esc(t('contrib.done.body'))}</p>
        <p class="kc-points" data-f="points-done">${esc(t('contrib.done.points', pts))}</p>
        <div class="kc-stack">
          <button type="button" class="kc-btn primary" data-act="goto" data-tab="mine">${esc(t('contrib.done.mine'))}</button>
          <button type="button" class="kc-btn" data-act="goto" data-tab="board">${esc(t('contrib.done.board'))}</button>
          <button type="button" class="kc-btn ghost" data-act="again">${esc(t('contrib.done.again'))}</button>
          <button type="button" class="kc-btn ghost" data-act="close">${esc(t('contrib.done.close'))}</button>
        </div>
      </div>`;
}

// ------------------------------------------------------------------ the privacy notice
export function privacyHtml(t, m = {}) {
  const sections = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return `<div class="kc-privacy">
        <button type="button" class="kc-btn ghost kc-back" data-act="privacy-back">${ICON.back}<span>${esc(t('contrib.privacy.back'))}</span></button>
        <h3 id="kc-privacy-t" tabindex="-1">${esc(t('contrib.privacy.title'))}</h3>
        <p class="kc-lead">${esc(t('contrib.privacy.intro'))}</p>
        ${sections.map((n) => `<h4>${esc(t(`contrib.privacy.s${n}.h`))}</h4><p>${esc(t(`contrib.privacy.s${n}.p`))}</p>`).join('\n        ')}
        <p class="kc-lead">${esc(t('contrib.privacy.selfdel'))}</p>${m.contact ? `
        <p class="kc-lead kc-contact">${esc(t('contrib.privacy.contact', { contact: m.contact }))}</p>` : ''}
      </div>`;
}

// ------------------------------------------------------------------ my reports
/** m.mine: { state: 'loading' | 'ok' | 'error' | 'anon', me, error }; m.xfer, m.claim: see below. */
export function mineHtml(m, t) {
  if (m.closed) return `<h3 class="kc-h3 kc-sr" id="kc-mine-t" tabindex="-1">${esc(t('contrib.mine.title'))}</h3>${closedHtml(t)}`;
  const q = m.mine || { state: 'loading' };
  let body;
  if (q.state === 'loading') body = `<p class="kc-state" role="status">${esc(t('contrib.mine.loading'))}</p>`;
  else if (q.state === 'error') body = `<div class="kc-state"><p>${esc(t('contrib.mine.error'))}</p><p class="kc-hint">${esc(t(q.errorKey || 'contrib.err.unknown'))}</p><button type="button" class="kc-btn" data-act="reload-mine">${ICON.retry}<span>${esc(t('contrib.mine.retry'))}</span></button></div>`;
  else if (q.state === 'anon' || !q.me?.submissions?.length) body = `${q.me ? meSummary(q.me, t) : ''}<p class="kc-state kc-empty">${esc(t('contrib.mine.empty'))}</p>`;
  else body = `${meSummary(q.me, t)}<ul class="kc-list">${q.me.submissions.map((s) => itemHtml(s, m.lang, t)).join('')}</ul>`;
  return `<h3 class="kc-h3 kc-sr" id="kc-mine-t" tabindex="-1">${esc(t('contrib.mine.title'))}</h3>${m.notice ? `
      <p class="kc-notice" role="status">${esc(m.notice)}</p>` : ''}
      ${body}
      ${xferHtml(m, t)}
      <section class="kc-block kc-forget"><button type="button" class="kc-btn ghost" data-act="forget">${esc(t('contrib.forget'))}</button><p class="kc-hint">${esc(t('contrib.forget.hint'))}</p></section>
      ${eraseHtml(m, t)}`;
}
function meSummary(me, t) {
  return `<div class="kc-total"><b>${esc(t('contrib.mine.total', { n: me.points }))}</b><small>${esc(t('contrib.mine.totalHint'))}${me.rank ? ' ' + esc(t('contrib.mine.rank', { n: me.rank })) : ''}</small></div>
      <dl class="kc-me"><dt>${esc(t('contrib.mine.nick'))}</dt><dd>${esc(me.nickname || '—')}</dd><dt>${esc(t('contrib.mine.crew'))}</dt><dd>${me.crewNo ? esc(maskCrewNo(me.crewNo)) : esc(t('contrib.mine.crewNone'))}</dd></dl>`;
}
export function itemHtml(s, lang, t) {
  const st = statusOf(s), pts = pointsOf(s), v = versionLabel(s.usedVersion);
  const label = st === 'used' ? (v ? t('contrib.status.usedVersion', { v }) : t('contrib.status.used')) : t('contrib.status.' + st);
  const cat = CATEGORIES.includes(s.category) ? t('contrib.cat.' + s.category) : s.category;
  const note = String(s.note || '').trim();
  return `<li class="kc-item" data-status="${st}" data-id="${esc(s.id)}">
        <div class="kc-item-top"><span class="kc-badge" data-kind="${s.kind}">${esc(t('contrib.badge.' + (s.kind === 'fix' ? 'fix' : 'issue')))}</span><span class="kc-cat">${esc(cat)}</span><time datetime="${esc(s.createdAt)}">${esc(fmtDate(s.createdAt, lang))}</time></div>
        ${note ? `<p class="kc-item-note">${esc(note.length > 80 ? note.slice(0, 80) + '…' : note)}</p>` : ''}
        <div class="kc-item-bot"><span class="kc-st" data-s="${st}">${esc(label)}</span>${pts ? `<b class="kc-pt">${esc(t('contrib.status.pt', { n: pts }))}</b>` : ''}</div>
        ${st === 'used' ? `<p class="kc-live-note">${esc(t('contrib.status.usedNote'))}</p>` : ''}
      </li>`;
}

/**
 * 「送ったデータをすべて削除」: erases everything this login sent from the server (DELETE /me?confirm=1). Only for a device that has a login.
 * m.erase = { phase: 'idle' | 'confirm' | 'busy' | 'error', errorKey }; a plain two-button question, the safe answer (やめる) gets the focus.
 */
export function eraseCardHtml(x, t) {
  if (x.phase === 'confirm') {
    return `<div class="kc-confirm" role="group" aria-labelledby="kc-erase-q">
          <p id="kc-erase-q"><b>${esc(t('contrib.erase.q'))}</b> ${esc(t('contrib.erase.warn'))}</p>
          <div class="kc-row-btns"><button type="button" class="kc-btn danger" data-act="erase-yes">${esc(t('contrib.erase.yes'))}</button><button type="button" class="kc-btn ghost" data-act="erase-no">${esc(t('contrib.erase.no'))}</button></div>
        </div>`;
  }
  if (x.phase === 'busy') return `<p class="kc-state" role="status">${esc(t('contrib.erase.busy'))}</p>`;
  return `${x.phase === 'error' ? `<p class="kc-err" role="alert">${esc(t(x.errorKey || 'contrib.err.unknown'))}</p>` : ''}<button type="button" class="kc-btn danger-ghost" data-act="erase">${esc(t('contrib.erase.start'))}</button>`;
}
export function eraseHtml(m, t) {
  if (!m.hasAccount) return '';
  const x = m.erase || { phase: 'idle' };
  return `<section class="kc-block kc-erase" aria-labelledby="kc-erase-t">
        <h4 id="kc-erase-t">${esc(t('contrib.erase.title'))}</h4>
        <p class="kc-hint">${esc(t('contrib.erase.hint'))}</p>
        <div class="kc-erase-card" data-f="erase-card">${eraseCardHtml(x, t)}</div>
      </section>`;
}

/** The device-transfer sections of マイ投稿: make a code (code, countdown, QR) and enter one. m.xfer = { phase, code, left, svg, error }, m.claim = { open, value, error, busy, hint }. */
export function xferCardHtml(x, t) {
  if (x.phase === 'loading') return `<p class="kc-state" role="status">${esc(t('contrib.mine.loading'))}</p>`;
  if (x.phase === 'error') return `<p class="kc-err" role="alert">${esc(t(x.errorKey || 'contrib.err.unknown'))}</p>`;
  if (x.phase === 'ready' || x.phase === 'expired') {
    return `<div class="kc-codecard" data-phase="${x.phase}">
          <p class="kc-label" id="kc-code-l">${esc(t('contrib.xfer.code'))}</p>
          <p class="kc-code" aria-labelledby="kc-code-l" data-f="code">${esc(groupCode(x.code))}</p>
          <p class="kc-left" data-f="left" role="timer">${esc(x.phase === 'expired' ? t('contrib.xfer.expired') : t('contrib.xfer.left', { t: x.left }))}</p>
          <div class="kc-qr" data-f="qr">${x.svg || ''}</div>
          <div class="kc-row-btns"><button type="button" class="kc-btn" data-act="copy">${ICON.copy}<span>${esc(t('contrib.xfer.copy'))}</span></button><button type="button" class="kc-btn ghost" data-act="xfer-hide">${esc(t('contrib.xfer.hide'))}</button></div>
        </div>`;
  }
  return '';
}
export function xferHtml(m, t) {
  const x = m.xfer || { phase: 'idle' }, c = m.claim || { open: false, value: '', error: '', busy: false, hint: '' };
  return `<section class="kc-block kc-xfer" aria-labelledby="kc-xfer-t">
        <h4 id="kc-xfer-t">${ICON.phone}<span>${esc(t('contrib.xfer.title'))}</span></h4>
        <p class="kc-hint">${esc(t('contrib.xfer.body'))}</p>
        <button type="button" class="kc-btn" data-act="xfer" aria-expanded="${x.phase === 'ready' || x.phase === 'expired'}">${esc(t('contrib.xfer.make'))}</button>
        <div class="kc-xfer-card" data-f="xfer-card">${xferCardHtml(x, t)}</div>
      </section>
      <section class="kc-block kc-claim" aria-labelledby="kc-claim-t">
        <h4 id="kc-claim-t">${esc(t('contrib.claim.title'))}</h4>
        ${c.hint ? `<p class="kc-hint">${esc(c.hint)}</p>` : ''}
        <form class="kc-claimform" id="kc-claimform" novalidate autocomplete="off">
          <label class="kc-label" for="kc-claim-in">${esc(t('contrib.claim.label'))}</label>
          <div class="kc-claimrow"><input id="kc-claim-in" name="code" type="text" inputmode="text" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="16" value="${esc(c.value)}" aria-describedby="kc-claim-e"${c.error ? ' aria-invalid="true"' : ''}>
          <button type="submit" class="kc-btn primary" data-act="claim"${c.busy ? ' disabled' : ''}>${esc(t('contrib.claim.go'))}</button></div>
          <p class="kc-err" id="kc-claim-e" role="alert"${c.error ? '' : ' hidden'}>${esc(c.error)}</p>
        </form>
      </section>`;
}

// ------------------------------------------------------------------ the leaderboard
/** m.board: { state: 'loading' | 'ok' | 'error', rows: [{ nickname, accepted, points }], me (my nickname, to mark the row) }. */
export function boardHtml(m, t) {
  if (m.closed) return `<h3 class="kc-h3 kc-sr" id="kc-board-t" tabindex="-1">${esc(t('contrib.board.title'))}</h3>${closedHtml(t)}`;
  const b = m.board || { state: 'loading' };
  // my row: the server marks it (`me`) when it was asked with this device's login; without a login nobody is "you"
  const isMe = (r) => !!m.hasAccount && r.me === true;
  let body;
  if (b.state === 'loading') body = `<p class="kc-state" role="status">${esc(t('contrib.mine.loading'))}</p>`;
  else if (b.state === 'error') body = `<div class="kc-state"><p>${esc(t('contrib.mine.error'))}</p><p class="kc-hint">${esc(t(b.errorKey || 'contrib.err.unknown'))}</p><button type="button" class="kc-btn" data-act="reload-board">${ICON.retry}<span>${esc(t('contrib.mine.retry'))}</span></button></div>`;
  else if (!b.rows?.length) body = `<p class="kc-state kc-empty">${esc(t('contrib.board.empty'))}</p>`;
  else body = `<ol class="kc-board">${b.rows.map((r, i) => `<li class="kc-row" data-rank="${i + 1}"${isMe(r) ? ' data-me="1"' : ''}><span class="kc-rank" aria-label="${esc(t('contrib.board.rank', { n: i + 1 }))}">${i + 1}</span><span class="kc-nick">${esc(r.nickname)}${isMe(r) ? `<em>${esc(t('contrib.board.you'))}</em>` : ''}</span><span class="kc-acc">${esc(t('contrib.board.accepted', { n: r.accepted }))}</span><b class="kc-pts">${esc(t('contrib.status.pt', { n: r.points }).replace('+', ''))}</b></li>`).join('')}</ol>`;
  return `<h3 class="kc-h3 kc-sr" id="kc-board-t" tabindex="-1">${esc(t('contrib.board.title'))}</h3><p class="kc-hint">${esc(t('contrib.board.hint'))}</p>${body}`;
}

export { KINDS };
