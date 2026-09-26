import { clamp } from '../geometry/vec';
import { rng } from '../glyphs/build';
import { DEFAULT_STYLE, type StyleParams } from '../glyphs/style';

/**
 * "Temperature" for the typeface: 0 reproduces the inferred style exactly; higher values
 * sample around it. Three overlapping levels:
 *
 *  1. nudge  (0 .. ~0.35) the family's continuous traits move together: first by
 *                          exaggerating what the sketch implied, then with growing noise.
 *  2. flip   (~0.35 .. 1)  categorical traits may flip (terminals, pen shape, facets) and
 *                          internal proportions vary (arch height, apertures, joins).
 *  3. drift  (~0.65 .. 1)  every glyph gets its own small deviations, tilt and lift.
 *
 * Everything is seeded, so (sketch, temperature, seed) always gives the same font.
 */

export type TemperatureLevel = 'exact' | 'nudge' | 'flip' | 'drift';

export const FLIP_FROM = 0.35;
export const DRIFT_FROM = 0.65;

export function temperatureLevel(t: number): TemperatureLevel {
  if (t <= 0) return 'exact';
  if (t < FLIP_FROM) return 'nudge';
  if (t < DRIFT_FROM) return 'flip';
  return 'drift';
}

/** Standard normal sample (Box–Muller) from a uniform source. */
function gauss(rand: () => number): number {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const ramp = (t: number, from: number): number => clamp((t - from) / (1 - from), 0, 1);

interface Knob {
  key: 'widthFactor' | 'xHeight' | 'slant' | 'roundness' | 'contrast' | 'nibAngle' | 'waist' | 'jitter';
  lo: number;
  hi: number;
  /** Noise scale at full temperature. */
  sigma: number;
  /** Neutral value that "exaggeration" pushes away from. */
  neutral: number;
}

const KNOBS: Knob[] = [
  { key: 'widthFactor', lo: 0.68, hi: 1.5, sigma: 0.22, neutral: 1 },
  { key: 'xHeight', lo: 420, hi: 600, sigma: 55, neutral: 500 },
  { key: 'slant', lo: -22, hi: 22, sigma: 9, neutral: 0 },
  { key: 'roundness', lo: 1.2, hi: 6, sigma: 1.3, neutral: 2 },
  { key: 'contrast', lo: 0, hi: 0.85, sigma: 0.3, neutral: 0 },
  { key: 'nibAngle', lo: -90, hi: 90, sigma: 35, neutral: 30 },
  { key: 'waist', lo: 0.36, hi: 0.64, sigma: 0.09, neutral: 0.5 },
  { key: 'jitter', lo: 0, hi: 20, sigma: 7, neutral: 0 },
];

/**
 * Family-level sampling (levels 1 and 2). Returns a new style; t = 0 returns an unchanged copy.
 */
export function applyTemperature(style: StyleParams, t: number, seed: number): StyleParams {
  const out: StyleParams = { ...style };
  if (!(t > 0)) return out;
  const rand = rng((seed * 2654435761) ^ 0x5bd1e995);
  // Low temperatures mostly exaggerate what the sketch implied; noise grows quadratically.
  const exaggerate = 1 + 1.2 * Math.min(t, 0.6);
  const noise = Math.pow(t, 1.5);

  for (const k of KNOBS) {
    const v = style[k.key];
    let next = k.neutral + (v - k.neutral) * exaggerate + gauss(rand) * k.sigma * noise;
    if (k.key === 'jitter') next = Math.abs(next);
    if (k.key === 'nibAngle') next = ((((next + 90) % 180) + 180) % 180) - 90;
    // Facets use regular polygons; keep their roundness neutral.
    if (k.key === 'roundness' && style.facets > 0) next = v;
    out[k.key] = clamp(next, k.lo, k.hi);
  }
  if (out.contrast < 0.02 && style.contrast === 0 && t < FLIP_FROM) out.contrast = 0;

  // Level 2: flips and internal proportions.
  const flip = ramp(t, FLIP_FROM);
  if (flip > 0) {
    const p = 0.65 * flip;
    if (rand() < p) {
      const others = (['plain', 'serif', 'hook'] as const).filter((x) => x !== style.terminal);
      out.terminal = others[Math.floor(rand() * others.length)];
    }
    if (rand() < p * 0.7) out.nibShape = style.nibShape === 'round' ? 'square' : 'round';
    if (rand() < p * 0.6) {
      out.facets = style.facets > 0 && rand() < 0.5 ? 0 : [4, 5, 6, 8, 10][Math.floor(rand() * 5)];
      if (out.facets > 0) out.roundness = 2;
    }
    out.arch = clamp(DEFAULT_STYLE.arch + gauss(rand) * 0.09 * flip, 0.3, 0.6);
    out.aperture = clamp(gauss(rand) * 22 * flip, -18, 40);
    out.join = clamp(DEFAULT_STYLE.join + gauss(rand) * 0.1 * flip, 0.24, 0.56);
  }
  return out;
}

/**
 * Per-glyph drift (level 3): small independent deviations for one character on top of
 * the family style. Below DRIFT_FROM the family style is returned unchanged.
 */
export function glyphStyle(family: StyleParams, char: string, t: number, seed: number): StyleParams {
  const d = ramp(t, DRIFT_FROM);
  if (d <= 0) return family;
  const rand = rng((seed ^ (char.codePointAt(0)! * 0x9e3779b1)) >>> 0);
  const g = () => gauss(rand) * d;
  return {
    ...family,
    slant: clamp(family.slant + g() * 6, -24, 24),
    widthFactor: clamp(family.widthFactor * (1 + g() * 0.12), 0.62, 1.6),
    roundness: family.facets > 0 ? family.roundness : clamp(family.roundness * (1 + g() * 0.25), 1.2, 6),
    contrast: clamp(family.contrast + g() * 0.12, 0, 0.85),
    nibAngle: family.nibAngle + g() * 12,
    waist: clamp(family.waist + g() * 0.05, 0.34, 0.66),
    arch: clamp(family.arch + g() * 0.05, 0.28, 0.62),
    aperture: clamp(family.aperture + g() * 10, -20, 45),
    weight: Math.max(8, family.weight * (1 + g() * 0.1)),
    tilt: g() * 5,
    lift: g() * 22,
  };
}
