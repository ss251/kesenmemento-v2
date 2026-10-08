// [play] A mode change eases the camera from where it was. The offset is taken
// once, in world space, and it decays, so the new mode can keep moving and the
// picture still does not cut.

import * as THREE from 'three';

export const HANDOFF_S = 0.42;

export function createHandoff() {
  return {
    on: false, armed: false, t: 0, dur: HANDOFF_S,
    ox: 0, oy: 0, oz: 0,
    qFrom: new THREE.Quaternion(),
    qTo: new THREE.Quaternion(),
    qCur: new THREE.Quaternion(),
  };
}

/** `dur` 0 (reduced motion, a still) leaves the camera where the new mode put it. */
export function armHandoff(h, cam, dur = HANDOFF_S) {
  if (!h || !cam) return h;
  if (!(dur > 0)) { h.on = false; h.armed = false; return h; }
  h.on = true;
  h.armed = true;
  h.t = 0;
  h.dur = dur;
  h.ox = cam.position.x;
  h.oy = cam.position.y;
  h.oz = cam.position.z;
  h.qFrom.copy(cam.quaternion);
  return h;
}

/**
 * Call after the mode has written its camera. The first call with dt > 0
 * measures the jump and spends `dur` removing it.
 */
export function blendHandoff(h, cam, dt) {
  if (!h?.on || !cam) return false;
  if (!(dt > 0)) { h.on = false; h.armed = false; return false; }
  if (h.armed) {
    h.ox = h.ox - cam.position.x;
    h.oy = h.oy - cam.position.y;
    h.oz = h.oz - cam.position.z;
    h.armed = false;
    h.t = 0;
  }
  h.t += dt;
  const u = h.dur > 0 ? Math.min(1, h.t / h.dur) : 1;
  const k = u * u * (3 - 2 * u);
  cam.position.x += h.ox * (1 - k);
  cam.position.y += h.oy * (1 - k);
  cam.position.z += h.oz * (1 - k);
  h.qTo.copy(cam.quaternion);
  h.qCur.copy(h.qFrom).slerp(h.qTo, k);
  cam.quaternion.copy(h.qCur);
  if (u >= 1) h.on = false;
  return true;
}
