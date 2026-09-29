// Headless preview of the scale-model splat (P3 QA). Query:
//   splat=/project/<path>.ply|.rad  tf=/project/<json with position/quaternion/scale or .transform>
//   cam=x,y,z look=x,y,z fov=deg  paged=1 (for .rad)  wait=ms  bg=hex
import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

const q = new URLSearchParams(location.search);
const vec = (s, d) => (s ? s.split(",").map(Number) : d);
const status = { ready: false, frames: 0, errors: [], steps: [] };
window.__RT = status;
addEventListener("error", (e) => status.errors.push(String(e.message || e)));
addEventListener("unhandledrejection", (e) => status.errors.push("unhandled: " + String(e.reason?.stack || e.reason)));

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(q.get("bg") ? "#" + q.get("bg") : "#1d1f22");
const camera = new THREE.PerspectiveCamera(Number(q.get("fov") ?? 45), innerWidth / innerHeight, 0.01, 1000);
camera.position.set(...vec(q.get("cam"), [0, 2.2, 2.6]));
camera.lookAt(new THREE.Vector3(...vec(q.get("look"), [0, 0, 0])));
addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.render(scene, camera); });
const spark = new SparkRenderer({ renderer });
scene.add(spark);
if (q.get("grid") === "1") { const g = new THREE.GridHelper(4, 8, 0x555555, 0x333333); scene.add(g); }

async function load() {
  const url = q.get("splat");
  const t0 = performance.now();
  const opts = { url };
  if (q.get("paged") === "1") opts.paged = true;
  const mesh = new SplatMesh(opts);
  if (q.get("tf")) {
    const j = await (await fetch(q.get("tf"))).json();
    const tf = j.transform ?? j.model?.transform ?? j;
    mesh.position.set(...tf.position); mesh.quaternion.set(...tf.quaternion); mesh.scale.setScalar(tf.scale);
  }
  scene.add(mesh);
  await mesh.initialized;
  status.numSplats = mesh.packedSplats?.numSplats ?? mesh.splats?.getNumSplats?.() ?? null;
  status.loadMs = Math.round(performance.now() - t0);
  status.steps.push(`loaded ${url} in ${status.loadMs} ms`);
}
const loaded = load().catch((e) => status.errors.push("load: " + (e.stack || e)));
const waitMs = Number(q.get("wait") ?? 2500);
let doneAt = null;
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera); status.frames++;
  if (doneAt === null) loaded.then(() => { if (doneAt === null) doneAt = performance.now() + waitMs; });
  else if (performance.now() > doneAt && status.frames > 30) status.ready = true;
});
