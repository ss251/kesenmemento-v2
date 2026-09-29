// Vendored from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station). [v3:foundation] first-look only; town owns buildings.
// Laundry (洗濯物), wind-chime strips (風鈴の短冊) and koinobori (鯉のぼり): alpha-cut cloth cards
// merged into ONE dynamic mesh whose vertices sway in the shared wind (vertex shader on a patched
// MeshToonMaterial, so fog + cel lighting stay intact). noOutline because it is vertex-animated;
// the garment textures carry their own painted ink lines.
import * as THREE from 'three';

const TINTS = {
  tee: ['#f4f4f4', '#f2c9d3', '#bcd3ea', '#f3e3a8', '#cfe3c4', '#f4f4f4', '#d9d0ec'],
  towel: ['#f4f4f4', '#a9c8e8', '#f5c6c6', '#f3e1a6', '#c6e1c9', '#e9d6f0', '#f4f4f4'],
};
const MIXES = {
  balcony: ['shirt', 'tee', 'towel', 'tee', 'pinch', 'towel', 'shirt'],
  student: ['sailor', 'skirt', 'tee', 'towel', 'gym', 'pinch', 'sailor'],
  family: ['shirt', 'shirt', 'tee', 'gym', 'towel', 'towel', 'pinch', 'tee'],
  sheets: ['sheet', 'towel', 'towel', 'pinch'],
  yard: ['sheet', 'shirt', 'tee', 'towel', 'towel', 'pinch'],
  apartment: ['shirt', 'towel', 'pinch', 'tee'],
};
const SIZE = { shirt: [0.52, 0.72], sailor: [0.5, 0.64], tee: [0.5, 0.52], gym: [0.48, 0.5], towel: [0.36, 0.62], sheet: [1.25, 1.2], pinch: [0.6, 0.5], skirt: [0.42, 0.56] };

