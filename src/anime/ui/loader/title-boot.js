/* [loader] Title behaviour before the app arrives: language, the tip pager, the logo's カツオ on the gauge, the motion clock,
   the sound button, the failure notice. Inlined after title-motion.js by scripts/anime/loader-inline.js (classic script, no import). */
(function () {
  var d = document, q = new URLSearchParams(location.search), stage = d.getElementById('intro');
  try { performance.mark('klc:loader'); } catch (e) { /* no marks */ }
  var lang = d.documentElement.lang === 'en' ? 'en' : 'ja';
  var tips = [];
  try { tips = JSON.parse(d.getElementById('klc-tips').textContent) || []; } catch (e) { /* the card stays empty */ }
  var ti = 0;
  if (tips.length) {
    var pin = q.get('tip');
    ti = pin != null ? Math.max(0, Math.min(tips.length - 1, (Number(pin) || 1) - 1)) : Math.floor(Math.random() * tips.length);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u200b/g, '<wbr>');
  }
  function paintTip() {
    var t = tips[ti]; if (!t) return;
    var p = d.getElementById('tip-body'), s = d.getElementById('tip-src'), n = d.getElementById('tip-n'), N = d.getElementById('tip-N');
    if (p) p.innerHTML = esc(lang === 'en' ? t.en : t.ja);
    // the source in the page's language: an English page shows the publication's English name, never a Japanese-only line
    if (s) s.innerHTML = lang === 'en' ? 'Source: ' + esc(t.srcEn || t.src || '') : '出典：' + esc(t.src || '');
    if (n) n.textContent = String(ti + 1);
    if (N) N.textContent = String(tips.length);
  }
  function soundLabel(on) { return on ? (lang === 'en' ? 'Sound off' : '音をけす') : (lang === 'en' ? 'Sound on' : '音をだす'); }
  function paintSound(on) {
    var b = d.getElementById('ld-sound'); if (!b) return;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', soundLabel(on));
  }
  function setLang(next) {
    lang = next === 'en' ? 'en' : 'ja';
    d.documentElement.lang = lang;
    try { localStorage.setItem('klc.lang', lang); } catch (e) { /* private mode */ }
    d.querySelectorAll('.lang button').forEach(function (b) { var on = b.getAttribute('data-lang') === lang; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    // the map credit and the mascot credit follow the language; the English credit is the manual's own form, unaltered
    // (docs/loading/HOYABOYA.md), set in two lines after its comma like the Japanese one
    var mc = d.getElementById('ld-map'); if (mc) mc.textContent = lang === 'en' ? 'Map © GSI Japan · OpenStreetMap' : '地図 © 国土地理院・OpenStreetMap';
    var hc = d.getElementById('ld-hoya-credit'); if (hc) hc.innerHTML = lang === 'en' ? 'Kesennuma City Mascot,<br>Hoya Boya the Ocean Boy' : '気仙沼市観光キャラクター<br>「海の子 ホヤぼーや」';
    paintTip();
    var b = d.getElementById('ld-sound'); if (b) b.setAttribute('aria-label', soundLabel(b.getAttribute('aria-pressed') === 'true'));
  }
  d.querySelectorAll('.lang button').forEach(function (b) { b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); }); });
  setLang(lang);   // sync the toggle, the credits and the tip to the language picked before first paint (?lang=, klc.lang)
  // The prompt says what the input is: a coarse pointer taps, a fine pointer clicks (the head script set html[data-input] before the first
  // paint; ?input=touch|mouse pins it for a capture). It follows a change, such as a trackpad attached to an iPad.
  try {
    var mq = matchMedia('(pointer: coarse)'), pinIn = q.get('input');
    var paintInput = function () { d.documentElement.setAttribute('data-input', pinIn === 'touch' || pinIn === 'mouse' ? pinIn : (mq.matches ? 'touch' : 'mouse')); };
    paintInput();
    if (mq.addEventListener) mq.addEventListener('change', paintInput); else if (mq.addListener) mq.addListener(paintInput);
  } catch (e) { /* no matchMedia: the touch wording stays */ }
  // Keyboard focus is visible; a pointer is not shown a ring. main.js focuses the prompt for a fine pointer when the town is ready, and a
  // browser draws that programmatic focus as :focus-visible, so the ring follows the last input instead: any key but Enter (which starts) shows it.
  d.addEventListener('keydown', function (e) { if (e.key !== 'Enter') d.documentElement.setAttribute('data-kbd', '1'); }, true);
  d.addEventListener('pointerdown', function () { d.documentElement.removeAttribute('data-kbd'); }, true);
  var prev = d.getElementById('tip-prev'), next = d.getElementById('tip-next');
  if (prev) prev.addEventListener('click', function () { if (!tips.length) return; ti = (ti + tips.length - 1) % tips.length; paintTip(); });
  if (next) next.addEventListener('click', function () { if (!tips.length) return; ti = (ti + 1) % tips.length; paintTip(); });

  var fishHost = d.getElementById('fish'), logoFish = d.querySelector('#logo .fish');
  if (fishHost && logoFish) {
    var c = logoFish.cloneNode(true);
    c.removeAttribute('class');
    c.setAttribute('transform', 'rotate(10) scale(.9)');
    fishHost.appendChild(c);
  }

  var reduced = false;
  try { reduced = (matchMedia('(prefers-reduced-motion: reduce)').matches && !q.get('force')) || q.get('reduce') === '1'; } catch (e) { /* assume motion */ }
  var capture = q.get('capture') === '1';
  var progress = null;
  if (q.get('p') != null && q.get('state') !== 'auto') progress = Math.max(0, Math.min(1, +q.get('p')));
  else if (!capture) progress = function () { var b = window.__loadBar; return b ? b.position() : 0; };
  var motion = createMotion(stage, { reduced: reduced, tapAt: q.get('tap') != null ? +q.get('tap') : Infinity, progress: progress, ramp0: q.get('ramp0') != null ? +q.get('ramp0') : undefined });
  var clock = 0, stingAt = null, stung = false, audio = null;

  function getT() { return clock; }
  function frameAt(t) { clock = t; motion.frame(t); }
  if (capture && !(typeof progress === 'number' && progress < 1)) d.body.classList.add('loaded');
  if (capture) {
    window.__T = frameAt;
    frameAt(q.get('tframe') ? +q.get('tframe') : 0);
    d.body.dataset.ready = '1';
  } else {
    // One clock, started by the first frame the browser draws, so the whole intro plays even when a busy phone starts
    // drawing late. Animation frames drive it; when they stall (a phone busy loading the town, a throttled or embedded
    // view), a timer keeps it moving so the letters always land. The markup holds the landed logo, and nothing hides a
    // letter before that first frame. The clock stops once the town is playing and the title is gone.
    var t0 = -1, lastTick = 0, ended = false;
    function tick(now) {
      if (t0 < 0) t0 = now;
      lastTick = performance.now();
      frameAt(Math.max(clock, (now - t0) / 1000));
      var p = typeof progress === 'function' ? progress() : (typeof progress === 'number' ? progress : 0);
      if (!stung && p >= 1 - 1e-9) { stung = true; stingAt = clock; if (audio && audio.on) audio.sting(getT, stingAt); }
    }
    function loop(now) { if (ended) return; tick(now); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
    var guard = setInterval(function () {
      if (d.body.classList.contains('playing')) { ended = true; clearInterval(guard); return; }
      if (t0 >= 0 && performance.now() - lastTick > 150) tick(performance.now());
    }, 100);
    d.body.dataset.ready = '1';
  }

  function loadAudio(then) {
    import('./audio/title-sfx.js').then(function (m) { if (!audio) audio = m.createTitleSound(); then(audio); }).catch(function () { /* sound stays off */ });
  }
  try {
    if (localStorage.getItem('klc.titleSound') === '1') {
      paintSound(true);
      d.addEventListener('pointerdown', function arm(ev) {
        if (ev.target && ev.target.closest && ev.target.closest('#ld-sound')) return;
        d.removeEventListener('pointerdown', arm, true);
        loadAudio(function (a) { a.enable(getT, stingAt); });
      }, true);
    }
  } catch (e) { /* private mode: sound stays off */ }
  var soundBtn = d.getElementById('ld-sound');
  if (soundBtn) soundBtn.addEventListener('click', function () {
    var on = soundBtn.getAttribute('aria-pressed') !== 'true';
    paintSound(on);
    loadAudio(function (a) { if (on) a.enable(getT, stingAt); else a.disable(); });
  });

  window.__titleOnGo = function () {
    if (window.__titleGone) return;
    window.__titleGone = 1;
    motion.setTap(clock);
    if (audio && audio.on) audio.tap();
    setTimeout(function () {
      if (window.__titleFly) window.__titleFly();
      else if (window.__titleArrive) window.__titleArrive();
    }, reduced ? 200 : 700);
  };

  var failed = false;
  function notice(kind) {
    var intro = d.getElementById('intro'), msg = d.querySelector('.ld-errmsg');
    if (!intro || !msg || d.body.classList.contains('loaded') || d.body.classList.contains('playing')) return;
    msg.setAttribute('data-kind', kind); intro.classList.add('ld-failed'); failed = true;
  }
  function clearNotice() { if (!failed) return; failed = false; var intro = d.getElementById('intro'); if (intro) intro.classList.remove('ld-failed'); }
  function health() { var ok = window.__loadLog && window.__loadLog.length > 0; if (ok) clearNotice(); else if (navigator.onLine === false) notice('offline'); else if (performance.now() > 30000) notice('slow'); }
  addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'SCRIPT' && !(window.__loadLog && window.__loadLog.length)) notice('failed'); }, true);
  addEventListener('offline', health); addEventListener('online', health);
  var hb = setInterval(function () { if (d.body.classList.contains('loaded') || d.body.classList.contains('playing')) { clearInterval(hb); return; } health(); }, 2000);
  var retry = d.getElementById('ld-retry'); if (retry) retry.addEventListener('click', function () { location.reload(); });

  try {
    var host = location.hostname, local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]', tpl = d.getElementById('klc-hoya-dev');
    if (local && tpl && new URLSearchParams(location.search).get('hoya') === 'run') {
      var run = d.querySelector('.runner');
      if (run) run.innerHTML = '<div class="sr" data-character="hoyaboya" data-n="1"><div class="sr-bob"><div class="sr-win"><img class="sr-strip" alt=""></div></div></div>';
      d.documentElement.classList.add('klc-hoya-dev');
    }
  } catch (e) { /* no dev runner */ }

  try {
    if (reduced || typeof stage.animate !== 'function') { /* the motion clock fades in place; .ld-fade is the safety net if the clock never starts */ }
  } catch (e) { /* no matchMedia */ }
})();
