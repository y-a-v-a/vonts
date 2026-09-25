import { type Polyline, type Vec, dist } from '../geometry/vec';

const sgnPow = (x: number, e: number): number => Math.sign(x) * Math.pow(Math.abs(x), e);

export interface ArcStyle {
  roundness: number;
  facets: number;
}

/** Point on a superellipse at parametric angle t (radians). */
export function superellipsePoint(cx: number, cy: number, rx: number, ry: number, t: number, n: number): Vec {
  const e = 2 / n;
  return { x: cx + rx * sgnPow(Math.cos(t), e), y: cy + ry * sgnPow(Math.sin(t), e) };
}

/**
 * Collects centerline strokes (open polylines, font units, y-up).
 * Consecutive calls extend the current stroke; `move` or `end` starts a new one.
 */
export class StrokePen {
  readonly strokes: Polyline[] = [];
  private cur: Polyline | null = null;

  constructor(private readonly style: ArcStyle) {}

  move(x: number, y: number): this {
    this.end();
    this.cur = [{ x, y }];
    return this;
  }

  line(x: number, y: number): this {
    if (!this.cur) this.cur = [{ x, y }];
    else this.cur.push({ x, y });
    return this;
  }

  /** A standalone polyline stroke. */
  poly(...pts: [number, number][]): this {
    this.end();
    pts.forEach(([x, y], i) => (i === 0 ? this.move(x, y) : this.line(x, y)));
    return this.end();
  }

  /**
   * Superellipse arc from a0 to a1 (degrees, counter-clockwise positive; a1 < a0 runs clockwise).
   * Connects to the current stroke with a straight line when it does not start where the stroke ends.
   */
  arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): this {
    const pts = this.style.facets > 0 ? this.facetedArc(cx, cy, rx, ry, a0, a1) : this.smoothArc(cx, cy, rx, ry, a0, a1);
    if (!this.cur) this.cur = [pts[0]];
    else if (dist(this.cur[this.cur.length - 1], pts[0]) > 0.5) this.cur.push(pts[0]);
    this.cur.push(...pts.slice(1));
    return this;
  }

  private smoothArc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Polyline {
    const sweep = a1 - a0;
    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / 4));
    const pts: Polyline = [];
    for (let i = 0; i <= steps; i++) {
      const t = ((a0 + (sweep * i) / steps) * Math.PI) / 180;
      pts.push(superellipsePoint(cx, cy, rx, ry, t, this.style.roundness));
    }
    return pts;
  }

  /**
   * Arc along a regular polygon with `facets` sides whose vertices sit half a step off the
   * axes (4 facets = a square, 6 = a flat-topped hexagon) and which is stretched to fill the
   * ellipse's bounding box. Vertices lie on a global angle grid so partial arcs of different
   * glyphs share the same facets.
   */
  private facetedArc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Polyline {
    const n = Math.max(3, Math.round(this.style.facets));
    const step = 360 / n;
    const offset = step / 2;
    let cmax = 0;
    let smax = 0;
    for (let k = 0; k < n; k++) {
      const t = ((offset + k * step) * Math.PI) / 180;
      cmax = Math.max(cmax, Math.abs(Math.cos(t)));
      smax = Math.max(smax, Math.abs(Math.sin(t)));
    }
    const vertex = (k: number): Vec => {
      const t = ((offset + k * step) * Math.PI) / 180;
      return { x: cx + (rx * Math.cos(t)) / cmax, y: cy + (ry * Math.sin(t)) / smax };
    };
    /** Point on the polygon boundary at polar-ish parameter a (degrees). */
    const at = (a: number): Vec => {
      const u = (a - offset) / step;
      const k = Math.floor(u);
      const f = u - k;
      const p = vertex(k);
      const q = vertex(k + 1);
      return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
    };
    const pts: Polyline = [at(a0)];
    const dir = Math.sign(a1 - a0) || 1;
    const eps = 1e-9;
    // Grid vertices strictly between a0 and a1, in drawing order.
    let k = dir > 0 ? Math.floor((a0 - offset) / step + eps) + 1 : Math.ceil((a0 - offset) / step - eps) - 1;
    for (;;) {
      const angle = offset + k * step;
      if (dir > 0 ? angle >= a1 - eps : angle <= a1 + eps) break;
      pts.push(vertex(k));
      k += dir;
    }
    pts.push(at(a1));
    return pts;
  }

  /** A dot (i, j): a tiny stroke that expands to the nib shape. */
  dot(x: number, y: number): this {
    this.end();
    this.strokes.push([
      { x: x - 0.5, y },
      { x: x + 0.5, y },
    ]);
    return this;
  }

  end(): this {
    if (this.cur && this.cur.length > 1) this.strokes.push(this.cur);
    this.cur = null;
    return this;
  }
}
