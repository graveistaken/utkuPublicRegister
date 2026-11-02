// Builds the whole character as plain typed arrays (runs inside a worker).
import { Field } from './mesher.js';
import { computeRig } from './rig.js';
import { buildBodyPrims, buildHandPrims } from './body.js';
import { buildHead } from './head.js';
import { buildHair } from './hair.js';
import { buildOutfit } from './outfit.js';
import { buildAccessories } from './accessories.js';
import { fieldPart, computeWeights, splitMesh, compact, simplify, bakeAO } from './partkit.js';

export const QUALITY = {
  low: { body: 0.0105, head: 60, hand: 0.004, cap: 0.0065, cloth: 0.0095, fine: 0.0045, mul: 0.4, ring: 6, seg: 10 },
  mid: { body: 0.0072, head: 82, hand: 0.003, cap: 0.0048, cloth: 0.007, fine: 0.0034, mul: 1, ring: 8, seg: 16 },
  high: { body: 0.0052, head: 120, hand: 0.002, cap: 0.0036, cloth: 0.0052, fine: 0.0026, mul: 2.4, ring: 10, seg: 22 },
  ultra: { body: 0.004, head: 160, hand: 0.0015, cap: 0.0028, cloth: 0.004, fine: 0.002, mul: 6, ring: 12, seg: 28 },
};

// pinkish tint near joints (knees, elbows, knuckles, fingertips, shoulders, ears, nose)
function blushJoints(rig, head) {
  const J = rig.J, s = rig.s, list = [];
  for (const pre of ['left', 'right']) {
    const k = J[pre + 'LowerLeg'];
    list.push([[k[0], k[1] + 0.005 * s, k[2] + 0.04 * s], 0.045 * s, 0.9]);
    const e = J[pre + 'LowerArm'];
    list.push([[e[0], e[1], e[2] - 0.028 * s], 0.035 * s, 0.7]);
    const sh = J[pre + 'UpperArm'];
    list.push([[sh[0], sh[1] + 0.04 * s, sh[2]], 0.05 * s, 0.45]);
    list.push([J[pre + 'ToeTip'], 0.035 * s, 0.6]);
    list.push([J[pre + 'Heel'], 0.03 * s, 0.5]);
    const f = rig.hand[pre].fingers;
    for (const F of ['Index', 'Middle', 'Ring', 'Little', 'Thumb']) {
      list.push([f[F][1], 0.011 * s, 0.6]);
      list.push([f[F][3], 0.013 * s, 0.9]);
    }
  }
  const hh = rig.hH;
  for (const sg of [-1, 1]) list.push([head.toWorld(sg * 0.38 * head.cw, 0.4, -0.045), 0.09 * hh, 0.7]);
  list.push([head.toWorld(0, head.nose.y, head.nose.z), 0.06 * hh, 0.45]);
  return list;
}
function addBlush(mesh, joints) {
  const P = mesh.positions, nv = P.length / 3;
  const b = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    let acc = 0;
    for (const [c, r, w] of joints) {
      const dx = P[v * 3] - c[0], dy = P[v * 3 + 1] - c[1], dz = P[v * 3 + 2] - c[2];
      const d2 = (dx * dx + dy * dy + dz * dz) / (r * r);
      if (d2 < 9) acc += w * Math.exp(-d2);
    }
    b[v] = Math.min(1, acc);
  }
  mesh.blush = b;
  return mesh;
}

const cache = new Map();
function memo(key, deps, fn) {
  const k = key + '|' + JSON.stringify(deps);
  if (cache.has(k)) return cache.get(k);
  const v = fn();
  // keep cache small
  for (const kk of cache.keys()) if (kk.startsWith(key + '|')) cache.delete(kk);
  cache.set(k, v);
  return v;
}

