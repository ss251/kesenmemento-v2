// [play:missions] One townsperson from the cast kit: a painted face, a blink, a look-at. No likeness, no wind (wind allocates).
import * as THREE from 'three';
import { Human } from '../../world/life/characters/human.js';
import { Driver } from '../../world/life/characters/anim.js';
import { LOOKS } from '../../world/life/cast.js';

const _look = new THREE.Vector3();

/** Build a figure. The caller places it and decides when it is visible. */
export function buildFigure(ctx, npc) {
  const r = ctx.rng('play-npc-' + npc.id);
  const fn = LOOKS[npc.look] || LOOKS.townMan;
  const spec = fn(r, npc.lookI ?? 0);
  spec.key = 'play-' + npc.id;
  spec.seed = npc.seed;
  spec.variants = ['open', 'blink'];
  spec.props = [];
  const h = new Human(ctx, spec);
  const d = new Driver(ctx, h, { seed: spec.seed });
  h.group.traverse((o) => {
    o.userData.dynamic = true;
    o.userData.noBatch = true;
    if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
  });
  h.group.name = 'play-npc-' + npc.id;
  return { h, d, spec };
}

/** A world point to look at: the player when they are close, otherwise a few metres along the facing. */
export function lookPoint(npc, player, out) {
  const dx = player.x - npc.x, dz = player.z - npc.z;
  if (dx * dx + dz * dz < 64) {
    out.x = player.x; out.y = player.y + 1.5; out.z = player.z;
  } else {
    out.x = npc.x + Math.sin(npc.yaw) * 4;
    out.y = npc.y + 1.5;
    out.z = npc.z + Math.cos(npc.yaw) * 4;
  }
  return out;
}

/** Plant the feet, idle the arms, breathe, look, blink. dt only eases the head. */
export function poseFigure(npc, t, dt, look) {
  const { h, d } = npc;
  if (!h || !d) return;
  const sw = Math.sin(t * 0.7 + (npc.seed || 0) * 0.013);
  const pose = idlePose(npc.idle, t, sw);
  d.place(npc.x, npc.y, npc.z, npc.yaw);
  d.reset();
  d.stand(pose.stand);
  d.breathe(t, pose.breath);
  d.arm('R', pose.R[0], pose.R[1], pose.R[2], pose.R[3]);
  d.arm('L', pose.L[0], pose.L[1], pose.L[2], pose.L[3]);
  if (look) {
    _look.set(look.x, look.y, look.z);
    d.lookAt(_look, dt, { speed: 2.2, maxYaw: 1.05 });
  }
  d.blink(t);
}

/**
 * Poses that still read at 20 m: a wave overhead, a broom that crosses the body,
 * hands working a net. The numbers are radians on the cast rig (fwd, out, twist, elbow).
 */
export function idlePose(idle, t, sw) {
  const w = Math.sin(t * 1.7);
  const stand = { hx: 0.012 * sw, hrz: 0.01 * sw, stance: 1.06 };
  switch (idle) {
    case 'wave': {
      const wv = Math.sin(t * 6.2);
      return {
        stand: { hrx: -0.06, stance: 1.04 },
        breath: 1,
        R: [2.35, 0.2 + 0.55 * wv, 0.12 * wv, 0.32],
        L: [0.22, 0.32, 0, 0.18],
      };
    }
    case 'sweep': {
      const s = Math.sin(t * 2.4);
      return {
        stand: { hx: 0.05 * s, hrx: 0.22, hrz: 0.16 * s, stance: 1.18 },
        breath: 0.75,
        R: [1.05, 0.2 + 0.95 * s, 0.04, 0.25],
        L: [0.5, 0.22, 0, 0.4],
      };
    }
    case 'mend': {
      const m = Math.sin(t * 3.4);
      return {
        stand: { hrx: 0.42, hrz: 0.08 * m, stance: 1.22 },
        breath: 0.65,
        R: [1.2, 0.2, 0.4 * m, 1.05 + 0.5 * m],
        L: [1.1, 0.16, -0.28 * m, 1.3 - 0.45 * m],
      };
    }
    case 'point':
      return { stand, breath: 1, R: [0.85 + 0.08 * sw, 0.7, 0, 0.1], L: [0.2, 0.2, 0, 0.25] };
    case 'hike':
      return { stand, breath: 1, R: [0.45 + 0.12 * sw, 0.35, 0, 0.45], L: [0.28, 0.3, 0, 0.55] };
    case 'coil':
      return { stand: { hrx: 0.2, stance: 1.1 }, breath: 0.8, R: [0.7, 0.55, 0.2, 1.35], L: [0.55, 0.4, -0.1, 1.05] };
    case 'lean':
      return { stand: { hrx: 0.12, stance: 1.08 }, breath: 1, R: [0.35, 0.55, 0, 0.8], L: [0.28, 0.48, 0, 0.72] };
    case 'scan':
      return { stand, breath: 1, R: [0.2, 0.22, 0, 0.15], L: [0.45 + 0.15 * w, 0.6, 0, 0.9] };
    default:
      return { stand, breath: 1, R: [0.18, 0.22, 0, 0.16], L: [0.18, 0.22, 0, 0.16] };
  }
}
