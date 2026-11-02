// Field (smooth union of primitives with spatial culling) + Surface Nets mesher.
import { smin } from './sdf.js';

export class Field {
  constructor(prims, opts = {}) {
    this.prims = prims.filter(Boolean);
    this.post = opts.post || null; // (d,x,y,z) => d   (may only intersect / clip)
    this.extraBox = opts.box || null;
  }
  bounds() {
    if (this.extraBox) return this.extraBox.slice();
    const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const p of this.prims) {
      for (let i = 0; i < 3; i++) {
        b[i] = Math.min(b[i], p.box[i] - p.k);
        b[i + 3] = Math.max(b[i + 3], p.box[i + 3] + p.k);
      }
    }
    return b;
  }
  primsFor(minx, miny, minz, maxx, maxy, maxz, margin) {
    const out = [];
    for (const p of this.prims) {
      const m = margin + p.k;
      const b = p.box;
      if (b[0] - m > maxx || b[3] + m < minx || b[1] - m > maxy || b[4] + m < miny || b[2] - m > maxz || b[5] + m < minz) continue;
      out.push(p);
    }
    return out;
  }
  evalList(list, x, y, z) {
    let d = 1e3;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      d = smin(d, p.d(x, y, z), p.k);
    }
    return this.post ? this.post(d, x, y, z) : d;
  }
  eval(x, y, z) {
    return this.evalList(this.prims, x, y, z);
  }
}

