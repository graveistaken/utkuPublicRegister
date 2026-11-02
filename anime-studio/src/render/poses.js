// Poses as local bone rotations (degrees, XYZ Euler) relative to the T-pose bind.
// Bind: arms along ±X, palms down, fingers straight, character faces +Z.

const curlL = (deg) => ({ Proximal: [0, 0, -deg], Intermediate: [0, 0, -deg * 1.1], Distal: [0, 0, -deg * 0.8] });

function fingers(side, spec) {
  // spec: {Index: deg, Middle: deg, ...}; side 'Left' | 'Right'
  const out = {};
  const sg = side === 'Left' ? 1 : -1;
  for (const [f, deg] of Object.entries(spec)) {
    if (f === 'Thumb') {
      out[side + 'ThumbProximal'] = [0, -sg * deg * 0.4, -sg * deg * 0.3];
      out[side + 'ThumbDistal'] = [0, -sg * deg * 0.5, -sg * deg * 0.2];
      continue;
    }
    const c = curlL(deg);
    for (const [seg, r] of Object.entries(c)) out[side + f + seg] = [r[0], r[1], r[2] * sg];
  }
  return out;
}

const relaxed = (side) => fingers(side, { Index: 12, Middle: 16, Ring: 20, Little: 24, Thumb: 10 });

export const POSES = {
  tpose: {},
  apose: {
    LeftUpperArm: [0, 0, -42], RightUpperArm: [0, 0, 42],
    ...relaxed('Left'), ...relaxed('Right'),
  },
  idle: {
    Hips: [0, 3, 0],
    Spine: [2, 0, 0],
    Chest: [0, -2, 0],
    Neck: [0, 0, 0],
    Head: [3, -4, 2],
    LeftShoulder: [0, 0, -4], RightShoulder: [0, 0, 4],
    LeftUpperArm: [6, 8, -72], RightUpperArm: [6, -8, 72],
    LeftLowerArm: [0, -18, 0], RightLowerArm: [0, 18, 0],
    LeftHand: [-8, 0, 6], RightHand: [-8, 0, -6],
    LeftUpperLeg: [0, 0, 2], RightUpperLeg: [-4, 8, -3],
    RightLowerLeg: [6, 0, 0], RightFoot: [-2, 0, 0],
    ...relaxed('Left'), ...relaxed('Right'),
  },
  wave: {
    Spine: [0, 0, -2],
    Head: [0, -6, -5],
    LeftUpperArm: [6, 8, -72], LeftLowerArm: [0, -15, 0],
    RightShoulder: [0, 0, -8],
    RightUpperArm: [0, -15, -30], RightLowerArm: [0, 0, -95], RightHand: [0, 0, 8],
    ...relaxed('Left'),
    ...fingers('Right', { Index: 3, Middle: 2, Ring: 4, Little: 6, Thumb: 0 }),
  },
  peace: {
    Spine: [0, 0, 2],
    Head: [0, 8, 6],
    LeftUpperArm: [6, 8, -72], LeftLowerArm: [0, -15, 0],
    RightUpperArm: [0, -55, -12], RightLowerArm: [0, -10, -120], RightHand: [0, 0, 20],
    ...relaxed('Left'),
    ...fingers('Right', { Index: 0, Middle: 0, Ring: 75, Little: 80, Thumb: 45 }),
  },
  hips: {
    Hips: [0, -3, 0],
    Head: [2, 5, -4],
    LeftUpperArm: [0, 25, -62], LeftLowerArm: [0, -95, 0], LeftHand: [0, 0, -20],
    RightUpperArm: [0, -25, 62], RightLowerArm: [0, 95, 0], RightHand: [0, 0, 20],
    LeftUpperLeg: [0, 0, 6], RightUpperLeg: [0, 0, -6],
    ...fingers('Left', { Index: 8, Middle: 10, Ring: 12, Little: 14, Thumb: 5 }),
    ...fingers('Right', { Index: 8, Middle: 10, Ring: 12, Little: 14, Thumb: 5 }),
  },
};
