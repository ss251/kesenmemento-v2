// Vendored from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station). [v3:foundation] first-look only; town owns buildings.
// Far town (L.FAR_TOWN): dense low-detail houses (instanced bodies + roofs with eaves) and a few
// small apartment blocks and garden trees so the horizon reads as a continuous town.
import * as THREE from 'three';
import { PAL } from './lot.js';

export function unitGable() {
  // triangular prism along x with eaves overhang baked in: base spans z in [-0.5,0.5] at y=0, ridge at y=1
  const o = 0.09; // relative eave overhang
  const g = new THREE.BufferGeometry();
  const P = [], N = [], I = [];
  const quad = (a, b, c, d, n) => { const k = P.length / 3; P.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) N.push(...n); I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  const tri = (a, b, c, n) => { const k = P.length / 3; P.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) N.push(...n); I.push(k, k + 1, k + 2); };
  const e = -0.5 - o, E = 0.5 + o, yE = -o * 1.0, t = 0.06;
  const n1 = new THREE.Vector3(0, 0.5 + o, 1).normalize(), n2 = new THREE.Vector3(0, 0.5 + o, -1).normalize();
  quad([E, yE, E], [E, 1, 0], [e, 1, 0], [e, yE, E], [n1.x, n1.y, n1.z].map((v, i) => i === 2 ? n1.z : v));
  quad([e, yE, e], [e, 1, 0], [E, 1, 0], [E, yE, e], [n2.x, n2.y, n2.z]);
  // eave edge thickness (fascia)
  quad([e, yE, E], [e, yE - t, E], [E, yE - t, E], [E, yE, E], [0, 0, 1]);
  quad([E, yE, e], [E, yE - t, e], [e, yE - t, e], [e, yE, e], [0, 0, -1]);
  // gable triangles (wall-coloured by the same instance colour; fine at distance)
  tri([0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1 - o * 1.2, 0], [1, 0, 0]);
  tri([-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1 - o * 1.2, 0], [-1, 0, 0]);
  // underside
  quad([e, yE - t, E], [e, yE - t, e], [E, yE - t, e], [E, yE - t, E], [0, -1, 0]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  // fix winding to match normals
  const pos = g.attributes.position, nor = g.attributes.normal, idx = g.index.array;
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    va.fromBufferAttribute(pos, idx[i]); vb.fromBufferAttribute(pos, idx[i + 1]); vc.fromBufferAttribute(pos, idx[i + 2]);
    nn.crossVectors(vb.sub(va), vc.sub(va));
    const n0 = new THREE.Vector3().fromBufferAttribute(nor, idx[i]);
    if (nn.dot(n0) < 0) { const t2 = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t2; }
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2));
  return g;
}
export function unitHip() {
  const g = new THREE.BufferGeometry();
  const o = 0.09, E = 0.5 + o, yE = -o, rl = 0.18;
  const P = [], I = [];
  const add = (...pts) => { const k = P.length / 3; for (const p of pts) P.push(...p); if (pts.length === 4) I.push(k, k + 1, k + 2, k, k + 2, k + 3); else I.push(k, k + 1, k + 2); };
  add([-E, yE, E], [E, yE, E], [rl, 1, 0], [-rl, 1, 0]);
  add([E, yE, -E], [-E, yE, -E], [-rl, 1, 0], [rl, 1, 0]);
  add([E, yE, E], [E, yE, -E], [rl, 1, 0]);
  add([-E, yE, -E], [-E, yE, E], [-rl, 1, 0]);
  add([-E, yE - 0.05, E], [-E, yE - 0.05, -E], [E, yE - 0.05, -E], [E, yE - 0.05, E]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  // make sure faces point outward (flip if normal points toward centre)
  const pos = ng.attributes.position;
  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i), b = new THREE.Vector3().fromBufferAttribute(pos, i + 1), c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    const m = a.clone().add(b).add(c).multiplyScalar(1 / 3); m.y -= 0.3;
    if (n.dot(m) < 0) { pos.setXYZ(i + 1, c.x, c.y, c.z); pos.setXYZ(i + 2, b.x, b.y, b.z); }
  }
  ng.computeVertexNormals();
  ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
  return ng;
}

