// Remote bodies. One batched draw for every friend, plus a second for boat flags.
// Unlit, so a colour stays a colour at night. Labels are DOM, pooled, and only
// rewritten when the pixel, the words, or the opacity step changes.
// Name tags fade with distance and hide behind walls and off the screen.
// The screen-edge arrow (kit ui.edgeArrow) is fed from `aim`.

import * as THREE from 'three';
import { MODES } from '../../../../server/multi/wire.js';
import { colorHex } from './names.js';
import { LABEL_Y, setStandIn, standIn } from './geom.js';
import { blockedAlong, offScreen, quantizeOpacity, tagOpacity } from './presence.js';
import { BOAT_DROP, realGeos } from './meshes.js';

export { setStandIn };

const CAP = 8;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const WHITE = '#ffffff';

function ensure(geo) {
  const pos = geo.attributes.position;
  if (!geo.attributes.color) {
    const a = new Float32Array(pos.count * 3);
    a.fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.index) {
    const n = pos.count;
    const a = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) a[i] = i;
    geo.setIndex(new THREE.BufferAttribute(a, 1));
  }
  return geo;
}

function counts(geos) {
  let v = 64;
  let ix = 64;
  for (let i = 0; i < geos.length; i++) {
    const g = geos[i];
    if (!g) continue;
    v += g.attributes.position.count;
    ix += g.index ? g.index.count : g.attributes.position.count;
  }
  return [v, ix];
}

