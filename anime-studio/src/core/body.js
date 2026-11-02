// Body anatomy as SDF primitives.
import { ellipsoid, limb, loft, custom, lerp, smax, sdRoundBox, v3, basis } from './sdf.js';
import { chainWeights, FINGERS } from './rig.js';

export function buildBodyPrims(rig, p) {
  const { J, idx, s, sw, g } = rig;
  const m = p.muscle, w = p.weight;
  const fat = 0.85 + 0.35 * w;
  const prims = [];
  const B = (n) => idx[n];

  // ---------------- torso loft ----------------
  const fx = (f, ma) => lerp(f, ma, g) * sw;
  const hipsW = p.hips, waistW = p.waist, chestW = p.chest;
  const yC = rig.crotchY, yH = rig.hipJointY, yW = rig.waistY, ySh = rig.shoulderTopY, ySj = rig.shoulderJointY;
  const yUB = lerp(yW, ySj, 0.42);
  const yCh = lerp(yW, ySj, 0.72);
  const sections = [
    { y: yC - 0.012 * s, rx: fx(0.085, 0.085) * hipsW, rz: 0.07 * sw * fat, z: -0.006 * s },
    { y: yH - 0.012 * s, rx: fx(0.152, 0.138) * hipsW * (0.93 + 0.12 * w), rz: fx(0.098, 0.092) * fat, z: -0.012 * s },
    { y: lerp(yH, yW, 0.5), rx: fx(0.138, 0.13) * lerp(hipsW, waistW, 0.5) * (0.92 + 0.14 * w), rz: fx(0.09, 0.088) * fat, z: -0.006 * s },
    { y: yW, rx: fx(0.104, 0.126) * waistW * (0.88 + 0.25 * w), rz: fx(0.08, 0.086) * (0.9 + 0.25 * w), z: 0.0 },
    { y: yUB, rx: fx(0.118, 0.142) * chestW * (0.95 + 0.06 * m), rz: fx(0.087, 0.095), z: -0.004 * s },
    { y: yCh, rx: fx(0.124, 0.158) * chestW * (0.95 + 0.08 * m), rz: fx(0.094, 0.104) * (0.95 + 0.08 * m), z: -0.008 * s },
    { y: ySj + 0.008 * s, rx: fx(0.112, 0.148) * lerp(chestW, p.shoulders, 0.5), rz: fx(0.072, 0.082), z: -0.014 * s },
    { y: ySh + 0.012 * s, rx: fx(0.048, 0.06) * p.neckThick, rz: fx(0.04, 0.048), z: -0.016 * s },
  ];
  const spineChain = [
    [B('Hips'), J.hips[1]],
    [B('Spine'), J.spine[1]],
    [B('Chest'), J.chest[1]],
    [B('UpperChest'), J.upperChest[1]],
    [B('Neck'), J.neck[1] + 0.02 * s],
  ];
  const torso = loft(sections, { k: 0.02, capK: 0.03, exp: 2.3, tag: 'torso', boneFn: (x, y) => chainWeights(y, spineChain) });
  prims.push(torso);

  // belly / lower abdomen softness
  prims.push(ellipsoid([0, lerp(yH, yW, 0.35), 0.035 * s * fat], [fx(0.1, 0.105) * hipsW, 0.075 * s, 0.065 * sw * fat], { k: 0.04, tag: 'torso', boneFn: () => [[B('Hips'), 0.6], [B('Spine'), 0.4]] }));

  // ---------------- neck ----------------
  const nr = fx(0.031, 0.04) * p.neckThick;
  const neckBot = [0, ySh - 0.02 * s, -0.018 * s];
  const neckTop = [0, rig.chinY + 0.13 * rig.hH, -0.03 * rig.hH];
  const neckPrim = limb(neckBot, neckTop, [nr * 1.12, nr, nr * 0.98], {
    k: 0.03,
    tag: 'neck',
    boneFn: (x, y) => {
      const t = Math.min(Math.max((y - (rig.chinY - 0.03 * s)) / (0.06 * s), 0), 1);
      if (y < J.neck[1]) return [[B('UpperChest'), 0.5], [B('Neck'), 0.5]];
      return [[B('Neck'), 1 - t], [B('Head'), t]];
    },
  });
  prims.push(neckPrim);

  // ---------------- breasts / pecs ----------------
  if (p.bust > 0.02) {
    const r = 0.052 * sw * p.bust ** 0.6 * (0.85 + 0.2 * w) * (1 - g * 0.6);
    const yb = yCh - 0.02 * s - r * 0.25;
    const zb = sections[5].rz * 0.5;
    for (const sg of [1, -1]) {
      const rot = basis(v3.norm([1, 0, -0.25 * sg]), [0, 1, 0], v3.norm([0.25 * sg, 0, 1]));
      prims.push(ellipsoid([sg * 0.056 * sw * chestW, yb, zb], [r * 1.05, r * 0.95, r * 0.9], { k: 0.035 + r * 0.3, tag: 'breast', rot, boneFn: () => [[B('UpperChest'), 0.55], [B('Chest'), 0.45]] }));
    }
  }
  if (g > 0.3 && m > 0.05) {
    const a = (g - 0.3) * m;
    for (const sg of [1, -1]) {
      prims.push(ellipsoid([sg * 0.062 * sw, yCh + 0.005 * s, sections[5].rz * 0.42], [0.075 * sw, 0.055 * s, 0.045 * sw * (0.7 + 0.6 * a)], { k: 0.04, tag: 'breast', boneFn: () => [[B('UpperChest'), 1]] }));
    }
  }

  // ---------------- buttocks ----------------
  for (const sg of [1, -1]) {
    const r = fx(0.07, 0.062) * hipsW * (0.85 + 0.3 * w);
    prims.push(ellipsoid([sg * 0.05 * sw * hipsW, yH - 0.018 * s, -0.04 * sw], [r * 1.05, r * 1.1, r * 0.9], { k: 0.04, tag: 'butt', boneFn: () => [[B('Hips'), 0.55], [B(sg > 0 ? 'LeftUpperLeg' : 'RightUpperLeg'), 0.45]] }));
  }

  // ---------------- limbs ----------------
  const armT = p.armThick * (0.92 + 0.18 * w) * (1 + 0.22 * m * g);
  for (const sg of [1, -1]) {
    const pre = sg > 0 ? 'left' : 'right';
    const P = sg > 0 ? 'Left' : 'Right';
    const sh = J[pre + 'UpperArm'], el = J[pre + 'LowerArm'], wr = J[pre + 'Hand'];
    // trapezius / shoulder slope
    prims.push(limb([sg * 0.03 * sw, ySh + 0.004 * s, -0.022 * s], [sh[0] - sg * 0.02 * sw, sh[1] + 0.01 * s, sh[2] - 0.004 * s], [fx(0.03, 0.04), fx(0.027, 0.036)], { k: 0.03, tag: 'trap', bone: B(P + 'Shoulder') }));
    // deltoid
    const dr = fx(0.041, 0.05) * armT * (1 + 0.15 * m);
    prims.push(ellipsoid([sh[0] - sg * 0.004 * sw, sh[1] + 0.004 * s, sh[2]], [dr * 1.05, dr, dr * 1.05], { k: 0.025, tag: 'shoulder', boneFn: () => [[B(P + 'UpperArm'), 0.7], [B(P + 'Shoulder'), 0.3]] }));
    const ua = fx(0.037, 0.044) * armT;
    prims.push(limb(sh, el, [ua * 1.02, ua * (1 + 0.1 * m), ua * 0.92, ua * 0.76], { k: 0.012, tag: 'upperArm', bone: B(P + 'UpperArm'), squash: { dir: [0, 0, 1], f: 0.92 } }));
    const fa = fx(0.029, 0.036) * armT;
    const wrPlane = v3.norm(v3.sub(wr, el));
    const forearm = limb(el, wr, [fa * 0.98, fa * 1.06, fa * 0.92, fa * 0.74], { k: 0.012, tag: 'lowerArm', bone: B(P + 'LowerArm'), squash: { dir: [0, 1, 0], f: 0.84 } });
    // cut flat at wrist (hand mesh covers the joint)
    const fd = forearm.d;
    forearm.d = (x, y, z) => smax(fd(x, y, z), (x - wr[0]) * wrPlane[0] + (y - wr[1]) * wrPlane[1] + (z - wr[2]) * wrPlane[2] - 0.002, 0.004);
    prims.push(forearm);

    // legs
    const hp = J[pre + 'UpperLeg'], kn = J[pre + 'LowerLeg'], an = J[pre + 'Foot'];
    const th = fx(0.07, 0.066) * p.thigh * (0.88 + 0.3 * w) * (1 + 0.12 * m);
    prims.push(limb([hp[0] * 0.92, hp[1] + 0.03 * s, hp[2]], kn, [th * 1.0, th * 0.95, th * 0.8, th * 0.63, th * 0.56], { k: 0.025, tag: 'thigh', bone: B(P + 'UpperLeg') }));
    const ca = fx(0.047, 0.05) * p.calf * (0.9 + 0.22 * w) * (1 + 0.1 * m);
    prims.push(limb(kn, an, [ca * 0.88, ca * 1.04, ca * 0.86, ca * 0.62, ca * 0.5], { k: 0.012, tag: 'calf', bone: B(P + 'LowerLeg'), squash: { dir: [1, 0, 0], f: 0.92 } }));
    // knee cap hint
    prims.push(ellipsoid([kn[0], kn[1] + 0.004 * s, kn[2] + ca * 0.45], [ca * 0.62, ca * 0.75, ca * 0.5], { k: 0.02, tag: 'calf', boneFn: () => [[B(P + 'LowerLeg'), 0.5], [B(P + 'UpperLeg'), 0.5]] }));

    // feet
    const fs = p.footSize * sw;
    const heel = J[pre + 'Heel'], toes = J[pre + 'Toes'], tip = J[pre + 'ToeTip'];
    const ar = ca * 0.5;
    const flat = (pr) => {
      const d0 = pr.d;
      pr.d = (x, y, z) => smax(d0(x, y, z), -y + 0.001, 0.008);
      return pr;
    };
    prims.push(flat(limb(an, heel, [ar * 1.0, 0.027 * fs], { k: 0.015, tag: 'foot', bone: B(P + 'Foot') })));
    prims.push(flat(limb(heel, toes, [0.027 * fs, 0.032 * fs, 0.03 * fs], { k: 0.02, tag: 'foot', bone: B(P + 'Foot'), squash: { dir: [0, 1, 0], f: 0.62 } })));
    prims.push(flat(limb(toes, tip, [0.03 * fs, 0.022 * fs], { k: 0.012, tag: 'foot', bone: B(P + 'Toes'), squash: { dir: [0, 1, 0], f: 0.6 } })));
  }

  return { prims, sections, torso };
}