export class Laundry {
  constructor(H) {
    this.H = H; this.ctx = H.ctx;
    this.P = []; this.N = []; this.U = []; this.C = []; this.S = []; this.PH = []; this.I = [];
    this.count = 0;
  }
  _quad(corner, ax, ay, nrm, rect, tint, amp, phase, nx = 3, ny = 4, hangFn) {
    // corner = top-left world, ax = world vector across (width), ay = world vector DOWN (height)
    const base = this.P.length / 3;
    const c = new THREE.Color(tint);
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / ny;
      const x = corner.x + ax.x * u + ay.x * v, y = corner.y + ax.y * u + ay.y * v, z = corner.z + ax.z * u + ay.z * v;
      this.P.push(x, y, z); this.N.push(nrm.x, nrm.y, nrm.z);
      this.U.push(rect[0] + (rect[2] - rect[0]) * u, rect[3] - (rect[3] - rect[1]) * v);
      this.C.push(c.r, c.g, c.b);
      const w = hangFn ? hangFn(u, v) : Math.pow(v, 1.3);
      this.S.push(nrm.x * amp, nrm.y * amp, nrm.z * amp, w);
      this.PH.push(phase);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = base + j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      this.I.push(a, d, b, b, d, e);
    }
    this.count++;
  }
  /** Hang garments along a pole in frame FF from local x0..x1 at (y, z); the garment plane faces +z. */
  line(FF, x0, x1, y, z, r, mix = 'balcony') {
    const rects = this.H.tex.laundry.rects;
    const list = MIXES[mix] || MIXES[typeof mix === 'string' ? 'balcony' : 'balcony'];
    let x = x0;
    const nW = FF.w(0, 0, 1).sub(FF.w(0, 0, 0)).normalize();
    const aX = FF.w(1, 0, 0).sub(FF.w(0, 0, 0)).normalize();
    let k = Math.floor(r() * list.length);
    let guard = 0;
    while (x < x1 - 0.3 && guard++ < 16) {
      const name = list[k++ % list.length];
      let [w, h] = SIZE[name];
      if (x + w > x1 + 0.05) { if (name === 'sheet') continue; break; }
      const tint = name === 'tee' ? TINTS.tee[Math.floor(r() * TINTS.tee.length)] : name === 'towel' ? TINTS.towel[Math.floor(r() * TINTS.towel.length)] : '#ffffff';
      const dz = (r() - 0.5) * 0.06;
      const hook = name === 'towel' || name === 'sheet' ? 0.0 : 0.02;
      const corner = FF.w(x, y + 0.02 + hook, z + dz);
      const ay = new THREE.Vector3(0, -h, 0);
      const ax = aX.clone().multiplyScalar(w);
      const amp = name === 'sheet' ? 0.16 : name === 'pinch' ? 0.1 : 0.12;
      this._quad(corner, ax, ay, nW, rects[name], tint, amp, r() * 6.28, name === 'sheet' ? 4 : 3, 4);
      x += w + 0.05 + r() * 0.1;
    }
  }
  /** 風鈴: small glass bell (static) + swaying paper strip, hung under an eave/balcony ceiling */
  chime(FF, x, y, z) {
    const { M } = this.H;
    FF.box(M.plain, '#9aa1a8', 0.01, 0.12, 0.01, x, y + 0.06, z);
    FF.raw(M.glass, null, this.H.blobRaw(0, 1), x, y - 0.03, z, { sx: 0.1, sy: 0.09, sz: 0.1, shadow: false });
    FF.box(M.plain, '#d96c86', 0.03, 0.02, 0.03, x, y - 0.03, z);
    const rects = this.H.tex.laundry.rects;
    const corner = FF.w(x - 0.03, y - 0.06, z);
    const ax = FF.w(1, 0, 0).sub(FF.w(0, 0, 0)).normalize().multiplyScalar(0.06);
    const nW = FF.w(0, 0, 1).sub(FF.w(0, 0, 0)).normalize();
    this._quad(corner, ax, new THREE.Vector3(0, -0.24, 0), nW, rects.tanzaku, '#ffffff', 0.09, x * 3.1, 1, 3, (u, v) => v);
  }
  /** carp tube from mouth point along world direction dir (downwind), length len, radius rad */
  _carp(mouth, dir, len, rad, rect, phase) {
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const nL = 6, nR = 8;
    const base = this.P.length / 3;
    for (let j = 0; j <= nL; j++) {
      const t = j / nL;
      const rr = rad * (1 - 0.45 * t) * (1 - 0.15 * Math.sin(t * Math.PI * 2));
      const c = mouth.clone().addScaledVector(dir, len * t).addScaledVector(up, -t * t * len * 0.12);
      for (let i = 0; i <= nR; i++) {
        const a = i / nR * Math.PI * 2;
        const n = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
        const p = c.clone().addScaledVector(n, rr);
        this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z);
        this.U.push(rect[0] + (rect[2] - rect[0]) * t, rect[1] + (rect[3] - rect[1]) * (0.5 + 0.5 * Math.cos(a)));
        this.C.push(1, 1, 1);
        const amp = 0.35 * len * 0.25;
        this.S.push(0, amp, 0, t * t);
        this.PH.push(phase);
      }
    }
    for (let j = 0; j < nL; j++) for (let i = 0; i < nR; i++) {
      const a = base + j * (nR + 1) + i, b = a + 1, d = a + nR + 1, e = d + 1;
      this.I.push(a, b, d, b, e, d);
    }
    this.count++;
  }
  /** big garden koinobori: pole at world (x, groundY, z) */
  koinobori(F, x, y, z, h = 7.5) {
    const { M } = this.H;
    F.cyl(M.plain, '#e8e4da', 0.06, h, x, y + h / 2, z, { seg: 8, rTop: 0.04 });
    F.raw(M.plain, '#e8c84a', this.H.blobRaw(1, 0), x, y + h + 0.1, z, { sx: 0.18, sy: 0.18, sz: 0.18 });
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; F.box(M.plain, k % 2 ? '#d9575a' : '#4f7fc4', 0.03, 0.03, 0.42, x + Math.sin(a) * 0.21, y + h - 0.12, z + Math.cos(a) * 0.21, { ry: a }); }
    const w = this.ctx.shared.uWind.value; const dir = new THREE.Vector3(w.x, 0, w.y).normalize();
    const top = F.w(x, y + h - 0.35, z);
    const rects = this.H.tex.laundry.rects;
    this._quad(top.clone(), dir.clone().multiplyScalar(2.4), new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(-dir.z, 0, dir.x), rects.fukinagashi, '#ffffff', 0.3, 0.5, 6, 1, (u, v) => u * u);
    const sizes = [[2.6, 0.36, 'carp_black'], [2.1, 0.3, 'carp_red'], [1.6, 0.24, 'carp_blue']];
    sizes.forEach(([len, rad, nm], i) => this._carp(top.clone().add(new THREE.Vector3(0, -0.75 - i * 0.85, 0)).addScaledVector(dir, 0.12), dir, len, rad, rects[nm], i * 1.3));
    // ropes
    this.ctx.wires.add([F.w(x, y + h - 0.2, z), F.w(x, y + 1.2, z).add(new THREE.Vector3(0.05, 0, 0))], { width: 0.008, color: '#8a8f96' });
  }
  /** small balcony koinobori set on a bracket pole */
  koinoboriSmall(FF, x, y, z) {
    const { M } = this.H;
    FF.cyl(M.plain, '#e8e4da', 0.02, 1.9, x, y + 0.95, z, { seg: 6, rx: 0.35 });
    const top = FF.w(x, y + 1.75, z + 0.62);
    const w = this.ctx.shared.uWind.value; const dir = new THREE.Vector3(w.x, 0, w.y).normalize();
    const rects = this.H.tex.laundry.rects;
    [[0.8, 0.12, 'carp_black'], [0.65, 0.1, 'carp_red'], [0.5, 0.08, 'carp_blue']].forEach(([len, rad, nm], i) => this._carp(top.clone().add(new THREE.Vector3(0, -0.12 - i * 0.26, 0)), dir, len, rad, rects[nm], i * 1.1 + x));
  }
  build() {
    if (!this.count) return null;
    const ctx = this.ctx;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.S, 4));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.PH, 1));
    g.setIndex(this.P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    const tex = this.H.tex.laundry.texture;
    const inject = (sh) => {
      sh.uniforms.uTime = ctx.shared.uTime; sh.uniforms.uWind = ctx.shared.uWind; sh.uniforms.uGust = ctx.shared.uGust;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 aSway; attribute float aPhase; uniform float uTime; uniform vec2 uWind; uniform float uGust;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          { float w = aSway.w; float g = 0.55 + 0.75 * uGust;
            float s = sin(uTime * 2.1 + aPhase + position.x * 0.9 + position.z * 0.7) * 0.62
                    + sin(uTime * 3.7 + aPhase * 1.7 + position.y * 2.3 + position.x * 1.3) * 0.3;
            transformed += aSway.xyz * s * g * w;
            transformed.xz += uWind * 0.07 * g * w; }`);
    };
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ctx.mat.gradientMap, map: tex, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true });
    mat.onBeforeCompile = inject; mat.customProgramCacheKey = () => 'houses-laundry';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    depth.onBeforeCompile = inject; depth.customProgramCacheKey = () => 'houses-laundry-depth';
    const mesh = new THREE.Mesh(g, mat);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'houses-laundry';
    ctx.noOutline(mesh);
    ctx.add(mesh);
    return mesh;
  }
}
