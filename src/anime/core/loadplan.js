// [ui-c2] The loading plan: where the intro card's bar stands at the start of each stage of build(), and what its label says (polish #25, T7; mobile F24; the UI round notes (ui-c2, not included)).
//
// The bar used to be i / (modules + 1): eight equal steps for the modules and then 89 % for everything else. The finishing work (wires, batching, the phone's slimming, compiling the shader
// programs) was ONE step with one label and about half of the wait: the bar sat at 89 % for 35 of 63 s. It was not the shaders (the review guessed so): renderer.compile() hands every
// program to the driver in 0.3 s; the 20 s (10 s on the phone tier) are the STATIC BATCH, one synchronous job that merges the town's meshes by material. So now every stage has a weight
// (its measured share of the load) and its own Japanese label: the bar reaches the finishing steps with a little over half of the time spent, and says 街並みをまとめています… through the long one.
//
// The weights are the measured cost of each stage in a gated cold load of this build (units of 100 ms: tools/anime/ui-c2-check.mjs --steps load, the UI round notes (ui-c2, not included) has the table). They
// are proportions, not promises: another device is faster or slower, but the ORDER of the costs holds, which is what a bar needs; main.js re-reads the device's speed as the stages finish.
//
//   const plan = loadPlan(['environment', 'water', ...], { phone });
//   plan.start('town')  -> 0.22   the bar's fraction when the town module starts
//   plan.end('town')    -> 0.31   ... and when it ends (the next stage's start)
//   plan.label('town')  -> '町並みを準備中…'

/** What the label says while each module builds (the module's own name in the player's words). */
export const MODULE_LABELS = { _ground: '下地', environment: '山と地形', water: '内湾の海', town: '町並み', harbor: '港と船', landmarks: '名所と施設', life: '町の暮らし', ship: '第一昭福丸', explore: '街の地図' };

/** The same labels in English (the page's language is English: ?lang=en or klc.lang). Keyed like MODULE_LABELS / FINISH_LABELS; the module ones read "Preparing <name>…". */
export const MODULE_LABELS_EN = { _ground: 'the ground', environment: 'hills and terrain', water: 'the bay', town: 'streets and houses', harbor: 'the port and boats', landmarks: 'landmarks', life: 'town life', ship: 'Shofuku Maru No.1', explore: 'the map' };
export const FINISH_LABELS_EN = { fonts: 'Loading fonts…', wires: 'Stringing the power lines…', prep: 'Slimming down for your phone…', batch: 'Putting the streets together…', compile: 'Getting ready to draw…' };

/** The English for a label this module made (a Japanese label in, the English one out); anything else comes back unchanged. */
export function labelEn(ja) {
  if (ja === '読み込み中…') return 'Loading…';
  for (const k of Object.keys(FINISH_LABELS)) if (FINISH_LABELS[k] === ja) return FINISH_LABELS_EN[k];
  for (const k of Object.keys(MODULE_LABELS)) if (`${MODULE_LABELS[k]}を準備中…` === ja) return `Preparing ${MODULE_LABELS_EN[k] ?? k}…`;
  return ja;
}

/** The finishing steps, in the order build() does them (the phone has an extra slimming step first). */
export const FINISH_LABELS = {
  fonts: '文字を読み込んでいます…',
  wires: '電線を張っています…',
  prep: 'スマホ向けに軽くしています…',
  batch: '街並みをまとめています…',
  compile: '描画の準備をしています…',
};

/**
 * The relative cost of each stage (units of 100 ms of a cold load; only the proportions matter). `boot` is the share of the whole load that has passed before main.js's build() starts
 * (the page, the bundle and the data files): the bar starts there, not at zero. `compile` also carries main()'s own work after build() up to the title (play's mount, the first
 * update, the title's camera: stats.finish.post), because the bar's 100 % is set when the title is ready.
 *   phone (2026-10-08, [mobile-perf]: the iOS Simulator, cold, two loads of the deploy #7 candidate with the movement and play lanes; stats.finish, ms):
 *            boot ~760, fonts 358, environment 618, water ~180, town 1505, harbor 905, landmarks 438, life 330, ship ~180, explore 1184, wires ~180, slimming ~180,
 *            batch 1122, compile 3506 (the programs: Metal pipelines, a third of the load now that the phone's batch writes its cells directly: it was 10.3 s, compile
 *            0.3 s) + main()'s work before the title ~450 (the klc:ready mark minus the old 100 %: 444, 457, 485)
 *   desktop  boot 3.8 s, fonts 0.3, environment 1.7, water 0.2, town 10.0, harbor 5.8, landmarks 1.3, life 1.7, ship 0.3, explore 2.8, wires 0.55, batch 19.9, compile 0.3 (ui-c2, the build machine)
 */
export const WEIGHTS = {
  desktop: { boot: 38, fonts: 3, environment: 17, water: 2, town: 100, harbor: 58, landmarks: 13, life: 17, ship: 3, explore: 28, wires: 6, batch: 199, compile: 3, other: 10 },
  phone: { boot: 8, fonts: 4, environment: 6, water: 2, town: 15, harbor: 9, landmarks: 4, life: 3, ship: 2, explore: 12, wires: 2, prep: 2, batch: 11, compile: 40, other: 4 },
};

/** The plan for these modules on this tier. A stage that is not in the table weighs `other` (a module added later still moves the bar). */
export function loadPlan(modules, { phone = false } = {}) {
  const W = WEIGHTS[phone ? 'phone' : 'desktop'];
  const keys = ['fonts', ...modules, 'wires', ...(phone ? ['prep'] : []), 'batch', 'compile'];
  const weight = (k) => Math.max(0.001, W[k] ?? W.other);
  const total = W.boot + keys.reduce((s, k) => s + weight(k), 0);
  const at = {}; let acc = W.boot;
  for (const k of keys) { at[k] = acc / total; acc += weight(k); }
  const end = {}; keys.forEach((k, i) => { end[k] = i + 1 < keys.length ? at[keys[i + 1]] : 1; });
  return {
    keys, total, weight,
    start: (k) => at[k] ?? 0,
    end: (k) => end[k] ?? 1,
    /** The share of the stage in the whole (what a creeping bar covers). */
    span: (k) => (end[k] ?? 1) - (at[k] ?? 0),
    label: (k) => (FINISH_LABELS[k] ?? (MODULE_LABELS[k] ? `${MODULE_LABELS[k]}を準備中…` : `${k}を準備中…`)),
  };
}
