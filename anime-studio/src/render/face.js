// Procedural anime face painter (eyes, brows, mouth, blush) on a 2D canvas.
// Canvas maps head-local coords: x in [-0.5,0.5] -> [0,S], y in [-0.06,0.94] -> [S,0].

const EYE_STYLES = {
  //          inner corner     top point        outer corner    bottom          lidTop (sleepiness)
  round: { iy: 0.05, top: [-0.05, -1.0], oy: -0.28, bot: [0.08, 0.98], lid: 0, irisY: 0.1, wing: 0.8, crease: 1 },
  sharp: { iy: 0.18, top: [0.1, -0.88], oy: -0.62, bot: [0.0, 0.78], lid: 0.12, irisY: 0.14, wing: 1.1, crease: 1 },
  droopy: { iy: -0.12, top: [-0.12, -1.0], oy: 0.12, bot: [0.12, 0.98], lid: 0, irisY: 0.1, wing: 0.6, crease: 1 },
  sleepy: { iy: 0.1, top: [0.0, -0.62], oy: -0.18, bot: [0.06, 0.92], lid: 0.38, irisY: 0.18, wing: 0.7, crease: 0.6 },
  cat: { iy: 0.24, top: [0.15, -0.86], oy: -0.8, bot: [-0.05, 0.8], lid: 0.08, irisY: 0.1, wing: 1.4, crease: 1 },
  shonen: { iy: 0.1, top: [0.15, -0.72], oy: -0.4, bot: [0.0, 0.62], lid: 0.12, irisY: 0.1, wing: 0.4, crease: 0.4 },
};

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb(c, a = 1) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function shade(c, f) {
  return [c[0] * f, c[1] * f, c[2] * f];
}
function lighten(c, t) {
  return mix(c, [255, 255, 255], t);
}

export class FacePainter {
  constructor(size = 2048) {
    this.S = size;
    const mk = (n) => {
      const c = document.createElement('canvas');
      c.width = c.height = n;
      return c;
    };
    this.base = mk(size); // skin, brows, mouth, blush (shared by open/closed)
    this.iris = mk(size); // sclera + iris, sampled with parallax
    this.ovOpen = mk(size); // lid shadow, highlights, lashes
    this.ovClosed = mk(size); // closed-eye lines
    this.mask = mk(size / 2); // where the iris layer is visible
    this._flat = {};
  }

