// Render pipeline: normal/depth pre-pass -> MSAA HDR colour pass -> bloom -> composite
// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// [v3:foundation] Kesennuma: outline range scales with the camera altitude (setView), leak strength (uLeakK) and
// night grading (uNight) are driven by the time-of-day core.
// (colour-aware anime outlines, soft glow, grading, light leak, vignette, sRGB).
import * as THREE from 'three';
import { LAYER_NO_OUTLINE } from './materials.js';
import { PHONE } from './tier.js';   // [v4:phone]

const FS_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function fsTriangle() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
}

// [mobile-perf] The outline (inverse-depth laplacian + normal discontinuity) from the pre-pass around vUv: the composite's own, or the edge pass's
// (edgeTex). Needs px, c0, d0 and nd(); leaves `edge`.
const EDGE_BODY = /* glsl */`        vec4 cl = nd(vUv - vec2(px.x,0.0)), cr = nd(vUv + vec2(px.x,0.0)), cu = nd(vUv + vec2(0.0,px.y)), cd = nd(vUv - vec2(0.0,px.y));
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
        float edge = max(dEdge, nEdge * 0.85) * fade * uOutline;`;

export function createRenderPipeline(renderer, quality, { edgeTex = false, fxaa = false } = {}) {   // [mobile-perf] edgeTex: the outlines in their own pass (see below); fxaa: the scene colour anti-aliased in the composite
  const size = new THREE.Vector2();
  const HF = THREE.HalfFloatType;
  const rtColor = new THREE.WebGLRenderTarget(4, 4, { type: HF, samples: quality.msaa ?? 4 });
  const rtND = new THREE.WebGLRenderTarget(4, 4, { type: HF, samples: 0, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const rtB1 = new THREE.WebGLRenderTarget(4, 4, { type: HF });
  const rtB2 = new THREE.WebGLRenderTarget(4, 4, { type: HF });
  const rtB3 = new THREE.WebGLRenderTarget(4, 4, { type: HF });
  const rtB4 = new THREE.WebGLRenderTarget(4, 4, { type: HF });
  // [mobile-perf] On a phone the canvas is finer than the scene's targets (main.js: a 2x canvas over a 1.25x scene), and outlines worked out
  // per output pixel from the nearest pre-pass texel came out as stair-steps 1.6 output pixels tall. With edgeTex the outline is worked out
  // once per scene texel into its own one-byte target and the composite reads it filtered: the same lines, smooth when scaled up, and four
  // fewer pre-pass reads per output pixel.
  const rtEdge = edgeTex ? new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, format: THREE.RedFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }) : null;

  // normal + linear depth override material (handles instancing & skinning through chunks)
  // [v4:explore] and batching: the streamed core tiles are THREE.BatchedMesh pools (explore/sbatch.js)
  const ndMat = new THREE.ShaderMaterial({
    uniforms: { uFar: { value: 2000 } },
    vertexShader: /* glsl */`
      #include <common>
      #include <batching_pars_vertex>
      #include <skinning_pars_vertex>
      varying vec3 vN; varying float vD;
      #ifdef USE_BATCHING_COLOR
        varying float vFade;   // [mobile-perf] a stream slot mid-fade (world/explore/sbatch.js): its outlines switch at the fade's midpoint
      #endif
      void main(){
        #include <batching_vertex>
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vN = normalize(transformedNormal); vD = -mvPosition.z;
        #ifdef USE_BATCHING_COLOR
          vFade = getBatchingColor( getIndirectIndex( gl_DrawID ) ).a;
        #endif
      }`,
    fragmentShader: /* glsl */`
      uniform float uFar; varying vec3 vN; varying float vD;
      #ifdef USE_BATCHING_COLOR
        varying float vFade;
      #endif
      void main(){
        #ifdef USE_BATCHING_COLOR
          // [mobile-perf] not dithered like the colour: a screen door in the normals and depths puts an outline on nearly every pixel of a
          // pole or a sign standing in front of farther things (each kept pixel against a dropped one), a dark grain over the 0.35 s. The
          // outlines go over from the old geometry to the new at half way instead, when the colour is half dissolved.
          if ( vFade < 0.5 ) discard;
        #endif
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; gl_FragColor = vec4(n*0.5+0.5, vD/uFar);
      }`,
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
      tColor: { value: rtColor.texture }, tND: { value: rtND.texture }, tBloom: { value: rtB2.texture }, tBloom2: { value: rtB4.texture }, tEdge: { value: rtEdge ? rtEdge.texture : null },
      uRes: { value: new THREE.Vector2(1, 1) }, uFar: { value: 2000 }, uPx: { value: 1.0 },
      uOutline: { value: 1.0 }, uLine: { value: new THREE.Color('#2e2740') },
      uBloom: { value: 0.32 }, uGlow: { value: 0.14 }, uExposure: { value: 1.0 }, uNeutral: { value: 0 },
      uSunScreen: { value: new THREE.Vector3(0.2, 0.9, 0) }, uLeak: { value: 1.0 }, uTime: { value: 0 },
      uVignette: { value: 0.22 },
      uLineRange: { value: new THREE.Vector2(35, 190) }, uLeakK: { value: 1.0 }, uNight: { value: 0.0 },
      // [v3:polish3] low-lying mist (the 06:30 morning): a height fog hugging the bay and the valley floors; sky.js drives
      // uMist / uMistCol, render() fills the camera terms
      uMist: { value: 0.0 }, uMistCol: { value: new THREE.Color('#d7e5f2') }, uMistH: { value: 26.0 }, uCamY: { value: 0 },
      uWet: { value: 0.0 },   // [live r2] wet asphalt: upward, low-saturation surfaces
      // [v4:polish1] 1 at street level (camera below 40 m above the ground), 0 from 70 m up: less shadow cooling, more
      // saturation on the ground (street frames measured 0.14 mean saturation against the style sheet's 0.21)
      uStreet: { value: 0.0 },
      uInvProj: { value: new THREE.Matrix4() }, uCamRot: { value: new THREE.Matrix3() },
    },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tColor, tND, tBloom, tBloom2, tEdge; uniform vec2 uRes; uniform float uFar, uPx, uOutline, uBloom, uGlow, uExposure, uLeak, uTime, uVignette, uLeakK, uNight, uNeutral; uniform vec2 uLineRange;
      uniform vec3 uLine; uniform vec3 uSunScreen; varying vec2 vUv;
      uniform float uMist, uMistH, uCamY, uWet; uniform vec3 uMistCol; uniform mat4 uInvProj; uniform mat3 uCamRot; uniform float uStreet;
      vec4 nd(vec2 uv){ return texture2D(tND, uv); }
      float lum(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
      vec3 softClip(vec3 c){ vec3 k = vec3(0.78); vec3 over = max(c - k, 0.0); return min(c, k) + (1.0-k) * (1.0 - exp(-over/(1.0-k))); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
#ifdef FXAA
      // [mobile-perf] FXAA (Lottes' console variant, 9 taps) on the scene colour, at the scene's texels: the phone has no MSAA, and its colour edges
      // (cel bands, roofs against the sky) stair-stepped once scaled up to the canvas. Luma on a perceptual proxy of the linear HDR colour.
      float fxL(vec3 c){ return sqrt(max(dot(c, vec3(0.299, 0.587, 0.114)), 0.0)); }
      vec3 fxaaColor(vec2 uv, vec2 r){
        vec3 nw = texture2D(tColor, uv + vec2(-1.0, -1.0) * r).rgb, ne = texture2D(tColor, uv + vec2(1.0, -1.0) * r).rgb;
        vec3 sw = texture2D(tColor, uv + vec2(-1.0, 1.0) * r).rgb, se = texture2D(tColor, uv + vec2(1.0, 1.0) * r).rgb, m = texture2D(tColor, uv).rgb;
        float lNW = fxL(nw), lNE = fxL(ne), lSW = fxL(sw), lSE = fxL(se), lM = fxL(m);
        float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
        if (lMax - lMin < max(0.0312, lMax * 0.125)) return m;   // no edge here: the texel as it is
        vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
        float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
        dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), vec2(-8.0), vec2(8.0)) * r;
        vec3 a = 0.5 * (texture2D(tColor, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tColor, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
        vec3 b = a * 0.5 + 0.25 * (texture2D(tColor, uv - dir * 0.5).rgb + texture2D(tColor, uv + dir * 0.5).rgb);
        float lB = fxL(b);
        return (lB < lMin || lB > lMax) ? a : b;
      }
#endif
      void main(){
        vec2 px = uPx / uRes;
#ifdef FXAA
        vec3 col = fxaaColor(vUv, 1.0 / uRes);
#else
        vec3 col = texture2D(tColor, vUv).rgb;
#endif
        // ---------- outlines (inverse-depth laplacian + normal discontinuity)
        vec4 c0 = nd(vUv);
        float d0 = c0.a * uFar;
#ifdef EDGE_TEX
        float edge = texture2D(tEdge, vUv).r;   // [mobile-perf] worked out per scene texel in the edge pass, read filtered
#else
${EDGE_BODY}
#endif
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
          float far = smoothstep(900.0, 2000.0, dist);   // [live r2] far hills only, never a veil over the town
          float mist = uMist * lowK * far * (1.0 - exp(-dist / 1400.0));
          float band = 0.5 + 0.5 * sin(wy * 0.35 + (uCamRot * pv).x * 0.004 + uTime * 0.05);   // soft painted strata
          col = mix(col, uMistCol, clamp(mist * (0.85 + 0.15 * band), 0.0, 0.28));
        }
        // ---------- exposure / tone
        col *= uExposure;
        col = softClip(col);
        float L = lum(col);
        // cool the shadows (blue-violet), warm the highlights
        // [v4:polish2] drone value 0.55 -> 0.40: from the air the cooled shadows turned the hill roofs grey-lavender
        // (roof dE2000 bias da +5 / db -6 against the aerial photo)
        col = mix(col, col * vec3(0.9, 0.92, 1.1), (1.0 - smoothstep(0.08, 0.55, L)) * mix(0.40, 0.35, uStreet) * (1.0 - 0.75 * uNeutral));   // [v5:detail] uNeutral: the photo look
        col += vec3(0.022, 0.012, -0.012) * smoothstep(0.55, 1.0, L);
        // [v4:polish2] drone white balance: from the air the violet sky fill tinted every roof lavender (roof dE2000 bias
        // da +4.8 / db -5.7 against the GSI aerial photo); a camera-style white balance on the town (not the sky, faded
        // out with distance so the horizon still meets the sky) and none at street level, where the look is tuned
        { float wb = (1.0 - uStreet) * (1.0 - step(uFar * 0.995, d0)) * (1.0 - smoothstep(1500.0, 6000.0, d0));
          col *= mix(vec3(1.0), vec3(0.985, 1.0, 0.93), wb); }
        // gentle saturation lift (stronger at street level), plus [v4:polish1] a street-level vibrance: the near-grey
        // surfaces (asphalt, pastel render) gain colour, the already saturated ones barely move
        float mxc = max(col.r, max(col.g, col.b)), satp = mxc > 1e-4 ? (mxc - min(col.r, min(col.g, col.b))) / mxc : 0.0;
        col = mix(vec3(lum(col)), col, mix(mix(1.07, 1.15, uStreet) + uStreet * 0.5 * (1.0 - satp) * (1.0 - satp), 1.0, uNeutral));
        // [live r2] wet streets: soaked concrete is darker and cooler, with a sky streak down the quay.
        // Flat and grey only, between the waterline and the first roofs, so the bay and the hills stay as painted.
        if (uWet > 0.01) {
          vec4 ndw = nd(vUv);
          float dw = ndw.a * uFar;
          if (dw < 70.0) {
            vec3 vn = ndw.rgb * 2.0 - 1.0;
            vec3 nW = normalize(uCamRot * vn);
            vec4 wr = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vec3 wd = wr.xyz / wr.w;
            vec3 wpv = wd * (dw / max(-wd.z, 1e-4));
            float wy = uCamY + (uCamRot * wpv).y;
            float street = smoothstep(0.2, 0.8, wy) * (1.0 - smoothstep(8.0, 16.0, wy));
            float flatK = smoothstep(0.62, 0.88, nW.y);
            float greyK = 1.0 - smoothstep(0.1, 0.26, satp);
            float wk = uWet * street * flatK * greyK;
            float nearK = 1.0 - smoothstep(12.0, 40.0, dw);
            col = mix(col, col * vec3(0.52, 0.58, 0.64), wk * mix(0.28, 0.78, nearK));
            float streak = exp(-pow((vUv.x - 0.5) * 2.6, 2.0)) * smoothstep(2.2, 8.0, dw) * (1.0 - smoothstep(14.0, 28.0, dw));
            col += vec3(0.68, 0.76, 0.84) * wk * streak * 0.62;
          }
        }
        // ---------- light leak from the sun side
        vec2 asp = vec2(uRes.x/uRes.y, 1.0);
        vec2 sp = uSunScreen.xy;
        float ds = length((vUv - sp) * asp);
        float leak = exp(-ds*ds*1.8) * 0.10 + exp(-ds*ds*10.0) * 0.09 * uSunScreen.z;
        col += vec3(1.0, 0.86, 0.68) * leak * uLeak * uLeakK * (1.0 - uNight) * (0.55 + 0.45*uSunScreen.z) * (1.0 - 0.3 * uStreet);   // [v4:polish1] less wash on foot
        // ---------- vignette
        vec2 q = (vUv - 0.5) * asp * 0.9;
        col *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(q));
        vec3 outc = toSRGB(col);
        outc += (hash(vUv * uRes + fract(uTime)) - 0.5) / 255.0;
        gl_FragColor = vec4(outc, 1.0);
      }`,
    depthTest: false, depthWrite: false,
    defines: { ...(edgeTex ? { EDGE_TEX: '' } : {}), ...(fxaa ? { FXAA: '' } : {}) },
  });
  // [mobile-perf] the edge pass (edgeTex): the composite's outline, once per scene texel, into rtEdge; it shares the composite's uniforms
  const CU = compMat.uniforms;
  const edgeMat = edgeTex ? new THREE.ShaderMaterial({
    uniforms: { tND: CU.tND, uRes: CU.uRes, uFar: CU.uFar, uPx: CU.uPx, uOutline: CU.uOutline, uLineRange: CU.uLineRange },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tND; uniform vec2 uRes; uniform float uFar, uPx, uOutline; uniform vec2 uLineRange; varying vec2 vUv;
      vec4 nd(vec2 uv){ return texture2D(tND, uv); }
      void main(){
        vec2 px = uPx / uRes;
        vec4 c0 = nd(vUv);
        float d0 = c0.a * uFar;
${EDGE_BODY}
        gl_FragColor = vec4(edge, 0.0, 0.0, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  }) : null;

  function setSize(w, h, pr) {
    const W = Math.max(4, Math.floor(w * pr)), H = Math.max(4, Math.floor(h * pr));
    size.set(W, H);
    rtColor.setSize(W, H); rtND.setSize(W, H);
    rtEdge?.setSize(W, H);   // [mobile-perf]
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
    // [v4:phone] outlines fade out by PHONE.lineRange: the pre-pass then skips the cells beyond it
    if (quality?.phone) { const v = compMat.uniforms.uLineRange.value; v.y = Math.min(v.y, PHONE.lineRange); v.x = Math.min(v.x, v.y * 0.4); }
    compMat.uniforms.uStreet.value = 1 - THREE.MathUtils.smoothstep(alt, 40, 70);   // [v4:polish1]
  }

  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }

  const _v = new THREE.Vector3();
  const clearND = new THREE.Color(0.5, 0.5, 1.0);
  // [v3:integrate] the pre-pass draws every object with ONE override material; three.js rebuilds that material's
  // program parameters + cache key whenever consecutive objects differ in instancing / skinning / vertex colours /
  // alpha colours (tens of µs each). Sorting the pre-pass by that variant first (then front-to-back) keeps runs of
  // identical variants together: measured 7.3 -> ~3 ms per frame at 1080p on the hero drone view.
  // [smooth] variant first (and batched meshes are a variant: the streamed tiles' pools): the draw order inside the pre-pass changes nothing
  // drawn but which of two exactly coplanar surfaces writes its normal (pixel A/B in tools/perf/abdiff.mjs: within the frame-to-frame noise),
  // and the switches went from 25 a frame to a handful, each one a program-parameter rebuild in three.js (garbage every frame)
  const variant = (o, g) => (o.isInstancedMesh ? 1 : 0) | (o.isSkinnedMesh ? 2 : 0) | (g && g.attributes.color ? (g.attributes.color.itemSize === 4 ? 8 : 4) : 0) | (o.isInstancedMesh && o.instanceColor ? 16 : 0) | (g && g.morphAttributes && g.morphAttributes.position ? 32 : 0) | (o.isBatchedMesh ? 64 : 0);
  const ndSort = (a, b) => (variant(a.object, a.geometry) - variant(b.object, b.geometry)) || (a.groupOrder - b.groupOrder) || (a.renderOrder - b.renderOrder) || (a.z - b.z) || (a.id - b.id);
  // [v3:fix] distance culling of the static batches (the renderer is draw-call bound): the outline pre-pass skips cells
  // beyond the outline range (lines fade out there anyway), the colour pass skips cells the fog has swallowed
  // (exp2 fog < 1 % visible) and, on the low / medium tiers, cells beyond 3.5 / 6 km. Visibility is restored each frame.
  const CULL_PARENTS = new Set(['static-batched', 'town-mid', 'town-far', 'static-cells', 'static-nd', 'static-shadow']);   // [v4:phone] + core/phonecells.js
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
  // [v4:phone] the shadow map is re-rendered every PHONE.shadowEvery-th frame, and at once when the camera has moved
  // 3 m or the sun has turned (a still drone view then costs no shadow pass); other tiers: every frame
  let shFrame = 0; const shPos = new THREE.Vector3(1e9, 0, 0), shSun = new THREE.Vector3(), _sp = new THREE.Vector3();
  // [v4:phone] core/phonecells.js proxies: { cells, nd, shadow, ndHide: [objects left out of the pre-pass] }
  let proxies = null;
  function setProxies(p) {
    proxies = p;
    if (p?.shadow && !renderer.shadowMap.__phoneWrap) {
      const sm = renderer.shadowMap, base = sm.render;
      sm.render = function (...a) { const sh = proxies?.shadow; if (sh) sh.visible = true; try { return base.apply(this, a); } finally { if (sh) sh.visible = false; } };
      sm.__phoneWrap = true;
    }
  }
  function shadowDue(camera, sunDir, out) {
    if (!quality?.phone || out) return true;
    _sp.setFromMatrixPosition(camera.matrixWorld);
    const due = ++shFrame % PHONE.shadowEvery === 0 || _sp.distanceToSquared(shPos) > 9 || (sunDir && sunDir.distanceToSquared(shSun) > 1e-6);
    if (due) { shPos.copy(_sp); if (sunDir) shSun.copy(sunDir); }
    return due;
  }
  const tierMax = quality?.phone ? PHONE.drawMax : { low: 3500, medium: 6000 }[quality?.name] ?? Infinity;
  // [play:underwater] under the surface nothing past ~25 m shows through the water: the dive caps the colour pass's cull distance
  let viewMax = Infinity;
  function setViewMax(d) { viewMax = d > 0 ? d : Infinity; }
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
    const hid = proxies ? proxies.ndHide.map((o) => o.visible) : null;
    if (proxies) { proxies.cells.visible = false; proxies.nd.visible = true; for (const o of proxies.ndHide) o.visible = false; }
    renderer.render(scene, camera);
    if (proxies) { proxies.cells.visible = true; proxies.nd.visible = false; proxies.ndHide.forEach((o, i) => { o.visible = hid[i]; }); }
    renderer.setOpaqueSort(null);
    scene.overrideMaterial = null; scene.background = bg; scene.fog = fog;
    // 2. colour pass — all layers
    cullTo(camera, Math.min(fogMax, tierMax, viewMax));
    camera.layers.enableAll();
    renderer.shadowMap.needsUpdate = shadowDue(camera, sunDir, out);
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
    // [mobile-perf] the outlines at the scene's resolution, read filtered by the composite (edgeTex)
    if (edgeMat) pass(edgeMat, rtEdge);
    // 4. composite
    _v.copy(sunDir).multiplyScalar(1000).add(camera.position).project(camera);
    const inFront = _v.z < 1 ? 1 : 0;
    const sx = _v.x * 0.5 + 0.5, sy = _v.y * 0.5 + 0.5;
    const onScreen = inFront * (1 - Math.min(1, Math.max(0, Math.hypot(Math.max(0, Math.abs(sx - 0.5) - 0.5), Math.max(0, Math.abs(sy - 0.5) - 0.5)) * 2.5)));
    // light leak stays near the sun side edge even when the sun is off-screen
    compMat.uniforms.uSunScreen.value.set(inFront ? THREE.MathUtils.clamp(sx, -0.3, 1.3) : (sx < 0.5 ? 1.4 : -0.4), inFront ? THREE.MathUtils.clamp(sy, -0.2, 1.3) : 1.2, onScreen);
    compMat.uniforms.uLeak.value = inFront ? 1.0 : 0.25;
    compMat.uniforms.uTime.value = t;
    if (compMat.uniforms.uMist.value > 0.001 || compMat.uniforms.uWet.value > 0.01) { compMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse); compMat.uniforms.uCamRot.value.setFromMatrix4(camera.matrixWorld); compMat.uniforms.uCamY.value = _cp.setFromMatrixPosition(camera.matrixWorld).y; }
    compMat.uniforms.tBloom.value = rtB2.texture; compMat.uniforms.tBloom2.value = rtB4.texture;
    pass(compMat, out);
  }

  /**
   * [v4:polish1] QA: the share of a gw x gh grid of view rays whose first hit (the last pre-pass: linear depth and
   * normal) lies closer than `near` metres. Ground-like hits (world normal up, > 0.6) are not counted: at eye height the
   * pavement is always within a few metres in the lower rows. Used by tools/anime/qa3.mjs on every walk spot.
   */
  const _h = new Uint16Array(4), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
  function nearShare(camera, near = 6, gw = 16, gh = 9) {
    const W = rtND.width, H = rtND.height, f = THREE.DataUtils.fromHalfFloat;
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tx = ty * camera.aspect;
    _m3.setFromMatrix4(camera.matrixWorld);
    let hit = 0, tot = 0;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const u = (i + 0.5) / gw, v = (j + 0.5) / gh;
      renderer.readRenderTargetPixels(rtND, Math.min(W - 1, Math.floor(u * W)), Math.min(H - 1, Math.floor(v * H)), 1, 1, _h);
      const depth = f(_h[3]) * camera.far, x = (u * 2 - 1) * tx, y = (v * 2 - 1) * ty;
      _n.set(f(_h[0]) * 2 - 1, f(_h[1]) * 2 - 1, f(_h[2]) * 2 - 1).applyMatrix3(_m3).normalize();
      tot++;
      if (depth * Math.sqrt(1 + x * x + y * y) < near && _n.y < 0.6) hit++;
    }
    return hit / tot;
  }

  /** [v4:polish3] Distance (m, along the view ray) to the first surface at screen point (u, v) of the last pre-pass
   *  (u, v in 0..1, v = 0 at the top), or Infinity for the sky. qa3's 'place visible' check. */
  function depthAt(camera, u, v) {
    const W = rtND.width, H = rtND.height, f = THREE.DataUtils.fromHalfFloat;
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tx = ty * camera.aspect;
    const px = Math.min(W - 1, Math.max(0, Math.floor(u * W))), py = Math.min(H - 1, Math.max(0, Math.floor((1 - v) * H)));
    renderer.readRenderTargetPixels(rtND, px, py, 1, 1, _h);
    const d = f(_h[3]);
    if (!(d > 0) || d >= 0.9999) return Infinity;
    const x = (u * 2 - 1) * tx, y = (1 - v * 2) * ty;
    return d * camera.far * Math.sqrt(1 + x * x + y * y);
  }

  return { render, setSize, setView, setViewMax, setProxies, compMat, ndMat, targets: { rtColor, rtND, rtEdge }, size, nearShare, depthAt };
}
