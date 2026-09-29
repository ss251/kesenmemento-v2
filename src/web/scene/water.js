// Harbour water: Water.js (mirror + normal-map chop, spec §1 values) for the photo look on capable tiers, and a
// cheap PBR water (two scrolling normal samples, env reflections, sun glints) for model mode and lower tiers.
import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { chainCompile } from "./atmosphere.js";
import { WATER, MODEL_LOOK } from "../config.js";

export function makeWaterNormals(N = 256, seed = 7) {
  // isotropic sum of tileable waves: random directions on the integer lattice, amplitude ~ 1/|k|
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const data = new Uint8Array(N * N * 4), waves = [];
  while (waves.length < 56) {
    const k = 3 + Math.pow(rnd(), 1.6) * 26, a = rnd() * Math.PI * 2;
    const kx = Math.round(Math.cos(a) * k), ky = Math.round(Math.sin(a) * k);
    if (!kx && !ky) continue;
    waves.push([kx, ky, rnd() * 6.283, 1 / Math.hypot(kx, ky)]);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let dx = 0, dy = 0;
    for (const [kx, ky, ph, a] of waves) { const t = (6.283 * (kx * x + ky * y)) / N + ph, c = Math.cos(t) * a; dx += c * kx; dy += c * ky; }
    const nx = -dx * 0.045, ny = -dy * 0.045, l = Math.hypot(nx, ny, 1), o = (y * N + x) * 4;
    data[o] = ((nx / l) * 0.5 + 0.5) * 255; data[o + 1] = ((ny / l) * 0.5 + 0.5) * 255; data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255; data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 8; tex.needsUpdate = true;
  return tex;
}

export function createWater({ atm, tier, size = 60000 }) {
  const normals = makeWaterNormals();
  const group = new THREE.Group(); group.name = "water";
  let mirror = null;
  if (tier.mirror) {
    mirror = new Water(new THREE.PlaneGeometry(size, size), {
      textureWidth: 1024, textureHeight: 1024, waterNormals: normals, sunDirection: atm.sunDir.clone(),
      sunColor: 0xffe2c0, waterColor: WATER.color, distortionScale: WATER.distortion, fog: true,
    });
    mirror.rotation.x = -Math.PI / 2; mirror.material.uniforms.size.value = 1.4; mirror.name = "water-mirror";
    group.add(mirror);
  }
  const uniforms = { uT: { value: 0 }, uNS: { value: 0.35 } };
  const mat = new THREE.MeshStandardMaterial({ color: MODEL_LOOK.water, roughness: 0.16, metalness: 0.0, normalMap: normals, envMapIntensity: 1.0 });
  atm.shadowMaterial(mat);
  chainCompile(mat, (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWPos; uniform float uT, uNS;")
      .replace("#include <normal_fragment_maps>", `
        vec3 n1 = texture2D(normalMap, vWPos.xz / 17.0 + uT * vec2(0.021, 0.013)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vWPos.xz / 53.0 - uT * vec2(0.009, 0.016)).xyz * 2.0 - 1.0;
        vec2 d = (n1.xy + n2.xy) * uNS;
        vec3 wN = normalize(vec3(d.x, 1.0, d.y));
        normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);`);
  }, "water-pbr");
  const pbr = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  pbr.rotation.x = -Math.PI / 2; pbr.receiveShadow = true; pbr.name = "water-pbr"; group.add(pbr);

  const state = { model: 0, tide: 0 };
  function setLevel(tideM) { state.tide = tideM; group.position.y = WATER.y + tideM; }
  setLevel(0);
  function setMode(model, look) {
    const usePbr = model > 0.5 || !mirror;
    pbr.visible = usePbr; if (mirror) mirror.visible = !usePbr;
    const night = look?.night ?? 0;
    if (model > 0.5) { mat.color.set(MODEL_LOOK.water).lerp(new THREE.Color(0x0e1826), night * 0.85); mat.roughness = 0.3; uniforms.uNS.value = 0.07; }
    else { mat.color.set(WATER.color).lerp(new THREE.Color(0x05080c), night * 0.6); mat.roughness = 0.08; uniforms.uNS.value = 0.12; }
  }
  function update(t, look, wind = 3) {
    uniforms.uT.value = t * (0.6 + wind * 0.08);
    if (mirror) {
      const u = mirror.material.uniforms;
      u.time.value = t * 0.5; u.sunDirection.value.copy(atm.sunDir);
      u.sunColor.value.set(look?.sun ?? 0xffffff).multiplyScalar(atm.sunDir.y > 0 ? 1 : 0.05);
      u.distortionScale.value = WATER.distortion * (0.7 + Math.min(wind, 10) * 0.1);
    }
  }
  return { group, mirror, pbr, setMode, setLevel, update, uniforms };
}
