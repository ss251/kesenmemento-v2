// [smooth] core/twosided.js: a transparent double-sided mesh becomes the same two passes three.js draws (back faces, then front faces) as
// two geometry groups with two never-changing materials, which read every property of the original.
import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { splitTwoSided as split0 } from '../src/anime/core/twosided.js';
// (the module takes the static batches only; these tests take every mesh)
const splitTwoSided = (root) => split0(root, () => true);

const mk = (o = {}) => new THREE.MeshBasicMaterial({ color: '#336699', transparent: true, side: THREE.DoubleSide, alphaTest: 0.35, ...o });

test('a transparent DoubleSide mesh gets two groups over the same triangles, back then front, sharing the buffers', () => {
  const g = new THREE.BoxGeometry(1, 1, 1); g.clearGroups(); const m = mk(), o = new THREE.Mesh(g, m);
  const root = new THREE.Group(); root.add(o);
  expect(splitTwoSided(root)).toBe(1);
  expect(Array.isArray(o.material)).toBe(true);
  expect(o.material.map((x) => x.side)).toEqual([THREE.BackSide, THREE.FrontSide]);
  expect(o.geometry).not.toBe(g);
  expect(o.geometry.index).toBe(g.index);
  expect(o.geometry.attributes.position).toBe(g.attributes.position);
  expect(o.geometry.groups).toEqual([{ start: 0, count: g.index.count, materialIndex: 0 }, { start: 0, count: g.index.count, materialIndex: 1 }]);
  expect(m.side).toBe(THREE.DoubleSide);   // the original is untouched
  expect(splitTwoSided(root)).toBe(0);   // and never split twice
});

test('the two sides follow the original: a colour, an opacity, a needsUpdate set on it later', () => {
  const m = mk(), o = new THREE.Mesh(new THREE.PlaneGeometry(), m);
  splitTwoSided(o);
  const [b, f] = o.material;
  m.color.set('#ff0000'); m.opacity = 0.4; const v = b.version; m.needsUpdate = true;
  for (const x of [b, f]) { expect(x.color.getHexString()).toBe('ff0000'); expect(x.opacity).toBe(0.4); expect(x.transparent).toBe(true); expect(x.alphaTest).toBe(0.35); }
  expect(b.version).toBe(v + 1);
  expect(b.isMeshBasicMaterial).toBe(true);
});

test('meshes that share a material share its two sides; opaque, single-sided, instanced and grouped meshes are left alone', () => {
  const m = mk(), a = new THREE.Mesh(new THREE.PlaneGeometry(), m), b = new THREE.Mesh(new THREE.PlaneGeometry(), m);
  const opaque = new THREE.Mesh(new THREE.PlaneGeometry(), mk({ transparent: false }));
  const front = new THREE.Mesh(new THREE.PlaneGeometry(), mk({ side: THREE.FrontSide }));
  const single = new THREE.Mesh(new THREE.PlaneGeometry(), mk()); single.material.forceSinglePass = true;
  const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(), mk(), 2);
  const grouped = new THREE.BoxGeometry(); const gm = new THREE.Mesh(grouped, mk());
  const root = new THREE.Group(); root.add(a, b, opaque, front, single, inst, gm);
  expect(splitTwoSided(root)).toBe(2);   // BoxGeometry has groups of its own
  expect(a.material[0]).toBe(b.material[0]);
  expect(a.material[1]).toBe(b.material[1]);
  for (const x of [opaque, front, single, inst, gm]) expect(Array.isArray(x.material)).toBe(false);
});

test('a draw range is kept', () => {
  const g = new THREE.PlaneGeometry(1, 1, 4, 4); g.setDrawRange(6, 12);
  const o = new THREE.Mesh(g, mk());
  splitTwoSided(o);
  expect(o.geometry.groups).toEqual([{ start: 6, count: 12, materialIndex: 0 }, { start: 6, count: 12, materialIndex: 1 }]);
});

test('by default only the static batches are split: a mesh some module holds (a wake, a label) keeps its one material', () => {
  const sb = new THREE.Group(); sb.name = 'static-batched';
  const batched = new THREE.Mesh(new THREE.PlaneGeometry(), mk()); sb.add(batched);
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(), mk());
  const root = new THREE.Group(); root.add(sb, wake);
  expect(split0(root)).toBe(1);
  expect(Array.isArray(batched.material)).toBe(true);
  expect(Array.isArray(wake.material)).toBe(false);
});
