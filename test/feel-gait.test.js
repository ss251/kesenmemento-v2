// [feel] His walk cycle driven the way the avatar drives it (play/avatar/index.js gaitCadence: the model's gait(speed, run) rate, the run
// flag by what the player does) at the decided speeds (HOYA_SPEED: walk 1.5, run 3.0 m/s): the planted boot sweeps back at his speed, so
// in the world it stays put (no slide). It needs the model's gait() (the hoya-accuracy lane's API) and skips on a model without it.
import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import { buildHoya } from '../src/anime/play/avatar/hoya-model.js';
import { gaitCadence, HOYA_SPEED, CADENCE } from '../src/anime/play/avatar/index.js';

const probe = buildHoya(THREE, { quality: 'phone' });
const hasGait = typeof probe.gait === 'function';
probe.dispose?.();

(hasGait ? describe : describe.skip)('his feet are planted at his decided speeds (the cadence driver + the model’s gait)', () => {
  for (const [name, v, run] of [['walk', HOYA_SPEED.walk, 0], ['run', HOYA_SPEED.run, 1]]) {
    test(`${name} at ${v} m/s: the driver's cycle is the no-slide one, and the planted boot sweeps back at his speed within 12 %`, () => {
      const h = buildHoya(THREE, { quality: 'phone' }), dt = 1 / 240, p = new THREE.Vector3();
      const cadence = gaitCadence(h, v, run);
      const g = h.gait(v, run);
      expect(cadence).toBeGreaterThan(CADENCE.min); expect(cadence).toBeLessThanOrEqual(CADENCE.max);
      expect(Math.abs(cadence - g.hz) / g.hz).toBeLessThan(0.02);   // the readable ceiling does not bite at these speeds: no slide
      h.setPose('auto');
      for (let i = 0; i < 480; i++) h.update(dt, { speed: v, cadence, run });
      const ys = [], zs = [];
      for (let i = 0; i < Math.ceil(240 / cadence); i++) { h.update(dt, { speed: v, cadence, run }); h.root.updateMatrixWorld(true); h.bones.footR.getWorldPosition(p); ys.push(p.y); zs.push(p.z); }
      // the planted stretch (the hoya lane's definition): the ankle within 1.2 cm of its lowest
      const lo = Math.min(...ys), sweep = [];
      for (let i = 1; i < ys.length; i++) if (ys[i] < lo + 0.012 && ys[i - 1] < lo + 0.012) sweep.push((zs[i] - zs[i - 1]) / dt);
      expect(sweep.length).toBeGreaterThanOrEqual(3);
      const mean = sweep.reduce((a, b) => a + b, 0) / sweep.length;
      expect(Math.abs(mean - v) / v).toBeLessThan(0.12);   // the root stands still here, so the boot sweeps back (+Z) at his speed
      h.dispose();
    });
  }
  test('today’s 3.1 / 6.4 would slide: the readable ceiling holds the cycle under the no-slide rate', () => {
    const h = buildHoya(THREE, { quality: 'phone' });
    for (const [v, run] of [[3.1, 0], [6.4, 1]]) expect(gaitCadence(h, v, run)).toBeLessThan(h.gait(v, run).hz * 0.7);
    h.dispose();
  });
});
