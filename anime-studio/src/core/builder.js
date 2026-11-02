// Builds the whole character as plain typed arrays (runs inside a worker).
import { Field } from './mesher.js';
import { computeRig } from './rig.js';
import { buildBodyPrims, buildHandPrims } from './body.js';
import { buildHead } from './head.js';
import { buildHair } from './hair.js';
import { buildOutfit } from './outfit.js';
import { buildAccessories } from './accessories.js';
import { fieldPart, computeWeights, splitMesh, compact, simplify } from './partkit.js';

export const QUALITY = {
  low: { body: 0.0105, head: 60, hand: 0.004, cap: 0.0065, cloth: 0.0095, fine: 0.0045, mul: 0.4, ring: 6, seg: 10 },
  mid: { body: 0.0072, head: 82, hand: 0.003, cap: 0.0048, cloth: 0.007, fine: 0.0034, mul: 1, ring: 8, seg: 16 },
  high: { body: 0.0052, head: 120, hand: 0.002, cap: 0.0036, cloth: 0.0052, fine: 0.0026, mul: 2.4, ring: 10, seg: 22 },
  ultra: { body: 0.004, head: 160, hand: 0.0015, cap: 0.0028, cloth: 0.004, fine: 0.002, mul: 6, ring: 12, seg: 28 },
};

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