const pick = (p, keys) => keys.map((k) => p[k]);
export const BODY_KEYS = ['height', 'headsTall', 'gender', 'muscle', 'weight', 'shoulders', 'chest', 'bust', 'waist', 'hips', 'torsoLen', 'neckLen', 'neckThick', 'armLen', 'armThick', 'handSize', 'legLen', 'thigh', 'calf', 'footSize', 'headSize', 'quality'];
export const HEAD_KEYS = ['faceWidth', 'jaw', 'chinLen', 'chinPoint', 'cheeks', 'faceFlat', 'noseSize', 'noseHeight', 'earType', 'earSize'];
const HAIR_KEYS = ['hairStyle', 'bangs', 'bangsLen', 'bangsCount', 'sideLen', 'backLen', 'volume', 'strandWidth', 'spikiness', 'wave', 'tipFlip', 'partX', 'ahoge', 'tails', 'tailLen', 'tailHeight', 'tailVolume', 'seed'];
const OUTFIT_KEYS = ['top', 'sleeveLen', 'topLen', 'topLoose', 'bottom', 'bottomLen', 'skirtFlare', 'pleats', 'legwear', 'shoes'];
const ACC_KEYS = ['animalEars', 'headAcc', 'glasses', 'tail', 'choker'];

export function buildCharacter(p, groups = 'ABC') {
  const t0 = performance.now();
  const Q = QUALITY[p.quality] || QUALITY.mid;
  const rig = computeRig(p);
  const body = buildBodyPrims(rig, p);
  const bodyField = new Field(body.prims);
  const head = buildHead(rig, p);
  const timings = {};
  const T = (name, f) => {
    const t = performance.now();
    const r = f();
    timings[name] = Math.round(performance.now() - t);
    return r;
  };
  const bodyDeps = pick(p, BODY_KEYS);
  const headDeps = [...bodyDeps, ...pick(p, HEAD_KEYS)];

  // ---- outfit first (body triangles hidden under clothes get removed) ----
  const doA = groups.includes('A'), doB = groups.includes('B'), doC = groups.includes('C');
  const outfit = doB
    ? T('outfit', () => memo('outfit', [...bodyDeps, ...pick(p, OUTFIT_KEYS)], () => buildOutfit(rig, p, body, bodyField, Q)))
    : doA
    ? memo('covers', [...bodyDeps, ...pick(p, OUTFIT_KEYS)], () => buildOutfit(rig, p, body, bodyField, Q, { coversOnly: true }))
    : { parts: [], covers: [] };

  const bodyRaw = !doA ? null : T('body', () =>
    memo('body', bodyDeps, () => {
      const m = fieldPart(bodyField, Q.body, Math.round(9000 * Q.mul), Q.body * 0.18);
      addBlush(m, blushJoints(rig, head));
      bakeAO(m, bodyField, 0.012, 1.1);
      return computeWeights(m, body.prims, 0.011);
    })
  );
  // remove covered triangles
  let bodyMesh = bodyRaw;
  if (doA && outfit.covers.length) {
    bodyMesh = T('cull', () =>
      memo('cull', [...bodyDeps, ...pick(p, OUTFIT_KEYS)], () => {
        const P = bodyRaw.positions;
        const nv = P.length / 3;
        const covered = new Uint8Array(nv);
        for (let v = 0; v < nv; v++) {
          const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
          for (const c of outfit.covers) {
            if (c(x, y, z) < 0) {
              covered[v] = 1;
              break;
            }
          }
        }
        const I = bodyRaw.index;
        const keep = [];
        for (let t = 0; t < I.length; t += 3) {
          if (covered[I[t]] && covered[I[t + 1]] && covered[I[t + 2]]) continue;
          keep.push(I[t], I[t + 1], I[t + 2]);
        }
        return compact({ ...bodyRaw, index: new Uint32Array(keep) });
      })
    );
  }

  const headMesh = !doC ? {} : T('head', () =>
    memo('head', headDeps, () => {
      const f = new Field([head.prim]);
      const m = fieldPart(f, rig.hH / Q.head, Math.round(5000 * Q.mul), (rig.hH / Q.head) * 0.15);
      // face UVs (planar)
      const P = m.positions, N = m.normals;
      const nv = P.length / 3;
      const uvs = new Float32Array(nv * 2);
      const r = head.rect;
      for (let v = 0; v < nv; v++) {
        uvs[v * 2] = (P[v * 3] - r.x0) / (r.x1 - r.x0);
        uvs[v * 2 + 1] = (P[v * 3 + 1] - r.y0) / (r.y1 - r.y0);
      }
      m.uvs = uvs;
      // anime face normals: blend toward a smooth ellipsoid so the face shades cleanly
      for (let v = 0; v < nv; v++) {
        const l = head.toLocal(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        const w = Math.min(1, Math.max(0, (l[2] + 0.05) / 0.3)) * (1 - Math.min(1, Math.max(0, (l[1] - 0.7) / 0.2))) * (1 - Math.min(1, Math.max(0, (Math.abs(l[0]) - 0.3) / 0.08)));
        if (w <= 0) continue;
        let sx = l[0] / 0.36, sy = (l[1] - 0.42) / 0.5, sz = (l[2] + 0.1) / 0.42;
        const sl = Math.hypot(sx, sy, sz) || 1;
        sx /= sl; sy /= sl; sz /= sl;
        const k = 0.8 * w;
        let nx = N[v * 3] * (1 - k) + sx * k, ny = N[v * 3 + 1] * (1 - k) + sy * k, nz = N[v * 3 + 2] * (1 - k) + sz * k;
        const nl = Math.hypot(nx, ny, nz) || 1;
        N[v * 3] = nx / nl; N[v * 3 + 1] = ny / nl; N[v * 3 + 2] = nz / nl;
      }
      addBlush(m, blushJoints(rig, head));
      bakeAO(m, new Field([head.prim, ...body.prims.filter((q) => q.tag === 'neck' || q.tag === 'torso')]), 0.008, 0.9);
      const nmesh = computeWeights(m, [head.prim, ...body.prims.filter((q) => q.tag === 'neck')], 0.01);
      const O = head.O;
      const isFace = (v) => N[v * 3 + 2] > 0.12 && P[v * 3 + 2] > O[2] + 0.05 * rig.hH && uvs[v * 2 + 1] > 0.0 && uvs[v * 2 + 1] < 0.92 && uvs[v * 2] > 0.04 && uvs[v * 2] < 0.96;
      const [face, skin] = splitMesh(nmesh, (a, b, c) => isFace(a) && isFace(b) && isFace(c));
      return { face, skin };
    })
  );

  const hands = !doC ? [] : T('hands', () =>
    memo('hands', bodyDeps, () =>
      [1, -1].map((sg) => {
        const prims = buildHandPrims(rig, p, sg);
        const m = fieldPart(new Field(prims), Q.hand, Math.round(2200 * Q.mul), Q.hand * 0.2);
        addBlush(m, blushJoints(rig, head));
        bakeAO(m, new Field(prims), 0.005, 1.0);
        return computeWeights(m, prims, 0.006);
      })
    )
  );

  const hair = !doC ? { parts: [] } : T('hair', () => memo('hair', [...headDeps, ...pick(p, HAIR_KEYS), ...pick(p, ['animalEars'])], () => buildHair(rig, p, head, bodyField, Q)));
  const acc = !doC ? { parts: [] } : T('acc', () => memo('acc', [...headDeps, ...pick(p, ACC_KEYS), ...pick(p, HAIR_KEYS), p.eyeY, p.eyeSpacing, p.eyeSize], () => buildAccessories(rig, p, head, body, bodyField, Q, hair)));

  const parts = [];
  const push = (name, mat, mesh, extra = {}) => {
    if (!mesh || !mesh.index || !mesh.index.length) return;
    parts.push({ name, mat, ...mesh, ...extra });
  };
  push('Body', 'skin', bodyMesh);
  push('Head', 'skin', headMesh.skin);
  push('Face', 'face', headMesh.face);
  if (doC) {
    push('HandL', 'skin', hands[0]);
    push('HandR', 'skin', hands[1]);
  }
  for (const h of hair.parts) push(h.name, h.mat, h.mesh, h.extra);
  if (doB) for (const o of outfit.parts) push(o.name, o.mat, o.mesh, o.extra);
  for (const a of acc.parts) push(a.name, a.mat, a.mesh, a.extra);

  let tris = 0;
  for (const pt of parts) tris += pt.index.length / 3;
  return {
    bones: rig.bones,
    parts,
    meta: {
      rect: head.rect,
      hH: rig.hH,
      headOrigin: head.O,
      height: rig.H,
      chestY: rig.chestY,
      J: rig.J,
      tris,
      ms: Math.round(performance.now() - t0),
      timings,
    },
  };
}
