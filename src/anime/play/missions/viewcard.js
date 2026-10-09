// [play:views] The hunt card, the reveal, the full-screen photo and the けしき帳.
// Paper and 紺, the same family as the quest card. 浅葱色 #00A3AF is the hint only (和色大辞典).

export const VIEW_CSS = `
#klc-m .m-view {
  position: absolute; left: 0; right: 0; width: calc(100% - 24px); max-width: 480px; z-index: 6;
  margin: 0 auto; background: #FBFAF5; border-radius: 16px; overflow: auto; pointer-events: auto;
  box-shadow: 0 16px 48px rgba(23, 24, 75, 0.28); display: flex; flex-direction: column;
  top: calc(72px + env(safe-area-inset-top));
  max-height: calc(100% - 120px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  line-break: strict;
}
#klc-m:has(.m-view:not([hidden])) :is(.m-rings, .m-balloons, .m-edge),
body:has(#klc-play .sheet:not([hidden])) #klc-m :is(.m-rings, .m-balloons, .m-edge) { visibility: hidden; }
#klc-m .m-view[hidden] { display: none !important; }
#klc-m .m-view-scroll { overflow: auto; padding: 4px 16px 16px; }
#klc-m .m-view-lead, #klc-m .m-view-ask, #klc-m .m-view-area, #klc-m .m-view-meta, #klc-m .m-view-wait {
  margin: 0 0 8px; font-size: 16px; line-height: 1.75;
}
#klc-m .m-view-area {
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 18px;
  text-wrap: balance; word-break: auto-phrase;
}
#klc-m .m-view-meta, #klc-m .m-view-wait { font-size: 14px; color: #223A70; }
#klc-m .m-view-frame, #klc-m .m-view-pair button {
  display: block; width: 100%; margin: 0 0 8px; padding: 0; border: 0; background: transparent;
  min-height: 44px; border-radius: 8px;
}
#klc-m .m-view-frame img, #klc-m .m-view-pair img {
  display: block; width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 8px; background: #E6E2D6;
}
#klc-m .m-view-frame img { aspect-ratio: 16 / 10; max-height: 42vh; }
#klc-m .m-view-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0 0 8px; }
#klc-m .m-view-pair figure { margin: 0; min-width: 0; }
#klc-m .m-view-pair figcaption { margin-top: 4px; font-size: 13px; line-height: 1.5; color: #223A70; text-align: center; line-break: strict; word-break: auto-phrase; }
#klc-m .m-view-acts { display: flex; flex-direction: column; align-items: stretch; gap: 8px; margin-top: 8px; }
#klc-m .m-view-acts a, #klc-m .m-view-acts button {
  flex: none; width: 100%; min-height: 44px; padding: 8px 16px; border: 0; border-radius: 999px;
  background: #223A70; color: #FBFAF5; text-decoration: none; text-align: center; white-space: nowrap;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 16px; line-height: 1.3;
}
/* the LINE link is an <a>: border-box and a centred flex row, so it matches the buttons (it overflowed the card at 393 px) */
#klc-m .m-view-acts a { box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
#klc-m .m-view-acts .m-view-soft { background: #FBFAF5; color: #223A70; box-shadow: inset 0 0 0 2px #223A70; }
#klc-m .m-view-acts a:active, #klc-m .m-view-acts button:active { transform: scale(0.94); }
#klc-m .m-view-flash { animation: m-view-flash 420ms ease-out; }
@keyframes m-view-flash {
  0% { box-shadow: 0 0 0 0 rgba(248, 181, 0, 0.0), 0 16px 48px rgba(23, 24, 75, 0.28); }
  35% { box-shadow: 0 0 0 8px rgba(248, 181, 0, 0.85), 0 16px 48px rgba(23, 24, 75, 0.28); }
  100% { box-shadow: 0 0 0 0 rgba(248, 181, 0, 0), 0 16px 48px rgba(23, 24, 75, 0.28); }
}
#klc-m .m-viewer {
  position: absolute; inset: 0; z-index: 9; display: flex; align-items: center; justify-content: center;
  background: rgba(23, 24, 75, 0.92); pointer-events: auto; touch-action: none;
}
#klc-m .m-viewer[hidden] { display: none !important; }
#klc-m .m-viewer img { max-width: calc(100% - 32px); max-height: calc(100% - 96px); object-fit: contain; transform-origin: center center; }
#klc-m .m-viewer .m-x { position: absolute; top: calc(8px + env(safe-area-inset-top)); right: calc(8px + env(safe-area-inset-right)); color: #FBFAF5; }
.m-view-book { font-family: "Noto Sans JP", "Hiragino Sans", sans-serif; color: #17184b; line-break: strict; }
.m-view-book-lead { margin: 4px 0 12px; font-size: 15px; line-height: 1.75; }
.m-view-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
@media (min-width: 721px) { .m-view-grid { grid-template-columns: repeat(4, 1fr); } }
.m-view-cell {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  min-height: 88px; padding: 8px; border-radius: 8px; border: 0; background: #FBFAF5;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 14px; color: #223A70;
}
.m-view-cell img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; background: #E6E2D6; }
.m-view-empty { border: 2px dashed rgba(34, 58, 112, 0.35); color: rgba(34, 58, 112, 0.45); background: transparent; }
@media (prefers-reduced-motion: reduce) {
  #klc-m .m-view-flash { animation: none; }
  #klc-m .m-view-acts a:active, #klc-m .m-view-acts button:active { transform: none; }
}
`;

