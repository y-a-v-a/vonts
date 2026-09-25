import { StrokePen } from './pen';
import { type StyleParams, FONT } from './style';

/**
 * Vertical and horizontal landmarks for one style. All "y" values are centerline
 * positions, already inset by half the stroke weight so the ink edges land on the
 * metric lines (baseline, x-height, cap height, ascender, descender).
 */
export interface Metrics {
  /** Half the stroke weight. */
  h: number;
  /** Baseline centerline. */
  bot: number;
  /** x-height centerline. */
  top: number;
  /** Cap-height centerline. */
  ct: number;
  /** Ascender centerline. */
  at: number;
  /** Descender centerline. */
  db: number;
  xHeight: number;
  /** Base widths (ink extent) for lowercase, capitals and figures. */
  w: number;
  W: number;
  D: number;
  waist: number;
}

export function metricsFor(style: StyleParams): Metrics {
  const h = style.weight / 2;
  const extra = style.weight * 0.9;
  return {
    h,
    bot: h,
    top: style.xHeight - h,
    ct: FONT.capHeight - h,
    at: FONT.ascenderLine - h,
    db: FONT.descenderLine + h,
    xHeight: style.xHeight,
    w: 360 * style.widthFactor + extra,
    W: 470 * style.widthFactor + extra,
    D: 400 * style.widthFactor + extra,
    waist: style.waist,
  };
}

