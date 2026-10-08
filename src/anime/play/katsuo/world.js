// [play] The fifty golden bonito. One instanced mesh, one glint slot each.
// A frame writes matrices and typed arrays. It does not allocate.

import * as THREE from 'three';
import * as L from '../../world/layout.js';
import { onPlayTick, playMode, playerPos } from '../kit/runtime.js';
import { sfx } from '../kit/sfx.js';
import { fx } from '../kit/fx.js';
import { ui } from '../kit/ui.js';
import { store } from '../kit/store.js';
import { designSpots, lotIndex, volumeAt } from './place.js';
import { charmGeometry, charmMaterial, charmShadowGeometry, charmShadowMaterial, charmShadowY, charmCentreY, CHARM_BOB } from './charm.js';
import { pickupRadius, nextCombo, comboPitch, comboName, shimmerGain, isMilestone, isFinale, glintMetres, GLINT_M, GLINT_FLASH, SWIM_R, TOTAL } from './rules.js';
import { registerMode } from '../kit/modes.js';

const TAU = Math.PI * 2;
/** [mobile-play] metres: past this a charm is not drawn (its glint shows within GLINT_M = 180 m; the fish is sub-pixel by here) */
const CULL_M = 500;
const GOLD = '#F8B500';
const NAVY = '#223A70';
const FISH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.2 12.2c3.6-4.2 9.2-5.2 15.4-3.4-.2 1.6 1.2 2.6 1.2 3.4s-1.4 1.8-1.2 3.4C12.4 17.4 6.8 16.4 3.2 12.2z"/><path fill="currentColor" d="M3.4 12.2C1.6 10.2.2 8.2.4 6.4c1.6.8 2.6 2.2 3.2 3.6-.8 1.4-1.6 2.6-2.8 3.6 1.2.6 2.2 1.6 2.6 2.6.4-1.4 1.2-2.6 2.2-4z"/></svg>';

export { charmGeometry } from './charm.js';

const _pos = { x: 0, y: 0, z: 0 };
const _cam = { x: 0, y: 0, z: 0 };

function occluded(ctx, map, lots, cam, spot) {
  const dx = spot.x - cam.x, dy = spot.y - cam.y, dz = spot.z - cam.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 12) return false;
  const stop = dist - 2.6;
  for (let d = 4; d < stop; d += 4) {
    const u = d / dist;
    const x = cam.x + dx * u, y = cam.y + dy * u, z = cam.z + dz * u;
    if (L.heightAt(x, z) > y + 0.6) return true;
    if (volumeAt(map, lots, x, y, z)) return true;
    if ((d & 4) === 0) { try { if (ctx.physics?.solidAt?.(x, z, y)) return true; } catch (e) { /* */ } }
  }
  return false;
}

