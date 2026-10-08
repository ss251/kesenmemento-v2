// [ship:story] Living City story pins: short sourced stories tied to a real place, listed in the places list (their own
// group, 「町の物語」) and found by search. Selecting one flies the drone there, pins its label and opens a story card.
// A small wooden 説明板 marks the spot in the world. It is a stylised marker of the pin: no source shows a real signboard
// at the site (a housing-relocation dig), and its roof and lettering are invented.
//
// The strings and the sources are in data/ship/story-pins.json (JA and EN, same keys). Each pin is a lat/lon, projected
// with layout.js llToXZ. A pin outside the map (layout ZONES.far) is moved to the nearest map edge, 60 m in, and its
// card says so (edgeNote).
//
// The first pin is 波怒棄館遺跡 (唐桑町荒谷前): an early Jōmon shell midden of about 5,500 years ago with more than 140 kg of
// tuna bones, some from fish over 2 m, stone blades still stuck in some, perhaps a butchering site (the 臼福本店 public talk (2026-10-03)
// item 5; the location from the prefecture's 2013 dig list and GSI, see the JSON's sources).
//
//   storyPlaces(L)                      -> places-list entries { id, ja, en, cat, at, group, groupLabel, story }
//   pinPosition(pin, L)                 -> { x, z, inMap, edge }   (pure)
//   createStoryPins(ctx, { L, goTo })   -> { places, card, open(id), markers }
import * as THREE from 'three';
import DATA from '../../../../data/ship/story-pins.json';

export const STORY = DATA;
/** How far inside the map's edge a pin from outside it stands (m). */
export const EDGE_IN = 60;
/** The pin's label hangs this far above the ground (the board's roof is at 5.1 m). */
export const LABEL_UP = 11;
/** The signboards are drawn within this distance of the camera (m). */
export const SHOW_R = 1500;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Where a pin stands in the world: its projected lat/lon, or the nearest point EDGE_IN inside the map (pure). */
export function pinPosition(pin, L) {
  const [x0, z0] = L.llToXZ(pin.lat, pin.lon);
  const F = L.ZONES?.far;
  if (!F) return { x: x0, z: z0, inMap: true, edge: false };
  const inMap = x0 >= F.x0 && x0 <= F.x1 && z0 >= F.z0 && z0 <= F.z1;
  if (inMap) return { x: x0, z: z0, inMap, edge: false };
  const x = Math.min(F.x1 - EDGE_IN, Math.max(F.x0 + EDGE_IN, x0));
  const z = Math.min(F.z1 - EDGE_IN, Math.max(F.z0 + EDGE_IN, z0));
  return { x, z, inMap: false, edge: true };
}

/**
 * The drone view of a pin (pure): the board in the lower third, the sea it looks out on beyond it (a midden sits above
 * the shore). Of 16 bearings, the one that reaches the sea (L.isWater, or ground at sea level) within 2.5 km over the
 * lowest ground wins (nearer breaks ties); without one, downhill. The camera stands VIEW.back m behind the pin on the
 * other side, VIEW.up m above it, and looks VIEW.ahead m beyond it. -> { pos, look, yaw, sea } (yaw: the board's
 * facing, toward the camera; sea: the bearing's distance to the water, m, or null).
 */