/** Draws a glyph with the pen and returns its ink width. */
export type GlyphDef = (p: StrokePen, m: Metrics) => number;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Ellipse-ish bowl through the given centerline extents. */
function bowl(p: StrokePen, x0: number, x1: number, y0: number, y1: number, a0 = 0, a1 = 360): StrokePen {
  return p.arc((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, a0, a1);
}

/** D-shaped lobe attached to a stem at xL, spanning yT..yB and reaching xR. */
function lobe(p: StrokePen, xL: number, yT: number, yB: number, xR: number): void {
  const r = (yT - yB) / 2;
  const rx = Math.max(4, Math.min(r, xR - xL - 4));
  p.move(xL, yT).line(xR - rx, yT).arc(xR - rx, yB + r, rx, r, 90, -90).line(xL, yB).end();
}

/** n-style arch from a stem at x0 to x1, landing on the baseline. */
function arch(p: StrokePen, m: Metrics, x0: number, x1: number): void {
  const ra = (m.top - m.bot) * 0.45;
  p.arc((x0 + x1) / 2, m.top - ra, (x1 - x0) / 2, ra, 180, 0).line(x1, m.bot).end();
}

/** S spine shared by 's', 'S' (and the waist of '8'-like forms). */
function spine(p: StrokePen, width: number, h: number, bot: number, top: number, waist: number): void {
  const cx = width / 2;
  const rx = width / 2 - h;
  const mid = lerp(bot, top, waist);
  const ru = (top - mid) / 2;
  const rl = (mid - bot) / 2;
  p.arc(cx, mid + ru, rx * 0.94, ru, 25, 270).arc(cx, mid - rl, rx, rl, 90, -155).end();
}

const LOWER: Record<string, GlyphDef> = {
  a(p, m) {
    const { w, h, bot, top } = m;
    const ra = (top - bot) * 0.3;
    const ym = lerp(bot, top, 0.58);
    p.move(w - h, bot).line(w - h, top - ra).arc(w / 2, top - ra, w / 2 - h, ra, 0, 155).end();
    bowl(p, h, w - h, bot, ym).end();
    return w;
  },
  b(p, m) {
    const { w, h, bot, top, at } = m;
    p.poly([h, at], [h, bot]);
    bowl(p, h, w - h, bot, top).end();
    return w;
  },
  c(p, m) {
    const w = m.w * 0.92;
    bowl(p, m.h, w - m.h, m.bot, m.top, 50, 310).end();
    return w;
  },
  d(p, m) {
    const { w, h, bot, top, at } = m;
    bowl(p, h, w - h, bot, top).end();
    p.poly([w - h, at], [w - h, bot]);
    return w;
  },
  e(p, m) {
    const { w, h, bot, top } = m;
    const cy = (bot + top) / 2;
    p.move(h, cy).line(w - h, cy);
    bowl(p, h, w - h, bot, top, 0, 318).end();
    return w;
  },
  f(p, m) {
    const w = m.w * 0.62;
    const { h, bot, top, at } = m;
    const sx = h + (w - 2 * h) * 0.28;
    const rf = Math.max(10, (w - h - sx) / 1.6);
    p.move(sx, bot).line(sx, at - rf).arc(sx + rf, at - rf, rf, rf, 180, 55).end();
    p.poly([h, top], [w - h, top]);
    return w;
  },
  g(p, m) {
    const { w, h, bot, top, db } = m;
    const rg = (bot - db) * 0.62;
    const yg = db + rg;
    bowl(p, h, w - h, bot, top).end();
    p.move(w - h, top).line(w - h, yg).arc(w / 2, yg, w / 2 - h, rg, 0, -165).end();
    return w;
  },
  h(p, m) {
    p.poly([m.h, m.at], [m.h, m.bot]);
    arch(p, m, m.h, m.w - m.h);
    return m.w;
  },
  i(p, m) {
    const { h, bot, top } = m;
    p.poly([h, top], [h, bot]);
    p.dot(h, m.xHeight + Math.max(80, h * 2.4));
    return 2 * h;
  },
  j(p, m) {
    const { h, top, db } = m;
    const w = Math.max(m.w * 0.6, 2 * h + 90);
    const sx = w - h;
    const rj = (m.bot - db) * 0.55;
    p.move(sx, top).line(sx, db + rj).arc((sx + h) / 2, db + rj, (sx - h) / 2, rj, 0, -155).end();
    p.dot(sx, m.xHeight + Math.max(80, h * 2.4));
    return w;
  },
  k(p, m) {
    const w = m.w * 0.9;
    const { h, bot, top, at } = m;
    const jx = h;
    const jy = lerp(bot, top, 0.38);
    p.poly([h, at], [h, bot]);
    p.poly([w - h, top], [jx, jy]);
    p.poly([lerp(jx, w - h, 0.38), lerp(jy, top, 0.38)], [w - h, bot]);
    return w;
  },
  l(p, m) {
    p.poly([m.h, m.at], [m.h, m.bot]);
    return 2 * m.h;
  },
  m(p, m) {
    const w = m.w * 1.5;
    const mid = w / 2;
    p.poly([m.h, m.top], [m.h, m.bot]);
    arch(p, m, m.h, mid);
    arch(p, m, mid, w - m.h);
    return w;
  },
  n(p, m) {
    p.poly([m.h, m.top], [m.h, m.bot]);
    arch(p, m, m.h, m.w - m.h);
    return m.w;
  },
  o(p, m) {
    bowl(p, m.h, m.w - m.h, m.bot, m.top).end();
    return m.w;
  },
  p(p, m) {
    const { w, h, bot, top, db } = m;
    p.poly([h, top], [h, db]);
    bowl(p, h, w - h, bot, top).end();
    return w;
  },
  q(p, m) {
    const { w, h, bot, top, db } = m;
    bowl(p, h, w - h, bot, top).end();
    p.poly([w - h, top], [w - h, db]);
    return w;
  },
  r(p, m) {
    const w = m.w * 0.68;
    const { h, bot, top } = m;
    const ra = (top - bot) * 0.45;
    const rx = (w - 2 * h) / 1.35;
    p.poly([h, top], [h, bot]);
    p.arc(h + rx, top - ra, rx, ra, 180, 70).end();
    return w;
  },
  s(p, m) {
    const w = m.w * 0.85;
    spine(p, w, m.h, m.bot, m.top, m.waist);
    return w;
  },
  t(p, m) {
    const w = m.w * 0.62;
    const { h, bot, top } = m;
    const sx = h + (w - 2 * h) * 0.3;
    const rt = Math.max(10, Math.min((w - h - sx) * 0.8, 90));
    p.move(sx, lerp(m.xHeight, FONT.ascenderLine, 0.45)).line(sx, bot + rt).arc(sx + rt, bot + rt, rt, rt, 180, 290).end();
    p.poly([h, top], [w - h, top]);
    return w;
  },
  u(p, m) {
    const { w, h, bot, top } = m;
    const ra = (top - bot) * 0.45;
    p.move(h, top).line(h, bot + ra).arc(w / 2, bot + ra, w / 2 - h, ra, 180, 360).line(w - h, top).end();
    p.poly([w - h, top], [w - h, bot]);
    return w;
  },
  v(p, m) {
    p.poly([m.h, m.top], [m.w / 2, m.bot], [m.w - m.h, m.top]);
    return m.w;
  },
  w(p, m) {
    const w = m.w * 1.42;
    p.poly([m.h, m.top], [w * 0.27, m.bot], [w / 2, m.top], [w * 0.73, m.bot], [w - m.h, m.top]);
    return w;
  },
  x(p, m) {
    p.poly([m.h, m.top], [m.w - m.h, m.bot]);
    p.poly([m.w - m.h, m.top], [m.h, m.bot]);
    return m.w;
  },
  y(p, m) {
    const { w, h, bot, top, db } = m;
    const endX = w * 0.18;
    const t = (top - bot) / (top - db);
    const meetX = lerp(w - h, endX, t);
    p.poly([h, top], [meetX, bot]);
    p.poly([w - h, top], [endX, db]);
    return w;
  },
  z(p, m) {
    const w = m.w * 0.9;
    p.poly([m.h, m.top], [w - m.h, m.top], [m.h, m.bot], [w - m.h, m.bot]);
    return w;
  },
};

const UPPER: Record<string, GlyphDef> = {
  A(p, m) {
    const { W, h, bot, ct } = m;
    const yb = lerp(bot, ct, m.waist * 0.66);
    const t = (yb - bot) / (ct - bot);
    p.poly([h, bot], [W / 2, ct], [W - h, bot]);
    p.poly([lerp(h, W / 2, t), yb], [lerp(W - h, W / 2, t), yb]);
    return W;
  },
  B(p, m) {
    const { W, h, bot, ct } = m;
    const yM = lerp(bot, ct, m.waist + 0.04);
    p.poly([h, ct], [h, bot]);
    lobe(p, h, ct, yM, W * 0.9 - h);
    lobe(p, h, yM, bot, W - h);
    return W;
  },
  C(p, m) {
    bowl(p, m.h, m.W - m.h, m.bot, m.ct, 45, 315).end();
    return m.W;
  },
  D(p, m) {
    p.poly([m.h, m.ct], [m.h, m.bot]);
    lobe(p, m.h, m.ct, m.bot, m.W - m.h);
    return m.W;
  },
  E(p, m) {
    const w = m.W * 0.85;
    const yM = lerp(m.bot, m.ct, m.waist);
    p.poly([w - m.h, m.ct], [m.h, m.ct], [m.h, m.bot], [w - m.h, m.bot]);
    p.poly([m.h, yM], [w * 0.9 - m.h, yM]);
    return w;
  },
  F(p, m) {
    const w = m.W * 0.82;
    const yM = lerp(m.bot, m.ct, m.waist);
    p.poly([w - m.h, m.ct], [m.h, m.ct], [m.h, m.bot]);
    p.poly([m.h, yM], [w * 0.9 - m.h, yM]);
    return w;
  },
  G(p, m) {
    const { W, h, bot, ct } = m;
    bowl(p, h, W - h, bot, ct, 45, 360).line(W * 0.55, (bot + ct) / 2).end();
    return W;
  },
  H(p, m) {
    const { W, h, bot, ct } = m;
    const yM = lerp(bot, ct, m.waist);
    p.poly([h, ct], [h, bot]);
    p.poly([W - h, ct], [W - h, bot]);
    p.poly([h, yM], [W - h, yM]);
    return W;
  },
  I(p, m) {
    p.poly([m.h, m.ct], [m.h, m.bot]);
    return 2 * m.h;
  },
  J(p, m) {
    const w = m.W * 0.7;
    const { h, bot, ct } = m;
    const rj = (ct - bot) * 0.28;
    p.move(w - h, ct).line(w - h, bot + rj).arc(w / 2, bot + rj, w / 2 - h, rj, 0, -170).end();
    return w;
  },
  K(p, m) {
    const { W, h, bot, ct } = m;
    const jy = lerp(bot, ct, 0.38);
    p.poly([h, ct], [h, bot]);
    p.poly([W - h, ct], [h, jy]);
    p.poly([lerp(h, W - h, 0.38), lerp(jy, ct, 0.38)], [W - h, bot]);
    return W;
  },
  L(p, m) {
    const w = m.W * 0.8;
    p.poly([m.h, m.ct], [m.h, m.bot], [w - m.h, m.bot]);
    return w;
  },
  M(p, m) {
    const w = m.W * 1.25;
    p.poly([m.h, m.bot], [m.h, m.ct], [w / 2, lerp(m.bot, m.ct, 0.18)], [w - m.h, m.ct], [w - m.h, m.bot]);
    return w;
  },
  N(p, m) {
    p.poly([m.h, m.bot], [m.h, m.ct], [m.W - m.h, m.bot], [m.W - m.h, m.ct]);
    return m.W;
  },
  O(p, m) {
    const w = m.W * 1.12;
    bowl(p, m.h, w - m.h, m.bot, m.ct).end();
    return w;
  },
  P(p, m) {
    const yP = lerp(m.bot, m.ct, m.waist - 0.06);
    p.poly([m.h, m.ct], [m.h, m.bot]);
    lobe(p, m.h, m.ct, yP, m.W - m.h);
    return m.W;
  },
  Q(p, m) {
    const w = m.W * 1.12;
    bowl(p, m.h, w - m.h, m.bot, m.ct).end();
    p.poly([w * 0.55, lerp(m.bot, m.ct, 0.25)], [w - m.h, m.bot - 50]);
    return w;
  },
  R(p, m) {
    const yP = lerp(m.bot, m.ct, m.waist - 0.06);
    p.poly([m.h, m.ct], [m.h, m.bot]);
    lobe(p, m.h, m.ct, yP, m.W - m.h);
    p.poly([m.W * 0.45, yP], [m.W - m.h, m.bot]);
    return m.W;
  },
  S(p, m) {
    const w = m.W * 0.9;
    spine(p, w, m.h, m.bot, m.ct, m.waist);
    return w;
  },
  T(p, m) {
    p.poly([m.h, m.ct], [m.W - m.h, m.ct]);
    p.poly([m.W / 2, m.ct], [m.W / 2, m.bot]);
    return m.W;
  },
  U(p, m) {
    const { W, h, bot, ct } = m;
    const ru = (ct - bot) * 0.3;
    p.move(h, ct).line(h, bot + ru).arc(W / 2, bot + ru, W / 2 - h, ru, 180, 360).line(W - h, ct).end();
    return W;
  },
  V(p, m) {
    p.poly([m.h, m.ct], [m.W / 2, m.bot], [m.W - m.h, m.ct]);
    return m.W;
  },
  W(p, m) {
    const w = m.W * 1.45;
    p.poly([m.h, m.ct], [w * 0.27, m.bot], [w / 2, m.ct], [w * 0.73, m.bot], [w - m.h, m.ct]);
    return w;
  },
  X(p, m) {
    p.poly([m.h, m.ct], [m.W - m.h, m.bot]);
    p.poly([m.W - m.h, m.ct], [m.h, m.bot]);
    return m.W;
  },
  Y(p, m) {
    const yj = lerp(m.bot, m.ct, 0.45);
    p.poly([m.h, m.ct], [m.W / 2, yj], [m.W - m.h, m.ct]);
    p.poly([m.W / 2, yj], [m.W / 2, m.bot]);
    return m.W;
  },
  Z(p, m) {
    p.poly([m.h, m.ct], [m.W - m.h, m.ct], [m.h, m.bot], [m.W - m.h, m.bot]);
    return m.W;
  },
};

const DIGIT: Record<string, GlyphDef> = {
  '0'(p, m) {
    const w = m.D * 0.95;
    bowl(p, m.h, w - m.h, m.bot, m.ct).end();
    return w;
  },
  '1'(p, m) {
    const w = m.D * 0.7;
    const sx = w * 0.62;
    p.poly([m.h, lerp(m.bot, m.ct, 0.8)], [sx, m.ct], [sx, m.bot]);
    return w;
  },
  '2'(p, m) {
    const { D, h, bot, ct } = m;
    const r = (ct - bot) * 0.27;
    p.arc(D / 2, ct - r, D / 2 - h, r, 160, -35).line(h, bot).line(D - h, bot).end();
    return D;
  },
  '3'(p, m) {
    const { D, h, bot, ct } = m;
    const mid = lerp(bot, ct, 0.54);
    const r1 = (ct - mid) / 2;
    const r2 = (mid - bot) / 2;
    const rx = D / 2 - h;
    p.arc(D / 2, mid + r1, rx * 0.9, r1, 150, -90).arc(D / 2, mid - r2, rx, r2, 90, -150).end();
    return D;
  },
  '4'(p, m) {
    const { D, h, bot, ct } = m;
    const yb = lerp(bot, ct, 0.3);
    p.poly([D * 0.72, bot], [D * 0.72, ct], [h, yb], [D - h, yb]);
    return D;
  },
  '5'(p, m) {
    const { D, h, bot, ct } = m;
    const rb = (ct - bot) * 0.31;
    p.move(D * 0.9 - h, ct)
      .line(h + D * 0.08, ct)
      .line(h + D * 0.04, bot + 2 * rb + 10)
      .arc(D / 2, bot + rb, D / 2 - h, rb, 125, -150)
      .end();
    return D;
  },
  '6'(p, m) {
    const { D, h, bot, ct } = m;
    const rb = (ct - bot) * 0.3;
    const rx = D / 2 - h;
    p.arc(D / 2, (bot + ct) / 2, rx, (ct - bot) / 2, 60, 180)
      .arc(D / 2, bot + rb, rx, rb, 180, 540)
      .end();
    return D;
  },
  '7'(p, m) {
    p.poly([m.h, m.ct], [m.D - m.h, m.ct], [m.D * 0.38, m.bot]);
    return m.D;
  },
  '8'(p, m) {
    const { D, h, bot, ct } = m;
    const r1 = (ct - bot) * 0.23;
    const r2 = (ct - bot) * 0.27;
    const rx = D / 2 - h;
    p.arc(D / 2, ct - r1, rx * 0.86, r1, -90, 270).end();
    p.arc(D / 2, bot + r2, rx, r2, 90, 450).end();
    return D;
  },
  '9'(p, m) {
    const { D, h, bot, ct } = m;
    const rb = (ct - bot) * 0.3;
    const rx = D / 2 - h;
    p.arc(D / 2, ct - rb, rx, rb, 0, 360)
      .arc(D / 2, (bot + ct) / 2, rx, (ct - bot) / 2, 0, -120)
      .end();
    return D;
  },
};

export const SKELETONS: Readonly<Record<string, GlyphDef>> = { ...LOWER, ...UPPER, ...DIGIT };

/** Characters whose shape reaches into the descender. */
export const DESCENDERS = new Set(['g', 'j', 'p', 'q', 'y']);
/** Characters whose shape reaches the ascender line. */
export const ASCENDERS = new Set(['b', 'd', 'f', 'h', 'k', 'l', 't']);
