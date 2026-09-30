// Render pipeline: normal/depth pre-pass -> MSAA HDR colour pass -> bloom -> composite
// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// [v3:foundation] Kesennuma: outline range scales with the camera altitude (setView), leak strength (uLeakK) and
// night grading (uNight) are driven by the time-of-day core.
// (colour-aware anime outlines, soft glow, grading, light leak, vignette, sRGB).
import * as THREE from 'three';
import { LAYER_NO_OUTLINE } from './materials.js';

const FS_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function fsTriangle() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
}

export function createRenderPipeline(renderer, quality) {
  const size = new THREE.Vector2();
  const HF = THREE.HalfFloatType;
  const rtColor = new THREE.WebGLRenderTarget(4, 4, { type: HF, samples: quality.msaa ?? 4 });
  const rtND = new THREE.WebGLRenderTarget(4, 4, { type: HF, samples: 0, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const rtB1 = new THREE.WebGLRenderTarget(4, 4, { type: HF });
  const rtB2 = new THREE.WebGLRenderTarget(4, 4, { type: HF });
  const rtB3 = new THREE.WebGLRenderTarget(4, 4, { type: HF });
  const rtB4 = new THREE.WebGLRenderTarget(4, 4, { type: HF });

  // normal + linear depth override material (handles instancing & skinning through chunks)
  const ndMat = new THREE.ShaderMaterial({
    uniforms: { uFar: { value: 2000 } },
    vertexShader: /* glsl */`
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vN; varying float vD;
      void main(){
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vN = normalize(transformedNormal); vD = -mvPosition.z;
      }`,
    fragmentShader: /* glsl */`
      uniform float uFar; varying vec3 vN; varying float vD;
      void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; gl_FragColor = vec4(n*0.5+0.5, vD/uFar); }`,
    side: THREE.DoubleSide,
  });

  const quad = new THREE.Mesh(fsTriangle());
  quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const brightMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uThreshold: { value: 1.05 }, uKnee: { value: 0.5 } },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tSrc; uniform float uThreshold; uniform float uKnee; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tSrc, vUv).rgb;
        float l = max(c.r, max(c.g, c.b));
        float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0*uKnee); soft = soft*soft/(4.0*uKnee+1e-4);
        float w = max(soft, l - uThreshold) / max(l, 1e-4);
        gl_FragColor = vec4(min(c * w, vec3(8.0)), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
      void main(){
        vec3 s = texture2D(tSrc, vUv).rgb * 0.2270270270;
        s += texture2D(tSrc, vUv + uDir*1.3846153846).rgb * 0.3162162162;
        s += texture2D(tSrc, vUv - uDir*1.3846153846).rgb * 0.3162162162;
        s += texture2D(tSrc, vUv + uDir*3.2307692308).rgb * 0.0702702703;
        s += texture2D(tSrc, vUv - uDir*3.2307692308).rgb * 0.0702702703;
        gl_FragColor = vec4(s, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });

  const compMat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: rtColor.texture }, tND: { value: rtND.texture }, tBloom: { value: rtB2.texture }, tBloom2: { value: rtB4.texture },
      uRes: { value: new THREE.Vector2(1, 1) }, uFar: { value: 2000 }, uPx: { value: 1.0 },
      uOutline: { value: 1.0 }, uLine: { value: new THREE.Color('#2e2740') },
      uBloom: { value: 0.32 }, uGlow: { value: 0.14 }, uExposure: { value: 1.0 },
      uSunScreen: { value: new THREE.Vector3(0.2, 0.9, 0) }, uLeak: { value: 1.0 }, uTime: { value: 0 },
      uVignette: { value: 0.22 },
      uLineRange: { value: new THREE.Vector2(35, 190) }, uLeakK: { value: 1.0 }, uNight: { value: 0.0 },
      // [v3:polish3] low-lying mist (the 06:30 morning): a height fog hugging the bay and the valley floors; sky.js drives
      // uMist / uMistCol, render() fills the camera terms
      uMist: { value: 0.0 }, uMistCol: { value: new THREE.Color('#e8d8dc') }, uMistH: { value: 26.0 }, uCamY: { value: 0 },
      uInvProj: { value: new THREE.Matrix4() }, uCamRot: { value: new THREE.Matrix3() },
    },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tColor, tND, tBloom, tBloom2; uniform vec2 uRes; uniform float uFar, uPx, uOutline, uBloom, uGlow, uExposure, uLeak, uTime, uVignette, uLeakK, uNight; uniform vec2 uLineRange;
      uniform vec3 uLine; uniform vec3 uSunScreen; varying vec2 vUv;
      uniform float uMist, uMistH, uCamY; uniform vec3 uMistCol; uniform mat4 uInvProj; uniform mat3 uCamRot;
      vec4 nd(vec2 uv){ return texture2D(tND, uv); }
      float lum(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
      vec3 softClip(vec3 c){ vec3 k = vec3(0.78); vec3 over = max(c - k, 0.0); return min(c, k) + (1.0-k) * (1.0 - exp(-over/(1.0-k))); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
      void main(){
        vec2 px = uPx / uRes;
        vec3 col = texture2D(tColor, vUv).rgb;
        // ---------- outlines (inverse-depth laplacian + normal discontinuity)
        vec4 c0 = nd(vUv);
        float d0 = c0.a * uFar;
        vec4 cl = nd(vUv - vec2(px.x,0.0)), cr = nd(vUv + vec2(px.x,0.0)), cu = nd(vUv + vec2(0.0,px.y)), cd = nd(vUv - vec2(0.0,px.y));
        float i0 = 1.0/max(d0,0.05);
        float il = 1.0/max(cl.a*uFar,0.05), ir = 1.0/max(cr.a*uFar,0.05), iu = 1.0/max(cu.a*uFar,0.05), idn = 1.0/max(cd.a*uFar,0.05);
        float lapX = abs(il + ir - 2.0*i0) / i0, lapY = abs(iu + idn - 2.0*i0) / i0;
        float dEdge = smoothstep(0.06, 0.18, max(lapX, lapY));
        // silhouette against much farther stuff (one-sided)
        float dmin = min(min(cl.a,cr.a),min(cu.a,cd.a))*uFar;
        dEdge = max(dEdge, smoothstep(0.10, 0.25, (d0 - dmin)/max(dmin,0.05)) );
        vec3 n0 = c0.rgb*2.0-1.0;
        float nEdge = 0.0;
        nEdge = max(nEdge, 1.0 - dot(n0, cl.rgb*2.0-1.0));
        nEdge = max(nEdge, 1.0 - dot(n0, cr.rgb*2.0-1.0));
        nEdge = max(nEdge, 1.0 - dot(n0, cu.rgb*2.0-1.0));
        nEdge = max(nEdge, 1.0 - dot(n0, cd.rgb*2.0-1.0));
        nEdge = smoothstep(0.30, 0.65, nEdge);
        float dNear = min(d0, dmin);
        float fade = 1.0 - smoothstep(uLineRange.x, uLineRange.y, dNear);
        float edge = max(dEdge, nEdge * 0.85) * fade * uOutline;
        // colour-aware line: darken & cool the underlying colour rather than paint black
        vec3 lineCol = mix(col * vec3(0.42, 0.38, 0.5), uLine, 0.35);
        col = mix(col, lineCol, edge * 0.82);
        // ---------- bloom & soft glow (anime film diffusion)
        vec3 b1 = texture2D(tBloom, vUv).rgb, b2 = texture2D(tBloom2, vUv).rgb;
        col += b1 * uBloom + b2 * uGlow;
        // ---------- [v3:polish3] low-lying morning mist: world height of this pixel from the depth pre-pass (beyond the
        // outline range there is no depth: a 2.4 km ray, so the far bay and the horizon band sink into the mist too)
        if (uMist > 0.001) {
          vec4 vr = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vec3 vd = vr.xyz / vr.w;
          float dz = d0 < uFar * 0.995 ? d0 : 2400.0;
          vec3 pv = vd * (dz / max(-vd.z, 1e-4));
          float wy = uCamY + (uCamRot * pv).y, dist = length(pv);
          float lowK = 1.0 - smoothstep(-2.0, uMistH, wy);
          float mist = uMist * lowK * (1.0 - exp(-dist / 520.0));
          float band = 0.5 + 0.5 * sin(wy * 0.35 + (uCamRot * pv).x * 0.004 + uTime * 0.05);   // soft painted strata
          col = mix(col, uMistCol, clamp(mist * (0.85 + 0.15 * band), 0.0, 0.85));
        }
        // ---------- exposure / tone
        col *= uExposure;
        col = softClip(col);
        float L = lum(col);
        // cool the shadows (blue-violet), warm the highlights
        col = mix(col, col * vec3(0.9, 0.92, 1.1), (1.0 - smoothstep(0.08, 0.55, L)) * 0.55);
        col += vec3(0.022, 0.012, -0.012) * smoothstep(0.55, 1.0, L);
        // gentle saturation lift
        col = mix(vec3(lum(col)), col, 1.07);
        // ---------- light leak from the sun side
        vec2 asp = vec2(uRes.x/uRes.y, 1.0);
        vec2 sp = uSunScreen.xy;
        float ds = length((vUv - sp) * asp);
        float leak = exp(-ds*ds*1.8) * 0.10 + exp(-ds*ds*10.0) * 0.09 * uSunScreen.z;
        col += vec3(1.0, 0.86, 0.68) * leak * uLeak * uLeakK * (1.0 - uNight) * (0.55 + 0.45*uSunScreen.z);
        // ---------- vignette
        vec2 q = (vUv - 0.5) * asp * 0.9;
        col *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(q));
        vec3 outc = toSRGB(col);
        outc += (hash(vUv * uRes + fract(uTime)) - 0.5) / 255.0;
        gl_FragColor = vec4(outc, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });

  function setSize(w, h, pr) {
    const W = Math.max(4, Math.floor(w * pr)), H = Math.max(4, Math.floor(h * pr));
    size.set(W, H);
    rtColor.setSize(W, H); rtND.setSize(W, H);
    const bw = Math.max(4, W >> 2), bh = Math.max(4, H >> 2);
    rtB1.setSize(bw, bh); rtB2.setSize(bw, bh);
    rtB3.setSize(Math.max(4, W >> 4), Math.max(4, H >> 4)); rtB4.setSize(Math.max(4, W >> 4), Math.max(4, H >> 4));
    compMat.uniforms.uRes.value.set(W, H);
    compMat.uniforms.uPx.value = Math.max(1.0, H / 1100);
  }

  /** Camera height above ground (m): outlines reach farther from the drone so roofs keep their anime lines. */
  function setView(alt) {
    const k = Math.min(14, Math.max(1, alt / 25));
    compMat.uniforms.uLineRange.value.set(35 * k, 190 * k);
  }

  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }

  const _v = new THREE.Vector3();
  const clearND = new THREE.Color(0.5, 0.5, 1.0);
  // [v3:integrate] the pre-pass draws every object with ONE override material; three.js rebuilds that material's
  // program parameters + cache key whenever consecutive objects differ in instancing / skinning / vertex colours /
  // alpha colours (tens of µs each). Sorting the pre-pass by that variant first (then front-to-back) keeps runs of
  // identical variants together: measured 7.3 -> ~3 ms per frame at 1080p on the hero drone view.
  const variant = (o, g) => (o.isInstancedMesh ? 1 : 0) | (o.isSkinnedMesh ? 2 : 0) | (g && g.attributes.color ? (g.attributes.color.itemSize === 4 ? 8 : 4) : 0) | (o.isInstancedMesh && o.instanceColor ? 16 : 0) | (g && g.morphAttributes && g.morphAttributes.position ? 32 : 0);
  const ndSort = (a, b) => (a.groupOrder - b.groupOrder) || (a.renderOrder - b.renderOrder) || (variant(a.object, a.geometry) - variant(b.object, b.geometry)) || (a.z - b.z) || (a.id - b.id);
  // [v3:fix] distance culling of the static batches (the renderer is draw-call bound): the outline pre-pass skips cells
  // beyond the outline range (lines fade out there anyway), the colour pass skips cells the fog has swallowed
  // (exp2 fog < 1 % visible) and, on the low / medium tiers, cells beyond 3.5 / 6 km. Visibility is restored each frame.
  const CULL_PARENTS = new Set(['static-batched', 'town-mid', 'town-far']);
  let cullList = null, cullN = -1;
  const _cp = new THREE.Vector3();
  function cullSetup(scene) {
    const n = scene.children.length;
    if (cullList && n === cullN) return;
    cullN = n; cullList = [];
    scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.parent || !CULL_PARENTS.has(o.parent.name) || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const bs = o.geometry.boundingSphere; if (!bs) return;
      o.updateWorldMatrix(true, false);
      const c = bs.center.clone().applyMatrix4(o.matrixWorld), r = bs.radius * o.matrixWorld.getMaxScaleOnAxis();
      cullList.push({ o, c, r, v: true });
    });
  }
  const tierMax = { low: 3500, medium: 6000 }[quality?.name] ?? Infinity;
  function cullTo(camera, maxD) { _cp.setFromMatrixPosition(camera.matrixWorld); for (const it of cullList) it.o.visible = it.v && it.c.distanceTo(_cp) - it.r < maxD; }
  function render(scene, camera, sunDir, t, out = null) {   // [v3:integrate] out: composite into a render target (tiny planet faces)
    cullSetup(scene);
    for (const it of cullList) it.v = it.o.visible;
    camera.updateMatrixWorld();
    const lineMax = compMat.uniforms.uLineRange.value.y + 80;
    const fogMax = scene.fog?.density ? 2.3 / scene.fog.density : Infinity;
    cullTo(camera, lineMax);
    // 1. normal + depth pre-pass (outline source) — layer 0 only
    ndMat.uniforms.uFar.value = camera.far; compMat.uniforms.uFar.value = camera.far;
    const bg = scene.background, fog = scene.fog;
    scene.background = null; scene.fog = null;
    scene.overrideMaterial = ndMat;
    renderer.shadowMap.autoUpdate = false;
    camera.layers.set(0);
    renderer.setRenderTarget(rtND);
    renderer.setClearColor(clearND, 1.0);
    renderer.clear();
    renderer.setOpaqueSort(ndSort);
    renderer.render(scene, camera);
    renderer.setOpaqueSort(null);
    scene.overrideMaterial = null; scene.background = bg; scene.fog = fog;
    // 2. colour pass — all layers
    cullTo(camera, Math.min(fogMax, tierMax));
    camera.layers.enableAll();
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(rtColor);
    renderer.setClearColor(0xdde9f3, 1.0);
    renderer.clear();
    renderer.render(scene, camera);
    for (const it of cullList) it.o.visible = it.v;   // [v3:fix] restore
    // 3. bloom chain
    brightMat.uniforms.tSrc.value = rtColor.texture; pass(brightMat, rtB1);
    blurMat.uniforms.tSrc.value = rtB1.texture; blurMat.uniforms.uDir.value.set(1 / rtB1.width, 0); pass(blurMat, rtB2);
    blurMat.uniforms.tSrc.value = rtB2.texture; blurMat.uniforms.uDir.value.set(0, 1 / rtB1.height); pass(blurMat, rtB1);
    blurMat.uniforms.tSrc.value = rtB1.texture; blurMat.uniforms.uDir.value.set(1.5 / rtB1.width, 0); pass(blurMat, rtB2);
    // wide glow from the (already blurred) bloom at 1/16
    blurMat.uniforms.tSrc.value = rtB2.texture; blurMat.uniforms.uDir.value.set(1 / rtB3.width, 0); pass(blurMat, rtB3);
    blurMat.uniforms.tSrc.value = rtB3.texture; blurMat.uniforms.uDir.value.set(0, 1 / rtB3.height); pass(blurMat, rtB4);
    blurMat.uniforms.tSrc.value = rtB4.texture; blurMat.uniforms.uDir.value.set(1.6 / rtB3.width, 0); pass(blurMat, rtB3);
    blurMat.uniforms.tSrc.value = rtB3.texture; blurMat.uniforms.uDir.value.set(0, 1.6 / rtB3.height); pass(blurMat, rtB4);
    // 4. composite
    _v.copy(sunDir).multiplyScalar(1000).add(camera.position).project(camera);
    const inFront = _v.z < 1 ? 1 : 0;
    const sx = _v.x * 0.5 + 0.5, sy = _v.y * 0.5 + 0.5;
    const onScreen = inFront * (1 - Math.min(1, Math.max(0, Math.hypot(Math.max(0, Math.abs(sx - 0.5) - 0.5), Math.max(0, Math.abs(sy - 0.5) - 0.5)) * 2.5)));
    // light leak stays near the sun side edge even when the sun is off-screen
    compMat.uniforms.uSunScreen.value.set(inFront ? THREE.MathUtils.clamp(sx, -0.3, 1.3) : (sx < 0.5 ? 1.4 : -0.4), inFront ? THREE.MathUtils.clamp(sy, -0.2, 1.3) : 1.2, onScreen);
    compMat.uniforms.uLeak.value = inFront ? 1.0 : 0.25;
    compMat.uniforms.uTime.value = t;
    if (compMat.uniforms.uMist.value > 0.001) { compMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse); compMat.uniforms.uCamRot.value.setFromMatrix4(camera.matrixWorld); compMat.uniforms.uCamY.value = _cp.setFromMatrixPosition(camera.matrixWorld).y; }
    compMat.uniforms.tBloom.value = rtB2.texture; compMat.uniforms.tBloom2.value = rtB4.texture;
    pass(compMat, out);
  }

  return { render, setSize, setView, compMat, ndMat, targets: { rtColor, rtND }, size };
}
