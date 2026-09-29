// [v3:fix] Ported from Sakuragaoka Station src/world/sakura/materials.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Spring cherry trees for Kesennuma's hero stops (town/cherry/index.js).
// Sakura materials. All start from ctx.mat.toon (cel ramp, hand-painted variation, fog, shadows);
// the canopy ones are extended with:
//   * backlit rim glow + soft petal translucency relative to the sun (ctx.shared.uSunDir)
//   * cards: no back-face normal flip (normals are transferred from the canopy volume, so both sides
//     of a card shade like the canopy), and a very subtle wind sway (uWind / uTime / uGust)
import * as THREE from 'three';
import { BANDS } from './tree.js';

const NOFLIP = /* glsl */`
  float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
  vec3 normal = normalize( vNormal );
  vec3 nonPerturbedNormal = normal;
`;

function rimChunk(k, sheenK, env) {
  return /* glsl */`
  #include <emissivemap_fragment>
  {
    vec3 nW = normalize( inverseTransformDirection( normal, viewMatrix ) );
    vec3 nR = ${env ? 'normalize( vEnvW )' : 'nW'};
    vec3 vW = normalize( cameraPosition - vPWorld );
    vec3 sW = normalize( uSunDirS );
    float back = clamp( dot( -vW, sW ) * 1.15, 0.0, 1.0 );
    back *= back;
    float ndv = clamp( abs( dot( nR, vW ) ), 0.0, 1.0 );
    float rim = pow( 1.0 - ndv, 2.2 );
    float trans = clamp( 0.45 - dot( nW, sW ) * 0.55, 0.0, 1.0 );
    // a faint cool-pink sky sheen on the outer silhouette even when front-lit
    float sheen = pow( 1.0 - ndv, 4.0 ) * ${sheenK.toFixed(2)};
    vec3 glow = vec3( 1.0, 0.64, 0.75 ) * ( 0.62 * rim + 0.26 * trans ) * back + vec3( 0.9, 0.85, 1.0 ) * sheen;
    totalEmissiveRadiance += glow * diffuseColor.rgb * ${k.toFixed(2)};
    // cool sky fill + light passing through petals: lifts the shadow side to lavender-pink
    totalEmissiveRadiance += diffuseColor.rgb * vec3( 0.13, 0.12, 0.17 ) * ( 0.75 + 0.25 * trans );
    // sunlight scattered through the petal mass: undersides / sun-averted clumps stay soft pink, not mauve
    totalEmissiveRadiance += diffuseColor.rgb * vec3( 0.11, 0.055, 0.075 ) * clamp( -dot( nW, sW ) + 0.2, 0.0, 1.0 );
  }
`;
}

const SWAY = /* glsl */`
  #include <begin_vertex>
  {
    vec3 wp0 = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
    float ph = dot( wp0, vec3( 0.37, 0.61, 0.23 ) );
    float g = 0.35 + 0.65 * uGust;
    float s1 = sin( uTime * 1.25 + ph );
    float s2 = sin( uTime * 3.1 + ph * 2.7 );
    transformed.x += uWind.x * ( 0.034 * s1 + 0.012 * s2 ) * g;
    transformed.z += uWind.y * 0.034 * s1 * g + 0.010 * s2 * g;
    transformed.y += 0.012 * sin( uTime * 2.2 + ph * 1.9 ) * g;
  }
`;

const SPECK = /* glsl */`
  #include <normal_fragment_maps>
  {
    // triplanar weights from the true surface orientation (the shading normal is bent in the cavity)
    vec3 nT = abs( normalize( cross( dFdx( vPWorld ), dFdy( vPWorld ) ) ) );
    nT = nT * nT * nT * nT; nT /= ( nT.x + nT.y + nT.z );
    vec3 sp = texture2D( uSpeck, vPWorld.zy * 1.1 ).rgb * nT.x + texture2D( uSpeck, vPWorld.xz * 1.1 ).rgb * nT.y + texture2D( uSpeck, vPWorld.xy * 1.1 ).rgb * nT.z;
    vec3 sp2 = texture2D( uSpeck, vPWorld.zy * 0.43 + 0.37 ).rgb * nT.x + texture2D( uSpeck, vPWorld.xz * 0.43 + 0.37 ).rgb * nT.y + texture2D( uSpeck, vPWorld.xy * 0.43 + 0.37 ).rgb * nT.z;
    sp = sp * mix( vec3( 1.0 ), sp2, 0.55 ) * 1.04;
    diffuseColor.rgb *= mix( vec3( 1.0 ), sp, uSpeckK );
  }
`;

