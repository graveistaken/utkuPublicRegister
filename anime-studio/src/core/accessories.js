// Accessories: animal ears, head accessories, glasses, choker, animal tail.
import { Field } from './mesher.js';
import { ellipsoid, limb, custom, smax, smin, sdEllipsoid, sdRoundBox, lerp, clamp, v3, basis } from './sdf.js';
import { fieldPart, rigidWeights, computeWeights } from './partkit.js';

const TAU = Math.PI * 2;

export function buildAccessories(rig, p, head, body, bodyField, Q, hair) {
  const parts = [];
  const hH = rig.hH;
  const capOff = 0.028 * p.volume * hH;
  // approximate outer surface of the strand layer on top of the cap
  const hairOut = capOff + 0.04 * hH * Math.sqrt(p.volume) * p.strandWidth;
  const HEAD = rig.idx.Head;
  const add = (name, mat, prims, h, budget, bone = HEAD, opts = {}) => {
    const f = new Field(prims, opts.post ? { post: opts.post } : {});
    const m = fieldPart(f, h, Math.round(budget * Q.mul), h * 0.2);
    if (!m.index.length) return;
    if (opts.weightPrims) computeWeights(m, opts.weightPrims, 0.012);
    else rigidWeights(m, bone);
    parts.push({ name, mat, mesh: m });
  };
  const onHair = (theta, phi, extra = 0) => {
    if (hair && hair.outer) {
      const o = hair.outer(theta, phi, extra);
      const s = head.surface(theta, phi);
      return { p: o.p, n: v3.norm(v3.add(s.n, o.n)) };
    }
    const s = head.surface(theta, phi);
    return { p: v3.add(s.p, v3.mul(s.n, hairOut + extra)), n: s.n };
  };
  const fine = Q.fine;

  // ---------------- animal ears ----------------
  if (p.animalEars !== 'none') {
    const kind = p.animalEars;
    const outer = [], inner = [];
    for (const sg of [1, -1]) {
      const th = sg * (kind === 'bunny' ? 0.45 : 0.68);
      const ph = kind === 'bunny' ? 0.38 : 0.55;
      const base = onHair(th, ph, -0.025 * hH);
      const up = v3.norm(v3.add(base.n, [0, kind === 'bunny' ? 1.4 : 0.7, kind === 'bunny' ? -0.25 : -0.05]));
      // forward facing direction of the ear plane
      let fw = v3.norm([Math.sin(th) * 0.45, 0, Math.cos(th)]);
      fw = v3.norm(v3.sub(fw, v3.mul(up, v3.dot(fw, up))));
      if (kind === 'bunny') {
        const mid = v3.add(base.p, v3.mul(up, 0.34 * hH));
        const up2 = v3.norm(v3.add(up, [sg * 0.15, -0.1, -0.35]));
        const tip = v3.add(mid, v3.mul(up2, 0.3 * hH));
        outer.push(limb(base.p, mid, [0.04 * hH, 0.062 * hH], { k: 0.01, squash: { dir: fw, f: 0.42 } }));
        outer.push(limb(mid, tip, [0.062 * hH, 0.048 * hH, 0.014 * hH], { k: 0.01, squash: { dir: fw, f: 0.42 } }));
        const o = v3.mul(fw, 0.012 * hH);
        inner.push(limb(v3.add(v3.add(base.p, v3.mul(up, 0.08 * hH)), o), v3.add(mid, o), [0.02 * hH, 0.034 * hH], { k: 0.01, squash: { dir: fw, f: 0.25 } }));
        inner.push(limb(v3.add(mid, o), v3.add(v3.add(mid, v3.mul(up2, 0.22 * hH)), o), [0.034 * hH, 0.016 * hH], { k: 0.01, squash: { dir: fw, f: 0.25 } }));
      } else {
        const L = (kind === 'fox' ? 0.36 : 0.3) * hH;
        const R0 = (kind === 'fox' ? 0.12 : 0.11) * hH;
        const tip = v3.add(base.p, v3.mul(v3.norm(v3.add(up, [sg * 0.12, 0, 0])), L));
        outer.push(limb(base.p, tip, [R0, R0 * 0.62, R0 * 0.26, 0.004 * hH], { k: 0.01, squash: { dir: fw, f: 0.38 } }));
        const o = v3.mul(fw, R0 * 0.36);
        inner.push(limb(v3.add(v3.add(base.p, v3.mul(up, L * 0.12)), o), v3.add(v3.add(base.p, v3.mul(up, L * 0.82)), o), [R0 * 0.62, R0 * 0.4, R0 * 0.14, 0.002 * hH], { k: 0.01, squash: { dir: fw, f: 0.2 } }));
      }
    }
    add('AnimalEars', 'animalEar', outer, fine * 0.9, 2500);
    add('AnimalEarsInner', 'earInner', inner, fine * 0.8, 1500);
  }

  // ---------------- head accessories ----------------
  const acc = p.headAcc;
  if (acc === 'bow') {
    const s = onHair(-1.05, 0.62, 0.004 * hH);
    const n = s.n;
    const side = v3.norm(v3.cross(n, [0, 1, 0]));
    const up = v3.cross(side, n);
    const R = hH * 0.11;
    const prims = [];
    const rot = (ax, ay, az) => basis(ax, ay, az);
    for (const sg of [-1, 1]) {
      const dirL = v3.norm(v3.add(v3.mul(side, sg), v3.mul(up, 0.35)));
      const c = v3.add(v3.add(s.p, v3.mul(dirL, R * 0.85)), v3.mul(n, R * 0.25));
      const ax = dirL, az = n, ay = v3.norm(v3.cross(az, ax));
      prims.push(ellipsoid(c, [R * 0.85, R * 0.48, R * 0.28], { k: 0.01, rot: rot(ax, ay, az) }));
      // tails
      const t0 = v3.add(s.p, v3.mul(n, R * 0.2));
      const t1 = v3.add(v3.add(t0, v3.mul(up, -R * 1.5)), v3.mul(side, sg * R * 0.55));
      prims.push(limb(t0, t1, [R * 0.22, R * 0.32], { k: 0.01, squash: { dir: n, f: 0.3 } }));
    }
    prims.push(ellipsoid(v3.add(s.p, v3.mul(n, R * 0.32)), [R * 0.3, R * 0.32, R * 0.25], { k: 0.012 }));
    add('HairBow', 'acc', prims, fine * 0.9, 2500);
  } else if (acc === 'clip') {
    const s = onHair(-0.62, 0.95, 0.002 * hH);
    const side = v3.norm(v3.cross(s.n, [0, 1, 0]));
    const up = v3.cross(side, s.n);
    const prims = [];
    for (const sg of [-1, 1]) {
      const d = v3.norm(v3.add(up, v3.mul(side, sg * 0.75)));
      prims.push(limb(v3.add(s.p, v3.mul(d, -0.07 * hH)), v3.add(s.p, v3.mul(d, 0.07 * hH)), [0.011 * hH, 0.011 * hH], { k: 0.002, squash: { dir: s.n, f: 0.5 } }));
    }
    add('HairClip', 'acc', prims, fine * 0.6, 800);
  } else if (acc === 'headband') {
    const O = head.O;
    const n = v3.norm([0, 0.25, 1]);
    const c = head.toWorld(0, 0.72, 0.0);
    const band = custom(
      (x, y, z) => {
        const shell = Math.abs(head.sdf(x, y, z) - hairOut * 1.05 - 0.004 * hH) - 0.008 * hH;
        const slab = Math.abs((x - c[0]) * n[0] + (y - c[1]) * n[1] + (z - c[2]) * n[2]) - 0.028 * hH;
        const low = O[1] + 0.42 * hH - y;
        return Math.max(shell, slab, low);
      },
      [O[0] - 0.7 * hH, O[1] + 0.3 * hH, O[2] - 0.7 * hH, O[0] + 0.7 * hH, O[1] + 1.25 * hH, O[2] + 0.7 * hH],
      { k: 0 }
    );
    add('Headband', 'acc', [band], fine, 2000);
  } else if (acc === 'horns') {
    const prims = [];
    for (const sg of [1, -1]) {
      const s = onHair(sg * 0.45, 0.42, -0.02 * hH);
      let pnt = s.p;
      let dir = v3.norm(v3.add(s.n, [sg * 0.2, 0.9, -0.2]));
      const segs = 5;
      let r = 0.065 * hH;
      for (let i = 0; i < segs; i++) {
        const nxt = v3.add(pnt, v3.mul(dir, 0.085 * hH));
        const r2 = r * 0.72;
        prims.push(limb(pnt, nxt, [r, r2], { k: 0.004 }));
        pnt = nxt;
        r = r2;
        dir = v3.norm(v3.add(dir, [sg * 0.12, -0.05, -0.45]));
      }
    }
    add('Horns', 'acc', prims, fine * 0.8, 2000);
  } else if (acc === 'halo') {
    const O = head.O;
    const c = [O[0], O[1] + 1.22 * hH, O[2] - 0.05 * hH];
    const n = v3.norm([0, 1, -0.25]);
    const R = 0.36 * hH, r = 0.022 * hH;
    const halo = custom(
      (x, y, z) => {
        const px = x - c[0], py = y - c[1], pz = z - c[2];
        const h = px * n[0] + py * n[1] + pz * n[2];
        const qx = px - n[0] * h, qy = py - n[1] * h, qz = pz - n[2] * h;
        const q = Math.hypot(qx, qy, qz) - R;
        return Math.hypot(q, h) - r;
      },
      [c[0] - R - r, c[1] - R - r, c[2] - R - r, c[0] + R + r, c[1] + R + r, c[2] + R + r],
      { k: 0 }
    );
    add('Halo', 'gold', [halo], fine, 1500);
  }

  // ---------------- glasses ----------------
  if (p.glasses !== 'none') {
    const ey = 0.405 + p.eyeY * 0.05;
    const ex = 0.165 * p.eyeSpacing;
    const prims = [];
    const rr = 0.12 * Math.max(1, p.eyeSize * 0.95);
    const tube = 0.008;
    for (const sg of [1, -1]) {
      const cxl = sg * ex;
      const zf = head.faceZ(cxl, ey) + 0.05;
      const c = head.toWorld(cxl, ey, zf);
      const kind = p.glasses;
      prims.push(
        custom(
          (x, y, z) => {
            const l = head.toLocal(x, y, z);
            const lx = l[0] - cxl, ly = l[1] - ey, lz = l[2] - zf;
            let ring;
            if (kind === 'round') ring = Math.hypot(lx, ly * 1.08) - rr;
            else {
              const bx = rr * 1.12, by = rr * 0.8, rad = 0.05;
              const qx = Math.abs(lx) - bx + rad, qy = Math.abs(ly) - by + rad;
              ring = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
            }
            let d = Math.hypot(ring, lz * 1.6) - tube;
            if (kind === 'half') d = Math.max(d, -(ly - 0.0));
            return d * hH;
          },
          [c[0] - 0.2 * hH, c[1] - 0.2 * hH, c[2] - 0.05 * hH, c[0] + 0.2 * hH, c[1] + 0.2 * hH, c[2] + 0.05 * hH],
          { k: 0.003 * hH }
        )
      );
      // temple arm
      const outerX = sg * (ex + (kind === 'round' ? rr : rr * 1.12));
      const a = head.toWorld(outerX, ey + 0.02, zf);
      const b = head.toWorld(sg * 0.39, ey + 0.03, -0.02);
      prims.push(limb(a, b, [tube * hH * 0.9, tube * hH * 0.9], { k: 0.003 * hH }));
    }
    const zb = head.faceZ(0, ey + 0.03) + 0.045;
    prims.push(limb(head.toWorld(-ex + rr * 0.95, ey + 0.03, zb + 0.005), head.toWorld(ex - rr * 0.95, ey + 0.03, zb + 0.005), [tube * hH, tube * hH], { k: 0.003 * hH }));
    add('Glasses', 'glasses', prims, fine * 0.55, 2500);
  }

  // ---------------- choker ----------------
  if (p.choker) {
    const neck = body.prims.find((q) => q.tag === 'neck');
    const y0 = rig.shoulderTopY + 0.035 * rig.s;
    const band = custom(
      (x, y, z) => Math.max(neck.d(x, y, z) - 0.0035, Math.abs(y - y0) - 0.009 * rig.s),
      [-0.1, y0 - 0.03, -0.12, 0.1, y0 + 0.03, 0.1],
      { k: 0 }
    );
    const bell = ellipsoid([0, y0 - 0.012 * rig.s, 0], [0.008, 0.008, 0.008], { k: 0.002 });
    // place pendant on the front surface
    let z = 0.1;
    for (let i = 0; i < 50; i++) {
      const d = neck.d(0, y0 - 0.012 * rig.s, z) - 0.006;
      if (d < 0.0005) break;
      z -= Math.max(d, 0.001);
    }
    add('Choker', 'choker', [band], fine * 0.8, 1200, HEAD, { weightPrims: [neck] });
    add('ChokerCharm', 'gold', [ellipsoid([0, y0 - 0.016 * rig.s, z + 0.004], [0.007 * rig.s, 0.008 * rig.s, 0.005 * rig.s], { k: 0, bone: rig.idx.Neck })], fine * 0.5, 300, rig.idx.Neck);
  }

  // ---------------- animal tail ----------------
  if (p.tail) {
    const fox = p.animalEars === 'fox';
    const bunny = p.animalEars === 'bunny';
    const hipsY = rig.hipJointY + 0.02 * rig.s;
    const back = bodyField.prims.find((q) => q.tag === 'torso');
    let z = -0.05;
    for (let i = 0; i < 60; i++) {
      const d = back.d(0, hipsY, z);
      if (d < 0.0005) break;
      z += Math.max(d, 0.001);
    }
    const prims = [];
    if (bunny) {
      prims.push(ellipsoid([0, hipsY, z - 0.02 * rig.s], [0.035, 0.035, 0.032], { k: 0 }));
    } else {
      // tail starts at the tailbone and arcs down/back, then curls up
      let pnt = [0, hipsY - 0.03 * rig.s, z - 0.004];
      const n = fox ? 8 : 10;
      const len = (fox ? 0.07 : 0.068) * rig.s;
      let ang = fox ? -0.55 : -0.9; // pitch angle (0 = straight back, + up)
      const curve = fox ? 0.25 : 0.32;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const dir = [Math.sin(i * 0.5) * (fox ? 0.05 : 0.15), Math.sin(ang), -Math.cos(ang)];
        const nxt = v3.add(pnt, v3.mul(v3.norm(dir), len));
        let r0, r1;
        if (fox) {
          const prof = (u) => (0.012 + 0.05 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.7)) * (u > 0.92 ? Math.max(0.15, (1 - u) / 0.08) : 1);
          r0 = prof(t) * rig.s;
          r1 = prof(t + 1 / n) * rig.s;
        } else {
          r0 = lerp(0.013, 0.009, t) * rig.s;
          r1 = lerp(0.013, 0.009, t + 1 / n) * rig.s;
        }
        prims.push(limb(pnt, nxt, [r0, r1], { k: fox ? 0.025 : 0.004 }));
        pnt = nxt;
        ang += curve;
      }
    }
    add('Tail', 'animalEar', prims, fine * (fox ? 1.4 : 0.8), 2000, rig.idx.Hips);
  }

  return { parts };
}