export function buildFarTown(H) {
  const { ctx, L } = H;
  const r = ctx.rng('houses-far');
  const T = ctx.tex;
  // facade textures per storey count (UVs span the whole face incl. 0.4 m below ground): framed
  // sliding windows with sills, a shutter box, a floor band, grey foundation and a soft eave shadow.
  const facade = (floors) => T.draw(256, 256, (g, w, h) => {
    const total = floors * 2.85 + 0.45 + 0.4, m = h / total; // metres -> px (y from the bottom)
    const Y = (mv) => h - mv * m;
    g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, w, h);
    // soft wash
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(210,204,194,0.10)'; g.beginPath(); g.ellipse((i * 67) % w, (i * 41) % h, 30 + (i % 4) * 9, 18 + (i % 3) * 8, 0, 0, 7); g.fill(); }
    // foundation
    g.fillStyle = '#b2afa8'; g.fillRect(0, Y(0.85), w, 0.85 * m);
    g.fillStyle = 'rgba(70,70,80,0.35)'; g.fillRect(0, Y(0.85) - 2, w, 2);
    const win = (cx, wv, y0, hv, shutter) => { // cx, wv as fraction of width; y0/hv metres
      const x0 = (cx - wv / 2) * w, ww = wv * w, yt = Y(y0 + hv), hh = hv * m;
      if (shutter) { g.fillStyle = '#a9a59d'; g.fillRect(x0 + ww, yt - 3, ww * 0.5, hh + 6); g.fillStyle = 'rgba(80,80,90,0.35)'; for (let k = yt; k < yt + hh; k += 5) g.fillRect(x0 + ww, k, ww * 0.5, 1); }
      g.fillStyle = '#5a5652'; g.fillRect(x0 - 3, yt - 3, ww + 6, hh + 6);
      const gr = g.createLinearGradient(x0, yt, x0 + ww, yt + hh); gr.addColorStop(0, '#9fb2c6'); gr.addColorStop(1, '#6f8196');
      g.fillStyle = gr; g.fillRect(x0, yt, ww, hh);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x0 + ww * 0.15, yt + hh); g.lineTo(x0 + ww * 0.4, yt + hh); g.lineTo(x0 + ww * 0.75, yt); g.lineTo(x0 + ww * 0.5, yt); g.fill();
      g.fillStyle = 'rgba(235,232,225,0.55)'; g.fillRect(x0, yt, ww * 0.18, hh); // curtain
      g.fillStyle = '#5a5652'; g.fillRect(x0 + ww / 2 - 1.5, yt, 3, hh);
      g.fillStyle = '#dcd8cf'; g.fillRect(x0 - 5, yt + hh + 3, ww + 10, 3); // sill
    };
    for (let f = 0; f < floors; f++) {
      const fy = 0.85 + f * 2.85;
      if (f > 0) { g.fillStyle = 'rgba(90,86,82,0.45)'; g.fillRect(0, Y(fy) - 2, w, 4); }
      if (f === 0) { win(0.3, 0.34, fy + 0.15, 1.8, true); win(0.78, 0.16, fy + 1.0, 0.75, false); }
      else { win(0.25, 0.24, fy + 0.8, 1.15, f === 1); win(0.68, 0.24, fy + 0.8, 1.15, false); }
    }
    // eave shadow
    const eg = g.createLinearGradient(0, 0, 0, h * 0.07); eg.addColorStop(0, 'rgba(70,66,80,0.45)'); eg.addColorStop(1, 'rgba(70,66,80,0)');
    g.fillStyle = eg; g.fillRect(0, 0, w, h * 0.07);
  }, { key: 'houses_farfacade' + floors });
  const mWallF = [1, 2, 3].map(fl => ctx.mat.toon('#ffffff', { map: facade(fl), paint: 0.05 }));
  const aptTex = T.draw(128, 128, (g, w, h) => {
    g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, w, h);
    for (let f = 0; f < 4; f++) { const y = f * 32; g.fillStyle = '#76808f'; for (let k = 0; k < 4; k++) g.fillRect(6 + k * 31, y + 8, 20, 16); g.fillStyle = 'rgba(90,90,100,0.5)'; g.fillRect(0, y + 28, w, 4); }
  }, { key: 'houses_farapt' });
  const mApt = ctx.mat.toon('#ffffff', { map: aptTex, paint: 0.05 });
  const mRoof = ctx.mat.toon('#ffffff', { paint: 0.05 });
  const mTree = ctx.mat.toon('#ffffff', { paint: 0.07 });
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const gable = unitGable(), hip = unitHip();
  const tree = new THREE.IcosahedronGeometry(0.5, 1);
  const items = { body1: [], body2: [], body3: [], gable: [], hip: [], apt: [], aptRoof: [], tree: [] };
  const wallCols = [...PAL.plaster, ...PAL.paint, ...PAL.siding, ...PAL.tile, '#e9e1cf', '#f0ece2'];
  const roofCols = [...PAL.kawara, ...PAL.kawara, ...PAL.metal];
  const treeCols = ['#6f9a5a', '#5f8c5c', '#7aa564', '#4f7a52', '#86ad6a'];
  const mat4 = (x, y, z, ry, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
  const skipRoad = (x, z) => (z > 128 && x > -2 && x < 16) || (z > 128 && Math.abs(z - 170) < 4) || (Math.abs(x) > 95 && Math.abs(z - 40) < 4) || (Math.abs(x) > 95 && Math.abs(x) % 90 < 5 && false);
  for (const R of L.FAR_TOWN) {
    const cw = 11.5, cd = 11;
    for (let x = R.x0 + cw / 2; x < R.x1 - 3; x += cw) {
      for (let z = R.z0 + cd / 2; z < R.z1 - 3; z += cd) {
        // lanes every few cells
        const ix = Math.round((x - R.x0) / cw), iz = Math.round((z - R.z0) / cd);
        if (ix % 5 === 2 || iz % 6 === 3) { if (r() < 0.12) items.tree.push([x + (r() - 0.5) * 6, z + (r() - 0.5) * 6, 2 + r() * 2.5]); continue; }
        if (z < -82 || skipRoad(x, z)) continue;
        if (r() < 0.07) { items.tree.push([x, z, 3 + r() * 3]); items.tree.push([x + 3, z - 2, 2.5 + r() * 2]); continue; }
        const px = x + (r() - 0.5) * 2.4, pz = z + (r() - 0.5) * 2.2;
        const ry = (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.12;
        const dist = Math.min(Math.abs(Math.abs(px) - 95), R.z0 > 100 ? Math.abs(pz - 131) : 99);
        const w = 6.5 + r() * 2.8, d = 6 + r() * 2.2;
        const gH = Math.min(L.heightAt(px - 3, pz - 3), L.heightAt(px + 3, pz + 3), L.heightAt(px, pz));
        const apt = r() < 0.06;
        if (apt) {
          const fl = 3 + Math.floor(r() * 2), hh = fl * 2.9, aw = 14 + r() * 6, ad = 8 + r() * 2;
          items.apt.push([px, gH - 0.3, pz, ry, aw, hh + 0.3, ad, r.pick(['#e9e1cf', '#dcd6c8', '#e4e0d6', '#d6dde0'])]);
          items.aptRoof.push([px, gH + hh, pz, ry, aw + 0.3, 0.45, ad + 0.3, '#9d9c96']);
          continue;
        }
        const fl = r() < 0.12 ? 1 : r() < 0.9 ? 2 : 3;
        const hh = fl * 2.85 + 0.45;
        const wc = r.pick(wallCols), rc = r.pick(roofCols);
        items['body' + fl].push([px, gH - 0.4, pz, ry, w, hh + 0.4, d, wc]);
        const hipR = r() < 0.5;
        const pitch = 0.42 + r() * 0.12;
        (hipR ? items.hip : items.gable).push([px, gH + hh, pz, ry, w, (Math.min(w, d) / 2 + 0.4) * pitch, d, rc]);
        // 1F wing
        if (fl >= 2 && r() < 0.4) {
          const ww = w * 0.45, wd = 2.6 + r() * 1.2;
          const c = Math.cos(ry), s = Math.sin(ry);
          const ox = (r() < 0.5 ? -1 : 1) * (w / 2 - ww / 2), oz = d / 2 + wd / 2 - 0.2;
          const wx = px + ox * c + oz * s, wz = pz - ox * s + oz * c;
          items.body1.push([wx, gH - 0.4, wz, ry, ww, 3.3 + 0.4, wd, wc]);
          items.hip.push([wx, gH + 3.3, wz, ry, ww, 0.9, wd, rc]);
        }
        if (r() < 0.25) items.tree.push([px + (r() - 0.5) * w * 1.6, pz + d / 2 + 1.8, 2.2 + r() * 1.8]);
      }
    }
  }
  const out = [];
  const inst = (geo, mat, list, colIdx, noShadow) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const col = new THREE.Color();
    list.forEach((q, i) => { m.setMatrixAt(i, mat4(q[0], q[1], q[2], q[3], q[4], q[5], q[6])); col.set(q[colIdx]); m.setColorAt(i, col); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere(); m.computeBoundingBox?.();
    m.castShadow = !noShadow; m.receiveShadow = true;
    m.name = 'houses-far';
    ctx.addStatic(m);
    out.push(m);
  };
  inst(box, mWallF[0], items.body1, 7); inst(box, mWallF[1], items.body2, 7); inst(box, mWallF[2], items.body3, 7);
  inst(gable, mRoof, items.gable, 7);
  inst(hip, mRoof, items.hip, 7);
  inst(box, mApt, items.apt, 7);
  inst(box, mRoof, items.aptRoof, 7);
  // trees
  const tl = items.tree.map(([x, z, s]) => { const g = L.heightAt(x, z); return [x, g + s * 0.55, z, r() * 6, s * 1.1, s * 0.95, s * 1.1, r.pick(treeCols)]; });
  inst(tree, mTree, tl, 7);
  const trunks = items.tree.map(([x, z, s]) => [x, L.heightAt(x, z) - 0.2, z, 0, 0.25, s * 0.35, 0.25, '#6e5646']);
  inst(box, mRoof, trunks, 7, true);
  return { count: items.body1.length + items.body2.length + items.body3.length + items.apt.length, meshes: out };
}
