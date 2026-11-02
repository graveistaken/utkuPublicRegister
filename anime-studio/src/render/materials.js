// Anime toon materials: cel shading with tinted shadows, rim light, hair "angel ring", inverted-hull outlines.
import * as THREE from 'three';

export const shared = {
  uLightDir: { value: new THREE.Vector3(0.3, 0.6, 0.7).normalize() }, // view space, updated per frame
  uLightColor: { value: new THREE.Color(1, 1, 1) },
  uSoft: { value: 0.12 },
  uThreshold: { value: 0.45 },
  uRim: { value: 0.35 },
  uOutlineScale: { value: 1.0 },
  uOutlineColor: { value: new THREE.Color('#2a1c24') },
};

const COMMON_FRAG = /* glsl */ `
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uSoft;
uniform float uThreshold;
uniform float uRim;
uniform vec3 uShade;
uniform vec3 uRimColor;
uniform float uShadeBoost;
`;

function toonLighting(extra = '') {
  return /* glsl */ `
  {
    vec3 N = normalize(normal);
    vec3 V = normalize(vViewPosition);
    float ndl = dot(N, normalize(uLightDir)) * 0.5 + 0.5;
    float th = uThreshold * uShadeBoost;
    float lit = smoothstep(th - uSoft * 0.5 - 0.001, th + uSoft * 0.5 + 0.001, ndl);
    vec3 base = diffuseColor.rgb;
    vec3 shadeCol = base * uShade;
    vec3 col = mix(shadeCol, base, lit);
    ${extra}
    float rim = 1.0 - max(dot(N, V), 0.0);
    rim = smoothstep(0.62, 0.9, rim) * (0.35 + 0.65 * lit);
    col += uRimColor * rim * uRim * 0.55;
    outgoingLight = col * uLightColor;
  }
  `;
}

export function makeToon({ color = '#ffffff', shade = '#c0a0a0', map = null, rimColor = '#ffffff', hair = false, vertexColors = false, side = THREE.FrontSide, shadeBoost = 1.0 } = {}) {
  const mat = new THREE.MeshToonMaterial({ color, map, side, vertexColors });
  const uniforms = {
    ...shared,
    uShade: { value: new THREE.Color(1, 1, 1) },
    uRimColor: { value: new THREE.Color(rimColor) },
    uShadeBoost: { value: shadeBoost },
    uSpec: { value: new THREE.Color('#ffffff') },
    uSpecStr: { value: 0.5 },
    uTip: { value: new THREE.Color('#ffffff') },
    uGrad: { value: 0.5 },
  };
  mat.userData.uniforms = uniforms;
  mat.userData.isHair = hair;
  setShade(mat, color, shade);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    if (hair) {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float hairT;\nvarying float vHairT;\nvarying vec2 vHairUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvHairT = hairT;\nvHairUv = uv;');
    }
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + COMMON_FRAG + (hair ? 'uniform vec3 uSpec; uniform float uSpecStr; uniform vec3 uTip; uniform float uGrad; varying float vHairT; varying vec2 vHairUv;\n' : ''));
    const hairExtra = hair
      ? /* glsl */ `
      // root->tip gradient
      float gt = smoothstep(0.25, 1.0, vHairT) * uGrad;
      base = mix(base, uTip, gt);
      shadeCol = mix(shadeCol, uTip * uShade, gt);
      col = mix(shadeCol, base, lit);
      // angel ring: band around the head (vHairUv.y = polar angle 0..1), facing the viewer
      float ph = vHairUv.y;
      float zz = abs(fract(vHairUv.x * 38.0) - 0.5) * 2.0;
      float jag = 0.028 * zz + 0.012 * sin(vHairUv.x * 6.2831 * 9.0);
      float band = smoothstep(0.255, 0.265, ph) * (1.0 - smoothstep(0.30, 0.31, ph + jag));
      float facing = smoothstep(0.45, 0.85, dot(N, V));
      float ring = band * facing * (0.35 + 0.65 * lit) * (1.0 - smoothstep(0.2, 0.5, vHairT)) * 0.75;
      // secondary strand gloss
      vec3 Hh = normalize(normalize(uLightDir) + V);
      float gloss = smoothstep(0.9, 0.93, dot(N, Hh)) * 0.25;
      col = mix(col, uSpec, clamp((ring + gloss) * uSpecStr, 0.0, 1.0));
      `
      : '';
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', toonLighting(hairExtra) + '\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => (hair ? 'toon-hair' : 'toon');
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
  // shift hue toward 0.95 (magenta-red) a little
  const target = 0.97;
  let dh = target - h;
  if (dh > 0.5) dh -= 1;
  if (dh < -0.5) dh += 1;
  h = (h + dh * 0.08 + 1) % 1;
  const s = Math.min(1, hsl.s * 1.15 + 0.08);
  const l = hsl.l * amount;
  return '#' + new THREE.Color().setHSL(h, s, l).getHexString();
}

export function makeOutline(widthMeters = 0.0012) {
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
        float camDist = clamp(-mvPos0.z, 0.4, 6.0);
        transformed += normalize(objectNormal) * uOutline * uOutlineScale * (0.55 + 0.45 * camDist);
        #include <project_vertex>`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uOutlineColor;\nuniform vec3 uTint;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(uOutlineColor, uTint, 0.35);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'outline';
  return mat;
}
