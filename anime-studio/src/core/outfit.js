// Clothing: SDF shells derived from the body + parametric pleated skirt.
import { Field } from './mesher.js';
import { smax, smin, lerp, clamp, sdEllipsoid, sdRoundBox, ellipsoid, limb, custom, v3 } from './sdf.js';
import { fieldPart, computeWeights, compact, simplify, bakeAO } from './partkit.js';

const TAU = Math.PI * 2;

// prim wrapper: inflate + optional per-prim clip + custom k
function wrap(prim, off, clip = null, k = null) {
  const d0 = prim.d;
  const b = prim.box;
  return {
    ...prim,
    k: Math.max(prim.k, k ?? 0),
    d: clip ? (x, y, z) => smax(d0(x, y, z) - off, clip(x, y, z), 0.003) : (x, y, z) => d0(x, y, z) - off,
    box: [b[0] - off, b[1] - off, b[2] - off, b[3] + off, b[4] + off, b[5] + off],
  };
}

// plane clip: removes the half-space where dot(p - c, n) > 0
const planeClip = (c, n) => (x, y, z) => (x - c[0]) * n[0] + (y - c[1]) * n[1] + (z - c[2]) * n[2];

export function buildOutfit(rig, p, body, bodyField, Q, { coversOnly = false } = {}) {
  const parts = [];
  const covers = [];
  const { J, s } = rig;
  const prims = body.prims;
  const byTag = (...tags) => prims.filter((q) => tags.includes(q.tag));
  const B = (n) => rig.idx[n];
  const yW = rig.waistY, ySh = rig.shoulderTopY, ySj = rig.shoulderJointY, yC = rig.crotchY;
  const yUB = lerp(yW, ySj, 0.42), yCh = lerp(yW, ySj, 0.72);
  const nr = lerp(0.031, 0.04, rig.g) * p.neckThick;
  const allW = prims; // weight source

  const addField = (name, mat, field, h, budget, opts = {}) => {
    if (coversOnly) return null;
    const t0 = performance.now();
    const m = fieldPart(field, h, Math.round(budget * Q.mul), h * 0.2);
    if (globalThis.__prof) console.log(name, Math.round(performance.now() - t0), 'ms');
    if (!m.index.length) return null;
    bakeAO(m, opts.aoField || field, 0.01, 0.9);
    computeWeights(m, opts.weightPrims || allW, opts.sigma ?? 0.014);
    parts.push({ name, mat, mesh: m });
    return m;
  };

  // ---------------------------------------------------------------- TOP
  const top = p.top;
  const loose = p.top === 'hoodie' ? Math.max(p.topLoose, 0.6) : p.topLoose;
  const tOff = 0.0055 + loose * 0.013;
  let sleeve = p.sleeveLen;
  if (top === 'tank' || top === 'sportbra') sleeve = 0;
  if (top === 'hoodie' || top === 'longsleeve') sleeve = Math.max(sleeve, 0.92);
  let topLen = p.topLen;
  if (top === 'crop') topLen = Math.min(topLen, 0.25);
  if (top === 'sportbra') topLen = 0;
  const hemY = top === 'sportbra' ? yUB - 0.01 * s : lerp(yUB - 0.015 * s, yC + 0.035 * s, topLen);

  // V-neck depth
  const vDeep = top === 'sailor' ? yCh + 0.005 * s : top === 'shirt' ? null : top === 'tank' || top === 'crop' ? ySh - 0.07 * s : top === 'sportbra' ? yCh + 0.025 * s : null;
  const neckC = [0, ySh + 0.03 * s, -0.016 * s];
  const neckR = top === 'shirt' ? [nr + 0.01 * s, 0.045 * s, nr + 0.014 * s] : [nr + 0.02 * s + (top === 'hoodie' ? 0.012 : 0), 0.05 * s, nr + 0.026 * s];
  const vSlope = top === 'sailor' ? 0.55 : top === 'sportbra' ? 1.2 : 0.75;
  const topClip = (x, y, z) => {
    let c = hemY - y;
    c = Math.max(c, -sdEllipsoid(x - neckC[0], y - neckC[1], z - neckC[2], neckR[0], neckR[1], neckR[2]));
    if (vDeep != null) {
      const f = Math.max(vDeep - y, Math.abs(x) - (y - vDeep) * vSlope - 0.004, -(z - 0.01));
      c = Math.max(c, -f);
    }
    return c;
  };

  const armClips = (sg) => {
    const pre = sg > 0 ? 'left' : 'right';
    const S0 = J[pre + 'UpperArm'], E = J[pre + 'LowerArm'], W = J[pre + 'Hand'];
    const d1 = v3.sub(E, S0), d2 = v3.sub(W, E);
    const l1 = v3.len(d1), l2 = v3.len(d2);
    const u = sleeve * (l1 + l2);
    if (u <= l1) {
      const c = v3.add(S0, v3.mul(v3.norm(d1), u));
      return { upper: planeClip(c, v3.norm(d1)), lower: null, end: c, dir: v3.norm(d1) };
    }
    const c = v3.add(E, v3.mul(v3.norm(d2), Math.min(u - l1, l2 - 0.012)));
    return { upper: null, lower: planeClip(c, v3.norm(d2)), end: c, dir: v3.norm(d2) };
  };

  const topPrims = (off) => {
    const list = [];
    for (const q of prims) {
      if (q.tag === 'torso') list.push(wrap(q, off, null, 0.03));
      else if (q.tag === 'breast') list.push(wrap(q, off, null, 0.075 + loose * 0.03));
      else if (q.tag === 'butt' && topLen > 0.6) list.push(wrap(q, off, null, 0.05));
      else if (q.tag === 'thigh' && hemY < rig.hipJointY + 0.02 * s) list.push(wrap(q, off + 0.002, (x, y, z) => hemY - 0.01 - y, 0.03));
      else if (q.tag === 'trap' && top !== 'sportbra') list.push(wrap(q, off, null, 0.03));
      else if (q.tag === 'shoulder' && sleeve > 0.02) list.push(wrap(q, off, null, 0.025));
      else if ((q.tag === 'upperArm' || q.tag === 'lowerArm') && sleeve > 0.02) {
        const sg = q.bone === B('LeftUpperArm') || q.bone === B('LeftLowerArm') ? 1 : -1;
        const ac = armClips(sg);
        const flare = top === 'hoodie' ? 0.004 : loose * 0.006;
        if (q.tag === 'upperArm') {
          if (ac.upper) list.push(wrap(q, off * 0.8 + flare, ac.upper, 0.012));
          else list.push(wrap(q, off * 0.8 + flare, null, 0.012));
        } else if (ac.lower) list.push(wrap(q, off * 0.75 + flare, ac.lower, 0.012));
      }
    }
    return list;
  };

  // a shirt worn over a skirt flares out a little at the hem
  const overSkirt = (p.bottom === 'skirt' || p.bottom === 'aline') && topLen > 0.4 && top !== 'crop' && top !== 'sportbra';
  const hemFlare = (y) => (overSkirt ? clamp((hemY + 0.06 * s - y) / (0.06 * s), 0, 1) ** 2 * (0.004 + p.skirtFlare * 0.006) : 0);
  const topField = new Field(topPrims(tOff), { post: (d, x, y, z) => smax(d - hemFlare(y), topClip(x, y, z), 0.004) });
  addField('Top', 'top', topField, Q.cloth, 7000);
  covers.push({ f: (x, y, z) => topField.eval(x, y, z), thr: -tOff * 0.55 });

  // ---- trims: sleeve cuffs / hem band ----
  const band = (name, mat, region, extra) => {
    const f = new Field(topPrims(tOff + extra), { post: (d, x, y, z) => smax(smax(d, topClip(x, y, z), 0.003), region(x, y, z), 0.002) });
    addField(name, mat, f, Q.fine * 1.2, 2500);
  };
  if (top === 'hoodie' || top === 'longsleeve') {
    const cuffRegion = (x, y, z) => {
      let r = 1;
      for (const sg of [1, -1]) {
        const ac = armClips(sg);
        const t = (x - ac.end[0]) * ac.dir[0] + (y - ac.end[1]) * ac.dir[1] + (z - ac.end[2]) * ac.dir[2];
        r = Math.min(r, Math.max(-t - 0.045 * s, t));
      }
      // hem band
      r = Math.min(r, y - (hemY + 0.04 * s));
      return r;
    };
    band('TopCuffs', top === 'hoodie' ? 'top2' : 'top', cuffRegion, 0.0025);
  }

  // ---- sailor collar ----
  if (top === 'sailor') {
    const collarOff = tOff + 0.0055;
    const backY = ySj - 0.11 * s;
    const region = (x, y, z, shrink = 0) => {
      // back square flap
      const back = Math.max(backY + shrink - y, z - 0.0 - shrink * 0, Math.abs(x) - 0.13 * s + shrink);
      // front lapels along the V
      const vx = (y - vDeep) * vSlope;
      const lap = Math.max(vDeep - 0.012 + shrink - y, Math.abs(x) - (vx + 0.055 * s * (0.6 + (y - vDeep) / (ySh - vDeep + 1e-4))) + shrink, -(Math.abs(x) - vx) + shrink * 0.3, -z);
      // shoulders connecting
      const shoulder = Math.max(ySj - 0.03 * s - y + shrink, Math.abs(x) - 0.13 * s + shrink, z - 0.03 * s);
      return Math.min(back, lap, shoulder);
    };
    const cbox = [-0.24 * s, vDeep - 0.04 * s, -0.22 * s, 0.24 * s, ySh + 0.06 * s, 0.22 * s];
    const collarPrims = (off) => topPrims(off).filter((q) => q.tag !== 'upperArm' && q.tag !== 'lowerArm');
    const cf = new Field(collarPrims(collarOff), { box: cbox, post: (d, x, y, z) => smax(Math.max(smax(d, topClip(x, y, z), 0.003), -(d + 0.012)), region(x, y, z), 0.002) });
    addField('SailorCollar', 'top2', cf, Q.fine * 1.15, 4000);
    // white stripe near the collar edge
    const stripe = (x, y, z) => {
      const r1 = region(x, y, z, 0.006 * s), r2 = region(x, y, z, 0.011 * s);
      return Math.max(r1, -r2);
    };
    const sf = new Field(collarPrims(collarOff + 0.0012), { box: cbox, post: (d, x, y, z) => smax(Math.max(smax(d, topClip(x, y, z), 0.002), -(d + 0.004)), stripe(x, y, z), 0.001) });
    addField('CollarStripe', 'white', sf, Q.fine * 0.9, 2000);
  }

  // ---- shirt collar + tie ----
  const chestFrontZ = (y) => {
    // find the front surface of the top field at x=0
    let z = 0.3;
    for (let i = 0; i < 60; i++) {
      const d = topField.eval(0, y, z);
      if (d < 0.0005) break;
      z -= Math.max(d, 0.001);
    }
    return z;
  };
  if (top === 'shirt') {
    // collar wings: two thin triangular plates lying on the chest below the neck
    const cy = ySh + 0.012 * s;
    const zNeckFront = (y) => {
      let z = 0.25;
      for (let i = 0; i < 60; i++) {
        const d = Math.min(topField.eval(0, y, z), bodyField.eval(0, y, z) - 0.008);
        if (d < 0.0005) break;
        z -= Math.max(d, 0.001);
      }
      return z;
    };
    // actual height of the shirt neckline at the front centre
    let neckFrontY = ySh;
    for (let y = ySh + 0.06 * s; y > ySh - 0.08 * s; y -= 0.002) {
      const z = zNeckFront(y);
      if (topField.eval(0, y, z) < 0.0015) {
        neckFrontY = y;
        break;
      }
    }
    const cyw = neckFrontY + 0.006 * s;
    const zc0 = zNeckFront(cyw - 0.022 * s);
    const tri2 = (px, py, a, b, c) => {
      // signed distance to a 2D triangle (iq)
      const e0 = [b[0] - a[0], b[1] - a[1]], e1 = [c[0] - b[0], c[1] - b[1]], e2 = [a[0] - c[0], a[1] - c[1]];
      const v0 = [px - a[0], py - a[1]], v1 = [px - b[0], py - b[1]], v2 = [px - c[0], py - c[1]];
      const pq = (v, e) => {
        const t = clamp((v[0] * e[0] + v[1] * e[1]) / (e[0] * e[0] + e[1] * e[1]), 0, 1);
        return [v[0] - e[0] * t, v[1] - e[1] * t];
      };
      const q0 = pq(v0, e0), q1 = pq(v1, e1), q2 = pq(v2, e2);
      const sg = Math.sign(e0[0] * e2[1] - e0[1] * e2[0]);
      const d0 = [q0[0] * q0[0] + q0[1] * q0[1], sg * (v0[0] * e0[1] - v0[1] * e0[0])];
      const d1 = [q1[0] * q1[0] + q1[1] * q1[1], sg * (v1[0] * e1[1] - v1[1] * e1[0])];
      const d2 = [q2[0] * q2[0] + q2[1] * q2[1], sg * (v2[0] * e2[1] - v2[1] * e2[0])];
      const m0 = Math.min(d0[0], d1[0], d2[0]);
      const m1 = Math.min(d0[1], d1[1], d2[1]);
      return -Math.sqrt(m0) * Math.sign(m1);
    };
    const collar = new Field(
      [-1, 1].map((sg) => {
        const A = [sg * (nr + 0.006 * s), cyw + 0.014 * s], Bv = [sg * 0.002 * s, cyw - 0.012 * s], Cv = [sg * 0.036 * s, cyw - 0.034 * s];
        return custom(
          (x, y, z) => {
            const d2 = tri2(x, y, A, Bv, Cv) - 0.002;
            const zs = zc0 - x * x * 6 + (y - (cyw - 0.022 * s)) * 0.35 + 0.004;
            return Math.max(d2, Math.abs(z - zs) - 0.0022);
          },
          [sg > 0 ? -0.01 : -0.08, cy - 0.07, zc0 - 0.05, sg > 0 ? 0.08 : 0.01, cy + 0.03, zc0 + 0.05],
          { k: 0.003 }
        );
      })
    );
    const cn = new Field([custom((x, y, z) => {
      // band around the neck
      const d = Math.hypot(x / (nr + 0.008 * s), (z - neckC[2] + 0.004) / (nr + 0.012 * s)) - 1;
      const yc = neckFrontY + 0.012 * s - z * 0.25;
      return Math.max(Math.abs(d * (nr + 0.01 * s)) - 0.0022, Math.abs(y - yc) - 0.013 * s);
    }, [-0.1, ySh - 0.05, -0.1, 0.1, ySh + 0.07, 0.1], { k: 0.004, bone: B('Neck') })]);
    addField('ShirtCollar', 'top2', cn, Q.fine * 0.55, 2500, { weightPrims: byTag('neck', 'torso') });
    addField('ShirtCollarWings', 'top2', collar, Q.fine * 0.5, 1500, { weightPrims: byTag('torso', 'neck') });
    // tie
    const tieTop = neckFrontY - 0.028 * s, tieBot = Math.max(hemY + 0.03 * s, yW - 0.02 * s);
    const NT = 40, zt = [];
    for (let i = 0; i <= NT; i++) zt.push(chestFrontZ(lerp(tieTop + 0.01, tieBot - 0.02, i / NT)));
    const zAt = (y) => {
      const f = clamp((y - (tieTop + 0.01)) / (tieBot - 0.02 - tieTop - 0.01), 0, 1) * NT;
      const i = Math.min(f | 0, NT - 1);
      return lerp(zt[i], zt[i + 1], f - i);
    };
    const tie = custom(
      (x, y, z) => {
        // knot
        const ky = cyw - 0.014 * s;
        const kt = clamp((ky + 0.012 * s - y) / (0.026 * s), 0, 1);
        const knot = Math.max(Math.abs(x) - lerp(0.013, 0.008, kt) * s, Math.abs(y - ky) - 0.012 * s, Math.abs(z - (zc0 + 0.008)) - 0.005) - 0.002;
        // blade: kite shape widening downward with pointed tip
        const t = clamp((tieTop - y) / (tieTop - tieBot), 0, 1);
        const w = lerp(0.01, 0.03, Math.min(t * 1.2, 1)) * s * (t > 0.92 ? (1 - t) / 0.08 : 1);
        const zc = zAt(y) + 0.0045;
        const blade = Math.max(Math.abs(x) - w, Math.abs(z - zc) - 0.003, y - (tieTop - 0.01 * s), tieBot - 0.01 * s - y);
        return smin(knot, blade, 0.006);
      },
      [-0.05, tieBot - 0.05, -0.1, 0.05, tieTop + 0.03, 0.4],
      { k: 0, bone: B('UpperChest') }
    );
    addField('Tie', 'ribbon', new Field([tie]), Q.fine * 0.9, 1500, { weightPrims: byTag('torso', 'breast') });
  }

  // ---- sailor bow ----
  if (top === 'sailor') {
    const by = vDeep + 0.005 * s;
    const bz = chestFrontZ(vDeep - 0.012 * s) + 0.01 * s;
    const bowPrims = [];
    const k = 0.006;
    for (const sg of [-1, 1]) {
      bowPrims.push(ellipsoid([sg * 0.032 * s, by + 0.004 * s, bz], [0.03 * s, 0.017 * s, 0.009 * s], { k, rot: rotZm(sg * 0.25) }));
      // tails
      bowPrims.push(limb([sg * 0.006 * s, by - 0.004 * s, bz - 0.002], [sg * 0.03 * s, by - 0.07 * s, bz - 0.004], [0.012 * s, 0.017 * s], { k, squash: { dir: [0, 0, 1], f: 0.35 } }));
    }
    bowPrims.push(ellipsoid([0, by, bz + 0.003], [0.012 * s, 0.013 * s, 0.01 * s], { k }));
    addField('Bow', 'ribbon', new Field(bowPrims), Q.fine * 0.8, 2000, { weightPrims: byTag('torso', 'breast') });
  }

  // ---- hoodie hood + strings ----
  if (top === 'hoodie') {
    const hood = custom(
      (x, y, z) => {
        const e = sdEllipsoid(x, y - (ySh + 0.015 * s), z + 0.075 * s, 0.13 * s, 0.07 * s, 0.085 * s);
        const inner = sdEllipsoid(x, y - (ySh + 0.03 * s), z + 0.05 * s, 0.085 * s, 0.06 * s, 0.07 * s);
        return smax(e, -inner, 0.01);
      },
      [-0.16, ySh - 0.08, -0.2, 0.16, ySh + 0.1, 0.05],
      { k: 0 }
    );
    addField('Hood', 'top', new Field([hood]), Q.cloth * 0.8, 2500, { weightPrims: byTag('torso', 'neck', 'trap') });
    const zs = chestFrontZ(ySh - 0.03 * s);
    const strings = [-1, 1].map((sg) => limb([sg * 0.03 * s, ySh - 0.02 * s, zs], [sg * 0.034 * s, ySh - 0.16 * s, chestFrontZ(ySh - 0.16 * s) + 0.004], [0.0035 * s, 0.0035 * s], { k: 0 }));
    addField('HoodStrings', 'top2', new Field(strings), Q.fine * 0.7, 800, { weightPrims: byTag('torso', 'breast') });
    // kangaroo pocket
    const py = lerp(hemY, yW, 0.55);
    const pocket = custom(
      (x, y, z) => {
        const zc = chestFrontZ(py) + 0.003;
        const w = 0.085 * s - Math.max(0, y - py) * 0.6;
        return sdRoundBox(x, y - py, z - zc, w, 0.045 * s, 0.006, 0.004);
      },
      [-0.12, py - 0.07, -0.05, 0.12, py + 0.07, 0.3],
      { k: 0 }
    );
    const pf = new Field([pocket], { post: (d, x, y, z) => Math.max(d, -topField.eval(x, y, z) - 0.006) });
    addField('Pocket', 'top', pf, Q.fine, 1200, { weightPrims: byTag('torso') });
  }

  // ---------------------------------------------------------------- BOTTOM
  const bottom = p.bottom;
  const skirtTop = yW - 0.01 * s;
  if ((bottom === 'skirt' || bottom === 'aline') && !coversOnly) {
    const sk = buildSkirt(rig, p, body, Q, { yTop: skirtTop, topHem: topLen > 0.4 && top !== 'crop' && top !== 'sportbra' ? hemY : null, tOff });
    parts.push({ name: 'Skirt', mat: 'bottom', mesh: sk });
  } else if (bottom !== 'skirt' && bottom !== 'aline') {
    const bOff = 0.0045;
    const legLen = bottom === 'pants' ? lerp(rig.kneeY - 0.02 * s, rig.ankleY + 0.025 * s, p.bottomLen) : bottom === 'shorts' ? lerp(yC - 0.025 * s, rig.kneeY + 0.06 * s, p.bottomLen) : yC + 0.01 * s;
    const list = [];
    for (const q of prims) {
      if (q.tag === 'torso') list.push(wrap(q, bOff, (x, y, z) => y - (yW + 0.005 * s), 0.02));
      else if (q.tag === 'butt') list.push(wrap(q, bOff, null, 0.04));
      else if (q.tag === 'thigh') list.push(wrap(q, bOff + (bottom === 'pants' ? 0.004 : 0.002), (x, y, z) => legLen - y, 0.012));
      else if (q.tag === 'calf' && bottom === 'pants' && legLen < rig.kneeY + 0.02) list.push(wrap(q, bOff + 0.006, (x, y, z) => legLen - y, 0.012));
    }
    let post = null;
    if (bottom === 'briefs') {
      // leg openings: angled planes through the crotch
      post = (d, x, y, z) => {
        const ax = Math.abs(x);
        const cut = (yC + 0.025 * s + ax * 0.55) - y - 0.025 * s;
        return smax(d, Math.min(cut, -(ax - 0.035 * s)), 0.005);
      };
    }
    const bf = new Field(list, { post });
    addField('Bottom', 'bottom', bf, Q.cloth, 6000);
    covers.push({ f: (x, y, z) => bf.eval(x, y, z), thr: -bOff * 0.55 });
    if (bottom === 'pants' || bottom === 'shorts') {
      // waistband
      const wb = new Field(list.filter((q) => q.tag === 'torso').map((q) => wrap(q, 0.002)), { post: (d, x, y, z) => smax(d, Math.max(y - (yW + 0.004 * s), yW - 0.03 * s - y), 0.002) });
      addField('Waistband', 'bottom', wb, Q.fine * 1.2, 1500);
    }
  }

  // ---------------------------------------------------------------- LEGWEAR
  const lw = p.legwear;
  if (lw !== 'none') {
    const off = 0.0018;
    const topY = lw === 'socks' ? rig.ankleY + 0.07 * s : lw === 'knee' ? rig.kneeY - 0.035 * s : lw === 'thigh' ? lerp(rig.kneeY, yC, 0.62) : yW + 0.002;
    const list = [];
    for (const q of prims) {
      if (q.tag === 'foot' || q.tag === 'calf') list.push(wrap(q, off, (x, y, z) => y - topY, q.k));
      else if (q.tag === 'thigh' && topY > rig.kneeY) list.push(wrap(q, off, (x, y, z) => y - topY, 0.01));
      else if (lw === 'tights' && (q.tag === 'torso' || q.tag === 'butt')) list.push(wrap(q, off, (x, y, z) => y - topY, q.tag === 'butt' ? 0.04 : 0.02));
    }
    const lf = new Field(list);
    addField('Legwear', 'legwear', lf, Q.cloth * 0.85, 6000, { sigma: 0.01 });
    covers.push({ f: (x, y, z) => lf.eval(x, y, z), thr: -off * 0.5, legwear: true });
    if (lw !== 'tights') {
      // top band
      const bl = list.map((q) => wrap(q, 0.0016));
      const bf2 = new Field(bl, { post: (d, x, y, z) => smax(d, topY - 0.018 * s - y, 0.002) });
      addField('LegwearBand', 'legwear', bf2, Q.fine, 1500, { sigma: 0.01 });
    }
  }

  // ---------------------------------------------------------------- SHOES
  const sh = p.shoes;
  if (sh !== 'none') {
    const off = sh === 'boots' ? 0.0065 : 0.0055;
    const topY = sh === 'boots' ? lerp(rig.ankleY, rig.kneeY, 0.78) : sh === 'sneaker' ? rig.ankleY + 0.012 * s : rig.ankleY - 0.012 * s;
    const list = [];
    for (const q of prims) {
      if (q.tag === 'foot') list.push(wrap(q, off, null, q.k));
      else if (q.tag === 'calf' && topY > rig.ankleY) list.push(wrap(q, off + (sh === 'boots' ? 0.002 : 0), null, q.k));
    }
    const sole = -0.012;
    const upper = new Field(list, { post: (d, x, y, z) => smax(smax(d, y - topY, 0.004), sole + 0.006 - y, 0.002) });
    addField('Shoes', 'shoe', upper, Q.fine * 1.15, 4000, { sigma: 0.01 });
    const shoeCov = new Field(list);
    covers.push({ f: (x, y, z) => smax(shoeCov.eval(x, y, z), y - topY, 0.004), thr: -off * 0.5 });
    // sole: wider, flat
    const soleList = prims.filter((q) => q.tag === 'foot').map((q) => wrap(q, off + 0.0025, null, q.k));
    const sf = new Field(soleList, { post: (d, x, y, z) => smax(smax(d, y - (sole + 0.012), 0.002), sole - y, 0.002) });
    addField('Soles', 'shoe2', sf, Q.fine * 1.1, 2000, { sigma: 0.01 });
  }

  return { parts, covers: covers.map((c) => (x, y, z) => c.f(x, y, z) - c.thr) };
}

