// Post chain (BUILD-SPEC §2): RenderPass -> GTAOPass (high tier) -> UnrealBloomPass -> grade (vignette, saturation,
// model-mode tilt-shift) -> OutputPass (AgX) -> portal dissolve -> SMAAPass.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.06 }, uVignette: { value: 0.28 }, uTilt: { value: 0 }, uFocus: { value: 0.52 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSat, uVignette, uTilt, uFocus; uniform vec2 uRes; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float blur = uTilt * smoothstep(0.18, 0.5, abs(vUv.y - uFocus));
      if (blur > 0.01) {
        vec3 acc = c.rgb; float w = 1.0; float r = blur * 7.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 2.39996; float d = sqrt(float(i) + 0.5) / 3.5;
          vec2 o = vec2(cos(a), sin(a)) * d * r / uRes;
          acc += texture2D(tDiffuse, vUv + o).rgb; w += 1.0;
        }
        c.rgb = acc / w;
      }
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(mix(vec3(l), c.rgb, uSat), 0.0);
      vec2 q = vUv - 0.5; c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
      gl_FragColor = c;
    }`,
};

// Dissolve between the gallery (portal) image and the city: noise-thresholded mask with a warm rim.
const PortalShader = {
  uniforms: { tDiffuse: { value: null }, tPortal: { value: null }, uMix: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tPortal; uniform float uMix; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main(){
      vec4 city = texture2D(tDiffuse, vUv);
      if (uMix <= 0.0) { gl_FragColor = city; return; }
      vec4 portal = texture2D(tPortal, vUv);
      if (uMix >= 1.0) { gl_FragColor = portal; return; }
      vec2 a = vec2(uRes.x / uRes.y, 1.0);
      float radial = length((vUv - 0.5) * a) / 0.9;                // the city opens from the centre of the model outward
      float k = radial * 0.82 + (n(vUv * a * 38.0) * 0.6 + n(vUv * a * 9.0) * 0.4) * 0.18;
      float t = 1.0 - uMix;                                        // 0 -> all portal, 1 -> all city
      float edge = t * 1.15;
      float m = smoothstep(edge - 0.035, edge + 0.035, k);        // 1 where the portal still shows
      float rim = exp(-pow((k - edge) / 0.03, 2.0)) * step(0.001, t) * step(t, 0.999);
      vec3 c = mix(city.rgb, portal.rgb, m) + vec3(1.0, 0.86, 0.66) * rim * 0.22;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, tier) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: tier.smaa ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  let gtao = null;
  if (tier.gtao) {
    gtao = new GTAOPass(scene, camera, size.x, size.y);
    gtao.output = GTAOPass.OUTPUT.Default;             // Default = scene blended with denoised AO (Denoise is a debug view)
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.4, thickness: 3, scale: 1, distanceFallOff: 1 });
    gtao.setSize(Math.round(size.x * 0.5), Math.round(size.y * 0.5));      // GTAO at half resolution (spec, M2 only)
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * tier.bloomScale, size.y * tier.bloomScale), 0.08, 0.35, 1.8);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader); composer.addPass(grade);
  const output = new OutputPass(); composer.addPass(output);
  const portal = new ShaderPass(PortalShader); portal.enabled = false; composer.addPass(portal);
  let smaa = null;
  if (tier.smaa) { smaa = new SMAAPass(); composer.addPass(smaa); }
  const setSize = (w, h, dpr) => {
    composer.setPixelRatio(dpr); composer.setSize(w, h);
    const px = new THREE.Vector2(w * dpr, h * dpr);
    grade.uniforms.uRes.value.copy(px); portal.uniforms.uRes.value.copy(px);
    if (gtao) gtao.setSize(Math.round(px.x * 0.5), Math.round(px.y * 0.5));
  };
  return { composer, renderPass, gtao, bloom, grade, output, portal, smaa, setSize };
}

/** A lighter composer for the gallery: render -> bloom -> output, drawn into its own target for the dissolve. */
export function createGalleryPost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.12, 0.6, 0.9); composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader); grade.uniforms.uVignette.value = 0.38; composer.addPass(grade);
  const output = new OutputPass(); composer.addPass(output);
  const setSize = (w, h, dpr) => { composer.setPixelRatio(dpr); composer.setSize(w, h); grade.uniforms.uRes.value.set(w * dpr, h * dpr); };
  return { composer, bloom, grade, output, setSize };
}
