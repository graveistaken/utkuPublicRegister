// Anime hair: SDF hair cap + volumetric tapered strand clumps draped with collisions.
import { Field } from './mesher.js';
import { custom, ellipsoid, smax, smin, sdEllipsoid, rng, lerp, clamp, v3 } from './sdf.js';
import { fieldPart, rigidWeights, mergeMeshes } from './partkit.js';

const TAU = Math.PI * 2;

export function buildHair(rig, p, head, bodyField, Q) {
  const hH = rig.hH;
  const O = head.O;
  const R = rng(p.seed * 7919 + 13);
  const jit = (a) => (R() * 2 - 1) * a;
  const vol = p.volume;
  const spiky = p.spikiness;
  const capOff = 0.028 * vol * hH;
  const Cc = head.cranium.c; // local
  const toW = (l) => [O[0] + l[0] * hH, O[1] + l[1] * hH, O[2] + l[2] * hH];

  // collision: head + upper body
  const bodyColl = new Field(bodyField.prims.filter((q) => ['torso', 'neck', 'breast', 'trap', 'shoulder', 'butt'].includes(q.tag)));
  const bodyBox = bodyColl.bounds();
  const tails = p.tails;
  const anchors = [];
  const sph = (theta, phi) => [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];

  // surface point of the head along a direction from the cranium centre (local units)
  const surf = (theta, phi) => {
    const d = sph(theta, phi);
    let t = 0.9;
    for (let i = 0; i < 80; i++) {
      const q = [Cc[0] + d[0] * t, Cc[1] + d[1] * t, Cc[2] + d[2] * t];
      const sd = head.local(q[0], q[1], q[2]);
      if (Math.abs(sd) < 0.0008) break;
      t -= sd;
    }
    return toW([Cc[0] + d[0] * t, Cc[1] + d[1] * t, Cc[2] + d[2] * t]);
  };
  const grad = (f, x, y, z, e = 0.0015) => {
    const g = [f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)];
    return v3.norm(g);
  };

  // ---------- tails / buns anchors ----------
  const bulbs = []; // extra hair volumes added to the cap field: {c:[world], r:[...]}
  const tailHeight = p.tailHeight;
  if (tails === 'ponytail') {
    const phi = lerp(2.05, 0.95, tailHeight);
    anchors.push({ theta: Math.PI, phi, kind: 'tail' });
  } else if (tails === 'twin') {
    const phi = lerp(1.75, 0.85, tailHeight);
    anchors.push({ theta: 2.05, phi, kind: 'tail', side: 1 }, { theta: -2.05, phi, kind: 'tail', side: -1 });
  } else if (tails === 'side') {
    const s = p.partX >= 0 ? 1 : -1;
    anchors.push({ theta: s * 1.95, phi: lerp(1.75, 1.0, tailHeight), kind: 'tail', side: s });
  } else if (tails === 'bun') {
    anchors.push({ theta: Math.PI, phi: lerp(1.75, 0.45, tailHeight), kind: 'bun' });
  } else if (tails === 'twinbun') {
    const phi = lerp(1.2, 0.55, tailHeight);
    anchors.push({ theta: 2.0, phi, kind: 'bun', side: 1 }, { theta: -2.0, phi, kind: 'bun', side: -1 });
  }
  for (const a of anchors) {
    const s = surf(a.theta, a.phi);
    const lc = head.toLocal(...s);
    const n = v3.norm(v3.sub(lc, Cc));
    a.n = n; // outward (local == world orientation)
    const tv = p.tailVolume;
    if (a.kind === 'bun') {
      const r = 0.15 * tv * hH;
      a.c = v3.add(s, v3.mul(n, r * 0.75 + capOff));
      a.r = r;
      bulbs.push({ c: a.c, r: [r, r * 0.92, r] });
    } else {
      const r = 0.075 * tv * hH;
      a.c = v3.add(s, v3.mul(n, capOff + r * 0.5));
      a.r = r;
      bulbs.push({ c: a.c, r: [r * 1.1, r, r * 1.1] });
    }
  }

  const collide = (x, y, z) => {
    let d = head.sdf(x, y, z) - capOff * 0.92;
    if (y < bodyBox[4] + 0.05) d = Math.min(d, bodyColl.eval(x, y, z) - 0.008);
    for (const b of bulbs) d = Math.min(d, sdEllipsoid(x - b.c[0], y - b.c[1], z - b.c[2], b.r[0], b.r[1], b.r[2]) - 0.002);
    return d;
  };

  // ---------- strand generation ----------
  const strands = [];
  const S = (o) => strands.push(o);
  const sw = p.strandWidth;
  const grav0 = lerp(0.42, 0.12, spiky);
  const partX = p.partX;

  // A) bangs
  if (p.bangs !== 'none') {
    const n = Math.round(p.bangsCount);
    const span = 1.05;
    for (let i = 0; i < n; i++) {
      let u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      let theta = u * span + jit(0.04);
      let phi = 0.5 + 0.28 * Math.abs(u) ** 1.5;
      let L = (0.3 + 0.36 * p.bangsLen) * (1 + 0.55 * Math.abs(u) ** 2.2);
      let W = (0.9 / n) * sw * (1 + jit(0.12));
      let dir = [Math.sin(theta) * 0.5, 0.15, Math.cos(theta)];
      let grav = lerp(0.42, 0.3, spiky);
      let flip = p.tipFlip * 0.4;
      if (p.bangs === 'straight') {
        L *= 1 + jit(0.05);
      } else if (p.bangs === 'swept') {
        const s = partX >= 0 ? -1 : 1;
        dir = v3.add(dir, [s * 0.9, 0, 0]);
        L *= 1 + 0.25 * (u * s) + jit(0.06);
        theta += -s * 0.15;
      } else if (p.bangs === 'split') {
        const s = u === 0 ? 1 : Math.sign(u);
        dir = v3.add(dir, [s * 0.9, 0, 0]);
        theta += s * 0.18;
        L *= 1 + 0.2 * Math.abs(u) + jit(0.06);
      } else if (p.bangs === 'spiky') {
        L *= 1 + jit(0.22) - 0.1;
        W *= 1.2;
        grav *= 0.7;
        dir = v3.add(dir, [jit(0.3), jit(0.15), 0]);
      }
      L *= 1 + jit(0.25) * spiky;
      S({ root: surf(theta, phi), dir, L, W, grav, stiff: 1.0, flip, theta, group: 'bangs', blunt: p.hairStyle === 'hime' ? 1 : 0 });
    }
    // fill strands between hairline and bangs (top-front)
    for (let i = 0; i < Math.ceil(n * 0.6); i++) {
      const u = (i / Math.max(1, Math.ceil(n * 0.6) - 1)) * 2 - 1;
      const theta = u * 0.85 + jit(0.05);
      S({ root: surf(theta, 0.25), dir: [Math.sin(theta) * 0.4, 0, 1], L: 0.42 + 0.2 * p.bangsLen, W: 0.13 * sw, grav: grav0 * 0.6, stiff: 1, flip: 0, theta, group: 'top' });
    }
  }

  // B) side locks
  if (p.sideLen > 0.04) {
    for (const sg of [1, -1]) {
      const cnt = 3;
      for (let i = 0; i < cnt; i++) {
        const theta = sg * (1.2 + i * 0.22 + jit(0.04));
        const phi = 0.82 + i * 0.1;
        const L = (0.32 + p.sideLen * 0.95) * (1 - i * 0.08) * (1 + jit(0.08 + 0.2 * spiky));
        S({ root: surf(theta, phi), dir: [sg * 0.15, -1, 0.25], L, W: 0.1 * sw * (1 + jit(0.1)), grav: 0.6, stiff: 0.9, flip: p.tipFlip * 0.6, theta, group: 'side', blunt: p.hairStyle === 'hime' && i === 0 ? 1 : 0 });
      }
    }
  }

  // C) back & sides mass
  {
    const gathered = tails === 'ponytail' || tails === 'bun';
    const nb = Math.round(lerp(10, 15, clamp((vol - 0.4) / 1.4, 0, 1)));
    const th0 = 1.35;
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < nb; i++) {
        const u = (i + (layer ? 0.5 : 0)) / nb;
        const theta = th0 + u * (TAU - 2 * th0) + jit(0.05);
        const phi = layer === 0 ? 0.42 + jit(0.06) : 0.82 + jit(0.06);
        let L = layer === 0 ? 0.55 + p.backLen * 1.3 : 0.4 + p.backLen * 1.3;
        L *= 1 + jit(0.08 + 0.25 * spiky);
        const dir = [Math.sin(theta) * 0.6, -0.6 + spiky * spiky * 1.6 * (layer ? 0.6 : 1), Math.cos(theta) * 0.6];
        let attract = null;
        if (gathered) {
          attract = anchors[0].c;
          const dist = v3.len(v3.sub(attract, surf(theta, phi))) / hH;
          L = Math.min(L, dist * 1.05);
        }
        S({ root: surf(theta, phi), dir, L, W: (layer ? 0.15 : 0.17) * sw * (1 + jit(0.15)), grav: grav0 * (layer ? 1.2 : 1), stiff: 1, flip: p.tipFlip, theta, group: 'back', attract });
      }
    }
    // crown radiating clumps
    const nc = 6;
    const crown = [partX * 0.12, 0, 0];
    for (let i = 0; i < nc; i++) {
      const theta = (i / nc) * TAU + jit(0.15);
      if (Math.cos(theta) > 0.55 && p.bangs !== 'none') continue;
      const dir = [Math.sin(theta) + crown[0], -0.3 + spiky * spiky * 2.0, Math.cos(theta)];
      S({ root: surf(theta, 0.2 + jit(0.05)), dir, L: 0.36 + jit(0.06), W: 0.15 * sw, grav: grav0 * 0.5, stiff: 1, flip: 0, theta, group: 'crown' });
    }
  }

  // D) ahoge
  if (p.ahoge) {
    S({ root: surf(0.35, 0.16), dir: [0.2, 1, 0.9], L: 0.34, W: 0.042 * sw, grav: -0.05, stiff: 1, flip: 0, curl: 2.4, theta: 0.3, group: 'ahoge' });
  }

  // E) tails
  for (const a of anchors) {
    if (a.kind === 'tail') {
      const n = Math.round(8 * Math.sqrt(p.tailVolume)) + 2;
      const out = a.n;
      const up = a.side ? [a.side * 0.9, 0.25, -0.35] : [0, 0.35, -1];
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU;
        // ring around the anchor perpendicular to outward normal
        const t1 = v3.norm(v3.cross(out, [0, 1, 0.01]));
        const t2 = v3.cross(out, t1);
        const rr = a.r * 0.55;
        const root = v3.add(a.c, v3.add(v3.mul(t1, Math.cos(ang) * rr), v3.mul(t2, Math.sin(ang) * rr)));
        const dir = v3.norm(v3.add(v3.add(out, up), v3.add(v3.mul(t1, Math.cos(ang) * 0.35), v3.mul(t2, Math.sin(ang) * 0.35))));
        const L = (0.9 + p.tailLen * 1.5) * (1 + jit(0.1));
        S({ root, dir, L, W: 0.12 * p.tailVolume * sw * (1 + jit(0.15)), grav: 0.95 * (1 - 0.4 * spiky), stiff: 1, flip: p.tipFlip * 0.6, theta: ang, group: 'tail', free: true, wave: 0.6 });
      }
    } else if (a.kind === 'bun') {
      // short wrapped clumps on the bun
      const n = 6;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU;
        const out = a.n;
        const t1 = v3.norm(v3.cross(out, [0, 1, 0.01]));
        const t2 = v3.cross(out, t1);
        const root = v3.add(a.c, v3.mul(out, a.r * 0.2));
        const dir = v3.norm(v3.add(v3.mul(t1, Math.cos(ang)), v3.mul(t2, Math.sin(ang))));
        S({ root, dir, L: 0.32 * p.tailVolume, W: 0.06 * p.tailVolume, grav: 0.0, stiff: 1, flip: 0, theta: ang, group: 'bun', free: true, wrap: a });
      }
    }
  }

  // ---------- integrate strands ----------
  const SEG = Q.seg;
  const RING = Q.ring;
  const meshes = [];
  const pos = [], nrm = [], uv = [], ht = [], idx = [];
  const localPhi = (x, y, z) => {
    const l = head.toLocal(x, y, z);
    const d = v3.norm(v3.sub(l, Cc));
    return [(Math.atan2(d[0], d[2]) / TAU + 1) % 1, Math.acos(clamp(d[1], -1, 1)) / Math.PI];
  };

  // outer hair surface map in cranium-centred spherical coords (for placing accessories)
  const TB = 48, PB = 24;
  const outerMap = new Float32Array(TB * PB);
  const capR = (l) => v3.len(v3.sub(l, Cc));
  const bin = (l) => {
    const d = v3.norm(v3.sub(l, Cc));
    const th = (Math.atan2(d[0], d[2]) + TAU) % TAU;
    const ph = Math.acos(clamp(d[1], -1, 1));
    return [Math.min(TB - 1, Math.floor((th / TAU) * TB)), Math.min(PB - 1, Math.floor((ph / Math.PI) * PB))];
  };
  const mark = (wp, extra) => {
    const l = head.toLocal(wp[0], wp[1], wp[2]);
    const [a, b] = bin(l);
    const r = capR(l) + extra / hH;
    if (r > outerMap[b * TB + a]) outerMap[b * TB + a] = r;
  };
  // cap baseline
  for (let b = 0; b < PB; b++)
    for (let a = 0; a < TB; a++) {
      const sp = surf(((a + 0.5) / TB) * TAU, ((b + 0.5) / PB) * Math.PI);
      mark(sp, capOff);
    }

  for (const st of strands) {
    const N = st.group === 'ahoge' || st.group === 'crown' || st.group === 'top' || st.group === 'bun' ? Math.max(6, Math.round(SEG * 0.6)) : SEG;
    const Lw = st.L * hH;
    const ds = Lw / N;
    const W = st.W * hH * (1 + 0.22 * Math.max(0, st.L - 0.9));
    const thick = (t) => {
      const w = width(t);
      return Math.max(w * 0.34, 0.0006);
    };
    const width = (t) => {
      if (st.blunt) return W * (t < 0.88 ? 1 - 0.1 * t : (1 - t) / 0.12 * 0.9 + 0.02);
      const ts = clamp(0.22 + 0.16 * st.L, 0.3, 0.62);
      const e = clamp((t - ts) / (1 - ts), 0, 1);
      const sm = e * e * (3 - 2 * e);
      return W * (1 + 0.14 * Math.sin(Math.PI * t)) * Math.pow(1 - sm, 0.8);
    };
    let P = st.root.slice();
    // push root into the cap slightly
    const g0 = grad(head.sdf, P[0], P[1], P[2]);
    if (!st.free) P = v3.add(P, v3.mul(g0, capOff * 0.35));
    let d = v3.norm(st.dir);
    if (!st.free) {
      // project initial direction onto tangent plane
      d = v3.norm(v3.sub(d, v3.mul(g0, v3.dot(d, g0) * 0.92 * (1 - 0.65 * spiky * (st.group === "back" || st.group === "crown" ? 1 : 0.4)))));
    }
    const pts = [P];
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      d = v3.norm(v3.add(v3.mul(d, st.stiff), [0, -st.grav * (0.35 + t), 0]));
      if (st.attract) d = v3.norm(v3.add(d, v3.mul(v3.norm(v3.sub(st.attract, P)), 0.9)));
      if (st.curl) {
        const side = v3.norm(v3.cross(d, [1, 0, 0]));
        d = v3.norm(v3.add(d, v3.mul(side, st.curl * 0.18)));
      }
      if (st.wrap) {
        const toC = v3.sub(st.wrap.c, P);
        d = v3.norm(v3.add(d, v3.mul(v3.norm(toC), 0.55)));
      }
      if (t > 0.6 && st.flip) {
        const out = grad(collide, P[0], P[1], P[2]);
        d = v3.norm(v3.add(d, v3.mul(out, st.flip * 0.35)));
      }
      let q = v3.add(P, v3.mul(d, ds));
      const clear = thick(t) * 0.55 + 0.0008;
      for (let k = 0; k < 3; k++) {
        const c = collide(q[0], q[1], q[2]) - clear;
        if (c >= 0) break;
        const n = grad(collide, q[0], q[1], q[2]);
        q = v3.sub(q, v3.mul(n, c));
      }
      // keep segment length
      d = v3.norm(v3.sub(q, P));
      q = v3.add(P, v3.mul(d, ds));
      pts.push(q);
      P = q;
    }
    // frames
    const T = [], Nn = [], B = [];
    for (let i = 0; i <= N; i++) {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, N)];
      T.push(v3.norm(v3.sub(b, a)));
      let g = grad(collide, pts[i][0], pts[i][1], pts[i][2], 0.003);
      if (st.free && i > 2) g = v3.lerp(g, Nn[i - 1], 0.6);
      // hanging locks: turn the flat side toward the viewer (anime style)
      const below = clamp((O[1] + 0.25 * hH - pts[i][1]) / (0.3 * hH), 0, 1);
      if (st.group === 'side') g = v3.norm(v3.lerp(g, [Math.sin(st.theta) * 0.25, 0, 1], 0.35 + 0.5 * below));
      else if (st.group === 'back' && below > 0) {
        const rad = [Math.sin(st.theta), 0, Math.cos(st.theta)];
        const tgt = v3.norm(v3.add(rad, [0, 0, Math.cos(st.theta) >= 0 ? 0.7 : -0.7]));
        g = v3.norm(v3.lerp(g, tgt, 0.55 * below));
      }
      g = v3.sub(g, v3.mul(T[i], v3.dot(g, T[i])));
      Nn.push(v3.norm(g));
    }
    for (let it = 0; it < 2; it++)
      for (let i = 1; i < N; i++) {
        const s = v3.norm(v3.add(v3.add(Nn[i - 1], Nn[i + 1]), v3.mul(Nn[i], 2)));
        Nn[i] = v3.norm(v3.sub(s, v3.mul(T[i], v3.dot(s, T[i]))));
      }
    for (let i = 0; i <= N; i++) B.push(v3.norm(v3.cross(T[i], Nn[i])));
    // wave
    const wave = (st.wave ?? 1) * p.wave;
    if (wave > 0.001) {
      const ph = R() * TAU;
      const freq = 2.2 + R();
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const a = Math.sin(t * freq * TAU + ph) * wave * 0.05 * hH * Math.min(1, t * 2.5);
        pts[i] = v3.add(pts[i], v3.mul(B[i], a));
      }
    }
    if (st.group !== 'tail' && st.group !== 'ahoge') for (let i = 0; i < N; i++) mark(pts[i], thick(i / N) * 1.3);
    // build tube
    const base = pos.length / 3;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const w = width(t), th = thick(t);
      const [u0, phiU] = localPhi(...pts[i]);
      for (let j = 0; j < RING; j++) {
        const a = (j / RING) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        const ty = sa > 0 ? 1 : 0.5;
        const cx = ca * w, cy = sa * th * ty + th * 0.15;
        const vp = v3.add(pts[i], v3.add(v3.mul(B[i], cx), v3.mul(Nn[i], cy)));
        pos.push(...vp);
        const nn = v3.norm(v3.add(v3.mul(B[i], ca / Math.max(w, 1e-5)), v3.mul(Nn[i], (sa / Math.max(th * ty, 1e-5)))));
        nrm.push(...nn);
        uv.push(u0 + (j / RING) * 0.01, phiU);
        ht.push(t);
      }
    }
    // tip
    const tip = base + N * RING;
    pos.push(...pts[N]);
    nrm.push(...T[N]);
    const [ut, pt] = localPhi(...pts[N]);
    uv.push(ut, pt);
    ht.push(1);
    // root cap centre
    const rootC = tip + 1;
    pos.push(...pts[0]);
    nrm.push(...v3.mul(T[0], -1));
    uv.push(...localPhi(...pts[0]));
    ht.push(0);
    for (let i = 0; i < N - 1; i++)
      for (let j = 0; j < RING; j++) {
        const a = base + i * RING + j, b = base + i * RING + ((j + 1) % RING);
        const c = a + RING, e = b + RING;
        idx.push(a, c, b, b, c, e);
      }
    for (let j = 0; j < RING; j++) {
      const a = base + (N - 1) * RING + j, b = base + (N - 1) * RING + ((j + 1) % RING);
      idx.push(a, tip, b);
      idx.push(base + ((j + 1) % RING), rootC, base + j);
    }
  }
  // orientation check of tube winding (outward normals) is by construction: (a,c,b) with ring CCW around T
  const strandMesh = {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    uvs: new Float32Array(uv),
    hairT: new Float32Array(ht),
    index: new Uint32Array(idx),
  };
  fixWinding(strandMesh);

  // ---------- hair cap ----------
  const a = 0.78, b = 0.5;
  const pl = Math.hypot(1, a);
  const capSdf = (x, y, z) => {
    const l = head.toLocal(x, y, z);
    let d = head.local(l[0], l[1], l[2]) * hH - capOff;
    // hairline
    const hl = ((b + a * l[2] - l[1]) / pl) * hH;
    d = smax(d, hl, 0.025 * hH);
    for (const bl of bulbs) d = smin(d, sdEllipsoid(x - bl.c[0], y - bl.c[1], z - bl.c[2], bl.r[0], bl.r[1], bl.r[2]), 0.03 * hH);
    return d;
  };
  const ext = 0.75 * hH;
  let cb = [O[0] - ext, O[1] - 0.1 * hH, O[2] - ext, O[0] + ext, O[1] + 1.2 * hH, O[2] + ext];
  for (const bl of bulbs) {
    cb[0] = Math.min(cb[0], bl.c[0] - bl.r[0] * 1.3); cb[3] = Math.max(cb[3], bl.c[0] + bl.r[0] * 1.3);
    cb[1] = Math.min(cb[1], bl.c[1] - bl.r[1] * 1.3); cb[4] = Math.max(cb[4], bl.c[1] + bl.r[1] * 1.3);
    cb[2] = Math.min(cb[2], bl.c[2] - bl.r[2] * 1.3); cb[5] = Math.max(cb[5], bl.c[2] + bl.r[2] * 1.3);
  }
  const capField = new Field([custom(capSdf, cb, { k: 0 })]);
  const cap = fieldPart(capField, Q.cap, Math.round(3500 * Q.mul), Q.cap * 0.2);
  {
    const nv = cap.positions.length / 3;
    cap.uvs = new Float32Array(nv * 2);
    cap.hairT = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const [u, ph] = localPhi(cap.positions[v * 3], cap.positions[v * 3 + 1], cap.positions[v * 3 + 2]);
      cap.uvs[v * 2] = u;
      cap.uvs[v * 2 + 1] = ph;
    }
  }

  const hair = mergeMeshes([cap, strandMesh]);
  rigidWeights(hair, rig.idx.Head);

  const parts = [{ name: 'Hair', mat: 'hair', mesh: hair }];

  // ties for tails / buns
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
  // dilate map a little so accessories sit on top of neighbouring strands too
  const om = new Float32Array(outerMap);
  for (let b = 0; b < PB; b++)
    for (let a = 0; a < TB; a++) {
      let m = outerMap[b * TB + a];
      for (let db = -1; db <= 1; db++)
        for (let da = -1; da <= 1; da++) {
          const bb = clamp(b + db, 0, PB - 1), aa = (a + da + TB) % TB;
          m = Math.max(m, outerMap[bb * TB + aa] * 0.985);
        }
      om[b * TB + a] = m;
    }
  // world point on the outer hair surface
  const outer = (theta, phi, extra = 0) => {
    const a = Math.floor((((theta % TAU) + TAU) % TAU) / TAU * TB) % TB;
    const b = clamp(Math.floor((phi / Math.PI) * PB), 0, PB - 1);
    const R = om[b * TB + a];
    const d = sph(theta, phi);
    const l = [Cc[0] + d[0] * (R + extra / hH), Cc[1] + d[1] * (R + extra / hH), Cc[2] + d[2] * (R + extra / hH)];
    return { p: toW(l), n: v3.norm(d) };
  };
  return { parts, capOff, anchors, outer };
}

// make every triangle face along its vertex normals
function fixWinding(m) {
  const P = m.positions, N = m.normals, I = m.index;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const s = nx * (N[a] + N[b] + N[c]) + ny * (N[a + 1] + N[b + 1] + N[c + 1]) + nz * (N[a + 2] + N[b + 2] + N[c + 2]);
    if (s < 0) {
      const tmp = I[t + 1];
      I[t + 1] = I[t + 2];
      I[t + 2] = tmp;
    }
  }
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
  fixWinding(m);
  return m;
}
