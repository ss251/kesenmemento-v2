// [loader] The stand-in for src/anime/main.js in tools/anime/loader-preview.mjs: the page's real index.html (loader, title screen, inline scripts) with the real loadbar, and no world.
// window.__preview drives the same events main.js does: set(frac, label, creep) = setProgress, loaded() = the 'loaded' class and the button, play() = start().
import { createLoadBar } from '../../src/anime/core/loadbar.js';
import { loadPlan } from '../../src/anime/core/loadplan.js';

const bar = createLoadBar();
window.__bar = bar; window.__loadBar = bar; window.__loadLog = bar.log;   // (__loadBar: the title clock's progress() reads it, as it does from main.js)
const MODS = ['environment', 'water', 'town', 'harbor', 'landmarks', 'life', 'ship', 'explore'];
window.__plan = loadPlan(MODS, { phone: new URLSearchParams(location.search).has('phone') });
let ready = false;
window.__preview = {
  set: (f, label, creep) => bar.set(f, label, creep),
  /** a stage of the real plan: begin('town') = what main.js build() does at the start of the town module */
  begin(key, ms) { const p = window.__plan; bar.set(p.start(key), p.label(key), { to: p.start(key) + p.span(key) * 0.97, ms: ms ?? p.weight(key) * 100 }); },
  /** run the stages of the real plan up to `key` (flags are hoisted per stage, so they must be begun in order) */
  upTo(key) { for (const k of window.__plan.keys) { window.__preview.begin(k); if (k === key) break; } },
  loaded() { if (ready) return; ready = true; bar.set(1, ''); document.body.classList.add('loaded'); const go = document.getElementById('go'); go.disabled = false; go.addEventListener('click', () => window.__preview.play()); },
  play() { document.body.classList.add('playing'); },
};
const q = new URLSearchParams(location.search);
if (q.has('stage')) window.__preview.upTo(q.get('stage'));
else if (q.has('p')) window.__preview.set(Number(q.get('p')), q.get('label') ?? '町並みを準備中…');
if (q.get('state') === 'loaded') window.__preview.loaded();
if (q.get('state') === 'playing') { window.__preview.loaded(); window.__preview.play(); }
