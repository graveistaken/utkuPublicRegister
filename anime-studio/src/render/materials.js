// Anime "Blender-style" toon materials:
//  - cel shading with tinted, soft-edged shadows + real cast shadows (shadow map)
//  - subtle volume gradient inside lit/shade areas, hemispheric fill, warm skin terminator
//  - joint blush on skin, Kajiya-Kay anisotropic hair highlight, parallax (recessed) iris
//  - rim light, fabric micro-normal, inverted-hull outlines tinted by local colour
import * as THREE from 'three';

export const shared = {
  uLightDir: { value: new THREE.Vector3(0.3, 0.6, 0.7).normalize() }, // view space, updated per frame
  uLightColor: { value: new THREE.Color(1, 1, 1) },
  uSoft: { value: 0.12 },
  uThreshold: { value: 0.45 },
  uRim: { value: 0.35 },
  uShadowStr: { value: 1.0 },
  uSky: { value: new THREE.Color('#f4efff') },
  uGround: { value: new THREE.Color('#d8c8d8') },
  uOutlineScale: { value: 1.0 },
  uOutlineColor: { value: new THREE.Color('#2a1c24') },
};

const COMMON_FRAG = /* glsl */ `
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uSoft;
uniform float uThreshold;
uniform float uRim;
uniform float uShadowStr;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uShade;
uniform vec3 uRimColor;
uniform float uCastMul;
varying vec3 vBindPos;
varying float vAO;
`;
const SHADOW_FN = /* glsl */ `
float toonCastShadow() {
  float s = 1.0;
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow dls = directionalLightShadows[ 0 ];
    s = receiveShadow ? getShadow( directionalShadowMap[ 0 ], dls.shadowMapSize, dls.shadowIntensity, dls.shadowBias, dls.shadowRadius, vDirectionalShadowCoord[ 0 ] ) : 1.0;
  #endif
  return s;
}
`;
const NOISE_FN = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

