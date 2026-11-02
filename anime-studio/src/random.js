import { DEFAULTS, HAIR_PRESETS, applyHairPreset } from './params.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rr = (a, b) => a + Math.random() * (b - a);

// curated palettes so random characters still look good
const HAIR = [
  ['#4a2f2a', '#7a4a3a', '#2a1620', '#ffe9dc'], ['#f39bb6', '#ffd1de', '#b8506f', '#fff4f8'], ['#45c6d6', '#b9f3ff', '#1f6f8f', '#ffffff'],
  ['#eef1fb', '#b9c6ff', '#8f9bd0', '#ffffff'], ['#ff7a2f', '#ffd36b', '#b0361a', '#fff2c8'], ['#2a2d3a', '#4a5070', '#11121a', '#c8d4ff'],
  ['#ffe08a', '#fff5cf', '#c99a3a', '#ffffff'], ['#8a5cf0', '#d3b8ff', '#4b2a9a', '#f3eaff'], ['#d8343f', '#ff8a6a', '#7a1020', '#ffd6cc'],
  ['#2e8a5a', '#9be0a8', '#164a32', '#e8ffe8'], ['#151520', '#3a3a5a', '#050508', '#9aa6ff'], ['#c9a27a', '#f0d6b0', '#80603e', '#fff4e0'],
  ['#5a7bd8', '#a8c8ff', '#2a3f8f', '#eaf2ff'], ['#f2c6e0', '#c8e6ff', '#b07aa8', '#ffffff'],
];
const IRIS = [['#2a3f8f', '#5fb6ff'], ['#2c6e3a', '#9fe08a'], ['#7a2a10', '#ffb347'], ['#5b2a8f', '#d6a0ff'], ['#7a1f3d', '#ff7aa8'], ['#155a7a', '#6ff0ff'], ['#3a2418', '#c48a5a'], ['#8a5a00', '#ffd34a'], ['#8f1020', '#ff5a5a']];
const SKIN = [['#ffe4d6', '#f2a7a0'], ['#fff0ea', '#f0b4b0'], ['#f6d2b8', '#d99280'], ['#e9b994', '#c07a62'], ['#c98d68', '#9a5a44'], ['#fde8de', '#e8a0b0']];
const CLOTH = ['#f4f6fb', '#25336b', '#2b2d52', '#d8283e', '#2a2a35', '#3d4a7a', '#ffd34a', '#f39bb6', '#45c6d6', '#2e8a5a', '#ffffff', '#8a5cf0', '#ff7a2f', '#30343f', '#c9a27a'];

export function randomParams(prev) {
  const male = Math.random() < 0.35;
  let p = { ...DEFAULTS, quality: prev.quality, pose: prev.pose, animate: prev.animate, bg: prev.bg };
  const styles = male ? ['short', 'spiky', 'wolf', 'short', 'ponytail'] : Object.keys(HAIR_PRESETS);
  p = applyHairPreset(p, pick(styles));
  const [hc, ht, hs, hp] = pick(HAIR);
  const [it, ib] = pick(IRIS);
  const [sk, sks] = pick(SKIN);
  Object.assign(p, {
    hairColor: hc, hairTip: ht, hairShade: hs, hairSpec: hp, irisTop: it, irisBottom: ib, skin: sk, skinShade: sks,
    seed: Math.floor(rr(1, 999)),
    height: male ? rr(165, 185) : rr(148, 170),
    headsTall: rr(6.0, 7.0),
    gender: male ? rr(0.8, 1) : rr(0, 0.15),
    bust: male ? 0 : rr(0.35, 1.2),
    shoulders: male ? rr(1.1, 1.3) : rr(0.92, 1.05),
    chest: male ? rr(1.05, 1.2) : rr(0.95, 1.05),
    waist: male ? rr(1.0, 1.1) : rr(0.85, 1.0),
    hips: male ? rr(0.88, 0.98) : rr(1.0, 1.15),
    muscle: male ? rr(0.2, 0.7) : rr(0.05, 0.3),
    weight: rr(0.2, 0.5),
    eyeStyle: male ? pick(['sharp', 'shonen', 'droopy']) : pick(['round', 'round', 'sharp', 'droopy', 'sleepy', 'cat']),
    eyeSize: male ? rr(0.85, 1.0) : rr(0.95, 1.15),
    irisSize: rr(0.9, 1.1),
    lashThick: male ? rr(0.5, 0.8) : rr(0.9, 1.3),
    lashWing: male ? rr(0.1, 0.3) : rr(0.4, 1.0),
    lowerLash: !male && Math.random() < 0.7,
    browStyle: male ? pick(['straight', 'angry', 'thick']) : pick(['soft', 'soft', 'worried', 'straight']),
    jaw: male ? rr(1.05, 1.2) : rr(0.85, 1.0),
    chinPoint: male ? rr(0.25, 0.45) : rr(0.45, 0.7),
    blush: male ? 0 : rr(0.2, 0.6),
    mouth: pick(['smile', 'smile', 'open', 'neutral', 'cat', 'smug', 'fang']),
    highlightStyle: pick(['classic', 'classic', 'sparkle', 'soft']),
    top: male ? pick(['shirt', 'tshirt', 'hoodie', 'longsleeve']) : pick(['sailor', 'shirt', 'tshirt', 'longsleeve', 'hoodie', 'crop', 'tank']),
    topColor: pick(CLOTH), topColor2: pick(CLOTH), ribbonColor: pick(['#d8283e', '#2c3e7a', '#ffd34a', '#2e8a5a', '#f39bb6']),
    sleeveLen: Math.random() < 0.5 ? rr(0.1, 0.3) : rr(0.8, 1),
    bottom: male ? 'pants' : pick(['skirt', 'skirt', 'aline', 'shorts', 'pants']),
    bottomColor: pick(CLOTH),
    bottomLen: rr(0.3, 0.7),
    legwear: male ? 'none' : pick(['none', 'socks', 'knee', 'thigh', 'tights']),
    legwearColor: pick(['#1d1d2b', '#f4f6fb', '#2b2230', '#3a3a48']),
    shoes: pick(['loafer', 'sneaker', 'boots']),
    shoeColor: pick(['#3b2622', '#f4f4f4', '#202028', '#7a4a3a']),
    animalEars: Math.random() < 0.15 ? pick(['cat', 'fox', 'bunny']) : 'none',
    headAcc: !male && Math.random() < 0.35 ? pick(['bow', 'clip', 'headband']) : 'none',
    accColor: pick(['#e8344e', '#ffd23f', '#ffffff', '#2c3e7a', '#ff8ab0']),
    glasses: Math.random() < 0.12 ? pick(['round', 'square', 'half']) : 'none',
    tieColor: pick(['#e8344e', '#ffffff', '#2c3e7a', '#ffd23f']),
  });
  if (p.bottom === 'pants') p.bottomLen = 1;
  if (male) p.ahoge = Math.random() < 0.3;
  p.earColor = p.hairColor;
  if (p.animalEars !== 'none') p.tail = Math.random() < 0.6;
  return p;
}