// blossom-mass tone quantisation: colour attribute = (tone, peach + 2 * palette, shading normal y)
// -> 4 banded pinks
const BAND = /* glsl */`
  {
    // painted, slightly wobbly band edges (world-space noise), AA'd with fwidth
    float tn = vColor.r + ( pn_noise( vPWorld * 2.3 ) - 0.5 ) * 0.09 + ( pn_noise( vPWorld * 6.1 + 3.7 ) - 0.5 ) * 0.05;
    float bw = max( fwidth( tn ) * 0.8, 0.012 );
    float pal = step( 1.5, vColor.g ), pch = vColor.g - 2.0 * pal;
    vec3 bA = mix( uBandN[0], uBandW[0], pal ), bB = mix( uBandN[1], uBandW[1], pal );
    vec3 bC = mix( uBandN[2], uBandW[2], pal ), bD = mix( uBandN[3], uBandW[3], pal );
    vec3 bc = mix( bA, bB, smoothstep( 0.25 - bw, 0.25 + bw, tn ) );
    bc = mix( bc, bC, smoothstep( 0.5 - bw, 0.5 + bw, tn ) );
    bc = mix( bc, bD, smoothstep( 0.75 - bw, 0.75 + bw, tn ) );
    bc = mix( bc, uPeach, pch );
    diffuseColor.rgb *= bc;
  }
`;

// shadow side of the canopy: desaturate toward a soft lavender-grey.
// lit = how much of this fragment's albedo the sun actually lights (shadow maps + cel ramp included).
const SHADE = (k) => /* glsl */`
  #if NUM_DIR_LIGHTS > 0
  {
    float full = dot( diffuseColor.rgb * directionalLights[ 0 ].color, vec3( 1.0 ) ) * RECIPROCAL_PI;
    float lit = clamp( dot( reflectedLight.directDiffuse, vec3( 1.0 ) ) / max( full, 1e-4 ), 0.0, 1.0 );
    float gl = dot( outgoingLight, vec3( 0.3, 0.52, 0.18 ) );
    vec3 lav = gl * vec3( 0.97, 0.9, 1.1 );
    outgoingLight = mix( outgoingLight, lav, ( 1.0 - lit ) * ${k.toFixed(2)} );
  }
  #endif
  #include <opaque_fragment>
`;

// cards seen edge-on would smear into streaks: fade them out by the true face normal
const EDGE = /* glsl */`
  {
    vec3 fN = normalize( cross( dFdx( vPWorld ), dFdy( vPWorld ) ) );
    float fe = abs( dot( fN, normalize( cameraPosition - vPWorld ) ) );
    diffuseColor.a *= smoothstep( 0.1, 0.38, fe );
  }
  #include <alphatest_fragment>
`;

// irregular sun flecks through the crown (~0.15-0.35 m blobs, ~15 % of the mass)
const DAPPLE = /* glsl */`
  float sdh( vec3 p ) { p = fract( p * 0.3183099 + vec3( 0.1, 0.2, 0.3 ) ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
  float sdn( vec3 x ) {
    vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( mix( sdh( i ), sdh( i + vec3( 1, 0, 0 ) ), f.x ), mix( sdh( i + vec3( 0, 1, 0 ) ), sdh( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                mix( mix( sdh( i + vec3( 0, 0, 1 ) ), sdh( i + vec3( 1, 0, 1 ) ), f.x ), mix( sdh( i + vec3( 0, 1, 1 ) ), sdh( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
  }
  bool sakuraDapple( vec3 p ) { return sdn( p * 3.1 ) * 0.62 + sdn( p * 7.3 + 5.1 ) * 0.38 > 0.66; }
`;

