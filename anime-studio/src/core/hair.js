// Anime hair v2: "combed clump" system.
// Every clump starts at the parting / crown, follows the scalp along a smooth arc (like a comb),
// detaches where the head curves away, then falls as a curtain to a target tip height.
// Clumps are thin curved plates with a ridge (not tubes), stacked in layers with patterned tips.
import { Field } from './mesher.js';
import { custom, smax, smin, sdEllipsoid, rng, lerp, clamp, v3 } from './sdf.js';
import { fieldPart, rigidWeights, mergeMeshes } from './partkit.js';

const TAU = Math.PI * 2;
const ease = (t) => t * t * (3 - 2 * t);

export function buildHair(rig, p, head, bodyField, Q) {
  const hH = rig.hH;
  const O = head.O;
  const R = rng(p.seed * 7919 + 13);
  const jit = (a) => (R() * 2 - 1) * a;
  const vol = p.volume;
  const spiky = p.spikiness;
  const sw = p.strandWidth;
  const capOff = 0.026 * vol * hH; // world
  const capOffL = capOff / hH; // local
  const Cc = head.cranium.c; // local
  const toW = (l) => [O[0] + l[0] * hH, O[1] + l[1] * hH, O[2] + l[2] * hH];
  const toL = (w) => [(w[0] - O[0]) / hH, (w[1] - O[1]) / hH, (w[2] - O[2]) / hH];
  const sph = (theta, phi) => [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];
  const grad = (f, x, y, z, e = 0.0015) => v3.norm([f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)]);

  // ---------------------------------------------------------------- scalp map (local units)
  const TBn = 128, PBn = 80, PHMAX = Math.PI * 0.8;
  const scalpP = new Float32Array(TBn * PBn * 3), scalpN = new Float32Array(TBn * PBn * 3);
  for (let b = 0; b < PBn; b++)
    for (let a = 0; a < TBn; a++) {
      const th = (a / TBn) * TAU, ph = 0.02 + (b / (PBn - 1)) * (PHMAX - 0.02);
      const d = sph(th, ph);
      let t = 0.9;
      for (let i = 0; i < 60; i++) {
        const sd = head.local(Cc[0] + d[0] * t, Cc[1] + d[1] * t, Cc[2] + d[2] * t);
        if (Math.abs(sd) < 0.0006) break;
        t -= sd;
      }
      const q = [Cc[0] + d[0] * t, Cc[1] + d[1] * t, Cc[2] + d[2] * t];
      const e = 0.003;
      const n = v3.norm([
        head.local(q[0] + e, q[1], q[2]) - head.local(q[0] - e, q[1], q[2]),
        head.local(q[0], q[1] + e, q[2]) - head.local(q[0], q[1] - e, q[2]),
        head.local(q[0], q[1], q[2] + e) - head.local(q[0], q[1], q[2] - e),
      ]);
      const k = (b * TBn + a) * 3;
      scalpP.set(q, k);
      scalpN.set(n, k);
    }
  const scalp = (theta, phi) => {
    const fa = ((((theta / TAU) % 1) + 1) % 1) * TBn;
    const fb = clamp(((phi - 0.02) / (PHMAX - 0.02)) * (PBn - 1), 0, PBn - 1.001);
    const a0 = Math.floor(fa) % TBn, a1 = (a0 + 1) % TBn, b0 = Math.floor(fb), b1 = b0 + 1;
    const ua = fa - Math.floor(fa), ub = fb - b0;
    const P = [0, 0, 0], N = [0, 0, 0];
    for (const [aa, bb, w] of [[a0, b0, (1 - ua) * (1 - ub)], [a1, b0, ua * (1 - ub)], [a0, b1, (1 - ua) * ub], [a1, b1, ua * ub]]) {
      const k = (bb * TBn + aa) * 3;
      for (let i = 0; i < 3; i++) {
        P[i] += scalpP[k + i] * w;
        N[i] += scalpN[k + i] * w;
      }
    }
    return { p: P, n: v3.norm(N) };
  };
  // polar angle where the head starts curving away (hair detaches and falls)
  const phiDetach = (theta) => {
    for (let ph = 0.4; ph < PHMAX; ph += 0.02) if (scalp(theta, ph).n[1] < 0.06) return ph;
    return PHMAX;
  };

  // ---------------------------------------------------------------- anchors (tails / buns)
  const tails = p.tails;
  const anchors = [];
  const bulbs = []; // world
  const tailHeight = p.tailHeight;
  if (tails === 'ponytail') anchors.push({ theta: Math.PI, phi: lerp(2.05, 0.95, tailHeight), kind: 'tail' });
  else if (tails === 'twin') {
    const phi = lerp(1.75, 0.85, tailHeight);
    anchors.push({ theta: 2.05, phi, kind: 'tail', side: 1 }, { theta: -2.05, phi, kind: 'tail', side: -1 });
  } else if (tails === 'side') {
    const s = p.partX >= 0 ? 1 : -1;
    anchors.push({ theta: s * 1.95, phi: lerp(1.75, 1.0, tailHeight), kind: 'tail', side: s });
  } else if (tails === 'bun') anchors.push({ theta: Math.PI, phi: lerp(1.75, 0.45, tailHeight), kind: 'bun' });
  else if (tails === 'twinbun') {
    const phi = lerp(1.2, 0.55, tailHeight);
    anchors.push({ theta: 2.0, phi, kind: 'bun', side: 1 }, { theta: -2.0, phi, kind: 'bun', side: -1 });
  }
  for (const a of anchors) {
    const s = scalp(a.theta, Math.min(a.phi, PHMAX - 0.01));
    const sW = toW(s.p);
    a.n = s.n;
    const tv = p.tailVolume;
    if (a.kind === 'bun') {
      const r = 0.15 * tv * hH;
      a.c = v3.add(sW, v3.mul(a.n, r * 0.75 + capOff));
      a.r = r;
      bulbs.push({ c: a.c, r: [r, r * 0.92, r] });
    } else {
      const r = 0.075 * tv * hH;
      a.c = v3.add(sW, v3.mul(a.n, capOff + r * 0.5));
      a.r = r;
      bulbs.push({ c: a.c, r: [r * 1.1, r, r * 1.1] });
    }
  }

  // ---------------------------------------------------------------- collision (world)
  const bodyColl = new Field(bodyField.prims.filter((q) => ['torso', 'neck', 'breast', 'trap', 'shoulder', 'butt'].includes(q.tag)));
  const bodyBox = bodyColl.bounds();
  const collide = (x, y, z) => {
    let d = head.sdf(x, y, z) - capOff * 0.9;
    if (y < bodyBox[4] + 0.05) d = Math.min(d, bodyColl.eval(x, y, z) - 0.01);
    for (const b of bulbs) d = Math.min(d, sdEllipsoid(x - b.c[0], y - b.c[1], z - b.c[2], b.r[0], b.r[1], b.r[2]) - 0.002);
    return d;
  };

  // ---------------------------------------------------------------- clump layout
  const clumps = [];
  const partX = p.partX;
  const partSide = partX >= 0 ? 1 : -1;
  const layerGap = 0.017 * vol; // local
  const bobCurl = clamp(1 - p.backLen / 0.7, 0, 1); // short hair curls in at the tips
  const thickL = 0.024 * Math.sqrt(vol); // local plate thickness
  const blunt = p.hairStyle === 'hime' ? 1 : 0;
  // tip height of the main curtain (local y, chin = 0)
  const yBack = 0.52 - 1.3 * p.backLen;
  const ySide = 0.4 - 0.48 * p.sideLen;
  const gathered = tails === 'ponytail' || tails === 'bun';

  // A) bangs: roots along the parting, combed forward/down over the forehead
  if (p.bangs !== 'none') {
    const n = Math.round(p.bangsCount);
    const yTip0 = 0.67 - 0.22 * p.bangsLen;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      let th1 = u * 0.98;
      let th0 = th1 * 0.3 + partX * 0.25;
      if (p.bangs === 'swept') th1 += -partSide * 0.22 * (1 - Math.abs(u) * 0.5);
      if (p.bangs === 'split') th1 += Math.sign(u || 1) * 0.16 * (1 - Math.abs(u));
      // patterned tip heights: longer between the eyes and at the temples, alternating
      const pat = (i % 2 ? 0.035 : -0.01) + 0.05 * Math.abs(u) ** 2 - (p.bangs === 'split' ? 0.05 * (1 - Math.abs(u)) : 0);
      let yTip = yTip0 - pat - (p.bangs === 'swept' ? 0.06 * (u * -partSide + 1) * 0.5 : 0) + jit(0.012 + 0.08 * spiky);
      const wAng = (1.96 / n) * 1.45 * sw;
      clumps.push({ group: 'bangs', th0, ph0: 0.22 + 0.08 * Math.abs(u), th1, yTip, wAng, layer: 1, curl: -0.05, flare: 0.02, blunt });
    }
  }

  // B) side locks framing the face
  if (p.sideLen > 0.04) {
    for (const s of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const th1 = s * (1.12 + 0.17 * k);
        const yTip = ySide + 0.06 * k + jit(0.015 + 0.06 * spiky);
        clumps.push({ group: 'side', th0: s * 0.55 + partX * 0.2, ph0: 0.3 + 0.04 * k, th1, yTip, wAng: (k === 0 ? 0.3 : 0.24) * sw, layer: k === 0 ? 2 : 1, curl: 0.35 * (1 - k * 0.3), flare: 0.04, blunt: blunt && k === 0 ? 1 : 0, faceFrame: true });
      }
    }
  }

  // C) curtain: two layers from the crown whorl around the sides and back
  if (spiky > 0.55 && !gathered) {
    // shonen spikes: rows of wide-based triangular spikes radiating up / back / out
    const rows = [
      { ph: 0.42, n: 6, up: 1.0, len: 0.42, th: [-2.4, 2.4] },
      { ph: 0.85, n: 8, up: 0.45, len: 0.4, th: [1.0, TAU - 1.0] },
      { ph: 1.25, n: 9, up: -0.25, len: 0.34, th: [1.15, TAU - 1.15] },
    ];
    rows.forEach((row, ri) => {
      for (let i = 0; i < row.n; i++) {
        const u = (i + 0.5 + (ri % 2) * 0.5) / row.n;
        let th1;
        if (ri === 0) th1 = Math.PI + (u - 0.5) * (row.th[1] - row.th[0]);
        else th1 = row.th[0] + u * (row.th[1] - row.th[0]);
        const L = row.len * (0.75 + 0.45 * vol * 0.5) * (1 + 0.3 * p.backLen) * (1 + jit(0.15));
        clumps.push({ group: 'spike', th0: th1, ph0: Math.max(0.12, row.ph - 0.35), th1, spikePh: row.ph, spikeUp: row.up + jit(0.15), spikeLen: L, wAng: (0.85 + 0.3 * ri) * sw * (1 + jit(0.1)), layer: 2 - ri * 0.5, curl: 0, flare: 0, blunt: 0, yTip: -10 });
      }
    });
    // short underlayer so the nape is covered
    for (let i = 0; i < 10; i++) {
      const th1 = 1.3 + ((i + 0.5) / 10) * (TAU - 2.6);
      clumps.push({ group: 'back', th0: th1, ph0: 0.3, th1, yTip: 0.32 + jit(0.03), wAng: 0.55 * sw, layer: 0, curl: 0.4, flare: 0.04, blunt: 0 });
    }
  } else {
    const nb = Math.round(lerp(10, 15, clamp((vol - 0.4) / 1.4, 0, 1)));
    const th0s = 1.3, span = TAU - 2 * th0s;
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < nb; i++) {
        const u = (i + 0.5 + (layer ? 0.5 : 0)) / nb;
        const th1 = th0s + u * span + jit(0.03);
        const back = Math.abs(Math.cos(th1)); // 1 at the back, 0 at the sides
        let yTip = yBack + (layer ? 0.06 : -0.02) + (i % 3 === 1 ? 0.05 : 0) - 0.05 * back * (p.backLen > 0.6 ? 1 : 0) + jit(0.02 + 0.1 * spiky);
        // sides end a bit higher than the back for long hair
        if (p.backLen > 0.6) yTip += (1 - back) * 0.18;
        const c = {
          group: 'back', th0: th1, ph0: layer ? 0.14 : 0.2, th1, yTip,
          wAng: (span / nb) * (layer ? 1.25 : 1.5) * sw, layer: layer ? 1 : 0, curl: 0.95 * bobCurl + 0.04, flare: lerp(0.06, 0.03, bobCurl), blunt,
        };
        // keep the crown whorl: roots converge toward the back of the crown
        c.th0 = Math.PI + (th1 - Math.PI) * 0.75;
        if (gathered) {
          c.target = anchors[0];
          c.yTip = -10;
        }
        clumps.push(c);
      }
    }
  }


  // ---------------------------------------------------------------- path construction
  const strandsOut = []; // {pts:[world], nrm:[world], W(t), th(t), group, layer, free}
  const thetaOf = (l) => Math.atan2(l[0], l[2] - Cc[2]);
  const radialOf = (l) => Math.hypot(l[0], l[2] - Cc[2]);

  const buildCombed = (c) => {
    const off = capOffL + c.layer * layerGap + thickL * 0.5;
    const pts = [], nrm = [];
    const phD = phiDetach(c.th1);
    const phEnd = c.target ? Math.min(c.target.phi, PHMAX - 0.02) : c.spikePh ? Math.min(c.spikePh, phD) : phD;
    const thEnd = c.target ? c.target.theta : c.th1;
    // 1) over the scalp
    const steps = 26;
    let last = null;
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const ph = lerp(c.ph0, phEnd, s);
      // azimuth eases from the root to the target as the comb moves down
      let dth = thEnd - c.th0;
      if (dth > Math.PI) dth -= TAU;
      if (dth < -Math.PI) dth += TAU;
      const th = c.th0 + dth * ease(Math.min(1, s * 1.15));
      const sc = scalp(th, ph);
      const pt = v3.add(sc.p, v3.mul(sc.n, off));
      if (!c.target && pt[1] < c.yTip) break;
      pts.push(pt);
      nrm.push(sc.n);
      last = { th, ph, n: sc.n };
    }
    if (!last) return null;
    if (c.spikePh) {
      // straight-ish spike leaving the scalp
      const P0 = pts[pts.length - 1];
      const a = scalp(last.th, last.ph), b = scalp(last.th, last.ph + 0.03);
      const down = v3.norm(v3.sub(b.p, a.p));
      let d = v3.norm(v3.add(v3.add(v3.mul(a.n, 0.75), v3.mul([0, 1, 0], c.spikeUp)), v3.mul(down, 0.55)));
      const ns = 8;
      let q = P0;
      for (let i = 1; i <= ns; i++) {
        const t = i / ns;
        d = v3.norm(v3.add(d, [0, -0.05 * t, 0]));
        q = v3.add(q, v3.mul(d, c.spikeLen / ns));
        pts.push(q);
        nrm.push(v3.norm(v3.cross(d, v3.norm(v3.cross(a.n, d))))); // plate faces outward around the spike
      }
      return { pts: pts.map(toW), nrm };
    }
    // 2) curtain fall
    if (!c.target && pts[pts.length - 1][1] > c.yTip) {
      const P0 = pts[pts.length - 1];
      const r0 = radialOf(P0), a0 = thetaOf(P0);
      const drop = P0[1] - c.yTip;
      const hs = Math.max(4, Math.round(drop * 22));
      for (let i = 1; i <= hs; i++) {
        const t = i / hs;
        let y = P0[1] - drop * t;
        let r = r0 + c.flare * drop * t;
        // inward curl near the tip (bob) or a light flip outward
        const tc = Math.pow(t, 2.6);
        r -= c.curl * tc * Math.min(drop, 0.5) * 0.6;
        if (c.curl > 0.3) y += c.curl * tc * Math.min(drop, 0.5) * 0.12;
        r += p.tipFlip * tc * 0.08 * (c.group === 'bangs' ? 0.3 : 1);
        let a = a0;
        if (c.faceFrame) a += -Math.sign(a0) * 0.12 * tc; // side locks curve toward the cheeks
        const q = [Math.sin(a) * r, y, Cc[2] + Math.cos(a) * r];
        pts.push(q);
        nrm.push(v3.norm([Math.sin(a), 0, Math.cos(a)]));
      }
    }
    if (c.target) {
      // gathered hair ends inside the tie
      const tl = toL(c.target.c);
      pts.push(v3.lerp(pts[pts.length - 1], tl, 0.7));
      nrm.push(nrm[nrm.length - 1]);
    }
    return { pts: pts.map(toW), nrm };
  };

  // free strands (tails, ahoge, bun wraps) use a small physics integrator
  const buildFree = (st) => {
    const N = 18;
    const ds = (st.L * hH) / N;
    let P = st.root.slice();
    let d = v3.norm(st.dir);
    const pts = [P], nrm = [];
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      d = v3.norm(v3.add(d, [0, -st.grav * (0.35 + t), 0]));
      if (st.curl) d = v3.norm(v3.add(d, v3.mul(v3.norm(v3.cross(d, [1, 0, 0])), st.curl * 0.18)));
      if (st.wrap) d = v3.norm(v3.add(d, v3.mul(v3.norm(v3.sub(st.wrap.c, P)), 0.55)));
      let q = v3.add(P, v3.mul(d, ds));
      for (let k = 0; k < 3; k++) {
        const cc = collide(q[0], q[1], q[2]) - 0.004;
        if (cc >= 0) break;
        q = v3.sub(q, v3.mul(grad(collide, q[0], q[1], q[2]), cc));
      }
      d = v3.norm(v3.sub(q, P));
      q = v3.add(P, v3.mul(d, ds));
      pts.push(q);
      P = q;
    }
    for (let i = 0; i < pts.length; i++) nrm.push(grad(collide, pts[i][0], pts[i][1], pts[i][2], 0.004));
    return { pts, nrm };
  };

  // post-process a world path: collisions, smoothing, uniform resampling
  const finish = (path, segs, keepRoot = true) => {
    let pts = path.pts.map((q) => q.slice());
    for (let it = 0; it < 2; it++) {
      for (let i = 1; i < pts.length; i++) {
        let q = pts[i];
        for (let k = 0; k < 3; k++) {
          const c = collide(q[0], q[1], q[2]) - 0.003;
          if (c >= 0) break;
          q = v3.sub(q, v3.mul(grad(collide, q[0], q[1], q[2]), c));
        }
        pts[i] = q;
      }
      // laplacian smoothing (keeps the comb arc clean)
      const sm = pts.map((q) => q.slice());
      for (let i = 1; i < pts.length - 1; i++) sm[i] = v3.lerp(pts[i], v3.mul(v3.add(pts[i - 1], pts[i + 1]), 0.5), 0.5);
      if (!keepRoot) sm[0] = pts[0];
      pts = sm;
    }
    // resample by arc length
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + v3.len(v3.sub(pts[i], pts[i - 1])));
    const total = L[L.length - 1];
    const out = [], on = [];
    let j = 0;
    for (let i = 0; i <= segs; i++) {
      const s = (i / segs) * total;
      while (j < L.length - 2 && L[j + 1] < s) j++;
      const f = clamp((s - L[j]) / Math.max(1e-6, L[j + 1] - L[j]), 0, 1);
      out.push(v3.lerp(pts[j], pts[j + 1], f));
      on.push(v3.norm(v3.lerp(path.nrm[Math.min(j, path.nrm.length - 1)], path.nrm[Math.min(j + 1, path.nrm.length - 1)], f)));
    }
    return { pts: out, nrm: on, length: total };
  };

  const SEG = Q.seg;
  for (const c of clumps) {
    const raw = buildCombed(c);
    if (!raw || raw.pts.length < 3) continue;
    const segs = clamp(Math.round(SEG * 0.75 + raw.pts.length * 0.35), 10, SEG * 2);
    const f = finish(raw, segs);
    // width in world from angular width at the detach radius
    const rW = 0.42 * hH;
    strandsOut.push({ ...f, W: c.wAng * rW * 0.5, group: c.group, layer: Math.round(c.layer), blunt: c.blunt, gathered: !!c.target });
  }

  // D) ahoge
  if (p.ahoge) {
    const s = scalp(0.35, 0.16);
    const root = toW(v3.add(s.p, v3.mul(s.n, capOffL + 0.03)));
    const f = finish(buildFree({ root, dir: [0.1, 1, 0.5], L: 0.3, grav: 0.32, curl: 0.4 }), 14, false);
    strandsOut.push({ ...f, W: 0.05 * hH * sw, group: 'ahoge', layer: 2, free: true });
  }
  // E) tails & buns
  for (const a of anchors) {
    const out = a.n;
    const t1 = v3.norm(v3.cross(out, [0, 1, 0.01]));
    const t2 = v3.cross(out, t1);
    if (a.kind === 'tail') {
      const n = Math.round(9 * Math.sqrt(p.tailVolume)) + 2;
      const up = a.side ? [a.side * 0.9, 0.25, -0.35] : [0, 0.35, -1];
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU;
        const rr = a.r * 0.5;
        const root = v3.add(a.c, v3.add(v3.mul(t1, Math.cos(ang) * rr), v3.mul(t2, Math.sin(ang) * rr)));
        const dir = v3.norm(v3.add(v3.add(out, up), v3.add(v3.mul(t1, Math.cos(ang) * 0.3), v3.mul(t2, Math.sin(ang) * 0.3))));
        const L = (0.9 + p.tailLen * 1.5) * (1 + (i % 3 === 0 ? 0.08 : i % 3 === 1 ? -0.06 : 0) + jit(0.04));
        const f = finish(buildFree({ root, dir, L, grav: 0.95 * (1 - 0.4 * spiky) }), SEG + 4, false);
        strandsOut.push({ ...f, W: 0.15 * p.tailVolume * hH * sw, group: 'tail', layer: i % 2, free: true });
      }
    } else {
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * TAU;
        const root = v3.add(a.c, v3.mul(out, a.r * 0.2));
        const dir = v3.norm(v3.add(v3.mul(t1, Math.cos(ang)), v3.mul(t2, Math.sin(ang))));
        const f = finish(buildFree({ root, dir, L: 0.34 * p.tailVolume, grav: 0, wrap: a }), 12, false);
        strandsOut.push({ ...f, W: 0.07 * p.tailVolume * hH, group: 'bun', layer: 2, free: true });
      }
    }
  }

  // ---------------------------------------------------------------- outer surface map (for accessories)
  const TB = 48, PB = 24;
  const outerMap = new Float32Array(TB * PB);
  const mark = (wp, extra) => {
    const l = toL(wp);
    const d = v3.norm(v3.sub(l, Cc));
    const th = (Math.atan2(d[0], d[2]) + TAU) % TAU;
    const ph = Math.acos(clamp(d[1], -1, 1));
    const a = Math.min(TB - 1, Math.floor((th / TAU) * TB)), b = Math.min(PB - 1, Math.floor((ph / Math.PI) * PB));
    const r = v3.len(v3.sub(l, Cc)) + extra / hH;
    if (r > outerMap[b * TB + a]) outerMap[b * TB + a] = r;
  };
  for (let b = 0; b < PB; b++)
    for (let a = 0; a < TB; a++) {
      const ph = ((b + 0.5) / PB) * Math.PI;
      if (ph > PHMAX) continue;
      const s = scalp(((a + 0.5) / TB) * TAU, ph);
      mark(toW(v3.add(s.p, v3.mul(s.n, capOffL))), 0);
    }

  // ---------------------------------------------------------------- mesh: curved ridged plates
  const A = Q.ring >= 10 ? 9 : Q.ring >= 8 ? 7 : 5; // samples across the width
  const pos = [], uv = [], ht = [], idx = [], tan = [], aoA = [];
  const localPhi = (w) => {
    const l = toL(w);
    const d = v3.norm(v3.sub(l, Cc));
    return Math.acos(clamp(d[1], -1, 1)) / Math.PI;
  };
  let cid = 0;
  for (const st of strandsOut) {
    cid++;
    const pts = st.pts;
    const N = pts.length - 1;
    // frames
    const T = [], Nn = [], B = [];
    for (let i = 0; i <= N; i++) {
      T.push(v3.norm(v3.sub(pts[Math.min(i + 1, N)], pts[Math.max(i - 1, 0)])));
      let n = st.nrm[i];
      n = v3.sub(n, v3.mul(T[i], v3.dot(n, T[i])));
      Nn.push(v3.norm(n));
    }
    for (let it = 0; it < 3; it++)
      for (let i = 1; i < N; i++) {
        const s = v3.add(v3.add(Nn[i - 1], Nn[i + 1]), v3.mul(Nn[i], 2));
        Nn[i] = v3.norm(v3.sub(s, v3.mul(T[i], v3.dot(s, T[i]))));
      }
    for (let i = 0; i <= N; i++) B.push(v3.norm(v3.cross(T[i], Nn[i])));
    // width / thickness profiles
    const W = st.W;
    const width = (t) => {
      const root = st.free ? 0.7 + 0.3 * Math.min(1, t * 4) : st.group === 'spike' ? 0.75 + 0.25 * Math.min(1, t * 5) : 0.55 + 0.45 * ease(Math.min(1, t * 3.5));
      if (st.blunt) return W * root * (t < 0.9 ? 1 : Math.max(0.05, (1 - t) / 0.1));
      const ts = st.group === 'bangs' ? 0.42 : st.group === 'spike' ? 0.0 : 0.5;
      const e = clamp((t - ts) / (1 - ts), 0, 1);
      return W * root * (1 + 0.08 * Math.sin(Math.PI * t)) * Math.pow(1 - e, 1.15);
    };
    const thick = (t) => Math.max(thickL * hH * (st.free ? 1.2 : 1) * (0.55 + 0.45 * (1 - t)) * Math.min(1, width(t) / Math.max(W * 0.5, 1e-6)), 0.0004);
    // wave on the falling part
    if (p.wave > 0.001 && st.group !== 'ahoge') {
      const ph = R() * TAU, fr = 2 + R();
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        pts[i] = v3.add(pts[i], v3.mul(B[i], Math.sin(t * fr * TAU + ph) * p.wave * 0.045 * hH * Math.min(1, t * 2)));
      }
    }
    if (st.group !== 'tail' && st.group !== 'ahoge') for (let i = 0; i < N; i++) mark(pts[i], thick(i / N) + 0.002);

    const base = pos.length / 3;
    const RA = 2 * A - 2; // ring: top A samples + bottom A-2
    const aoLayer = st.layer === 0 ? 0.62 : st.layer === 1 ? 0.85 : 1;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const w = width(t), th = thick(t);
      const phi = localPhi(pts[i]);
      const ring = [];
      for (let j = 0; j < A; j++) ring.push([-1 + (2 * j) / (A - 1), 1]);
      for (let j = A - 2; j >= 1; j--) ring.push([-1 + (2 * j) / (A - 1), -1]);
      for (const [u, side] of ring) {
        const lens = Math.sqrt(Math.max(0, 1 - u * u));
        const bend = -0.22 * u * u * w; // edges curl toward the head
        const ridge = side > 0 ? 0.35 * th * (1 - Math.abs(u)) : 0;
        const off = side > 0 ? th * 0.5 * lens + ridge : -th * 0.5 * lens;
        const vp = v3.add(pts[i], v3.add(v3.mul(B[i], u * w), v3.mul(Nn[i], off + bend)));
        pos.push(...vp);
        uv.push(cid + (u + 1) * 0.5, phi);
        ht.push(t);
        tan.push(...T[i]);
        const rootAO = 0.55 + 0.45 * Math.min(1, t * 2.5);
        aoA.push(Math.min(1, aoLayer * rootAO * (side > 0 ? 1 : 0.75)));
      }
    }
    // tip & root centre
    const tip = base + N * RA;
    pos.push(...pts[N]);
    uv.push(cid + 0.5, localPhi(pts[N]));
    ht.push(1);
    tan.push(...T[N]);
    aoA.push(aoLayer);
    const rootC = tip + 1;
    pos.push(...v3.sub(pts[0], v3.mul(T[0], 0.002)));
    uv.push(cid + 0.5, localPhi(pts[0]));
    ht.push(0);
    tan.push(...T[0]);
    aoA.push(0.5);
    for (let i = 0; i < N - 1; i++)
      for (let j = 0; j < RA; j++) {
        const a = base + i * RA + j, b = base + i * RA + ((j + 1) % RA);
        idx.push(a, b, a + RA, b, b + RA, a + RA);
      }
    for (let j = 0; j < RA; j++) {
      const a = base + (N - 1) * RA + j, b = base + (N - 1) * RA + ((j + 1) % RA);
      idx.push(a, b, tip);
      idx.push(base + ((j + 1) % RA), base + j, rootC);
    }
  }
  const strandMesh = {
    positions: new Float32Array(pos),
    uvs: new Float32Array(uv),
    hairT: new Float32Array(ht),
    hairTan: new Float32Array(tan),
    ao: new Float32Array(aoA),
    index: new Uint32Array(idx),
  };
  computeNormals(strandMesh);

  // ---------------------------------------------------------------- hair cap
  const ha = 0.78, hb = 0.5;
  const pl = Math.hypot(1, ha);
  const capSdf = (x, y, z) => {
    const l = toL([x, y, z]);
    let d = head.local(l[0], l[1], l[2]) * hH - capOff;
    const hl = ((hb + ha * l[2] - l[1]) / pl) * hH;
    d = smax(d, hl, 0.025 * hH);
    for (const bl of bulbs) d = smin(d, sdEllipsoid(x - bl.c[0], y - bl.c[1], z - bl.c[2], bl.r[0], bl.r[1], bl.r[2]), 0.03 * hH);
    return d;
  };
  const ext = 0.75 * hH;
  const cb = [O[0] - ext, O[1] - 0.1 * hH, O[2] - ext, O[0] + ext, O[1] + 1.2 * hH, O[2] + ext];
  for (const bl of bulbs) {
    cb[0] = Math.min(cb[0], bl.c[0] - bl.r[0] * 1.3); cb[3] = Math.max(cb[3], bl.c[0] + bl.r[0] * 1.3);
    cb[1] = Math.min(cb[1], bl.c[1] - bl.r[1] * 1.3); cb[4] = Math.max(cb[4], bl.c[1] + bl.r[1] * 1.3);
    cb[2] = Math.min(cb[2], bl.c[2] - bl.r[2] * 1.3); cb[5] = Math.max(cb[5], bl.c[2] + bl.r[2] * 1.3);
  }
  const cap = fieldPart(new Field([custom(capSdf, cb, { k: 0 })]), Q.cap, Math.round(3000 * Q.mul), Q.cap * 0.2);
  {
    const nv = cap.positions.length / 3;
    cap.uvs = new Float32Array(nv * 2);
    cap.hairT = new Float32Array(nv);
    cap.hairTan = new Float32Array(nv * 3);
    cap.ao = new Float32Array(nv).fill(0.78);
    for (let v = 0; v < nv; v++) {
      const n = [cap.normals[v * 3], cap.normals[v * 3 + 1], cap.normals[v * 3 + 2]];
      const m = v3.norm(v3.sub([0, -1, 0], v3.mul(n, -n[1])));
      cap.hairTan.set(m, v * 3);
      const w = [cap.positions[v * 3], cap.positions[v * 3 + 1], cap.positions[v * 3 + 2]];
      const l = toL(w);
      cap.uvs[v * 2] = 5000 + ((Math.atan2(l[0], l[2] - Cc[2]) / TAU + 1) % 1) * 40;
      cap.uvs[v * 2 + 1] = localPhi(w);
    }
  }

  const hair = mergeMeshes([cap, strandMesh]);
  rigidWeights(hair, rig.idx.Head);
  const parts = [{ name: 'Hair', mat: 'hair', mesh: hair }];

  // ties
  const ties = [];
  for (const a2 of anchors) {
    const r = a2.kind === 'bun' ? a2.r * 0.55 : a2.r * 0.75;
    const c = a2.kind === 'bun' ? v3.add(a2.c, v3.mul(a2.n, -a2.r * 0.55)) : v3.add(a2.c, v3.mul(a2.n, a2.r * 0.25));
    ties.push(torus(c, a2.n, r, 0.018 * hH * p.tailVolume, 14, 8));
  }
  if (ties.length) {
    const tm = mergeMeshes(ties);
    rigidWeights(tm, rig.idx.Head);
    parts.push({ name: 'HairTies', mat: 'tie', mesh: tm });
  }

  // accessory placement map
  const om = new Float32Array(outerMap);
  for (let b = 0; b < PB; b++)
    for (let a = 0; a < TB; a++) {
      let m = outerMap[b * TB + a];
      for (let db = -1; db <= 1; db++)
        for (let da = -1; da <= 1; da++) m = Math.max(m, outerMap[clamp(b + db, 0, PB - 1) * TB + ((a + da + TB) % TB)] * 0.985);
      om[b * TB + a] = m;
    }
  const outer = (theta, phi, extra = 0) => {
    const a = Math.floor(((((theta % TAU) + TAU) % TAU) / TAU) * TB) % TB;
    const b = clamp(Math.floor((phi / Math.PI) * PB), 0, PB - 1);
    let Rr = om[b * TB + a];
    if (!Rr) Rr = v3.len(v3.sub(scalp(theta, Math.min(phi, PHMAX)).p, Cc)) + capOffL;
    const d = sph(theta, phi);
    return { p: toW(v3.add(Cc, v3.mul(d, Rr + extra / hH))), n: v3.norm(d) };
  };
  return { parts, capOff, anchors, outer };
}

