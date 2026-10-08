// [perf] Why three.js recomputes program parameters every frame (the top allocation site: getParameters < getProgram < setProgram).
// Run after the town is up; resolves after `frames` frames with: the lights' state version per frame, how many materials took a new
// program check per frame (by the reason three.js checks: lights version, material version, variant flags), and the lights in the scene.
(async (frames = 30) => {
  const ctx = window.__ctx, r = ctx.renderer, P = r.properties;
  const mats = new Set();
  ctx.scene.traverse((o) => { const m = o.material; if (Array.isArray(m)) m.forEach((x) => mats.add(x)); else if (m) mats.add(m); });
  if (ctx.pipeline?.ndMat) mats.add(ctx.pipeline.ndMat);
  const snap = () => { const s = new Map(); for (const m of mats) { const p = P.get(m); s.set(m, { lv: p.lightsStateVersion, v: p.__version, prog: p.currentProgram, batching: p.batching, instancing: p.instancing, skinning: p.skinning }); } return s; };
  const per = [];
  // the outline pre-pass: one override material for every object; count the variant changes in a frame (each one is a program check)
  const nd = ctx.pipeline.ndMat; let lastVar = null, switches = 0, ndCalls = 0;
  const variant = (o, g) => (o.isInstancedMesh ? 1 : 0) | (o.isSkinnedMesh ? 2 : 0) | (o.isBatchedMesh ? 64 : 0) | (g && g.attributes.color ? (g.attributes.color.itemSize === 4 ? 8 : 4) : 0) | (o.isInstancedMesh && o.instanceColor ? 16 : 0) | (g && g.morphAttributes && g.morphAttributes.position ? 32 : 0);
  const ob = nd.onBeforeRender;
  nd.onBeforeRender = function (rr, sc, cam, g, o) { ndCalls++; const v = variant(o, g); if (v !== lastVar) { switches++; lastVar = v; } return ob.apply(this, arguments); };
  const verNames = new Map();
  // materials drawn on objects of different kinds in one frame (plain, instanced, batched, skinned): each change of kind is a program check
  const kindOf = (o) => (o.isBatchedMesh ? 'B' : o.isInstancedMesh ? 'I' : o.isSkinnedMesh ? 'S' : 'P');
  const lastKind = new Map(); let flips = 0; const flipNames = new Map();
  const wrapped = [];
  for (const m of mats) {
    if (m === nd) continue;
    const ob0 = m.onBeforeRender;
    m.onBeforeRender = function (rr, sc, cam, g, o) { const k = kindOf(o), l = lastKind.get(m); if (l && l !== k) { flips++; const key = (m.name || m.type) + ' ' + l + '>' + k; flipNames.set(key, (flipNames.get(key) || 0) + 1); } lastKind.set(m, k); return ob0.apply(this, arguments); };
    wrapped.push([m, ob0]);
  }
  let prev = snap();
  for (let i = 0; i < frames; i++) {
    await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
    const cur = snap(); let lightsV = 0, verV = 0, progSwap = 0, nd = 0; const names = new Map();
    for (const [m, a] of cur) {
      const b = prev.get(m); if (!b) continue;
      if (a.lv !== b.lv) { lightsV++; names.set(m.name || m.type, (names.get(m.name || m.type) || 0) + 1); }
      if (a.v !== b.v) { verV++; const k = (m.name || '') + ':' + m.type; verNames.set(k, (verNames.get(k) || 0) + 1); }
      if (a.prog !== b.prog) progSwap++;
    }
    const ndp = P.get(ctx.pipeline.ndMat);
    per.push({ lightsChanged: lightsV, versionChanged: verV, programSwapped: progSwap, ndSwitches: switches, ndDraws: ndCalls, kindFlips: flips });
    switches = 0; ndCalls = 0; lastVar = null; flips = 0;
    prev = cur;
  }
  const lights = []; ctx.scene.traverse((o) => { if (o.isLight) lights.push({ type: o.type, name: o.name, visible: o.visible, layers: o.layers.mask, castShadow: !!o.castShadow }); });
  // who uses the materials whose version moves every frame
  const users = new Map(); ctx.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { if (!users.has(m)) users.set(m, []); users.get(m).push(o); } });
  const v0 = new Map([...mats].map((m) => [m, m.version]));
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 0))));
  const bumped = [...mats].filter((m) => m.version !== v0.get(m)).map((m) => { const o = (users.get(m) || [])[0]; const chain = []; for (let x = o; x && chain.length < 5; x = x.parent) chain.push(x.name || x.type); return { type: m.type, name: m.name, dv: m.version - v0.get(m), transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, users: (users.get(m) || []).length, chain: chain.join(' < '), keys: Object.keys(m.userData || {}).join(',') }; });
  const litMats = [...mats].filter((m) => P.get(m).needsLights).length;
  nd.onBeforeRender = ob;
  for (const [m, ob0] of wrapped) m.onBeforeRender = ob0;
  const topFlips = [...flipNames].sort((x, y) => y[1] - x[1]).slice(0, 12);
  return JSON.stringify({ materials: mats.size, litMats, perFrame: per.slice(0, 6), versionBumps: Object.fromEntries(verNames), topFlips, lightCount: lights.length });
})();
