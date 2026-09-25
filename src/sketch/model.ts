import { type Vec, type Polyline, dist } from '../geometry/vec';
import { flattenCubic } from '../geometry/bezier';

/** An anchor point with optional absolute-position Bézier handles. */
export interface Anchor {
  x: number;
  y: number;
  hin: Vec | null;
  hout: Vec | null;
}

export interface SketchPath {
  id: string;
  anchors: Anchor[];
  closed: boolean;
}

export interface SketchDoc {
  paths: SketchPath[];
}

/** The sketch pad uses a 1000x1000 y-down coordinate space. */
export const PAD_SIZE = 1000;

export interface Segment {
  p0: Vec;
  c1: Vec;
  c2: Vec;
  p3: Vec;
  /** true when neither end has a handle: a straight line. */
  straight: boolean;
}

let idCounter = 0;
export const newId = (): string => `p${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export const emptyDoc = (): SketchDoc => ({ paths: [] });

export const anchor = (x: number, y: number, hin: Vec | null = null, hout: Vec | null = null): Anchor => ({ x, y, hin, hout });

export function cloneDoc(doc: SketchDoc): SketchDoc {
  return JSON.parse(JSON.stringify(doc)) as SketchDoc;
}

export function segments(path: SketchPath): Segment[] {
  const out: Segment[] = [];
  const n = path.anchors.length;
  const count = path.closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = path.anchors[i];
    const b = path.anchors[(i + 1) % n];
    const c1 = a.hout ?? { x: a.x, y: a.y };
    const c2 = b.hin ?? { x: b.x, y: b.y };
    out.push({ p0: { x: a.x, y: a.y }, c1, c2, p3: { x: b.x, y: b.y }, straight: !a.hout && !b.hin });
  }
  return out;
}

export function pathToPolyline(path: SketchPath, maxStep = 6): Polyline {
  if (path.anchors.length === 0) return [];
  const first = path.anchors[0];
  const pts: Polyline = [{ x: first.x, y: first.y }];
  for (const s of segments(path)) {
    if (s.straight) pts.push(s.p3);
    else pts.push(...flattenCubic(s.p0, s.c1, s.c2, s.p3, maxStep));
  }
  return pts;
}

export function docToPolylines(doc: SketchDoc, maxStep = 6): Polyline[] {
  return doc.paths.filter((p) => p.anchors.length > 1).map((p) => pathToPolyline(p, maxStep));
}

export function isDocEmpty(doc: SketchDoc): boolean {
  return !doc.paths.some((p) => p.anchors.length > 1);
}

const f = (n: number): string => (Math.round(n * 100) / 100).toString();

export function pathToSvgD(path: SketchPath): string {
  if (path.anchors.length === 0) return '';
  const a0 = path.anchors[0];
  let d = `M${f(a0.x)} ${f(a0.y)}`;
  for (const s of segments(path)) {
    d += s.straight
      ? ` L${f(s.p3.x)} ${f(s.p3.y)}`
      : ` C${f(s.c1.x)} ${f(s.c1.y)} ${f(s.c2.x)} ${f(s.c2.y)} ${f(s.p3.x)} ${f(s.p3.y)}`;
  }
  if (path.closed) d += ' Z';
  return d;
}

/** Translate an anchor together with its handles. */
export function moveAnchor(a: Anchor, dx: number, dy: number): void {
  a.x += dx;
  a.y += dy;
  if (a.hin) a.hin = { x: a.hin.x + dx, y: a.hin.y + dy };
  if (a.hout) a.hout = { x: a.hout.x + dx, y: a.hout.y + dy };
}

/** Anchors whose handles are collinear with the anchor are "smooth" and move as a pair. */
export function isSmooth(a: Anchor, toleranceDeg = 4): boolean {
  if (!a.hin || !a.hout) return false;
  const ax = a.hin.x - a.x;
  const ay = a.hin.y - a.y;
  const bx = a.hout.x - a.x;
  const by = a.hout.y - a.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-6 || lb < 1e-6) return false;
  const cos = (ax * bx + ay * by) / (la * lb);
  return cos < -Math.cos((toleranceDeg * Math.PI) / 180);
}

export function hitAnchor(doc: SketchDoc, p: Vec, radius: number): { pathIndex: number; anchorIndex: number } | null {
  let best: { pathIndex: number; anchorIndex: number } | null = null;
  let bestD = radius;
  doc.paths.forEach((path, pi) =>
    path.anchors.forEach((a, ai) => {
      const d = dist(a, p);
      if (d <= bestD) {
        bestD = d;
        best = { pathIndex: pi, anchorIndex: ai };
      }
    }),
  );
  return best;
}

/** Plain-data validation so imported / stored documents can be trusted. */
export function isSketchDoc(value: unknown): value is SketchDoc {
  if (!value || typeof value !== 'object') return false;
  const paths = (value as SketchDoc).paths;
  if (!Array.isArray(paths)) return false;
  const isVec = (h: unknown) => h === null || (typeof h === 'object' && Number.isFinite((h as Vec).x) && Number.isFinite((h as Vec).y));
  return paths.every(
    (p) =>
      p &&
      typeof p.closed === 'boolean' &&
      Array.isArray(p.anchors) &&
      p.anchors.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y) && isVec(a.hin) && isVec(a.hout)),
  );
}
