// [contrib] 「修正を報告 / Report a correction」: the sheet where residents and visitors tell us what is wrong in the Living City.
//
//   const contrib = mountContrib(ctx, life, { i18n, note, force })     ui/hud.js mounts it; ctx.pad / ctx.camera / ctx.renderer / ctx.pipeline are the app's
//   contrib.open({ opener, tab, claim })   contrib.close()   contrib.isOpen   contrib.api (the backend client)   contrib.state (read-only view, for tests)
//
// A report is the view the visitor was looking at (an automatic screenshot, at most 1600 px wide, and the camera pose: core/pose.js), what is
// wrong (a category with an example each, a note), optionally photos taken on the spot (originals, EXIF kept: the backend needs the location), a nickname and an
// optional クルーNo.; the visitor agrees to the privacy notice and sends it to the backend (contrib-api.js, CONTRIB_API, ?contribApi=).
// With no backend configured (CONTRIB_API is ''), the sheet still opens and says reports are not open yet: nothing is sent. Two kinds:
// 「問題を報告」 (issue: the screenshot and the whole session state) and 「現地の写真で直す」 (fix: photos taken on the spot plus a note).
// After sending: 「マイ投稿」 (status, points, 「反映済み（v…）」, device transfer by code and QR) and the 「貢献ランキング」.
//
// It is a modal dialog: focus is trapped (Tab / Shift+Tab), Esc closes (or steps back), the rest of the page is inert, focus returns to the button that
// opened it, the touch pad steps aside (ctx.pad.suppress('contrib')), pointer lock is released, and the town's keyboard shortcuts do not run while it is
// open. The markup is in contrib-view.js, the look in ui/style.js (CONTRIB_CSS), the pure parts in contrib-lib.js. docs/contrib/APP.md.
import { capturePose } from '../core/pose.js';
import { CONTRIB_CSS } from './style.js';
import { createApi, resolveApiBase, messageKey, explainError } from './contrib-api.js';
import {
  CATEGORIES, KINDS, CONTRIB_CONTACT, effectiveLimits, effectivePoints, mbText, createT, checkCrewNo, cleanNickname, nicknameProblem, checkClaimCode, photoProblem, validateReport, safeStorage, loadDraft, saveDraft,
  clearDraft, loadProfile, saveProfile, createAccounts, countdown, keyboardInset, claimUrl, claimFromSearch, newIdempotencyKey, KEYS,
} from './contrib-lib.js';
import { captureView, makeThumb } from './contrib-shot.js';
import { qrEncode, qrToSvg } from './qr.js';
import { shellHtml, shotHtml, tilesHtml, doneHtml, mineHtml, boardHtml, xferCardHtml, eraseCardHtml, esc } from './contrib-view.js';

/** The page's own layers that are inert while the sheet is open (whatever exists). */
export const BACKGROUND = ['#scene', '#intro', '#klc-ui', '#klc-ui-restore', '#klc-x', '#klc-labels', '#klc-pad', '#klc-ship', '#klc-story', '#klc-board', '#toast', '#corner', '#help', '#credit', '#stats'];
export const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]';

/** The focusable controls inside `root`, in DOM order (disabled, hidden, tabindex=-1 and not-displayed ones left out). */
export function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.tabIndex >= 0 && !el.closest('[hidden]') && el.getClientRects().length > 0);
}
/** Where Tab / Shift+Tab goes from `active` inside `list`: the other end at an edge, the first or last when focus is outside, null = leave it to the browser. */
export function nextFocus(list, active, shift) {
  if (!list.length) return null;
  const i = list.indexOf(active);
  if (i < 0) return shift ? list[list.length - 1] : list[0];
  if (shift && i === 0) return list[list.length - 1];
  if (!shift && i === list.length - 1) return list[0];
  return null;
}

