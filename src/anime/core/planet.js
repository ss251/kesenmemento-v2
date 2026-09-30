// [v3:integrate] Tiny-planet overview (V3-SPEC section 9): the whole of Kesennuma bay as a little round world.
// Six 90° views from high over the bay go through the REAL render pipeline (cel shading, outlines, bloom, grading),
// then one full-screen pass folds them into a stereographic "tiny planet" that turns slowly. The six views are
// captured once and again only when the time of day or the season changes, so the mode itself costs one quad.
//
//   const planet = createPlanet({ renderer, pipeline, scene, camera, sky, quality })
//   planet.enter({ at, zoom }) / planet.exit() / planet.toggle() / planet.active / planet.invalidate()
//   planet.render(t)   (main loop, instead of pipeline.render while active)
import * as THREE from 'three';

const FACES = [
  { f: [1, 0, 0], u: [0, 1, 0] }, { f: [-1, 0, 0], u: [0, 1, 0] },
  { f: [0, 1, 0], u: [0, 0, 1] }, { f: [0, -1, 0], u: [0, 0, -1] },
  { f: [0, 0, 1], u: [0, 1, 0] }, { f: [0, 0, -1], u: [0, 1, 0] },
];
/** Default capture point: high over the inner bay, the whole bay and the mountains fold into the ring. */
export const PLANET_AT = [320, 560, 260];