const SAFE_IMG = /^(?:\/data\/play\/views\/V\d{2}\.webp|data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/;

function safeSrc(src) {
  return typeof src === 'string' && SAFE_IMG.test(src) ? src : '';
}

function el(doc, tag, cls) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

function btn(doc, act, label, soft) {
  const b = el(doc, 'button', soft ? 'm-view-soft' : '');
  b.type = 'button';
  b.dataset.act = act;
  b.textContent = label || '';
  return b;
}

function photoButton(doc, src, label) {
  const b = el(doc, 'button', 'm-view-frame');
  b.type = 'button';
  b.dataset.act = 'zoom';
  b.dataset.src = src;
  if (label) b.setAttribute('aria-label', label);
  const img = el(doc, 'img');
  img.src = src;
  img.alt = label || '';
  b.appendChild(img);
  return b;
}

/**
 * @param {Document} doc
 * @param {HTMLElement} root #klc-m
 * @param {{ onClose?: Function, onReport?: Function, onSent?: Function, onShare?: Function, onOpen?: Function }} hooks
 */
export function mountViews(doc, root, hooks) {
  const card = el(doc, 'div', 'm-view');
  card.hidden = true;
  const bar = el(doc, 'div', 'm-bar');
  const title = el(doc, 'h2');
  const x = el(doc, 'button', 'm-x');
  x.type = 'button';
  x.dataset.act = 'close';
  bar.appendChild(title);
  bar.appendChild(x);
  const scroll = el(doc, 'div', 'm-view-scroll');
  card.appendChild(bar);
  card.appendChild(scroll);
  root.appendChild(card);

  const viewer = el(doc, 'div', 'm-viewer');
  viewer.hidden = true;
  const vx = el(doc, 'button', 'm-x');
  vx.type = 'button';
  vx.dataset.act = 'viewer-close';
  const vimg = el(doc, 'img');
  vimg.alt = '';
  viewer.appendChild(vx);
  viewer.appendChild(vimg);
  root.appendChild(viewer);

  let scale = 1;
  const pointers = new Map();

  function paintScale() {
    vimg.style.transform = 'scale(' + scale + ')';
  }
  function closeViewer() {
    viewer.hidden = true;
    scale = 1;
    pointers.clear();
    paintScale();
    vimg.removeAttribute('src');
  }
  function openViewer(src, label) {
    const ok = safeSrc(src);
    if (!ok) return;
    vimg.src = ok;
    vimg.alt = label || '';
    vx.textContent = x.textContent || hooks.closeLabel || 'とじる';
    scale = 1;
    paintScale();
    viewer.hidden = false;
    vx.focus();
  }

  viewer.addEventListener('pointerdown', (e) => {
    if (e.target === vx) return;
    viewer.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  viewer.addEventListener('pointerup', (e) => pointers.delete(e.pointerId));
  viewer.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
  viewer.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size < 2) return;
    const pts = [...pointers.values()];
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (!viewer._pinch) { viewer._pinch = d; viewer._base = scale; return; }
    scale = Math.min(4, Math.max(1, viewer._base * (d / viewer._pinch)));
    paintScale();
  });
  viewer.addEventListener('pointerup', () => { if (pointers.size < 2) viewer._pinch = 0; });
  viewer.addEventListener('wheel', (e) => {
    if (viewer.hidden) return;
    e.preventDefault();
    scale = Math.min(4, Math.max(1, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
    paintScale();
  }, { passive: false });

  function hide(notify) {
    const was = !card.hidden;
    card.hidden = true;
    card.classList.remove('m-view-flash');
    if (was && notify) hooks.onClose?.();
  }

  function show(model, flash) {
    scroll.textContent = '';
    card.dataset.view = model.id || '';
    card.dataset.kind = model.kind || '';
    title.textContent = model.title || '';
    x.textContent = model.close || '';
    if (model.lead) {
      const p = el(doc, 'p', 'm-view-lead');
      p.textContent = model.lead;
      scroll.appendChild(p);
    }
    if (model.ask) {
      const p = el(doc, 'p', 'm-view-ask');
      p.textContent = model.ask;
      scroll.appendChild(p);
    }
    if (model.pair) {
      const pair = el(doc, 'div', 'm-view-pair');
      for (let i = 0; i < model.pair.length; i++) {
        const side = model.pair[i];
        const fig = el(doc, 'figure');
        const src = safeSrc(side.src);
        if (src) fig.appendChild(photoButton(doc, src, side.alt || model.zoom || ''));
        const cap = el(doc, 'figcaption');
        const parts = String(side.caption || '').split(' · ').filter(Boolean);
        for (let p = 0; p < parts.length; p++) {
          if (p) cap.appendChild(doc.createElement('br'));
          cap.appendChild(doc.createTextNode(parts[p]));
        }
        fig.appendChild(cap);
        pair.appendChild(fig);
      }
      scroll.appendChild(pair);
    } else if (safeSrc(model.image)) {
      scroll.appendChild(photoButton(doc, safeSrc(model.image), model.zoom || model.area || ''));
    }
    if (model.area) {
      const p = el(doc, 'p', 'm-view-area');
      p.textContent = model.area;
      scroll.appendChild(p);
    }
    if (model.meta) {
      const p = el(doc, 'p', 'm-view-meta');
      p.textContent = model.meta;
      scroll.appendChild(p);
    }
    const acts = el(doc, 'div', 'm-view-acts');
    if (model.lineUrl) {
      const a = el(doc, 'a');
      a.href = model.lineUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = model.lineLabel || '';
      acts.appendChild(a);
    }
    if (model.sentLabel) acts.appendChild(btn(doc, 'sent', model.sentLabel, false));
    if (model.keepLabel) acts.appendChild(btn(doc, 'keep', model.keepLabel, false));
    if (model.reportLabel) acts.appendChild(btn(doc, 'report', model.reportLabel, true));
    if (model.shareLabel) acts.appendChild(btn(doc, 'share', model.shareLabel, true));
    if (acts.childNodes.length) scroll.appendChild(acts);
    if (model.wait) {
      const p = el(doc, 'p', 'm-view-wait');
      p.dataset.act = 'wait';
      p.textContent = model.wait;
      scroll.appendChild(p);
    }
    card.hidden = false;
    card.classList.remove('m-view-flash');
    if (flash) {
      try { void card.offsetWidth; } catch { /* a test DOM may not layout */ }
      card.classList.add('m-view-flash');
    }
    x.focus();
  }

  card.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-act]');
    if (!b || !card.contains(b)) return;
    const act = b.dataset.act;
    const id = card.dataset.view || '';
    if (act === 'zoom') { openViewer(b.dataset.src, b.getAttribute('aria-label') || ''); return; }
    if (act === 'close' || act === 'keep') { hide(true); return; }
    if (act === 'report') hooks.onReport?.(id);
    if (act === 'sent') hooks.onSent?.(id);
    if (act === 'share') hooks.onShare?.(id, card);
  });
  viewer.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-act]');
    if (b?.dataset.act === 'viewer-close') closeViewer();
  });

  return {
    showHunt(model) { show(model, false); },
    showReveal(model) { show(model, !hooks.reduce); },
    hide() { hide(false); },
    isOpen: () => !card.hidden,
    viewerOpen: () => !viewer.hidden,
    closeViewer,
    openViewer,
    fillAlbum(host, model) {
      host.textContent = '';
      const book = el(doc, 'div', 'm-view-book');
      if (model.lead) {
        const lead = el(doc, 'p', 'm-view-book-lead');
        lead.textContent = model.lead;
        book.appendChild(lead);
      }
      const grid = el(doc, 'div', 'm-view-grid');
      const cells = model.cells || [];
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (!cell.found) {
          const blank = el(doc, 'div', 'm-view-cell m-view-empty');
          blank.textContent = model.blank || '';
          grid.appendChild(blank);
          continue;
        }
        const b = el(doc, 'button', 'm-view-cell');
        b.type = 'button';
        b.dataset.id = cell.id;
        const src = safeSrc(cell.image);
        if (src) {
          const img = el(doc, 'img');
          img.src = src;
          img.alt = cell.alt || '';
          b.appendChild(img);
        }
        const name = el(doc, 'span');
        name.textContent = cell.title || '';
        b.appendChild(name);
        b.addEventListener('click', () => hooks.onOpen?.(cell.id));
        grid.appendChild(b);
      }
      book.appendChild(grid);
      host.appendChild(book);
    },
  };
}
