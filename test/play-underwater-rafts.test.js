// [play:underwater] Farm placement against the channel, and the strings.
import { describe, test, expect } from 'bun:test';
import * as L from '../src/anime/world/layout.js';
import { OUTBOUND } from '../src/anime/world/ship/route.js';
import { planRafts, RAFT_FIELDS } from '../src/anime/world/harbor/rows.js';
import { planDrops, pathDistance } from '../src/anime/play/underwater/logic.js';
import { applySwimFog, SWIM_FN, SNELL } from '../src/anime/play/underwater/fog.js';
import { causticOrigin, CAUSTIC_SCALE } from '../src/anime/play/underwater/logic.js';
import { TUNE } from '../src/anime/play/underwater/tune.js';
import DATA from '../data/play/rafts.json';
import STR from '../data/play-i18n.json';

const SENSITIVE = /\u6d25\u6ce2|\u9707\u707d|被災|復興|tsun[a]mi|earthquake|201[1]|3\.1[1]|慰霊|避難|防潮堤|伝承館|遺構|memorial|disaster/i;

describe('copy', () => {
  test('ja and en share every play.swim key, and nothing sensitive is in the strings or the farm notes', () => {
    const blob = JSON.stringify(STR) + JSON.stringify(DATA);
    expect(blob).not.toMatch(SENSITIVE);
    const ja = Object.keys(STR.ja).filter((k) => k.startsWith('play.swim.'));
    const en = Object.keys(STR.en).filter((k) => k.startsWith('play.swim.'));
    expect(ja.length).toBeGreaterThan(8);
    expect(ja.sort().join()).toBe(en.sort().join());
    for (const k of ja) expect(String(STR.en[k]).length).toBeGreaterThan(0);
  });

  test('the underwater chunk is one gated branch and it is not applied twice', () => {
    const shader = { uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\nvoid main(){\n#include <fog_fragment>\n}' };
    applySwimFog(shader, 'vPWorld');
    expect(shader.fragmentShader).toContain('if (uSwim > 0.5)');
    expect(shader.fragmentShader).toContain('sw_fogK(swDist)');
    expect(shader.fragmentShader).toContain('sw_caustic(swV, swH, swPx)');
    expect(shader.fragmentShader).toContain('vec3 swP = vPWorld;');
    expect(shader.uniforms.uSwim).toBeTruthy();
    expect(shader.uniforms.uSwimSun).toBeTruthy();
    applySwimFog(shader, 'vPWorld');
    expect(shader.fragmentShader.match(/uniform float uSwim,/g).length).toBe(1);
    expect(shader.fragmentShader.match(/vec3 swP = /g).length).toBe(1);
  });
});

describe('caustics', () => {
  test('the net is evaluated near the eye: a whole-cell origin every 256 cells, and an exact offset', () => {
    const o = { x: 0, y: 0 }, q = { x: 0, y: 0 };
    for (const [x, z] of [[1634.27, 3656.07], [368, 12], [-20.5, 7999.9], [0, 0]]) {
      causticOrigin(x, z, o, q);
      expect(Number.isInteger(o.x / 256)).toBe(true);
      expect(Number.isInteger(o.y / 256)).toBe(true);
      expect(q.x).toBeGreaterThanOrEqual(0);
      expect(q.x).toBeLessThan(256);
      expect(o.x + q.x).toBeCloseTo(x * CAUSTIC_SCALE, 9);
      expect(o.y + q.y).toBeCloseTo(z * CAUSTIC_SCALE, 9);
    }
  });

  test('every warp in the net repeats over 256 cells, so moving the origin never moves the pattern', () => {
    const shader = { uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\nvarying vec3 vViewPosition;\nvoid main(){\n#include <fog_fragment>\n}' };
    applySwimFog(shader, 'vPWorld');
    const src = shader.fragmentShader;
    const net = src.slice(src.indexOf('float sw_net('), src.indexOf('float sw_caustic('));
    const freqs = [...net.matchAll(/q(?:\.yx)? \* ([0-9.]+)/g)].map((m) => Number(m[1]));
    expect(freqs.length).toBeGreaterThanOrEqual(3);
    for (const f of freqs) expect(Number.isInteger(f * 256)).toBe(true);
    // the second net's scale too, and both nets take the whole-cell origin
    expect(Number.isInteger(0.53125 * 256)).toBe(true);
    expect(src).toContain('uSwimCellO * 0.53125');
    expect(src).toContain('#define SW_VIEWPOS 1');
    expect(SWIM_FN).not.toContain('cameraPosition - ');
    expect(SNELL).toContain('uSwimCamQ');
  });
});

describe('farms', () => {
  test('new longlines stay 80 m off the channel; photographed rafts are not moved', () => {
    expect(RAFT_FIELDS[0].id).toBe('southA');
    expect(RAFT_FIELDS[0].x0).toBe(1510);
    expect(RAFT_FIELDS[1].x1).toBe(1790);
    for (const line of DATA.longlines) {
      const hx = Math.sin(line.yaw), hz = Math.cos(line.yaw);
      for (let k = 0; k < line.ropes; k++) {
        const t = (k / (line.ropes - 1) - 0.5) * line.length;
        const d = pathDistance(line.x + hx * t, line.z + hz * t, OUTBOUND);
        expect(d).toBeGreaterThanOrEqual(TUNE.channelClear);
      }
    }
  });

  test('ropes and kelp stay above the bed, and ホヤ hangs under the south field', () => {
    const rafts = planRafts(L.isWater);
    expect(rafts.length).toBeGreaterThan(40);
    const drops = planDrops(rafts, DATA.longlines, DATA.kelp, (x, z) => L.heightAt(x, z), DATA.fields);
    expect(drops.some((d) => d.kind === 'hoya')).toBe(true);
    expect(drops.some((d) => d.kind === 'oyster')).toBe(true);
    expect(drops.some((d) => d.kind === 'wakame')).toBe(true);
    expect(drops.some((d) => d.kind === 'scallop')).toBe(true);
    expect(drops.some((d) => d.kind === 'kelp')).toBe(true);
    for (const d of drops) {
      expect(d.y1).toBeGreaterThan(L.heightAt(d.x, d.z) + 0.05);
      expect(d.y0).toBeGreaterThan(d.y1);
    }
  });
});
