// [v6:fix1] Utility-pole corrections at the 結 junction (south shore), from the photo survey: poles are generated along the
// road polylines (town/poles.js), which puts them 5-20 m from where IMG_0829-0832 and 0822 show them. `move` relocates the
// generated pole nearest `from` (within 2.5 m) to `to` (ground cuts of the pole feet at T.P. 2.1; tops from the vertical lines
// through them), `add` stands a pole where a generated one is missing. H = pole height above the ground (m), tr = transformer,
// lamp = street light arm. Docs: docs/anime/survey/minami.md "Poles".
export const POLES6 = {
  move: [
    { from: [-48.5, 24.5], to: [-52.6, 29.2], H: 17.5, tr: true },    // the tall transformer pole at the right of IMG_0829 (foot cut 45 m out, top T.P. 19.7)
    { from: [-31.8, 55.1], to: [-28.2, 61.7], H: 14.5, tr: true },    // the transformer pole mid-frame in IMG_0830 / 0831: its foot is at the lot's edge behind the pavement (IMG_0830 raw (2575, 3745) cut at T.P. 2.1: (-28.15, 61.69), 12 m from the camera; its shaft width, 100 px at f 3978, says 13.9 m); [v6:fix3] 1.8 m west of the old spot: IMG_0913 (heading 1 deg from (-25.3, 74.7)) has no pole in its 17 deg frame, and this one is 12 deg left of its axis
    { from: [0.3, 89.5], to: [-15.75, 93.6], H: 15.2 },               // the pole at x 632 in IMG_0832 (foot cut 36 m out, top T.P. 17.3)
  ],
  remove: [
    { from: [-29.9, 40.1] },                                          // [v6:fix3] IMG_0913 (35 m ahead, 7.6 deg left of the axis, in frame): the photo has no pole in front of the nine one wing; no other photo sees this one
    { from: [153.7, 84.8] },                                          // [v6:fix2] IMG_0895 / 0896: the striped pole 27 m out at the road's edge is not there (guard rail and bollards on the curb, open road behind)
    { from: [171.6, 82.5] },                                          // [v6:fix2] IMG_0895: the pole 44 m out (x 501 of the 1000 px frame) stands ~90 m out in the photo (a small pole at the 魚市場 building); the generated one is half that range and twice the size
    { from: [142.3, 73.7] },                                          // the pole mid-frame in IMG_0895 (13 m from the camera at bearing 112 deg): the photo shows open road there
  ],
  add: [
    { at: [147.4, 83.5], H: 9.2 },                                    // [v6:fix3] IMG_0896: the tall concrete pole of the cluster beside the leaning wooden one (feet cut at T.P. 2.2: (147.46, 83.47) / (147.34, 84.6); top T.P. 11.3 from the vertical through it), two crossarms
    // IMG_0831's crossarm pole (x 160) is the pole at (-15.75, 93.6) of IMG_0832 (same bearing from the station, 36 m out; the base read in 0831 is hidden by a fence, which had put it 23 m out), and its street-light pole (x 559) cannot be placed: IMG_0839 / 0908 contradict the 18 m ground cut. Nothing is added.
  ],
};

/** [v6:fix3] The guard sleeve (the yellow-black tiger stripes) is not on the south shore's poles (IMG_0830, 0913, 0829: bare concrete, one thin reflective band at 1.3 m): off inside this box. */
export const NO_SLEEVE6 = { x: [-130, 230], z: [15, 140] };