function rotZm(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

// ---------------------------------------------------------------- SKIRT
function buildSkirt(rig, p, body, Q, opts) {
  const s = rig.s;
  const pleated = p.bottom === 'skirt' && p.pleats > 1;
  const nP = Math.round(p.pleats);
  const N = pleated ? nP * 4 : 64;
  const M = Math.round(8 + 6 * Math.min(Q.mul, 2));
  const yTop = opts.topHem != null ? Math.min(opts.yTop, opts.topHem + 0.015 * s) : opts.yTop;
  const yHem = lerp(rig.crotchY - 0.035 * s, rig.kneeY - 0.14 * s, p.bottomLen);
  const coll = new Field(body.prims.filter((q) => ['torso', 'butt', 'thigh'].includes(q.tag)));
  const flare = lerp(0.18, 0.75, p.skirtFlare);
  const yF = opts.topHem != null ? Math.min(yTop, opts.topHem - 0.008) : yTop;
  const bodyR = (th, y) => {
    const dx = Math.sin(th), dz = Math.cos(th);
    let r = 0.45;
    for (let i = 0; i < 80; i++) {
      const d = coll.eval(dx * r, y, dz * r);
      if (d < 0.0005) break;
      r -= Math.max(d, 0.0015);
      if (r < 0.01) return 0.01;
    }
    return r;
  };
  // radius table
  const rings = [];
  for (let j = 0; j <= M; j++) {
    const tj = j / M;
    const y = lerp(yTop, yHem, tj);
    const row = [];
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU;
      const rb = bodyR(th, y) + (opts.topHem != null ? 0.002 : 0.004 + (j === 0 ? 0 : 0.003));
      let r = rb;
      if (y < yF) {
        const drop = yF - y;
        const rTop = bodyR(th, yF) + 0.006;
        r = Math.max(rTop + drop * flare * (0.6 + 0.4 * Math.abs(Math.cos(th))), rb + 0.006);
      }
      row.push(r);
    }
    rings.push(row);
  }
  // monotonic outward going down & smoothing around
  for (let j = 1; j <= M; j++) for (let i = 0; i < N; i++) rings[j][i] = Math.max(rings[j][i], rings[j - 1][i] * (rings[j][i] > rings[j - 1][i] ? 1 : 0.995));
  for (let it = 0; it < 3; it++)
    for (let j = 1; j <= M; j++) {
      const r = rings[j].slice();
      for (let i = 0; i < N; i++) rings[j][i] = Math.max(r[i], (r[(i + N - 1) % N] + 2 * r[i] + r[(i + 1) % N]) / 4);
    }
  const ringPos = (j, i, inset) => {
    const th = (i / N) * TAU;
    const tj = j / M;
    let r = rings[j][i];
    if (pleated) {
      const ph = (i % 4) / 4; // 0 peak .25 mid .5 valley .75 mid
      const tri = 1 - Math.abs(ph * 2 - 1) * 2; // 1 at 0, -1 at .5
      const yy = lerp(yTop, yHem, tj);
      const amp = 0.015 * s * clamp((yF - yy) / 0.05, 0, 1) * (0.6 + 0.6 * p.skirtFlare);
      r += tri * amp;
    }
    r -= inset;
    return [Math.sin(th) * r, lerp(yTop, yHem, tj), Math.cos(th) * r];
  };
  const thick = 0.0022;
  const pos = [], idx = [];
  // each column strip gets its own vertices so pleats keep crisp, flat-shaded faces
  const strips = pleated;
  const addSurface = (inset, flip) => {
    if (!strips) {
      const base = pos.length / 3;
      for (let j = 0; j <= M; j++) for (let i = 0; i < N; i++) pos.push(...ringPos(j, i, inset));
      for (let j = 0; j < M; j++)
        for (let i = 0; i < N; i++) {
          const a = base + j * N + i, b = base + j * N + ((i + 1) % N), c = a + N, d = b + N;
          if (!flip) idx.push(a, c, b, b, c, d);
          else idx.push(a, b, c, b, d, c);
        }
      return;
    }
    for (let i = 0; i < N; i += 2) {
      // a pleat face spans two columns (peak->mid->valley) so each face is gently curved but distinct
      const base = pos.length / 3;
      const cols = [i, i + 1, (i + 2) % N];
      for (let j = 0; j <= M; j++) for (const c of cols) pos.push(...ringPos(j, c, inset));
      for (let j = 0; j < M; j++)
        for (let k = 0; k < 2; k++) {
          const a = base + j * 3 + k, b = a + 1, c = a + 3, d = b + 3;
          if (!flip) idx.push(a, c, b, b, c, d);
          else idx.push(a, b, c, b, d, c);
        }
    }
  };
  addSurface(0, false);
  const innerStart = pos.length / 3;
  addSurface(thick, true);
  // hem rim (shared ring)
  const rimBase = pos.length / 3;
  for (let i = 0; i < N; i++) pos.push(...ringPos(M, i, 0));
  for (let i = 0; i < N; i++) pos.push(...ringPos(M, i, thick));
  for (let i = 0; i < N; i++) {
    const a = rimBase + i, b = rimBase + ((i + 1) % N), c = rimBase + N + i, d = rimBase + N + ((i + 1) % N);
    idx.push(a, c, b, b, c, d);
  }
  const NV = innerStart;
  const mesh = { positions: new Float32Array(pos), index: new Uint32Array(idx) };
  {
    const nvv = pos.length / 3;
    const ao = new Float32Array(nvv);
    for (let v = 0; v < nvv; v++) {
      const t = clamp((yTop - pos[v * 3 + 1]) / (yTop - yHem + 1e-5), 0, 1);
      ao[v] = v >= innerStart && v < rimBase ? 0.5 + 0.2 * t : v >= rimBase ? 0.8 : 0.78 + 0.22 * Math.min(1, t * 2.5);
    }
    mesh.ao = ao;
  }
  // orientation: outer faces outward
  computeNormalsFlatAware(mesh, NV);
  // weights
  const nv = pos.length / 3;
  const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
  const L = rig.idx.LeftUpperLeg, Rr = rig.idx.RightUpperLeg, H = rig.idx.Hips;
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1];
    const t = clamp((yTop - y) / (yTop - yHem + 1e-5), 0, 1);
    const side = clamp(Math.abs(x) / (rig.hipX * 1.6), 0, 1);
    const wl = t * t * 0.55 * side;
    SI[v * 4] = H;
    SW[v * 4] = 1 - wl;
    SI[v * 4 + 1] = x > 0 ? L : Rr;
    SW[v * 4 + 1] = wl;
  }
  mesh.skinIndex = SI;
  mesh.skinWeight = SW;
  return mesh;
}

function computeNormalsFlatAware(m, NV) {
  const P = m.positions, I = m.index;
  const N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) {
      N[q] += nx;
      N[q + 1] += ny;
      N[q + 2] += nz;
    }
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= l; N[i + 1] /= l; N[i + 2] /= l;
  }
  m.normals = N;
}
