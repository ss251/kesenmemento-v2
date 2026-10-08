// [play] The walker character slot. The default id is `meme`.
// Until that module is in this build, load() fails quietly and the original figure walks.
//
// Contract a model module must meet. It exports `build`:
//
//   build(THREE, { quality, mat, calm }) → {
//     root,            // Object3D, feet at y = 0, facing −Z. The walker moves and yaws this, and never scales it.
//     mesh,            // the skinned body, or null
//     setPose(name),   // 'auto' | 'idle' | 'walk' | 'run' | 'jump' | 'fall'
//     update(dt, { speed, onGround, vy, cadence, run }),
//     dispose(),
//     setLift(night0to1),
//     setCalm(bool),
//     gait(speed, run) → { travel, stance, run, hz, rate }
//   }
//
// `load` returns that object, or null when the module is missing, `build` is absent,
// `build` returns null, or `build` throws. Nothing is written to the console.
// The picker lists メメ only when the module loads.

import { CHARACTER_SPEED } from './pose.js';

export const DEFAULT_ID = 'meme';

// The import is literal so scripts/anime/optional-meme.js can see it. That plugin bundles
// the file when it is in the tree, and an empty module when it is not, so the browser never
// requests a missing URL. An empty module has no build, and the picker leaves メメ off.
export const CHARACTERS = Object.freeze([
  Object.freeze({
    id: 'meme',
    label: Object.freeze({ ja: 'メメ', en: 'Meme' }),
    height: 1.15,   // m, soles to the tip; meme-model.js exports the same as MEME_HEIGHT
    speed: CHARACTER_SPEED,
    load: (THREE, opts) => import('./meme-model.js').then((m) => (typeof m.build === 'function' ? m.build(THREE, opts) : null)),
  }),
  Object.freeze({
    id: 'original',
    label: Object.freeze({ ja: 'オリジナル', en: 'Original' }),
    height: 1.62,
    speed: Object.freeze({ walk: null, run: null }),
    load: () => Promise.resolve(null),
  }),
]);

export function characterById(id) {
  return CHARACTERS.find((c) => c.id === id) || null;
}

/** Quiet load. Missing module, a null build, or a throw → null. */
export async function loadCharacter(id, THREE, opts) {
  const spec = characterById(id);
  if (!spec || spec.id === 'original') return null;
  try {
    const built = await spec.load(THREE, opts);
    return built && built.root ? built : null;
  } catch {
    return null;
  }
}

/** Ids the 姿 picker may offer. メメ is included only when its module loads. */
export async function pickerIds() {
  const ids = [];
  try {
    const m = await import('./meme-model.js');
    if (m && typeof m.build === 'function') ids.push('meme');
  } catch { /* not in this build */ }
  ids.push('original');
  return ids;
}
