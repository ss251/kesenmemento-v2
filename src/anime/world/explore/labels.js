// [v4:explore] POI labels that fade with distance (V3-SPEC section 10: "POI labels"). Real names only: the tour stops,
// the civic landmarks, explore's places, and the named OSM / GSI features of the kinds a visitor looks for (stations,
// schools, hospitals, temples and shrines, the post office, banks, inns, cafés, restaurants, shops). Each label hangs
// over its building's roof; it fades in and out with distance (farther for the important ones, and farther the higher
// you fly), hides when the terrain is in the way, and never overlaps a nearer or more important label.
//
//   const labels = createLabels(ctx, { items })   labels.update(dt, lang)   labels.pin(item, seconds)   labels.stats
//   items: [{ id, ja, en, x, z, y (top), cat, prio 1..3 }]
export const LABEL_CATS = {
  station: '駅', bus_stop: 'バス', platform: 'バス', school: '学校', kindergarten: '園', childcare: '園', hospital: '病院', clinic: '医院', doctors: '医院', dentist: '歯科',
  townhall: '役所', city_hall: '役所', government: '官公庁', courthouse: '裁判所', police: '警察', fire_station: '消防', post_office: '郵便局', library: '図書館', museum: '美術館',
  community_centre: '公民館', hall: '会館', temple: '寺', shrine: '神社', place_of_worship: '寺社', church: '教会', park: '公園', bank: '銀行',
  hotel: '宿', guest_house: '宿', hostel: '宿', cafe: '喫茶', restaurant: '食堂', fast_food: '食堂', bar: '酒場', pub: '酒場', seafood: '鮮魚', alcohol: '酒店', tea: '茶舗',
  confectionery: '菓子', bakery: 'パン', supermarket: 'スーパー', convenience: 'コンビニ', marketplace: '市場', mall: '商業', pharmacy: '薬局', shop: '店', food: '食', bridge: '橋', public: '公共', landmark: '名所', viewpoint: '展望',
};
export const CAT_COLORS = { station: '#2f7fae', school: '#c98a2b', hospital: '#c8454a', public: '#4a6fa5', shrine: '#b9473a', temple: '#8a5a3c', church: '#6b5ca5', park: '#4c9a52', shop: '#d0703a', food: '#d0703a', hotel: '#7a5aa8', bridge: '#5f7f8f', landmark: '#1f3a68', other: '#6b6f86' };
export function catGroup(cat) {
  if (/station|bus_stop|platform|stop_position/.test(cat)) return 'station';
  if (/school|kindergarten|childcare/.test(cat)) return 'school';
  if (/hospital|clinic|doctors|dentist|health/.test(cat)) return 'hospital';
  if (/shrine/.test(cat)) return 'shrine';
  if (/temple|place_of_worship/.test(cat)) return 'temple';
  if (/church/.test(cat)) return 'church';
  if (/park|garden|playground|pitch/.test(cat)) return 'park';
  if (/hotel|guest_house|hostel|ryokan/.test(cat)) return 'hotel';
  if (/cafe|restaurant|fast_food|bar|pub|food/.test(cat)) return 'food';
  if (/townhall|city_hall|government|courthouse|police|fire_station|post_office|library|museum|community_centre|hall|public/.test(cat)) return 'public';
  if (/bridge/.test(cat)) return 'bridge';
  if (/landmark|viewpoint/.test(cat)) return 'landmark';
  if (/shop|seafood|alcohol|tea|confectionery|bakery|supermarket|convenience|marketplace|mall|pharmacy|clothes|gift/.test(cat)) return 'shop';
  return 'other';
}
/** Which OSM / GSI place kinds get a street label (prio 1). */
export const LABEL_KINDS = /^(station|school|kindergarten|hospital|clinic|townhall|city_hall|government|courthouse|police|fire_station|post_office|library|museum|community_centre|hall|temple|shrine|place_of_worship|park|bank|hotel|guest_house|cafe|restaurant|seafood|alcohol|tea|confectionery|bakery|supermarket|convenience|marketplace|mall|pharmacy|bridge)$/;

/**
 * [mobile] Ambient place labels: on for desktop, OFF on phones by default (they cluttered the small screen; a place you search or pick still
 * shows its pinned label). ?labels=1|0 overrides and is remembered (persist), then a remembered choice ('1' | '0'), then the device default.
 * -> { on, persist } — pure: no DOM, no storage.
 */
