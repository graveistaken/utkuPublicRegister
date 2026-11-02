// Signed distance primitives & operators (scalar, allocation-free).
// Every primitive is an object: { d(x,y,z) -> number, box:[minx,miny,minz,maxx,maxy,maxz], k, bone | boneFn }

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// polynomial smooth min / max
export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

export function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz));
  const k1 = Math.sqrt((x * x) / (rx * rx * rx * rx) + (y * y) / (ry * ry * ry * ry) + (z * z) / (rz * rz * rz * rz));
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

export function sdRoundBox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - bx + r;
  const qy = Math.abs(y) - by + r;
  const qz = Math.abs(z) - bz + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}

// ---- primitive factories ------------------------------------------------

function boxOf(cx, cy, cz, ex, ey, ez) {
  return [cx - ex, cy - ey, cz - ez, cx + ex, cy + ey, cz + ez];
}

// Ellipsoid with optional rotation (rotation given as 3x3 row-major matrix world->local)
export function ellipsoid(c, r, opts = {}) {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  const m = opts.rot || null;
  const e = Math.max(rx, ry, rz);
  return {
    d: m
      ? (x, y, z) => {
          const px = x - cx, py = y - cy, pz = z - cz;
          return sdEllipsoid(
            m[0] * px + m[1] * py + m[2] * pz,
            m[3] * px + m[4] * py + m[5] * pz,
            m[6] * px + m[7] * py + m[8] * pz,
            rx, ry, rz
          );
        }
      : (x, y, z) => sdEllipsoid(x - cx, y - cy, z - cz, rx, ry, rz),
    box: boxOf(cx, cy, cz, e, e, e),
    k: opts.k ?? 0.02,
    bone: opts.bone,
    boneFn: opts.boneFn,
    tag: opts.tag,
  };
}