// ---------------- hands (separate fine mesh) ----------------
export function buildHandPrims(rig, p, sg) {
  const pre = sg > 0 ? 'left' : 'right';
  const P = sg > 0 ? 'Left' : 'Right';
  const h = rig.hand[pre];
  const { W, f, sc } = h;
  const prims = [];
  const B = (n) => rig.idx[n];
  const armT = p.armThick * (0.92 + 0.18 * p.weight) * (1 + 0.22 * p.muscle * rig.g);
  const fa = lerp(0.029, 0.036, rig.g) * rig.sw * armT;
  const wristR = fa * 0.74;
  // wrist stub (overlaps forearm cut)
  const back = [W[0] - f[0] * 0.022, W[1] - f[1] * 0.022, W[2] - f[2] * 0.022];
  prims.push(limb(back, h.P(0.012 * sc, -0.002 * sc, 0.002 * sc), [wristR * 1.015, wristR * 0.97], { k: 0.01, bone: B(P + 'Hand'), squash: { dir: [0, 1, 0], f: 0.84 } }));
  // palm: rounded box in hand frame
  const palmL = h.palmL;
  const c = h.P(palmL * 0.52, -0.003 * sc, -0.001 * sc);
  const hw = 0.036 * sc, ht = 0.0115 * sc, hl = palmL * 0.5;
  const ax = f, ay = v3.norm([0.04 * sg, 1, 0]), az = v3.norm(v3.cross(ax, ay));
  prims.push(custom(
    (x, y, z) => {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const lx = px * ax[0] + py * ax[1] + pz * ax[2];
      const ly = px * ay[0] + py * ay[1] + pz * ay[2];
      const lz = px * az[0] + py * az[1] + pz * az[2];
      // taper toward wrist
      const taper = 1 - 0.12 * Math.max(0, -lx / hl);
      return sdRoundBox(lx, ly, lz / taper, hl, ht, hw, ht * 0.95);
    },
    [c[0] - 0.07, c[1] - 0.04, c[2] - 0.06, c[0] + 0.07, c[1] + 0.04, c[2] + 0.06],
    { k: 0.012, bone: B(P + 'Hand') }
  ));
  // thumb pad
  prims.push(ellipsoid(h.P(0.026 * sc, -0.006 * sc, 0.02 * sc), [0.02 * sc, 0.011 * sc, 0.014 * sc], { k: 0.012, bone: B(P + 'Hand'), boneFn: () => [[B(P + 'Hand'), 0.5], [B(P + 'ThumbMetacarpal'), 0.5]] }));
  const segNames = {
    Thumb: ['Metacarpal', 'Proximal', 'Distal'],
    Index: ['Proximal', 'Intermediate', 'Distal'],
    Middle: ['Proximal', 'Intermediate', 'Distal'],
    Ring: ['Proximal', 'Intermediate', 'Distal'],
    Little: ['Proximal', 'Intermediate', 'Distal'],
  };
  const fr = 0.0078 * sc * (0.92 + 0.15 * rig.g);
  for (const F of FINGERS) {
    const pts = h.fingers[F];
    const rs = F === 'Thumb' ? [fr * 1.45, fr * 1.15, fr * 1.05, fr * 0.92] : F === 'Little' ? [fr * 0.9, fr * 0.82, fr * 0.76, fr * 0.68] : [fr, fr * 0.93, fr * 0.86, fr * 0.78];
    for (let i = 0; i < 3; i++) {
      const bone = B(P + F + segNames[F][i]);
      prims.push(limb(pts[i], pts[i + 1], [rs[i], rs[i + 1]], { k: i === 0 ? 0.008 : 0.003, bone }));
    }
  }
  return prims;
}
