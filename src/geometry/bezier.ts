import { type Vec, type Polyline, dist, distToSegment } from './vec';

export function cubicAt(p0: Vec, c1: Vec, c2: Vec, p3: Vec, t: number): Vec {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p3.x, y: a * p0.y + b * c1.y + c * c2.y + d * p3.y };
}

/** True when the control points sit (almost) on the chord, i.e. the cubic is visually a line. */
export function isFlat(p0: Vec, c1: Vec, c2: Vec, p3: Vec, tolerance = 0.5): boolean {
  return distToSegment(c1, p0, p3) <= tolerance && distToSegment(c2, p0, p3) <= tolerance;
}

/**
 * Flatten a cubic Bézier into a polyline (excluding the start point) by uniform
 * subdivision whose step count scales with the control-polygon length.
 */
export function flattenCubic(p0: Vec, c1: Vec, c2: Vec, p3: Vec, maxStep = 6): Polyline {
  if (isFlat(p0, c1, c2, p3)) return [p3];
  const ctrlLen = dist(p0, c1) + dist(c1, c2) + dist(c2, p3);
  const n = Math.min(200, Math.max(4, Math.ceil(ctrlLen / maxStep)));
  const out: Polyline = [];
  for (let i = 1; i <= n; i++) out.push(cubicAt(p0, c1, c2, p3, i / n));
  return out;
}
