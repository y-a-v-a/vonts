import { type Polyline, type Vec, densify, dist } from '../geometry/vec';
import { StrokePen } from './pen';
import { SKELETONS, metricsFor, type Metrics } from './skeletons';
import type { StyleParams } from './style';

export interface GlyphSkeleton {
  char: string;
  /** Centerline strokes, font units, y-up. */
  strokes: Polyline[];
  /** Ink width before side bearings. */
  width: number;
}

export function buildSkeleton(char: string, style: StyleParams): GlyphSkeleton {
  const def = SKELETONS[char];
  if (!def) throw new Error(`No skeleton for ${JSON.stringify(char)}`);
  const pen = new StrokePen(style);
  const m = metricsFor(style);
  const width = def(pen, m);
  pen.end();
  return { char, strokes: pen.strokes, width };
}

/** Walk inward from an end of a stroke far enough to get a stable direction. */
function endDirection(stroke: Polyline, atStart: boolean, reach = 24): Vec {
  const end = atStart ? stroke[0] : stroke[stroke.length - 1];
  let other = end;
  for (let i = 1; i < stroke.length; i++) {
    other = atStart ? stroke[i] : stroke[stroke.length - 1 - i];
    if (dist(other, end) >= reach) break;
  }
  return { x: end.x - other.x, y: end.y - other.y };
}

/**
 * Adds serifs or calligraphic hooks where near-vertical strokes end on a metric line.
 */
export function addTerminals(strokes: Polyline[], style: StyleParams, m: Metrics, width: number): Polyline[] {
  if (style.terminal === 'plain') return strokes;
  const lines = [m.bot, m.top, m.ct, m.at, m.db];
  const extra: Polyline[] = [];
  const serif = 28 + style.weight * 0.9;
  for (const s of strokes) {
    if (s.length < 2 || dist(s[0], s[s.length - 1]) < 1) continue;
    for (const atStart of [true, false]) {
      const end = atStart ? s[0] : s[s.length - 1];
      const d = endDirection(s, atStart);
      const vertical = Math.abs(d.x) < 0.6 * Math.abs(d.y);
      if (!vertical || !lines.some((y) => Math.abs(end.y - y) < 3)) continue;
      if (style.terminal === 'serif') {
        extra.push([
          { x: end.x - serif, y: end.y },
          { x: end.x + serif, y: end.y },
        ]);
      } else if (d.y < 0 && Math.abs(end.y - m.bot) < 3) {
        // Exit stroke: curl to the right along the baseline.
        const r = Math.max(24, serif * 0.8);
        const pts: Polyline = [];
        for (let a = 180; a <= 300; a += 10) {
          const t = (a * Math.PI) / 180;
          pts.push({ x: end.x + r + r * Math.cos(t), y: end.y + r + r * Math.sin(t) });
        }
        extra.push(pts);
      } else if (d.y > 0 && end.x < width * 0.35) {
        // Entry stroke: a short diagonal lead-in at the top left of stems.
        extra.push([{ x: end.x - serif * 0.9, y: end.y - serif * 0.45 }, { ...end }]);
      }
    }
  }
  return strokes.concat(extra);
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Low-frequency wobble so strokes look hand-drawn; deterministic per glyph + seed. */
export function addJitter(strokes: Polyline[], amplitude: number, seed: number): Polyline[] {
  if (amplitude <= 0) return strokes;
  const rand = rng(seed);
  const waves = Array.from({ length: 3 }, (_, i) => ({
    fx: (0.004 + rand() * 0.01) * (i + 1),
    fy: (0.004 + rand() * 0.01) * (i + 1),
    px: rand() * Math.PI * 2,
    py: rand() * Math.PI * 2,
    a: 1 / (i + 1),
  }));
  const norm = waves.reduce((s, w) => s + w.a, 0);
  return strokes.map((s) => {
    const dense = densify(s, 12);
    let along = 0;
    return dense.map((p, i) => {
      if (i > 0) along += dist(dense[i - 1], p);
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        dx += w.a * Math.sin(along * w.fx + w.px + p.y * 0.01);
        dy += w.a * Math.sin(along * w.fy + w.py + p.x * 0.01);
      }
      return { x: p.x + (dx / norm) * amplitude, y: p.y + (dy / norm) * amplitude };
    });
  });
}

export function applySlant(strokes: Polyline[], degrees: number): Polyline[] {
  if (Math.abs(degrees) < 0.01) return strokes;
  const k = Math.tan((degrees * Math.PI) / 180);
  return strokes.map((s) => s.map((p) => ({ x: p.x + p.y * k, y: p.y })));
}

export function charSeed(char: string, seed: number): number {
  return (char.codePointAt(0)! * 2654435761 + seed * 97) >>> 0;
}

/** Skeleton + terminals + wobble + slant, still as centerlines. */
export function styledStrokes(char: string, style: StyleParams): GlyphSkeleton {
  const sk = buildSkeleton(char, style);
  const m = metricsFor(style);
  let strokes = addTerminals(sk.strokes, style, m, sk.width);
  strokes = addJitter(strokes, style.jitter, charSeed(char, style.seed));
  strokes = applySlant(strokes, style.slant);
  return { char, strokes, width: sk.width };
}
