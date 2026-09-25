import type { Polyline } from '../geometry/vec';
import { FONT } from '../glyphs/style';

/** Where the pad's baseline sits: pad y = 760 is the font baseline (y = 0). */
export const PAD_BASELINE = 760;

/** Pad (y-down) to font units (y-up). */
export function padToFont(polylines: Polyline[]): Polyline[] {
  return polylines.map((pl) => pl.map((p) => ({ x: p.x, y: PAD_BASELINE - p.y })));
}

/** Guides drawn on the pad, in pad coordinates. */
export const PAD_GUIDES = {
  ascender: PAD_BASELINE - FONT.ascenderLine,
  capHeight: PAD_BASELINE - FONT.capHeight,
  xHeight: PAD_BASELINE - 500,
  baseline: PAD_BASELINE,
  descender: PAD_BASELINE - FONT.descenderLine,
};