export const VIEW = { back: 46, up: 24, ahead: 120 };
export function storyFraming(L, x, z) {
  const g = (px, pz) => Math.max(0, L.heightAt(px, pz));
  const y = g(x, z);
  let best = null;
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8, ux = Math.sin(a), uz = -Math.cos(a);
    let hit = null, top = -Infinity;
    for (let d = 50; d <= 2500; d += 25) {
      const px = x + ux * d, pz = z + uz * d;
      if (L.heightAt(px, pz) <= 0.5 || L.isWater?.(px, pz)) { hit = d; break; }
      top = Math.max(top, g(px, pz));
    }
    if (hit === null) continue;
    const score = Math.max(0, top - y) + hit / 100;
    if (!best || score < best.score) best = { score, ux, uz, hit };
  }
  let dx, dz;
  if (best) { dx = best.ux; dz = best.uz; }
  else {
    dx = g(x - 40, z) - g(x + 40, z); dz = g(x, z - 40) - g(x, z + 40);   // downhill
    const n = Math.hypot(dx, dz); if (n < 1e-3) { dx = 0; dz = -1; } else { dx /= n; dz /= n; }
  }
  const cx = x - dx * VIEW.back, cz = z - dz * VIEW.back, cy = Math.max(g(cx, cz) + 6, y + VIEW.up);
  const lx = x + dx * VIEW.ahead, lz = z + dz * VIEW.ahead;
  return { pos: [+cx.toFixed(1), +cy.toFixed(1), +cz.toFixed(1)], look: [+lx.toFixed(1), +(g(lx, lz) + 2).toFixed(1), +lz.toFixed(1)], yaw: Math.atan2(-dx, -dz), sea: best ? best.hit : null };
}

/** The pins as places-list entries (explore's `featured` shape), with their story attached. */
export function storyPlaces(L, pins = DATA.pins) {
  return pins.map((p) => {
    const at = pinPosition(p, L);
    return {
      id: p.id, ja: p.title.ja, en: p.title.en, cat: p.cat || 'landmark', at: [+at.x.toFixed(1), +at.z.toFixed(1)],
      group: 'story', groupLabel: DATA.group, story: p, edge: at.edge, view: storyFraming(L, at.x, at.z),
      labelY: Math.max(0, L.heightAt(at.x, at.z)) + LABEL_UP,   // the label floats over the board, not on it
    };
  });
}

