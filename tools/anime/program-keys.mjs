// [mobile-perf] Decode three.js (r186) program cache keys into the switches that made each program, and show which switches split a
// shader kind into variants. Input: the --keys file of tools/anime/phone-budget.mjs.
//   env -u NODE_OPTIONS bun tools/anime/program-keys.mjs keys.json [--kind toon] [--list]
import { readFileSync } from 'node:fs';
const M1 = ['instancing', 'instancingColor', 'instancingMorph', 'matcap', 'envMap', 'normalMapObjectSpace', 'normalMapTangentSpace', 'clearcoat', 'iridescence', 'alphaTest', 'vertexColors', 'vertexAlphas', 'vertexUv1s', 'vertexUv2s', 'vertexUv3s', 'vertexTangents', 'anisotropy', 'alphaHash', 'batching', 'dispersion', 'batchingColor', 'gradientMap', 'packedNormalMap', 'vertexNormals', 'retroreflection'];
const M2 = ['fog', 'useFog', 'flatShading', 'logDepth', 'reversedDepth', 'skinning', 'morphTargets', 'morphNormals', 'morphColors', 'premultipliedAlpha', 'shadowMapEnabled', 'doubleSided', 'flipSided', 'useDepthPacking', 'dithering', 'transmission', 'sheen', 'opaque', 'pointsUvs', 'decodeVideoTexture', 'decodeVideoTextureEmissive', 'alphaToCoverage', 'lightProbeGrids', 'hasPositionAttribute'];
const PARAMS = ['precision', 'outputColorSpace', 'envMapMode', 'envMapCubeUVHeight', 'mapUv', 'alphaMapUv', 'lightMapUv', 'aoMapUv', 'bumpMapUv', 'normalMapUv', 'displacementMapUv', 'emissiveMapUv', 'metalnessMapUv', 'roughnessMapUv', 'anisotropyMapUv', 'clearcoatMapUv', 'clearcoatNormalMapUv', 'clearcoatRoughnessMapUv', 'iridescenceMapUv', 'iridescenceThicknessMapUv', 'sheenColorMapUv', 'sheenRoughnessMapUv', 'specularMapUv', 'specularColorMapUv', 'specularIntensityMapUv', 'transmissionMapUv', 'thicknessMapUv', 'combine', 'fogExp2', 'sizeAttenuation', 'morphTargetsCount', 'morphAttributeCount', 'numSunLights', 'numDirLights', 'numPointLights', 'numSpotLights', 'numSpotLightMaps', 'numHemiLights', 'numRectAreaLights', 'numSunLightShadows', 'numDirLightShadows', 'numPointLightShadows', 'numSpotLightShadows', 'numSpotLightShadowsWithMaps', 'numLightProbes', 'shadowMapType', 'toneMapping', 'numClippingPlanes', 'numClipIntersection', 'depthPacking'];
export function decode(key) {
  const a = key.split(',');
  const custom = a.pop(), outCS = a.pop(), m2 = Number(a.pop()), m1 = Number(a.pop());
  const params = a.splice(a.length - PARAMS.length, PARAMS.length);
  const out = { head: a.join(','), custom, rendererCS: outCS };
  PARAMS.forEach((k, i) => { const v = params[i]; if (v !== 'false' && v !== '' && v !== '0' && v !== undefined) out[k] = v; });
  M1.forEach((k, i) => { if (m1 & (1 << i)) out[k] = true; });
  M2.forEach((k, i) => { if (m2 & (1 << i)) out[k] = true; });
  return out;
}
if (import.meta.main) {
  const argv = process.argv.slice(2);
  const keys = JSON.parse(readFileSync(argv[0], 'utf8'));
  const kindArg = argv.includes('--kind') ? argv[argv.indexOf('--kind') + 1] : null;
  const rows = keys.map((k) => ({ name: k.name, used: k.used, ...decode(k.key) }));
  const kindOf = (r) => r.head.split(',')[0];
  const kinds = {}; for (const r of rows) (kinds[kindOf(r)] ||= []).push(r);
  for (const [kind, list] of Object.entries(kinds).sort((a, b) => b[1].length - a[1].length)) {
    if (kindArg && kind !== kindArg) continue;
    const fields = new Set(); for (const r of list) for (const k in r) fields.add(k);
    const vary = {};
    for (const f of fields) { if (f === 'used' || f === 'name') continue; const vals = {}; for (const r of list) { const v = String(r[f] ?? '-'); vals[v] = (vals[v] || 0) + 1; } if (Object.keys(vals).length > 1) vary[f] = vals; }
    console.log(`\n== ${kind}: ${list.length} programs`);
    for (const [f, vals] of Object.entries(vary)) console.log(`  ${f}: ${Object.entries(vals).map(([v, n]) => `${v.slice(0, 40)}=${n}`).join('  ')}`);
    if (argv.includes('--list')) for (const r of list) console.log('   ', JSON.stringify(r).slice(0, 400));
  }
}
