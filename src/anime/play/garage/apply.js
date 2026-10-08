// One extra draw for the whole dress: livery, plate, wheels and roof share a canvas and a mesh.
// The kei body itself is repainted by rebuilding it (drive.setLook color). Shared atlas geos are never disposed.
import * as THREE from 'three';
import { paintById } from './catalog.js';

const W = 512, H = 384;
const LIV_H = 256, PLATE_H = 96;

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function paintLivery(g, id) {
  if (id === 'tairyo') {
    // An original 大漁旗: red field, white and navy borders, a disc, a bonito, 大漁, seigaiha.
    const red = '#B7282E', paper = '#FBFAF5', navy = '#165E83';
    g.fillStyle = red;
    g.fillRect(0, 0, W, LIV_H);
    g.strokeStyle = paper;
    g.lineWidth = 16;
    g.strokeRect(10, 10, W - 20, LIV_H - 20);
    g.strokeStyle = navy;
    g.lineWidth = 8;
    g.strokeRect(24, 24, W - 48, LIV_H - 48);
    g.fillStyle = navy;
    for (const [cx, cy] of [[36, 36], [W - 36, 36], [36, LIV_H - 36], [W - 36, LIV_H - 36]]) {
      g.fillRect(cx - 14, cy - 14, 28, 28);
      g.fillStyle = paper;
      g.fillRect(cx - 6, cy - 6, 12, 12);
      g.fillStyle = navy;
    }
    g.fillStyle = paper;
    g.beginPath();
    g.arc(256, 102, 62, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = navy;
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = navy;
    g.beginPath();
    g.moveTo(214, 108);
    g.quadraticCurveTo(236, 78, 292, 96);
    g.quadraticCurveTo(318, 106, 292, 118);
    g.quadraticCurveTo(248, 136, 214, 108);
    g.fill();
    g.beginPath();
    g.moveTo(214, 108);
    g.lineTo(188, 86);
    g.lineTo(198, 108);
    g.lineTo(188, 130);
    g.closePath();
    g.fill();
    g.fillStyle = paper;
    g.beginPath();
    g.arc(286, 98, 3.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = paper;
    g.font = '700 42px "Zen Maru Gothic", "Hiragino Sans", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('大漁', 256, 186);
    g.strokeStyle = paper;
    g.lineWidth = 2;
    for (let row = 0; row < 2; row++) {
      const y = 214 + row * 16;
      for (let x = 48; x <= W - 32; x += 20) {
        g.beginPath();
        g.arc(x, y, 12, Math.PI, 0);
        g.stroke();
      }
    }
    return;
  }
  if (id === 'nami') {
    const cols = ['#165E83', '#FBFAF5', '#00A3AF'];
    g.save();
    g.beginPath();
    g.rect(0, 0, W, LIV_H);
    g.clip();
    g.translate(256, 128);
    g.rotate(-0.55);
    for (let i = -10; i < 14; i++) {
      g.fillStyle = cols[(i + 12) % 3];
      g.fillRect(-500, i * 26, 1000, 26);
    }
    g.restore();
  }
}

function paintPlate(g, id) {
  const y = LIV_H;
  if (id === 'tairyo') {
    g.fillStyle = '#B7282E';
    g.fillRect(0, y, 256, PLATE_H);
    g.fillStyle = '#FBFAF5';
    g.font = '700 40px "Zen Maru Gothic", "Hiragino Sans", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('大漁', 128, y + 48);
    return;
  }
  if (id === 'nami') {
    g.fillStyle = '#165E83';
    g.fillRect(0, y, 256, PLATE_H);
    g.strokeStyle = '#FBFAF5';
    g.lineWidth = 4;
    g.beginPath();
    for (let row = 0; row < 3; row++) {
      const yy = y + 28 + row * 16;
      g.moveTo(16, yy);
      for (let x = 16; x <= 240; x += 6) g.lineTo(x, yy + Math.sin(x / 18 + row) * 4);
    }
    g.stroke();
    return;
  }
  g.fillStyle = '#FBFAF5';
  g.fillRect(0, y, 256, PLATE_H);
  g.fillStyle = '#1F6B4A';
  g.fillRect(0, y, 256, 22);
  g.fillStyle = '#223A70';
  g.font = '700 28px "Zen Maru Gothic", "Hiragino Sans", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('みなと', 128, y + 58);
}

function makeTexture(look) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#ffffff';
  g.fillRect(W - 2, H - 2, 2, 2);
  paintLivery(g, look.livery);
  paintPlate(g, look.plate);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
  tex.needsUpdate = true;
  return tex;
}

function colored(geo, rgb) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function uvRect(geo, u0, v0, u1, v1) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  return geo;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

function place(geo, x, y, z, rotY, rotZ = 0) {
  _e.set(0, rotY, rotZ);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  geo.applyMatrix4(_m.compose(_p, _q, _s));
  return geo;
}

function merge(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) {
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const col = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let v = 0, ii = 0;
  for (const g of geos) {
    const p = g.attributes.position, u = g.attributes.uv, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      pos[(v + i) * 3] = p.getX(i); pos[(v + i) * 3 + 1] = p.getY(i); pos[(v + i) * 3 + 2] = p.getZ(i);
      uv[(v + i) * 2] = u.getX(i); uv[(v + i) * 2 + 1] = u.getY(i);
      col[(v + i) * 3] = c.getX(i); col[(v + i) * 3 + 1] = c.getY(i); col[(v + i) * 3 + 2] = c.getZ(i);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[ii++] = g.index.getX(i) + v;
    else for (let i = 0; i < p.count; i++) idx[ii++] = v + i;
    v += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Canvas v=1 is the top (flipY). Livery is y 0..256, plate y 256..352, white pixel at the corner.
const V_LIV0 = 1 - LIV_H / H;
const V_PL0 = 1 - (LIV_H + PLATE_H) / H;
const V_PL1 = V_LIV0;

function wheelGeo(id) {
  const geos = [];
  const spots = [[0.71, 0.28, 1.23, 1], [-0.71, 0.28, 1.23, -1], [0.71, 0.28, -1.23, 1], [-0.71, 0.28, -1.23, -1]];
  const steel = hex('#8d9096'), dish = hex('#d5d8dc'), spoke = hex('#e6e4df'), tyre = hex('#3a3840');
  for (const [x, y, z, side] of spots) {
    const rot = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (id === 'dish') {
      geos.push(place(uvRect(colored(new THREE.CircleGeometry(0.22, 16), dish), 0.998, 0.002, 1, 0.008), x, y, z, rot));
    } else if (id === 'spoke') {
      geos.push(place(uvRect(colored(new THREE.RingGeometry(0.12, 0.22, 14), spoke), 0.998, 0.002, 1, 0.008), x, y, z, rot));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI;
        const box = uvRect(colored(new THREE.BoxGeometry(0.03, 0.2, 0.012), spoke), 0.998, 0.002, 1, 0.008);
        geos.push(place(box, x + side * 0.01, y, z, rot, a));
      }
    } else {
      geos.push(place(uvRect(colored(new THREE.CircleGeometry(0.16, 12), steel), 0.998, 0.002, 1, 0.008), x, y, z, rot));
      geos.push(place(uvRect(colored(new THREE.CircleGeometry(0.06, 10), tyre), 0.998, 0.002, 1, 0.008), x + side * 0.012, y, z, rot));
    }
  }
  return geos;
}

function roofGeo(id, paint) {
  if (id === 'none') return [];
  const ink = hex('#595857');
  const out = [];
  if (id === 'rack') {
    out.push(place(uvRect(colored(new THREE.BoxGeometry(0.9, 0.025, 0.04), ink), 0.998, 0.002, 1, 0.008), 0, 1.62, 0.15, 0));
    out.push(place(uvRect(colored(new THREE.BoxGeometry(0.9, 0.025, 0.04), ink), 0.998, 0.002, 1, 0.008), 0, 1.62, -0.45, 0));
    out.push(place(uvRect(colored(new THREE.BoxGeometry(0.04, 0.08, 0.7), ink), 0.998, 0.002, 1, 0.008), -0.42, 1.56, -0.15, 0));
    out.push(place(uvRect(colored(new THREE.BoxGeometry(0.04, 0.08, 0.7), ink), 0.998, 0.002, 1, 0.008), 0.42, 1.56, -0.15, 0));
    return out;
  }
  const a = hex('#00A3AF'), b = hex(paintById(paint).hex === '#00A3AF' ? '#F8B500' : '#F8B500');
  out.push(place(uvRect(colored(new THREE.BoxGeometry(0.28, 0.04, 1.15), a), 0.998, 0.002, 1, 0.008), -0.16, 1.66, -0.05, 0, 0.08));
  out.push(place(uvRect(colored(new THREE.BoxGeometry(0.28, 0.04, 1.15), b), 0.998, 0.002, 1, 0.008), 0.16, 1.7, -0.05, 0, -0.08));
  return out;
}

/** Replace the dress child on the car group. Safe to call often; it only rebuilds the mesh. */
export function dressCar(group, look) {
  const prev = group.getObjectByName('play-dress');
  if (prev) {
    prev.geometry?.dispose();
    prev.material?.map?.dispose();
    prev.material?.dispose();
    group.remove(prev);
  }
  if (typeof document === 'undefined') return null;
  const geos = [];
  const white = [1, 1, 1];
  if (look.livery && look.livery !== 'none') {
    for (const side of [1, -1]) {
      const plane = uvRect(colored(new THREE.PlaneGeometry(1.55, 0.62), white), 0, V_LIV0, 1, 1);
      geos.push(place(plane, side * 0.82, 1.02, 0.05, side > 0 ? Math.PI / 2 : -Math.PI / 2));
    }
  }
  const plate = uvRect(colored(new THREE.PlaneGeometry(0.42, 0.18), white), 0, V_PL0, 0.5, V_PL1);
  geos.push(place(plate, 0, 0.58, -1.78, Math.PI));
  geos.push(...wheelGeo(look.wheel || 'steel'));
  geos.push(...roofGeo(look.roof || 'none', look.paint));
  const geo = merge(geos);
  const map = makeTexture(look);
  const mat = new THREE.MeshBasicMaterial({ map, vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'play-dress';
  group.add(mesh);
  return mesh;
}
