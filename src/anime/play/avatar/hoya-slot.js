// [play] The 3D ホヤぼーや is built by feat/play-hoya3d.
//   buildHoya(THREE, { quality, mat, calm }) -> { root, setPose, update, dispose, setLift, setCalm }
// This slot does not reshape him. A bad build returns null and the original walker stays.

import * as THREE from 'three';
import { buildHoya } from './hoya-model.js';

export function loadHoya(opts) {
  try {
    const built = buildHoya(THREE, opts || {});
    return Promise.resolve(built && built.root ? built : null);
  } catch (e) {
    console.error('[avatar] hoya', e);
    return Promise.resolve(null);
  }
}
