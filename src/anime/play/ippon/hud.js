/**
 * 一本釣り chrome that the kit does not own: the radar, the hold chip, the captain's
 * line, the strike cue, and his 「！」. Actions, coaching, the stamp, 「ザバッ！」 and
 * the results live in the play kit. This layer keeps clear of the town HUD's clock,
 * search, pad switch and pad buttons.
 */

import TEXT from '../../../../data/play-i18n.json';

const BLOCK = '#klc-ui .brand, #klc-ui .tools, #klc-ui .mbtn, #klc-ui .dock, #klc-ui .pbar, #klc-ui .places, #klc-x .xbar, #klc-x .mini, #klc-pad .chip, #klc-pad .gear, #klc-pad .cluster .btn, #klc-pad .stick, #klc-play .topbar, #klc-play .counters, #klc-play .cluster .act';

export function createHud(ctx) {
  const on = { act: null };
  const root = document.createElement('div');
  root.id = 'klc-ippon';
  root.innerHTML = `
    <style>
      #klc-ippon { position: fixed; inset: 0; z-index: 6; pointer-events: none; font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; color: #223A70; line-break: strict; }
      #klc-ippon [hidden] { display: none !important; }
      #klc-ippon .radar { position: absolute; top: 128px; left: calc(14px + env(safe-area-inset-left, 0px)); width: 112px; text-align: center; }
      #klc-ippon .radar canvas { width: 112px; height: 112px; border-radius: 50%; background: rgba(251, 250, 245, 0.86); border: 2px solid #223A70; box-shadow: 0 6px 18px rgba(23, 24, 75, 0.16); }
      #klc-ippon .radar .cap { margin-top: 4px; font-size: 13px; font-weight: 700; color: #223A70; text-shadow: 0 1px 0 rgba(255,255,255,0.75); }
      #klc-ippon .hold { position: absolute; top: 72px; left: 50%; transform: translateX(-50%); min-height: 36px; display: flex; align-items: center; gap: 8px; padding: 0 14px; border-radius: 999px; background: rgba(251, 250, 245, 0.94); border: 1px solid rgba(34, 58, 112, 0.18); font-size: 15px; font-weight: 700; color: #223A70; }
      #klc-ippon .hold b { font-variant-numeric: tabular-nums; }
      #klc-ippon .boost { position: absolute; top: 116px; left: 50%; transform: translateX(-50%); font-size: 13px; font-weight: 800; color: #F8B500; letter-spacing: 0.04em; text-shadow: 0 1px 0 #223A70; }
      #klc-ippon .cue { position: absolute; left: 50%; bottom: calc(168px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); padding: 10px 16px; border-radius: 999px; background: rgba(34, 58, 112, 0.92); color: #FBFAF5; font-size: 16px; font-weight: 700; }
      #klc-ippon .dlg { position: absolute; left: 50%; bottom: calc(28px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); width: min(560px, calc(100% - 28px)); padding: 18px 18px 16px; border-radius: 22px; background: rgba(251, 250, 245, 0.96); pointer-events: auto; box-shadow: 0 18px 50px rgba(23, 24, 75, 0.28); }
      #klc-ippon .dlg .who { font-size: 13px; font-weight: 800; color: #223A70; }
      #klc-ippon .dlg .line { margin: 8px 0 14px; font-size: 18px; font-weight: 700; line-height: 1.6; text-wrap: pretty; }
      #klc-ippon .dlg .go { display: block; width: 100%; min-height: 56px; border: 0; border-radius: 16px; background: #F8B500; color: #223A70; font: inherit; font-size: 18px; font-weight: 800; cursor: pointer; }
      #klc-ippon .dlg .go:focus-visible { outline: 2px solid #223A70; outline-offset: 2px; }
      /* 山吹 balloon, 紺 outline, white 「！」. Same bob as the missions mark. */
      #klc-ippon .balloon {
        position: absolute; margin: 0; pointer-events: none; text-align: center;
        font-weight: 700; line-height: 1; transform: translate(-50%, -100%);
        animation: ippon-bob 1.8s ease-in-out infinite;
      }
      #klc-ippon .balloon.bang {
        display: flex; align-items: center; justify-content: center; box-sizing: border-box;
        border-radius: 50%; background: #F8B500; border: 3px solid #223A70; color: #fff;
        box-shadow: 0 6px 14px rgba(23, 24, 75, 0.28);
      }
      #klc-ippon .balloon.bang b {
        position: relative; z-index: 1; color: #fff; font-weight: 700;
        -webkit-text-stroke: 0.08em #223A70; paint-order: stroke fill;
      }
      #klc-ippon .balloon.bang::before, #klc-ippon .balloon.bang::after {
        content: ""; position: absolute; left: 50%; bottom: -7px; margin-left: -7px;
        border-style: solid; border-width: 8px 7px 0 7px;
      }
      #klc-ippon .balloon.bang::before { border-color: #223A70 transparent transparent transparent; }
      #klc-ippon .balloon.bang::after {
        bottom: -4px; margin-left: -5px; border-width: 6px 5px 0 5px;
        border-color: #F8B500 transparent transparent transparent; z-index: 1;
      }
      #klc-ippon .balloon.soft {
        font-size: 22px; color: #F8B500;
        -webkit-text-stroke: 2px #223A70; paint-order: stroke fill;
      }
      #klc-ippon .ring {
        position: absolute; box-sizing: border-box; pointer-events: none; border-radius: 50%;
        border: 2px solid rgba(248, 181, 0, 0.72);
        background: radial-gradient(ellipse at center, rgba(251, 250, 245, 0.42) 0%, rgba(248, 181, 0, 0.16) 46%, transparent 72%);
        box-shadow: 0 0 12px rgba(251, 250, 245, 0.45);
        transform: translate(-50%, -50%);
      }
      #klc-ippon .cheer { position: absolute; transform: translate(-50%, -100%); font-size: 18px; font-weight: 900; color: #FBFAF5; -webkit-text-stroke: 4px #223A70; paint-order: stroke fill; }
      #klc-ippon.touch .radar, #klc-ippon.touch .radar canvas { width: 88px; height: 88px; }
      @keyframes ippon-bob {
        0%, 100% { transform: translate(-50%, -100%); }
        50% { transform: translate(-50%, calc(-100% - var(--bob, 8px))); }
      }
      @media (prefers-reduced-motion: reduce) {
        #klc-ippon .balloon { animation: none; }
      }
    </style>
    <div class="radar" hidden><canvas width="128" height="128"></canvas><div class="cap"></div></div>
    <div class="hold" hidden><span class="ht"></span><b class="kg"></b></div>
    <div class="boost" hidden></div>
    <div class="cue" hidden></div>
    <div class="dlg" hidden></div>
    <div class="ring" hidden></div>
    <div class="balloon" hidden><b></b></div>
    <div class="cheer" hidden></div>`;
  document.body.appendChild(root);

  const radar = root.querySelector('.radar');
  const canvas = radar.querySelector('canvas');
  const g = canvas.getContext('2d');
  const hold = root.querySelector('.hold');
  const boost = root.querySelector('.boost');
  const cueEl = root.querySelector('.cue');
  const dlg = root.querySelector('.dlg');
  const ringEl = root.querySelector('.ring');
  const balloon = root.querySelector('.balloon');
  const glyph = balloon.querySelector('b');
  const cheerEl = root.querySelector('.cheer');
  const cheers = [];
  let lang = 'ja';
  let cueT = 0;
  let coarse = false;
  let layAcc = 1;
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) root.classList.add('still'); } catch { /* node */ }

  const T = (k) => (TEXT[lang] || TEXT.ja)[k] || k;

  function setCoarse(onTouch) {
    coarse = !!onTouch;
    root.classList.toggle('touch', coarse);
  }

  function paintRadar(blips) {
    const w = canvas.width;
    g.clearRect(0, 0, w, w);
    g.strokeStyle = 'rgba(34, 58, 112, 0.28)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(w / 2, w / 2, w * 0.36, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(w / 2, w / 2, w * 0.18, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#223A70';
    g.beginPath(); g.arc(w / 2, w / 2, 3, 0, Math.PI * 2); g.fill();
    for (const b of blips || []) {
      if (!b.on) continue;
      const x = w / 2 + b.u * (w * 0.42);
      const y = w / 2 - b.v * (w * 0.42);
      g.fillStyle = b.hot ? '#B7282E' : '#00A3AF';
      g.globalAlpha = 0.35 + 0.65 * (b.hot ? 1 : 0.7);
      g.beginPath(); g.arc(x, y, b.hot ? 5 : 3.5, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
  }

  function boxOf(e, skipOwn) {
    if (!e || (skipOwn && root.contains(e))) return null;
    const q = e.getBoundingClientRect();
    if (!(q.width > 1 && q.height > 1)) return null;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return null;
    return q;
  }

  function blocked() {
    const list = [];
    for (const e of document.querySelectorAll(BLOCK)) {
      const q = boxOf(e, true);
      if (q) list.push(q);
    }
    return list;
  }

  function hit(x, y, w, h, list, gap) {
    const r = gap || 6;
    const x2 = x + w;
    const y2 = y + h;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (x2 > b.left - r && x < b.right + r && y2 > b.top - r && y < b.bottom + r) return true;
    }
    return false;
  }

  function placeChrome() {
    const list = blocked();
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    if (!radar.hidden) {
      const box = radar.getBoundingClientRect();
      const rw = box.width || 112;
      const rh = box.height || 140;
      const left = 14;
      let top = 14;
      for (let i = 0; i < 16 && hit(left, top, rw, rh, list); i++) top += 24;
      if (radar._t !== top) { radar._t = top; radar.style.top = top + 'px'; }
    }
    if (!hold.hidden) {
      const box = hold.getBoundingClientRect();
      const hw = box.width || 160;
      const hh = box.height || 36;
      const left = Math.max(8, (vw - hw) / 2);
      let top = 16;
      for (let i = 0; i < 16 && hit(left, top, hw, hh, list); i++) top += 18;
      if (hold._t !== top) {
        hold._t = top;
        hold.style.top = top + 'px';
        boost.style.top = (top + hh + 6) + 'px';
      }
    }
    if (!dlg.hidden) {
      const box = dlg.getBoundingClientRect();
      const dw = box.width || Math.min(560, vw - 28);
      const dh = box.height || 148;
      const left = (vw - dw) / 2;
      let bottom = 28;
      for (let i = 0; i < 18; i++) {
        const top = vh - bottom - dh;
        if (!hit(left, top, dw, dh, list, 10)) break;
        bottom += 22;
      }
      if (dlg._b !== bottom) { dlg._b = bottom; dlg.style.bottom = 'calc(' + bottom + 'px + env(safe-area-inset-bottom, 0px))'; }
    }
    if (!cueEl.hidden) {
      const cw = 280;
      const ch = 44;
      const left = (vw - cw) / 2;
      let bottom = 168;
      for (let i = 0; i < 14; i++) {
        const top = vh - bottom - ch;
        if (!hit(left, top, cw, ch, list, 8)) break;
        bottom += 18;
      }
      if (cueEl._b !== bottom) { cueEl._b = bottom; cueEl.style.bottom = 'calc(' + bottom + 'px + env(safe-area-inset-bottom, 0px))'; }
    }
  }

  function overlaps() {
    const ours = ['#klc-ippon .radar', '#klc-ippon .hold', '#klc-ippon .dlg', '#klc-ippon .cue', '#klc-play .cluster .act', '#klc-play .coach .bubble'];
    const theirs = ['#klc-ui .clock', '#klc-ui .brand', '#klc-x [data-act="search"]', '#klc-pad .chip', '#klc-pad .cluster .btn'];
    const hits = [];
    const boxes = (sel) => {
      const out = [];
      for (const e of document.querySelectorAll(sel)) {
        const q = boxOf(e, false);
        if (q) out.push(q);
      }
      return out;
    };
    for (const a of ours) {
      for (const mine of boxes(a)) {
        for (const b of theirs) {
          for (const hud of boxes(b)) {
            const ox = Math.min(mine.right, hud.right) - Math.max(mine.left, hud.left);
            const oy = Math.min(mine.bottom, hud.bottom) - Math.max(mine.top, hud.top);
            if (ox > 2 && oy > 2) hits.push({ mine: a, hud: b, ox: Math.round(ox), oy: Math.round(oy) });
          }
        }
      }
    }
    return hits;
  }

  function tick(dt) {
    if (cueT > 0) { cueT -= dt; if (cueT <= 0) cueEl.hidden = true; }
    for (let i = cheers.length - 1; i >= 0; i--) {
      cheers[i].t -= dt;
      if (cheers[i].t <= 0) cheers.splice(i, 1);
    }
    layAcc += dt > 0 ? dt : 0;
    if (layAcc >= 0.5) { layAcc = 0; placeChrome(); }
  }

  return {
    el: root,
    on,
    setLang(l) { lang = l === 'en' ? 'en' : 'ja'; radar.querySelector('.cap').textContent = T('play.ippon.radar'); hold.querySelector('.ht').textContent = T('play.ippon.hold'); },
    setCoarse,
    update(s) {
      lang = s.lang === 'en' ? 'en' : 'ja';
      setCoarse(s.coarse);
      const onBoat = s.phase && s.phase !== 'quay';
      radar.hidden = !onBoat || s.phase === 'done' || s.phase === 'auction';
      if (!radar.hidden) paintRadar(s.blips);
      radar.querySelector('.cap').textContent = T('play.ippon.radar');
      hold.hidden = !onBoat || !(s.holdN > 0) || s.phase === 'done';
      hold.querySelector('.ht').textContent = T('play.ippon.hold');
      hold.querySelector('.kg').textContent = `${((s.holdKg ?? s.kg) || 0).toFixed(1)} kg`;
      boost.hidden = !s.boost;
      boost.textContent = s.boost ? T('play.ippon.x4') : '';
      tick(s.dt || 0);
    },
    cue(text, hint) {
      const line = hint && typeof hint === 'string' ? (text ? text + '  ' + hint : hint) : (text || '');
      cueEl.hidden = !line;
      cueEl.textContent = line;
      cueT = line ? (typeof hint === 'number' ? hint / 1000 : 2.2) : 0;
      if (line) placeChrome();
    },
    dialogue(o) {
      if (!o || !o.show) { dlg.hidden = true; dlg.innerHTML = ''; return; }
      dlg.hidden = false;
      dlg.innerHTML = `<div class="who">${o.who || ''}</div><div class="line">${o.line || ''}</div><button type="button" class="go">${o.go || ''}</button>`;
      dlg.querySelector('.go').addEventListener('click', (e) => { e.stopPropagation(); o.onGo?.(); });
      placeChrome();
    },
    mark(spec) {
      if (!spec || spec.x == null) {
        balloon.hidden = true;
        ringEl.hidden = true;
        return;
      }
      const bang = !!spec.bang;
      const want = bang ? 'balloon bang' : 'balloon soft';
      if (balloon.className !== want) balloon.className = want;
      if (glyph.textContent !== spec.text) glyph.textContent = spec.text || '';
      balloon.hidden = false;
      const x = (spec.x + 0.5) | 0;
      const y = (spec.y + 0.5) | 0;
      if (balloon._x !== x) { balloon._x = x; balloon.style.left = x + 'px'; }
      if (balloon._y !== y) { balloon._y = y; balloon.style.top = y + 'px'; }
      const bucket = Math.round((spec.op == null ? 1 : spec.op) * 20) / 20;
      if (balloon._o !== bucket) { balloon._o = bucket; balloon.style.opacity = bucket >= 1 ? '' : String(bucket); }
      if (bang) {
        const px = (spec.px + 0.5) | 0;
        if (balloon._px !== px && px > 0) {
          balloon._px = px;
          balloon.style.width = px + 'px';
          balloon.style.height = px + 'px';
          balloon.style.fontSize = Math.max(12, Math.round(px * 0.48)) + 'px';
          balloon.style.borderWidth = (px < 36 ? 2 : 3) + 'px';
          balloon.style.setProperty('--bob', (px < 36 ? 5 : 8) + 'px');
        }
      }
      const ring = bang ? spec.ring : null;
      if (!ring) { ringEl.hidden = true; return; }
      ringEl.hidden = false;
      if (ringEl._o !== bucket) { ringEl._o = bucket; ringEl.style.opacity = bucket >= 1 ? '' : String(bucket); }
      const rw = (ring.w + 0.5) | 0;
      const rh = (ring.h + 0.5) | 0;
      const rx = (ring.x + 0.5) | 0;
      const ry = (ring.y + 0.5) | 0;
      if (ringEl._w !== rw) { ringEl._w = rw; ringEl.style.width = rw + 'px'; }
      if (ringEl._h !== rh) { ringEl._h = rh; ringEl.style.height = rh + 'px'; }
      if (ringEl._x !== rx) { ringEl._x = rx; ringEl.style.left = rx + 'px'; }
      if (ringEl._y !== ry) { ringEl._y = ry; ringEl.style.top = ry + 'px'; }
    },
    bubbles(list) {
      cheers.length = 0;
      for (const c of list || []) cheers.push({ text: c.text, t: 1.1 });
    },
    project(list) {
      if (!cheers.length) { cheerEl.hidden = true; return; }
      const c = cheers[0];
      const hitP = (list || []).find((p) => p.text === c.text) || list?.[0];
      if (!hitP || hitP.x == null) { cheerEl.hidden = true; return; }
      cheerEl.hidden = false;
      cheerEl.textContent = c.text;
      cheerEl.style.left = hitP.x + 'px';
      cheerEl.style.top = hitP.y + 'px';
    },
    placeChrome,
    overlaps,
    setBoard() { /* the captain's line replaced the quay pill */ },
  };
}
