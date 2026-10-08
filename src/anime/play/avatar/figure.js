// [play] The original walker. Three gender-neutral looks on the cast-kit rig
// (sex is the proportion set, not a person). No likeness of anyone in town.
// A custom character, when its module loads, replaces this group. This file never models that character.

import { Human } from '../../world/life/characters/human.js';
import { Driver, rotMul } from '../../world/life/characters/anim.js';
import { lerp, smooth } from '../../world/life/characters/skin.js';
import { footAmp } from './pose.js';

const SKIN = '#f3d5c1';
const FACE = {
  skin: SKIN, ink: '#3b3144', eyeP: 24, eyeT: -12, eyeW: 19, eyeH: 18, irisDark: '#3e3a58', irisMid: '#5f6488', irisLight: '#a9b0cc',
  lash: 0.7, lidTop: -0.48, iris: 0.36, irisH: 0.48, brow: '#5c5348', browW: 2.0, browGap: 3.4, browArch: 1.6,
  noseT: -32, mouthT: -52, mouthW: 9, smile: 0.25, blush: 0.4, blushLines: false,
};
const HAIR = {
  fringe: { n: 5, span: 50, tip: 16, skew: 12, w: 0.055, part: 6, partAt: -14, edgeDrop: 8 },
  hairlineSide: -10, hairlineBack: -64, volume: 1.05,
};
const HAIR_TEX = { top: '#4a4660', base: '#3f3c52', tip: '#3b374b', hi: '#716f90', hi2: '#9a98b8' };

// 藍色 / 生成り色 / 浅葱色 (docs/CRAFT.md). The clothes are the look; the rig is shared.
export const LOOK = {
  navy: { top: 'hoodie', topColor: '#165E83', band: '#0f4664', bottomColor: '#2a3544' },
  kinari: { top: 'shirt', topColor: '#F4EFE4', collar: '#F4EFE4', tucked: true, bottomColor: '#8d8478' },
  asagi: { top: 'jacket', topColor: '#00A3AF', band: '#0c7c86', bottomColor: '#314048' },
};

export function specFor(look) {
  const o = LOOK[look] || LOOK.navy;
  return {
    key: 'play-' + (LOOK[look] ? look : 'navy'),
    sex: 'f', height: 1.62, width: 1.0, seed: 7, skin: SKIN, ears: true,
    face: FACE, hair: HAIR, hairTex: HAIR_TEX,
    outfit: {
      top: o.top, topColor: o.topColor, band: o.band, collar: o.collar, tucked: o.tucked,
      bottom: 'trousers', bottomColor: o.bottomColor,
      shoes: { color: '#3a3f4a', sole: '#2a2e36', type: 'sneaker' },
    },
  };
}

export function createFigure(ctx, look) {
  const human = new Human(ctx, specFor(look));
  human.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  const driver = new Driver(ctx, human, { seed: 3, wind: 0.6 });
  ctx.add(human.group);
  if (ctx.noOutline) ctx.noOutline(human.group);
  return { human, driver, group: human.group, look };
}

function gait(h, d, phase, walking, fwd, roll, speed) {
  const P = h.P, b = h.b;
  const A = footAmp(speed, P.k);
  const ph = walking ? phase : 0;
  const s1 = Math.sin(ph * Math.PI);
  b.hips.position.y += walking ? -0.018 + 0.02 * Math.abs(s1) : 0;
  b.hips.position.x += 0.016 * s1 * (walking ? 1 : 0);
  rotMul(b.hips, 0.03 + fwd, 0.07 * s1 * (walking ? 1 : 0), 0.025 * s1 * (walking ? 1 : 0) + roll);
  h.group.updateMatrixWorld(true);
  const lift = walking ? 0.07 : 0;
  const foot = (n, off) => {
    const sgn = n === 'L' ? 1 : -1;
    const p = ((ph + off) % 2 + 2) % 2;
    let zf, yf = P.ankle;
    if (!walking) zf = sgn * 0.02;
    else if (p < 1.15) zf = lerp(A, -A, p / 1.15);
    else { const q = (p - 1.15) / 0.85; zf = lerp(-A, A, smooth(0, 1, q)); yf += lift * Math.sin(q * Math.PI); }
    return [sgn * P.hipJx * 1.05, yf, zf];
  };
  d.leg('L', foot('L', 0), 0.12, [0.1, 1]);
  d.leg('R', foot('R', 1), -0.12, [0.1, 1]);
  rotMul(b.spine, 0.04 + fwd * 0.45, -0.05 * s1 * (walking ? 1 : 0), roll * 0.65);
  rotMul(b.chest, 0.02, -0.06 * s1 * (walking ? 1 : 0), roll * 0.25);
}

const _opt = {};

/** Place the rig, then the clip. `yaw` is the player's yaw (0 = north); the figure's front is local +Z.
 *  `o`: { speed, lean (roll into the turn), squash: { y, xz } }. The squash is the original walker only. */
export function poseFigure(fig, clip, phase, t, dt, yawErr, o) {
  const d = fig.driver, h = fig.human, P = h.P, b = h.b;
  const opt = o || _opt;
  const roll = opt.lean || 0;
  d.reset();
  if (clip === 'jump') {
    d.stand({ hy: 0.05, footL: [P.hipJx, P.ankle + 0.14, -0.06], footR: [-P.hipJx, P.ankle + 0.08, 0.02] });
    d.arm('L', 1.15, 0.25, 0, 0.35);
    d.arm('R', 1.15, 0.25, 0, 0.35);
  } else if (clip === 'fall') {
    d.stand({ hrx: 0.18, footL: [P.hipJx, P.ankle, 0.1], footR: [-P.hipJx, P.ankle, -0.02] });
    d.arm('L', 0.35, 0.95, 0, 0.15);
    d.arm('R', 0.35, 0.95, 0, 0.15);
  } else if (clip === 'land') {
    d.stand({ hy: -0.1, hrx: 0.34 });
    d.arm('L', 0.45, 0.15, 0, 0.55);
    d.arm('R', 0.45, 0.15, 0, 0.55);
    rotMul(b.spine, 0.08, 0, roll);
  } else if (clip === 'turn') {
    const twist = Math.max(-0.55, Math.min(0.55, yawErr));
    d.stand({ hry: twist, hrz: roll });
    d.arm('L', 0.12, 0.22, 0, 0.22);
    d.arm('R', 0.12, 0.22, 0, 0.22);
    rotMul(b.spine, 0.04, -twist * 0.35, roll * 0.65);
  } else {
    const walking = clip === 'walk' || clip === 'run';
    gait(h, d, phase, walking, clip === 'run' ? 0.1 : 0, roll, opt.speed || 0);
    const s = walking ? Math.sin(phase * Math.PI) : 0;
    d.arm('L', 0.15 + (walking ? 0.5 * -s : 0), 0.16, 0, walking ? 0.32 : 0.18);
    d.arm('R', 0.15 + (walking ? 0.5 * s : 0), 0.16, 0, walking ? 0.32 : 0.18);
  }
  const squash = opt.squash;
  const g = fig.group;
  if (squash && squash.y > 0 && squash.y < 1) g.scale.set(squash.xz, squash.y, squash.xz);
  else g.scale.set(1, 1, 1);
  d.breathe(t, clip === 'idle' || clip === 'turn' ? 1 : 0.45);
  d.blink(t);
  try { d.wind(t, dt, { boost: clip === 'run' ? 1.15 : 0.65 }); } catch (e) { /* a ctx without uWind still stands */ }
}
