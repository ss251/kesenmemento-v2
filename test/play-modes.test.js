// [play] The mode graph: every pair, the entries that need a reason, and the pad chips.
import { describe, expect, test } from 'bun:test';
import { GRAPH_MODES, canSwitch, padChipsHidden, hubTarget, graphFrom, viewCycleAllowed } from '../src/anime/play/kit/modes.js';
import { nextView } from '../src/anime/play/avatar/view.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BARE = new Set([
  'walk>fly', 'fly>walk', 'walk>photo', 'fly>photo',
  'drive>walk', 'drive>photo',
  'sail>walk', 'sail>photo', 'sail>dive',
  'katsuo>walk', 'katsuo>dive',
  'dive>walk', 'gull>walk', 'gull>fly',
  'race>walk', 'ippon>walk', 'photo>walk',
]);

describe('the mode graph', () => {
  test('every pair, with nothing extra, matches the free exits', () => {
    expect(GRAPH_MODES).toHaveLength(10);
    for (const from of GRAPH_MODES) {
      for (const to of GRAPH_MODES) {
        const ok = canSwitch(from, to);
        if (from === to) expect(ok).toBe(false);
        else expect(ok).toBe(BARE.has(from + '>' + to));
      }
    }
  });

  test('a vehicle, a dive, a gull and a game need their own door', () => {
    expect(canSwitch('walk', 'drive', { atPlace: true })).toBe(true);
    expect(canSwitch('walk', 'drive', { via: 'hub' })).toBe(true);
    expect(canSwitch('walk', 'drive', { via: 'mission' })).toBe(true);
    expect(canSwitch('walk', 'drive', { via: 'key' })).toBe(false);
    expect(canSwitch('fly', 'drive', { via: 'hub', atPlace: true })).toBe(false);
    expect(canSwitch('walk', 'sail', { via: 'mission' })).toBe(true);
    expect(canSwitch('walk', 'katsuo', { atPlace: true })).toBe(true);
    expect(canSwitch('dive', 'drive')).toBe(false);
    expect(canSwitch('gull', 'dive', { via: 'hub' })).toBe(false);
    expect(canSwitch('race', 'gull', { via: 'hub' })).toBe(false);
    expect(canSwitch('walk', 'dive', { atShore: true })).toBe(true);
    expect(canSwitch('walk', 'dive', { via: 'hub' })).toBe(true);
    expect(canSwitch('walk', 'dive', { via: 'chip' })).toBe(false);
    expect(canSwitch('walk', 'gull', { via: 'hub' })).toBe(true);
    expect(canSwitch('walk', 'gull', { via: 'mission' })).toBe(true);
    expect(canSwitch('walk', 'gull', { via: 'key' })).toBe(false);
    expect(canSwitch('walk', 'gull', { atPlace: true })).toBe(false);
    expect(canSwitch('walk', 'race', { via: 'npc' })).toBe(true);
    expect(canSwitch('walk', 'ippon', { via: 'mission' })).toBe(true);
    expect(canSwitch('walk', 'race', { via: 'key' })).toBe(false);
    expect(canSwitch('sail', 'walk')).toBe(true);
    expect(canSwitch('katsuo', 'photo')).toBe(false);
  });

  test('a dive, a race and a photo go back where they came from', () => {
    expect(canSwitch('dive', 'sail', { origin: 'sail' })).toBe(true);
    expect(canSwitch('dive', 'katsuo', { origin: 'katsuo' })).toBe(true);
    expect(canSwitch('dive', 'fly', { origin: 'sail' })).toBe(false);
    expect(canSwitch('dive', 'walk', { origin: 'hub' })).toBe(true);
    expect(canSwitch('photo', 'drive', { origin: 'drive' })).toBe(true);
    expect(canSwitch('photo', 'fly', { origin: 'walk' })).toBe(false);
    expect(canSwitch('photo', 'sail', { origin: 'sail' })).toBe(true);
    expect(canSwitch('race', 'fly', { origin: 'fly' })).toBe(true);
    expect(canSwitch('ippon', 'walk', { origin: 'walk' })).toBe(true);
    expect(canSwitch('ippon', 'dive', { origin: 'walk' })).toBe(false);
  });

  test('the pad hides its mode chips inside a special mode', () => {
    expect(padChipsHidden('walk')).toBe(false);
    expect(padChipsHidden('fly')).toBe(false);
    expect(padChipsHidden('photo')).toBe(false);
    for (const mode of ['dive', 'gull', 'drive', 'sail', 'katsuo', 'race', 'ippon']) {
      expect(padChipsHidden(mode)).toBe(true);
    }
  });

  test('a hub card names its mode, and the live body does not call the car a flight', () => {
    expect(hubTarget('gull')).toBe('gull');
    expect(hubTarget('underwater')).toBe('dive');
    expect(hubTarget('ippon')).toBe('ippon');
    expect(hubTarget('race')).toBe('race');
    expect(hubTarget('minato')).toBe('drive');
    expect(hubTarget('katsuo')).toBe(null);
    expect(hubTarget('quests')).toBe(null);
    const ctx = {
      playerObj: { fly: true },
      services: { explore: { drive: { active: true } }, sail: { active: true, boatId: 'katsuo' } },
    };
    expect(graphFrom(ctx)).toBe('katsuo');
    expect(graphFrom({ playerObj: { fly: true }, services: {} })).toBe('fly');
    expect(graphFrom({
      playerObj: { fly: false },
      services: { swim: { active: true }, explore: { drive: { active: true } } },
    })).toBe('dive');
    expect(graphFrom({ playerObj: { gull: true, fly: true }, services: {} })).toBe('gull');
  });
});

