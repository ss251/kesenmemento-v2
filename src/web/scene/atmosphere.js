// Sun, sky, fog, stars, shadows (CSM) and the look interpolation between night, golden hour and day.
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { CSM } from "three/examples/jsm/csm/CSM.js";
import { LOOKS, FOG_SCALE } from "../config.js";

export function sunVector(azimuthDeg, elevationDeg, out = new THREE.Vector3()) {
  const a = THREE.MathUtils.degToRad(azimuthDeg), e = THREE.MathUtils.degToRad(elevationDeg);
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));   // x east, z south
}

/** Chain an onBeforeCompile hook after whatever the material already has (CSM installs its own). */
export function chainCompile(mat, fn, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => { if (prev) prev.call(mat, shader, renderer); fn(shader, renderer); };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : "") + "|" + key;
}

const lerp = THREE.MathUtils.lerp;
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
export function lookAt(elev) {
  const L = LOOKS; let i = 0;
  if (elev <= L[0].elev) return { ...L[0], t: 0 };
  if (elev >= L[L.length - 1].elev) return { ...L[L.length - 1] };
  while (i < L.length - 2 && elev > L[i + 1].elev) i++;
  const a = L[i], b = L[i + 1], t = (elev - a.elev) / (b.elev - a.elev);
  const mixC = (x, y) => "#" + _c1.set(x).lerp(_c2.set(y), t).getHexString();
  return {
    elev, fog: mixC(a.fog, b.fog), density: lerp(a.density, b.density, t), exposure: lerp(a.exposure, b.exposure, t),
    bloom: lerp(a.bloom, b.bloom, t), sun: mixC(a.sun, b.sun), sunI: lerp(a.sunI, b.sunI, t), amb: lerp(a.amb, b.amb, t),
    night: lerp(a.night, b.night, t), env: lerp(a.env, b.env, t),
    sky: { turbidity: lerp(a.sky.turbidity, b.sky.turbidity, t), rayleigh: lerp(a.sky.rayleigh, b.sky.rayleigh, t), mie: lerp(a.sky.mie, b.sky.mie, t), mieG: lerp(a.sky.mieG, b.sky.mieG, t) },
  };
}

export function createAtmosphere({ renderer, scene, camera, tier }) {
  const sky = new Sky(); sky.scale.setScalar(40000); sky.frustumCulled = false; scene.add(sky);
  const su = sky.material.uniforms;
  su.cloudCoverage.value = 0.3; su.cloudDensity.value = 0.35; su.cloudElevation.value = 0.55;
  const fog = (scene.fog = new THREE.FogExp2(0xe8b98a, 0.0003));   // kept even when the real look detaches it from the scene

  // stars (night only)
  const N = 1800, sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, y = Math.abs(u) * 0.96 + 0.04, r = Math.sqrt(1 - y * y);
    sp.set([Math.cos(th) * r * 15000, y * 15000, Math.sin(th) * r * 15000], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: new THREE.Color(0xdfe8ff).multiplyScalar(0.45), size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
  stars.frustumCulled = false; scene.add(stars);

  const hemi = new THREE.HemisphereLight(0xcfdcff, 0x5a4a3a, 0.6); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8ea4d8, 0); moon.position.set(-0.4, 1, 0.3); scene.add(moon);

  const sunDir = new THREE.Vector3(0, 1, 0);
  let csm = null;
  if (tier.csm) {
    csm = new CSM({ maxFar: 5000, cascades: tier.csm.cascades, mode: "practical", parent: scene, shadowMapSize: tier.csm.size,
      lightDirection: new THREE.Vector3(0, -1, 0), camera, lightIntensity: 2.6, lightNear: 1, lightFar: 12000, lightMargin: 600 });
    csm.fade = true;
    for (const l of csm.lights) { l.shadow.bias = -0.00025; l.shadow.normalBias = 0.6; }
  }
  const fallbackSun = csm ? null : new THREE.DirectionalLight(0xffffff, 2.5);
  if (fallbackSun) scene.add(fallbackSun);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const envSky = new Sky(); envSky.scale.setScalar(1000); envScene.add(envSky);
  let envRT = null, envElev = 999, envCloud = -1;
  function refreshEnv(elev, cloud) {
    if (Math.abs(elev - envElev) < 0.6 && Math.abs(cloud - envCloud) < 0.05) return;
    envElev = elev; envCloud = cloud;
    for (const k of ["turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG", "sunPosition", "cloudCoverage", "cloudDensity", "cloudElevation"]) {
      const v = su[k].value; envSky.material.uniforms[k].value = v?.clone ? v.clone() : v;
    }
    const next = pmrem.fromScene(envScene, 0, 0.1, 2000);
    envRT?.dispose(); envRT = next; scene.environment = next.texture;
  }

  const state = { look: lookAt(8), weather: { cloud: 0.3, fogMul: 1 }, sunDir, altitude: 100 };
  function setSun(azimuth, elevation) {
    sunVector(azimuth, elevation, sunDir);
    const look = (state.look = lookAt(elevation));
    su.sunPosition.value.copy(sunDir);
    su.turbidity.value = look.sky.turbidity; su.rayleigh.value = look.sky.rayleigh;
    su.mieCoefficient.value = look.sky.mie; su.mieDirectionalG.value = look.sky.mieG;
    su.cloudCoverage.value = state.weather.cloud;
    fog.color.set(look.fog);
    // haze thins with altitude (exp2 fog is height-blind): at 900 m the whole city stays readable behind Karakuwa
    fog.density = (look.density * FOG_SCALE * state.weather.fogMul) / (1 + Math.max(0, state.altitude) / 300);
    renderer.toneMappingExposure = look.exposure;
    const light = sunDir.y > -0.02 ? look.sunI : 0;
    if (csm) {
      csm.lightDirection.copy(sunDir).negate();
      for (const l of csm.lights) { l.color.set(look.sun); l.intensity = light; l.castShadow = light > 0.05; }
    } else { fallbackSun.position.copy(sunDir).multiplyScalar(3000); fallbackSun.color.set(look.sun); fallbackSun.intensity = light; }
    hemi.intensity = look.amb; hemi.color.set(look.night > 0.5 ? 0x3a4a70 : 0xcfdcff).lerp(_c1.set(look.fog), 0.25);
    hemi.groundColor.set(look.night > 0.5 ? 0x141820 : 0x5a4a3a);
    moon.intensity = 0.35 * look.night;
    stars.material.opacity = Math.max(0, look.night - 0.2) * 1.1;
    scene.environmentIntensity = look.env;
    refreshEnv(elevation, state.weather.cloud);
    return look;
  }
  function setWeather(w) {
    if (!w) return;
    const sky = String(w.sky ?? "");
    state.weather.cloud = /rain|雨/.test(sky) ? 0.85 : /cloud|曇|くもり/.test(sky) ? 0.6 : /clear|晴/.test(sky) ? 0.18 : 0.35;
    state.weather.fogMul = (w.precip1h ?? 0) > 0 ? 1.35 : 1;
  }
  function setAltitude(a) { state.altitude = a; }
  function update(time) {
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    su.time && (su.time.value = time);
    if (csm) csm.update();
  }
  function shadowMaterial(mat) { if (csm) csm.setupMaterial(mat); return mat; }
  return { sky, stars, hemi, moon, csm, state, setSun, setWeather, setAltitude, update, shadowMaterial, sunDir, updateFrustums: () => csm?.updateFrustums() };
}
