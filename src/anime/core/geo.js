// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Geometry helpers + the shared overhead-wire system.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYER_NO_OUTLINE } from './materials.js';

const _geoCache = new Map();
function cached(key, make) { if (!_geoCache.has(key)) _geoCache.set(key, make()); return _geoCache.get(key); }

/** Shared unit geometries (reuse = less memory). Scale meshes instead of making new boxes. */
export const G = {
  box: () => cached('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (seg = 12) => cached('cyl' + seg, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg)),
  plane: () => cached('plane', () => new THREE.PlaneGeometry(1, 1)),
  sphere: (seg = 12) => cached('sph' + seg, () => new THREE.SphereGeometry(0.5, seg, Math.max(6, seg * 0.66 | 0))),
  rbox: (r = 0.1, seg = 2) => cached('rbox' + r + '|' + seg, () => new RoundedBoxGeometry(1, 1, 1, seg, r)),
};

/** Kit: terse placement helpers bound to a parent group.
 *  All sizes in meters; pos = [x,y,z] is the CENTER of the shape unless noted; rot = [rx,ry,rz] radians. */
export function makeKit(parent) {
  const place = (mesh, pos, rot, scale) => {
    if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  return {
    parent,
    /** axis-aligned box of size w×h×d centered at pos */
    box(w, h, d, mat, pos, rot) { return place(new THREE.Mesh(G.box(), mat), pos, rot, [w, h, d]); },
    /** box whose BOTTOM face sits at pos[1] */
    boxB(w, h, d, mat, pos, rot) { return place(new THREE.Mesh(G.box(), mat), [pos[0], pos[1] + h / 2, pos[2]], rot, [w, h, d]); },
    /** rounded box (radius r relative to unit cube, so keep r <= 0.5; it is scaled with the box) */
    rbox(w, h, d, r, mat, pos, rot) {
      const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
      return place(new THREE.Mesh(geo, mat), pos, rot);
    },
    /** cylinder along Y centred at pos */
    cyl(rTop, rBot, h, mat, pos, rot, seg = 12) {
      if (rTop === rBot) return place(new THREE.Mesh(G.cyl(seg), mat), pos, rot, [rTop * 2, h, rTop * 2]);
      return place(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat), pos, rot);
    },
    sphere(r, mat, pos, seg = 12) { return place(new THREE.Mesh(G.sphere(seg), mat), pos, null, [r * 2, r * 2, r * 2]); },
    /** plane of w×h facing +Z (rotate to orient) */
    plane(w, h, mat, pos, rot) { const m = place(new THREE.Mesh(G.plane(), mat), pos, rot, [w, h, 1]); m.castShadow = false; return m; },
    mesh(geo, mat, pos, rot, scale) { return place(new THREE.Mesh(geo, mat), pos, rot, scale); },
    group(pos, rotY = 0) { const g = new THREE.Group(); if (pos) g.position.set(pos[0], pos[1], pos[2]); g.rotation.y = rotY; parent.add(g); return g; },
  };
}

/** Extrude a 2D outline (array of [x,y]) along +Z by depth. Useful for roofs, gables, signs. */
export function extrude(points, depth, opts = {}) {
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], p[1])));
  if (opts.holes) for (const h of opts.holes) shape.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!opts.bevel, bevelSize: opts.bevel || 0, bevelThickness: opts.bevel || 0, bevelSegments: 1, curveSegments: opts.curveSegments || 6 });
  if (opts.center !== false) g.translate(0, 0, -depth / 2);
  return g;
}

