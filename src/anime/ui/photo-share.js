// [ui-c2] What happens to a photo after it is taken, on a phone (mobile review F1; the UI round notes (ui-c2, not included)).
//
// A desktop saves the PNG straight to Downloads (ui/photo.js). A phone cannot: `<a download>` on iOS lands in Files, not Photos, and says nothing when it is done. So a phone shows a
// card (the picture, 保存・共有) and the button opens the SHARE SHEET (navigator.share with the PNG as a file: on iOS its "Save Image" goes to Photos; AirDrop, LINE and the rest are
// there too). When the browser cannot share files the same button downloads the PNG instead. The page says 保存しました only AFTER the share sheet has resolved (or the download has been
// started): `deliverPhoto` returns what happened and the card hands it on (`card.done`).
//
// iOS lets navigator.share run only inside a user gesture, and a photo takes a second or two to render, so the share is NEVER started after the render: it is the card button's own click
// that calls it, with the File already built. `deliverPhoto` calls `nav.share` before its first await for the same reason.
//
//   const card = createPhotoCard({ lang, pad, nav });   // the card is up at once (撮影中…) so a tap is answered before the render blocks the thread
//   card.show({ w, h });  ...render...  await card.ready({ blob, name });  const how = await card.done;   // 'shared' | 'downloaded' | 'closed'
//   deliverPhoto(file, { nav, doc })  ->  'shared' | 'downloaded' | 'cancelled' (the visitor dismissed the sheet) | 'failed'
import TEXT from '../../../data/ui-photo-i18n.json';

/** The card's strings in a language (ja when the language or a key is missing). */
export const photoText = (lang = 'ja') => ({ ...TEXT.ja, ...(TEXT[lang] || {}) });

export const SHARE_TITLE = '気仙沼リビングシティ';

/** Can this browser hand the file to the share sheet? (Safari 15+, Chrome on Android; not desktop Firefox.) */
export function canShareFile(nav, file) {
  try { return !!(nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })); } catch { return false; }
}

/** A data: URL -> Blob (only for a canvas that cannot toBlob). */
export function dataUrlToBlob(url) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(url));
  if (!m) throw new Error('not a data URL');
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || 'image/png' });
}

/** Start a download of an href with a file name (an <a download> click). The object URL, if it is one, is revoked a little later. */
export function downloadHref(href, name, doc = document, { revokeAfter = 4000 } = {}) {
  const a = doc.createElement('a'); a.href = href; a.download = name; doc.body.appendChild(a); a.click(); a.remove();
  if (revokeAfter && /^blob:/.test(String(href))) setTimeout(() => { try { URL.revokeObjectURL(href); } catch { /* gone */ } }, revokeAfter);
}

/**
 * Save or share the file. Call it from a click handler and do NOT await anything before it: the share sheet needs the user gesture (iOS refuses a share started after a long async step).
 *   'shared'     navigator.share resolved (the visitor chose a target: Save Image, AirDrop, ...)
 *   'downloaded' no share sheet (or it failed): the PNG was handed to the browser's download
 *   'cancelled'  the visitor dismissed the share sheet (AbortError): nothing is saved, nothing is said
 *   'failed'     the share sheet failed and so did the download
 */
