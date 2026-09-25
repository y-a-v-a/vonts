/** Everything the glyph generator needs to know about the typeface's character. */
export interface StyleParams {
  /** Horizontal proportion multiplier (1 = regular). */
  widthFactor: number;
  /** Height of lowercase letters in font units (cap height is fixed at 700). */
  xHeight: number;
  /** Italic angle in degrees; positive leans right. */
  slant: number;
  /** Superellipse exponent for bowls: 1 = diamond, 2 = ellipse, 4+ = squarish. */
  roundness: number;
  /** 0 = smooth curves, otherwise the number of facets a full bowl is built from. */
  facets: number;
  /** Relative height (0..1) of crossbars and lobe joins. */
  waist: number;
  /** Stroke thickness in font units. */
  weight: number;
  /** 0 = monoline, up to ~0.85 = strong thick/thin contrast. */
  contrast: number;
  /** Angle of the virtual pen nib in degrees. */
  nibAngle: number;
  /** Round pen or square/chisel pen. */
  nibShape: 'round' | 'square';
  /** Stroke endings. */
  terminal: 'plain' | 'serif' | 'hook';
  /** Amplitude of hand-drawn wobble in font units. */
  jitter: number;
  /** Seed for deterministic wobble. */
  seed: number;
}

export const DEFAULT_STYLE: Readonly<StyleParams> = Object.freeze({
  widthFactor: 1,
  xHeight: 500,
  slant: 0,
  roundness: 2,
  facets: 0,
  waist: 0.5,
  weight: 70,
  contrast: 0,
  nibAngle: 30,
  nibShape: 'round',
  terminal: 'plain',
  jitter: 0,
  seed: 1,
});

/** Fixed vertical metrics, font units (unitsPerEm = 1000, y-up, baseline 0). */
export const FONT = Object.freeze({
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  capHeight: 700,
  ascenderLine: 740,
  descenderLine: -210,
});
