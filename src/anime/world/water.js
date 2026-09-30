// [v3:foundation] water — anime bay water for the whole of Kesennuma bay (and rivers), V3-SPEC section 5.
// One flat plane at L.SEA.level (tide may offset it at runtime: set L.SEA.level). MeshToonMaterial patched so it
// still receives the cel shadows of quays, boats and the seawall, with:
//   - flat colour bands by distance from the shore (shallow teal -> harbour blue -> deep navy), never a normal map;
//   - crisp white foam lines along every quay / seawall / beach (a steady line + a lapping second line);
//   - gentle painted wave streaks drifting with the wind, fading with distance;
//   - soft sky reflection (fresnel toward the painted horizon, warm under the sun);
//   - sun sparkles: a glittering path toward the sun that blooms at golden hour.
// Shore distance comes from the layout grids (data/anime/grids.bin) as RG half-float textures (R = metres from the
// shore, + sea / - land; G = water class 0 land, 1 sea, 2 river). Publishes ctx.services.water.
import * as THREE from 'three';
import * as L from './layout.js';
import { seasonUniform } from '../core/season.js';   // [v3:integrate]
import { sharedHardShores } from './layout/hardshore.js';   // [v3:fix]

function gridTexture(g) {
  const n = g.w * g.h, data = new Uint16Array(n * 2);
  const sdf = g.data.sdf, wat = g.data.wat;
  for (let k = 0; k < n; k++) { data[k * 2] = THREE.DataUtils.toHalfFloat(sdf[k] * 0.1); data[k * 2 + 1] = THREE.DataUtils.toHalfFloat(wat[k]); }
  const t = new THREE.DataTexture(data, g.w, g.h, THREE.RGFormat, THREE.HalfFloatType);
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

export function waterMaterial(ctx, o = {}) {
  const C = (c) => new THREE.Color(c);
  const G = L.GRIDS;
  const box = (g) => new THREE.Vector4(g.x0, g.z0, 1 / (g.w * g.d), 1 / (g.h * g.d));
  const sky = ctx.sky?.uniforms;
  // [v3:fix] hard-shore mask over the mid zone: quay / seawall faces drop into deep water (no shallow teal band there)
  const HM = sharedHardShores(L).maskTexture(THREE, { x0: L.ZONES.mid.cx - L.ZONES.mid.r - 200, z0: L.ZONES.mid.cz - L.ZONES.mid.r - 200, x1: L.ZONES.mid.cx + L.ZONES.mid.r + 200, z1: L.ZONES.mid.cz + L.ZONES.mid.r + 200 }, 4);
  const U = {
    tHard: { value: HM.tex }, uBbHard: { value: new THREE.Vector4(HM.box.x0, HM.box.z0, 1 / (HM.box.x1 - HM.box.x0), 1 / (HM.box.z1 - HM.box.z0)) },
    tCore: { value: gridTexture(G.core) }, tCity: { value: gridTexture(G.city) },
    uBbCore: { value: box(G.core) }, uBbCity: { value: box(G.city) },
    // [v3:fix] a touch less saturated (the bay read as flat poster blue); depth + wind bands carry the variation
    uShallow: { value: C(o.shallow || '#83c2bd') }, uMid: { value: C(o.mid || '#4a8fac') }, uDeep: { value: C(o.deep || '#336d95') }, uOcean: { value: C(o.ocean || '#2d5f88') },
    uRiver: { value: C(o.river || '#6aa7a4') }, uFoam: { value: C('#f4f8f6') },
    uSkyHorizon: sky?.uHorizon || { value: C('#dfe9f2') }, uSkyMid: sky?.uMid || { value: C('#8fbde9') }, uSkyWarm: sky?.uWarm || { value: C('#fbe3cf') },
    uNightW: sky?.uNight || { value: 0 },
    uDuskW: sky?.uDusk || { value: 0 },   // [v3:polish] ripple strokes a little stronger at dusk
    // [v3:integrate] mirror sky after sunset + warm light streaks from the lit waterfront at night
    uSkyZenith: sky?.uZenith || { value: C('#4d86cf') }, uSkySun: sky?.uSun || { value: new THREE.Vector3(0, 1, 0) },
    uSeasonW: seasonUniform(ctx.shared),   // [v3:integrate] winter: colder, deeper sea
    uMornW: sky?.uMorning || { value: 0 },   // [v3:polish3] 朝: a paler pearl sheen
  };
  const m = new THREE.MeshToonMaterial({ color: C('#ffffff'), gradientMap: ctx.mat.gradientMap });
  m.name = 'water-bay';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.uniforms.uTime = ctx.shared.uTime; sh.uniforms.uSunW = ctx.shared.uSunDir; sh.uniforms.uWindW = ctx.shared.uWind;
    sh.uniforms.uLampsW = ctx.shared.uLamps || { value: 0 };   // [v3:integrate] life's lamps factor (compiled after life built)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      // [v3:fix] shadows on the water at ~40 % (a hard black-blue slab under the market read as a hole in the sea)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.split('( directLight.visible && receiveShadow ) ? getShadow(').join('( directLight.visible && receiveShadow ) ? 0.6 + 0.4 * getShadow('))
      .replace('#include <common>', `#include <common>
        varying vec3 vWp;
        uniform sampler2D tCore, tCity, tHard; uniform vec4 uBbCore, uBbCity, uBbHard; uniform float uTime, uNightW;
        uniform vec3 uShallow, uMid, uDeep, uOcean, uRiver, uFoam, uSkyHorizon, uSkyMid, uSkyWarm, uSunW; uniform vec2 uWindW;
        uniform vec3 uSkyZenith, uSkySun; uniform float uLampsW, uDuskW, uMornW; uniform vec4 uSeasonW;
        float w_h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float w_vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(w_h21(i), w_h21(i + vec2(1, 0)), f.x), mix(w_h21(i + vec2(0, 1)), w_h21(i + vec2(1, 1)), f.x), f.y); }
        vec2 w_field(vec2 xz){
          vec2 uc = (xz - uBbCore.xy) * uBbCore.zw, uf = (xz - uBbCity.xy) * uBbCity.zw;
          float e = min(min(uc.x, 1.0 - uc.x), min(uc.y, 1.0 - uc.y));
          vec2 a = texture2D(tCity, clamp(uf, 0.0, 1.0)).rg;
          float outside = step(1.0, max(max(-uf.x, uf.x - 1.0), max(-uf.y, uf.y - 1.0)) * 1e4);
          a = mix(a, vec2(300.0, 1.0), outside);   // beyond the city bbox: open sea
          if (e > 0.0) { vec2 b = texture2D(tCore, uc).rg; a = mix(a, b, smoothstep(0.0, 0.015, e)); }
          return a;
        }
        vec3 gWaterEmis;
        // [v3:fix] world-anchored noise elongated ACROSS the view: two layers (along world X / along world Z) weighted by
        // the camera heading, so painted streaks and ripples lie horizontal on screen and never swim when the view turns
        float w_across(vec2 xz, vec2 cf, float kLong, float kShort, vec2 drift, float seed){
          float nx = w_vn(vec2(xz.x * kLong + drift.x, xz.y * kShort + drift.y) + seed);
          float nz = w_vn(vec2(xz.y * kLong + drift.x, xz.x * kShort + drift.y) + seed + 17.0);
          float wx = cf.y * cf.y, wz = cf.x * cf.x;
          return (nx * wx + nz * wz) / max(wx + wz, 1e-4);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 xz = vWp.xz;
          vec2 fd = w_field(xz);
          float sdf = fd.r, river = smoothstep(1.2, 1.8, fd.g) + (1.0 - smoothstep(-0.5, 0.5, fd.g)) * step(sdf, 0.0);
          river = clamp(river, 0.0, 1.0);
          float dist = length(vWp - cameraPosition);
          // colour bands by distance from the shore (anime: few flat bands with soft 1.5 m transitions)
          float d = max(sdf, 0.0);
          // [v3:fix] hard shores (quays, seawalls) have no shoal: deep harbour water right up to the wall
          vec2 uh = (xz - uBbHard.xy) * uBbHard.zw;
          float hard = texture2D(tHard, clamp(uh, 0.0, 1.0)).r * step(0.0, uh.x) * step(uh.x, 1.0) * step(0.0, uh.y) * step(uh.y, 1.0);
          // [v3:polish2] the pale shoal is a thin band hugging the real shore (core grid); off the coarse city grid it is
          // narrower still, and at night it takes the mid tone (it glowed cyan in the dark bay)
          vec2 ucK = (xz - uBbCore.xy) * uBbCore.zw;
          float coreK = smoothstep(0.0, 0.015, min(min(ucK.x, 1.0 - ucK.x), min(ucK.y, 1.0 - ucK.y)));
          vec3 col = uShallow;
          col = mix(col, uMid, max(max(smoothstep(mix(1.5, 3.0, coreK), mix(3.0, 5.5, coreK), d), smoothstep(0.15, 0.6, hard)), 1.0 - coreK));   // [v3:polish3] the pale shoal only on the fine core grid (the coarse city grid drew hard teal triangles off 大島)
          col = mix(col, uMid, (1.0 - smoothstep(7.0, 10.0, d)) * uNightW * 0.8);
          col = mix(col, uDeep, smoothstep(30.0, 150.0, d) * 0.85);
          col = mix(col, uOcean, smoothstep(600.0, 900.0, d));
          col = mix(col, uRiver, river);
          col = mix(col, col * vec3(0.72, 0.84, 0.92), uSeasonW.w);   // [v3:integrate] winter sea
          col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))) * vec3(0.9, 0.97, 1.08), uSeasonW.w * 0.45);   // [v3:fix] desaturated winter sea
          // [v3:fix] wind bands: broad slow patches of ruffled (lighter, greyer) and glassy (deeper) water, like cat's paws
          {
            float wb = w_vn(xz * 0.0045 + vec2(uTime * 0.004, -uTime * 0.002)) * 0.65 + w_vn(xz * 0.013 + 3.7) * 0.35;
            float ruffle = smoothstep(0.52, 0.72, wb), glassy = 1.0 - smoothstep(0.22, 0.4, wb);
            float farK = 1.0 - smoothstep(1500.0, 5000.0, length(vWp - cameraPosition));
            col = mix(col, mix(col, vec3(dot(col, vec3(0.33))), 0.25) * 1.08 + 0.02, ruffle * 0.6 * farK);   // [v3:polish] 0.45 -> 0.6: mid-distance detail
            col = mix(col, col * vec3(0.86, 0.92, 0.97), glassy * 0.4 * farK);
          }
          // painted wave streaks drifting with the wind (long thin lighter/darker dashes), fading with distance
          vec2 wd = normalize(uWindW + vec2(1e-4));
          vec2 q = vec2(dot(xz, wd), dot(xz, vec2(-wd.y, wd.x)));
          float lod = 1.0 - smoothstep(250.0, 2500.0, dist);   // [v3:polish] swell bands carry across the whole bay
          // long soft swell bands (read as gentle waves from the drone) + short painted glints up close
          float sw = w_vn(vec2(q.x * 0.012 - uTime * 0.02, q.y * 0.09));
          float swell = smoothstep(0.55, 0.75, sw) * (1.0 - smoothstep(0.75, 0.95, sw));
          float near = 1.0 - smoothstep(60.0, 220.0, dist);
          // [v3:fix] the short near streaks lie across the view (horizontal on screen): along the wind they read as rain
          vec2 camF = normalize(vec2(-viewMatrix[0][2], -viewMatrix[2][2]) + vec2(1e-4));
          float s1 = w_across(xz, camF, 0.05, 0.6, vec2(-uTime * 0.05, 0.0), 0.0);
          float s2 = w_across(xz, camF, 0.12, 1.4, vec2(uTime * 0.08, 0.0), 9.0);
          // [v3:integrate] afterglow: the sun just under the horizon, calm water mirrors the painted sky
          float afterglow = smoothstep(0.06, -0.05, normalize(uSkySun).y) * (1.0 - uNightW);
          float streak = smoothstep(0.8, 0.88, s1 * 0.65 + s2 * 0.45) * near * (1.0 - 0.6 * afterglow);
          float trough = smoothstep(0.62, 0.8, w_vn(vec2(q.x * 0.01 + uTime * 0.01, q.y * 0.06) + 21.0)) * lod;
          col = mix(col, col * 1.1 + 0.02, swell * 0.5 * lod);
          col = mix(col, col * 1.2 + 0.03, streak * 0.45);
          // [v3:fix] painted ripple bands across the view on calm water (strongest in the afterglow mirror), near the camera
          float ripL = 0.0, ripD = 0.0;
          {
            float rb = w_across(xz, camF, 0.035, 0.55, vec2(uTime * 0.01, -uTime * 0.12), 31.0);
            float band = smoothstep(0.62, 0.72, rb) * (1.0 - smoothstep(0.72, 0.86, rb));
            float nearR = 1.0 - smoothstep(40.0, 480.0, dist);
            // [v3:polish] calm-water ripples carry the foreground (the magic-hour mirror read as a dead flat plane): a light
            // stroke with a deeper shadow stroke just below it, both across the view, fading out by ~480 m
            float shade = smoothstep(0.34, 0.42, rb) * (1.0 - smoothstep(0.42, 0.52, rb));
            // applied after the sky mirror mix below (at grazing angles the fresnel sky replaced them entirely)
            ripL = band * nearR * (0.55 + 0.35 * afterglow + 0.2 * uDuskW);
            ripD = shade * nearR * (0.22 + 0.25 * uDuskW);
          }
          col = mix(col, col * 0.9, trough * 0.25);
          // foam: a steady line hugging the shore + a lapping line breathing in and out
          float n = w_vn(xz * 0.35 + uTime * 0.2);
          float lap = 0.5 + 0.5 * sin(uTime * 0.9 + n * 3.0 + xz.x * 0.02);
          float line1 = 1.0 - smoothstep(0.55 + n * 0.5, 0.95 + n * 0.5, sdf);
          // [v3:polish] beyond the mid zone the shore distance comes from the coarse city grid (16 m+ cells): its steady
          // foam line drew a hard angular white polyline (大島 foreground), so it fades out there and the lapping line thins
          line1 *= coreK;
          // [v3:harbor] the lapping line thins up close (it read as a thick white noodle from the quay apron) and
          // breaks into dashes along the shore
          float lw = mix(0.1, 0.35, smoothstep(8.0, 90.0, dist));
          float dashes = smoothstep(0.3, 0.55, w_vn(xz * 0.11 + vec2(uTime * 0.05, 0.0) + 5.0));
          float line2 = smoothstep(lw, 0.0, abs(sdf - (2.2 + lap * 1.6))) * smoothstep(0.35, 0.65, n) * 0.85 * dashes * mix(0.45, 1.0, coreK);
          float foam = max(line1, line2) * step(0.0, sdf + 0.3) * (1.0 - river) * (1.0 - smoothstep(600.0, 2500.0, dist));
          foam *= 1.0 - smoothstep(0.35, 0.75, hard);   // [v3:fix] quay faces carry their own thin foam strip (harbor quay.js)
          col = mix(col, uFoam, foam);
          // sky reflection + sun sparkles (emissive, so they survive the cel ramp and bloom)
          vec3 V = normalize(cameraPosition - vWp);
          float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
          vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
          vec3 S = normalize(uSunW);
          float sd = max(dot(R, S), 0.0);
          vec3 skyC = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.5, R.y));
          skyC = mix(skyC, uSkyZenith, smoothstep(0.45, 1.0, R.y) * afterglow);
          skyC = mix(skyC, uSkyWarm, pow(sd, 3.0) * 0.7);
          skyC = mix(skyC, mix(uSkyHorizon, vec3(0.93, 0.88, 0.9), 0.35), uMornW * 0.45);   // [v3:polish3] pearl morning sheen
          diffuseColor.rgb = mix(col, skyC * 0.92, (fres * (0.42 + 0.4 * afterglow + 0.3 * uMornW) + afterglow * 0.14 + uMornW * 0.16) * (1.0 - foam));
          gWaterEmis = skyC * afterglow * (0.08 + 0.42 * fres) * (1.0 - foam);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.12 + 0.03, ripL * (1.0 - foam));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.84, 0.86, 0.94), ripD * (1.0 - foam));
          gWaterEmis *= 1.0 + 0.35 * ripL - 0.3 * ripD;
          // [v3:integrate] night: warm broken columns of reflected light off the lit waterfront (anime light streaks,
          // anchored in world space across the view, strongest near the shore, fading with distance)
          float nl = smoothstep(0.55, 0.95, uNightW * uLampsW);
          if (nl > 0.01) {
            // [v3:fix] only under the lit waterfront (the hard quays of the hero zone, where the lamps and windows are),
            // sparse columns (~1 in 6), and the breaks jittered per column (evenly spaced breaks read as ladders)
            float lit = smoothstep(0.35, 0.8, hard) * (1.0 - smoothstep(430.0, 560.0, length(xz - vec2(180.0, -20.0))));
            float shoreK = (1.0 - smoothstep(2.0, 18.0, sdf)) * lit;
            float graze = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
            // columns = directions from the camera (vertical on screen); along = distance (the old per-pixel basis
            // on absolute coordinates drew rain-like streaks)
            vec2 rel = xz - cameraPosition.xz;
            float ca = atan(rel.y, rel.x) * 140.0, cb = length(rel);
            float cid = floor(ca), fa = fract(ca) - 0.5;
            float on = step(0.83, w_h21(vec2(cid, 3.0)));
            float wdt = 0.1 + 0.18 * w_h21(vec2(cid, 9.0));
            float colm = (1.0 - smoothstep(wdt * 0.3, wdt, abs(fa))) * on;
            float fq = 0.3 + 0.5 * w_h21(vec2(cid, 11.0));
            float brk = smoothstep(0.42, 0.7, w_vn(vec2(cid * 1.7, cb * fq + w_vn(vec2(cid * 0.7, cb * 0.08)) * 2.5 - uTime * 0.4)));
            vec3 warmC = mix(vec3(1.0, 0.72, 0.4), vec3(1.0, 0.88, 0.66), w_h21(vec2(cid, 5.0)));
            float fadeD = 1.0 - smoothstep(250.0, 1100.0, dist);
            gWaterEmis += warmC * colm * brk * shoreK * fadeD * graze * nl * 0.9 * (1.0 - foam) * (1.0 - river);   // [v3:polish] 0.5 -> 0.9
          }
          // [v3:harbor] sparkles are anime glints (a thin dash across the view + a short vertical cross), not the
          // square 1 m cells they used to be: shape inside each jittered cell, anti-aliased with fwidth, blinking.
          vec2 gp = xz * 0.9 + vec2(uTime * 0.6, -uTime * 0.4);
          vec2 gid = floor(gp), gf = fract(gp) - 0.5;
          float sp = w_h21(gid);
          gf -= (vec2(w_h21(gid + 3.1), w_h21(gid + 7.7)) - 0.5) * 0.5;
          vec2 fwd = normalize(vWp.xz - cameraPosition.xz + vec2(1e-4)), rgt = vec2(-fwd.y, fwd.x);
          float ga = dot(gf, rgt), gb = dot(gf, fwd);
          float aw = max(fwidth(ga), 1e-4), bw = max(fwidth(gb), 1e-4);
          float dash = (1.0 - smoothstep(0.0, 0.34 + aw, abs(ga))) * (1.0 - smoothstep(0.0, 0.035 + bw * 1.2, abs(gb)));
          float crs = (1.0 - smoothstep(0.0, 0.03 + aw * 1.2, abs(ga))) * (1.0 - smoothstep(0.0, 0.1 + bw, abs(gb)));
          float blink = 0.55 + 0.45 * sin(uTime * 5.0 + sp * 60.0);
          float twinkle = step(0.93, sp) * smoothstep(0.93, 1.0, sp) * max(dash, crs * 0.8) * blink * 1.6;
          float path = pow(sd, 60.0) * 2.0 + pow(sd, 8.0) * 0.18;
          float glit = twinkle * pow(sd, 48.0) * 4.0 * lod + path * (0.3 + streak * 0.6);   // [v3:fix] no swell term: its noise contours drew ghost ellipses in the sun path
          gWaterEmis += mix(vec3(1.0, 0.95, 0.85), uSkyWarm * 1.3, 0.4) * glit * (1.0 - uNightW * 0.85) * (1.0 - foam);
          gWaterEmis *= 1.0 - river * 0.6;
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += gWaterEmis;');
  };
  m.customProgramCacheKey = () => 'klc-water';
  return m;
}

export async function build(ctx) {
  const g = new THREE.Group(); g.name = 'water';
  // a big flat sheet: fine near the bay (fog / precision friendly), one coarse ring beyond
  const size = 54000;
  const geo = new THREE.PlaneGeometry(size, size, 60, 60).rotateX(-Math.PI / 2);
  const mat = waterMaterial(ctx);
  const sea = new THREE.Mesh(geo, mat);
  sea.position.set((L.ZONES.far.x0 + L.ZONES.far.x1) / 2, L.SEA.level, (L.ZONES.far.z0 + L.ZONES.far.z1) / 2);
  sea.receiveShadow = true; sea.castShadow = false; sea.name = 'water-sea';
  sea.renderOrder = -1;
  g.add(sea);
  ctx.noBatch(g);
  // stays in the outline pre-pass: its depth hides the shallow seabed, and the shore gets a soft line
  ctx.add(g);
  ctx.onUpdate(() => { sea.position.y = L.SEA.level; });
  ctx.services.water = { level: () => L.SEA.level, isWater: L.isWater, shoreDist: L.shoreDist, material: mat, mesh: sea };
  return { mesh: sea };
}
