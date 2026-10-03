// [ship] Profile bench page for tools/anime/ship-profile.mjs: builds 第一昭福丸 alone on a studio-white background and
// renders orthographic side views at an exact metres-per-pixel scale, aligned to the nendo reference photos.
//   ?livery=nendo|fallback  &tier=high|phone
// window.__render({ side, mpp, bowX, wlY, w, h, mask }) -> PNG data URL (mask: transparent background, alpha = ship)
// window.__atlas(layers) -> PNG data URL of the livery atlas (layers: comma list for livery.paintAtlas, '' = all)
import * as THREE from 'three';
import { createMaterials } from '../../../src/anime/core/materials.js';
import { createRenderPipeline } from '../../../src/anime/core/renderer.js';
import { buildShofukumaru, MID_S } from '../../../src/anime/world/ship/shofukumaru1.js';
import { ATLAS, paintAtlas, makeCanvas } from '../../../src/anime/world/ship/livery.js';

const q = new URLSearchParams(location.search);
const W0 = 820, H0 = 547;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W0, H0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const shared = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.9, 0.35) }, uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() }, uGust: { value: 0.5 }, uNight: { value: 0 } };
const ctx = { THREE, scene, shared, mat: createMaterials(shared), quality: { name: 'high', tier: q.get('tier') || 'high', phone: q.get('tier') === 'phone' } };
// studio light: soft sky fill plus a key from the camera side, high and forward (the nendo photos are lit from the upper left)
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9bcc4, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(key); scene.add(key.target);

const ship = buildShofukumaru(ctx, { livery: q.get('livery') || 'fallback', tier: q.get('tier') || 'high' });
scene.add(ship.group);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
// the app's own pipeline for the look: ink outlines on; vignette, light leak, bloom and grading neutral (studio photo)
const pipe = createRenderPipeline(renderer, { msaa: 4, name: 'high' });
for (const [k, v] of Object.entries({ uVignette: 0, uLeak: 0, uBloom: 0, uGlow: 0, uNeutral: 1, uExposure: 1 })) pipe.compMat.uniforms[k].value = v;
pipe.compMat.uniforms.uLineRange.value.set(600, 1200);
const sunDir = new THREE.Vector3(0.3, 0.8, 0.5).normalize();

window.__render = async ({ side = 'port', mpp = 0.1226, bowX = 158, wlY = 291, w = W0, h = H0, mask = false, flags = false, night = 0, outline = true } = {}) => {
  renderer.setSize(w, h);
  ship.setFlags(flags); ship.setNight(night); ship.update(0, 0);
  const sgn = side === 'port' ? 1 : -1;
  // pixel x = bowX + sgn * s / mpp ; pixel y = wlY - h / mpp
  const sC = sgn * (w / 2 - bowX) * mpp, hC = (wlY - h / 2) * mpp;
  cam.left = -w / 2 * mpp; cam.right = w / 2 * mpp; cam.top = h / 2 * mpp; cam.bottom = -h / 2 * mpp; cam.updateProjectionMatrix();
  cam.position.set(sgn * 120, hC, MID_S - sC); cam.up.set(0, 1, 0); cam.lookAt(0, hC, MID_S - sC);
  key.position.set(sgn * 60, 80, MID_S - sC + sgn * -40 + 30); key.target.position.set(0, 0, MID_S - sC);
  if (mask) { scene.background = null; renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 0); renderer.render(scene, cam); }
  else {
    scene.background = new THREE.Color('#f7f7f7');
    pipe.compMat.uniforms.uOutline.value = outline ? 1 : 0;
    pipe.setSize(w, h, 1); pipe.compMat.uniforms.uLineRange.value.set(600, 1200);
    pipe.render(scene, cam, sunDir, 0);
  }
  return renderer.domElement.toDataURL('image/png');
};

window.__atlas = (layers = '') => {
  if (!layers) return ship.atlas.canvas.toDataURL('image/png');
  const c = makeCanvas(ATLAS.W, ATLAS.H); const g = c.getContext('2d');
  paintAtlas(g, ship.plan, { profile: ship.profile, layers: new Set(layers.split(',')) });
  return c.toDataURL('image/png');
};

(async () => {
  await document.fonts?.ready;
  const st = await ship.ready;
  // repaint once the web fonts are in (the fallback was painted before they loaded)
  if (st.mode === 'fallback') ship.repaint();
  window.__info = { livery: ship.livery, error: st.error, tier: ship.tier, triangles: ship.triangles, anchors: { mastTop: ship.anchors.mastTop, gangwayStbd: ship.anchors.gangwayStbd } };
  window.__ready = true;
})();
