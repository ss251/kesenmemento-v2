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
  varying vec3 vCol; varying vec3 vP; varying float vDepth; varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vCol = color;
    vDepth = uLevel - w.y;                       // how far below the waterline the mirrored point sits
    vW = w.xyz;
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
  varying vec3 vCol; varying vec3 vP; varying float vDepth; varying vec3 vW;
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
    float lit = mix(0.7, 0.55, uDusk) * (1.0 - 0.82 * uNight);   // [v3:polish] keep the red and the roof colour  [v3:polish3] darker than the object, never lighter
    // [v3:polish2] the mirror shows the undersides (deck floor, eaves): they are in shade, not lit like the deck top.
    // The screen-space normal of the mirrored surface faces the eye; pointing up = an underside in the real object.
    vec3 nW = normalize(cross(dFdx(vW), dFdy(vW)));
    float under = smoothstep(0.55, 0.9, abs(nW.y));
    lit *= mix(1.0, 0.36, under);
    vec3 col = mix(vCol * lit, uSky * 0.55, 0.18 + 0.2 * uNight);
    col = mix(col, uSky * 0.3, under * 0.3);                        // cool shade under the deck and the eaves
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }`;

// [v3:polish3] A textured material's white base colour stood in for the whole mesh (the dark 浮見堂 stilts reflected as
// white-grey bars): use the map's average tone instead, measured once on an 8x8 downsample and kept on the material.
const _avgCanvas = { c: null };
function mapAverage(m) {
  if (m.userData.avg) return m.userData.avg;
  let out = null;
  try {
    const img = m.map?.image;
    if (img && (img.width || img.naturalWidth) && typeof document !== 'undefined') {
      const cv = _avgCanvas.c || (_avgCanvas.c = document.createElement('canvas')); cv.width = cv.height = 8;
      const g = cv.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, 8, 8); g.drawImage(img, 0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; r += d[i] * a; gg += d[i + 1] * a; b += d[i + 2] * a; w += a; }
      if (w > 0.5) out = new THREE.Color().setRGB(r / w / 255, gg / w / 255, b / w / 255, THREE.SRGBColorSpace);
    } else if (img?.data && img.width) {   // DataTexture (RGBA bytes)
      const d = img.data, st = Math.max(4, Math.floor(d.length / 256 / 4) * 4); let r = 0, gg = 0, b = 0, w = 0;
      for (let i = 0; i + 3 < d.length; i += st) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; w++; }
      if (w) out = new THREE.Color().setRGB(r / w / 255, gg / w / 255, b / w / 255, THREE.SRGBColorSpace);
    }
  } catch { out = null; }
  m.userData.avg = out || REFL_FALLBACK;
  return m.userData.avg;
}
const REFL_FALLBACK = new THREE.Color('#5a4a40');
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;   // linear; 0.6 linear ~ L 0.8 in sRGB
/** True for a boat hull mesh (boats.js tags it): white hulls legitimately mirror pale. */
const isHull = (o) => !!o.userData?.hull;

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
      if (m.map) base.multiply(mapAverage(m));
      // [v3:polish3] a near-white result with nothing else to go on (no vertex colours) is a white default, not paint:
      // mirror it as the dark timber tone (hulls excepted: they really are white)
      const hull = isHull(o);
      if (!C && !hull && lum(base.r, base.g, base.b) > 0.6) base.copy(REFL_FALLBACK);
      const br = base.r, bg = base.g, bb = base.b;
      const n = P.count; if (n > 60000) return;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
        if (v.y < level - 0.05) { /* underwater part mirrors above water: keep, the shader discards it */ }
        pos.push(v.x, 2 * level - v.y, v.z);
        const r = C ? C.getX(i) : 1, gg = C ? C.getY(i) : 1, b = C ? C.getZ(i) : 1;
        let cr = br * r, cg = bg * gg, cb = bb * b;
        if (C && !hull && lum(cr, cg, cb) > 0.6) { cr = REFL_FALLBACK.r; cg = REFL_FALLBACK.g; cb = REFL_FALLBACK.b; }
        col.push(cr, cg, cb);
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
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: true, side: THREE.BackSide, fog: true,   // [v3:polish2] mirroring flips the winding: BackSide culls the faces turned away (the lit deck top floated in the water)
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
