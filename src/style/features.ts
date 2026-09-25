import { type Vec, type Polyline, dist, sub, len, clamp, bbox, polylineLength } from '../geometry/vec';
import { type SketchDoc, type SketchPath, segments, pathToPolyline, PAD_SIZE } from '../sketch/model';
import { DEFAULT_STYLE, type StyleParams } from '../glyphs/style';

/** Measurements taken from the user's drawing. All angles in degrees. */
export interface SketchFeatures {
  empty: boolean;
  /** Share of ink length that is curved (0..1). */
  curviness: number;
  /** Mean handle length relative to chord for curved segments (~0.78 for circular arcs). */
  tension: number;
  /** Share of junctions (anchors between two segments) that are sharp corners. */
  cornerRatio: number;
  /** Median turning angle at sharp corners. */
  cornerAngle: number;
  /** Lean of near-vertical strokes; positive = top leans right. */
  slant: number;
  /** Dominant stroke direction (0..180) and how dominant it is (0..1). */
  direction: number;
  directionStrength: number;
  /** Zig-zag-ness: alternating turns between neighbouring anchors (0..1). */
  wobble: number;
  terminal: StyleParams['terminal'];
  /** Height of the ink's centre of mass within its bounding box (0 = bottom, 1 = top). */
  balance: number;
  /** Bounding box width / height. */
  aspect: number;
  anchorCount: number;
  pathCount: number;
}

export const EMPTY_FEATURES: Readonly<SketchFeatures> = Object.freeze({
  empty: true,
  curviness: 0.5,
  tension: 0.78,
  cornerRatio: 0,
  cornerAngle: 90,
  slant: 0,
  direction: 90,
  directionStrength: 0,
  wobble: 0,
  terminal: 'plain',
  balance: 0.5,
  aspect: 0.8,
  anchorCount: 0,
  pathCount: 0,
});

const deg = (rad: number): number => (rad * 180) / Math.PI;

/** Flip the pad's y-down space into y-up so angles read naturally. */
const up = (p: Vec): Vec => ({ x: p.x, y: PAD_SIZE - p.y });

function angleBetween(a: Vec, b: Vec): number {
  const la = len(a);
  const lb = len(b);
  if (la < 1e-9 || lb < 1e-9) return 0;
  return deg(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y));
}

