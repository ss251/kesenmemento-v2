// [v3:town] vendored from Sakuragaoka Station src/world/street/ditch.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Street module — U字溝 interiors as "interior mapping": the open / grated ditch spans are a flat
// quad at the rim level (so the terrain, which is at heightAt, never covers them). The fragment
// shader traces the view ray into a virtual U-channel (side walls, end walls, shallow water) and
// shades it with baked cel self-shadowing, a waterline ink line, ripples and a few drifting petals.
// It is a MeshToonMaterial underneath, so fog, sun/ambient ramp and building shadows still apply.
import * as THREE from 'three';

export class DitchBuilder {
  constructor() { this.pos = []; this.loc = []; this.dn = []; this.span = []; this.idx = []; this.n = 0; }
  /** a: across offset (m, +n side), s: along (m), dp: plane depth below rim, n2: across unit (x,z),
   *  span: [s0, s1, wi, wl] (along range, inner half width, water depth below rim) */
  vert(x, y, z, a, s, dp, n2, span) {
    this.pos.push(x, y, z); this.loc.push(a, s, dp); this.dn.push(n2[0], n2[1]); this.span.push(span[0], span[1], span[2], span[3]);
    return this.n++;
  }
  quad(a, b, c, d) {
    // keep the face pointing up
    const p = this.pos, ux = p[b * 3] - p[a * 3], uz = p[b * 3 + 2] - p[a * 3 + 2], vx = p[c * 3] - p[a * 3], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const ny = uz * vx - ux * vz;
    if (ny >= 0) this.idx.push(a, b, c, a, c, d); else this.idx.push(a, c, b, a, d, c);
  }
  get empty() { return this.idx.length === 0; }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    const nrm = new Float32Array(this.n * 3); for (let i = 0; i < this.n; i++) nrm[i * 3 + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('dLoc', new THREE.Float32BufferAttribute(this.loc, 3));
    g.setAttribute('dN', new THREE.Float32BufferAttribute(this.dn, 2));
    g.setAttribute('dSpan', new THREE.Float32BufferAttribute(this.span, 4));
    g.setIndex(this.n > 65000 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true; m.castShadow = false; m.name = 'street-ditch-interior';
    m.userData.noBatch = true;
    return m;
  }
}

export function ditchMaterial(ctx) {
  const C = (h) => new THREE.Color(h);
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ctx.mat.gradientMap, name: 'street-ditch' });
  const U = {
    uDTime: ctx.shared.uTime, uDSun: ctx.shared.uSunDir,
    uWallTop: { value: C('#b3b1a8') }, uWallLow: { value: C('#8f8d85') }, uWet: { value: C('#6e7462') }, uMoss: { value: C('#7f9463') },
    uShade: { value: C('#8e8fb0') }, uInk: { value: C('#3a3346') },
    uWater: { value: C('#58625f') }, uWaterSky: { value: C('#b8cfe0') }, uPetal: { value: C('#f6cdd9') }, uPetalDeep: { value: C('#e9a6bb') }, uLeaf: { value: C('#9d8a5a') },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 dLoc; attribute vec2 dN; attribute vec4 dSpan;
        varying vec3 vDLoc; varying vec2 vDN; varying vec4 vDSpan; varying vec3 vDW;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vDW = (modelMatrix * vec4(transformed, 1.0)).xyz; vDLoc = dLoc; vDN = dN; vDSpan = dSpan;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDLoc; varying vec2 vDN; varying vec4 vDSpan; varying vec3 vDW;
        uniform float uDTime; uniform vec3 uDSun;
        uniform vec3 uWallTop, uWallLow, uWet, uMoss, uShade, uInk, uWater, uWaterSky, uPetal, uPetalDeep, uLeaf;
        float dHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        vec3 ditchColour(){
          vec3 D = normalize(vDW - cameraPosition);
          vec2 n2 = normalize(vDN); vec2 t2 = vec2(n2.y, -n2.x);
          float Da = dot(D.xz, n2), Ds = dot(D.xz, t2), Dy = min(D.y, -1e-3);
          float a = vDLoc.x, s = vDLoc.y, dp = vDLoc.z;
          float s0 = vDSpan.x, s1 = vDSpan.y, wi = vDSpan.z, wl = vDSpan.w;
          float tw = (wl - dp) / (-Dy);
          float ta = abs(Da) > 1e-5 ? max(0.0, ((Da > 0.0 ? wi : -wi) - a) / Da) : 1e9;
          float ts = abs(Ds) > 1e-5 ? max(0.0, ((Ds > 0.0 ? s1 : s0) - s) / Ds) : 1e9;
          float th = min(tw, min(ta, ts));
          float depth = dp - Dy * th;
          vec2 hit = vec2(a + Da * th, s + Ds * th);
          vec3 L = normalize(uDSun); float Ly = max(L.y, 0.05);
          float La = dot(L.xz, n2), Lt = dot(L.xz, t2);
          vec3 col;
          if (tw <= min(ta, ts)) {
            // ---- water surface
            float ex = hit.x + La * wl / Ly;
            float lit = step(abs(ex), wi - 0.004);
            float fres = pow(1.0 - clamp(-Dy, 0.0, 1.0), 2.5);
            float flow = hit.y - uDTime * 0.06;
            float w = sin(flow * 23.0 + sin(hit.x * 40.0 + uDTime) * 0.8) * 0.5 + sin(flow * 11.0 - hit.x * 17.0 + uDTime * 0.7) * 0.5;
            col = mix(uWater, uWaterSky, 0.12 + 0.55 * fres + 0.05 * w);
            float gl = smoothstep(0.9, 0.99, w) * step(0.55, dHash(vec2(floor(flow * 6.0), floor(hit.x * 30.0))));
            col += vec3(1.0, 0.97, 0.9) * gl * (0.05 + 0.14 * lit);
            col = mix(col * uShade * 1.15, col, lit * 0.85 + 0.15);
            // floating petals (and the odd leaf), drifting with the flow
            float cellL = 0.11; float k = floor(flow / cellL);
            for (int j = -1; j <= 1; j++) {
              float kk = k + float(j); float h = dHash(vec2(kk, floor(s0 * 3.0)));
              if (h < 0.34 || h > 0.985) {
                float h2 = dHash(vec2(kk, 7.1)), h3 = dHash(vec2(kk, 3.3));
                vec2 c = vec2((h2 * 2.0 - 1.0) * (wi - 0.03), (kk + 0.5 + (h3 - 0.5) * 0.6) * cellL);
                vec2 d = vec2(hit.x, flow) - c; float r = h3 * 6.283 + uDTime * 0.2 * (h2 - 0.5);
                d = mat2(cos(r), -sin(r), sin(r), cos(r)) * d;
                float leaf = step(0.985, h);
                vec2 sz = leaf > 0.5 ? vec2(0.028, 0.012) : vec2(0.016, 0.011);
                float e = dot(d / sz, d / sz);
                if (e < 1.0) { col = leaf > 0.5 ? uLeaf : mix(uPetal, uPetalDeep, smoothstep(0.2, 1.0, e) * 0.6); col = mix(col * uShade * 1.1, col, lit * 0.8 + 0.2); }
              }
            }
          } else {
            // ---- walls (side or end)
            vec2 N = ta <= ts ? -sign(Da) * n2 : -sign(Ds) * t2;
            float along = ta <= ts ? hit.y : hit.x;
            float f = clamp(depth / wl, 0.0, 1.0);
            col = mix(uWallTop, uWallLow, smoothstep(0.0, 1.0, f));
            col = mix(col, uMoss, smoothstep(0.62, 0.9, f) * 0.55 * (0.6 + 0.4 * dHash(vec2(floor(along * 7.0), 1.0))));
            col = mix(col, uWet, smoothstep(0.86, 0.97, f));
            float Ln = dot(L.xz, N);
            float lit = step(0.0, Ln) * step(depth * Ln / Ly, (ta <= ts ? 2.0 * wi : 0.6));
            col = mix(col * uShade, col, lit);
            // section joints of the precast U-channel, chamfer highlight, waterline ink line
            col *= 1.0 - 0.25 * step(fract(along / 0.6), 0.012) * step(ta, ts);
            col = mix(col, uWallTop * 1.06, 1.0 - smoothstep(0.0, 0.006, depth - dp));
            col = mix(col, uInk, smoothstep(wl - 0.012, wl - 0.002, depth) * 0.55);
          }
          return col;
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = ditchColour();`);
  };
  m.customProgramCacheKey = () => 'street-ditch-v1';
  return m;
}
