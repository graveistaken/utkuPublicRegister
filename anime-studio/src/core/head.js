// Anime head SDF. Local units: head height (hH); origin at chin level (rig.J.headOrigin).
import { sdEllipsoid, smin, smax, clamp, lerp, custom, limb } from './sdf.js';

export function buildHead(rig, p) {
  const hH = rig.hH;
  const O = rig.J.headOrigin;
  const fw = p.faceWidth;
  const cw = 0.94 + 0.06 * fw;
  const chinY = -0.012 - (p.chinLen - 1) * 0.14;
  const chinZ = 0.2 + (p.chinLen - 1) * 0.04;
  const jx = 0.3 * p.jaw * fw * (1 + 0.06 * rig.g);
  const jy = 0.3 + 0.03 * rig.g;
  // jaw side plane normal (right side, x>0); mirrored for left via |x|
  let nx = jy - chinY, ny = -jx;
  const nl = Math.hypot(nx, ny);
  nx /= nl; ny /= nl;
  const chinK = lerp(0.16, 0.035, p.chinPoint);
  const cheek = p.cheeks;
  const flat = p.faceFlat;
  const zFront = lerp(0.42, 0.355, flat);

  const base = (x, y, z) => {
    const cran = sdEllipsoid(x, y - 0.6, z + 0.045, 0.4 * cw, 0.415, 0.44);
    let face = sdEllipsoid(x, y - 0.43, z - 0.055, 0.345 * fw, 0.445, 0.375);
    if (cheek > 0.01) {
      const ax = Math.abs(x);
      const ch = sdEllipsoid(ax - 0.19 * fw, y - 0.22, z - 0.12, 0.12 * (0.7 + 0.5 * cheek), 0.12, 0.13 * (0.8 + 0.3 * cheek));
      face = smin(face, ch, 0.09);
    }
    // jaw V (front view)
    const ax = Math.abs(x);
    const vcut = ax * nx + (y - chinY) * ny;
    face = smax(face, vcut, chinK);
    // jaw underside (side view): from chin to below the ear
    let ux = 0, uy = -0.36, uz = -0.27;
    const ul = Math.hypot(uy, uz);
    uy /= ul; uz /= ul;
    const under = (y - chinY) * uy + (z - chinZ) * uz;
    face = smax(face, under, 0.06);
    // anime flat face plane
    face = smax(face, z - zFront, 0.12);
    return smin(cran, face, 0.09);
  };

  // locate the face surface along +z to anchor the nose
  const surfZ = (x, y) => {
    let z = 0.7;
    for (let i = 0; i < 60; i++) {
      const d = base(x, y, z);
      if (d < 0.0005) break;
      z -= Math.max(d, 0.002);
    }
    return z;
  };
  const noseY = 0.28 + p.noseHeight * 0.05;
  const ns = p.noseSize;
  const noseZ = surfZ(0, noseY);
  const earS = p.earSize;
  const earType = p.earType;

  const local = (x, y, z) => {
    let d = base(x, y, z);
    if (ns > 0.02) {
      // small anime nose: soft wedge
      const nd = sdEllipsoid(x, y - noseY, z - (noseZ - 0.012), 0.02 * ns, 0.052 * ns, 0.028 * ns);
      const bridge = sdEllipsoid(x, y - noseY - 0.06 * ns, z - (noseZ - 0.02), 0.014 * ns, 0.07 * ns, 0.018 * ns);
      d = smin(d, smin(nd, bridge, 0.02), 0.022 * ns + 0.01);
    }
    if (earType !== 'none') {
      const ax = Math.abs(x);
      if (earType === 'elf') {
        // long pointed ear
        const ex = ax - 0.36 * cw, ey = y - 0.42, ez = z + 0.06;
        // segment from (0,0,0) to (0.24,0.17,-0.1)
        const bx = 0.25 * earS, by = 0.16 * earS, bz = -0.1 * earS;
        const L2 = bx * bx + by * by + bz * bz;
        let t = clamp((ex * bx + ey * by + ez * bz) / L2, 0, 1);
        let dx = ex - bx * t, dy = ey - by * t, dz = ez - bz * t;
        dx *= 1.9; // flatten
        const r = lerp(0.07, 0.006, Math.pow(t, 0.8)) * earS;
        d = smin(d, Math.hypot(dx, dy, dz) / 1.5 - r, 0.03);
      } else {
        const er = sdEllipsoid(ax - 0.375 * cw, y - 0.4, z + 0.045, 0.035 * earS, 0.1 * earS, 0.068 * earS);
        d = smin(d, er, 0.035);
      }
    }
    return d;
  };

  const sdf = (x, y, z) => local((x - O[0]) / hH, (y - O[1]) / hH, (z - O[2]) / hH) * hH;
  const ext = 0.7 * hH;
  const headPrim = custom(sdf, [O[0] - ext, O[1] - 0.2 * hH, O[2] - 0.6 * hH, O[0] + ext, O[1] + 1.1 * hH, O[2] + 0.6 * hH], { k: 0.0, bone: rig.idx.Head });

  // face texture mapping rectangle (world, planar projection along z)
  const rect = {
    x0: O[0] - 0.5 * hH,
    x1: O[0] + 0.5 * hH,
    y0: O[1] - 0.06 * hH,
    y1: O[1] + 0.94 * hH,
  };
  const toLocal = (x, y, z) => [(x - O[0]) / hH, (y - O[1]) / hH, (z - O[2]) / hH];
  const toWorld = (x, y, z) => [O[0] + x * hH, O[1] + y * hH, O[2] + z * hH];
  const Cc = [0, 0.6, -0.045];
  // point on head surface along spherical direction from cranium centre; returns world pos + outward normal
  const surface = (theta, phi) => {
    const d = [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];
    let t = 0.9;
    for (let i = 0; i < 80; i++) {
      const sd = local(Cc[0] + d[0] * t, Cc[1] + d[1] * t, Cc[2] + d[2] * t);
      if (Math.abs(sd) < 0.0008) break;
      t -= sd;
    }
    const l = [Cc[0] + d[0] * t, Cc[1] + d[1] * t, Cc[2] + d[2] * t];
    const e = 0.002;
    const g = [local(l[0] + e, l[1], l[2]) - local(l[0] - e, l[1], l[2]), local(l[0], l[1] + e, l[2]) - local(l[0], l[1] - e, l[2]), local(l[0], l[1], l[2] + e) - local(l[0], l[1], l[2] - e)];
    const gl = Math.hypot(...g) || 1;
    return { p: toWorld(...l), n: [g[0] / gl, g[1] / gl, g[2] / gl] };
  };
  // z of the face surface (local) at local (x,y)
  const faceZ = (x, y) => {
    let z = 0.8;
    for (let i = 0; i < 80; i++) {
      const d = local(x, y, z);
      if (d < 0.0005) break;
      z -= Math.max(d, 0.002);
    }
    return z;
  };
  return {
    prim: headPrim, sdf, local, toLocal, toWorld, rect, O, hH, cw, zFront, surface, faceZ,
    cranium: { c: [0, 0.6, -0.045], r: [0.4 * cw, 0.415, 0.44] },
    nose: { y: noseY, z: noseZ },
  };
}