describe('the 視点 cycle (V): walk 3rd → walk 1st → the drone', () => {
  const graph = (from) => { const asked = []; return { asked, allow: (to, x) => { asked.push([to, x.via]); return canSwitch(from, to, x); } }; };

  test('a person swap inside walk does not ask the graph (canSwitch refuses walk → walk; V was stuck behind the walker)', () => {
    const g = graph('walk');
    expect(nextView('walk3')).toBe('walk1');
    expect(viewCycleAllowed('walk', nextView('walk3'), g.allow)).toBe(true);
    expect(g.asked).toEqual([]);
  });

  test('the whole cycle goes round from walk', () => {
    let id = 'walk3', from = 'walk';
    const seen = [id];
    for (let i = 0; i < 3; i++) {
      const next = nextView(id);
      expect([id, next, viewCycleAllowed(from, next, graph(from).allow)]).toEqual([id, next, true]);
      id = next; from = next === 'fly' ? 'fly' : 'walk'; seen.push(id);
    }
    expect(seen).toEqual(['walk3', 'walk1', 'fly', 'walk3']);
  });

  test('a real change still asks: walk → the drone, the drone → walk', () => {
    const w = graph('walk');
    expect(viewCycleAllowed('walk', 'fly', w.allow)).toBe(true);
    expect(w.asked).toEqual([['fly', 'key']]);
    const f = graph('fly');
    expect(viewCycleAllowed('fly', 'walk3', f.allow)).toBe(true);
    expect(f.asked).toEqual([['walk', 'key']]);
  });

  test('inside a special mode the graph decides: a dive cannot take off, a race cannot be left by V', () => {
    expect(viewCycleAllowed('dive', 'fly', graph('dive').allow)).toBe(false);
    expect(viewCycleAllowed('race', 'walk3', graph('race').allow)).toBe(true);    // back to its origin (walk)
    expect(viewCycleAllowed('race', 'fly', graph('race').allow)).toBe(false);
  });

  test('no graph (the play kit not loaded): V cycles freely', () => {
    expect(viewCycleAllowed('walk', 'fly', undefined)).toBe(true);
  });

  test('the HUD asks through it', () => {
    const hud = readFileSync(join(import.meta.dir, '..', 'src/anime/ui/hud.js'), 'utf8');
    expect(hud).toContain('if (!viewCycleAllowed(from, next, pl?.allowMode)) return;');
  });
});