/** The story card's HTML for one pin in one language (pure; tested). */
export function cardHTML(pin, lang = 'ja', edge = false) {
  const l = lang === 'en' ? 'en' : 'ja', U = DATA.ui[l];
  const src = pin.sources.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}</li>`).join('');
  return `<button class="x" data-act="close" aria-label="${esc(U.close)}">×</button>`
    + `<small class="kick">${esc(pin.kicker[l])}</small><h3>${esc(pin.title[l])}</h3>`
    + pin.story[l].map((t) => `<p>${esc(t)}</p>`).join('')
    + (edge ? `<p class="edge">${esc(U.edge)}</p>` : '')
    + `<details><summary>${esc(U.where)} · ${esc(U.source)}</summary><p class="where">${esc(pin.where[l])}</p><ul>${src}</ul></details>`;
}

const CSS = /* css */`
#klc-story,#klc-story *{box-sizing:border-box}
#klc-story{position:fixed;left:16px;top:calc(124px + env(safe-area-inset-top,0px));z-index:38;width:min(400px,calc(100% - 32px));max-height:calc(100vh - 290px);max-height:calc(100dvh - 290px);overflow:auto;overscroll-behavior:contain;padding:14px 16px 12px;font-family:"Zen Maru Gothic","Noto Sans JP",system-ui,sans-serif;color:#2b2a3a;background:rgba(255,253,248,.9);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.7);border-radius:16px;box-shadow:0 6px 24px rgba(40,40,70,.18);transition:opacity .35s,transform .35s;opacity:0;transform:translateY(8px);pointer-events:none}
#klc-story.show{opacity:1;transform:none;pointer-events:auto}
#klc-story .kick{display:block;font-size:12px;color:#8a5a3c;font-weight:700;letter-spacing:.04em}
#klc-story h3{margin:2px 28px 8px 0;font-size:18px;line-height:1.35;text-wrap:balance;word-break:auto-phrase}
#klc-story p{margin:6px 0;font-size:14px;line-height:1.65}
#klc-story p.edge{font-size:12px;opacity:.75}
#klc-story details{margin-top:8px;font-size:12px;opacity:.85}
#klc-story summary{cursor:pointer;min-height:28px;line-height:28px}
#klc-story ul{margin:4px 0 0;padding-left:18px}
#klc-story li{margin:2px 0;line-height:1.45}
#klc-story a{color:#2f64b5}
#klc-story .x{position:absolute;right:8px;top:8px;width:36px;height:36px;border:0;border-radius:999px;background:#fff;font:inherit;font-size:20px;line-height:36px;cursor:pointer;box-shadow:0 2px 8px rgba(40,40,70,.15);transition:transform var(--dur-press) var(--ease-out),background-color var(--dur-fast) ease}
#klc-story .x:active{transform:scale(.97)}   /* [ui-b2:6] the press layer (ui/style.js) */
#klc-story .x:focus-visible,#klc-story summary:focus-visible,#klc-story a:focus-visible{outline:2px solid var(--ring-ink, #1f3a68);outline-offset:2px;box-shadow:0 0 0 5px var(--ring-halo, rgba(255, 255, 255, 0.92))}   /* two tones: legible on the card and on the scene behind it */
body.shot #klc-story,body.shotui #klc-story{transition:none}
@media (max-width:520px){#klc-story{top:calc(112px + env(safe-area-inset-top,0px));max-height:calc(100vh - 300px);max-height:calc(100dvh - 300px)}#klc-story p{font-size:13px}}
@media (pointer:coarse){#klc-story .x{width:44px;height:44px;line-height:44px;font-size:22px}#klc-story h3{margin-right:40px}}
/* [ui-b:13] a phone on its side (844 x 390, 844 x 340): the card was 126 / 76 px tall, below the HUD's top rows and cut mid-line. It takes the left 46 % of the screen
   from the top (inside the notch's insets) and scrolls by touch (data-scroll, see mountStoryCard). [ui-b2] It stops above the time dock instead of running to the bottom of the screen:
   the dock (centred, 26 px above the inset, about 56 px tall) sits under the card's x range, and a 289 px card at 844 x 390 overlapped its top 16 px (it is above the HUD, z-index 38).
   The reserve is the dock's 26 + 56 and 10 px of air. */
@media (max-height:520px) and (orientation:landscape){#klc-story{top:calc(12px + env(safe-area-inset-top,0px));left:calc(12px + env(safe-area-inset-left,0px));width:min(380px,46vw);max-height:calc(100vh - 104px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));max-height:calc(100dvh - 104px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))}}
`;

/** The story card (DOM): open(pin, lang, edge), close(). Null without a document (tests). */
export function mountStoryCard(doc = typeof document !== 'undefined' ? document : null) {
  // a real DOM only (some tests fake `document` with a canvas factory and nothing else)
  if (typeof doc?.createElement !== 'function' || typeof doc.getElementById !== 'function' || !doc.head?.appendChild || !doc.body?.appendChild) return null;
  if (!doc.getElementById('klc-story-css')) { const st = doc.createElement('style'); st.id = 'klc-story-css'; st.textContent = CSS; doc.head.appendChild(st); }
  const el = doc.createElement('aside');
  // data-scroll: the touch pad vetoes every touchmove outside the elements it lists, [data-scroll] among them (ui/touchpad.js harden()); without it the card cannot be scrolled by touch
  el.id = 'klc-story'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-live', 'polite'); el.setAttribute('data-scroll', ''); el.hidden = true;
  doc.body.appendChild(el);
  const card = {
    el, current: null,
    open(pin, lang = 'ja', edge = false) {
      card.current = { pin, edge }; el.innerHTML = cardHTML(pin, lang, edge); el.lang = lang; el.hidden = false;
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => el.classList.add('show')); else el.classList.add('show');
    },
    relang(lang) { if (card.current && !el.hidden) { el.innerHTML = cardHTML(card.current.pin, lang, card.current.edge); el.lang = lang; } },
    close() { el.classList.remove('show'); card.current = null; setTimeout(() => { if (!card.current) el.hidden = true; }, 380); },
  };
  el.addEventListener('click', (e) => { if (e.target.closest?.('[data-act="close"]')) card.close(); });
  if (typeof addEventListener === 'function') addEventListener('keydown', (e) => { if (e.code === 'Escape' && card.current) card.close(); });
  return card;
}

/** A wooden 説明板 (two posts, a small gabled roof, a board lettered with `sign.title` and `sign.sub`), facing +z. */
export function buildSignboard(sign = { title: '', sub: '' }, { canvas = null } = {}) {
  const g = new THREE.Group(); g.name = 'story-signboard';
  const wood = new THREE.MeshToonMaterial({ color: '#7a5434' }), roof = new THREE.MeshToonMaterial({ color: '#4c3a2e' });
  let face = new THREE.MeshToonMaterial({ color: '#efe6d2' });
  const x = canvas?.getContext?.('2d');
  if (x && typeof x.fillText === 'function') {
    const c = canvas;
    x.fillStyle = '#efe6d2'; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#7a5434'; x.lineWidth = 10; x.strokeRect(10, 10, c.width - 20, c.height - 20);
    x.fillStyle = '#2b2a3a'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${Math.round(c.height * 0.3)}px "Zen Maru Gothic","Noto Sans JP",sans-serif`; x.fillText(sign.title, c.width / 2, c.height * 0.42);
    x.font = `500 ${Math.round(c.height * 0.13)}px "Zen Maru Gothic","Noto Sans JP",sans-serif`; x.fillText(sign.sub, c.width / 2, c.height * 0.75);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    face = new THREE.MeshToonMaterial({ color: '#ffffff', map: tex });
  }
  const W = 4.2, H = 2.2, P = 2.6;
  const post = new THREE.BoxGeometry(0.22, P + H, 0.22);
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(post, wood); m.position.set(sx * (W / 2 - 0.15), (P + H) / 2, 0); g.add(m); }
  const board = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.12), [wood, wood, wood, wood, face, wood]);
  board.position.set(0, P + H / 2, 0.08); g.add(board);
  // the roof: a triangular prism along x, ridge up (a 3-sided cylinder whose first corner points up once laid on its side)
  const r = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, W + 0.6, 3, 1, false, Math.PI / 2), roof);
  r.rotation.z = Math.PI / 2; r.scale.set(1, 1, 0.8); r.position.set(0, P + H + 0.31, 0.05); g.add(r);
  return g;
}

