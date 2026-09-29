// Navigation and deck lights as HDR glow points (they feed the night bloom). Sidelights are directional like the
// real lanterns: red (port) and green (starboard) show over 112.5° from dead ahead, the stern light over 135° aft,
// the masthead light forward over 225°; deck floodlights are omnidirectional and warm.
import * as THREE from "three";

const vert = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aDir;        // xyz = light's facing (world), w = cos(half arc); w <= -1 = omni
attribute float aSize;      // world diameter (m)
uniform float uScale;       // viewport height in px / (2 tan(fov/2))
uniform float uOn;
varying vec3 vColor;
varying float vVis;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * wp;
  vec3 toCam = normalize(cameraPosition - wp.xyz);
  float vis = aDir.w <= -1.0 ? 1.0 : smoothstep(aDir.w - 0.06, aDir.w + 0.04, dot(normalize(aDir.xyz), toCam));
  vVis = vis * uOn;
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
  float px = aSize * uScale / max(1.0, -mv.z);
  gl_PointSize = clamp(px * 3.2, 2.5, 64.0) * step(0.001, vVis);
}`;

const frag = /* glsl */ `
varying vec3 vColor;
varying float vVis;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 26.0), halo = exp(-r2 * 4.5) * 0.28;
  float a = (core * 1.0 + halo) * vVis;
  gl_FragColor = vec4(vColor * (core * 6.0 + halo * 1.2) * vVis, a);
  #include <colorspace_fragment>
}`;

export const LIGHT = { red: [1.0, 0.09, 0.05], green: [0.1, 1.0, 0.45], white: [1.0, 0.95, 0.86], flood: [1.0, 0.72, 0.42] };

export function createLights(max = 512) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), dir = new Float32Array(max * 4), size = new Float32Array(max);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aDir", new THREE.BufferAttribute(dir, 4)); g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 800 }, uOn: { value: 0 } },
  });
  const points = new THREE.Points(g, mat);
  points.name = "boat-lights"; points.frustumCulled = false; points.renderOrder = 3;
  let n = 0;
  return {
    points,
    begin() { n = 0; },
    add(p, rgb, { dirX = 0, dirZ = 0, arc = null, sizeM = 1.2, k = 1 } = {}) {
      if (n >= max) return;
      pos.set([p.x, p.y, p.z], n * 3); col.set([rgb[0] * k, rgb[1] * k, rgb[2] * k], n * 3);
      dir.set(arc == null ? [0, 0, 1, -2] : [dirX, 0, dirZ, Math.cos(((arc / 2) * Math.PI) / 180)], n * 4); size[n] = sizeM; n++;
    },
    end(on, camera, heightPx) {
      g.setDrawRange(0, n);
      for (const a of Object.values(g.attributes)) a.needsUpdate = true;
      mat.uniforms.uOn.value = on;
      if (camera?.isPerspectiveCamera) mat.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      points.visible = on > 0.01 && n > 0;
    },
  };
}
