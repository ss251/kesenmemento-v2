// [ippon] Handling for the second boat. 第一昭福丸 stays on BOAT in explore/sail.js (the voyage tests pin those
// numbers). This hull is a game model of a 近海かつお船: trade range about 80–180 t, licence line under 120 GT.
// A measured 71 t boat is 23.65 × 5.27 m (第五萬漁丸, JAMARC). 28 × 5.8 m sits in that class and is lighter
// than the 58.6 m longliner. It is not a measured hull and not a real boat's name.
// https://fra.repo.nii.ac.jp/record/2016706/files/jam_n_452.pdf

export const KN = 0.514444;

/** 28 m, 5.8 m beam. Harbour pace 7.5 kn (quicker than the longliner's 6 kn).
 *  Camera and engine fields are read by createSail; absent on BOAT, so 第一昭福丸 keeps her chase camera and thump. */
export const KATSUO = {
  id: 'katsuo',
  L: 28, B: 5.8,
  vMax: 7.5 * KN,
  accel: 0.34,
  astern: 0.38,
  linDrag: 0.02,
  turnDrag: 0.22,
  engineLag: 1.5,
  rudderRate: 0.7,
  R0: 58,
  Tn: 2.8,
  slip: 0.1,
  slipLag: 2.4,
  boostX: 4,
  tcRate: 1.1,
  margin: 1.6,
  friction: 2.2,
  camBack: 40, camSpeed: 1.15, camHeight: 14, camPitch: 36, lookAhead: 10, lookY: 4.2, playerY: 2.8,
  engineHz: 36, engineRise: 20, engineHarm: 1.7,
};

/** Hull sample points [port +x, forward +z] from midship, same layout as the longliner's samples. */
export function samplesFor(L, B) {
  const h = B / 2, F = L / 2;
  const pts = [[0, F], [0, -F]];
  for (const [w, z] of [[h * 0.62, F - L * 0.1], [h, F * 0.35], [h, 0], [h, -F * 0.35], [h * 0.82, -F + 1.2]]) pts.push([w, z], [-w, z]);
  return pts;
}

export const KATSUO_SAMPLES = samplesFor(KATSUO.L, KATSUO.B);
KATSUO.samples = KATSUO_SAMPLES;
