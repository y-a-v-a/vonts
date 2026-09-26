import { type Polyline, bbox, clamp } from './geometry/vec';
import { type SketchDoc, docToPolylines } from './sketch/model';
import { extractFeatures, featuresToStyle, docSeed, type SketchFeatures } from './style/features';
import type { StyleParams } from './glyphs/style';
import { CHARSET } from './glyphs/charset';
import { buildSkeleton } from './glyphs/build';
import { makeGlyph, sideBearing, type GlyphData } from './glyphs/glyph';
import { strokesToOutline } from './render/outline';
import type { Prediction } from './classifier/classifier';
import { applyTemperature, glyphStyle } from './style/temperature';
import { padToFont } from './sketch/pad';

export { padToFont, PAD_BASELINE, PAD_GUIDES } from './sketch/pad';

export interface Classifier {
  classify(polylines: Polyline[], k?: number): Prediction[];
}

export interface GenerationResult {
  style: StyleParams;
  features: SketchFeatures;
  predictions: Prediction[];
  /** Character slot filled with the user's own drawing, if the classifier was confident. */
  anchor: string | null;
  glyphs: GlyphData[];
  /** Temperature and seed this result was sampled with. */
  temperature: number;
  seed: number;
  ms: number;
}

export interface GenerateOptions {
  weight: number;
  classifier?: Classifier | null;
  /** 0 = the inferred style exactly; up to 1 = most surprising. */
  temperature?: number;
  /** Sampling seed for temperature > 0 (a "reroll" picks a new one). */
  seed?: number;
}

/** Minimum classifier probability before the drawing takes over a glyph slot. */
export const ANCHOR_THRESHOLD = 0.5;

/** Place the user's drawing into a glyph slot, scaled to the height of that character's skeleton. */
export function sketchGlyph(char: string, drawing: Polyline[], style: StyleParams): GlyphData | null {
  const db = bbox(drawing);
  const target = bbox(buildSkeleton(char, style).strokes);
  if (!db || !target) return null;
  const dh = db.maxY - db.minY;
  const dw = db.maxX - db.minX;
  if (dh < 1e-3) return null;
  const s = (target.maxY - target.minY) / dh;
  const sb = sideBearing(style);
  const h = style.weight / 2;
  const strokes = drawing.map((pl) =>
    pl.map((p) => ({ x: (p.x - db.minX) * s + h + sb, y: (p.y - db.minY) * s + target.minY })),
  );
  return {
    char,
    unicode: char.codePointAt(0)!,
    advance: Math.round(dw * s + 2 * h + 2 * sb),
    contours: strokesToOutline(strokes, style),
    strokes,
    fromSketch: true,
  };
}

/** Run the whole pipeline: sketch -> features (+ classifier) -> style -> 62 glyphs. */
export function generate(doc: SketchDoc, opts: GenerateOptions): GenerationResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const features = extractFeatures(doc);
  const style = featuresToStyle(features, opts.weight, docSeed(doc));
  const drawing = padToFont(docToPolylines(doc, 4));
  const predictions = !features.empty && opts.classifier ? opts.classifier.classify(drawing, 3) : [];
  const best = predictions[0];
  const anchor = best && best.p >= ANCHOR_THRESHOLD ? best.char : null;

  if (anchor) {
    // Match the family's proportions to the recognised letter: drawn aspect vs. skeleton aspect.
    const sk = bbox(buildSkeleton(anchor, style).strokes)!;
    const dr = bbox(drawing)!;
    const skAspect = (sk.maxX - sk.minX) / Math.max(1, sk.maxY - sk.minY);
    const drAspect = (dr.maxX - dr.minX) / Math.max(1, dr.maxY - dr.minY);
    if (skAspect > 0.3) style.widthFactor = clamp((style.widthFactor * drAspect) / skAspect, 0.7, 1.4);
  }

  const temperature = clamp(opts.temperature ?? 0, 0, 1);
  const seed = (opts.seed ?? 1) >>> 0;
  const sampleSeed = (docSeed(doc) ^ Math.imul(seed + 1, 0x9e3779b1)) >>> 0;
  const family = applyTemperature(style, temperature, sampleSeed);

  const glyphs = CHARSET.map(
    (ch) => (ch === anchor && sketchGlyph(ch, drawing, family)) || makeGlyph(ch, glyphStyle(family, ch, temperature, sampleSeed)),
  );
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { style: family, features, predictions, anchor, glyphs, temperature, seed, ms: t1 - t0 };
}
