// [v6:jonan-r3] 条南中学校 (far zone): Commons 153670155 (2024-05-03) shows a 4-storey main bar (/175, 14.4 m), a 3-storey flat-roofed wing (/168, 10.8 m, not the gym)
// and a stair tower (/169) about 3 m above the bar's roof. The area rule drew 3 storeys, a barrel-roofed gym and a 1-storey shed.
import { test, expect } from 'bun:test';

globalThis.window ??= globalThis;
globalThis.document ??= { createElement: () => ({ style: {}, getContext: () => null, addEventListener() {} }), body: { appendChild() {} }, addEventListener() {} };
const L = await import('../src/anime/world/layout.js');
const { schoolKind, schoolStoreys, schoolTopExtra } = await import('../src/anime/world/landmarks/schools.js');

const ID = (n) => '16/58538/25072/' + n;
const lot = (n) => L.LOTS.find((l) => l.id === ID(n));

test('条南中: the bar is 4 storeys, the wing a 3-storey flat block, the stair tower 3 m above the bar', () => {
  const bar = lot(175), wing = lot(168), tower = lot(169);
  for (const l of [bar, wing, tower]) { expect(l).toBeTruthy(); expect(l.landmark).toBe('school:schJonanJ'); }
  expect([schoolKind(bar), schoolKind(wing), schoolKind(tower)]).toEqual(['block', 'block', 'block']);
  expect(schoolStoreys(bar)).toBe(4);
  expect(schoolStoreys(wing)).toBe(3);
  expect(schoolStoreys(tower)).toBe(4);
  expect(schoolTopExtra(tower)).toBe(3);
  expect(schoolTopExtra(bar)).toBe(0);
  // the layout agrees with the render: 4 x 3.6 = 14.4 m, 3 x 3.6 = 10.8 m, the tower 14.4 + 3 = 17.4 m
  expect([bar.storeys, bar.height]).toEqual([4, 14.4]);
  expect([wing.storeys, wing.height]).toEqual([3, 10.8]);
  expect([tower.storeys, tower.height]).toEqual([4, 17.4]);
  expect(tower.height - bar.height).toBeCloseTo(3, 5);
});

test('条南中: the override is per lot, other lots of the ground keep the area rule', () => {
  const gym = { id: ID(999), landmark: 'school:schJonanJ', area: 700, obb: { w: 24, d: 29 } };
  expect(schoolKind(gym)).toBe('gym');
  expect(schoolStoreys({ id: ID(998), landmark: 'school:schJonanJ', area: 400, obb: { w: 10, d: 40 } })).toBe(3);
});
