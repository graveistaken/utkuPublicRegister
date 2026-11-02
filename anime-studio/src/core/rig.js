// Humanoid skeleton (T-pose bind) computed from parameters.
// Coordinates: meters, Y up, character faces +Z, character's left = +X.
import { clamp, lerp } from './sdf.js';

export const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];

export function computeRig(p) {
  const H = p.height / 100;
  const s = H / 1.6; // length scale
  const sw = Math.pow(s, 0.85); // width scale
  const g = p.gender;
  const hH = (H / p.headsTall) * p.headSize; // head height (chin->crown)
  const chinY = H - hH * 0.985;

  const neckLen = hH * 0.22 * p.neckLen;
  const shoulderTopY = chinY - neckLen;
  const shoulderJointY = shoulderTopY - 0.032 * s;

  let crotchY = chinY * 0.545 * p.legLen * (1 - (p.torsoLen - 1) * 0.8);
  crotchY = Math.min(crotchY, shoulderJointY - 0.28 * s);
  const hipJointY = crotchY + 0.055 * s;
  const hipX = lerp(0.092, 0.088, g) * sw * (0.75 + 0.25 * p.hips);
  const ankleY = 0.068 * s * (0.8 + 0.2 * p.footSize);
  const kneeY = ankleY + (hipJointY - ankleY) * 0.49;

  const hipsY = hipJointY + 0.035 * s;
  const torsoSpan = shoulderJointY - hipsY;
  const waistY = hipsY + torsoSpan * lerp(0.36, 0.33, g);
  const spineY = hipsY + torsoSpan * 0.22;
  const chestY = hipsY + torsoSpan * 0.52;
  const upperChestY = hipsY + torsoSpan * 0.78;

  const S = lerp(0.158, 0.19, g) * sw * p.shoulders; // shoulder joint half-width
  const armL = H * p.armLen;
  const Lua = 0.172 * armL, Lfa = 0.148 * armL;
  const handL = 0.092 * H * p.handSize;

  const J = {};
  J.hips = [0, hipsY, 0];
  J.spine = [0, spineY, -0.004 * s];
  J.chest = [0, chestY, -0.006 * s];
  J.upperChest = [0, upperChestY, -0.01 * s];
  J.neck = [0, shoulderTopY + 0.004 * s, -0.016 * s];
  J.head = [0, chinY + 0.12 * hH, -0.02 * hH];
  J.headTop = [0, H, -0.02 * hH];
  J.headOrigin = [0, chinY, -0.035 * hH]; // chin-level origin for head local coords

  const side = (sgn) => {
    const pre = sgn > 0 ? 'left' : 'right';
    const x = (v) => v * sgn;
    J[pre + 'Shoulder'] = [x(0.022 * sw), shoulderTopY - 0.012 * s, -0.012 * s];
    J[pre + 'UpperArm'] = [x(S), shoulderJointY, -0.014 * s];
    J[pre + 'LowerArm'] = [x(S + Lua), shoulderJointY - 0.004 * s, -0.022 * s];
    J[pre + 'Hand'] = [x(S + Lua + Lfa), shoulderJointY - 0.006 * s, -0.016 * s];
    J[pre + 'HandTip'] = [x(S + Lua + Lfa + handL), shoulderJointY - 0.01 * s, -0.012 * s];
    J[pre + 'UpperLeg'] = [x(hipX), hipJointY, 0.004 * s];
    J[pre + 'LowerLeg'] = [x(hipX * 0.93), kneeY, 0.008 * s];
    J[pre + 'Foot'] = [x(hipX * 0.9), ankleY, -0.014 * s];
    const footL = 0.142 * H * p.footSize;
    J[pre + 'Toes'] = [x(hipX * 0.92), 0.02 * s, -0.014 * s + footL * 0.66];
    J[pre + 'ToeTip'] = [x(hipX * 0.93), 0.016 * s, -0.014 * s + footL * 0.86];
    J[pre + 'Heel'] = [x(hipX * 0.9), 0.03 * s, -0.014 * s - footL * 0.17];
  };
  side(1);
  side(-1);

  // ---- fingers (local hand frame: f=along fingers, u=+y, t=thumb side (+z)) ----
  const hs = handL / 0.092 / 1.6; // per-meter scale of hand relative to default 1.6m
  const hand = {};
  for (const sgn of [1, -1]) {
    const pre = sgn > 0 ? 'left' : 'right';
    const W = J[pre + 'Hand'];
    const f = [sgn, -0.04, 0.0];
    const fl = Math.hypot(...f);
    f[0] /= fl; f[1] /= fl;
    const u = [0.04 * sgn, 1, 0]; // approx up
    const t = [0, 0, 1];
    const P = (a, b, c) => [W[0] + f[0] * a + u[0] * b + t[0] * c, W[1] + f[1] * a + u[1] * b + t[1] * c, W[2] + f[2] * a + u[2] * b + t[2] * c];
    const palmL = 0.078 * hs * 1.6;
    const sc = hs * 1.6;
    // finger: [lateral offset, lengths of 3 phalanges, base forward offset]
    const defs = {
      Index: [0.0235, [0.036, 0.022, 0.019], 0.0],
      Middle: [0.0075, [0.039, 0.025, 0.02], 0.003],
      Ring: [-0.0085, [0.036, 0.023, 0.019], 0.0],
      Little: [-0.0235, [0.028, 0.018, 0.016], -0.006],
    };
    const fingers = {};
    for (const [name, [off, lens, fo]] of Object.entries(defs)) {
      const spread = off * 0.35; // slight fan
      const curl = [0.06, 0.1, 0.08];
      const pts = [];
      let a = palmL + fo * sc, b = -0.002 * sc, c = off * sc;
      pts.push(P(a, b, c));
      let ang = 0;
      for (let i = 0; i < 3; i++) {
        ang += curl[i];
        a += lens[i] * sc * Math.cos(ang);
        b -= lens[i] * sc * Math.sin(ang);
        c += lens[i] * sc * spread;
        pts.push(P(a, b, c));
      }
      fingers[name] = pts;
    }
    // thumb: metacarpal from near wrist toward +t and forward
    {
      const pts = [];
      let a = 0.012 * sc, b = -0.008 * sc, c = 0.016 * sc;
      pts.push(P(a, b, c));
      const dirs = [[0.62, -0.25, 0.74], [0.8, -0.28, 0.52], [0.9, -0.3, 0.32]];
      const lens = [0.034, 0.03, 0.024];
      for (let i = 0; i < 3; i++) {
        const d = dirs[i];
        const l = Math.hypot(...d);
        a += (d[0] / l) * lens[i] * sc;
        b += (d[1] / l) * lens[i] * sc;
        c += (d[2] / l) * lens[i] * sc;
        pts.push(P(a, b, c));
      }
      fingers.Thumb = pts;
    }
    hand[pre] = { W, f, u, t, palmL, sc, fingers, P };
  }

  // ---- bone list ----
  const bones = [];
  const idx = {};
  const add = (name, parent, pos) => {
    idx[name] = bones.length;
    bones.push({ name, parent: parent == null ? -1 : idx[parent], pos: pos.slice() });
  };
  add('Hips', null, J.hips);
  add('Spine', 'Hips', J.spine);
  add('Chest', 'Spine', J.chest);
  add('UpperChest', 'Chest', J.upperChest);
  add('Neck', 'UpperChest', J.neck);
  add('Head', 'Neck', J.head);
  for (const [pre, P] of [['left', 'Left'], ['right', 'Right']]) {
    add(P + 'Shoulder', 'UpperChest', J[pre + 'Shoulder']);
    add(P + 'UpperArm', P + 'Shoulder', J[pre + 'UpperArm']);
    add(P + 'LowerArm', P + 'UpperArm', J[pre + 'LowerArm']);
    add(P + 'Hand', P + 'LowerArm', J[pre + 'Hand']);
    const fn = hand[pre].fingers;
    const segNames = {
      Thumb: ['Metacarpal', 'Proximal', 'Distal'],
      Index: ['Proximal', 'Intermediate', 'Distal'],
      Middle: ['Proximal', 'Intermediate', 'Distal'],
      Ring: ['Proximal', 'Intermediate', 'Distal'],
      Little: ['Proximal', 'Intermediate', 'Distal'],
    };
    for (const F of FINGERS) {
      let parent = P + 'Hand';
      for (let i = 0; i < 3; i++) {
        const n = P + F + segNames[F][i];
        add(n, parent, fn[F][i]);
        parent = n;
      }
    }
  }
  for (const [pre, P] of [['left', 'Left'], ['right', 'Right']]) {
    add(P + 'UpperLeg', 'Hips', J[pre + 'UpperLeg']);
    add(P + 'LowerLeg', P + 'UpperLeg', J[pre + 'LowerLeg']);
    add(P + 'Foot', P + 'LowerLeg', J[pre + 'Foot']);
    add(P + 'Toes', P + 'Foot', J[pre + 'Toes']);
  }

  return {
    H, s, sw, g, hH, chinY, shoulderTopY, shoulderJointY, crotchY, hipJointY, kneeY, ankleY, waistY, chestY, hipsY, upperChestY,
    S, hipX, Lua, Lfa, handL, J, hand, bones, idx,
  };
}

// Interpolated weights along a vertical chain of bones: list of [boneIndex, y]
export function chainWeights(y, chain) {
  if (y <= chain[0][1]) return [[chain[0][0], 1]];
  for (let i = 0; i < chain.length - 1; i++) {
    const [b0, y0] = chain[i];
    const [b1, y1] = chain[i + 1];
    if (y <= y1) {
      const t = clamp((y - y0) / (y1 - y0), 0, 1);
      const st = t * t * (3 - 2 * t);
      return [[b0, 1 - st], [b1, st]];
    }
  }
  return [[chain[chain.length - 1][0], 1]];
}