export function mountContrib(ctx, life, o = {}) {
  const doc = o.doc || (typeof document !== 'undefined' ? document : null), win = o.win || (typeof window !== 'undefined' ? window : null);
  if (!doc || !win) return null;
  const I = o.i18n || null, lang = () => (I?.lang === 'en' ? 'en' : 'ja'), t = createT(lang);
  const hudT = (k, v) => (I?.t ? I.t(k, v) : k);
  const store = o.store || safeStorage(win);
  const search = win.location?.search || '';
  const target = resolveApiBase(search);
  const accounts = createAccounts(store, target.base);
  const api = o.api || createApi({ base: target.base, accounts, fetch: o.fetch, XMLHttpRequest: o.XMLHttpRequest });
  const raf = (f) => (win.requestAnimationFrame ? win.requestAnimationFrame(f) : setTimeout(f, 16));

  const S = {
    open: false, tab: 'report', sub: 'form', kind: 'issue', category: '', note: '', nickname: '', crewNo: '', consent: false, photos: [], pid: 0, restored: false,
    pose: null, shot: null, shotState: 'wait', shotP: null, meta: [], aspect: 16 / 9, capToken: 0, sending: false, ctl: null, sendKey: null, sendSig: '',
    mine: { state: 'loading' }, board: { state: 'loading' }, xfer: { phase: 'idle' }, claim: { open: false, value: '', error: '', busy: false, hint: '' },
    erase: { phase: 'idle' }, notice: '', opener: null, forgetArmed: false, cfg: null, cfgAt: 0,
  };
  const lim = () => effectiveLimits(S.cfg), pts = () => effectivePoints(S.cfg);   // (what the backend announced in /health, else the built-in numbers)
  let root = null, sheet = null, tick = 0, draftT = 0, closeT = 0, forgetT = 0, kbOff = null;
  const inerted = [];
  const $ = (sel) => root?.querySelector(sel);
  const $$ = (sel) => (root ? [...root.querySelectorAll(sel)] : []);

  // ---------------------------------------------------------------- the model the views read
  const metaLines = () => {
    const p = S.pose, out = [];
    if (!p) return out;
    try { const a = ctx.services?.explore?.search?.areaAt?.(p.enu[0], p.enu[2]); const n = a && (lang() === 'en' ? a.en || a.ja : a.ja); if (n) out.push(n); } catch { /* no place name */ }
    out.push(t('contrib.mode.' + p.mode));
    if (p.timePreset) out.push(/^\d/.test(p.timePreset) ? p.timePreset : hudT('v3.time.' + p.timePreset));
    if (p.season) out.push(hudT('v3.season.' + p.season));
    return out;
  };
  const model = () => ({
    lang: lang(), tab: S.tab, kind: S.kind, category: S.category, note: S.note, nickname: S.nickname, crewNo: S.crewNo, consent: S.consent,
    photos: S.photos, shot: { state: S.shotState, thumb: S.shot?.thumb || '', thumbW: S.shot?.thumbW, thumbH: S.shot?.thumbH }, aspect: S.aspect, meta: S.meta,
    testHost: target.custom && !target.local ? target.host : '', closed: !target.base, mine: S.mine, board: S.board, xfer: S.xfer, claim: S.claim, erase: S.erase, notice: S.notice,
    hasAccount: !!accounts.get(), contact: CONTRIB_CONTACT, limits: lim(), points: pts(), langBtn: I?.set ? { text: hudT('v3.lang'), aria: hudT('lang.toggle') } : null,
  });

  // ---------------------------------------------------------------- the page around it
  function ensureStyle() {
    if (doc.getElementById('klc-contrib-css')) return;
    const st = doc.createElement('style'); st.id = 'klc-contrib-css'; st.textContent = CONTRIB_CSS; doc.head.appendChild(st);
  }
  function ensureRoot() {
    if (root) return;
    ensureStyle();
    root = doc.createElement('div'); root.id = 'klc-contrib'; root.dataset.open = '0'; root.dataset.tab = 'report'; root.dataset.sub = 'form'; root.dataset.kind = 'issue';
    doc.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('keydown', (e) => e.stopPropagation());   // (the window handler below runs first; this keeps anything that slips through from reaching the town)
  }
  /** Everything behind the sheet is inert (not focusable, not read out) while it is open. */
  function setBackground(on) {
    if (on) {
      for (const sel of BACKGROUND) for (const el of doc.querySelectorAll(sel)) if (!el.hasAttribute('inert')) { el.setAttribute('inert', ''); inerted.push(el); }
    } else { for (const el of inerted.splice(0)) el.removeAttribute('inert'); }
  }
  function setModal(on) {
    setBackground(on);
    doc.body.classList.toggle('klc-contrib-open', on);
    try { ctx.pad?.suppress?.('contrib', on); } catch { /* no pad */ }
    if (on) {
      try { if (doc.pointerLockElement) doc.exitPointerLock?.(); } catch { /* no lock */ }
      const vv = win.visualViewport;
      if (vv) {
        const f = () => { const px = keyboardInset(vv, win.innerHeight); root?.style.setProperty('--kc-kb', px + 'px'); if (px) raf(() => doc.activeElement?.scrollIntoView?.({ block: 'center', behavior: 'instant' })); };
        vv.addEventListener('resize', f); vv.addEventListener('scroll', f); kbOff = () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); root?.style.removeProperty('--kc-kb'); };
        f();
      }
    } else { kbOff?.(); kbOff = null; }
  }
  const announce = (msg) => { const el = $('.kc-live'); if (!el) return; el.textContent = ''; setTimeout(() => { if (el.isConnected) el.textContent = msg; }, 30); };
  const focusEl = (el) => { try { el?.focus?.({ preventScroll: false }); } catch { /* gone */ } };

  // ---------------------------------------------------------------- open / close
  /** Open the sheet. The camera pose and the screenshot are taken right here, before anything covers or changes the view. */
  function open({ opener = null, tab = 'report', claim = '' } = {}) {
    if (S.open) { setTab(tab, { focus: true }); return true; }
    if (ctx.planet?.active) { o.note?.(t('contrib.planet.note')); return false; }
    if (!o.force && !doc.body.classList.contains('playing')) return false;
    S.opener = opener || doc.activeElement || null;
    // the view first (this is a synchronous part of the click: captureView draws one more frame and reads it back before it awaits anything)
    try { S.pose = capturePose(ctx, { win }); } catch { S.pose = null; }
    S.meta = metaLines(); S.aspect = (win.innerWidth || 16) / (win.innerHeight || 9);
    S.open = true;   // (the capture below checks it when it ends)
    startCapture();
    // the text of an unsent report and the remembered profile, once per page; later opens keep what is in memory
    if (!S.restored) {
      S.restored = true;
      const d = loadDraft(store), p = loadProfile(store);
      if (d) { S.kind = d.kind; S.category = d.category; S.note = d.note; S.crewNo = d.crewNo; }
      S.nickname = p.nickname; if (!S.crewNo) S.crewNo = p.crewNo;
    }
    if (claim) { S.claim = { open: true, value: claim, error: '', busy: false, hint: t('contrib.claim.from') }; tab = 'mine'; }
    S.tab = 'report'; S.sub = 'form'; S.consent = false; S.sending = false; S.notice = '';
    S.mine = accounts.get() ? { state: 'loading' } : { state: 'anon' }; S.board = { state: 'loading' }; S.xfer = { phase: 'idle' }; S.erase = { phase: 'idle' };
    ensureRoot();
    clearTimeout(closeT);
    root.innerHTML = shellHtml(model(), t);
    sheet = $('#kc-sheet'); root.setAttribute('lang', lang()); root.dataset.kind = S.kind;
    setModal(true);
    syncView();
    void root.offsetWidth;   // (the closed look is computed first, so the slide-in animates)
    root.dataset.open = '1';
    focusEl(sheet);   // (it is visible now: focus() on something under visibility:hidden does nothing)
    if (tab !== 'report') setTab(tab, { focus: false });
    loadConfig();
    return true;
  }
  /** GET /health once in a while (never blocks the sheet, a failure is silent): the limits and points the operator configured. Skipped when no backend is configured. */
  let cfgBusy = false;
  function loadConfig() {
    if (!target.base || o.loadConfig === false || cfgBusy || (S.cfg && Date.now() - S.cfgAt < 10 * 60 * 1000)) return;
    cfgBusy = true;
    Promise.resolve(api.config?.()).then((cfg) => { if (cfg) { S.cfg = cfg; S.cfgAt = Date.now(); applyConfig(); } }).catch(() => { /* the built-in numbers stay */ }).finally(() => { cfgBusy = false; });
  }
  /** What is on screen follows the announced numbers. Only text nodes and maxlength: nothing the visitor typed is touched. */
  function applyConfig() {
    if (!root) return;
    const L = lim(), P = pts();
    const set = (sel, text) => { const e = $(sel); if (e && e.textContent !== text) e.textContent = text; };
    set('[data-f="points"]', t('contrib.points', P)); set('[data-f="points-done"]', t('contrib.done.points', P));
    set('[data-f="note-max"]', String(L.note)); const note = $('#kc-note'); if (note) note.maxLength = L.note;
    set('[data-f="photos-hint"]', t('contrib.photos.hint', { mb: mbText(L.photoBytes) }));
    renderTiles();   // (the counter reads n / max)
  }
  /** Take the screenshot of the view as it is right now (synchronously started: one more frame is drawn and read back) and keep the promise: sending waits for it. */
  function startCapture() {
    releaseShot(); S.shotState = 'wait';
    const token = ++S.capToken;
    S.shotP = captureView(ctx, { doc, win }).then((shot) => {
      if (token !== S.capToken || !S.open) { shot.release(); return; }
      S.shot = shot; S.shotState = 'ok'; updateShot();
    }).catch(() => { if (token === S.capToken) { S.shotState = 'fail'; updateShot(); } });
  }
  function close() {
    if (!S.open || S.sending) return false;
    S.open = false; S.capToken++;
    stopTick(); clearTimeout(draftT); persistDraft();
    root.dataset.open = '0';
    setModal(false);
    releaseShot();
    closeT = setTimeout(() => { if (!S.open && root) root.innerHTML = ''; }, 380);   // after the slide-out
    const op = S.opener?.isConnected ? S.opener : doc.querySelector('[data-act="report"]');
    S.opener = null; focusEl(op);
    if (doc.activeElement !== op) focusEl(doc.querySelector('[data-act="menu"]'));   // (a phone: the item lived in the ☰ menu, which is closed again)
    return true;
  }
  /** One step back: the privacy notice to the form, a transfer code to the list, else close. */
  function back() {
    if (S.sending) { focusEl($('[data-act="cancel"]')); return; }
    if (S.tab === 'report' && S.sub === 'privacy') { setSub('form', { focus: false }); focusEl($('[data-act="privacy"]')); return; }
    if (S.tab === 'mine' && (S.xfer.phase === 'ready' || S.xfer.phase === 'expired')) { hideTransfer(); return; }
    close();
  }
  function releaseShot() { if (S.shot) { S.shot.release(); S.shot = null; } }

  // ---------------------------------------------------------------- views
  function syncView() {
    if (!root) return;
    root.dataset.tab = S.tab; root.dataset.sub = S.sub; root.dataset.kind = S.kind;
    root.dataset.view = S.tab === 'report' && S.sub === 'form' ? 'form' : 'other';
    for (const p of $$('.kc-panel')) p.hidden = p.dataset.panel !== S.tab;
    for (const s of $$('[data-sub]')) s.hidden = s.dataset.sub !== S.sub;
    for (const b of $$('.kc-tab')) { const on = b.dataset.tab === S.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  }
  function setSub(sub, { focus = true } = {}) {
    S.sub = sub; syncView();
    if (focus) raf(() => focusEl(sub === 'done' ? $('#kc-done-t') : sub === 'privacy' ? $('#kc-privacy-t') : $('#kc-sheet')));
    const body = $('.kc-body'); if (body) body.scrollTop = 0;
  }
  function setTab(tab, { focus = true } = {}) {
    if (!['report', 'mine', 'board'].includes(tab)) return;
    if (S.tab === 'mine' && tab !== 'mine') S.notice = '';
    S.tab = tab; syncView();
    const body = $('.kc-body'); if (body) body.scrollTop = 0;
    if (tab === 'mine') loadMine({ focus }); else if (tab === 'board') loadBoard({ focus });
    else if (focus && S.sub !== 'form') focusEl(S.sub === 'done' ? $('#kc-done-t') : $('#kc-privacy-t'));
  }
  function updateShot() {
    const el = $('#kc-shot'); if (!el) return;
    el.outerHTML = shotHtml(model(), t);
  }

  // ---------------------------------------------------------------- my reports, the leaderboard, the transfer code
  async function loadMine({ focus = false } = {}) {
    const panel = $('#kc-p-mine'); if (!panel) return;
    if (!target.base) { renderMine(focus); return; }   // no backend: the panel says reports are not open, and /me is not requested
    if (!accounts.get()) S.mine = { state: 'anon' }; else if (S.mine.state !== 'ok') S.mine = { state: 'loading' };
    renderMine(focus);
    if (!accounts.get()) return;
    try {
      const me = await api.me();
      if (!S.open) return;
      S.mine = { state: 'ok', me };
      if (me.nickname && !S.nickname) { S.nickname = me.nickname; pushProfileToForm(); }
    } catch (e) { if (!S.open) return; S.mine = e.code === 'auth' ? { state: 'anon' } : { state: 'error', errorKey: messageKey(e) }; }
    if (S.tab === 'mine') renderMine(focus);
  }
  function renderMine(focus) {
    const panel = $('#kc-p-mine'); if (!panel) return;
    const was = panel.contains(doc.activeElement) ? doc.activeElement : null;
    panel.innerHTML = mineHtml(model(), t);
    if (focus) { const body = $('.kc-body'); if (body) body.scrollTop = 0; }   // (what just happened is announced at the top: show it)
    if (focus || was) raf(() => focusEl($('#kc-mine-t')));
    if (S.xfer.phase === 'ready') startTick();
  }
  async function loadBoard({ focus = false } = {}) {
    if (!target.base) { renderBoard(focus); return; }   // no backend: no GET /leaderboard, including not a relative URL
    S.board = { state: 'loading' }; renderBoard(focus);
    try { const rows = await api.leaderboard(20); if (!S.open) return; S.board = { state: 'ok', rows }; }
    catch (e) { if (!S.open) return; S.board = { state: 'error', errorKey: messageKey(e) }; }
    if (S.tab === 'board') renderBoard(focus);
  }
  function renderBoard(focus) {
    const panel = $('#kc-p-board'); if (!panel) return;
    const was = panel.contains(doc.activeElement) ? doc.activeElement : null;
    panel.innerHTML = boardHtml(model(), t);
    if (focus || was) raf(() => focusEl($('#kc-board-t')));
  }
  function renderXfer() {
    const card = $('[data-f="xfer-card"]'); if (!card) return;
    card.innerHTML = xferCardHtml(S.xfer, t);
    $('[data-act="xfer"]')?.setAttribute('aria-expanded', String(S.xfer.phase === 'ready' || S.xfer.phase === 'expired'));
  }
  async function makeTransfer() {
    if (!target.base) { announce(t('contrib.closed')); return; }   // the QR link is built from a code the backend mints; do not ask for one
    stopTick(); S.xfer = { phase: 'loading' }; renderXfer();
    try {
      const tr = await api.transferCode();
      if (!S.open) return;
      let svg = '';
      try { svg = qrToSvg(qrEncode(claimUrl(win.location.href, tr.code, { api: target.base }), { ecl: 'M' }), { title: t('contrib.xfer.qr') }); } catch { /* the code alone is enough */ }
      S.xfer = { phase: 'ready', code: tr.code, expiresAt: tr.expiresAt, left: countdown(tr.expiresAt), svg };
      renderXfer(); startTick(); announce(t('contrib.xfer.code') + ' ' + tr.code);
    } catch (e) { if (!S.open) return; S.xfer = { phase: 'error', errorKey: e.code === 'rate' ? 'contrib.xfer.rate' : messageKey(e) }; renderXfer(); }
  }
  function hideTransfer() { stopTick(); S.xfer = { phase: 'idle' }; renderXfer(); focusEl($('[data-act="xfer"]')); }
  function startTick() {
    stopTick();
    tick = setInterval(() => {
      if (S.xfer.phase !== 'ready') return stopTick();
      const left = countdown(S.xfer.expiresAt), el = $('[data-f="left"]');
      if (Date.now() >= S.xfer.expiresAt) { S.xfer = { ...S.xfer, phase: 'expired', svg: '' }; stopTick(); renderXfer(); return; }
      S.xfer.left = left; if (el) el.textContent = t('contrib.xfer.left', { t: left });
    }, 1000);
  }
  function stopTick() { clearInterval(tick); tick = 0; }
  async function copyCode() {
    const code = S.xfer.code; if (!code) return;
    let ok = false;
    try { await win.navigator.clipboard.writeText(code); ok = true; } catch {
      try { const r = doc.createRange(); r.selectNodeContents($('[data-f="code"]')); const s = win.getSelection(); s.removeAllRanges(); s.addRange(r); ok = doc.execCommand('copy'); } catch { /* the code stays selected: copy by hand */ }
    }
    announce(ok ? t('contrib.xfer.copied') : t('contrib.xfer.code') + ' ' + code);
    const b = $('[data-act="copy"] span'); if (b && ok) { b.textContent = t('contrib.xfer.copied'); setTimeout(() => { if (b.isConnected) b.textContent = t('contrib.xfer.copy'); }, 1600); }
  }
  async function doClaim() {
    if (!target.base) { announce(t('contrib.closed')); return; }
    const c = checkClaimCode(S.claim.value), err = $('#kc-claim-e'), input = $('#kc-claim-in');
    const fail = (msg) => { S.claim.error = msg; S.claim.busy = false; if (err) { err.textContent = msg; err.hidden = false; } input?.setAttribute('aria-invalid', 'true'); $('[data-act="claim"]')?.removeAttribute('disabled'); focusEl(input); };
    if (!c.ok) return fail(t('contrib.claim.bad'));
    S.claim.busy = true; S.claim.error = ''; $('[data-act="claim"]')?.setAttribute('disabled', ''); if (err) err.hidden = true;
    try {
      await api.claim(c.code);
      const me = await api.me();
      if (!S.open) return;
      S.nickname = me.nickname || S.nickname; S.crewNo = me.crewNo || ''; saveProfile(store, { nickname: S.nickname, crewNo: S.crewNo }); accounts.setProfile({ nickname: me.nickname, crewNo: me.crewNo });
      pushProfileToForm();   // (the form must show the claimed nickname and クルーNo.: the next report reads them from the fields, and a blank field would erase them on the server)
      S.mine = { state: 'ok', me }; S.claim = { open: false, value: '', error: '', busy: false, hint: '' }; S.xfer = { phase: 'idle' }; S.erase = { phase: 'idle' }; S.notice = t('contrib.claim.ok');
      renderMine(true); announce(t('contrib.claim.ok'));
    } catch (e) {
      const r = e.reason;
      fail(e.code === 'not_found' || r === 'code_not_found' ? t('contrib.claim.notfound') : e.code === 'validation' || r === 'code_malformed' ? t('contrib.claim.bad')
        : e.code === 'rate' ? t('contrib.claim.rate') : explainError(e, t));
    }
  }
  /** The nickname and クルーNo. fields show what the sheet knows (after a claim, after loading マイ投稿). */
  function pushProfileToForm() {
    const nick = $('#kc-nick'), crew = $('#kc-crew');
    if (nick && doc.activeElement !== nick) nick.value = S.nickname || '';
    if (crew && doc.activeElement !== crew) crew.value = S.crewNo || '';
  }
  /** This device lets go of the login, the remembered nickname / クルーNo. and the unsent text (nothing on the server changes). */
  function wipeLocal() {
    api.forget(); store.del(KEYS.profile); clearDraft(store);
    S.nickname = ''; S.crewNo = ''; S.note = ''; S.category = ''; S.mine = { state: 'anon' }; S.xfer = { phase: 'idle' }; S.erase = { phase: 'idle' }; S.sendKey = null; S.sendSig = '';
    const nick = $('#kc-nick'), crew = $('#kc-crew'), note = $('#kc-note'); if (nick) nick.value = ''; if (crew) crew.value = ''; if (note) note.value = '';
    const n = $('[data-f="note-n"]'); if (n) n.textContent = '0';
    for (const r of $$('input[name="category"]')) r.checked = false;
  }
  function forget() {
    if (!S.forgetArmed) {
      S.forgetArmed = true; const b = $('[data-act="forget"]'); if (b) b.textContent = lang() === 'en' ? 'Press again to forget' : 'もういちど押すと消えます';
      clearTimeout(forgetT); forgetT = setTimeout(() => { S.forgetArmed = false; const x = $('[data-act="forget"]'); if (x) x.textContent = t('contrib.forget'); }, 5000);
      announce(lang() === 'en' ? 'Press the button again to forget this device' : 'もういちど押すと、この端末の情報を消します');
      return;
    }
    S.forgetArmed = false; clearTimeout(forgetT);
    wipeLocal(); S.notice = t('contrib.forget.done');
    renderMine(true); announce(t('contrib.forget.done'));
  }
  // 「送ったデータをすべて削除」: a question first (the safe answer has the focus), then DELETE /me?confirm=1 and this device forgets the login too
  function renderErase() { const card = $('[data-f="erase-card"]'); if (card) card.innerHTML = eraseCardHtml(S.erase, t); }
  function startErase() { S.erase = { phase: 'confirm' }; renderErase(); focusEl($('[data-act="erase-no"]')); announce(t('contrib.erase.q') + ' ' + t('contrib.erase.warn')); }
  function cancelErase() { S.erase = { phase: 'idle' }; renderErase(); focusEl($('[data-act="erase"]')); }
  async function doErase() {
    if (!target.base) { announce(t('contrib.closed')); return; }   // DELETE /me must not go to an empty or relative URL
    S.erase = { phase: 'busy' }; renderErase(); announce(t('contrib.erase.busy'));
    try {
      await api.deleteMe();
      if (!S.open) { wipeLocal(); return; }
      wipeLocal(); S.notice = t('contrib.erase.done');
      renderMine(true); announce(t('contrib.erase.done'));
    } catch (e) {
      if (!S.open) return;
      S.erase = { phase: 'error', errorKey: messageKey(e) }; renderErase(); focusEl($('[data-act="erase"]'));
    }
  }

  // ---------------------------------------------------------------- the form
  const err = (field) => $(`#kc-e-${field}`);
  function setError(field, msg) {
    const el = err(field); if (!el) return;
    el.textContent = msg || ''; el.hidden = !msg;
    const input = field === 'category' ? null : field === 'crew' ? $('#kc-crew') : field === 'nick' ? $('#kc-nick') : field === 'note' ? $('#kc-note') : field === 'consent' ? $('input[name="consent"]') : null;
    if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
  }
  function clearErrors() { for (const f of ['category', 'note', 'photos', 'crew', 'nick', 'consent']) setError(f, ''); const a = $('#kc-alert'); if (a) { a.hidden = true; a.textContent = ''; } }
  function readFields() {
    S.note = $('#kc-note')?.value ?? S.note; S.nickname = $('#kc-nick')?.value ?? S.nickname; S.crewNo = $('#kc-crew')?.value ?? S.crewNo;
    S.consent = !!$('input[name="consent"]')?.checked; S.kind = $('input[name="kind"]:checked')?.value || S.kind; S.category = $('input[name="category"]:checked')?.value || '';
  }
  /** -> { ok, first (the control to focus) }. Messages go under the fields; one alert sums it up for screen readers. */
  function validate() {
    readFields(); clearErrors();
    const v = validateReport({ kind: S.kind, category: S.category, note: S.note, consent: S.consent, photos: S.photos.map((p) => p.file), crewNo: S.crewNo, nickname: S.nickname, hasShot: S.shotState !== 'fail' }, lim());
    if (v.ok) return { ok: true };
    const e = v.errors; let first = null;
    if (e.category) { setError('category', t('contrib.cat.err')); first ||= $('input[name="category"]'); }
    if (e.photos) {
      const bad = S.photos.find((p) => photoProblem(p.file, lim()));
      setError('photos', e.photos === 'needed' ? t('contrib.photos.err.needed') : e.photos === 'many' ? t('contrib.photos.err.many', { max: lim().photos }) : t('contrib.photos.err.' + e.photos, { name: bad?.name || '', mb: mbText(lim().photoBytes) }));
      first ||= $('#kc-file');
    }
    if (e.crewNo) { setError('crew', t('contrib.crew.err.' + e.crewNo, { n: checkCrewNo(S.crewNo).digits.length })); first ||= $('#kc-crew'); }
    if (e.nickname) { setError('nick', t('contrib.nick.err.link')); first ||= $('#kc-nick'); }
    if (e.consent) { setError('consent', t('contrib.consent.err')); first ||= $('input[name="consent"]'); }
    if (e.note) { setError('note', e.note === 'empty' ? t('contrib.note.err.empty') : e.note === 'long' ? t('contrib.note.err.long', { max: lim().note }) : t('contrib.err.validation')); first ||= $('#kc-note'); }
    const a = $('#kc-alert'); if (a) { a.textContent = t('contrib.check'); a.hidden = false; }
    return { ok: false, first };
  }
  async function addFiles(list) {
    const errs = [];
    for (const f of [...list]) {
      if (S.photos.length >= lim().photos) { errs.push(t('contrib.photos.err.many', { max: lim().photos })); break; }
      const p = photoProblem(f, lim());
      if (p) { errs.push(t('contrib.photos.err.' + p, { name: f.name, mb: mbText(lim().photoBytes) })); continue; }
      if (S.photos.some((x) => x.file.name === f.name && x.file.size === f.size && x.file.lastModified === f.lastModified)) continue;
      S.photos.push({ id: 'p' + (++S.pid), file: f, name: f.name || `photo-${S.pid}`, thumb: '', tried: false });
    }
    renderTiles(); setError('photos', [...new Set(errs)].join(' '));
    for (const p of S.photos.slice()) {
      if (p.tried) continue; p.tried = true;
      p.thumb = await makeThumb(p.file, { doc, win });
      if (!S.photos.includes(p) || !p.thumb) { if (p.thumb && !S.photos.includes(p)) URL.revokeObjectURL(p.thumb); continue; }
      const th = $(`.kc-tile[data-id="${p.id}"] .kc-thumb`); if (th) th.innerHTML = `<img src="${esc(p.thumb)}" alt="" decoding="async">`;
    }
  }
  function renderTiles() {
    const ul = $('#kc-tiles'); if (!ul) return;
    ul.innerHTML = tilesHtml(model(), t);
    const n = t('contrib.photos.count', { n: S.photos.length, max: lim().photos });
    ul.setAttribute('aria-label', n); const c = $('[data-f="photos-n"]'); if (c) c.textContent = n;
    ul.dataset.count = String(S.photos.length);
  }
  function removePhoto(id) {
    const i = S.photos.findIndex((p) => p.id === id); if (i < 0) return;
    const [p] = S.photos.splice(i, 1); if (p.thumb) URL.revokeObjectURL(p.thumb);
    renderTiles(); setError('photos', '');
    const next = $$('.kc-rm')[Math.min(i, S.photos.length - 1)];
    focusEl(next || $('#kc-file'));   // (the tile that had the focus is gone: the next remove button, else the picker)
    announce(t('contrib.photos.count', { n: S.photos.length, max: lim().photos }));
  }
  function persistDraft() { readFieldsSafe(); saveDraft(store, { kind: S.kind, category: S.category, note: S.note, crewNo: S.crewNo }); }
  function readFieldsSafe() { if (root && $('#kc-note')) readFields(); }
  function draftSoon() { clearTimeout(draftT); draftT = setTimeout(persistDraft, 400); }

  // ---------------------------------------------------------------- sending
  function progress(frac, key) {
    const wrap = $('.kc-prog'); if (!wrap) return;
    wrap.hidden = false;
    const bar = wrap.querySelector('progress'), txt = wrap.querySelector('[data-f="prog-t"]');
    const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
    bar.value = pct; txt.textContent = key === 'prep' ? t('contrib.preparing') : key === 'fin' ? t('contrib.finishing') : t('contrib.sending', { pct });
  }
  function setSending(on) {
    S.sending = on; root?.setAttribute('aria-busy', String(on));
    const send = $('[data-act="send"]'), cancel = $('[data-act="cancel"]'), form = $('#kc-form');
    // the fields are locked while the report goes (what was disabled before stays disabled afterwards)
    if (form) for (const f of form.querySelectorAll('input, textarea, button')) { if (on) { f.dataset.wasDisabled = f.disabled ? '1' : '0'; f.disabled = true; } else if (f.dataset.wasDisabled) { f.disabled = f.dataset.wasDisabled === '1'; delete f.dataset.wasDisabled; } }
    if (send) { send.disabled = on; send.setAttribute('aria-disabled', String(on)); }
    if (cancel) cancel.hidden = !on;
    if (!on) { const wrap = $('.kc-prog'); if (wrap) wrap.hidden = true; }
  }
  /** The login (and the profile) the report goes under: made when there is none; the nickname / クルーNo. are sent when they differ from what the server last heard. */
  async function ensureLogin() {
    const prof = { nickname: cleanNickname(S.nickname), crewNo: checkCrewNo(S.crewNo).digits }, acct = accounts.get();
    if (!acct) { await api.createContributor(prof); accounts.setProfile(prof); }
    else if (!acct.profile || acct.profile.nickname !== prof.nickname || acct.profile.crewNo !== prof.crewNo) { await api.updateProfile(prof); accounts.setProfile(prof); }
    saveProfile(store, prof);
  }
  /** What makes two attempts the same report: the words, the photos and the screenshot. A retry of the same report reuses its Idempotency-Key; a changed one gets a new key. */
  const reportSig = () => JSON.stringify([S.kind, S.category, S.note, S.photos.map((p) => [p.name, p.file.size, p.file.lastModified]), S.shot?.bytes || 0, S.pose?.at || '']);
  async function send() {
    if (S.sending) return;
    if (!target.base) { announce(t('contrib.closed')); return; }   // the form can open; it does not submit, and it does not call the network
    const v = validate();
    if (!v.ok) { focusEl(v.first); announce(t('contrib.check')); return; }
    if (!S.pose) S.pose = capturePoseSafe();
    if (!S.pose) { const a = $('#kc-alert'); if (a) { a.innerHTML = `<b>${esc(t('contrib.err.title'))}</b><span>${esc(t('contrib.err.validation'))}</span>`; a.hidden = false; } return; }
    setSending(true); progress(0, 'prep');
    const ctl = new AbortController(); S.ctl = ctl;
    try {
      if (S.shotP) await S.shotP;   // (a screenshot that is still being taken finishes first: the report must carry it; this never rejects)
      if (!S.shot?.blob && !String(S.note).trim() && !S.photos.length) {   // the capture failed and there is nothing else to send: the backend would refuse it as empty
        setSending(false); setError('note', t('contrib.note.err.empty')); focusEl($('#kc-note')); announce(t('contrib.note.err.empty')); return;
      }
      const sig = reportSig(); if (sig !== S.sendSig || !S.sendKey) { S.sendSig = sig; S.sendKey = newIdempotencyKey(); }
      const fields = () => ({ pose: S.pose, kind: S.kind, category: S.category, note: S.note, lang: lang(), consent: true, screenshot: S.shot?.blob || undefined, photos: S.photos.map((p) => p.file) });
      let res;
      for (let attempt = 0; ; attempt++) {
        try { await ensureLogin(); progress(0, 'up'); res = await api.submit(fields(), { signal: ctl.signal, idempotencyKey: S.sendKey, limits: lim(), onProgress: (l, n) => progress(n ? l / n : 0, l >= n ? 'fin' : 'up') }); break; }
        catch (e) { if (e.code === 'auth' && attempt === 0) { accounts.clear(); continue; } throw e; }
      }
      try { finishSent(res, S.open); } catch (e2) { console.warn('contrib: the report was sent, the screen could not be updated', e2); }   // (never tell the visitor it failed after it went: they would send it twice)
    } catch (e) {
      if (!S.open && e.code === 'aborted') return;
      setSending(false);
      if (e.code === 'aborted') { announce(t('contrib.cancel')); focusEl($('[data-act="send"]')); return; }
      const msg = explainError(e, t), a = $('#kc-alert');
      if (a) { a.innerHTML = `<b>${esc(t('contrib.err.title'))}</b><span>${esc(msg)}</span>`; a.hidden = false; a.scrollIntoView?.({ block: 'nearest' }); }
      const label = $('[data-f="send-t"]'); if (label) label.textContent = t('contrib.retry');
      announce(t('contrib.err.title') + '. ' + msg);
      focusEl($('[data-act="send"]'));
    } finally { S.ctl = null; }
  }
  /** The sent report's fields go back to blank (kind: a problem report; no category, no note, no consent). The nickname and the クルーNo. stay: they are the visitor's. */
  function clearFields() {
    root.dataset.kind = 'issue';
    const k = $('input[name="kind"][value="issue"]'); if (k) k.checked = true;
    for (const r of $$('input[name="category"]')) r.checked = false;
    const note = $('#kc-note'); if (note) note.value = '';
    const n = $('[data-f="note-n"]'); if (n) n.textContent = '0';
    const c = $('input[name="consent"]'); if (c) c.checked = false;
    clearErrors();
  }
  function finishSent(res, visible) {
    setSending(false);
    clearDraft(store); S.note = ''; S.category = ''; S.consent = false; S.kind = 'issue'; S.mine = { state: 'loading' }; S.sendKey = null; S.sendSig = '';
    for (const p of S.photos.splice(0)) if (p.thumb) URL.revokeObjectURL(p.thumb);
    releaseShot();
    if (!visible || !root) return;
    const el = $('[data-sub="done"]'); if (el) el.innerHTML = doneHtml(t, model());
    clearFields();
    renderTiles(); updateShot();
    setSub('done'); announce(t('contrib.done.title'));
    void res;
  }

  // ---------------------------------------------------------------- events
  function onClick(e) {
    const b = e.target.closest?.('[data-act]'); if (!b || !root.contains(b)) return;
    const act = b.dataset.act;
    if (act === 'close') close();
    else if (act === 'scrim') { if (!S.sending) close(); }
    else if (act === 'tab') setTab(b.dataset.tab, { focus: false });
    else if (act === 'goto') setTab(b.dataset.tab, { focus: true });
    else if (act === 'privacy') setSub('privacy');
    else if (act === 'privacy-back') { setSub('form', { focus: false }); focusEl($('[data-act="privacy"]')); }
    else if (act === 'rm') removePhoto(b.dataset.id);
    else if (act === 'cancel') { S.ctl?.abort(); }
    else if (act === 'again') { restartForm(); }
    else if (act === 'xfer') { if (S.xfer.phase === 'ready' || S.xfer.phase === 'expired' || S.xfer.phase === 'idle' || S.xfer.phase === 'error') makeTransfer(); }
    else if (act === 'xfer-hide') hideTransfer();
    else if (act === 'copy') copyCode();
    else if (act === 'forget') forget();
    else if (act === 'erase') startErase();
    else if (act === 'erase-yes') doErase();
    else if (act === 'erase-no') cancelErase();
    else if (act === 'reload-mine') loadMine({ focus: true });
    else if (act === 'reload-board') loadBoard({ focus: true });
    else if (act === 'lang') toggleLang();
  }
  function restartForm() {
    S.pose = capturePoseSafe(); S.meta = metaLines(); S.sendKey = null; S.sendSig = '';
    startCapture();
    clearErrors(); const label = $('[data-f="send-t"]'); if (label) label.textContent = t('contrib.submit');
    updateShot(); setSub('form', { focus: false }); syncView(); focusEl(sheet);
  }
  const capturePoseSafe = () => { try { return capturePose(ctx, { win }); } catch { return null; } };
  function onInput(e) {
    const el = e.target;
    if (el.id === 'kc-note') { const n = $('[data-f="note-n"]'); if (n) n.textContent = String(el.value.length); draftSoon(); }
    else if (el.id === 'kc-nick' || el.id === 'kc-crew') { setError(el.id === 'kc-crew' ? 'crew' : 'nick', ''); draftSoon(); }
    else if (el.id === 'kc-claim-in') { S.claim.value = el.value; if (S.claim.error) { S.claim.error = ''; const x = $('#kc-claim-e'); if (x) x.hidden = true; el.removeAttribute('aria-invalid'); } }
  }
  function onChange(e) {
    const el = e.target;
    if (el.name === 'kind') { S.kind = el.value; root.dataset.kind = S.kind; setError('photos', ''); persistDraft(); }
    else if (el.name === 'category') { S.category = el.value; setError('category', ''); persistDraft(); }
    else if (el.name === 'consent') { S.consent = el.checked; if (el.checked) setError('consent', ''); }
    else if (el.dataset.f === 'file' || el.dataset.f === 'cam') { const files = [...(el.files || [])]; el.value = ''; if (files.length) addFiles(files); }
    else if (el.id === 'kc-crew') { const c = checkCrewNo(el.value); if (c.ok && c.digits) el.value = c.digits; if (c.ok) setError('crew', ''); else setError('crew', t('contrib.crew.err.' + c.error, { n: c.digits.length })); persistDraft(); if (c.ok) saveProfile(store, { nickname: loadProfile(store).nickname, crewNo: c.digits }); }
    else if (el.id === 'kc-nick') { const n = cleanNickname(el.value); if (n !== el.value) el.value = n; setError('nick', nicknameProblem(n) ? t('contrib.nick.err.link') : ''); persistDraft(); if (!nicknameProblem(n)) saveProfile(store, { nickname: n, crewNo: loadProfile(store).crewNo }); }
  }
  function onSubmit(e) {
    e.preventDefault();
    if (e.target.id === 'kc-form') send();
    else if (e.target.id === 'kc-claimform') { S.claim.value = $('#kc-claim-in')?.value ?? S.claim.value; doClaim(); }
  }
  /** Keyboard, for the whole page while the sheet is open (a window capture listener: it runs before the HUD's, the car's and the ship's). */
  function onKey(e) {
    if (!S.open || e.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); back(); return; }
    if (e.key === 'Tab') {
      const list = focusables(sheet), active = doc.activeElement && sheet.contains(doc.activeElement) ? doc.activeElement : null;
      const next = nextFocus(list, active, e.shiftKey);
      if (next) { e.preventDefault(); focusEl(next); } else if (!list.length) e.preventDefault();
      e.stopImmediatePropagation(); return;
    }
    const tab = e.target?.closest?.('.kc-tab');
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      const tabs = $$('.kc-tab'), i = tabs.indexOf(tab);
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      e.preventDefault(); setTab(tabs[j].dataset.tab, { focus: false }); focusEl(tabs[j]);
    }
    e.stopImmediatePropagation();   // the town's shortcuts (WASD, F, H, M, 1-9 ...) do not run while the visitor types or tabs about; the default action (typing, clicking) is untouched
  }
  function toggleLang() {
    if (!I?.set) return;
    I.set(lang() === 'en' ? 'ja' : 'en');
    try { life?.hud?.render?.(); } catch { /* hud gone */ }
    readFields();
    const tab = S.tab, sub = S.sub; root.innerHTML = shellHtml(model(), t); sheet = $('#kc-sheet'); root.setAttribute('lang', lang());
    S.tab = tab; S.sub = sub; if (sub === 'done') { const el = $('[data-sub="done"]'); if (el) el.innerHTML = doneHtml(t, model()); }
    syncView(); S.meta = metaLines(); updateShot();
    if (tab === 'mine') renderMine(false); else if (tab === 'board') renderBoard(false);
    focusEl($('[data-act="lang"]'));
  }
  // ---------------------------------------------------------------- wiring
  win.addEventListener('keydown', onKey, true);
  // a transfer link (?claim=CODE from the QR code on another device): the code is filled in, shown once the visitor is in the town
  const claim = claimFromSearch(search);
  if (claim) {
    try { const u = new URL(win.location.href); u.searchParams.delete('claim'); win.history?.replaceState?.(null, '', u.pathname + u.search + u.hash); } catch { /* keep the address as it is */ }
    let mo = null;
    const go = () => { if (doc.body.classList.contains('playing') || o.force) { mo?.disconnect(); setTimeout(() => open({ tab: 'mine', claim }), 400); return true; } return false; };
    if (!go() && typeof MutationObserver === 'function') { mo = new MutationObserver(go); mo.observe(doc.body, { attributes: true, attributeFilter: ['class'] }); }
  }
  const api2 = {
    open, close, back, setTab, api, accounts, target, t, root: () => root,
    get isOpen() { return S.open; },
    get state() { return S; },
    /** Take the keyboard handler off (tests that mount twice). */
    destroy() { win.removeEventListener('keydown', onKey, true); close(); setBackground(false); root?.remove(); root = null; },
  };
  void KINDS; void CATEGORIES;
  try { win.__contrib = api2; } catch { /* a frozen window */ }   // (like window.__pad / __life: the e2e and the console reach the sheet through it)
  return api2;
}