export async function deliverPhoto(file, { nav = globalThis.navigator, doc = globalThis.document } = {}) {
  if (canShareFile(nav, file)) {
    try { await nav.share({ files: [file], title: SHARE_TITLE }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; /* NotAllowedError, DataError, ...: fall back to the download */ }
  }
  try {
    const href = URL.createObjectURL(file);
    downloadHref(href, file.name, doc, { revokeAfter: 60000 });   // (a minute: iOS may ask before it takes the file)
    return 'downloaded';
  } catch { return 'failed'; }
}

// ------------------------------------------------------------------ the card
/** The card's CSS: a paper card on a navy veil, round Zen Maru Gothic, a 44 px primary button; only opacity and transform move. Injected with the first card. */
export const PHOTO_CSS = `#klc-photo{position:fixed;inset:0;z-index:45;display:grid;place-items:center;box-sizing:border-box;
padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
background:rgba(31,58,104,.5);color:#33304a;font-family:"Zen Maru Gothic","Noto Sans JP","Hiragino Sans","Yu Gothic UI",sans-serif;line-break:strict;
opacity:0;transition:opacity 200ms cubic-bezier(.23,1,.32,1);-webkit-tap-highlight-color:transparent}
#klc-photo[data-open="1"]{opacity:1}
#klc-photo .c{width:min(440px,100%);max-height:100%;box-sizing:border-box;display:grid;gap:10px;justify-items:center;padding:14px 14px 12px;border-radius:16px;
background:#fbf8f2;box-shadow:0 18px 50px rgba(31,58,104,.28),0 0 0 1px rgba(51,48,74,.08);transform:translateY(10px) scale(.985);transition:transform 240ms cubic-bezier(.23,1,.32,1)}
#klc-photo[data-open="1"] .c{transform:none}
#klc-photo h2{margin:0;font:900 18px/1.3 "Zen Maru Gothic","Noto Sans JP",sans-serif;color:#1f3a68;text-align:center;word-break:auto-phrase;text-wrap:balance}
#klc-photo [data-s]{display:none}
#klc-photo[data-state="capturing"] [data-s="capturing"],#klc-photo[data-state="ready"] [data-s="ready"],#klc-photo[data-state="failed"] [data-s="failed"]{display:inline}
#klc-photo .pic{position:relative;display:grid;place-items:center;border-radius:12px;overflow:hidden;background:linear-gradient(160deg,#e6eef8,#cfdcec);aspect-ratio:var(--klc-photo-r,1.7778);
width:min(100%,calc(min(70vh,100vh - 190px)*var(--klc-photo-r,1.7778)));width:min(100%,calc(min(70dvh,100dvh - 190px)*var(--klc-photo-r,1.7778)))}
#klc-photo img{display:block;width:100%;height:100%;object-fit:contain;-webkit-touch-callout:default;-webkit-user-select:auto;user-select:auto}
#klc-photo[data-state="ready"] .spin,#klc-photo[data-state="failed"] .spin{display:none}
#klc-photo:not([data-state="ready"]) img{display:none}
#klc-photo .spin{width:30px;height:30px;border-radius:50%;border:3px solid rgba(31,58,104,.18);border-top-color:#1f3a68;animation:klc-photo-spin 800ms linear infinite}
@keyframes klc-photo-spin{to{transform:rotate(360deg)}}
#klc-photo .m{margin:0;font:500 13px/1.4 "Noto Sans JP",sans-serif;color:#a73a2b;text-align:center;text-wrap:pretty}
#klc-photo .m:empty{display:none}
#klc-photo .b{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
#klc-photo button{min-height:44px;padding:0 22px;border:0;border-radius:999px;font:700 16px/1 "Zen Maru Gothic","Noto Sans JP",sans-serif;cursor:pointer;touch-action:manipulation;transition:transform 140ms cubic-bezier(.23,1,.32,1)}
#klc-photo button:active{transform:scale(.97)}
#klc-photo button.p{background:#1f3a68;color:#fff}
#klc-photo button.s{background:transparent;color:#1f3a68}
#klc-photo button:focus-visible{outline:3px solid #2f7fae;outline-offset:2px}
#klc-photo[data-state="capturing"] button.p,#klc-photo[data-state="failed"] button.p{display:none}
@media (orientation:landscape) and (max-height:520px){#klc-photo .c{width:min(720px,100%)}#klc-photo .pic{width:min(100%,calc((100vh - 170px)*var(--klc-photo-r,1.7778)));width:min(100%,calc((100dvh - 170px)*var(--klc-photo-r,1.7778)))}}
@media (prefers-reduced-motion:reduce){#klc-photo,#klc-photo .c,#klc-photo button{transition:none}#klc-photo .spin{animation-duration:1600ms}}`;

/**
 * The card. Created when the shutter is pressed (state 'capturing': a skeleton at the photo's aspect and a spinner), then `ready({ blob, name })` puts the picture in and arms the button.
 * `done` resolves once with 'shared' | 'downloaded' | 'closed'. Only one card exists: a new one closes the old one. `env` is injectable for tests ({ nav, doc, win }).
 */
let current = null;
export function createPhotoCard({ lang = 'ja', pad = null, onDone = null, env = {} } = {}) {
  const doc = env.doc ?? globalThis.document, nav = env.nav ?? globalThis.navigator, win = env.win ?? globalThis;
  if (current) current.close();
  const T = photoText(lang);
  let state = 'capturing', finished = false, busy = false, objectUrl = null, file = null, el = null;
  let resolveDone; const done = new Promise((r) => { resolveDone = r; });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  if (!doc.getElementById('klc-photo-css')) { const st = doc.createElement('style'); st.id = 'klc-photo-css'; st.textContent = PHOTO_CSS; doc.head.appendChild(st); }
  el = doc.createElement('div'); el.id = 'klc-photo'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'klc-photo-t'); el.setAttribute('lang', lang);
  el.dataset.state = 'capturing'; el.dataset.open = '0';
  el.innerHTML = `<div class="c"><h2 id="klc-photo-t"><span data-s="capturing">${esc(T.capturing)}</span><span data-s="ready">${esc(T.ready)}</span><span data-s="failed">${esc(T.failed)}</span></h2>`
    + `<div class="pic"><i class="spin" aria-hidden="true"></i><img alt="${esc(T.alt)}"></div><p class="m" role="status"></p>`
    + `<div class="b"><button type="button" class="p" data-a="save">${esc(T.saveOnly)}</button><button type="button" class="s" data-a="close">${esc(T.close)}</button></div></div>`;
  const q = (s) => el.querySelector(s);
  const save = q('[data-a="save"]'), msg = q('.m'), img = q('img');
  doc.body.appendChild(el);
  void el.offsetWidth;   // a style flush: the closed state (opacity 0) is computed now, so the fade to open (next frame) is a transition and not a pop
  pad?.suppress?.('photo-card', true);   // the pad steps aside: the card owns every touch
  const onKey = (e) => { if (e.code === 'Escape' || e.key === 'Escape') finish('closed'); };
  doc.addEventListener?.('keydown', onKey, true);
  const raf = win.requestAnimationFrame ? (f) => win.requestAnimationFrame(f) : (f) => setTimeout(f, 16);
  raf(() => { if (!finished) el.dataset.open = '1'; });   // the fade runs on the compositor, so it keeps going while the render blocks the main thread

  function setState(s) { state = s; el.dataset.state = s; }
  function finish(how) {
    if (finished) return;
    finished = true;
    el.dataset.open = '0';
    doc.removeEventListener?.('keydown', onKey, true);
    pad?.suppress?.('photo-card', false);
    if (current === card) current = null;
    setTimeout(() => { try { el.remove(); } catch { /* gone */ } if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch { /* gone */ } objectUrl = null; } try { img.removeAttribute('src'); } catch { /* gone */ } }, 260);
    resolveDone(how);
    try { onDone?.(how); } catch { /* a courtesy */ }
  }

  q('[data-a="close"]').addEventListener('click', () => finish('closed'));
  save.addEventListener('click', () => {
    if (busy || state !== 'ready' || !file) return;
    busy = true; msg.textContent = '';
    deliverPhoto(file, { nav, doc }).then((how) => {
      busy = false;
      if (how === 'shared' || how === 'downloaded') finish(how);
      else if (how === 'failed') msg.textContent = T.saveFailed;   // 'cancelled': the visitor dismissed the sheet; the card stays for another try
    });
  });

  const card = {
    get el() { return el; }, get state() { return state; }, done,
    /** The card is up: a skeleton at the photo's aspect (no jump when the picture arrives). */
    show({ w = 16, h = 9 } = {}) { const st = el.querySelector('.pic').style, r = (w / h).toFixed(4); if (st.setProperty) st.setProperty('--klc-photo-r', r); else st['--klc-photo-r'] = r; setState('capturing'); return card; },
    /** The picture is ready: show it, arm the button (保存・共有 when the browser can share the file, 保存 when it can only download). Resolves when the picture is on screen. */
    async ready({ blob, name = 'kesennuma.png' }) {
      if (finished) return card;
      file = new File([blob], name, { type: 'image/png' });
      objectUrl = URL.createObjectURL(blob);
      img.src = objectUrl;
      save.textContent = canShareFile(nav, file) ? T.save : T.saveOnly;
      try { if (img.decode) await Promise.race([img.decode(), new Promise((r) => setTimeout(r, 1500))]); } catch { /* the picture shows when it shows */ }
      if (finished) return card;
      setState('ready');
      try { save.focus({ preventScroll: true }); } catch { /* not focusable yet */ }
      return card;
    },
    /** The shutter failed: say so, leave a close button. */
    fail() { if (!finished) setState('failed'); return card; },
    /** Close it (the visitor's 閉じる does the same). */
    close() { finish('closed'); },
  };
  current = card;
  return card;
}

/** The card that is open now, or null (tests and the e2e check read it). */
export const openPhotoCard = () => current;
