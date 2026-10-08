// People stand where a walker stands (src/anime/play/missions/place.js standHeight): on a quay deck, a promenade or a
// pier when one is within reach above the terrain, never inside it. The oyster farmer at the 南町 promenade stood on the
// terrain (1.45 m) under a 2.92 m deck, waist-deep in the demo film.
import { describe, expect, test } from 'bun:test';
import { Physics } from '../src/anime/core/physics.js';
import { standHeight } from '../src/anime/play/missions/place.js';
import * as L from '../src/anime/world/layout.js';
import NPCS from '../data/play/npcs.json';

const flat = (h) => () => h;

describe('standHeight', () => {
  test('no physics, or a physics that throws: the terrain', () => {
    expect(standHeight(0, 0, flat(1.2), null)).toBe(1.2);
    expect(standHeight(0, 0, flat(1.2), {})).toBe(1.2);
    expect(standHeight(0, 0, flat(1.2), { groundHeight: () => { throw new Error('not ready'); } })).toBe(1.2);
    expect(standHeight(0, 0, flat(1.2), { groundHeight: () => NaN })).toBe(1.2);
  });

  test('a deck within reach wins; a roof or an upper floor does not; nothing below the terrain', () => {
    const P = new Physics(flat(1.45));
    P.addWalkBox(0, 0, 6, 20, 0, 2.92);       // the promenade deck
    P.addWalkBox(30, 0, 6, 6, 0, 9.5);        // a roof
    P.addWalkBox(60, 0, 6, 6, 0, 0.8);        // a deck below the terrain
    expect(standHeight(0, 0, flat(1.45), P)).toBe(2.92);
    expect(standHeight(30, 0, flat(1.45), P)).toBe(1.45);
    expect(standHeight(60, 0, flat(1.45), P)).toBe(1.45);
    expect(standHeight(100, 0, flat(1.45), P)).toBe(1.45);
  });

  test('a pier over the sea is standable, open water stays at the terrain', () => {
    const P = new Physics(flat(-2), () => true);
    P.addWalkBox(0, 0, 4, 30, 0, 1.6);
    const sea = (x, z) => Math.max(-2, 0);    // layout.groundAt over water: the sea level
    expect(standHeight(0, 0, sea, P)).toBe(1.6);
    expect(standHeight(20, 0, sea, P)).toBe(0);
  });

  test('the reach is measured from the terrain: 3 m by default, configurable', () => {
    const P = new Physics(flat(0));
    P.addWalkBox(0, 0, 4, 4, 0, 3.3);         // within 3 m + a 0.45 m step
    P.addWalkBox(10, 0, 4, 4, 0, 3.6);        // just over it
    expect(standHeight(0, 0, flat(0), P)).toBe(3.3);
    expect(standHeight(10, 0, flat(0), P)).toBe(0);
    expect(standHeight(10, 0, flat(0), P, 4)).toBe(3.6);
  });

  test('the farmer is the case that was wrong: terrain under a promenade', () => {
    const f = NPCS.npcs.find((n) => n.id === 'farmer');
    const g = L.groundAt(f.x, f.z);
    let near = Infinity, top = null;
    for (const q of L.QUAYS) {
      const ax = q.a[0], az = q.a[1], ex = q.b[0] - ax, ez = q.b[1] - az;
      const t = Math.max(0, Math.min(1, ((f.x - ax) * ex + (f.z - az) * ez) / (ex * ex + ez * ez || 1)));
      const d = Math.hypot(f.x - ax - ex * t, f.z - az - ez * t);
      if (d < near) { near = d; top = q.top; }
    }
    expect(near).toBeLessThan(6);
    expect(top - g).toBeGreaterThan(1);       // the deck stands over a metre above the terrain he used to stand on
    expect(top - g).toBeLessThan(3);          // and within the default reach
  });
});
