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
    const sweep = a1 - a0;
    const { roundness, facets } = this.style;
    const steps =
      facets > 0 ? Math.max(1, Math.round((facets * Math.abs(sweep)) / 360)) : Math.max(2, Math.ceil(Math.abs(sweep) / 4));
    const pts: Polyline = [];
    for (let i = 0; i <= steps; i++) {
      const t = ((a0 + (sweep * i) / steps) * Math.PI) / 180;
      pts.push(superellipsePoint(cx, cy, rx, ry, t, roundness));
    }
    if (!this.cur) this.cur = [pts[0]];
    else if (dist(this.cur[this.cur.length - 1], pts[0]) > 0.5) this.cur.push(pts[0]);
    this.cur.push(...pts.slice(1));
    return this;
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