// kinds: 'skin' | 'face' | 'hair' | 'cloth' | 'shiny'
export function makeToon({ kind = 'cloth', map = null } = {}) {
  const mat = new THREE.MeshToonMaterial({ color: '#ffffff', map });
  const uniforms = {
    ...shared,
    uShade: { value: new THREE.Color(1, 1, 1) },
    uRimColor: { value: new THREE.Color('#ffffff') },
    uSpec: { value: new THREE.Color('#ffffff') },
    uSpecStr: { value: 0.5 },
    uTip: { value: new THREE.Color('#ffffff') },
    uGrad: { value: 0.5 },
    uBlushCol: { value: new THREE.Color('#ff8f8f') },
    uIris: { value: null },
    uOverlay: { value: null },
    uMask: { value: null },
    uEyeOpen: { value: 1 },
    uIrisDepth: { value: 0.006 },
    uFaceSize: { value: new THREE.Vector2(0.25, 0.25) },
    // how strongly cast shadows show on this material (faces get softer shadows, as in anime setups)
    uCastMul: { value: kind === 'face' ? 0.5 : kind === 'skin' ? 0.65 : 1.0 },
  };
  mat.userData.uniforms = uniforms;
  mat.userData.kind = kind;
  const SKIN = kind === 'skin' || kind === 'face';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    let vdecl = 'varying vec3 vBindPos;\nattribute float ao;\nvarying float vAO;\n';
    let vbody = 'vBindPos = position;\nvAO = ao;\n';
    if (SKIN) {
      vdecl += 'attribute float blush;\nvarying float vBlush;\n';
      vbody += 'vBlush = blush;\n';
    }
    if (kind === 'hair') {
      vdecl += 'attribute float hairT;\nattribute vec3 hairTan;\nvarying float vHairT;\nvarying vec3 vHairTan;\nvarying vec2 vHairUv;\n';
    }
    if (kind === 'face') vdecl += 'varying vec3 vFaceT;\nvarying vec3 vFaceB;\n';
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + vdecl).replace('#include <uv_vertex>', '#include <uv_vertex>\n' + vbody);
    // tangents through skinning (all characters are skinned)
    let tanCode = '';
    if (kind === 'hair')
      tanCode = `
      vHairT = hairT; vHairUv = uv;
      #ifdef USE_SKINNING
        vHairTan = normalize( normalMatrix * ( skinMatrix * vec4( hairTan, 0.0 ) ).xyz );
      #else
        vHairTan = normalize( normalMatrix * hairTan );
      #endif`;
    if (kind === 'face')
      tanCode = `
      #ifdef USE_SKINNING
        vFaceT = normalize( normalMatrix * ( skinMatrix * vec4( 1.0, 0.0, 0.0, 0.0 ) ).xyz );
        vFaceB = normalize( normalMatrix * ( skinMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
      #else
        vFaceT = normalize( normalMatrix * vec3( 1.0, 0.0, 0.0 ) );
        vFaceB = normalize( normalMatrix * vec3( 0.0, 1.0, 0.0 ) );
      #endif`;
    if (tanCode) sh.vertexShader = sh.vertexShader.replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n' + tanCode);

    let fdecl = COMMON_FRAG;
    if (SKIN) fdecl += 'varying float vBlush;\nuniform vec3 uBlushCol;\n';
    if (kind === 'hair') fdecl += 'uniform vec3 uSpec; uniform float uSpecStr; uniform vec3 uTip; uniform float uGrad; varying float vHairT; varying vec3 vHairTan; varying vec2 vHairUv;\n';
    if (kind === 'face') fdecl += 'uniform sampler2D uIris; uniform sampler2D uOverlay; uniform sampler2D uMask; uniform float uEyeOpen; uniform float uIrisDepth; uniform vec2 uFaceSize; varying vec3 vFaceT; varying vec3 vFaceB;\n';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + fdecl + NOISE_FN)
      .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + SHADOW_FN);

    if (kind === 'face') {
      // layered eyes: iris sampled with a parallax offset so it sits *inside* the eye
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 Vv = normalize( vViewPosition );
          vec3 Nf = normalize( cross( vFaceT, vFaceB ) );
          float vz = max( dot( Vv, Nf ), 0.25 );
          vec2 par = vec2( dot( Vv, vFaceT ), dot( Vv, vFaceB ) ) / vz * uIrisDepth / uFaceSize;
          float m = texture2D( uMask, vMapUv ).r * uEyeOpen;
          vec4 ir = texture2D( uIris, vMapUv - par );
          diffuseColor.rgb = mix( diffuseColor.rgb, ir.rgb, ir.a * m );
          vec4 ov = texture2D( uOverlay, vMapUv );
          diffuseColor.rgb = mix( diffuseColor.rgb, ov.rgb, ov.a );
        }`
      );
    }

    const hairCode =
      kind === 'hair'
        ? /* glsl */ `
      float gt = smoothstep(0.2, 1.0, vHairT) * uGrad;
      base = mix(base, uTip, gt);
      shadeCol = mix(shadeCol, uTip * uShade, gt);
      // Kajiya-Kay soft sheen along the strand + a clean, jagged "angel ring" around the head
      vec3 Tn = normalize(vHairTan);
      float across = fract(vHairUv.x);
      float sid = floor(vHairUv.x);
      float lnA = across * 5.0 + vnoise(vec3(sid * 1.7, vHairT * 2.5, 0.0)) * 1.2;
      float lines = pow(abs(sin(lnA * 3.14159)), 12.0);
      float lnB = pow(abs(sin((across * 11.0 + sid * 0.37) * 3.14159)), 20.0);
      float strandTex = 1.0 - (lines * 0.12 + lnB * 0.06) * (0.35 + 0.65 * smoothstep(0.0, 0.5, vHairT));
      vec3 Hh = normalize(L + V);
      vec3 T2 = normalize(Tn + N * 0.08);
      float th2 = dot(T2, Hh);
      float kk2 = pow(sqrt(max(1.0 - th2 * th2, 0.0)), 30.0);
      float soft = smoothstep(0.45, 0.95, kk2) * 0.14;
      // ring: polar band (vHairUv.y = polar angle / pi) with a zig-zag lower edge per clump
      float zig = abs(fract(across * 2.0 + sid * 0.31) - 0.5) * 2.0;
      float ph = vHairUv.y;
      float ringC = 0.31 + 0.015 * sin(sid * 1.3);
      float upper = smoothstep(ringC - 0.04, ringC - 0.032, ph);
      float lower = 1.0 - smoothstep(ringC + 0.01 + zig * 0.035, ringC + 0.016 + zig * 0.035, ph);
      float facing = smoothstep(0.25, 0.6, dot(N, V));
      // painted clump separation: darker toward each clump's edges, slight per-clump tone shift
      float edge = smoothstep(0.32, 0.5, abs(across - 0.5));
      strandTex *= (1.0 - 0.16 * edge) * (0.97 + 0.06 * fract(sin(sid * 12.9898) * 43758.5453));
      float band = upper * lower * facing * (1.0 - smoothstep(0.3, 0.6, vHairT));
      litMix = lit;
      col = mix(shadeCol, base, lit) * strandTex;
      col += uSpec * soft * lit * uSpecStr;
      col = mix(col, mix(base, uSpec, 0.75), band * (0.35 + 0.65 * lit) * uSpecStr);
      `
        : '';
    const skinCode = SKIN
      ? /* glsl */ `
      // joint blush (knees, elbows, knuckles, shoulders, cheeks)
      base = mix(base, base * uBlushCol, clamp(vBlush, 0.0, 1.0) * 0.5);
      shadeCol = base * uShade;
      col = mix(shadeCol, base, lit);
      // warm sub-surface band along the light/shadow terminator
      float term = lit * (1.0 - lit) * 4.0;
      col += vec3(0.9, 0.25, 0.2) * term * 0.06;
      `
      : '';
    const clothCode =
      kind === 'cloth'
        ? /* glsl */ `
      // fabric micro-variation (weave / soft folds) so cloth doesn't look like plastic
      float fn = vnoise(vBindPos * 160.0) * 0.6 + vnoise(vBindPos * 22.0) * 0.4;
      col *= 0.96 + fn * 0.06;
      `
        : '';

    const lighting = /* glsl */ `
    {
      vec3 N = normalize(normal);
      vec3 V = normalize(vViewPosition);
      vec3 L = normalize(uLightDir);
      float ndl = dot(N, L) * 0.5 + 0.5;
      float sh = toonCastShadow();
      sh = mix(1.0, smoothstep(0.15, 0.85, sh), uShadowStr * uCastMul);
      float th = uThreshold;
      float lit = smoothstep(th - uSoft * 0.5 - 0.001, th + uSoft * 0.5 + 0.001, ndl) * sh;
      float litMix = lit;
      vec3 base = diffuseColor.rgb;
      vec3 shadeCol = base * uShade;
      vec3 col = mix(shadeCol, base, lit);
      ${skinCode}
      ${hairCode}
      ${clothCode}
      // volume: gentle gradient inside both tones + hemispheric fill
      float up = N.y * 0.5 + 0.5;
      vec3 hemi = mix(uGround, uSky, up);
      col *= mix(vec3(1.0), hemi / max(max(hemi.r, hemi.g), hemi.b), 0.18);
      col *= 0.96 + 0.06 * smoothstep(0.2, 1.0, ndl);
      // baked ambient occlusion (from the distance field): darkens creases, under-hair, armpits, folds
      float aoK = clamp(vAO, 0.0, 1.0);
      col *= mix(vec3(1.0), mix(uShade * 0.9, vec3(1.0), aoK), 0.75);
      // rim lights: warm key rim on the lit side, cool back rim on the shaded side
      float fres = 1.0 - max(dot(N, V), 0.0);
      float rimK = smoothstep(0.68, 0.9, fres) * smoothstep(0.35, 0.7, ndl);
      float rimB = smoothstep(0.75, 0.95, fres) * (1.0 - lit) * 0.6;
      col += uRimColor * rimK * uRim * 0.5;
      col += vec3(0.55, 0.62, 0.9) * rimB * uRim * 0.25;
      outgoingLight = col * uLightColor;
    }
    `;
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', lighting + '\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'toon2-' + kind;
  return mat;
}

// shade is given as an absolute colour; stored as a multiplier relative to the base colour
export function setShade(mat, color, shade) {
  const c = new THREE.Color(color);
  const s = new THREE.Color(shade);
  const f = (a, b) => Math.min(b / Math.max(a, 0.02), 1.2);
  mat.userData.uniforms.uShade.value.setRGB(f(c.r, s.r), f(c.g, s.g), f(c.b, s.b));
  if (mat.map) mat.color.set('#ffffff');
  else mat.color.set(color);
}

// Auto shade colour: darker, more saturated, slightly hue-shifted toward red/purple.
export function autoShade(hex, amount = 0.72) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  let h = hsl.h;
  const target = 0.97;
  let dh = target - h;
  if (dh > 0.5) dh -= 1;
  if (dh < -0.5) dh += 1;
  h = (h + dh * 0.08 + 1) % 1;
  const s = Math.min(1, hsl.s * 1.15 + 0.08);
  const l = hsl.l * amount;
  return '#' + new THREE.Color().setHSL(h, s, l).getHexString();
}

export function makeOutline(widthMeters = 0.0008) {
  const mat = new THREE.MeshToonMaterial({ color: 0x000000, side: THREE.BackSide });
  const uniforms = { uOutline: { value: widthMeters }, uOutlineScale: shared.uOutlineScale, uOutlineColor: shared.uOutlineColor, uTint: { value: new THREE.Color(0, 0, 0) } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;\nuniform float uOutlineScale;')
      .replace(
        '#include <project_vertex>',
        `
        vec4 mvPos0 = modelViewMatrix * vec4(transformed, 1.0);
        float camDist = clamp(-mvPos0.z, 0.3, 6.0);
        // roughly constant on-screen width, thinner in close-ups
        transformed += normalize(objectNormal) * uOutline * uOutlineScale * (0.35 + 0.55 * camDist);
        #include <project_vertex>`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uOutlineColor;\nuniform vec3 uTint;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(uOutlineColor, uTint, 0.7);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'outline2';
  return mat;
}
