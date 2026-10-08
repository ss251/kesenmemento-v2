// [v6:phone-budget] phonemem --eval: the phone tier's atlas inputs in the shape of test/fixtures/phone-atlas-tiles.json.
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/phonemem.mjs --port <yours> --url http://127.0.0.1:<port>/ \
//       --start --eval tools/anime/atlas-dump.js --out /tmp/phone-atlas.json
//   jq '.eval' /tmp/phone-atlas.json > test/fixtures/phone-atlas-tiles.json      # then re-pin test/v6-phone-budget.test.js
//
// sets: the source size [w, h] of every canvas tile batched into each atlas (core/batch2.js's window.__atlas): 'static' (the
// town and harbour), 'interiors' (the walk-in interiors) and one 'arrival-N' per arriving boat (today's list: it varies).
// measured: texMB is the whole texture estimate of the page (phonemem's formula), atlasMB the atlas pages as built, and
// nonAtlasMB the rest (the ship's livery, the 512 px canvases, the characters, ...). The run's tier must be the phone tier.
(() => {
  const ctx = window.__ctx, log = window.__atlas || [];
  const sets = {}; let n = 0, atlasMB = 0;
  for (const a of log) {
    if (!a.tiles.length) continue;
    const name = a.root === 'static' ? 'static' : a.root === 'explore-interiors' ? 'interiors' : `arrival-${++n}`;
    sets[name] = a.tiles;
    atlasMB += a.pages.reduce((s, p) => s + (p[0] * p[1] * 4 * 1.33) / 1e6, 0);
  }
  const seen = new Set(); let texBytes = 0;
  const add = (t) => { if (!t || seen.has(t)) return; seen.add(t); const im = t.image, bpp = t.type === 1016 ? 8 : t.type === 1015 ? 16 : 4; texBytes += (im?.width || 0) * (im?.height || 0) * (im?.depth || 1) * bpp * (t.generateMipmaps !== false && t.minFilter >= 1008 ? 1.33 : 1); };
  ctx.scene.traverse((o) => { for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) { for (const k in m) if (m[k]?.isTexture) add(m[k]); if (m.uniforms) for (const k in m.uniforms) if (m.uniforms[k]?.value?.isTexture) add(m.uniforms[k].value); } });
  const texMB = texBytes / 1e6;
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    _note: `Phone-tier (390x844, DPR 3) static-batch atlas inputs measured with tools/anime/phonemem.mjs (town after the intro card): the source size [w, h] of every canvas texture batched into each atlas, plus the estimate of every other texture. test/v6-phone-budget.test.js lays them out with planAtlas and pins the megabytes.`,
    page: 2048, tileMax: 512,
    measured: { texMB: r1(texMB), atlasMB: r1(atlasMB), nonAtlasMB: r1(texMB - atlasMB), budgetMB: 240, quality: ctx.quality.tier },
    sets,
  };
})()