// Capsule with radius profile along the segment. radii: array of control radii sampled uniformly in t.
export function limb(a, b, radii, opts = {}) {
  const [ax, ay, az] = a;
  const bx = b[0] - ax, by = b[1] - ay, bz = b[2] - az;
  const L2 = bx * bx + by * by + bz * bz;
  const n = radii.length - 1;
  const prof = (t) => {
    const f = t * n;
    const i = Math.min(Math.floor(f), n - 1);
    const u = f - i;
    // Catmull-Rom between radii[i] and radii[i+1]
    const p0 = radii[Math.max(i - 1, 0)], p1 = radii[i], p2 = radii[i + 1], p3 = radii[Math.min(i + 2, n)];
    const u2 = u * u, u3 = u2 * u;
    return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  };
  // optional ellipticity: squash in a direction perpendicular to the limb
  const sq = opts.squash || null; // {dir:[x,y,z], f}
  const rmax = Math.max(...radii);
  const ex = Math.abs(bx) / 2 + rmax, ey = Math.abs(by) / 2 + rmax, ez = Math.abs(bz) / 2 + rmax;
  return {
    d: (x, y, z) => {
      const px = x - ax, py = y - ay, pz = z - az;
      let t = (px * bx + py * by + pz * bz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      let dx = px - bx * t, dy = py - by * t, dz = pz - bz * t;
      if (sq) {
        const s = dx * sq.dir[0] + dy * sq.dir[1] + dz * sq.dir[2];
        const k = (1 / sq.f - 1) * s;
        dx += sq.dir[0] * k; dy += sq.dir[1] * k; dz += sq.dir[2] * k;
      }
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - prof(t);
    },
    t: (x, y, z) => clamp(((x - ax) * bx + (y - ay) * by + (z - az) * bz) / L2, 0, 1),
    box: boxOf(ax + bx / 2, ay + by / 2, az + bz / 2, ex, ey, ez),
    k: opts.k ?? 0.02,
    bone: opts.bone,
    boneFn: opts.boneFn,
    tag: opts.tag,
    a, b,
  };
}

// Superelliptical vertical loft (torso). sections: [{y, rx, rz, z}] sorted by y.
export function loft(sections, opts = {}) {
  const n = sections.length;
  const y0 = sections[0].y, y1 = sections[n - 1].y;
  const ex = opts.exp ?? 2.4;
  const cr = (arr, i) => arr[Math.max(0, Math.min(n - 1, i))];
  const sample = (y, out) => {
    // find segment
    let i = 0;
    if (y <= y0) i = 0;
    else if (y >= y1) i = n - 2;
    else while (i < n - 2 && sections[i + 1].y < y) i++;
    const s1 = sections[i], s2 = sections[i + 1];
    let u = (y - s1.y) / (s2.y - s1.y);
    u = clamp(u, 0, 1);
    const s0 = cr(sections, i - 1), s3 = cr(sections, i + 2);
    const u2 = u * u, u3 = u2 * u;
    const C = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
    out[0] = C(s0.rx, s1.rx, s2.rx, s3.rx);
    out[1] = C(s0.rz, s1.rz, s2.rz, s3.rz);
    out[2] = C(s0.z, s1.z, s2.z, s3.z);
  };
  const tmp = [0, 0, 0];
  let mx = 0, mz = 0, zmin = 1e9, zmax = -1e9;
  for (const s of sections) {
    mx = Math.max(mx, s.rx);
    mz = Math.max(mz, s.rz);
    zmin = Math.min(zmin, s.z - s.rz);
    zmax = Math.max(zmax, s.z + s.rz);
  }
  const capK = opts.capK ?? 0.03;
  // lookup table for the section profile
  const LUT = 512;
  const tab = new Float32Array((LUT + 1) * 3);
  for (let i = 0; i <= LUT; i++) {
    sample(y0 + ((y1 - y0) * i) / LUT, tmp);
    tab[i * 3] = tmp[0]; tab[i * 3 + 1] = tmp[1]; tab[i * 3 + 2] = tmp[2];
  }
  const sqk = 1 - 1 / (Math.SQRT2 * Math.pow(0.5, 1 / ex));
  return {
    d: (x, y, z) => {
      let f = ((y - y0) / (y1 - y0)) * LUT;
      if (f < 0) f = 0; else if (f > LUT) f = LUT;
      const i = Math.min(f | 0, LUT - 1), u = f - i;
      const a = i * 3, b = a + 3;
      const rx = tab[a] + (tab[b] - tab[a]) * u;
      const rz = tab[a + 1] + (tab[b + 1] - tab[a + 1]) * u;
      const zc = tab[a + 2] + (tab[b + 2] - tab[a + 2]) * u;
      const qx = x / rx, qz = (z - zc) / rz;
      const A = qx * qx, Bq = qz * qz, r2 = A + Bq;
      const r = Math.sqrt(r2);
      const len = r2 > 1e-12 ? r * (1 - sqk * (4 * A * Bq) / (r2 * r2)) : 0;
      let d = (len - 1) * (rx < rz ? rx : rz);
      d = smax(d, y - y1, capK);
      d = smax(d, y0 - y, capK);
      return d;
    },
    sample,
    box: [-mx, y0, zmin, mx, y1, zmax],
    k: opts.k ?? 0.02,
    boneFn: opts.boneFn,
    tag: opts.tag,
  };
}

// Generic primitive from a function and bounds
export function custom(d, box, opts = {}) {
  return { d, box, k: opts.k ?? 0.02, bone: opts.bone, boneFn: opts.boneFn, tag: opts.tag };
}

// Wrap a primitive: inflate & clip by a function (clip(x,y,z) > 0 means removed)
export function inflate(prim, off, clip = null, clipK = 0.004) {
  const b = prim.box;
  return {
    ...prim,
    d: clip
      ? (x, y, z) => smax(prim.d(x, y, z) - off, clip(x, y, z), clipK)
      : (x, y, z) => prim.d(x, y, z) - off,
    box: [b[0] - off, b[1] - off, b[2] - off, b[3] + off, b[4] + off, b[5] + off],
  };
}

// ---- rotation helpers ---------------------------------------------------
// Returns world->local matrix (row-major) for local axes given in world space
export function basis(ax, ay, az) {
  return [ax[0], ax[1], ax[2], ay[0], ay[1], ay[2], az[0], az[1], az[2]];
}
export function rotY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}
export function rotZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}
export function rotX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, s, 0, -s, c];
}
export function mul3(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// Deterministic RNG
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
