// [v6:schools-r3] Facade palette of the three far-zone schools the 2024-05 Commons photos sample (条南中, 鹿折中, 鹿折小): SCHOOL_INFO.<ground>.look, the layout walls that
// data/anime/overrides/outside cells (schools: ...).json keeps in step with it, and the grounds that must NOT change (no recent photo on file).
import { test, expect } from 'bun:test';

globalThis.window ??= globalThis;
globalThis.document ??= { createElement: () => ({ style: {}, getContext: () => null, addEventListener() {} }), body: { appendChild() {} }, addEventListener() {} };
const L = await import('../src/anime/world/layout.js');
const { SCHOOL_INFO } = await import('../src/anime/world/landmarks/sites.js');
const { schoolKind, schoolStoreys } = await import('../src/anime/world/landmarks/schools.js');

const lot = (id) => L.LOTS.find((l) => l.id === id);
const ground = (g) => L.LOTS.filter((l) => l.landmark === 'school:' + g);

test('条南中: cream #e4dfca, the yellow band on the bar and the wing only, the tower a separate lot', () => {
  const look = SCHOOL_INFO.schJonanJ.look;
  expect(look.wall).toBe('#e4dfca');
  expect(look.band).toBe('#e3bf3a');
  expect(look.bandLots).toEqual(['16/58538/25072/175', '16/58538/25072/168']);
  expect(look.tower).toEqual(['16/58538/25072/169']);
  for (const n of [175, 168, 169, 105, 182]) expect(lot('16/58538/25072/' + n).wall).toBe('#e4dfca');
});

test('鹿折中: the classroom block (lot 196) is a 3-storey block, walls #e0dbc8, concrete-grey slabs; the gym keeps its kind', () => {
  expect(SCHOOL_INFO.schShishioriJ.look).toMatchObject({ wall: '#e0dbc8' });
  const blk = lot('16/58543/25065/196');
  expect(schoolKind(blk)).toBe('block');
  expect(schoolStoreys(blk)).toBe(3);
  expect([blk.storeys, blk.height, blk.wall]).toEqual([3, 10.8, '#e0dbc8']);
  expect(schoolKind(lot('16/58543/25065/195'))).toBe('gym');
});

test('鹿折小: cream piers 1.0 m, white infill, dark slate roof #4a4d55, teal gym stripes #3f9a8a', () => {
  const look = SCHOOL_INFO.schShishioriE.look;
  expect(look).toMatchObject({ pier: '#ece3c8', pierW: 1.0, wall: '#e8e6e1', roof: '#4a4d55', teal: '#3f9a8a' });
  for (const n of [96, 113]) expect(lot('16/58542/25064/' + n).wall).toBe('#e8e6e1');
  expect(schoolKind(lot('16/58542/25064/69'))).toBe('gym');
});

test('unsampled grounds keep the default palette (no look): 気仙沼中, 気仙沼高, 九条小, 東陵高, 気仙沼小', () => {
  for (const g of ['schKesennumaJ', 'schKesennumaH', 'schKujoE', 'schToryoH', 'schKesennumaE']) expect(SCHOOL_INFO[g].look).toBeUndefined();
  for (const l of ground('schKesennumaH')) expect(String(l.src?.ovrWhy || '')).not.toMatch(/schools-r3|shishiori|jonan/);
});
