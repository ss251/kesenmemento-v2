import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { migrate } from '../src/anime/play/kit/store.js';

describe('closed notebook', () => {
  test('a hidden sheet cannot paint 鉄紺 over the frame', () => {
    const src = readFileSync(new URL('../src/anime/play/kit/ui.js', import.meta.url), 'utf8');
    expect(src).toContain('#klc-play [hidden] { display: none !important; }');
  });

  test('the race clock is not covered by the あそぶ pill', () => {
    const src = readFileSync(new URL('../src/anime/play/race/index.js', import.meta.url), 'utf8');
    expect(src).toContain('body.klc-racing #klc-play .topbar { visibility: hidden; }');
  });
});

describe('car notebook through a kit migrate', () => {
  test('keeps the garage and the ghost beside the hub fields', () => {
    const state = migrate({
      meta: {
        hubOpened: '2026-10-07T00:00:00.000Z',
        played: { katsuo: '2026-10-07T00:00:00.000Z', bad: 1 },
        seen: { coach: true },
        car: { look: { paint: 'akane' }, race: { ghost: [1, 2], bestMs: 10 } },
      },
      seen: { book: 1 },
    });
    expect(state.meta.hubOpened).toBe('2026-10-07T00:00:00.000Z');
    expect(state.meta.played).toEqual({ katsuo: '2026-10-07T00:00:00.000Z' });
    expect(state.meta.seen.coach).toBe(true);
    expect(state.meta.seen.book).toBe(1);
    expect(state.meta.car.look.paint).toBe('akane');
    expect(state.meta.car.race.ghost).toEqual([1, 2]);
    expect(state.meta.car.race.bestMs).toBe(10);
  });
});