function computeNormals(m) {
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

export function torus(c, axis, R, r, seg = 16, ring = 8) {
  const n = v3.norm(axis);
  const t1 = v3.norm(v3.cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const t2 = v3.cross(n, t1);
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    const dir = v3.add(v3.mul(t1, Math.cos(a)), v3.mul(t2, Math.sin(a)));
    const cc = v3.add(c, v3.mul(dir, R));
    for (let j = 0; j < ring; j++) {
      const b = (j / ring) * TAU;
      const nn = v3.add(v3.mul(dir, Math.cos(b)), v3.mul(n, Math.sin(b)));
      pos.push(...v3.add(cc, v3.mul(nn, r)));
      nrm.push(...nn);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j, b = ((i + 1) % seg) * ring + j, c2 = i * ring + ((j + 1) % ring), d = ((i + 1) % seg) * ring + ((j + 1) % ring);
      idx.push(a, b, c2, c2, b, d);
    }
  const m = { positions: new Float32Array(pos), normals: new Float32Array(nrm), index: new Uint32Array(idx) };
  // fix winding to match normals
  const P = m.positions, N = m.normals, I = m.index;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c2 = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c2] - P[a], vy = P[c2 + 1] - P[a + 1], vz = P[c2 + 2] - P[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * N[a] + fy * N[a + 1] + fz * N[a + 2] < 0) {
      const tmp = I[t + 1];
      I[t + 1] = I[t + 2];
      I[t + 2] = tmp;
    }
  }
  return m;
}
