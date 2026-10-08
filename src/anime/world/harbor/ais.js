// AIS vessels from /api/live `ais`. Empty coverage draws nothing.
// Positions are the ones the feed reported, moved by dead reckoning, and hidden off the water.
import * as THREE from 'three';
import { llToXZ } from '../layout.js';
import { projectVessel, aisKind } from '../life/ais.js';
import { FONT } from './util.js';

const COLOR = { fishing: 0x165e83, cargo: 0x223a70, tanker: 0x595857, passenger: 0xf8b500, other: 0x00a3af };
const _proj = { ok: false };
const _dummy = new THREE.Object3D();
const TAU = 1.4;

export function createAis(ctx, opts = {}) {
  const isWater = opts.isWater || ctx.L?.isWater || (() => true);
  const phone = !!ctx.quality?.phone || ctx.quality?.name === 'low' || ctx.quality?.name === 'phone';
  const max = opts.max ?? (phone ? 8 : 24);
  const root = new THREE.Group(); root.name = 'ais'; ctx.add(root);
  const slots = [];
  let mesh = null;
  let idSig = '';
  let acc = 1;

  function hullColor(kind) {
    return new THREE.Color(COLOR[kind] || COLOR.other);
  }
  function labelMap(name, kn) {
    const speed = `${kn.toFixed(1)} kn`;
    return ctx.tex.draw(256, 72, (g) => {
      g.clearRect(0, 0, 256, 72);
      g.fillStyle = 'rgba(23,24,75,0.82)';
      g.beginPath(); g.roundRect ? g.roundRect(4, 4, 248, 64, 14) : g.rect(4, 4, 248, 64); g.fill();
      g.fillStyle = '#FBFAF5'; g.textBaseline = 'middle';
      g.font = `800 22px ${FONT.sans}`; g.fillText(name, 16, 26, 224);
      g.fillStyle = '#89C3EB'; g.font = `700 16px ${FONT.sans}`; g.fillText(speed, 16, 50, 224);
    }, { key: `ais-label|${name}|${speed}` });
  }
  function ensureMesh() {
    if (mesh) return;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff });
    mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.count = 0; mesh.frustumCulled = false; mesh.name = 'ais-hulls'; mesh.visible = false;
    ctx.noOutline?.(mesh);
    root.add(mesh);
  }
  function clearSlots() {
    for (const s of slots) s.label?.parent?.remove(s.label);
    slots.length = 0;
    if (mesh) { mesh.count = 0; mesh.visible = false; }
    idSig = '';
  }
  function sync(list) {
    const vessels = (list || []).filter((v) => v && v.lat != null && v.lon != null).slice(0, max);
    if (!vessels.length) { if (slots.length) clearSlots(); return; }
    const sig = vessels.map((v) => v.mmsi).join('|');
    if (sig !== idSig) {
      clearSlots();
      idSig = sig;
      ensureMesh();
      mesh.count = vessels.length;
      mesh.visible = true;
      for (let i = 0; i < vessels.length; i++) {
        const v = vessels[i];
        const [x0, z0] = llToXZ(v.lat, v.lon);
        const len = Math.max(8, Math.min(180, v.length || 24));
        const beam = Math.max(2.4, Math.min(32, v.beam || len * 0.18));
        const h = Math.min(8, Math.max(1.6, len * 0.08));
        const kind = v.kind || aisKind(v.type);
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelMap(v.name || v.mmsi, v.sog || 0), transparent: true, depthWrite: false, toneMapped: false, sizeAttenuation: false }));
        label.center.set(0.5, 0); label.scale.set(0.16, 0.045, 1); label.renderOrder = 21; label.name = 'ais-label';
        ctx.noOutline?.(label); root.add(label);
        const slot = { v, x0, z0, seen: v.seen, _lat: v.lat, _lon: v.lon, x: x0, z: z0, yaw: 0, len, beam, h, kind, label, bucket: Math.round((v.sog || 0) * 2) / 2 };
        slots.push(slot);
        mesh.setColorAt?.(i, hullColor(kind));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return;
    }
    for (let i = 0; i < vessels.length; i++) {
      const v = vessels[i], s = slots[i];
      s.v = v;
      if (v.seen !== s.seen || v.lat !== s._lat || v.lon !== s._lon) {
        const [x0, z0] = llToXZ(v.lat, v.lon);
        s.x0 = x0; s.z0 = z0; s.seen = v.seen; s._lat = v.lat; s._lon = v.lon;
      }
    }
  }
  function step(dt) {
    const now = Date.now();
    const sea = ctx.L?.SEA?.level ?? 0;
    const cam = ctx.camera?.position;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      projectVessel(s.v, now, _proj);
      let show = _proj.ok;
      let tx = s.x0, tz = s.z0, ty = s.yaw;
      if (show) {
        tx = s.x0 + _proj.deast;
        tz = s.z0 - _proj.dnorth;
        ty = _proj.yaw;
        if (typeof isWater === 'function' && !isWater(tx, tz)) show = false;
      }
      if (!show) {
        _dummy.position.set(0, -500, 0); _dummy.scale.set(0.001, 0.001, 0.001); _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
        s.label.visible = false;
        continue;
      }
      const k = 1 - Math.exp(-Math.max(0, dt) / TAU);
      s.x = s.x + (tx - s.x) * k;
      s.z = s.z + (tz - s.z) * k;
      let dy = ty - s.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      s.yaw += dy * k;
      _dummy.position.set(s.x, sea + 0.05, s.z);
      _dummy.rotation.set(0, s.yaw, 0);
      _dummy.scale.set(s.beam, s.h, s.len);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      const bucket = Math.round(_proj.sog * 2) / 2;
      if (bucket !== s.bucket) { s.bucket = bucket; s.label.material.map = labelMap(s.v.name || s.v.mmsi, bucket); }
      s.label.position.set(s.x, sea + s.h + 4, s.z);
      const d = cam ? Math.hypot(cam.x - s.x, cam.y - (sea + s.h), cam.z - s.z) : 200;
      s.label.visible = d > 20 && d < 2800;
      s.label.material.opacity = Math.min(1, (2800 - d) / 400);
    }
    if (mesh) mesh.instanceMatrix.needsUpdate = true;
  }
  ctx.onUpdate((dt) => {
    acc += dt || 0;
    if (acc >= 1) {
      acc = 0;
      const pack = ctx.services?.ais;
      sync(pack?.coverage === 'live' ? pack.vessels : null);
    }
    if (slots.length) step(dt || 0);
  });
  return { root, slots, sync };
}