function extend(m, shared, { key, rim = 0, sheen = 0, sway = false, noFlip = false, speck = null, speckK = 1, octNormal = false, band = null, envRim = false, shade = 0, edgeFade = false }) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer); // core hand-painted patch (adds vPWorld)
    shader.uniforms.uTime = shared.uTime; shader.uniforms.uWind = shared.uWind; shader.uniforms.uGust = shared.uGust;
    shader.uniforms.uSunDirS = shared.uSunDir;
    if (sway) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind; uniform float uGust;')
        .replace('#include <begin_vertex>', SWAY);
    }
    if (octNormal) {
      // full 3D shading normal from (uv.x, color.b, uv.y) (world space: sakura geometry is built in world
      // space, identity model matrix); the geometry normal (= smooth canopy envelope) feeds the outline
      // pre-pass and the rim glow
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEnvW;')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize( vec3( uv.x, color.b, uv.y ) + vec3( 0.0, 1e-4, 0.0 ) );\nvEnvW = normal;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vEnvW;');
    }
    if (band) {
      shader.uniforms.uBandN = { value: band.normal }; shader.uniforms.uBandW = { value: band.weeping }; shader.uniforms.uPeach = { value: band.peach };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uBandN[4]; uniform vec3 uBandW[4]; uniform vec3 uPeach;')
        .replace('#include <color_fragment>', BAND);
    }
    if (noFlip) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', NOFLIP);
    if (rim > 0) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSunDirS;')
        .replace('#include <emissivemap_fragment>', rimChunk(rim, sheen, envRim));
    }
    if (edgeFade) shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', EDGE);
    if (shade > 0) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', SHADE(shade));
    if (speck) {
      shader.uniforms.uSpeck = { value: speck }; shader.uniforms.uSpeckK = { value: speckK };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uSpeck; uniform float uSpeckK;')
        .replace('#include <normal_fragment_maps>', SPECK);
    }
  };
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
  return m;
}

export function createSakuraMaterials(ctx, T) {
  const { mat, shared, palette: P } = ctx;
  const M = {};
  M.barkOld = mat.toon('#ffffff', { map: T.barkOld, paint: 0.07, name: 'sakura:barkOld' });
  M.barkYoung = mat.toon('#ffffff', { map: T.barkYoung, paint: 0.06, name: 'sakura:barkYoung' });
  // linear colours (vertex tone -> band colour happens in linear space like every other albedo)
  const band = {
    normal: BANDS.normal.map(h => new THREE.Color(h)), weeping: BANDS.weeping.map(h => new THREE.Color(h)), peach: new THREE.Color(BANDS.peach),
  };
  M.blob = extend(mat.toon('#ffffff', { vertexColors: true, paint: 0.05, name: 'sakura:blob' }), shared,
    { key: 'sakura-mass1', rim: 0.7, sheen: 0.0, speck: T.speck, speckK: 0.7, octNormal: true, band, envRim: true, shade: 0.28 });
  // shadow-map material of the blossom masses: world-space noise holes -> dappled shade under the crown
  // (the cards add their own flower-shaped holes). Needs its own (non core-batched) meshes, see sakura.js.
  M.blobDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  M.blobDepth.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDW;\n' + DAPPLE)
      .replace('#include <clipping_planes_fragment>', 'if ( sakuraDapple( vDW ) ) discard;\n#include <clipping_planes_fragment>');
  };
  M.blobDepth.customProgramCacheKey = () => 'sakura-dapple1';
  M.cards = extend(mat.toon('#ffffff', { map: T.blossom, alphaTest: 0.5, side: 'double', vertexColors: true, paint: 0.04, name: 'sakura:cards' }),
    shared, { key: 'sakura-cards3', rim: 1.0, sheen: 0.05, sway: true, noFlip: true, shade: 0.22, edgeFade: true });
  // ground plants: double sided, normals point up (no flip) so both faces read like the lit ground
  M.flora = extend(mat.toon('#ffffff', { map: T.flora, alphaTest: 0.5, side: 'double', vertexColors: true, paint: 0.05, name: 'sakura:flora' }),
    shared, { key: 'sakura-flora', noFlip: true });
  M.ground = mat.toon('#ffffff', { map: T.ground, alphaTest: 0.45, vertexColors: true, polygonOffset: -2, paint: 0.05, name: 'sakura:ground' });
  M.curb = mat.toon('#cbc7bd', { paint: 0.09, name: 'sakura:curb' });
  M.curbDark = mat.toon('#b3afa5', { paint: 0.09, name: 'sakura:curbDark' });
  M.stone = mat.toon('#ffffff', { vertexColors: true, paint: 0.1, name: 'sakura:stone' });
  M.soil = mat.toon('#8a7157', { paint: 0.1, name: 'sakura:soil' });
  M.rope = mat.toon('#e3d6b2', { paint: 0.05, name: 'sakura:rope' });
  M.paper = mat.toon('#f4f1ea', { paint: 0.02, side: 'double', name: 'sakura:paper' });
  M.wood = mat.toon(P.wood, { paint: 0.08, name: 'sakura:wood' });
  return M;
}