export function mountBodies(ctx, tags) {
  // [mobile-play] baked when a room is joined (multi/index.js), and on a phone freed when it is left (dispose below)
  let baked = null;
  try { baked = realGeos(ctx); } catch (e) { baked = null; }
  const kind = baked?.kind || {};

  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  mat.toneMapped = false;
  const sources = {
    avatar: baked?.avatar || standIn(THREE, 'avatar'),
    car: baked?.car || standIn(THREE, 'car'),
    boat: baked?.boat || standIn(THREE, 'boat'),
    boat1: baked?.boat1 || standIn(THREE, 'boat'),
    gull: baked?.gull || standIn(THREE, 'gull'),
    fish: baked?.fish || standIn(THREE, 'fish'),
  };
  for (const k in sources) ensure(sources[k]);
  const flagSrc = { flag: baked?.flag || null, flag1: baked?.flag1 || null };
  if (flagSrc.flag) ensure(flagSrc.flag);
  if (flagSrc.flag1) ensure(flagSrc.flag1);

  const [maxV, maxI] = counts([sources.avatar, sources.car, sources.boat, sources.boat1, sources.gull, sources.fish]);
  const mesh = new THREE.BatchedMesh(CAP, maxV, maxI, mat);
  mesh.name = 'play-multi';
  mesh.frustumCulled = false;
  mesh.perObjectFrustumCulled = false;
  mesh.sortObjects = false;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  const geoId = Object.create(null);
  for (const k in sources) geoId[k] = mesh.addGeometry(sources[k]);
  const slotInst = new Array(CAP).fill(-1);
  const slotMode = new Array(CAP).fill('');
  const slotColor = new Array(CAP).fill('');
  ctx.noOutline?.(mesh);
  ctx.noBatch?.(mesh);
  ctx.add?.(mesh);

  const [flagV, flagI] = counts([flagSrc.flag, flagSrc.flag1]);
  const accentMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
  accentMat.toneMapped = false;
  const accent = new THREE.BatchedMesh(CAP, Math.max(flagV, 128), Math.max(flagI, 128), accentMat);
  accent.name = 'play-multi-flag';
  accent.frustumCulled = false;
  accent.perObjectFrustumCulled = false;
  accent.sortObjects = false;
  accent.matrixAutoUpdate = false;
  accent.visible = false;
  const flagId = Object.create(null);
  if (flagSrc.flag) flagId.flag = accent.addGeometry(flagSrc.flag);
  if (flagSrc.flag1) flagId.flag1 = accent.addGeometry(flagSrc.flag1);
  const flagInst = new Array(CAP).fill(-1);
  const flagMode = new Array(CAP).fill('');
  const flagColor = new Array(CAP).fill('');
  ctx.noOutline?.(accent);
  ctx.noBatch?.(accent);
  ctx.add?.(accent);
  // [mobile-play] the two batches hold their own copies now: let the bake's geometries go (they were never drawn, so there
  // is nothing on the GPU to free; not disposed, as the flock and the stand-ins may be shared with the other modes)
  for (const k in sources) sources[k] = null;
  flagSrc.flag = null; flagSrc.flag1 = null;
  baked = null;

  const labels = [];
  for (let i = 0; i < CAP; i++) {
    const el = document.createElement('div');
    el.className = 'tag';
    el.hidden = true;
    const dot = document.createElement('i');
    const name = document.createElement('b');
    const bubble = document.createElement('span');
    bubble.hidden = true;
    el.appendChild(dot);
    el.appendChild(name);
    el.appendChild(bubble);
    tags.appendChild(el);
    labels.push({ el, dot, name, bubble, px: -9999, py: -9999, text: '', stamp: '', hex: '', op: -1 });
  }

  const aim = { x: 0, y: 0, z: 0, on: false };
  let lastMs = 0;
  const phys = ctx?.physics;
  const land = ctx?.L;
  const solidAt = phys && phys.solidAt ? (x, z, y) => phys.solidAt(x, z, y) : null;
  const heightAt = land && land.heightAt ? (x, z) => land.heightAt(x, z) : null;
  let sawAvatar = false;

  function keyOf(it) {
    const mode = MODES.indexOf(it.mode) >= 0 ? it.mode : 'avatar';
    if (mode === 'boat') return (it.vehicle | 0) === 1 ? 'boat1' : 'boat';
    return geoId[mode] != null ? mode : 'avatar';
  }

  function draw(list, n, camera, reduced, time) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const bobOn = !reduced;
    const shown = n > CAP ? CAP : (n > 0 ? n : 0);
    sawAvatar = false;
    let flags = 0;
    for (let i = 0; i < shown; i++) {
      const it = list[i];
      const key = keyOf(it);
      if (slotMode[i] !== key) {
        if (slotInst[i] >= 0) mesh.deleteInstance(slotInst[i]);
        slotInst[i] = mesh.addInstance(geoId[key]);
        slotMode[i] = key;
        slotColor[i] = '';
      }
      const bob = bobOn && (key === 'avatar' || key === 'gull') ? Math.sin(time * 2.1 + it.id) * 0.04 : 0;
      const drop = key === 'boat' ? BOAT_DROP[0] : (key === 'boat1' ? BOAT_DROP[1] : 0);
      _e.x = key === 'gull' || key === 'fish' ? (it.look || 0) : (it.pitch || 0);
      _e.y = it.yaw || 0;
      _e.z = 0;
      _q.setFromEuler(_e);
      _p.set(it.x, it.y - drop + bob, it.z);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(slotInst[i], _m);
      const tint = key === 'car' ? colorHex(it.color) : WHITE;
      if (slotColor[i] !== tint) {
        _c.set(tint);
        mesh.setColorAt(slotInst[i], _c);
        slotColor[i] = tint;
      }
      const fk = key === 'boat' ? 'flag' : (key === 'boat1' ? 'flag1' : '');
      if (fk && flagId[fk] != null) {
        if (flagMode[i] !== fk) {
          if (flagInst[i] >= 0) accent.deleteInstance(flagInst[i]);
          flagInst[i] = accent.addInstance(flagId[fk]);
          flagMode[i] = fk;
          flagColor[i] = '';
        }
        accent.setMatrixAt(flagInst[i], _m);
        const hex = colorHex(it.color);
        if (flagColor[i] !== hex) {
          _c.set(hex);
          accent.setColorAt(flagInst[i], _c);
          flagColor[i] = hex;
        }
        flags++;
      } else if (flagInst[i] >= 0) {
        accent.deleteInstance(flagInst[i]);
        flagInst[i] = -1;
        flagMode[i] = '';
        flagColor[i] = '';
      }
    }
    for (let i = shown; i < CAP; i++) {
      if (slotInst[i] >= 0) {
        mesh.deleteInstance(slotInst[i]);
        slotInst[i] = -1;
        slotMode[i] = '';
        slotColor[i] = '';
      }
      if (flagInst[i] >= 0) {
        accent.deleteInstance(flagInst[i]);
        flagInst[i] = -1;
        flagMode[i] = '';
        flagColor[i] = '';
      }
    }
    mesh.visible = shown > 0;
    accent.visible = flags > 0;
    placeLabels(list, shown, camera, labels, reduced, time, solidAt, heightAt, aim);
    lastMs = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
  }

  return {
    draw,
    aim,
    get frameMs() { return lastMs; },
    get sawAvatar() { return sawAvatar; },
    get kind() { return kind; },
    mesh,
    accent,
    /** [mobile-play] Everything the bake made: both batches (their geometry and their matrix / colour textures), their
     *  materials and the name tags. multi/index.js calls it on a phone when the room is left. */
    dispose() {
      mesh.parent?.remove(mesh);
      accent.parent?.remove(accent);
      try { mesh.dispose(); } catch (e) { /* already gone */ }
      try { accent.dispose(); } catch (e) { /* already gone */ }
      mat.dispose();
      accentMat.dispose();
      for (const l of labels) l.el.remove();
      labels.length = 0;
      aim.on = false;
    },
  };
}

