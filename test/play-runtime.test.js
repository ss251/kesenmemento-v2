import { test, expect, beforeEach } from 'bun:test';
import { playModeFrom, readMode } from '../src/anime/play/kit/mode.js';
import { bindRuntime, playMode, onPlayTick, playerPos, _resetRuntime } from '../src/anime/play/kit/runtime.js';

beforeEach(() => _resetRuntime());

test('mode priority is menu, photo, interior, drive, sail, fly, walk', () => {
  expect(playModeFrom({})).toBe('walk');
  expect(playModeFrom({ fly: true })).toBe('fly');
  expect(playModeFrom({ fly: true, sail: true })).toBe('sail');
  expect(playModeFrom({ sail: true, drive: true })).toBe('drive');
  expect(playModeFrom({ drive: true, interior: true })).toBe('interior');
  expect(playModeFrom({ interior: true, photo: true })).toBe('photo');
  expect(playModeFrom({ photo: true, menu: true })).toBe('menu');
  expect(playModeFrom({ planet: true, drive: true })).toBe('menu');
});

test('readMode follows the live flags', () => {
  if (typeof document !== 'undefined' && document.body) document.body.classList.add('playing');
  const ctx = {
    camera: { position: { x: 1, y: 2, z: 3 } },
    player: { position: { x: 4, y: 0, z: 5 } },
    playerObj: { fly: false },
    shooting: false,
    planet: { active: false },
    services: { explore: { drive: { active: false }, sail: { active: false }, interiors: { at: () => null } } },
  };
  expect(readMode(ctx)).toBe('walk');
  ctx.playerObj.fly = true;
  expect(readMode(ctx)).toBe('fly');
  ctx.services.explore.drive.active = true;
  expect(readMode(ctx)).toBe('drive');
  ctx.services.explore.interiors.at = () => 'hall';
  expect(readMode(ctx)).toBe('interior');
  ctx.shooting = true;
  expect(readMode(ctx)).toBe('photo');
  ctx.planet.active = true;
  expect(readMode(ctx)).toBe('menu');
});

test('playMode and playerPos read the bound context', () => {
  if (typeof document !== 'undefined' && document.body) document.body.classList.add('playing');
  const steps = [];
  const ctx = {
    onStep(fn) { steps.push(fn); },
    camera: { position: { x: 0, y: 1, z: 0 } },
    player: { position: { x: 8, y: 1.5, z: -2 } },
    playerObj: { fly: true },
    planet: { active: false },
    services: { explore: { drive: { active: false }, sail: { active: false }, interiors: { at: () => null } } },
  };
  bindRuntime(ctx);
  expect(playMode()).toBe('fly');
  const out = { x: 0, y: 0, z: 0 };
  playerPos(out);
  expect(out).toEqual({ x: 8, y: 1.5, z: -2 });
  let got = 0;
  const off = onPlayTick((dt, t) => { got = t; });
  steps[0](0.016, 1.5);
  expect(got).toBe(1.5);
  off();
  steps[0](0.016, 2);
  expect(got).toBe(1.5);
});
