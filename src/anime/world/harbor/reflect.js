// [v3:harbor] Painted reflections on the bay: a mirrored copy of a few hero objects (浮見堂, its bridge, the boats
// moored in the inner bay) drawn ON the water surface. The water is an opaque toon plane, so a true mirror would be
// hidden under it; instead the mirrored vertices keep their mirrored screen position but take the depth of the point
// where the eye ray crosses the sea level, so quays, hulls and land in front still occlude them correctly. The
// fragment breaks the image into wobbling horizontal strokes and fades it away from the waterline (anime water, no
// normal maps). One merged mesh + one material per call; no outline pass, no shadows.
import * as THREE from 'three';

const VERT = /* glsl */`
  attribute vec3 color;
  uniform float uLevel;
  varying vec3 vCol; varying vec3 vP; varying float vDepth;
  #include <fog_pars_vertex>
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vCol = color;
    vDepth = uLevel - w.y;                       // how far below the waterline the mirrored point sits
    vec4 clip = projectionMatrix * viewMatrix * w;
    vec3 cam = cameraPosition;
    float t = clamp((cam.y - uLevel - 0.02) / max(cam.y - w.y, 1e-3), 0.0, 1.0);
    vec3 p = cam + (w.xyz - cam) * t;            // the eye ray meets the water here
    vec4 cp = projectionMatrix * viewMatrix * vec4(p, 1.0);
    clip.z = (cp.z / cp.w) * clip.w;
    vP = p;
    gl_Position = clip;
    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    #include <fog_vertex>
  }`;
const FRAG = /* glsl */`
  uniform float uTime, uStrength, uNight, uFade, uDusk;
  uniform vec3 uSky;
  varying vec3 vCol; varying vec3 vP; varying float vDepth;
  #include <fog_pars_fragment>
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  void main() {
    if (vDepth < -0.02) discard;                                   // hull below the waterline: never reflected
    float d = length(vP - cameraPosition);
    // wobbling horizontal strokes (in mirrored height), widening with the distance below the waterline
    float wob = sin(vP.x * 0.55 + vP.z * 0.35 + uTime * 1.1) * 0.35 + sin(vP.x * 1.7 - uTime * 1.9) * 0.12;
    float band = fract(vDepth * mix(2.4, 1.1, clamp(vDepth / 10.0, 0.0, 1.0)) + wob);
    float gap = mix(0.12, 0.42, clamp(vDepth / uFade, 0.0, 1.0));
    if (band < gap) discard;
    float a = uStrength * (1.0 - smoothstep(0.0, uFade, vDepth)) * (1.0 - uNight * 0.35);
    // the mirrored object as the eye sees it: backlit and dimmer at sunset, a dark silhouette at night
    float lit = mix(0.62, 0.36, uDusk) * (1.0 - 0.82 * uNight);
    vec3 col = mix(vCol * lit, uSky * 0.55, 0.34 + 0.2 * uNight);
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }`;

/** Mirror the meshes of `sources` (Object3D[]) about the sea level into one reflection mesh added with ctx.add. */
export function buildReflection(ctx, sources, opts = {}) {
  const level = opts.level ?? ctx.L?.SEA?.level ?? 0;
  const pos = [], col = [];
  const c = new THREE.Color(), v = new THREE.Vector3();
  let tris = 0;
  for (const src of sources) {
    if (!src) continue;
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.transparent || m.alphaTest > 0.01) return;        // decals / cut-outs: skip
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const P = g.attributes.position, C = m.vertexColors ? g.attributes.color : null;
      const base = m.color ? c.copy(m.color) : c.set('#e8e2d6');
      const br = base.r, bg = base.g, bb = base.b;
      const n = P.count; if (n > 60000) return;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
        if (v.y < level - 0.05) { /* underwater part mirrors above water: keep, the shader discards it */ }
        pos.push(v.x, 2 * level - v.y, v.z);
        const r = C ? C.getX(i) : 1, gg = C ? C.getY(i) : 1, b = C ? C.getZ(i) : 1;
        col.push(br * r, bg * gg, bb * b);
      }
      tris += n / 3;
    });
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const sky = ctx.sky?.uniforms;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uLevel: { value: level }, uStrength: { value: opts.strength ?? 0.62 }, uFade: { value: opts.fade ?? 9 },
      uTime: { value: 0 }, uNight: { value: 0 }, uDusk: { value: 0 }, uSky: { value: new THREE.Color('#c9b8c8') },
    }]),
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  // share the live uniforms (time, night, horizon colour)
  if (ctx.shared?.uTime) mat.uniforms.uTime = ctx.shared.uTime;
  if (ctx.shared?.uNight) mat.uniforms.uNight = ctx.shared.uNight;
  if (sky?.uHorizon) mat.uniforms.uSky = sky.uHorizon;
  mat.name = 'harbor-reflection';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = opts.name || 'harbor-reflection'; mesh.renderOrder = 1; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.frustumCulled = false;                                      // depth is rewritten in the vertex shader
  ctx.noOutline(mesh); ctx.noBatch(mesh);
  ctx.add(mesh);
  // follow the tide
  ctx.onUpdate(() => {
    if (ctx.shared?.uDusk && mat.uniforms.uDusk !== ctx.shared.uDusk) mat.uniforms.uDusk = ctx.shared.uDusk;   // life adds it after harbor builds
    if (ctx.shared?.uNight && mat.uniforms.uNight !== ctx.shared.uNight) mat.uniforms.uNight = ctx.shared.uNight;
    const lv = ctx.L?.SEA?.level ?? level; if (lv !== mat.uniforms.uLevel.value) { mesh.position.y = 2 * (lv - level); mat.uniforms.uLevel.value = lv; } });
  return { mesh, tris: Math.round(tris) };
}
