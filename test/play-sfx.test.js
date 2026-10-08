import { test, expect } from 'bun:test';
import { createSim, pinRange, emit, stepSim, KIND_DISC } from '../src/anime/play/kit/particles.js';
import { SOUND_NAMES, bindSfx, sfx } from '../src/anime/play/kit/sfx.js';

test('the pool does not grow', () => {
  const n = 24;
  const sim = createSim(n);
  pinRange(sim, 4);
  const data = new Float32Array(n * 4);
  const style = new Float32Array(n * 4);
  const before = data.length;
  for (let i = 0; i < 80; i++) emit(sim, data, style, i, 1, 2, 0.2, 1, 0, 0.4, 0.1, KIND_DISC, 1, 0.8, 0, 2, 0);
  for (let i = 0; i < 40; i++) stepSim(sim, data, style, 0.05);
  expect(data.length).toBe(before);
  expect(style.length).toBe(before);
  expect(sim.life.length).toBe(n);
});

test('play sound names register into the audio engine', () => {
  const sfxNames = [];
  const loops = [];
  const buffers = [];
  const audio = {
    ready: true,
    muted: false,
    registerBuffer(k) { buffers.push(k); return true; },
    registerSfx(n) { sfxNames.push(n); return true; },
    registerLoop(n) { loops.push(n); return true; },
    play(n) { return n; },
    loop() { return { setVolume() {}, stop() {} }; },
  };
  bindSfx(audio);
  for (const name of SOUND_NAMES) {
    if (name === 'shimmer') expect(loops).toContain('play-shimmer');
    else expect(sfxNames).toContain('play-' + name);
  }
  expect(buffers.length).toBeGreaterThan(8);
  sfx.play('tap');
});

test('a muted engine plays nothing', () => {
  let plays = 0;
  bindSfx({
    ready: true,
    muted: true,
    registerBuffer() { return true; },
    registerSfx() { return true; },
    registerLoop() { return true; },
    play() { plays++; },
  });
  sfx.play('chime', { pitch: 2 });
  expect(plays).toBe(0);
});