export function labelsDefault({ mobile = false, search = '', stored = null } = {}) {
  const q = new URLSearchParams(search || '').get('labels');
  if (q === '1' || q === '0') return { on: q === '1', persist: q };
  if (stored === '1' || stored === '0') return { on: stored === '1', persist: null };
  return { on: !mobile, persist: null };
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createLabels(ctx, { items, max = 26, maxNow = null, lotAt = null }) {
  if (typeof document === 'undefined') return null;
  const L = ctx.L, cam = ctx.camera, THREE = ctx.THREE;
  const root = document.createElement('div'); root.id = 'klc-labels';
  document.body.appendChild(root);
  const pool = [];
  for (let i = 0; i < max + 1; i++) {
    const el = document.createElement('div'); el.className = 'xl'; el.innerHTML = '<i></i><b></b><small></small>';
    el.style.opacity = '0'; root.appendChild(el); pool.push({ el, key: null });
  }
  const v = new THREE.Vector3();
  // [v4:polish1] label widths in px by id + language (measured from the element once it has its text)
  const widths = new Map();
  // [v4:polish3] measured before the web font arrived, a width stays short (the pill ran off the phone's right edge):
  // measure again once the fonts are in
  try { document.fonts?.ready?.then(() => widths.clear()); document.fonts?.addEventListener?.('loadingdone', () => widths.clear()); } catch { /* no font API */ }
  const estimate = (name, sub, lang, prio) => { const ch = prio >= 3 ? 14 : prio === 1 ? 11.5 : 12.5; return Math.min(320, 28 + [...name].length * (lang === 'en' ? ch * 0.56 : ch) + (sub ? 5 + [...sub].length * (lang === 'en' ? 10 : 6) : 0)); };
  let pinned = null, pinT = 0, acc = 0;
  // [v4:polish2] where the pin was made: the camera's resting place once a search's fly-in / walk-in has settled (speed
  // under 2 m/s for 0.5 s); the pin drops once the camera is more than 300 m from there
  let pinFrom = null, still = 0;
  const lastC = { x: 0, y: 0, z: 0, ok: false };
  const stats = { shown: 0, items: items.length };
  // spatial buckets (250 m) so each frame only looks at the items near the camera
  const B = 250, buckets = new Map();
  for (const it of items) { const k = Math.floor(it.x / B) + ',' + Math.floor(it.z / B); let a = buckets.get(k); if (!a) buckets.set(k, (a = [])); a.push(it); }
  const major = items.filter((it) => it.prio >= 2);

  function range(it, alt) {
    const base = it.prio >= 3 ? 1600 : it.prio === 2 ? 700 : 230;
    return base * (1 + Math.min(4, alt / 120));
  }
  // [v4:integrate] occlusion by the terrain, and near the ground by buildings too: the lots' footprints up to their
  // roofs and the solid colliders (landmarks, interiors' walls); the label's own building (its last 10 m) never hides it.
  // Each label's answer is kept for 0.3 s (a few sight lines per frame).
  const solidAt = ctx.physics?.solidAt ? (x, z, y) => ctx.physics.solidAt(x, z, y) : null;
  const occCache = new Map();
  function occludedNow(x, y, z) {
    const c = cam.position;
    for (let k = 1; k <= 6; k++) { const u = k / 7, px = c.x + (x - c.x) * u, pz = c.z + (z - c.z) * u, py = c.y + (y - c.y) * u; if (L.heightAt(px, pz) > py + 0.5) return true; }
    const alt = c.y - Math.max(L.heightAt(c.x, c.z), 0);
    if (alt > 80 || (!lotAt && !solidAt)) return false;
    // samples 1 m apart near the eye (the walls round you), then further apart (5 % of the distance travelled)
    const d = Math.hypot(x - c.x, z - c.z, y - c.y);
    for (let t = 1; t < d - 10; t += Math.max(1, t * 0.05)) {
      const u = t / d;
      const px = c.x + (x - c.x) * u, pz = c.z + (z - c.z) * u, py = c.y + (y - c.y) * u;
      const l = lotAt && lotAt(px, pz);
      if (l && py < (l.groundY || L.heightAt(l.obb.cx, l.obb.cz)) + (l.height || 6)) return true;
      if (solidAt && solidAt(px, pz, py)) return true;
    }
    return false;
  }
  function occluded(it, x, y, z) {
    const e = occCache.get(it);
    if (e && acc - e.t < 0.3) return e.occ;
    const occ = occludedNow(x, y, z); occCache.set(it, { t: acc, occ }); return occ;
  }
  // [v4:polish3] screen rects labels must stay off: the minimap, the explore bar, the HUD's top chip row (refreshed 2x/s)
  let blockers = [], blockT = -1;
  const BLOCK_SEL = ['#klc-x .mini', '#klc-x .xbar', '#klc-x .xdrive'];
  function refreshBlockers() {
    if (typeof document === 'undefined') return;
    blockers = [];
    for (const sel of BLOCK_SEL) { const e = document.querySelector(sel); if (!e || e.hidden || e.offsetParent === null) continue; const b = e.getBoundingClientRect(); if (b.width > 0 && b.height > 0) blockers.push({ x0: b.left - 4, x1: b.right + 4, y0: b.top - 4, y1: b.bottom + 4 }); }
  }
  function update(dt, lang = 'ja') {
    acc += dt;
    if (acc - blockT > 0.5 || blockT < 0) { blockT = acc; refreshBlockers(); }
    if (pinned) { pinT -= dt; if (pinT <= 0) pinned = null; }
    const W = innerWidth, H = innerHeight, c = cam.position;
    if (pinned) {
      const sp = lastC.ok && dt > 0 ? Math.hypot(c.x - lastC.x, c.y - lastC.y, c.z - lastC.z) / dt : 99;
      if (!pinFrom) { still = sp < 2 ? still + dt : 0; if (still > 0.5) pinFrom = { x: c.x, z: c.z }; }
      else if (Math.hypot(c.x - pinFrom.x, c.z - pinFrom.z) > 300) pinned = null;
    }
    lastC.x = c.x; lastC.y = c.y; lastC.z = c.z; lastC.ok = true;
    const alt = c.y - Math.max(L.heightAt(c.x, c.z), 0);
    const cand = [];
    const consider = (it) => {
      const R = range(it, alt), dx = it.x - c.x, dz = it.z - c.z, d = Math.hypot(dx, dz);
      if (d > R && it !== pinned) return;
      v.set(it.x, it.y + 2.2, it.z).project(cam);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return;
      let o = it === pinned ? 1 : (1 - smooth(R * 0.55, R, d)) * smooth(6, 16, d);
      if (o < 0.04) return;
      cand.push({ it, d, o, sx: (v.x * 0.5 + 0.5) * W, sy: (-v.y * 0.5 + 0.5) * H });
    };
    const R0 = 230 * (1 + Math.min(4, alt / 120));
    const i0 = Math.floor((c.x - R0) / B), i1 = Math.floor((c.x + R0) / B), j0 = Math.floor((c.z - R0) / B), j1 = Math.floor((c.z + R0) / B);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = buckets.get(i + ',' + j); if (a) for (const it of a) if (it.prio < 2) consider(it); }
    // [v4:polish2] from the air (above 60 m) only the major places (prio >= 2); the drone first look was crowded
    for (const it of major) consider(it);
    if (alt > 60) for (let k = cand.length - 1; k >= 0; k--) if (cand[k].it.prio < 2 && cand[k].it !== pinned) cand.splice(k, 1);
    if (pinned && !cand.some((q) => q.it === pinned)) consider(pinned);
    cand.sort((a, b) => (b.it === pinned) - (a.it === pinned) || b.it.prio - a.it.prio || a.d - b.d);
    const placed = [];
    let n = 0;
    const cap = Math.min(max, maxNow ? maxNow() : max);
    for (const q of cand) {
      if (n >= (alt > 60 ? Math.min(8, cap) : cap)) break;   // [v4:polish2] at most 8 from the air (16 pills crowded the drone frame)
      // [v4:polish2] a pinned label skips the occlusion test only near its place (within 120 m); farther away it hides
      // behind walls like any other (its pill was painted on a house wall 530 m from the station)
      if ((q.it !== pinned || q.d > 120) && occluded(q.it, q.it.x, q.it.y + 2.2, q.it.z)) continue;
      const name = lang === 'en' && q.it.en ? q.it.en : q.it.ja;
      const sub = q.it.prio >= 2 ? (lang === 'en' ? (q.it.en && q.it.ja !== q.it.en ? q.it.ja : '') : (q.it.en || '')) : '';
      // [v4:polish1] the pill's real width: measured once per label and language (the estimate ignored the subtitle)
      const key = q.it.id + lang;
      const w = widths.get(key) ?? estimate(name, sub, lang, q.it.prio), h = 26;
      // [v4:polish3] clamp the pill inside the viewport (it was clipped at the left edge on the phone); the anchor may
      // slide up to half a pill toward the centre, beyond that the label is left out
      const lo = 6 + w / 2, hi = W - 6 - w / 2;
      const sx = hi < lo ? W / 2 : Math.min(hi, Math.max(lo, q.sx));
      if (Math.abs(sx - q.sx) > w / 2) continue;
      const sy = Math.max(h + 6, Math.min(H - 6, q.sy));
      q.sx = sx; q.sy = sy;
      const r = { x0: q.sx - w / 2 - 3, x1: q.sx + w / 2 + 3, y0: q.sy - h - 2, y1: q.sy + 2 };
      if (placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)) continue;
      if (blockers.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)) continue;   // never under the minimap / bar
      placed.push(r);
      const P = pool[n++];
      if (P.key !== key) {
        P.key = key;
        P.el.querySelector('b').textContent = name;
        P.el.querySelector('small').textContent = sub;
        P.el.querySelector('i').style.background = CAT_COLORS[catGroup(q.it.cat)] || CAT_COLORS.other;
        P.el.dataset.prio = String(q.it.prio);
        P.el.classList.toggle('pin', q.it === pinned);
        { const ow = P.el.offsetWidth; if (ow > 0) widths.set(key, ow); }
      }
      if (!widths.has(key)) { const ow = P.el.offsetWidth; if (ow > 0) widths.set(key, ow); }
      P.el.style.transform = `translate(${q.sx.toFixed(1)}px, ${q.sy.toFixed(1)}px) translate(-50%, -100%)`;
      P.el.style.opacity = q.o.toFixed(2);
    }
    for (let k = n; k < pool.length; k++) if (pool[k].el.style.opacity !== '0') { pool[k].el.style.opacity = '0'; pool[k].key = null; }
    stats.shown = n;
  }
  return {
    root, update, stats, items,
    pin(item, sec = 25) { pinned = item; pinT = sec; pinFrom = null; still = 0; },
    get pinned() { return pinned; },
    set visible(v) { root.style.display = v ? '' : 'none'; },
  };
}
