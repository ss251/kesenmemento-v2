// [ui-c] ?dbg=1: the diagnostics strip for a phone (mobile review T0, UI review row 1).
//
// A fixed monospace strip that prints what only the phone itself can tell us: the OS and Safari versions, innerWidth x innerHeight
// against visualViewport and the 100svh / 100lvh / 100dvh boxes (iOS 26 sizes a Safari page differently from the screen: if
// `inner` is taller than `svh` the 3D view is centred too low), the safe-area insets, the canvas and HUD boxes, texture and
// geometry counts, the audio state (context state, audio session type, resumes), WebGL context losses, the last errors and the
// time to ready. Open the page with ?dbg=1, screenshot it in Safari (portrait, landscape) and in a Home Screen install.
//
// Cost when the flag is absent: none. main.js loads this file with a dynamic import() only when the URL has ?dbg=1 (never in a
// ?shot=1 frame), so without the flag there is no request, no module, no timer and no listener. The strip never takes a touch
// (pointer-events: none) and is never part of a photo (a photo reads the canvas).
//
//   mountDbg(ctx, { every })  ->  { el, update(), stop() }      parseUA(ua, touchPoints)      dbgText(measures)      readMeasures(env)
import { APP_VERSION } from '../core/buildinfo.js';

const BROWSERS = { CriOS: 'Chrome-iOS', FxiOS: 'Firefox-iOS', EdgiOS: 'Edge-iOS', EdgA: 'Edge', Edg: 'Edge', OPR: 'Opera', HeadlessChrome: 'Chrome(headless)', Chrome: 'Chrome', Firefox: 'Firefox' };

/**
 * The OS and the browser out of a user agent string. iOS 26 Safari still reports `iPhone OS 18_x` in the UA (the OS version is
 * frozen), so on an iPhone the Safari version is the number to trust: Safari 26 is iOS 26.
 * A desktop-mode iPad says Macintosh; with more than one touch point it is an iPad.
 */