/** Points along a sagging wire between a and b (THREE.Vector3 or [x,y,z]). sag = drop at midspan (m). */
export function catenary(a, b, sag = 0.4, segments = 14) {
  const A = Array.isArray(a) ? new THREE.Vector3(...a) : a, B = Array.isArray(b) ? new THREE.Vector3(...b) : b;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = new THREE.Vector3().lerpVectors(A, B, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

export { mergeGeometries };

/** Merge many meshes' geometries (same material) into one geometry in parent space. */
export function mergeMeshes(meshes) {
  const geos = meshes.map(m => { m.updateMatrix(); const g = m.geometry.clone(); g.applyMatrix4(m.matrix); return g; });
  return mergeGeometries(geos, false);
}

// ---------------------------------------------------------------------------------------------
//  Wires: screen-space-aware ribbons. Width is `width` meters but never thinner than ~1.1 px,
//  and sub-pixel wires fade by coverage instead of aliasing. One draw call for all wires.
//  Usage (any module):  ctx.wires.add(points, { width: 0.02, color: '#34303a' })
// ---------------------------------------------------------------------------------------------
export function createWireSystem() {
  const lists = []; // {pts, width, color}
  let mesh = null;

  function add(points, opts = {}) {
    const pts = points.map(p => (Array.isArray(p) ? new THREE.Vector3(...p) : p.clone()));
    if (pts.length < 2) return;
    lists.push({ pts, width: opts.width ?? 0.02, color: new THREE.Color(opts.color ?? '#3a3640') });
  }

  function build(uniforms) {
    let nSeg = 0; for (const l of lists) nSeg += l.pts.length - 1;
    if (!nSeg) return null;
    const A = new Float32Array(nSeg * 4 * 3), B = new Float32Array(nSeg * 4 * 3);
    const S = new Float32Array(nSeg * 4 * 2), W = new Float32Array(nSeg * 4), C = new Float32Array(nSeg * 4 * 3);
    const idx = new Uint32Array(nSeg * 6);
    let v = 0, k = 0;
    for (const l of lists) {
      for (let i = 0; i < l.pts.length - 1; i++) {
        const a = l.pts[i], b = l.pts[i + 1];
        const corners = [[0, -1], [0, 1], [1, 1], [1, -1]];
        for (let j = 0; j < 4; j++) {
          A.set([a.x, a.y, a.z], (v + j) * 3); B.set([b.x, b.y, b.z], (v + j) * 3);
          S.set(corners[j], (v + j) * 2); W[v + j] = l.width; C.set([l.color.r, l.color.g, l.color.b], (v + j) * 3);
        }
        idx.set([v, v + 1, v + 2, v, v + 2, v + 3], k);
        v += 4; k += 6;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(A, 3)); // = a (used for bounds)
    g.setAttribute('pb', new THREE.BufferAttribute(B, 3));
    g.setAttribute('side', new THREE.BufferAttribute(S, 2));
    g.setAttribute('wwidth', new THREE.BufferAttribute(W, 1));
    g.setAttribute('wcolor', new THREE.BufferAttribute(C, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    // bounding sphere from both ends
    const bb = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
    bb.union(new THREE.Box3().setFromBufferAttribute(g.attributes.pb));
    g.boundingSphere = bb.getBoundingSphere(new THREE.Sphere());
    g.boundingBox = bb;

    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uRes: { value: new THREE.Vector2(1920, 1080) }, uMinPx: { value: 1.15 } }]),
      vertexShader: /* glsl */`
        #include <common>
        #include <fog_pars_vertex>
        attribute vec3 pb; attribute vec2 side; attribute float wwidth; attribute vec3 wcolor;
        uniform vec2 uRes; uniform float uMinPx;
        varying vec3 vColor; varying float vCov;
        void main(){
          // clip the segment against the near plane in view space (prevents huge smeared quads
          // when one end of a wire is behind the camera)
          vec4 va = viewMatrix * vec4(position, 1.0);
          vec4 vb = viewMatrix * vec4(pb, 1.0);
          float nearZ = -(projectionMatrix[3][2] / (projectionMatrix[2][2] - 1.0)) * 1.05;
          if (va.z > nearZ && vb.z > nearZ) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vColor = wcolor; vCov = 0.0; return; }
          if (va.z > nearZ) va = mix(vb, va, (vb.z - nearZ) / (vb.z - va.z));
          if (vb.z > nearZ) vb = mix(va, vb, (va.z - nearZ) / (va.z - vb.z));
          vec3 P = mix(position, pb, side.x);
          vec4 ca = projectionMatrix * va;
          vec4 cb = projectionMatrix * vb;
          vec4 cp = side.x < 0.5 ? ca : cb;
          vec2 sa = ca.xy / max(ca.w,1e-4) * uRes * 0.5;
          vec2 sb = cb.xy / max(cb.w,1e-4) * uRes * 0.5;
          vec2 dir = normalize(sb - sa + vec2(1e-5, 0.0));
          vec2 nrm = vec2(-dir.y, dir.x);
          // projected width in pixels of a wire (wwidth meters thick) at this depth
          float pxWorld = wwidth * projectionMatrix[1][1] * uRes.y * 0.5 / max(cp.w, 1e-3);
          float px = max(pxWorld, uMinPx);
          vCov = clamp(pxWorld / uMinPx, 0.18, 1.0);
          vec2 off = nrm * side.y * px * 0.5;
          cp.xy += off / (uRes * 0.5) * cp.w;
          gl_Position = cp;
          vColor = wcolor;
          vec4 mvPosition = viewMatrix * vec4(P, 1.0);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <fog_pars_fragment>
        varying vec3 vColor; varying float vCov;
        void main(){
          gl_FragColor = vec4(vColor, vCov);
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.layers.set(LAYER_NO_OUTLINE);
    mesh.userData.noBatch = true;
    mesh.renderOrder = 2;
    mesh.name = 'wires';
    return mesh;
  }

  function setResolution(w, h) { if (mesh) mesh.material.uniforms.uRes.value.set(w, h); }
  return { add, build, setResolution, get count() { return lists.length; }, lists };
}
