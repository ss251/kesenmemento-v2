import { test, expect } from 'bun:test';
import { createStore } from '../src/anime/play/kit/store.js';
import { coachSeen, markCoachSeen, clearCoachSeen, coachShouldShow, resolveCoachTarget } from '../src/anime/play/kit/coach.js';

function mem() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const box = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 40, height: 60 }) };

test('seen flags live in meta.seen and a replay clears them', () => {
  const storage = mem();
  const s = createStore(storage);
  expect(coachSeen(s, 'katsuo-glint')).toBe(false);
  expect(coachShouldShow(s, 'katsuo-glint')).toBe(true);
  markCoachSeen(s, 'katsuo-glint', '2026-10-07T00:00:00.000Z');
  expect(s.get('meta').seen).toEqual({ 'katsuo-glint': '2026-10-07T00:00:00.000Z' });
  expect(coachShouldShow(s, 'katsuo-glint')).toBe(false);
  expect(coachShouldShow(s, 'katsuo-glint', true)).toBe(true);
  const again = createStore(storage);
  expect(coachSeen(again, 'katsuo-glint')).toBe(true);
  clearCoachSeen(again);
  expect(again.get('meta').seen).toBeUndefined();
  expect(coachShouldShow(again, 'katsuo-glint')).toBe(true);
});

test('a coach target is an element, a selector or a point, and the follower reuses its box', () => {
  const into = { x: 0, y: 0 };
  const hit = resolveCoachTarget(box, null, into);
  expect(hit).toBe(into);
  expect(hit).toEqual({ x: 30, y: 50 });
  expect(resolveCoachTarget(() => ({ x: 3, y: 4 }), null, into)).toBe(into);
  expect(into).toEqual({ x: 3, y: 4 });
  expect(resolveCoachTarget(() => null)).toBe(null);
  expect(resolveCoachTarget(() => { throw new Error('gone'); })).toBe(null);
  expect(resolveCoachTarget('#missing', () => null)).toBe(null);
  expect(resolveCoachTarget('#a', (sel) => (sel === '#a' ? box : null))).toEqual({ x: 30, y: 50 });
  expect(resolveCoachTarget(1)).toBe(null);
  expect(resolveCoachTarget(null)).toBe(null);
});