export function parseUA(ua = '', maxTouchPoints = 0) {
  ua = String(ua || '');
  let os = '?', m;
  if ((m = ua.match(/\b(iPhone|iPad|iPod)\b.*?\bOS (\d+(?:_\d+){0,2})/))) os = (m[1] === 'iPad' ? 'iPadOS ' : 'iOS ') + m[2].replace(/_/g, '.');
  else if (/Macintosh/.test(ua) && maxTouchPoints > 1) os = 'iPadOS (desktop UA)';
  else if ((m = ua.match(/Mac OS X (\d+(?:[_.]\d+){0,2})/))) os = 'macOS ' + m[1].replace(/_/g, '.');
  else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) os = 'Android ' + m[1];
  else if ((m = ua.match(/Windows NT (\d+(?:\.\d+)?)/))) os = 'Windows ' + m[1];
  else if (/Linux/.test(ua)) os = 'Linux';
  let browser = '?';
  if ((m = ua.match(/\b(CriOS|FxiOS|EdgiOS|EdgA|Edg|OPR|HeadlessChrome|Chrome|Firefox)\/(\d+(?:\.\d+)?)/))) browser = `${BROWSERS[m[1]] || m[1]} ${m[2]}`;
  else if ((m = ua.match(/\bVersion\/(\d+(?:\.\d+)?)[^)]*?\bSafari\//))) browser = 'Safari ' + m[1];
  else if ((m = ua.match(/\bVersion\/(\d+(?:\.\d+)?)/))) browser = 'Safari ' + m[1];
  return { os, browser };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r0 = (v) => (num(v) === null ? '-' : String(Math.round(v)));
const size = (w, h) => `${r0(w)}x${r0(h)}`;
const sgn = (v) => (v >= 0 ? '+' + v : String(v));

/** The strip's text from a measurements object (see readMeasures): pure, so a unit test can pin the layout. */
export function dbgText(m) {
  const L = [];
  L.push(`${m.os}  ${m.browser}  dpr ${m.dpr}  ${m.standalone ? 'HOME-SCREEN' : 'tab'}`);
  const vv = m.vv ? `${size(m.vv.w, m.vv.h)} s${num(m.vv.scale) === null ? '-' : m.vv.scale.toFixed(2)} y${r0(m.vv.top)}` : 'n/a';
  L.push(`inner ${size(m.inner[0], m.inner[1])}  vv ${vv}  screen ${size(m.screen[0], m.screen[1])}`);
  const b = m.boxes || {};
  // gap = innerHeight - 100svh: not 0 means the 3D view (sized from innerHeight) is not the box the HUD lives in. Every line stays under ~58 characters: one row on a 390 px phone at 10 px.
  const gap = num(b.svh) !== null && b.svh > 0 ? `  gap ${sgn(Math.round(m.inner[1] - b.svh))}` : '';
  L.push(`svh ${r0(b.svh)}  lvh ${r0(b.lvh)}  dvh ${r0(b.dvh)}  fixed ${r0(b.fixed)}  doc ${r0(m.html[1])}${gap}`);
  const s = m.safe || {};
  L.push(`safe t${r0(s.top)} r${r0(s.right)} b${r0(s.bottom)} l${r0(s.left)}  ${m.orient || '-'}`);
  const c = m.canvas;
  L.push(`canvas ${c ? size(c.w, c.h) + '  css ' + size(c.cw, c.ch) : '-'}  hud ${m.hud ? size(m.hud[0], m.hud[1]) : '-'}`);
  const mem = m.mem;
  L.push(`tex ${mem ? r0(mem.tex) : '-'} geo ${mem ? r0(mem.geo) : '-'} calls ${r0(m.calls)} tris ${num(m.tris) === null ? '-' : (m.tris / 1e6).toFixed(2) + 'M'}  tier ${m.tier || '-'}`);
  const a = m.audio || {};
  L.push(`audio ${a.state ?? '-'}  session ${a.session ?? 'n/a'}  resumes ${r0(a.resumes ?? 0)}  ctxlost ${r0(m.lost)}`);
  L.push(m.ready === null || m.ready === undefined
    ? `loading ${num(m.up) === null ? '-' : (m.up / 1000).toFixed(1) + ' s'}  fps ${num(m.fps) === null ? '-' : Math.round(m.fps)}  build ${m.build}`
    : `ready ${r0(m.ready)} ms  fps ${num(m.fps) === null ? '-' : Math.round(m.fps)}  heap ${num(m.heap) === null ? '-' : Math.round(m.heap) + ' MB'}  build ${m.build}`);
  for (const e of (m.errs || []).slice(-2)) L.push('! ' + e);
  if (m.modErrors) L.push(`! ${m.modErrors} module error(s): see __errors`);
  return L.join('\n');
}

/**
 * Read every number the strip prints. `env` = { win, doc, ctx, probes, errs, lost }; `probes` holds the hidden boxes
 * (svh, lvh, dvh, fixed, env), each with getBoundingClientRect(). Every read is guarded: an API a browser lacks prints '-'.
 */
export function readMeasures(env) {
  const { win, doc, ctx, probes = {}, errs = [], lost = 0 } = env;
  const nav = win.navigator || {};
  const h = (el) => { try { const r = el?.getBoundingClientRect?.(); return r ? r.height : null; } catch { return null; } };
  const mq = (q) => { try { return !!win.matchMedia?.(q)?.matches; } catch { return false; } };
  const vv = win.visualViewport ? { w: win.visualViewport.width, h: win.visualViewport.height, scale: win.visualViewport.scale, top: win.visualViewport.offsetTop } : null;
  let safe = {};
  try { const cs = win.getComputedStyle(probes.env); safe = { top: parseFloat(cs.paddingTop), right: parseFloat(cs.paddingRight), bottom: parseFloat(cs.paddingBottom), left: parseFloat(cs.paddingLeft) }; } catch { /* no env() */ }
  const cv = ctx?.renderer?.domElement;
  const hud = doc.getElementById?.('klc-ui')?.getBoundingClientRect?.();
  const info = ctx?.renderer?.info;
  const ac = ctx?.audio?.context;
  const ses = ctx?.audio?.session;
  const marks = win.performance?.getEntriesByName?.('klc:ready');
  const ready = marks && marks.length ? marks[0].startTime : null;
  const ua = parseUA(nav.userAgent, nav.maxTouchPoints || 0);
  return {
    ...ua,
    dpr: Math.round((win.devicePixelRatio || 1) * 100) / 100,
    standalone: !!(nav.standalone || mq('(display-mode: standalone)')),
    inner: [win.innerWidth, win.innerHeight], vv, screen: [win.screen?.width, win.screen?.height],
    html: [doc.documentElement?.clientWidth, doc.documentElement?.clientHeight],
    boxes: { svh: h(probes.svh), lvh: h(probes.lvh), dvh: h(probes.dvh), fixed: h(probes.fixed) },
    safe, orient: mq('(orientation: portrait)') ? 'portrait' : 'landscape',
    canvas: cv ? { w: cv.width, h: cv.height, cw: cv.clientWidth, ch: cv.clientHeight } : null,
    hud: hud && (hud.width || hud.height) ? [hud.width, hud.height] : null,   // (display: none before the visitor enters the town: no box)
    mem: info?.memory ? { tex: info.memory.textures, geo: info.memory.geometries } : null,
    calls: info?.render?.calls ?? null, tris: info?.render?.triangles ?? null,
    tier: ctx?.quality?.tier ?? ctx?.quality?.name ?? null,
    audio: { state: ac ? ac.state : ctx?.audio ? 'idle' : null, session: ses?.type ?? nav.audioSession?.type ?? null, resumes: ses?.resumes ?? 0 },
    lost: win.__survive?.count ?? lost,
    ready, up: win.performance?.now?.() ?? null,
    fps: win.__stats?.fps ?? null,
    heap: win.performance?.memory ? win.performance.memory.usedJSHeapSize / 1e6 : null,
    build: APP_VERSION,
    errs, modErrors: Array.isArray(win.__errors) ? win.__errors.length : 0,
  };
}

/** Mount the strip. Call once (a second call returns the first strip). */
export function mountDbg(ctx, o = {}) {
  const win = o.win || window, doc = o.doc || document;
  const existing = doc.getElementById('klc-dbg');
  if (existing?.__dbg) return existing.__dbg;
  const el = doc.createElement('pre');
  el.id = 'klc-dbg'; el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:6px;right:6px;max-width:560px;top:calc(6px + env(safe-area-inset-top,0px));z-index:99;margin:0;padding:6px 8px;'
    + 'font:10px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;color:#7CFF9B;background:rgba(0,0,0,.74);border-radius:8px;pointer-events:none;'
    + 'white-space:pre-wrap;word-break:break-all;-webkit-user-select:none;user-select:none';
  doc.body.appendChild(el);
  // hidden boxes that only exist to be measured: a fixed 100svh / 100lvh / 100dvh column, a fixed 100% column, and the safe-area insets as padding
  const probe = (css) => { const d = doc.createElement('div'); d.setAttribute('aria-hidden', 'true'); d.style.cssText = 'position:fixed;left:0;top:0;width:1px;visibility:hidden;pointer-events:none;' + css; doc.body.appendChild(d); return d; };
  const probes = {
    svh: probe('height:100svh'), lvh: probe('height:100lvh'), dvh: probe('height:100dvh'), fixed: probe('height:100%'),
    env: probe('height:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'),
  };
  const errs = [];
  const push = (s) => { errs.push(String(s).replace(/\s+/g, ' ').slice(0, 72)); if (errs.length > 3) errs.shift(); };
  const onErr = (e) => push(e?.message || e?.error || 'error');
  const onRej = (e) => push('promise: ' + (e?.reason?.message || e?.reason || '?'));
  win.addEventListener?.('error', onErr); win.addEventListener?.('unhandledrejection', onRej);
  let lost = 0;
  const onLost = () => { lost++; };
  const cv = ctx?.renderer?.domElement;
  cv?.addEventListener?.('webglcontextlost', onLost);
  function update() { try { el.textContent = dbgText(readMeasures({ win, doc, ctx, probes, errs, lost })); } catch (e) { el.textContent = 'dbg: ' + (e?.message || e); } }
  update();
  const timer = (o.setInterval || win.setInterval).call(win, update, o.every ?? 500);
  const api = {
    el, update,
    stop() {
      (o.clearInterval || win.clearInterval).call(win, timer);
      win.removeEventListener?.('error', onErr); win.removeEventListener?.('unhandledrejection', onRej); cv?.removeEventListener?.('webglcontextlost', onLost);
      el.remove?.(); for (const k of Object.keys(probes)) probes[k].remove?.();
    },
  };
  el.__dbg = api;
  return api;
}
