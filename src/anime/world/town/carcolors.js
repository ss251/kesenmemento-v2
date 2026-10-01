// [v5:fix2] Parked-car body colours in the Japanese mix (Google Earth 2026-03-11 car parks of 魚町, 南町 and the
// 魚市場 roof deck; the Japanese new-car colour shares are dominated by white / pearl, then black and silver): about
// 45 % white or pearl, 20 % black, 15 % silver, 10 % grey and 10 % dark blue, red or another colour. It replaces the
// rainbow palettes (mint #9fd4c2, baby blue #a9c5e2) of town/landuse.js, town/parking.js and harbor/market4.js.
// Twenty entries, so a uniform pick hits each share exactly.
export const JP_CAR_COLS = [
  // 9 x white / pearl (45 %)
  '#f2f1ec', '#ecebe5', '#f4f2ea', '#e9e8e2', '#f0eee6', '#e6e5df', '#f3f2ee', '#ebe8de', '#eeede8',
  // 4 x black (20 %)
  '#232428', '#1e1f23', '#2a2b30', '#26272c',
  // 3 x silver (15 %)
  '#c4c8cc', '#b9bdc2', '#cfd2d4',
  // 2 x grey (10 %)
  '#7b7f86', '#686c73',
  // 2 x other: dark blue, deep red (10 %)
  '#2d3a5a', '#8c2f35',
];
/** u in [0, 1) -> a car colour of the Japanese mix (deterministic: pass a seeded random). */
export const carColor = (u) => JP_CAR_COLS[Math.min(JP_CAR_COLS.length - 1, Math.floor(Math.max(0, u) * JP_CAR_COLS.length))];
/** The share of each family in JP_CAR_COLS, for tests and docs. */
export const CAR_MIX = { white: 9 / 20, black: 4 / 20, silver: 3 / 20, grey: 2 / 20, other: 2 / 20 };
