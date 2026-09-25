import type { Polyline } from './vec';

/** Closed polygons to SVG path data (one decimal). */
export function contoursToSvgD(contours: Polyline[]): string {
  const f = (n: number) => Math.round(n * 10) / 10;
  return contours.map((c) => 'M' + c.map((p) => `${f(p.x)} ${f(p.y)}`).join('L') + 'Z').join('');
}