// Surface nets over a sparse block grid.
export function meshField(field, h, opts = {}) {
  const fb = field.bounds();
  const pad = 2 * h;
  const x0 = fb[0] - pad, y0 = fb[1] - pad, z0 = fb[2] - pad;
  const nx = Math.ceil((fb[3] + pad - x0) / h) + 1;
  const ny = Math.ceil((fb[4] + pad - y0) / h) + 1;
  const nz = Math.ceil((fb[5] + pad - z0) / h) + 1;
  const B = 8;
  const bnx = Math.ceil((nx - 1) / B), bny = Math.ceil((ny - 1) / B), bnz = Math.ceil((nz - 1) / B);
  const blockLists = new Array(bnx * bny * bnz);
  const blockActive = new Uint8Array(bnx * bny * bnz);
  const half = (B * h) / 2;
  const halfDiag = half * Math.sqrt(3);

  const getList = (bi, bj, bk) => {
    const id = bi + bnx * (bj + bny * bk);
    if (blockLists[id]) return blockLists[id];
    let l = blockLists[id];
    if (!l) {
      const mnx = x0 + bi * B * h, mny = y0 + bj * B * h, mnz = z0 + bk * B * h;
      l = field.primsFor(mnx, mny, mnz, mnx + B * h, mny + B * h, mnz + B * h, 3 * h);
      blockLists[id] = l;
    }
    return l;
  };

  // classify blocks
  const activeBlocks = [];
  for (let bk = 0; bk < bnz; bk++)
    for (let bj = 0; bj < bny; bj++)
      for (let bi = 0; bi < bnx; bi++) {
        const l = getList(bi, bj, bk);
        if (!l.length) continue;
        const cx = x0 + (bi * B) * h + half, cy = y0 + (bj * B) * h + half, cz = z0 + (bk * B) * h + half;
        const d = field.evalList(l, cx, cy, cz);
        if (Math.abs(d) > halfDiag * 1.6 + 2 * h) continue;
        blockActive[bi + bnx * (bj + bny * bk)] = 1;
        activeBlocks.push(bi, bj, bk);
      }

  // sparse per-block storage of sampled values (8x8x8 points per block)
  const blockVals = new Map();
  const getV = (i, j, k) => {
    const bi = i >> 3, bj = j >> 3, bk = k >> 3;
    const bid = bi + (bnx + 1) * (bj + (bny + 1) * bk);
    let arr = blockVals.get(bid);
    if (!arr) {
      arr = new Float32Array(512).fill(NaN);
      blockVals.set(bid, arr);
    }
    const li = (i & 7) + ((j & 7) << 3) + ((k & 7) << 6);
    let v = arr[li];
    if (v !== v) {
      v = field.evalList(getList(Math.min(bi, bnx - 1), Math.min(bj, bny - 1), Math.min(bk, bnz - 1)), x0 + i * h, y0 + j * h, z0 + k * h);
      arr[li] = v;
    }
    return v;
  };

  const cnx = nx - 1, cny = ny - 1;
  const cellVert = new Map();
  const pos = [];
  const corner = new Float32Array(8);
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], // x
    [0, 2], [1, 3], [4, 6], [5, 7], // y
    [0, 4], [1, 5], [2, 6], [3, 7], // z
  ];
  const COFF = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const cellVertex = (i, j, k) => {
    if (i < 0 || j < 0 || k < 0 || i >= cnx || j >= cny || k >= nz - 1) return -1;
    const cid = i + cnx * (j + cny * k);
    const got = cellVert.get(cid);
    if (got !== undefined) return got;
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      corner[c] = getV(i + COFF[c][0], j + COFF[c][1], k + COFF[c][2]);
      if (corner[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) {
      cellVert.set(cid, -1);
      return -1;
    }
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of EDGES) {
      const va = corner[a], vb = corner[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += COFF[a][0] + (COFF[b][0] - COFF[a][0]) * t;
      sy += COFF[a][1] + (COFF[b][1] - COFF[a][1]) * t;
      sz += COFF[a][2] + (COFF[b][2] - COFF[a][2]) * t;
      cnt++;
    }
    const vi = pos.length / 3;
    pos.push(x0 + (i + sx / cnt) * h, y0 + (j + sy / cnt) * h, z0 + (k + sz / cnt) * h);
    cellVert.set(cid, vi);
    return vi;
  };

  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };

  for (let q = 0; q < activeBlocks.length; q += 3) {
    const bi = activeBlocks[q], bj = activeBlocks[q + 1], bk = activeBlocks[q + 2];
    const i1 = Math.min((bi + 1) * B, cnx), j1 = Math.min((bj + 1) * B, cny), k1 = Math.min((bk + 1) * B, nz - 1);
    for (let k = bk * B; k < k1; k++)
      for (let j = bj * B; j < j1; j++)
        for (let i = bi * B; i < i1; i++) {
          if (i < 1 || j < 1 || k < 1) continue;
          const v0 = getV(i, j, k);
          const inside = v0 < 0;
          // +x edge
          if (inside !== (getV(i + 1, j, k) < 0)) {
            quad(cellVertex(i, j - 1, k - 1), cellVertex(i, j, k - 1), cellVertex(i, j, k), cellVertex(i, j - 1, k), !inside);
          }
          if (inside !== (getV(i, j + 1, k) < 0)) {
            quad(cellVertex(i - 1, j, k - 1), cellVertex(i - 1, j, k), cellVertex(i, j, k), cellVertex(i, j, k - 1), !inside);
          }
          if (inside !== (getV(i, j, k + 1) < 0)) {
            quad(cellVertex(i - 1, j - 1, k), cellVertex(i, j - 1, k), cellVertex(i, j, k), cellVertex(i - 1, j, k), !inside);
          }
        }
  }

  // project vertices onto surface & compute normals from gradient
  const nv = pos.length / 3;
  if (globalThis.__prof) console.log('  mesh: grid', nx, ny, nz, 'blocks', bnx * bny * bnz, 'active', activeBlocks.length / 3, 'stored', blockVals.size, 'verts', nv);
  const P = new Float32Array(pos);
  const Nrm = new Float32Array(nv * 3);
  const e = h * 0.35;
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const bi = Math.min(Math.max(Math.floor((x - x0) / (B * h)), 0), bnx - 1);
    const bj = Math.min(Math.max(Math.floor((y - y0) / (B * h)), 0), bny - 1);
    const bk = Math.min(Math.max(Math.floor((z - z0) / (B * h)), 0), bnz - 1);
    const l = getList(bi, bj, bk);
    const d = field.evalList(l, x, y, z);
    let gx = field.evalList(l, x + e, y, z) - field.evalList(l, x - e, y, z);
    let gy = field.evalList(l, x, y + e, z) - field.evalList(l, x, y - e, z);
    let gz = field.evalList(l, x, y, z + e) - field.evalList(l, x, y, z - e);
    const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    if (!opts.noProject) {
      let step = d;
      if (step > h * 0.5) step = h * 0.5;
      if (step < -h * 0.5) step = -h * 0.5;
      x -= gx * step; y -= gy * step; z -= gz * step;
    }
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    Nrm[v * 3] = gx; Nrm[v * 3 + 1] = gy; Nrm[v * 3 + 2] = gz;
  }

  return { positions: P, normals: Nrm, index: new Uint32Array(idx) };
}
