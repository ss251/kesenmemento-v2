// A small harbour stage for 「みんなであそぶ」. The real sheet, the real relay,
// stand-in friends. The town itself stays in the app; this page is how two
// browsers prove they share a room. Open it on localhost with the relay on 9505.
//   ?lang=en   ?shot=1 (make a room at once)   ?night=1   #room=CODE

import * as THREE from 'three';
import { mountKit } from '../kit/index.js';
import { mountMulti } from './index.js';

const q = new URLSearchParams(location.search);
const lang = q.get('lang') === 'en' ? 'en' : 'ja';
const night = q.get('night') === '1';
document.documentElement.lang = lang;
document.body.classList.add('playing');

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(night ? 0x1c2c4a : 0xb7d4ec, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 200);
camera.position.set(0.4, 2.35, 7.2);
camera.lookAt(0, 1.05, 0);

function box(w, h, d, x, y, z, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}
function disc(r, x, z, color) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.03, z);
  scene.add(m);
  return m;
}

box(28, 0.2, 16, 0, -0.1, 2, night ? 0x3a342c : 0xe4d3b0);
box(28, 0.08, 22, 0, -0.16, -12, night ? 0x16324a : 0x3e92a8);
box(1.1, 0.9, 1.1, -3.2, 0.45, 1.4, night ? 0x2a3148 : 0xf4efe4);
box(0.35, 0.7, 0.35, -3.2, 1.15, 1.4, night ? 0xc4521f : 0xc4521f);
disc(0.9, 0, 0.2, night ? 0x241c16 : 0xcbb892);

const steps = [];
const updates = [];
const playerPos = new THREE.Vector3(0, 0, 6);
const playerObj = { yaw: Math.PI, pitch: 0, fly: false };
window.__hero = { x: 0, y: 0, z: 6, yaw: Math.PI, mode: 'avatar' };

const ctx = {
  services: {},
  camera,
  player: { position: playerPos },
  playerObj,
  onStep(fn) { steps.push(fn); },
  onUpdate(fn) { updates.push(fn); },
  add(obj) { scene.add(obj); },
  noOutline() {},
  noBatch() {},
};

try { mountKit(ctx); } catch (e) { console.error('[proof] kit', e); }
const multi = mountMulti(ctx);
window.__multi = multi;
if (multi) multi.setLang(lang);
if (q.get('shot') === '1' && multi) {
  multi.open();
  document.querySelector('#klc-multi [data-act="create"]')?.click();
}

function applyHero() {
  const h = window.__hero;
  playerPos.set(h.x || 0, h.y || 0, h.z || 0);
  playerObj.yaw = h.yaw || 0;
  playerObj.fly = h.mode === 'gull';
  ctx.services.explore = {
    drive: { active: h.mode === 'car', state: { yaw: playerObj.yaw, pitch: 0 } },
  };
  ctx.services.sail = { active: h.mode === 'boat' };
  ctx.services.gull = { active: h.mode === 'gull' };
  ctx.services.underwater = { active: h.mode === 'fish' };
}

let sim = 0;
function tick() {
  if (!window.__ready && multi && multi.code && String(multi.code).length === 4) {
    window.__proof = {
      get code() { return multi.code; },
      get count() { return document.querySelector('#klc-multi [data-f="count"]')?.textContent || ''; },
      peers() {
        const out = [];
        const map = multi.peers;
        if (!map) return out;
        for (const p of map.values()) out.push({ id: p.id, x: p.x || 0, y: p.y || 0, z: p.z || 0, mode: p.modeSeen || '' });
        return out;
      },
    };
    window.__ready = true;
  }
  applyHero();
  const dt = 1 / 60;
  sim += dt;
  for (let i = 0; i < steps.length; i++) steps[i](dt, sim);
  for (let i = 0; i < updates.length; i++) updates[i](dt, sim);
  renderer.render(scene, camera);
}
setInterval(tick, 16);

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});
