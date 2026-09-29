// Foam wakes: one instanced quad per moving vessel, shaded analytically in metres (no textures, no tiling):
//   Kelvin arms at 19.47° from the bow, white water hugging the hull, and a turbulent stern wash that widens and
//   decays over ~3 boat lengths. Foam brightness follows the scene light (dim at night) and fades with speed.
import * as THREE from "three";

const vert = /* glsl */ `
attribute vec4 aDims;      // L, B, wake length W, speed01
attribute float aSeed;
varying vec2 vLocal;       // x lateral (m), y = distance aft of the bow (m)
varying vec4 vDims;
varying float vSeed;
void main() {
  float L = aDims.x, B = aDims.y, W = aDims.z;
  float total = L + W;
  float halfW = B * 0.5 + 0.36 * total + 6.0;
  vec3 p = vec3((uv.x * 2.0 - 1.0) * halfW, 0.0, L * 0.5 + 2.0 - uv.y * (total + 2.0));
  vLocal = vec2(p.x, L * 0.5 - p.z);
  vDims = aDims; vSeed = aSeed;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uLight;
uniform vec3 uTint;
varying vec2 vLocal;
varying vec4 vDims;
varying float vSeed;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
void main() {
  float L = vDims.x, B = vDims.y, W = vDims.z, spd = vDims.w;
  float s = vLocal.y, q = abs(vLocal.x);
  if (s < -1.0 || s > L + W) discard;
  // hull half-breadth along the waterline (fine bow, full body, slightly narrower transom)
  float u = clamp(1.0 - s / L, 0.0, 1.0);
  float hull = B * 0.5 * (u > 0.6 ? pow(max(0.0, 1.0 - pow((u - 0.6) / 0.4, 2.0)), 0.62) : 0.9 + 0.1 * smoothstep(0.0, 0.3, u));
  if (s < L && q < hull - 0.15) discard;
  float flow = uTime * (1.2 + 5.0 * spd);
  float n1 = fbm(vec2(vLocal.x * 0.32 + vSeed, (s + flow) * 0.11));
  float n2 = fbm(vec2(vLocal.x * 1.1 - vSeed, (s + flow * 1.3) * 0.45));
  // white water along the hull from the bow
  float along = s < L + 2.0 ? smoothstep(hull + 2.2 + 0.05 * s, hull - 0.1, q) * (0.85 - 0.55 * smoothstep(0.0, L, s)) : 0.0;
  // Kelvin arms
  float arm = B * 0.5 + 0.354 * max(s, 0.0);
  float wdt = 0.9 + 0.035 * s;
  float d = q - arm;
  float kel = exp(-d * d / (2.0 * wdt * wdt)) * exp(-s / (2.6 * L)) * smoothstep(0.0, 6.0, s);
  kel *= 0.55 + 0.7 * n2;
  // feathered cusps inside the arms (the short diagonal crests of a real wake)
  float cusp = max(0.0, sin((s - q * 1.6) * 0.55 + vSeed)) * smoothstep(arm, arm - 6.0, q) * smoothstep(arm - 18.0 - 0.1 * s, arm - 4.0, q) * exp(-s / (1.6 * L)) * 0.35;
  // stern wash: turbulent, widening, long-lived
  float sa = max(0.0, s - L + 1.5);
  float sw = B * 0.36 + 0.085 * sa;
  float wash = smoothstep(sw, sw * 0.25, q) * exp(-sa / (3.2 * L)) * smoothstep(-1.0, 3.0, sa);
  wash *= 0.45 + 0.9 * n1;
  float foam = clamp(max(max(along, kel), max(wash, cusp)), 0.0, 1.0) * spd;
  foam *= smoothstep(0.18, 0.55, foam + 0.25 * n2);
  if (foam < 0.01) discard;
  vec3 col = uTint * mix(0.1, 1.0, uLight);
  gl_FragColor = vec4(col, foam * 0.92);
  #include <colorspace_fragment>
}`;

export function createWakes(max = 48) {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  geo.rotateX(-Math.PI / 2);                                    // uv stays (0..1); positions are rebuilt in the shader
  const dims = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4), seed = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  geo.setAttribute("aDims", dims); geo.setAttribute("aSeed", seed);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uTime: { value: 0 }, uLight: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } },
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.name = "boat-wakes"; mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 2;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3();
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    /** add a wake behind a vessel at (x, y, z) heading `yaw`, length L, beam B, speed 0..1 */
    add(x, y, z, yaw, L, B, speed, s = 0) {
      if (n >= max || speed < 0.02) return;
      q.setFromAxisAngle(up, yaw); p.set(x, y + 0.06, z);
      m4.compose(p, q, one); mesh.setMatrixAt(n, m4);
      dims.setXYZW(n, L, B, L * (2.5 + 3.5 * speed), Math.min(1, speed)); seed.setX(n, s); n++;
    },
    end(time, light, tint) {
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true; dims.needsUpdate = true; seed.needsUpdate = true;
      mat.uniforms.uTime.value = time; mat.uniforms.uLight.value = light; if (tint) mat.uniforms.uTint.value.copy(tint);
    },
  };
}