/**
 * Story pins at run time: the places entries (with an action that flies there and opens the card), the signboards
 * (dynamic, via ctx.add) and the card. `fly(place)` is explore's drone flight and label pin; `lang()` the UI language.
 */
export function createStoryPins(ctx, { L, fly = null, lang = () => 'ja' } = {}) {
  const places = storyPlaces(L);
  let card = null;
  try { card = mountStoryCard(); } catch (e) { console.warn('[story] card', e); }
  const markers = [];
  // one root for every board: the ship's ocean act hides the town by hiding dynamic roots, and the per-frame distance
  // toggle below only touches the boards inside it, so it never shows them through that (fix round 2, arrivals)
  const root = new THREE.Group(); root.name = 'story-pins';
  ctx.add ? ctx.add(root) : ctx.scene?.add(root);
  for (const p of places) {
    const [x, z] = p.at, y = Math.max(0, L.heightAt(x, z));
    try {
      const cv = typeof document !== 'undefined' && document.createElement ? Object.assign(document.createElement('canvas'), { width: 512, height: 268 }) : null;
      const s = buildSignboard(p.story.sign, { canvas: cv });
      s.rotation.y = p.view.yaw;   // its lettered face (+z) toward the drone view, the sea behind it
      s.position.set(x, y - 0.1, z);
      root.add(s);
      markers.push(s);
    } catch (e) { console.warn('[story] signboard', e); }
    p.action = () => {
      fly?.(p);
      card?.open(p.story, lang(), p.edge);
    };
  }
  // the boards are drawn only within SHOW_R of the camera (they are 4 small meshes, 5-6 km from the town centre)
  if (ctx.onUpdate && ctx.camera) ctx.onUpdate(() => { const c = ctx.camera.position; for (const m of markers) m.visible = Math.hypot(c.x - m.position.x, c.z - m.position.z) < SHOW_R; });
  const api = {
    places, card, markers, root,
    open(id) { const p = places.find((q) => q.id === id); if (p) p.action(); return !!p; },
  };
  if (typeof window !== 'undefined') window.__story = api;
  return api;
}
