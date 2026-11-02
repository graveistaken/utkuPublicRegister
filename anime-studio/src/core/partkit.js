// Helpers to turn fields / raw triangles into skinned "parts".
import { MeshoptSimplifier } from 'meshoptimizer';
import { meshField } from './mesher.js';

export const simplifierReady = MeshoptSimplifier.ready;

export function simplify(mesh, targetTris, absErr) {
  const tris = mesh.index.length / 3;
  if (!targetTris || tris <= targetTris) return mesh;
  const [idx] = MeshoptSimplifier.simplify(mesh.index, mesh.positions, 3, targetTris * 3, absErr, ['ErrorAbsolute']);
  return compact({ ...mesh, index: idx });
}

// remove unreferenced vertices; works with any per-vertex attribute arrays listed in mesh.attrs (name->itemSize)
export function compact(mesh) {
  const nv = mesh.positions.length / 3;
  const remap = new Int32Array(nv).fill(-1);
  let n = 0;
  for (let i = 0; i < mesh.index.length; i++) {
    const v = mesh.index[i];
    if (remap[v] < 0) remap[v] = n++;
  }
  const out = { ...mesh };
  const take = (arr, sz) => {
    if (!arr) return arr;
    const r = new arr.constructor(n * sz);
    for (let v = 0; v < nv; v++) {
      const t = remap[v];
      if (t < 0) continue;
      for (let k = 0; k < sz; k++) r[t * sz + k] = arr[v * sz + k];
    }
    return r;
  };
  out.positions = take(mesh.positions, 3);
  out.normals = take(mesh.normals, 3);
  if (mesh.uvs) out.uvs = take(mesh.uvs, 2);
  if (mesh.hairT) out.hairT = take(mesh.hairT, 1);
  if (mesh.colors) out.colors = take(mesh.colors, 3);
  if (mesh.skinIndex) out.skinIndex = take(mesh.skinIndex, 4);
  if (mesh.skinWeight) out.skinWeight = take(mesh.skinWeight, 4);
  const idx = new Uint32Array(mesh.index.length);
  for (let i = 0; i < idx.length; i++) idx[i] = remap[mesh.index[i]];
  out.index = idx;
  return out;
}

export function computeWeights(mesh, prims, sigma = 0.012) {
  const wp = prims.filter((p) => p.bone != null || p.boneFn);
  const P = mesh.positions;
  const nv = P.length / 3;
  const SI = new Uint16Array(nv * 4);
  const SW = new Float32Array(nv * 4);
  const ds = new Float64Array(wp.length);
  const acc = new Map();
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let dmin = 1e9;
    for (let i = 0; i < wp.length; i++) {
      const d = wp[i].d(x, y, z);
      ds[i] = d;
      if (d < dmin) dmin = d;
    }
    acc.clear();
    for (let i = 0; i < wp.length; i++) {
      const e = Math.exp(-(ds[i] - dmin) / sigma);
      if (e < 2e-3) continue;
      const pr = wp[i];
      if (pr.boneFn) {
        for (const [b, w] of pr.boneFn(x, y, z)) acc.set(b, (acc.get(b) || 0) + e * w);
      } else acc.set(pr.bone, (acc.get(pr.bone) || 0) + e);
    }
    const arr = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0;
    for (const [, w] of arr) sum += w;
    for (let k = 0; k < 4; k++) {
      if (k < arr.length) {
        SI[v * 4 + k] = arr[k][0];
        SW[v * 4 + k] = arr[k][1] / sum;
      }
    }
  }
  mesh.skinIndex = SI;
  mesh.skinWeight = SW;
  return mesh;
}

export function rigidWeights(mesh, bone) {
  const nv = mesh.positions.length / 3;
  mesh.skinIndex = new Uint16Array(nv * 4);
  mesh.skinWeight = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    mesh.skinIndex[v * 4] = bone;
    mesh.skinWeight[v * 4] = 1;
  }
  return mesh;
}

export function fieldPart(field, h, targetTris, absErr) {
  const m = meshField(field, h);
  return simplify(m, targetTris, absErr ?? h * 0.25);
}

// split triangles of a mesh into two meshes via predicate(triIndex, a, b, c)
export function splitMesh(mesh, pred) {
  const A = [], B = [];
  const I = mesh.index;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    (pred(a, b, c) ? A : B).push(a, b, c);
  }
  return [compact({ ...mesh, index: new Uint32Array(A) }), compact({ ...mesh, index: new Uint32Array(B) })];
}

// merge several raw meshes (same attribute set)
export function mergeMeshes(list) {
  list = list.filter((m) => m && m.index.length);
  let nv = 0, ni = 0;
  for (const m of list) {
    nv += m.positions.length / 3;
    ni += m.index.length;
  }
  const out = {
    positions: new Float32Array(nv * 3),
    normals: new Float32Array(nv * 3),
    index: new Uint32Array(ni),
  };
  const hasUV = list.some((m) => m.uvs), hasT = list.some((m) => m.hairT), hasC = list.some((m) => m.colors);
  if (hasUV) out.uvs = new Float32Array(nv * 2);
  if (hasT) out.hairT = new Float32Array(nv);
  if (hasC) out.colors = new Float32Array(nv * 3).fill(1);
  const hasSkin = list.every((m) => m.skinIndex);
  if (hasSkin) {
    out.skinIndex = new Uint16Array(nv * 4);
    out.skinWeight = new Float32Array(nv * 4);
  }
  let vo = 0, io = 0;
  for (const m of list) {
    const n = m.positions.length / 3;
    out.positions.set(m.positions, vo * 3);
    out.normals.set(m.normals, vo * 3);
    if (hasUV && m.uvs) out.uvs.set(m.uvs, vo * 2);
    if (hasT && m.hairT) out.hairT.set(m.hairT, vo);
    if (hasC && m.colors) out.colors.set(m.colors, vo * 3);
    if (hasSkin) {
      out.skinIndex.set(m.skinIndex, vo * 4);
      out.skinWeight.set(m.skinWeight, vo * 4);
    }
    for (let i = 0; i < m.index.length; i++) out.index[io + i] = m.index[i] + vo;
    vo += n;
    io += m.index.length;
  }
  return out;
}
