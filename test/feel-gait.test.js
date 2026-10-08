// [feel] The character slot. メメ is the default id. Until its module is in this build, load returns null and the original figure walks. Nothing is written to the console.
import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import { DEFAULT_ID, loadCharacter } from '../src/anime/play/avatar/characters.js';
import { gaitCadence, CHARACTER_SPEED } from '../src/anime/play/avatar/index.js';

describe('the character slot falls back quietly', () => {
  test('meme is the default and loads with a gait; an unknown id is null; no console error either way', async () => {
    expect(DEFAULT_ID).toBe('meme');
    expect(CHARACTER_SPEED).toEqual({ walk: 1.5, run: 3.0 });
    const errors = [];
    const orig = console.error;
    console.error = (...a) => { errors.push(a); };
    let meme = null;
    try {
      meme = await loadCharacter('meme', THREE, { quality: 'phone', calm: true });
      expect(await loadCharacter('no-such-character', THREE, {})).toBeNull();
    } finally { console.error = orig; }
    expect(errors).toEqual([]);
    expect(meme && meme.root).toBeTruthy();
    expect(typeof meme.gait).toBe('function');
    expect(gaitCadence(meme, CHARACTER_SPEED.walk, 0)).toBeGreaterThan(0);
    expect(gaitCadence(null, CHARACTER_SPEED.walk, 0)).toBeUndefined();
    meme.dispose?.();
  });
});
