// [craft] The in-page lint of the craft audit (docs/CRAFT.md): one function, evaluated in the page after a state has settled (tools/anime/craft-shots.mjs), that measures what a craftsperson
// would check by eye and returns it as data, so the same check can be repeated before and after a fix:
//   targets   interactive elements under 44 x 44 pt (sections 3 and 7)
//   safe      content inside the safe-area insets (the Dynamic Island, the home indicator, the landscape sides)
//   trunc     text cut by overflow (ellipsis or a clipped box)
//   lines     per visual line: a line that starts with 、。」）ー etc. (kinsoku), a lone character on the last line (orphan), a Japanese heading that wraps in the middle of a word
//   spacing   Japanese typesetting mistakes in the rendered text (a space between two Japanese characters, half-width kana, full-width digits, ASCII punctuation next to Japanese, "..." for ...)
//   fonts     family / weight / size pairs in use, text under 10 px
//   radii     the corner radii in use against the scale 8 / 12 / 16 / 22 (and pills)
//   scroll    horizontal scroll of the page
// It is a plain function (no imports, no closures) so `lint.toString()` can run in the page; tools/anime/craft-shots.mjs injects it after every state and writes the result to report.json.
export function lint(opts = {}) {
  const vw = innerWidth, vh = innerHeight;
  const insetOf = () => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;visibility:hidden;top:0;left:0;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(d);
    const cs = getComputedStyle(d), r = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    d.remove();
    return r;
  };
  const inset = insetOf();
  const r1 = (n) => Math.round(n * 10) / 10;
  const sel = (e) => {
    const id = e.id ? '#' + e.id : '';
    const cls = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const act = e.dataset && e.dataset.act ? '[data-act=' + e.dataset.act + (e.dataset.id ? ':' + e.dataset.id : '') + ']' : '';
    const root = e.closest && e.closest('#klc-ui,#klc-x,#klc-pad,#klc-ship,#intro,#klc-jpyc,#klc-contrib,[id^=klc-]');
    return ((root && root !== e ? '(' + (root.id || root.className) + ') ' : '') + e.tagName.toLowerCase() + id + cls + act).slice(0, 110);
  };
  const live = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
  const clickable = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) if (getComputedStyle(n).pointerEvents === 'none') return false; return true; };
  const on = (b) => b.width > 1 && b.height > 1 && b.right > 0 && b.bottom > 0 && b.left < vw && b.top < vh;
  const HAS_JA = /[぀-ヿ一-鿿]/;
  const INTERACTIVE = 'button,a[href],select,input:not([type=hidden]),textarea,summary,[role=button],[role=tab],[role=switch],[role=menuitem],[data-act]';
  const out = { vw, vh, dpr: devicePixelRatio, inset, targets: [], safe: [], trunc: [], lines: [], spacing: [], fonts: {}, small: [], radii: {}, shadows: {}, text: [], scrollX: document.documentElement.scrollWidth > vw + 1, scrollY: document.documentElement.scrollHeight > vh + 1 };
  const all = [...document.body.querySelectorAll('*')].filter((e) => !/^(SCRIPT|STYLE|CANVAS|NOSCRIPT|LINK|META|SVG|PATH|CIRCLE|G|RECT|USE|DEFS)$/i.test(e.tagName) && !(e.closest && e.closest('svg') && e.tagName.toLowerCase() !== 'svg'));
  const seenText = new Set();
  const KINSOKU_HEAD = /^[、。，．」』）］｝〉》】〕！？ー々ゝゞヽヾ…‥]/;
  const KINSOKU_TAIL = /[「『（［｛〈《【〔]$/;
  const SPACE_JA = /[぀-ヿ一-鿿　-〿＀-￯] +[぀-ヿ一-鿿]/;
  for (const e of all) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const b = e.getBoundingClientRect();
    if (!on(b)) continue;
    if (!live(e)) continue;
    const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.nodeValue.trim());
    const ownText = own.map((n) => n.nodeValue).join('').replace(/\s+/g, ' ').trim();
    const fullText = (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
    const isI = e.matches(INTERACTIVE);
    // ---- targets
    if (isI && clickable(e) && !(e.tagName === 'INPUT' && e.type === 'range')) {
      const slop = e.closest('[data-hit]');
      if (Math.min(b.width, b.height) < 44 - 0.5) out.targets.push({ sel: sel(e), text: fullText.slice(0, 40), w: r1(b.width), h: r1(b.height), x: r1(b.left), y: r1(b.top), slop: !!slop });
    }
    // ---- safe areas (content: interactive, or with text of its own; never a full-screen layer)
    if ((isI || ownText) && clickable(e) && !(b.width >= vw - 1 && b.height >= vh - 1)) {
      const bands = [];
      if (inset.top > 0 && b.top < inset.top - 0.5) bands.push('top');
      if (inset.bottom > 0 && b.bottom > vh - inset.bottom + 0.5) bands.push('bottom');
      if (inset.left > 0 && b.left < inset.left - 0.5) bands.push('left');
      if (inset.right > 0 && b.right > vw - inset.right + 0.5) bands.push('right');
      if (bands.length) out.safe.push({ sel: sel(e), text: (ownText || fullText).slice(0, 40), bands: bands.join('+'), t: r1(b.top), b: r1(b.bottom), l: r1(b.left), r: r1(b.right) });
    }
    if (!ownText) continue;
    // ---- truncation
    const clipX = /hidden|clip|auto|scroll/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1;
    const clipY = /hidden|clip/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1 && cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== undefined;   // (a glyph box taller than a line-height:1 box is not a cut)
    if ((clipX && cs.textOverflow === 'ellipsis') || (clipX && /hidden|clip/.test(cs.overflowX) && cs.whiteSpace === 'nowrap') || clipY) out.trunc.push({ sel: sel(e), text: ownText.slice(0, 60), cw: e.clientWidth, sw: e.scrollWidth, ellipsis: cs.textOverflow === 'ellipsis' });
    // ---- text for the copy audit (once per distinct string per element class)
    const key = sel(e) + '|' + ownText;
    if (!seenText.has(key)) { seenText.add(key); out.text.push({ sel: sel(e), t: ownText.slice(0, 160) }); }
    // ---- fonts
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), fk = fam + ' ' + cs.fontWeight;
    out.fonts[fk] = (out.fonts[fk] || 0) + 1;
    const fs = parseFloat(cs.fontSize);
    if (fs < (opts.minFont || 10) - 0.01) out.small.push({ sel: sel(e), text: ownText.slice(0, 40), size: r1(fs) });
    // ---- Japanese spacing in the rendered text
    const issues = [];
    if (SPACE_JA.test(ownText)) issues.push('space between Japanese characters');
    if (/[｡-ﾟ]/.test(ownText)) issues.push('half-width kana');
    if (/[０-９]/.test(ownText)) issues.push('full-width digit');
    if (HAS_JA.test(ownText) && /[぀-ヿ一-鿿][,.!?;:] |[぀-ヿ一-鿿][,.]$|\.\.\./.test(ownText)) issues.push('ASCII punctuation next to Japanese');
    if (HAS_JA.test(ownText) && /[぀-ヿ一-鿿]\([^)]*\)|\([^)]*\)[぀-ヿ一-鿿]/.test(ownText)) issues.push('ASCII parentheses next to Japanese');
    if (/ {2,}/.test(own.map((n) => n.nodeValue).join('').trim())) issues.push('double space');
    if (issues.length) out.spacing.push({ sel: sel(e), text: ownText.slice(0, 80), issues });
    // ---- the visual lines of every text node (禁則, orphans)
    if (HAS_JA.test(ownText) || ownText.length > 12) {
      for (const tn of own) {
        const s = tn.nodeValue; if (s.length > 400) continue;
        const rg = document.createRange(), rows = []; let cur = null, buf = '';
        for (let i = 0; i < s.length; i++) {
          rg.setStart(tn, i); rg.setEnd(tn, i + 1);
          const rc = rg.getClientRects();
          if (!rc.length) { buf += s[i]; continue; }
          const top = Math.round(rc[0].top);
          if (cur === null || Math.abs(top - cur) > 3) { if (buf.trim()) rows.push(buf.trim()); buf = ''; cur = top; }
          buf += s[i];
        }
        if (buf.trim()) rows.push(buf.trim());
        if (rows.length < 2) continue;
        const flags = [];
        rows.forEach((row, i) => { if (i > 0 && KINSOKU_HEAD.test(row)) flags.push('line ' + (i + 1) + ' starts with ' + row[0]); if (i < rows.length - 1 && KINSOKU_TAIL.test(row)) flags.push('line ' + (i + 1) + ' ends with ' + row[row.length - 1]); });
        const last = rows[rows.length - 1].replace(/[\s、。！？]/g, '');
        if (HAS_JA.test(s) && last.length <= 1) flags.push('orphan: the last line is "' + rows[rows.length - 1] + '"');
        else if (HAS_JA.test(s) && last.length === 2 && rows.length >= 2 && /^h[1-6]$|mark|name|title|\bh\b/i.test(e.tagName + ' ' + e.className)) flags.push('short last line "' + rows[rows.length - 1] + '"');
        out.lines.push({ sel: sel(e), rows, flags });
      }
    }
  }
  // ---- radii / shadows of the surfaces
  for (const e of all) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const b = e.getBoundingClientRect(); if (!on(b) || !live(e)) continue;
    const bg = cs.backgroundColor, hasBg = bg && !/rgba?\(\s*0,\s*0,\s*0,\s*0\)|transparent/.test(bg), hasB = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
    if (!(hasBg || hasB) || b.width >= vw - 1) continue;
    if (!e.closest('#klc-ui,#klc-x,#klc-pad,#klc-ship,#intro,[id^=klc-]')) continue;
    const rad = cs.borderTopLeftRadius; if (rad === '0px') continue;
    const px = /%$/.test(rad) ? 'pct' : Math.round(parseFloat(rad));
    const pill = typeof px === 'number' && px >= Math.min(b.width, b.height) / 2 - 1;
    const k = pill ? 'pill' : String(px);
    (out.radii[k] ||= []).push(sel(e));
    if (cs.boxShadow && cs.boxShadow !== 'none') (out.shadows[cs.boxShadow.slice(0, 90)] ||= []).push(sel(e));
  }
  for (const k of Object.keys(out.radii)) out.radii[k] = { n: out.radii[k].length, eg: out.radii[k].slice(0, 3) };
  for (const k of Object.keys(out.shadows)) out.shadows[k] = { n: out.shadows[k].length, eg: out.shadows[k].slice(0, 2) };
  // keep the data small
  out.text = out.text.slice(0, 260);
  return out;
}