export function mountCharms(ctx) {
  const spots = designSpots(L);
  const n = spots.length;
  const map = lotIndex(L.LOTS);
  const found = new Uint8Array(n);
  const hidden = new Uint8Array(n);
  const sync = () => {
    const row = store.get('katsuo').found || {};
    for (let i = 0; i < n; i++) found[i] = row[spots[i].id] ? 1 : 0;
  };
  sync();
  const groups = districtGroups(spots);
  const recount = () => {
    for (const g of groups) g.got = 0;
    for (let i = 0; i < n; i++) if (found[i]) {
      for (const g of groups) if (g.name === spots[i].district) g.got++;
    }
  };
  recount();
  const geo = charmGeometry();
  const mat = charmMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.count = 0;   // [mobile-play] the first tick packs the visible charms (writeAt)
  mesh.frustumCulled = false;
  mesh.name = 'play-katsuo';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (ctx.noOutline) ctx.noOutline(mesh);
  if (ctx.noBatch) ctx.noBatch(mesh);
  ctx.add(mesh);

  const shadow = new THREE.InstancedMesh(charmShadowGeometry(), charmShadowMaterial(), n);
  shadow.count = n;
  shadow.frustumCulled = false;
  shadow.name = 'play-katsuo-shadow';
  shadow.renderOrder = 1;
  if (ctx.noOutline) ctx.noOutline(shadow);
  if (ctx.noBatch) ctx.noBatch(shadow);
  ctx.add(shadow);

  const dummy = new THREE.Object3D();
  let still = false;
  try { still = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { still = false; }
  let faceCam = false;
  let posing = false;
  let faceYaw = 0;
  try {
    const q = new URLSearchParams(location.search);
    faceCam = q.get('face') === '1';
    posing = q.get('pose') === '1';
    faceYaw = (Number(q.get('faceYaw')) || 0) * Math.PI / 180;
  } catch (e) { faceCam = false; posing = false; }
  // The fish's resting centre: on foot and by car it floats just over its ring.
  const rest = new Float32Array(n);
  for (let i = 0; i < n; i++) rest[i] = charmCentreY(spots[i]);
  const bobOf = new Float32Array(n);

  const counter = ui.counter('katsuo', { icon: FISH, label: ui.t('play.katsuo.name'), total: n });
  const tally = () => { let c = 0; for (let i = 0; i < n; i++) if (found[i]) c++; return c; };
  counter.set(tally());

  let pop = null;
  let comboStep = -1, comboAt = -99;
  let shim = null;
  const shimAt = { x: 0, y: 1, z: 0 };
  let occAcc = 0, occI = 0;

  function writeShadows() {
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      // The shadow breathes with the bob: a touch smaller and softer at the top of the float.
      const k = found[i] ? 0 : 1 - 0.06 * (bobOf[i] / (CHARM_BOB * 0.5 || 1));
      dummy.position.set(s.x, charmShadowY(s), s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(k, 1, k);
      if (!k) dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      shadow.setMatrixAt(i, dummy.matrix);
    }
    shadow.instanceMatrix.needsUpdate = true;
    shadow.visible = tally() < n;
  }

  // [mobile-play] Only the charms that can be seen take an instance slot, packed from 0, and the mesh draws that many: a found
  // charm (scale 0) or one past CULL_M (a 1 m fish is under a pixel on a phone there) is not drawn at all. Deploy #5 drew
  // all 50 every frame, found and far ones as zero-scale copies: 207k triangles a frame of the phone's budget.
  let slot = 0;
  const CULL2 = CULL_M * CULL_M;
  function writeAt(i, y, yaw, sc) {
    if (!(sc > 0)) return;
    const s = spots[i];
    const dx = s.x - _cam.x, dz = s.z - _cam.z;
    if (dx * dx + dz * dz > CULL2) return;
    dummy.position.set(s.x, y, s.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot++, dummy.matrix);
  }

  function arrived(i) {
    const next = tally();
    counter.set(next);
    counter.bump();
    ui.notebook.refresh('katsuo');
    if (isMilestone(next)) ui.toast(ui.t('play.katsuo.toast', { n: next }), { big: true, sting: true });
    if (isFinale(next - 1, next, n)) {
      ui.toast(ui.t('play.katsuo.master'), { big: true });
      fireworks();
    }
    if (pop && pop.i === i) pop = null;
  }

  function fireworks() {
    const bay = L.SPOTS.innerBay || { x: 156, z: -33 };
    fx.fireworks({ centre: { x: bay.x, y: 8, z: bay.z }, seconds: still ? 12 : 25 });
  }

  function collect(i, t) {
    if (found[i] || pop) return;
    found[i] = 1;
    const s = spots[i];
    const step = nextCombo(comboStep, t - comboAt);
    comboStep = step;
    comboAt = t;
    sfx.play(comboName(step), { pitch: comboPitch(step), position: { x: s.x, y: s.y, z: s.z } });
    fx.burst({ x: s.x, y: rest[i] + 0.1, z: s.z }, 'gold', { count: 24 });
    if (s.mode === 'sail' || s.mode === 'swim' || L.isWater(s.x, s.z)) {
      fx.ripple({ x: s.x, y: 0.2, z: s.z }, { radius: 1.8 });
      fx.burst({ x: s.x, y: 0.3, z: s.z }, 'splash', { count: 10 });
      sfx.play('splash', { position: { x: s.x, y: 0.2, z: s.z }, gain: 0.45 });
    }
    try { navigator.vibrate?.(12); } catch (e) { /* no haptic */ }
    pop = { i, t0: t, flew: 0, at: { x: s.x, y: rest[i] + bobOf[i], z: s.z } };
    store.update('katsuo', (d) => { d.found[s.id] = new Date().toISOString(); });
    writeShadows();
  }

  store.on('katsuo', () => {
    sync();
    recount();
    // A pickup's mote is still in the air. The counter ticks when it lands.
    if (pop && found[pop.i]) return;
    pop = null;
    counter.set(tally());
    writeShadows();
  });

  onPlayTick((dt, t) => {
    const cam = ctx.camera?.position;
    if (cam) { _cam.x = cam.x; _cam.y = cam.y; _cam.z = cam.z; }
    playerPos(_pos);
    const mode = playMode();
    const radius = pickupRadius(mode);
    let best = -1, bestD = Infinity;
    let near = -1, nearD = 40;
    let live = 0;
    slot = 0;
    const spin = still ? 0.6 : (t * TAU) / 2.4;

    occAcc += dt;
    if (occAcc >= 0.02) {
      occAcc = 0;
      for (let k = 0; k < 2; k++) {
        const i = occI++ % n;
        hidden[i] = found[i] || !cam ? 1 : (occluded(ctx, map, L.LOTS, _cam, spots[i]) ? 1 : 0);
      }
    }

    const vh = (typeof window !== 'undefined' && window.innerHeight) || 900;

    for (let i = 0; i < n; i++) {
      const s = spots[i];
      if (!found[i]) {
        const swim = s.mode === 'swim';
        if (swim && _pos.y > -0.25) { /* the column, not the boat above it */ }
        else {
          const pd = Math.hypot(_pos.x - s.x, _pos.y - s.y, _pos.z - s.z);
          const rad = swim ? Math.max(radius, SWIM_R) : radius;
          if (rad && pd <= rad && pd < bestD) { bestD = pd; best = i; }
          if (pd < nearD) { nearD = pd; near = i; }
        }
      }
      if (found[i] && (!pop || pop.i !== i)) { writeAt(i, rest[i], spin, 0); fx.glint(i, s.x, rest[i], s.z, 0); continue; }
      const yaw = faceCam && cam ? Math.atan2(_cam.x - s.x, _cam.z - s.z) + faceYaw : spin;
      const bob = still ? 0 : Math.sin((t * TAU) / 1.8 + i * 0.7) * CHARM_BOB * 0.5;
      bobOf[i] = bob;
      let sc = found[i] ? 0 : 1;
      if (pop && pop.i === i) {
        const e = t - pop.t0;
        if (e < 0.09 && !still) sc = 1 + 0.5 * (e / 0.09);
        else sc = 0;
        if (e >= 0.09 && !pop.flew) {
          pop.flew = 1;
          const ii = i;
          fx.flyToHud(pop.at || s, '#klc-play [data-counter="katsuo"]', { onArrive: () => arrived(ii) });
        }
      }
      writeAt(i, rest[i] + bob, yaw, sc);
      if (sc > 0) live++;
      let gscale = 0;
      if (!found[i] && cam) {
        const dist = Math.hypot(_cam.x - s.x, _cam.y - s.y, _cam.z - s.z);
        if (dist < GLINT_M && dist > 1 && !hidden[i]) {
          // Every 2.2 s: a quick flare (0.1 s up) that lingers (0.32 s down), so a glance catches it.
          const phase = (t + i * 0.37) % 2.2;
          const flash = phase < 0.1 ? Math.sin((phase / 0.1) * Math.PI * 0.5) : phase < 0.42 ? Math.pow(1 - (phase - 0.1) / 0.32, 2) : 0;
          const pulse = still ? 1 : 1 + (GLINT_FLASH - 1) * flash;
          gscale = glintMetres(dist, ctx.camera.fov || 55, vh) * pulse;
        }
      }
      fx.glint(i, s.x, rest[i] + bob + 0.05, s.z, gscale, 0.97, 0.86, 0.42);
    }
    if (best >= 0 && !posing) collect(best, t);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = slot;
    mesh.visible = slot > 0 && (live > 0 || !!pop);
    mat.uniforms.uViewH.value = vh;
    writeShadows();

    if (near >= 0) {
      const s = spots[near];
      const g = shimmerGain(nearD) * 0.55;
      shimAt.x = s.x; shimAt.y = s.y; shimAt.z = s.z;
      if (g < 0.02) { if (shim) { shim.stop(); shim = null; } }
      else if (!shim) shim = sfx.loop('shimmer', { position: shimAt, gain: g });
      else shim.setGain(g);
      const a = still ? 0.4 : t * 2.1;
      const orbit = 0.05;
      const cy = rest[near] + bobOf[near];
      fx.glint(n, s.x + Math.cos(a) * 0.5, cy + 0.16, s.z + Math.sin(a) * 0.5, orbit, 0.97, 0.9, 0.5);
      fx.glint(n + 1, s.x + Math.cos(a + Math.PI) * 0.5, cy + 0.26, s.z + Math.sin(a + Math.PI) * 0.5, orbit * 0.8, 0.95, 0.84, 0.45);
    } else {
      if (shim) { shim.stop(); shim = null; }
      fx.glint(n, 0, 0, 0, 0);
      fx.glint(n + 1, 0, 0, 0, 0);
    }
  });

  function paintMap(g, P, opt) {
    const full = !!opt.markers;
    g.save();
    for (let i = 0; i < n; i++) {
      if (!found[i]) continue;
      const s = spots[i];
      const xy = P(s.x, s.z);
      if (xy[0] < -8 || xy[1] < -8 || xy[0] > opt.W + 8 || xy[1] > opt.H + 8) continue;
      g.beginPath();
      g.fillStyle = GOLD;
      g.strokeStyle = NAVY;
      g.lineWidth = 1.25;
      g.arc(xy[0], xy[1], full ? 5 : 3.2, 0, TAU);
      g.fill();
      g.stroke();
    }
    if (full) {
      g.font = '700 12px "Zen Maru Gothic", "Noto Sans JP", sans-serif';
      g.textBaseline = 'middle';
      let shown = 0;
      const placed = paintMap._p || (paintMap._p = []);
      for (const d of groups) {
        if (!d.n) continue;
        const xy = P(d.x, d.z);
        if (xy[0] < 8 || xy[1] < 28 || xy[0] > opt.W - 8 || xy[1] > opt.H - 8) continue;
        let clash = false;
        for (let k = 0; k < shown; k++) if (Math.hypot(placed[k].x - xy[0], placed[k].y - xy[1]) < 46) clash = true;
        if (clash) continue;
        const num = d.got + '/' + d.n;
        const w1 = g.measureText(d.name).width;
        g.font = '700 12px "Zen Maru Gothic", "Noto Sans JP", sans-serif';
        const w2 = g.measureText(num).width;
        const w = w1 + 8 + w2 + 12, h = 18;
        g.fillStyle = 'rgba(251,250,245,0.92)';
        const x0 = xy[0] - w / 2, y0 = xy[1] - h / 2;
        g.beginPath();
        g.moveTo(x0 + 8, y0);
        g.arcTo(x0 + w, y0, x0 + w, y0 + h, 8);
        g.arcTo(x0 + w, y0 + h, x0, y0 + h, 8);
        g.arcTo(x0, y0 + h, x0, y0, 8);
        g.arcTo(x0, y0, x0 + w, y0, 8);
        g.closePath();
        g.fill();
        g.fillStyle = NAVY;
        g.textAlign = 'left';
        g.fillText(d.name, xy[0] - w / 2 + 6, xy[1]);
        g.font = '700 12px "Zen Maru Gothic", "Noto Sans JP", sans-serif';
        g.fillText(num, xy[0] - w / 2 + 6 + w1 + 8, xy[1]);
        placed[shown] = placed[shown] || { x: 0, y: 0 };
        placed[shown].x = xy[0];
        placed[shown].y = xy[1];
        shown++;
      }
    }
    g.restore();
  }

  function renderNotebook(el) {
    const got = tally();
    const done = got >= n;
    if (done) {
      const medal = document.createElement('div');
      medal.className = 'medal gold pop';
      medal.textContent = '金';
      medal.setAttribute('aria-hidden', 'true');
      el.appendChild(medal);
    }
    const title = document.createElement('p');
    title.textContent = done ? ui.t('play.katsuo.master') : ui.t('play.katsuo.found');
    title.style.margin = '4px 0 8px';
    title.style.textAlign = 'center';
    title.style.font = '700 22px/1.3 "Zen Maru Gothic", "Noto Sans JP", sans-serif';
    title.style.color = '#223A70';
    el.appendChild(title);
    // The replay sits under the title, so a full book shows it without scrolling past every district.
    if (done) el.appendChild(finaleButton(got));
    const list = groups.slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    for (const d of list) {
      const row = document.createElement('p');
      const name = document.createElement('span');
      name.textContent = d.name;
      const num = document.createElement('b');
      num.textContent = d.got + '/' + d.n;
      num.style.marginLeft = '8px';
      num.style.fontVariantNumeric = 'tabular-nums';
      row.append(name, num);
      el.appendChild(row);
    }
    if (!done) {
      const hint = document.createElement('p');
      hint.textContent = ui.t('play.katsuo.finale.hint');
      el.appendChild(hint);
      el.appendChild(finaleButton(got));
    }
  }

  function finaleButton(got) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = ui.t('play.katsuo.finale');
    btn.disabled = got < n;
    btn.style.display = 'block';
    btn.style.margin = '0 auto 12px';
    btn.style.borderRadius = '12px';
    btn.style.minHeight = '44px';
    btn.style.padding = '0 16px';
    btn.style.background = got >= n ? '#c4521f' : 'rgba(34,58,112,0.08)';
    btn.style.color = got >= n ? '#fff' : '#55596f';
    btn.addEventListener('click', () => { if (got >= n) { fireworks(); sfx.play('tap'); } });
    return btn;
  }

  ui.notebook.register('katsuo', { label: 'play.katsuo.tab', render: renderNotebook });
  store.on('katsuo', () => ui.notebook.refresh('katsuo'));

  const _ndc = new THREE.Vector3();
  const _css = { x: 0, y: 0 };
  let huntOff = null;
  function projectSpot(s) {
    const camera = ctx.camera;
    if (!camera) return null;
    const i = spots.indexOf(s);
    _ndc.set(s.x, i >= 0 ? rest[i] + bobOf[i] : s.y, s.z).project(camera);
    if (_ndc.z > 1) return null;
    const w = (typeof window !== 'undefined' && window.innerWidth) || 1;
    const h = (typeof window !== 'undefined' && window.innerHeight) || 1;
    _css.x = (_ndc.x * 0.5 + 0.5) * w;
    _css.y = (-_ndc.y * 0.5 + 0.5) * h;
    return _css;
  }
  function nearestOpen() {
    playerPos(_pos);
    const mode = playMode();
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (found[i]) continue;
      const s = spots[i];
      const d = Math.hypot(_pos.x - s.x, _pos.y - s.y, _pos.z - s.z);
      let bias = 0;
      if (mode === 'walk' && s.mode !== 'walk') bias = 800;
      else if (mode === 'fly' && s.mode !== 'fly') bias = 400;
      else if (mode === 'drive' && s.mode !== 'drive') bias = 400;
      if (d + bias < bestD) { bestD = d + bias; best = i; }
    }
    return best;
  }
  function startHunt() {
    if (huntOff) { huntOff(); huntOff = null; }
    const idx = nearestOpen();
    if (idx < 0) { ui.toast(ui.t('play.katsuo.master')); return; }
    const s = spots[idx];
    const body = ctx.playerObj;
    if (body && body.pos) {
      if (body.fly && s.mode !== 'fly') body.fly = false;
      const dx = s.x - body.pos.x;
      const dz = s.z - body.pos.z;
      body.yaw = Math.atan2(-dx, -dz);
      body.pitch = -0.06;
    }
    const arrow = ui.edgeArrow(() => s);
    const coach = ui.coach({
      id: 'katsuo-glint',
      text: ui.t('play.katsuo.coach'),
      gesture: 'swipe',
      dim: true,
      target: () => projectSpot(s),
    });
    const off = onPlayTick(() => {
      if (found[idx]) { finish(); return; }
      playerPos(_pos);
      if (Math.hypot(_pos.x - s.x, _pos.y - s.y, _pos.z - s.z) < 5) finish();
    });
    function finish() {
      off();
      if (huntOff === off) huntOff = null;
      coach.done();
      arrow.hide();
    }
    huntOff = off;
  }

  registerMode({
    id: 'katsuo',
    order: 20,
    title: { ja: '金のカツオさがし', en: 'Find the golden bonito' },
    hook: { ja: 'まちに隠れた50匹', en: 'Fifty hidden in town' },
    stars: 1,
    players: 1,
    art: '/data/play/katsuo.webp',
    how: [
      { ja: 'まちを歩く', en: 'Walk the town' },
      { ja: '光を目で追う', en: 'Follow the glint' },
      { ja: 'そばでひろう', en: 'Step close and it is yours' },
    ],
    progress() {
      const c = tally();
      return { ja: c + '/50', en: c + '/50' };
    },
    isNew() {
      const row = store.get('meta').played;
      return !(row && row.katsuo);
    },
    start: startHunt,
  });
  writeShadows();

  const api = {
    spots, found, paintMap, fireworks,
    count: tally,
  };
  // The fish's drawn centre (it floats over its ring on foot), for shots and tests.
  const charmAt = (spot) => {
    const i = spots.indexOf(spot);
    return { x: spot.x, y: i >= 0 ? rest[i] + bobOf[i] : charmCentreY(spot), z: spot.z };
  };
  try { window.__play = Object.assign(window.__play || {}, { spots, store, fx, mode: playMode, charmAt }); } catch (e) { /* */ }
  return api;
}

function districtGroups(spots) {
  const by = new Map();
  for (const s of spots) {
    let g = by.get(s.district);
    if (!g) { g = { name: s.district, n: 0, got: 0, x: 0, z: 0 }; by.set(s.district, g); }
    g.n++;
    g.x += s.x;
    g.z += s.z;
  }
  for (const g of by.values()) { g.x /= g.n; g.z /= g.n; }
  return [...by.values()];
}

export { TOTAL };
