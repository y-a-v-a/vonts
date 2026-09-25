import ClipperLib from 'clipper-lib';
import { type Polyline, signedArea, simplify } from '../geometry/vec';
import type { StyleParams } from '../glyphs/style';

/** Clipper works on integers; keep a quarter-unit precision. */
const S = 4;
const NIB_SIDES = 16;

type IntPath = { X: number; Y: number }[];

const toInt = (pl: Polyline): IntPath => pl.map((p) => ({ X: Math.round(p.x * S), Y: Math.round(p.y * S) }));
const fromInt = (path: IntPath): Polyline => path.map((p) => ({ x: p.X / S, y: p.Y / S }));

export type NibStyle = Pick<StyleParams, 'weight' | 'contrast' | 'nibAngle' | 'nibShape'>;

/** The pen tip as a closed polygon (font units, centred on the origin). */
export function nibPolygon(nib: NibStyle): Polyline {
  const a = nib.weight / 2;
  const b = Math.max(1, a * (1 - nib.contrast));
  const rot = (nib.nibAngle * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const local: Polyline =
    nib.nibShape === 'square'
      ? [
          { x: -a, y: -b },
          { x: a, y: -b },
          { x: a, y: b },
          { x: -a, y: b },
        ]
      : Array.from({ length: NIB_SIDES }, (_, i) => {
          const t = (i / NIB_SIDES) * Math.PI * 2;
          return { x: a * Math.cos(t), y: b * Math.sin(t) };
        });
  return local.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
}

/**
 * Expand centerline strokes into filled outline contours (union of all strokes).
 * Monoline strokes use Clipper's offsetter; contrasted strokes sweep a nib polygon
 * (Minkowski sum), which gives calligraphic thick/thin modulation.
 * Result: outer contours counter-clockwise, holes clockwise (y-up), as fonts expect.
 */
export function strokesToOutline(strokes: Polyline[], nib: NibStyle): Polyline[] {
  const paths = strokes.filter((s) => s.length > 1).map(toInt);
  if (!paths.length) return [];
  let solution: IntPath[] = [];

  if (nib.nibShape === 'round') {
    // An elliptical nib is a disk under the linear map A = R(angle) * diag(1, b/a).
    // Minkowski sums commute with linear maps, so: stroke = A( A^-1(path) (+) disk ).
    // This keeps the exact calligraphic result while using Clipper's fast round offset.
    const a = nib.weight / 2;
    const k = Math.max(0.05, 1 - nib.contrast);
    const rot = (nib.nibAngle * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const inv = (p: { x: number; y: number }) => {
      const x = p.x * cos + p.y * sin;
      const y = -p.x * sin + p.y * cos;
      return { x, y: y / k };
    };
    const fwd = (p: { x: number; y: number }) => {
      const y = p.y * k;
      return { x: p.x * cos - y * sin, y: p.x * sin + y * cos };
    };
    const co = new ClipperLib.ClipperOffset(2, 0.2 * S);
    co.AddPaths(
      strokes.filter((s) => s.length > 1).map((s) => toInt(s.map(inv))),
      ClipperLib.JoinType.jtRound,
      ClipperLib.EndType.etOpenRound,
    );
    co.Execute(solution, a * S);
    solution = solution.map((path) => toInt(fromInt(path).map(fwd)));
  } else if (nib.contrast < 0.04) {
    const co = new ClipperLib.ClipperOffset(2, 0.2 * S);
    co.AddPaths(paths, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etOpenSquare);
    co.Execute(solution, (nib.weight / 2) * S);
  } else {
    const pattern = toInt(nibPolygon(nib));
    // Minkowski cost scales with vertices x nib sides, so thin out the centerlines first.
    const lean = strokes.filter((s) => s.length > 1).map((s) => toInt(simplify(s, 0.5)));
    solution = ClipperLib.Clipper.MinkowskiSum(pattern, lean, false) as IntPath[];
    // Pattern copies at each end fill the stroke caps; union them in.
    const c = new ClipperLib.Clipper();
    c.AddPaths(solution, ClipperLib.PolyType.ptSubject, true);
    for (const path of lean)
      for (const pt of [path[0], path[path.length - 1]])
        c.AddPath(
          pattern.map((q) => ({ X: q.X + pt.X, Y: q.Y + pt.Y })),
          ClipperLib.PolyType.ptClip,
          true,
        );
    const merged: IntPath[] = [];
    c.Execute(ClipperLib.ClipType.ctUnion, merged, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    solution = merged;
  }

  solution = ClipperLib.Clipper.CleanPolygons(solution, 0.3 * S) as IntPath[];
  return solution
    .filter((p) => p.length >= 3)
    .map(fromInt)
    .filter((p) => Math.abs(signedArea(p)) > 1);
}

/** Outer contours CCW / holes CW, determined by nesting depth. */
export function normalizeWinding(contours: Polyline[]): Polyline[] {
  return contours.map((c, i) => {
    const depth = contours.reduce((d, other, j) => (j !== i && containsPoint(other, c[0]) ? d + 1 : d), 0);
    const wantCCW = depth % 2 === 0;
    const isCCW = signedArea(c) > 0;
    return wantCCW === isCCW ? c : c.slice().reverse();
  });
}

function containsPoint(poly: Polyline, p: { x: number; y: number }): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function contoursToSvgD(contours: Polyline[]): string {
  const f = (n: number) => Math.round(n * 10) / 10;
  return contours.map((c) => 'M' + c.map((p) => `${f(p.x)} ${f(p.y)}`).join('L') + 'Z').join('');
}
