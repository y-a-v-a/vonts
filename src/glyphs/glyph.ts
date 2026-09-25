import { type Polyline, bbox } from '../geometry/vec';
import { styledStrokes } from './build';
import type { StyleParams } from './style';
import { strokesToOutline } from '../render/outline';

export interface GlyphData {
  char: string;
  unicode: number;
  /** Advance width, font units. */
  advance: number;
  /** Filled outline contours, font units, y-up; outer CCW, holes CW. */
  contours: Polyline[];
  /** Centerlines the outline was built from (useful for debugging/preview). */
  strokes: Polyline[];
  /** true when this glyph is the user's own drawing rather than a generated one. */
  fromSketch?: boolean;
}

export const sideBearing = (style: Pick<StyleParams, 'weight'>): number => 40 + style.weight * 0.35;

export function translate(pls: Polyline[], dx: number, dy = 0): Polyline[] {
  return pls.map((pl) => pl.map((p) => ({ x: p.x + dx, y: p.y + dy })));
}

export function makeGlyph(char: string, style: StyleParams): GlyphData {
  const { strokes, width } = styledStrokes(char, style);
  const sb = sideBearing(style);
  const contours = strokesToOutline(strokes, style);
  // Space by the real ink (serifs, hooks, wobble and slant can reach past the skeleton).
  const ink = bbox(contours);
  const minX = ink ? ink.minX : 0;
  const inkWidth = ink ? ink.maxX - ink.minX : width;
  const dx = sb - minX;
  return {
    char,
    unicode: char.codePointAt(0)!,
    advance: Math.round(inkWidth + 2 * sb),
    contours: translate(contours, dx),
    strokes: translate(strokes, dx),
  };
}
