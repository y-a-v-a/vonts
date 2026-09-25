import type { Polyline } from '../geometry/vec';
import { buildSkeleton, addJitter, applySlant, rng } from '../glyphs/build';
import { DEFAULT_STYLE, type StyleParams } from '../glyphs/style';

/** A random but plausible style, used to generate varied training glyphs. */
export function randomStyle(rand: () => number): StyleParams {
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  return {
    ...DEFAULT_STYLE,
    widthFactor: 0.72 + rand() * 0.65,
    xHeight: 430 + rand() * 150,
    slant: rand() < 0.5 ? 0 : (rand() * 2 - 1) * 18,
    roundness: 1.3 + rand() * 3.5,
    facets: rand() < 0.25 ? pick([4, 5, 6, 8, 10]) : 0,
    waist: 0.38 + rand() * 0.24,
    weight: 30 + rand() * 90,
    jitter: rand() < 0.4 ? rand() * 14 : 0,
    seed: Math.floor(rand() * 1e9),
  };
}

/** Centerline strokes for `char` with a random style plus a small random affine distortion. */
export function synthGlyph(char: string, seed: number): Polyline[] {
  const rand = rng(seed);
  const style = randomStyle(rand);
  let strokes = buildSkeleton(char, style).strokes;
  strokes = addJitter(strokes, style.jitter, style.seed);
  strokes = applySlant(strokes, style.slant);
  const rot = ((rand() * 2 - 1) * 5 * Math.PI) / 180;
  const sx = 0.88 + rand() * 0.24;
  const sy = 0.88 + rand() * 0.24;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return strokes.map((pl) => pl.map((p) => ({ x: (p.x * c - p.y * s) * sx, y: (p.x * s + p.y * c) * sy })));
}