function placeLabels(list, n, camera, labels, reduced, time, solidAt, heightAt, aim) {
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const h = typeof window !== 'undefined' ? window.innerHeight : 0;
  aim.on = false;
  if (!camera || !w || !h) {
    for (let i = 0; i < labels.length; i++) if (!labels[i].el.hidden) labels[i].el.hidden = true;
    return;
  }
  const cam = camera.position;
  let best = 1e12;
  let veil = placeLabels.veil;
  if (!veil && typeof document !== 'undefined') {
    veil = document.querySelector('#klc-play .veil');
    placeLabels.veil = veil;
  }
  if (veil && !veil.hidden) {
    for (let i = 0; i < labels.length; i++) if (!labels[i].el.hidden) labels[i].el.hidden = true;
    return;
  }
  for (let i = 0; i < labels.length; i++) {
    const lab = labels[i];
    if (i >= n) { if (!lab.el.hidden) lab.el.hidden = true; continue; }
    const it = list[i];
    const mode = LABEL_Y[it.mode] != null ? it.mode : 'avatar';
    const bob = !reduced && (mode === 'avatar' || mode === 'gull') ? Math.sin(time * 2.1 + it.id) * 0.04 : 0;
    const lx = it.x;
    const ly = it.y + LABEL_Y[mode] + bob;
    const lz = it.z;
    _v.set(lx, ly, lz);
    _v.project(camera);
    const behind = _v.z > 1;
    const away = offScreen(_v.x, _v.y, behind);
    const dx = cam ? cam.x - lx : 0;
    const dy = cam ? cam.y - ly : 0;
    const dz = cam ? cam.z - lz : 0;
    const dist = Math.hypot(dx, dy, dz);
    if (away && dist < best) {
      best = dist;
      aim.x = lx;
      aim.y = ly;
      aim.z = lz;
      aim.on = true;
    }
    const blocked = !away && cam && blockedAlong(cam.x, cam.y, cam.z, lx, ly, lz, solidAt, heightAt);
    const op = away ? 0 : quantizeOpacity(tagOpacity(dist, blocked));
    if (op <= 0) {
      if (!lab.el.hidden) lab.el.hidden = true;
      continue;
    }
    if (lab.el.hidden) lab.el.hidden = false;
    const x = (_v.x * 0.5 + 0.5) * w;
    const y = (-_v.y * 0.5 + 0.5) * h;
    const px = x | 0;
    const py = y | 0;
    if (px !== lab.px || py !== lab.py) {
      lab.el.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0) translate(-50%,-100%)';
      lab.px = px;
      lab.py = py;
    }
    if (lab.op !== op) {
      lab.el.style.opacity = op >= 1 ? '' : String(op);
      lab.op = op;
    }
    if (lab.hex !== it.color) {
      lab.dot.style.background = colorHex(it.color);
      lab.hex = it.color;
    }
    if (lab.text !== it.label) { lab.name.textContent = it.label; lab.text = it.label; }
    const stamp = it.stamp || '';
    if (lab.stamp !== stamp) {
      lab.bubble.textContent = stamp;
      lab.bubble.hidden = !stamp;
      if (stamp && !reduced) lab.bubble.classList.add('pop');
      else lab.bubble.classList.remove('pop');
      lab.stamp = stamp;
    }
  }
}
