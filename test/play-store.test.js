import { describe, test, expect } from 'bun:test';
import { createStore, migrate, emptyState, KEY } from '../src/anime/play/kit/store.js';

function memory(initial) {
  const m = new Map(initial ? [[KEY, initial]] : []);
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    dump: () => m.get(KEY),
  };
}

describe('play store', () => {
  test('empty notebook', () => {
    const s = createStore(memory());
    expect(s.get('katsuo')).toEqual({ found: {} });
    expect(s.get('courses')).toEqual({});
    expect(s.get('fish')).toEqual({});
    expect(s.get('meta')).toEqual({});
    expect(s.get('nope')).toEqual({});
  });

  test('get is a copy', () => {
    const s = createStore(memory());
    s.update('katsuo', (d) => { d.found.a = '2026-10-07T00:00:00.000Z'; });
    const a = s.get('katsuo');
    a.found.a = 'changed';
    expect(s.get('katsuo').found.a).toBe('2026-10-07T00:00:00.000Z');
  });

  test('update notifies and saves', () => {
    const box = memory();
    const s = createStore(box);
    let seen = 0;
    const off = s.on('courses', (row) => { seen++; expect(row.pier.runs).toBe(1); });
    s.update('courses', (d) => { d.pier = { best: 42000, medal: 'silver', runs: 1 }; });
    expect(seen).toBe(1);
    off();
    s.update('courses', (d) => { d.pier.runs = 2; });
    expect(seen).toBe(1);
    expect(JSON.parse(box.dump()).courses.pier.medal).toBe('silver');
  });

  test('a throwing updater leaves the notebook as it was', () => {
    const s = createStore(memory());
    s.update('fish', (d) => { d.hoya = { n: 1, maxCm: 12, first: 't' }; });
    expect(() => s.update('fish', () => { throw new Error('no'); })).toThrow();
    expect(s.get('fish').hoya.n).toBe(1);
  });

  test('migrates the older found-array shape', () => {
    const raw = JSON.stringify({
      v: 1,
      katsuo: { found: ['a', 'b'], t: { a: '2026-01-01T00:00:00.000Z' } },
      courses: { bay: { best: 1000, medal: 'gold', runs: 3 } },
      fish: { saba: { n: 2, max: 40, first: '2026-02-02T00:00:00.000Z' } },
      seen: { tip: true },
    });
    const s = createStore(memory(raw));
    expect(s.get('katsuo').found.a).toBe('2026-01-01T00:00:00.000Z');
    expect(s.get('katsuo').found.b).toBe(null);
    expect(s.get('courses').bay).toEqual({ best: 1000, medal: 'gold', runs: 3 });
    expect(s.get('fish').saba).toEqual({ n: 2, maxCm: 40, first: '2026-02-02T00:00:00.000Z' });
    expect(s.get('meta').seen).toEqual({ tip: true });
  });

  test('corrupt JSON becomes an empty notebook', () => {
    const s = createStore(memory('{not json'));
    expect(s.get('katsuo')).toEqual({ found: {} });
    s.update('meta', (d) => { d.sound = false; });
    expect(s.get('meta').sound).toBe(false);
  });

  test('a storage that throws still keeps the change in memory', () => {
    const box = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    };
    const s = createStore(box);
    expect(s.get('katsuo')).toEqual(emptyState().katsuo);
    s.update('katsuo', (d) => { d.found.x = '2026-10-07T00:00:00.000Z'; });
    expect(s.get('katsuo').found.x).toBe('2026-10-07T00:00:00.000Z');
    s.reset();
    expect(s.get('katsuo').found).toEqual({});
  });

  test('reset tells every section', () => {
    const s = createStore(memory());
    s.update('meta', (d) => { d.firstRun = 't'; });
    const got = [];
    s.on('meta', () => got.push('meta'));
    s.on('katsuo', () => got.push('katsuo'));
    s.reset();
    expect(got.sort()).toEqual(['katsuo', 'meta']);
    expect(s.get('meta')).toEqual({});
  });

  test('migrate drops a medal it does not know', () => {
    const state = migrate({ courses: { a: { best: 10, medal: 'platinum', runs: 1 } } });
    expect(state.courses.a.medal).toBe(null);
  });
});