/** Tangent leaving p0 / arriving at p3 for a cubic, falling back to the chord for degenerate handles. */
function startTangent(s: ReturnType<typeof segments>[number]): Vec {
  const t = sub(s.c1, s.p0);
  return len(t) > 1e-6 ? t : len(sub(s.c2, s.p0)) > 1e-6 ? sub(s.c2, s.p0) : sub(s.p3, s.p0);
}
function endTangent(s: ReturnType<typeof segments>[number]): Vec {
  const t = sub(s.p3, s.c2);
  return len(t) > 1e-6 ? t : len(sub(s.p3, s.c1)) > 1e-6 ? sub(s.p3, s.c1) : sub(s.p3, s.p0);
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function upPath(path: SketchPath): SketchPath {
  return {
    ...path,
    anchors: path.anchors.map((a) => ({
      x: a.x,
      y: PAD_SIZE - a.y,
      hin: a.hin && up(a.hin),
      hout: a.hout && up(a.hout),
    })),
  };
}

export function extractFeatures(doc: SketchDoc): SketchFeatures {
  const paths = doc.paths.filter((p) => p.anchors.length > 1).map(upPath);
  if (!paths.length) return { ...EMPTY_FEATURES };

  let total = 0;
  let curved = 0;
  let tensionSum = 0;
  let tensionW = 0;
  const turns: number[][] = [];
  const cornerAngles: number[] = [];
  let junctions = 0;
  const terminalVotes = { serif: 0, hook: 0, ends: 0 };
  const polylines: Polyline[] = [];

  for (const path of paths) {
    const segs = segments(path);
    const pl = pathToPolyline(path, 4);
    if (path.closed) pl.push(pl[0]);
    polylines.push(pl);
    const pathLen = polylineLength(pl);
    const segLens: number[] = [];

    for (const s of segs) {
      const chord = dist(s.p0, s.p3);
      const sl = s.straight ? chord : polylineLength([s.p0, ...flat(s)]);
      segLens.push(sl);
      total += sl;
      const isCurved = !s.straight && chord > 1e-6 && sl / chord > 1.01;
      if (isCurved) {
        curved += sl;
        tensionSum += ((dist(s.c1, s.p0) + dist(s.c2, s.p3)) / chord) * sl;
        tensionW += sl;
      }
    }

    // Turning angle at each junction between consecutive segments.
    const pathTurns: number[] = [];
    const n = segs.length;
    const jCount = path.closed ? n : n - 1;
    for (let j = 0; j < jCount; j++) {
      const a = segs[j];
      const b = segs[(j + 1) % n];
      const turn = angleBetween(endTangent(a), startTangent(b));
      pathTurns.push(turn);
      junctions++;
      if (Math.abs(turn) > 30) cornerAngles.push(Math.abs(turn));
    }
    turns.push(pathTurns);

    // Terminal evidence at open ends.
    if (!path.closed && n >= 2) {
      for (const end of [0, n - 1]) {
        terminalVotes.ends++;
        const s = segs[end];
        const turnAtNeighbour = end === 0 ? pathTurns[0] : pathTurns[pathTurns.length - 1];
        const chord = dist(s.p0, s.p3);
        if (segLens[end] < pathLen * 0.14 && Math.abs(turnAtNeighbour ?? 0) > 50) terminalVotes.serif++;
        else if (!s.straight && chord > 1e-6 && segLens[end] / chord > 1.08) terminalVotes.hook++;
      }
    }
  }

  // Direction statistics on the flattened ink (doubled angles make direction sign-agnostic).
  let sx = 0;
  let sy = 0;
  let wSum = 0;
  let slantSum = 0;
  let slantW = 0;
  let cy = 0;
  for (const pl of polylines)
    for (let i = 1; i < pl.length; i++) {
      const d = sub(pl[i], pl[i - 1]);
      const l = len(d);
      if (l < 1e-9) continue;
      const a2 = 2 * Math.atan2(d.y, d.x);
      sx += l * Math.cos(a2);
      sy += l * Math.sin(a2);
      wSum += l;
      cy += l * (pl[i].y + pl[i - 1].y) * 0.5;
      const vx = d.y < 0 ? -d.x : d.x;
      const vy = Math.abs(d.y);
      const fromVertical = deg(Math.atan2(vx, vy));
      if (Math.abs(fromVertical) < 30) {
        slantSum += fromVertical * l;
        slantW += l;
      }
    }

  let flips = 0;
  let flipChances = 0;
  for (const t of turns)
    for (let i = 1; i < t.length; i++) {
      if (Math.abs(t[i]) < 12 || Math.abs(t[i - 1]) < 12) continue;
      flipChances++;
      if (Math.sign(t[i]) !== Math.sign(t[i - 1])) flips++;
    }
  const anchorCount = paths.reduce((s, p) => s + p.anchors.length, 0);
  const box = bbox(polylines)!;
  const bw = Math.max(1, box.maxX - box.minX);
  const bh = Math.max(1, box.maxY - box.minY);
  const votes = terminalVotes;

  return {
    empty: false,
    curviness: total > 0 ? curved / total : 0,
    tension: tensionW > 0 ? tensionSum / tensionW : EMPTY_FEATURES.tension,
    cornerRatio: junctions > 0 ? cornerAngles.length / junctions : paths.every((p) => segments(p).every((s) => s.straight)) ? 1 : 0,
    // No corners at all (e.g. a few loose strokes): fall back to a softer hexagonal construction.
    cornerAngle: cornerAngles.length ? median(cornerAngles) : 60,
    slant: slantW > total * 0.15 ? slantSum / slantW : 0,
    direction: ((deg(Math.atan2(sy, sx)) / 2) + 180) % 180,
    directionStrength: wSum > 0 ? Math.hypot(sx, sy) / wSum : 0,
    // Needs a few alternating corners in a row before it counts as deliberate wobble.
    wobble: flipChances >= 3 ? flips / flipChances : 0,
    terminal:
      votes.ends === 0
        ? 'plain'
        : votes.serif / votes.ends >= 0.5
          ? 'serif'
          : votes.hook / votes.ends >= 0.5
            ? 'hook'
            : 'plain',
    balance: wSum > 0 ? clamp((cy / wSum - box.minY) / bh, 0, 1) : 0.5,
    aspect: bw / bh,
    anchorCount,
    pathCount: paths.length,
  };
}

function flat(s: ReturnType<typeof segments>[number]): Polyline {
  return pathToPolyline(
    {
      id: '',
      closed: false,
      anchors: [
        { x: s.p0.x, y: s.p0.y, hin: null, hout: s.c1 },
        { x: s.p3.x, y: s.p3.y, hin: s.c2, hout: null },
      ],
    },
    4,
  ).slice(1);
}

/** 32-bit FNV-1a hash of the document, so the same drawing always yields the same wobble. */
export function docSeed(doc: SketchDoc): number {
  const s = JSON.stringify(doc.paths.map((p) => [p.closed, p.anchors]));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Heuristic mapping from what was drawn to how the typeface is built.
 *   curves vs corners  -> smooth bowls or faceted polygons, round or chisel pen
 *   handle tension     -> superellipse exponent (pointy .. squarish bowls)
 *   dominant direction -> nib angle and thick/thin contrast
 *   lean               -> italic angle
 *   zig-zags           -> hand-drawn wobble
 *   stroke ends        -> serifs / hooks
 *   balance & aspect   -> crossbar height, x-height and width
 */
export function featuresToStyle(f: SketchFeatures, weight: number, seed = 1): StyleParams {
  if (f.empty) return { ...DEFAULT_STYLE, weight, seed };
  const polygonal = f.curviness < 0.12;
  const facets = polygonal ? Math.round(clamp(360 / Math.max(1, f.cornerAngle), 4, 10)) : 0;
  const roundness = polygonal ? 2 : clamp(2 * Math.pow(f.tension / 0.78, 1.8), 1.3, 5);
  const nibAngle = ((f.direction + 90 + 90) % 180) - 90;
  return {
    widthFactor: clamp(Math.pow(f.aspect / 0.8, 0.45), 0.75, 1.35),
    xHeight: Math.round(clamp(500 + (1 / clamp(f.aspect, 0.2, 5) - 1) * 40, 440, 570)),
    slant: Math.abs(f.slant) < 3 ? 0 : clamp(f.slant, -18, 18),
    roundness,
    facets,
    waist: clamp(0.5 + (f.balance - 0.5) * 0.5, 0.38, 0.62),
    weight,
    contrast: clamp((f.directionStrength - 0.25) * 1.1, 0, 0.75),
    nibAngle,
    nibShape: f.cornerRatio > 0.5 && f.curviness < 0.5 ? 'square' : 'round',
    terminal: f.terminal,
    jitter: clamp(f.wobble * 16, 0, 16),
    seed,
  };
}