  draw(p) {
    const S = this.S;
    const bc = this.base.getContext('2d');
    const ic = this.iris.getContext('2d');
    const oo = this.ovOpen.getContext('2d');
    const oc = this.ovClosed.getContext('2d');
    const mc = this.mask.getContext('2d');
    for (const c of [ic, oo, oc]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, S, S);
      c.lineCap = 'round';
      c.lineJoin = 'round';
    }
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.clearRect(0, 0, S, S);
    mc.setTransform(0.5, 0, 0, 0.5, 0, 0);
    this._draw(bc, p, { iris: ic, ov: oo, mask: mc, closed: oc });
    this._flat = {};
  }

  // flattened face (for export / fallback)
  flat(closed) {
    const key = closed ? 'c' : 'o';
    if (this._flat[key]) return this._flat[key];
    const S = this.S;
    const out = document.createElement('canvas');
    out.width = out.height = S;
    const x = out.getContext('2d');
    x.drawImage(this.base, 0, 0);
    if (!closed) {
      const t = document.createElement('canvas');
      t.width = t.height = S;
      const tx = t.getContext('2d');
      tx.drawImage(this.iris, 0, 0);
      tx.globalCompositeOperation = 'destination-in';
      tx.drawImage(this.mask, 0, 0, S, S);
      x.drawImage(t, 0, 0);
    }
    x.drawImage(closed ? this.ovClosed : this.ovOpen, 0, 0);
    this._flat[key] = out;
    return out;
  }
  get open() {
    return this.flat(false);
  }
  get closed() {
    return this.flat(true);
  }

  L(x, y) {
    return [(x + 0.5) * this.S, (1 - (y + 0.06)) * this.S];
  }

  _draw(ctx, p, layers) {
    const S = this.S;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = p.skin;
    ctx.fillRect(0, 0, S, S);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const skin = hexToRgb(p.skin);
    const skinShade = hexToRgb(p.skinShade);
    const lash = hexToRgb(p.lashColor);
    const browC = hexToRgb(p.browFromHair ? p.hairColor : p.browColor);

    // ---- blush ----
    if (p.blush > 0.01) {
      const bc = hexToRgb(p.blushColor);
      for (const sg of [-1, 1]) {
        const [cx, cy] = this.L(sg * 0.2 * (0.9 + 0.1 * p.eyeSpacing), 0.25 + p.eyeY * 0.03);
        const rx = 0.085 * S, ry = 0.04 * S;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, rgb(bc, 0.55 * p.blush));
        g.addColorStop(0.55, rgb(bc, 0.3 * p.blush));
        g.addColorStop(1, rgb(bc, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (p.blushLines) {
          ctx.strokeStyle = rgb(shade(bc, 0.85), 0.75 * Math.min(1, p.blush * 1.6));
          ctx.lineWidth = S * 0.0035;
          for (let i = -1; i <= 1; i++) {
            const x = cx + i * S * 0.022;
            ctx.beginPath();
            ctx.moveTo(x + S * 0.008, cy - S * 0.014);
            ctx.lineTo(x - S * 0.008, cy + S * 0.014);
            ctx.stroke();
          }
        }
      }
    }

    // ---- freckles ----
    if (p.freckles > 0.01) {
      let seed = 1234;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      ctx.fillStyle = rgb(shade(skinShade, 0.8), 0.55 * p.freckles);
      for (let i = 0; i < 40 * p.freckles; i++) {
        const sg = rnd() < 0.5 ? -1 : 1;
        const [x, y] = this.L(sg * (0.06 + rnd() * 0.15), 0.27 + rnd() * 0.06);
        ctx.beginPath();
        ctx.arc(x, y, S * (0.002 + rnd() * 0.002), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- nose ----
    if (p.noseLine && p.noseSize > 0.05) {
      const [nx, ny] = this.L(0.006, 0.265 + p.noseHeight * 0.05);
      ctx.strokeStyle = rgb(shade(skinShade, 0.85), 0.75);
      ctx.lineWidth = S * 0.0035;
      ctx.beginPath();
      ctx.moveTo(nx - S * 0.004, ny - S * 0.006);
      ctx.lineTo(nx + S * 0.006, ny + S * 0.002);
      ctx.stroke();
    }

    // ---- mouth ----
    this._mouth(ctx, p, skinShade);

    // ---- eyes & brows ----
    const st = EYE_STYLES[p.eyeStyle] || EYE_STYLES.round;
    for (const sg of [-1, 1]) {
      const ex = sg * 0.165 * p.eyeSpacing;
      const ey = 0.405 + p.eyeY * 0.05;
      const [cx, cy] = this.L(ex, ey);
      const w = 0.09 * p.eyeWidth * p.eyeSize * S;
      const h = 0.1 * p.eyeHeight * p.eyeSize * S * (p.eyeStyle === 'shonen' ? 0.8 : 1);
      const iris = {
        top: hexToRgb(p.hetero && sg > 0 ? p.irisTop2 : p.irisTop),
        bot: hexToRgb(p.hetero && sg > 0 ? p.irisBottom2 : p.irisBottom),
      };
      // sg>0 is canvas right = character's left eye; outer corner = +x for sg>0
      this._brow(ctx, p, sg, cx, cy, w, h, browC);
      this._closedEye(layers.closed, p, st, sg, cx, cy, w, h, lash);
      this._eye(layers, p, st, sg, cx, cy, w, h, iris, lash, skinShade);
    }

    // ---- mole ----
    if (p.mole) {
      const [mx, my] = this.L(0.2 * p.eyeSpacing, 0.31 + p.eyeY * 0.05);
      ctx.fillStyle = rgb(shade(lash, 1.2), 0.9);
      ctx.beginPath();
      ctx.arc(mx, my, S * 0.0042, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // eye outline path points in local eye coords (+x = outer corner, y down)
  _shape(st, p, w, h) {
    const tilt = p.eyeTilt * 0.35;
    const I = [-w, st.iy * h + tilt * h];
    const O = [w * 1.02, st.oy * h - tilt * h];
    const T = [st.top[0] * w, st.top[1] * h];
    const Bt = [st.bot[0] * w, st.bot[1] * h];
    return { I, O, T, Bt };
  }

  _upperPath(ctx, s) {
    const { I, O, T } = s;
    // two cubic segments through T
    ctx.moveTo(I[0], I[1]);
    ctx.bezierCurveTo(I[0] + (T[0] - I[0]) * 0.1, I[1] + (T[1] - I[1]) * 0.85, T[0] - (T[0] - I[0]) * 0.55, T[1], T[0], T[1]);
    ctx.bezierCurveTo(T[0] + (O[0] - T[0]) * 0.5, T[1], O[0] - (O[0] - T[0]) * 0.12, O[1] + (T[1] - O[1]) * 0.55, O[0], O[1]);
  }
  _lowerPath(ctx, s, fromO = true) {
    const { I, O, Bt } = s;
    if (fromO) {
      ctx.bezierCurveTo(O[0] - (O[0] - Bt[0]) * 0.05, O[1] + (Bt[1] - O[1]) * 0.75, Bt[0] + (O[0] - Bt[0]) * 0.55, Bt[1], Bt[0], Bt[1]);
      ctx.bezierCurveTo(Bt[0] - (Bt[0] - I[0]) * 0.6, Bt[1], I[0] + (Bt[0] - I[0]) * 0.05, I[1] + (Bt[1] - I[1]) * 0.6, I[0], I[1]);
    }
  }

  _eye(Lx, p, st, sg, cx, cy, w, h, iris, lash, skinShade) {
    const S = this.S;
    const s = this._shape(st, p, w, h);
    const ctx = Lx.ov, ic = Lx.iris, mk = Lx.mask;
    const prep = (c) => {
      c.save();
      c.translate(cx, cy);
      c.scale(sg, 1);
    };
    const eyePath = (c) => {
      c.beginPath();
      this._upperPath(c, s);
      this._lowerPath(c, s);
      c.closePath();
    };
    // mask (where the iris layer shows through)
    prep(mk);
    eyePath(mk);
    mk.fillStyle = '#ffffff';
    mk.fill();
    mk.restore();

    // iris layer: sclera colour over a generous area + iris (sampled with parallax in the shader)
    prep(ic);
    const scl = hexToRgb(p.sclera);
    const sg2 = ic.createRadialGradient(0, h * 0.2, w * 0.2, 0, h * 0.2, w * 1.3);
    sg2.addColorStop(0, rgb(scl));
    sg2.addColorStop(1, rgb(mix(scl, skinShade, 0.35)));
    ic.fillStyle = sg2;
    ic.fillRect(-w * 1.6, -h * 1.6, w * 3.2, h * 3.2);
    // iris
    const irx = w * 0.6 * p.irisSize * (p.eyeStyle === 'shonen' ? 0.85 : 1);
    const iry = h * 0.92 * p.irisSize;
    const icx = w * 0.0, icy = h * st.irisY;
    ic.save();
    ic.translate(icx, icy);
    ic.scale(sg, 1); // undo mirror so gradients/highlights are consistent
    const grd = ic.createLinearGradient(0, -iry, 0, iry);
    grd.addColorStop(0, rgb(shade(iris.top, 0.55)));
    grd.addColorStop(0.35, rgb(iris.top));
    grd.addColorStop(0.75, rgb(mix(iris.top, iris.bot, 0.75)));
    grd.addColorStop(1, rgb(lighten(iris.bot, 0.15)));
    ic.fillStyle = grd;
    ic.beginPath();
    ic.ellipse(0, 0, irx, iry, 0, 0, Math.PI * 2);
    ic.fill();
    // lower glow crescent
    const glow = ic.createRadialGradient(0, iry * 0.55, 0, 0, iry * 0.55, irx * 1.05);
    glow.addColorStop(0, rgb(lighten(iris.bot, 0.45), 0.85));
    glow.addColorStop(1, rgb(iris.bot, 0));
    ic.fillStyle = glow;
    ic.beginPath();
    ic.ellipse(0, iry * 0.35, irx * 0.82, iry * 0.6, 0, 0, Math.PI * 2);
    ic.fill();
    // radial texture lines
    ic.strokeStyle = rgb(shade(iris.top, 0.6), 0.35);
    ic.lineWidth = S * 0.0016;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      ic.beginPath();
      ic.moveTo(Math.cos(a) * irx * 0.35, Math.sin(a) * iry * 0.35);
      ic.lineTo(Math.cos(a) * irx * 0.85, Math.sin(a) * iry * 0.85);
      ic.stroke();
    }
    // pupil
    const pr = p.pupilSize;
    if (p.pupilShape !== 'none' && pr > 0.01) {
      ic.fillStyle = rgb(shade(iris.top, 0.28));
      ic.beginPath();
      if (p.pupilShape === 'slit') ic.ellipse(0, -iry * 0.04, irx * 0.12 * pr, iry * 0.62 * Math.min(pr, 1.2), 0, 0, Math.PI * 2);
      else if (p.pupilShape === 'star') this._star(ic, 0, -iry * 0.05, irx * 0.42 * pr, irx * 0.17 * pr, 5);
      else if (p.pupilShape === 'heart') this._heart(ic, 0, -iry * 0.05, irx * 0.5 * pr);
      else ic.ellipse(0, -iry * 0.06, irx * 0.36 * pr, iry * 0.42 * pr, 0, 0, Math.PI * 2);
      ic.fill();
    }
    // iris rim
    ic.strokeStyle = rgb(shade(iris.top, 0.45), 0.9);
    ic.lineWidth = S * 0.004;
    ic.beginPath();
    ic.ellipse(0, 0, irx, iry, 0, 0, Math.PI * 2);
    ic.stroke();
    ic.restore();

    ic.restore();

    // overlay: lid shadow + highlights clipped to the eye, then crease and lashes
    prep(ctx);
    eyePath(ctx);
    ctx.save();
    ctx.clip();
    // upper lid shadow on sclera + iris
    const sh = ctx.createLinearGradient(0, s.T[1], 0, s.T[1] + h * 0.85);
    const shc = mix(shade(hexToRgb(p.irisTop), 0.6), skinShade, 0.4);
    sh.addColorStop(0, rgb(shc, 0.75));
    sh.addColorStop(0.45, rgb(shc, 0.28));
    sh.addColorStop(1, rgb(shc, 0));
    ctx.fillStyle = sh;
    ctx.fillRect(-w * 2, -h * 2, w * 4, h * 4);

    // highlights (not mirrored: light from upper-left of the screen)
    ctx.save();
    ctx.translate(icx, icy);
    ctx.scale(sg, 1);
    const hl = p.highlight;
    if (p.highlightStyle !== 'none' && hl > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${0.95 * hl})`;
      if (p.highlightStyle === 'soft') {
        const g = ctx.createRadialGradient(-irx * 0.35, -iry * 0.4, 0, -irx * 0.35, -iry * 0.4, irx * 0.6);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * hl})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(-irx * 0.35, -iry * 0.4, irx * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(-irx * 0.36, -iry * 0.36, irx * 0.3, iry * 0.22, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(irx * 0.38, iry * 0.42, irx * 0.13, iry * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.7 * hl})`;
        ctx.beginPath();
        ctx.arc(irx * 0.1, -iry * 0.55, irx * 0.07, 0, Math.PI * 2);
        ctx.fill();
        if (p.highlightStyle === 'sparkle') {
          ctx.fillStyle = `rgba(255,255,255,${hl})`;
          this._star(ctx, irx * 0.4, -iry * 0.1, irx * 0.22, irx * 0.05, 4);
          ctx.fill();
          this._star(ctx, -irx * 0.3, iry * 0.45, irx * 0.12, irx * 0.03, 4);
          ctx.fill();
        }
      }
    }
    ctx.restore();
    ctx.restore(); // end clip

    // double eyelid crease
    if (st.crease > 0) {
      ctx.strokeStyle = rgb(shade(skinShade, 0.8), 0.65 * st.crease);
      ctx.lineWidth = S * 0.0032;
      ctx.beginPath();
      const { I, T, O } = s;
      const lift = h * 0.2;
      ctx.moveTo(I[0] + w * 0.35, I[1] - lift * 1.6 - h * 0.15);
      ctx.quadraticCurveTo(T[0] + w * 0.2, T[1] - lift * 1.4, O[0] - w * 0.08, O[1] - lift * 1.2);
      ctx.stroke();
    }

    // upper lash line (filled band thicker toward the outer side)
    const lt = p.lashThick;
    const lw = S * 0.0095 * lt;
    ctx.fillStyle = rgb(lash);
    ctx.beginPath();
    {
      const { I, O, T } = s;
      // outer edge (top of the band)
      ctx.moveTo(I[0] - w * 0.04, I[1] + h * 0.02);
      ctx.bezierCurveTo(I[0] + (T[0] - I[0]) * 0.1, I[1] + (T[1] - I[1]) * 0.85 - lw * 0.5, T[0] - (T[0] - I[0]) * 0.55, T[1] - lw * 0.9, T[0], T[1] - lw * 1.0);
      ctx.bezierCurveTo(T[0] + (O[0] - T[0]) * 0.5, T[1] - lw * 1.15, O[0] - (O[0] - T[0]) * 0.1, O[1] + (T[1] - O[1]) * 0.55 - lw * 1.2, O[0] + w * 0.06, O[1] - lw * 0.6);
      // wing
      const wing = p.lashWing * st.wing;
      if (wing > 0.02) {
        ctx.lineTo(O[0] + w * (0.06 + 0.3 * wing), O[1] - lw * 0.2 - h * 0.28 * wing);
        ctx.lineTo(O[0] + w * 0.12, O[1] + lw * 0.35);
      }
      ctx.lineTo(O[0] + w * 0.02, O[1] + lw * 0.5);
      // inner edge (bottom of the band) following lid
      ctx.bezierCurveTo(O[0] - (O[0] - T[0]) * 0.12, O[1] + (T[1] - O[1]) * 0.55 + lw * 0.2, T[0] + (O[0] - T[0]) * 0.5, T[1] + lw * 0.35, T[0], T[1] + lw * 0.25);
      ctx.bezierCurveTo(T[0] - (T[0] - I[0]) * 0.55, T[1] + lw * 0.2, I[0] + (T[0] - I[0]) * 0.1, I[1] + (T[1] - I[1]) * 0.85 + lw * 0.1, I[0] + w * 0.02, I[1] + h * 0.05);
      ctx.closePath();
    }
    ctx.fill();
    // lash spikes at outer corner
    if (p.lashWing > 0.05) {
      const { O, T } = s;
      for (let i = 0; i < 2; i++) {
        const bx = O[0] - w * (0.12 + i * 0.22), by = O[1] + (T[1] - O[1]) * (0.35 + i * 0.35) - lw * 0.6;
        ctx.beginPath();
        ctx.moveTo(bx - w * 0.06, by + lw * 0.3);
        ctx.quadraticCurveTo(bx + w * 0.05, by - h * 0.12, bx + w * 0.16 * p.lashWing, by - h * 0.22 * p.lashWing);
        ctx.quadraticCurveTo(bx + w * 0.04, by - h * 0.02, bx + w * 0.06, by + lw * 0.3);
        ctx.closePath();
        ctx.fill();
      }
    }
    // lower lash
    if (p.lowerLash) {
      const { O, Bt } = s;
      ctx.strokeStyle = rgb(lash, 0.85);
      ctx.lineWidth = S * 0.0035 * lt;
      ctx.beginPath();
      ctx.moveTo(O[0] - w * 0.02, O[1] + h * 0.12);
      ctx.bezierCurveTo(O[0] - (O[0] - Bt[0]) * 0.1, O[1] + (Bt[1] - O[1]) * 0.75, Bt[0] + (O[0] - Bt[0]) * 0.55, Bt[1] + lw * 0.2, Bt[0] - w * 0.05, Bt[1] + lw * 0.25);
      ctx.stroke();
      // small tick
      ctx.lineWidth = S * 0.003 * lt;
      ctx.beginPath();
      ctx.moveTo(Bt[0] + w * 0.4, Bt[1] - h * 0.02);
      ctx.lineTo(Bt[0] + w * 0.46, Bt[1] + h * 0.14);
      ctx.stroke();
    }
    ctx.restore();
  }

  _closedEye(ctx, p, st, sg, cx, cy, w, h, lash) {
    const S = this.S;
    const s = this._shape(st, p, w, h);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sg, 1);
    const y = (s.I[1] + s.O[1]) * 0.5 + h * 0.25;
    ctx.strokeStyle = rgb(lash);
    ctx.lineWidth = S * 0.0075 * p.lashThick;
    ctx.beginPath();
    ctx.moveTo(s.I[0], s.I[1] + h * 0.2);
    ctx.quadraticCurveTo(0, y + h * 0.45, s.O[0], s.O[1] + h * 0.35);
    ctx.stroke();
    if (p.lashWing > 0.05) {
      ctx.lineWidth = S * 0.005 * p.lashThick;
      ctx.beginPath();
      ctx.moveTo(s.O[0] - w * 0.05, s.O[1] + h * 0.33);
      ctx.lineTo(s.O[0] + w * 0.22 * p.lashWing, s.O[1] + h * 0.15);
      ctx.stroke();
    }
    ctx.restore();
  }

  _brow(ctx, p, sg, cx, cy, w, h, c) {
    const S = this.S;
    const style = p.browStyle;
    const by = cy - h * 1.3 - p.browY * S * 0.035;
    const ang = p.browAngle * 0.25 + (style === 'angry' ? 0.28 : style === 'worried' ? -0.3 : 0);
    const len = w * 1.05;
    const th = S * 0.008 * p.browThick * (style === 'thick' ? 1.7 : style === 'soft' ? 0.85 : 1.05);
    ctx.save();
    ctx.translate(cx + sg * w * 0.05, by);
    ctx.scale(sg, 1);
    ctx.rotate(-ang);
    const arch = style === 'straight' || style === 'angry' ? h * 0.08 : h * 0.22;
    ctx.fillStyle = rgb(shade(c, 0.85));
    ctx.beginPath();
    // inner end thicker (x<0), tapering toward outer end (x>0)
    ctx.moveTo(-len * 0.8, th * 0.5);
    ctx.quadraticCurveTo(0, -arch - th * 0.6, len * 0.95, th * 0.2 - arch * 0.1);
    ctx.quadraticCurveTo(0, -arch + th * 0.75, -len * 0.8, th * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _mouth(ctx, p, skinShade) {
    const S = this.S;
    const [mx, my] = this.L(0, 0.158 + p.mouthY * 0.04);
    const mw = 0.04 * p.mouthWidth * S;
    const lineC = rgb(shade(mix(hexToRgb(p.lipColor), skinShade, 0.3), 0.55));
    const inner = hexToRgb(p.lipColor);
    ctx.strokeStyle = lineC;
    ctx.lineWidth = S * 0.0045;
    const m = p.mouth;
    ctx.save();
    ctx.translate(mx, my);
    if (m === 'smile') {
      ctx.beginPath();
      ctx.moveTo(-mw, -mw * 0.12);
      ctx.quadraticCurveTo(0, mw * 0.55, mw, -mw * 0.12);
      ctx.stroke();
    } else if (m === 'neutral') {
      ctx.beginPath();
      ctx.moveTo(-mw * 0.6, 0);
      ctx.quadraticCurveTo(0, mw * 0.08, mw * 0.6, 0);
      ctx.stroke();
    } else if (m === 'cat') {
      ctx.beginPath();
      ctx.moveTo(-mw * 1.0, -mw * 0.15);
      ctx.quadraticCurveTo(-mw * 0.5, mw * 0.55, 0, -mw * 0.05);
      ctx.quadraticCurveTo(mw * 0.5, mw * 0.55, mw * 1.0, -mw * 0.15);
      ctx.stroke();
    } else if (m === 'pout') {
      ctx.beginPath();
      ctx.moveTo(-mw * 0.55, mw * 0.12);
      ctx.quadraticCurveTo(0, -mw * 0.25, mw * 0.55, mw * 0.12);
      ctx.stroke();
    } else if (m === 'smug') {
      ctx.beginPath();
      ctx.moveTo(-mw * 0.8, 0);
      ctx.quadraticCurveTo(mw * 0.2, mw * 0.25, mw * 0.9, -mw * 0.3);
      ctx.stroke();
    } else if (m === 'o') {
      ctx.fillStyle = rgb(shade(inner, 0.7));
      ctx.beginPath();
      ctx.ellipse(0, mw * 0.15, mw * 0.32, mw * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (m === 'open' || m === 'fang') {
      // D-shaped open mouth
      ctx.beginPath();
      ctx.moveTo(-mw, -mw * 0.1);
      ctx.quadraticCurveTo(0, -mw * 0.22, mw, -mw * 0.1);
      ctx.quadraticCurveTo(mw * 0.7, mw * 0.95, 0, mw * 0.95);
      ctx.quadraticCurveTo(-mw * 0.7, mw * 0.95, -mw, -mw * 0.1);
      ctx.closePath();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = rgb(shade(inner, 0.75));
      ctx.fillRect(-mw * 2, -mw * 2, mw * 4, mw * 4);
      // tongue
      ctx.fillStyle = rgb(lighten(inner, 0.3));
      ctx.beginPath();
      ctx.ellipse(0, mw * 0.95, mw * 0.6, mw * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      if (m === 'fang') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(mw * 0.35, -mw * 0.2);
        ctx.lineTo(mw * 0.62, -mw * 0.2);
        ctx.lineTo(mw * 0.5, mw * 0.22);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.lineWidth = S * 0.004;
      ctx.stroke();
    }
    ctx.restore();
  }

  _star(ctx, x, y, R, r, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r : R;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  _heart(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.6);
    ctx.bezierCurveTo(x - s * 1.1, y - s * 0.1, x - s * 0.5, y - s * 0.95, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 0.95, x + s * 1.1, y - s * 0.1, x, y + s * 0.6);
    ctx.closePath();
  }
}