export function createPlanet({ renderer, pipeline, scene, camera, sky, quality, sunDir }) {
  const N = { high: 1024, medium: 768, low: 512 }[quality?.name] ?? 768;
  const faces = FACES.map(() => new THREE.WebGLRenderTarget(N, N, { type: THREE.HalfFloatType, depthBuffer: false }));
  // [v3:fix] faces overlap by 3 deg on every side (96 deg frusta): screen-space outlines and edge clamping never reach
  // the fold, so the cube-face diagonals no longer show as hard cuts
  const FOV = 96, QS = Math.tan(Math.PI / 4) / Math.tan((FOV / 2) * Math.PI / 180);
  const cam = new THREE.PerspectiveCamera(FOV, 1, 1, 30000);
  cam.userData.noSkyFrame = true;   // [v3:polish3] the cube faces see the whole sky: no fitting of the cloud heaps to a frame
  const U = {
    uZoom: { value: 0.44 }, uSpin: { value: 0 }, uAspect: { value: 1 }, uBg: { value: new THREE.Color('#1b2340') },
  };
  const basis = FACES.map((F) => {
    const f = new THREE.Vector3(...F.f), u = new THREE.Vector3(...F.u), r = new THREE.Vector3().crossVectors(f, u);
    return { f, u, r };
  });
  faces.forEach((rt, i) => { U['tF' + i] = { value: rt.texture }; U['uF' + i] = { value: basis[i].f }; U['uR' + i] = { value: basis[i].r }; U['uU' + i] = { value: basis[i].u }; });
  const decl = FACES.map((_, i) => `uniform sampler2D tF${i}; uniform vec3 uF${i}, uR${i}, uU${i};`).join('\n');
  const pick = FACES.map((_, i) => `if (k == ${i}) { vec2 q = vec2(dot(d, uR${i}), dot(d, uU${i})) / dot(d, uF${i}) * ${QS.toFixed(6)}; return texture2D(tF${i}, clamp(q * 0.5 + 0.5, 0.0005, 0.9995)).rgb; }`).join('\n');
  const mat = new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      ${decl}
      uniform float uZoom, uSpin, uAspect; uniform vec3 uBg; varying vec2 vUv;
      vec3 face(vec3 d){
        vec3 a = abs(d); int k;
        if (a.x >= a.y && a.x >= a.z) k = d.x > 0.0 ? 0 : 1; else if (a.y >= a.z) k = d.y > 0.0 ? 2 : 3; else k = d.z > 0.0 ? 4 : 5;
        ${pick}
        return uBg;
      }
      void main(){
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) / uZoom;
        float c = cos(uSpin), s = sin(uSpin);
        p = mat2(c, -s, s, c) * p;
        float r2 = dot(p, p);
        // inverse stereographic projection from the zenith: the ground folds into a ball at the centre
        vec3 d = normalize(vec3(2.0 * p.x, r2 - 1.0, -2.0 * p.y));
        vec3 col = face(d);
        // a soft vignette keeps the eye on the planet
        float v = smoothstep(1.45, 0.35, length((vUv - 0.5) * vec2(uAspect, 1.0)));
        col *= mix(0.78, 1.0, v);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  mat.toneMapped = false;
  const quad = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  quad.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  quad.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const state = { active: false, dirty: true, last: -1e9, at: PLANET_AT.slice(), t0: 0 };
  const _t = new THREE.Vector3();
  function capture(t) {
    const cu = pipeline.compMat.uniforms;
    // [v3:fix] per-face post effects made seams: no vignette, light leak, bloom or glow on the faces (the fold adds its
    // own vignette once); one fog density and one shadow box for all six faces (the fog used to compound x0.45 per face
    // and the shadow box followed each face's view direction)
    const keep = { vig: cu.uVignette?.value, leak: cu.uLeakK?.value, bloom: cu.uBloom?.value, glow: cu.uGlow?.value, fog: scene.fog?.density, size: pipeline.size.clone(), pr: 1 };
    if (cu.uVignette) cu.uVignette.value = 0;
    if (cu.uLeakK) cu.uLeakK.value = 0;
    if (cu.uBloom) cu.uBloom.value = 0;
    if (cu.uGlow) cu.uGlow.value = 0;
    cam.position.set(...state.at); cam.near = 2; cam.far = 30000;
    pipeline.setSize(N, N, 1);
    pipeline.setView?.(state.at[1]);
    sky?.setView?.(state.at[1]); keep.fog = scene.fog?.density;   // fog + shadow box for the capture altitude
    { const b = basis[3]; cam.up.copy(b.u); cam.lookAt(_t.copy(cam.position).add(b.f)); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); sky?.update?.(t, cam); }
    if (scene.fog?.density) scene.fog.density = keep.fog * 0.45;   // thinner haze: the planet's rim stays readable
    for (let i = 0; i < 6; i++) {
      const b = basis[i];
      cam.up.copy(b.u); cam.lookAt(_t.copy(cam.position).add(b.f)); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      pipeline.render(scene, cam, sunDir || new THREE.Vector3(0, 1, 0), t, faces[i]);
    }
    pipeline.setSize(keep.size.x, keep.size.y, 1);
    if (cu.uVignette) cu.uVignette.value = keep.vig;
    if (cu.uLeakK) cu.uLeakK.value = keep.leak;
    if (cu.uBloom) cu.uBloom.value = keep.bloom;
    if (cu.uGlow) cu.uGlow.value = keep.glow;
    if (scene.fog && keep.fog != null) scene.fog.density = keep.fog;
    renderer.setRenderTarget(null);
    state.dirty = false; state.last = performance.now();
  }
  function render(t) {
    if (state.dirty && performance.now() - state.last > 400) capture(t);
    const W = renderer.domElement.width, H = renderer.domElement.height;
    U.uAspect.value = W / Math.max(1, H);
    U.uSpin.value = (t - state.t0) * 0.03;
    renderer.setRenderTarget(null);
    renderer.render(qScene, qCam);
  }
  const api = {
    get active() { return state.active; },
    enter(o = {}) { if (o.at) state.at = o.at.slice(); if (o.zoom) U.uZoom.value = o.zoom; state.active = true; state.dirty = true; state.last = -1e9; state.t0 = o.t ?? 0; return api; },
    exit() { state.active = false; return api; },
    toggle(o) { return state.active ? api.exit() : api.enter(o); },
    invalidate() { state.dirty = true; },
    capture, render, faces, uniforms: U,
    precompile() { try { renderer.compile(qScene, qCam); } catch (e) { /* first render compiles it */ } },   // [v3:fix]
  };
  return api;
}
