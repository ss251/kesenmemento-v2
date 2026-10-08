// The title sequence as a pure function of time (seconds): frame(t) sets every animated attribute, so the live page
// drives it from requestAnimationFrame and a capture can step it exactly (window.__T).
// Timeline: letters drop and squash 0.15–1.2, the sea fills each line, the カツオ leaps 1.05, a spark 1.36,
// the English line 1.45, a shine 1.95, the gauge completes 2.3 → the prompt breathes, the tap at TAP exits.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, u) => a + (b - a) * u;
const outCubic = (u) => 1 - (1 - u) ** 3;
const outBack = (u, k = 1.6) => 1 + (k + 1) * (u - 1) ** 3 + k * (u - 1) ** 2;
const inOut = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const f2 = (v) => (+v).toFixed(2);

export function createMotion(stage, opts = {}) {
  const reduced = !!opts.reduced;
  let tapAt = opts.tapAt ?? Infinity;
  const progress = opts.progress === undefined ? null : opts.progress;
  const ramp0 = Number.isFinite(opts.ramp0) ? clamp(opts.ramp0) : 0.62;   // where the comp's own ramp starts (a capture of the whole load passes ?ramp0=0)
  const svg = stage.querySelector('#logo svg');
  const M = JSON.parse(svg.querySelector('#logo-meta').textContent);
  const L = [...svg.querySelectorAll('defs path[id^="l"]')].map((p) => ({ p, base: p.dataset.base, cx: +p.dataset.cx, cy: +p.dataset.cy, bot: +p.dataset.bot }));
  const S = [...svg.querySelectorAll('.sealine')].map((g) => ({ y: +g.dataset.y, lb: +g.dataset.lb, ph: +g.dataset.ph, sb: g.querySelector('.sb'), sp: g.querySelector('.sp'), sc: g.querySelector('.sc') }));
  const fish = svg.querySelector('.fish'), splash = svg.querySelector('.splash'), spark = svg.querySelector('.spark'), shine = svg.querySelector('.shine');
  const sub = [...svg.querySelectorAll('.sub path')].map((p) => ({ p, base: p.getAttribute('transform') || '' })), rules = svg.querySelector('.rules');
  const $ = (s) => stage.querySelector(s);
  const ui = { logo: $('.logo'), header: $('header'), tip: $('.tip'), gauge: $('.gauge'), prompt: $('.prompt'), footer: $('footer'), bg: $('.bg'), bg2: $('.bg2'), bar: $('.bar i'), runner: $('.bar .runner'), pct: $('.pct'), dia: [...stage.querySelectorAll('#go .dia')] };

  const wave = (y0, ph) => { let d = `M-40 ${f2(y0 + M.wave.a * Math.sin(-40 / M.wave.f + ph))}`; for (let X = -35; X <= M.W + 46; X += 5) d += `L${X} ${f2(y0 + M.wave.a * Math.sin(X / M.wave.f + ph))}`; return d; };
  const window1 = (t, t0, d) => clamp((t - t0) / d);

  function letters(t) {
    const idle = clamp((t - 2.6) / 0.6);
    L.forEach((l, i) => {
      const s0 = 0.15 + i * 0.09, u = reduced ? 1 : (t - s0) / 0.42;
      if (u <= 0) { l.p.setAttribute('transform', 'translate(0 -9999)'); return; }
      let dy = 0, sx = 1, sy = 1, dr = 0;
      if (u < 0.5) { const v = u / 0.5; dy = -84 * (1 - v * v); sx = sy = lerp(0.72, 1, v); dr = lerp(-16, 0, v); }
      else if (u < 0.66) { const q = Math.sin(((u - 0.5) / 0.16) * Math.PI); sy = 1 - 0.16 * q; sx = 1 + 0.1 * q; }
      else if (u < 1) { const v = (u - 0.66) / 0.34, q = Math.sin(v * Math.PI) * (1 - v); dy = -7 * q; sy = 1 + 0.05 * q; sx = 1 / sy; }
      if (!reduced) { dy += idle * 2.2 * Math.sin((2 * Math.PI * t) / 2.6 + i * 0.9); dr += idle * 1.2 * Math.cos((2 * Math.PI * t) / 2.6 + i * 0.9); }
      l.p.setAttribute('transform', `translate(0 ${f2(dy)}) translate(${l.cx} ${l.bot}) scale(${f2(sx)} ${f2(sy)}) translate(${-l.cx} ${-l.bot}) rotate(${f2(dr)} ${l.cx} ${l.cy}) ${l.base}`);
    });
  }

  function sea(t) {
    S.forEach((s, li) => {
      const t0 = li === 0 ? 0.42 : 0.66, u = reduced ? 1 : window1(t, t0, 0.85), k = t - t0;
      const slosh = !reduced && k > 0 ? 4 * Math.exp(-2.6 * k) * Math.sin(8.5 * k) : 0;
      const level = lerp(s.lb + 8, s.y, outCubic(u)) + slosh, crest = wave(level, s.ph + (reduced ? 0 : t * 2.2));
      const body = `${crest}L${M.W + 46} ${f2(s.lb + 30)}L-40 ${f2(s.lb + 30)}Z`;
      s.sb.setAttribute('d', body); s.sp.setAttribute('d', body); s.sc.setAttribute('d', crest);
    });
  }

  function leap(t) {
    const u = reduced ? 1 : (t - 1.05) / 0.46;
    if (u <= 0) { fish.style.opacity = 0; splash.style.opacity = 0; return; }
    const v = clamp(u), x0 = M.splash.x + 6, y0 = M.splash.y + 12;
    let x = lerp(x0, M.fish.x, outCubic(v)), y = lerp(y0, M.fish.y, outCubic(v)) - 30 * Math.sin(Math.PI * v), r = lerp(-75, M.fish.r, outCubic(v));
    const sc = M.fish.sc * lerp(0.4, 1, outBack(v));
    const bob = reduced ? 0 : clamp((t - 1.6) / 0.5);
    y += bob * 1.6 * Math.sin((2 * Math.PI * t) / 2.2); r += bob * 2 * Math.sin((2 * Math.PI * t) / 2.2 + 1);
    fish.style.opacity = 1; fish.setAttribute('transform', `translate(${f2(x)} ${f2(y)}) rotate(${f2(r)}) scale(${f2(sc)})`);
    const k = outBack(clamp(u / 0.6), 2.2);
    splash.style.opacity = 1; splash.setAttribute('transform', `translate(${M.splash.x} ${M.splash.y}) scale(${f2(lerp(0.3, 1, k))}) translate(${-M.splash.x} ${-M.splash.y})`);
  }

  function sparkle(t) {
    // the leap's spark, then quiet twinkles on the idle
    const tw = [[1.36, M.fish.x + 22, M.fish.y - 16, 1.15], [3.25, -6, M.top + 8, 0.8], [5.55, M.W - 8, M.top + 112, 0.8]];
    const a = !reduced && tw.find(([t0]) => t >= t0 && t < t0 + 0.5);
    if (!a) { spark.style.opacity = 0; return; }
    const u = (t - a[0]) / 0.5, k = Math.sin(Math.PI * u) * a[3];
    spark.style.opacity = 1; spark.setAttribute('transform', `translate(${f2(a[1])} ${f2(a[2])}) rotate(${f2(90 * u)}) scale(${f2(k)})`);
  }

  function english(t) {
    const r = reduced ? 1 : outCubic(window1(t, 1.45, 0.4));
    rules.style.opacity = r; rules.setAttribute('transform', `translate(${M.W / 2} 0) scale(${f2(lerp(0.4, 1, r))} 1) translate(${-M.W / 2} 0)`);
    sub.forEach((g, i) => { const u = reduced ? 1 : outCubic(window1(t, 1.45 + i * 0.025, 0.3)); g.p.style.opacity = u; g.p.setAttribute('transform', `${g.base} translate(0 ${f2((1 - u) * 40)})`); });
  }

  function sweep(t) {
    const w = !reduced && [1.95, 6.95].find((t0) => t >= t0 && t < t0 + 0.6);
    if (w === undefined || w === false) { shine.style.opacity = 0; return; }
    shine.style.opacity = 1; shine.setAttribute('transform', `translate(${f2(lerp(-80, M.W + 140, inOut((t - w) / 0.6)))} 0)`);
  }

  // progress === null: the comp's fake ramp (capture of the sequence). A number pins the gauge.
  // A function is the live bar (core/loadbar.js owns the transforms, so this does not write width or left).
  // The hand-over to the prompt is the comp's fade, shifted so it starts the moment real progress reaches 1.
  let doneAt = null, promptFocused = false;
  function hud(t) {
    const live = typeof progress === 'function';
    const pinned = typeof progress === 'number';
    const p = live ? clamp(progress()) : pinned ? clamp(progress) : (ramp0 + (1 - ramp0) * inOut(window1(t, 0.3, 2.0)));
    if (!live && ui.bar) ui.bar.style.width = `calc(${(p * 100).toFixed(2)}% - 4px)`;
    if (!live && ui.runner) ui.runner.style.left = `${(p * 100).toFixed(2)}%`;
    // The number belongs to the load bar (core/loadbar.js writes round(mark * 100) in the same call that moves the mark): a frame clock stops while a long step blocks the page, and a number
    // it wrote stood at 10 % while the bar went on to 15 %. This clock writes the number only when it owns the gauge: the comp's ramp, a pin (?p=), a capture.
    if (!live && ui.pct && ui.pct.firstChild) ui.pct.firstChild.nodeValue = String(Math.round(p * 100));
    // live: p is where the solid edge is (loadbar.position(): the eased move to the completed mark, never past it); the hand-over starts when it reaches the end
    const ready = live || pinned ? p >= 1 - 1e-9 : t >= 2.35;
    // Live progress plays the hand-over from the moment it reaches 1. A pin (or the comp's own ramp) stays on the spec clock, so one capture frame at t shows that frame.
    if (ready && doneAt === null) doneAt = live ? t : 2.35;
    if (!ui.gauge || !ui.prompt) return;
    if (!ready) { ui.gauge.style.visibility = ''; ui.gauge.style.opacity = 1; ui.prompt.style.display = 'none'; return; }
    const te = 2.35 + (t - doneAt);
    const fadeDur = 0.2, inDur = reduced ? 0.2 : 0.3;
    // v4: the gauge holds its full bar for 150 ms, then leaves (200 ms); only then does the prompt come in, so the two never overlap
    ui.gauge.style.visibility = te > 2.7 ? 'hidden' : ''; ui.gauge.style.opacity = f2(1 - window1(te, 2.5, fadeDur));
    ui.prompt.style.display = 'grid';
    // The prompt is display:none until this frame, so main.js's focus() at `loaded` can land on a hidden button and do nothing. Once it is enabled and on screen, a fine pointer gets the ring (the same check as main.js). A coarse pointer does not.
    if (!promptFocused) {
      const go = document.getElementById('go');
      if (go && !go.disabled) {
        promptFocused = true;
        requestAnimationFrame(() => { try { if (matchMedia('(pointer: fine)').matches) go.focus({ preventScroll: true }); } catch { /* not rendered */ } });
      }
    }
    // v4: the prompt rises 8 px as it fades in (300 ms, ease-out), then breathes: opacity 1 → .6 → 1, 1.6 s each way on a cosine
    // (ease-in-out). A tap holds it at full strength. Under reduced motion it fades in place (200 ms) and stays still.
    const u = window1(te, 2.7, inDur), rise = reduced ? 0 : 8 * (1 - outCubic(u));
    const breathe = reduced ? 1 : 0.8 + 0.2 * Math.cos((Math.PI * Math.max(0, te - 3)) / 1.6);
    ui.prompt.style.opacity = f2((reduced ? u : outCubic(u)) * (t >= tapAt ? 1 : breathe));
    // the transform is written only while it rises: an inline transform every frame would beat the press layer's :active scale(0.97)
    // (ui-b2 row 6), so once it has risen the inline transform is cleared and the stylesheet presses it
    if (rise > 0.01) ui.prompt.style.transform = `translateY(${f2(rise)}px)`; else if (ui.prompt.style.transform) ui.prompt.style.transform = '';
  }

  function exit(t) {
    if (t < tapAt) { for (const k of ['logo', 'header', 'tip', 'gauge', 'prompt', 'footer']) if (ui[k] && k !== 'gauge' && k !== 'prompt') ui[k].style.opacity = ''; ui.bg.style.transform = ''; if (ui.bg2) ui.bg2.style.opacity = 0; ui.dia.forEach((e) => (e.style.transform = '')); return; }
    // the press is answered: the two ◆ close in on the words (240 ms) while the line holds full strength, then everything leaves
    const pinch = 5 * Math.sin(Math.PI * window1(t, tapAt, 0.24));
    ui.dia.forEach((e, i) => (e.style.transform = `translateX(${f2(i ? -pinch : pinch)}px) rotate(45deg)`));
    const e = inOut(window1(t, tapAt + 0.12, 0.42)), u = inOut(window1(t, tapAt + 0.1, 0.35));
    ui.logo.style.opacity = 1 - e; ui.logo.style.transform = `translateX(-50%) translateY(${f2(-28 * e)}px) scale(${f2(1 + 0.04 * e)})`;
    for (const k of ['header', 'tip', 'footer']) ui[k].style.opacity = 1 - u;
    ui.prompt.style.opacity = 1 - u;
    const z = inOut(window1(t, tapAt + 0.1, 1.1));
    ui.bg.style.transform = `scale(${f2(1 + 0.22 * z)})`;
    if (ui.bg2) { const c = inOut(window1(t, tapAt + 0.65, 0.55)); ui.bg2.style.opacity = c; ui.bg2.style.transform = `scale(${f2(1.08 - 0.08 * c)})`; }
  }

  function frameReduced(t) {
    const a = clamp(t / 0.2);
    if (svg) svg.style.opacity = String(a);
    for (const l of L) l.p.setAttribute('transform', l.base);
    for (const k of ['header', 'tip', 'footer']) if (ui[k]) ui[k].style.opacity = String(a);
    hud(t);
    if (t < tapAt) return;
    const u = window1(t, tapAt, 0.2);
    if (ui.logo) { ui.logo.style.opacity = String(1 - u); ui.logo.style.transform = 'translateX(-50%)'; }
    for (const k of ['header', 'tip', 'footer', 'prompt']) if (ui[k]) ui[k].style.opacity = String(1 - u);
    if (ui.bg) ui.bg.style.transform = '';
    if (ui.bg2) ui.bg2.style.opacity = 0;
  }

  function frame(t) {
    if (reduced) { frameReduced(t); return; }
    letters(t); sea(t); leap(t); sparkle(t); english(t); sweep(t); hud(t); exit(t);
  }
  return { frame, meta: M, setTap(t) { tapAt = t; } };
}
