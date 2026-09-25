import * as opentypeNs from 'opentype.js';

// Bundlers resolve the ESM build (named exports); plain Node resolves the UMD build (default export).
const opentype: typeof opentypeNs = (opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs;
const { Font, Glyph, Path } = opentype;
type Font = opentypeNs.Font;
type Path = opentypeNs.Path;
import type { GlyphData } from '../glyphs/glyph';
import { glyphName } from '../glyphs/charset';
import { FONT } from '../glyphs/style';
import { normalizeWinding } from '../render/outline';
import { simplifyClosed } from '../geometry/vec';

export interface FontInfo {
  familyName?: string;
  styleName?: string;
}

function toPath(contours: GlyphData['contours']): Path {
  const path = new Path();
  for (const c of normalizeWinding(contours.map((c) => simplifyClosed(c, 0.35)))) {
    if (c.length < 3) continue;
    path.moveTo(Math.round(c[0].x), Math.round(c[0].y));
    for (let i = 1; i < c.length; i++) path.lineTo(Math.round(c[i].x), Math.round(c[i].y));
    path.close();
  }
  return path;
}

/** Build an OpenType (CFF) font from generated glyphs. */
export function buildFont(glyphs: GlyphData[], info: FontInfo = {}): Font {
  const notdef = new Path();
  notdef.moveTo(60, 0);
  notdef.lineTo(60, 700);
  notdef.lineTo(440, 700);
  notdef.lineTo(440, 0);
  notdef.close();
  notdef.moveTo(110, 50);
  notdef.lineTo(390, 50);
  notdef.lineTo(390, 650);
  notdef.lineTo(110, 650);
  notdef.close();

  const avg = glyphs.reduce((s, g) => s + g.advance, 0) / Math.max(1, glyphs.length);
  const all = [
    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: notdef }),
    new Glyph({ name: 'space', unicode: 32, advanceWidth: Math.round(avg * 0.5), path: new Path() }),
    ...glyphs.map(
      (g) => new Glyph({ name: glyphName(g.char), unicode: g.unicode, advanceWidth: g.advance, path: toPath(g.contours) }),
    ),
  ];
  return new Font({
    familyName: info.familyName ?? 'Vonts Sketch',
    styleName: info.styleName ?? 'Regular',
    unitsPerEm: FONT.unitsPerEm,
    ascender: FONT.ascender,
    descender: FONT.descender,
    designer: 'vonts',
    description: 'Generated from a single sketch with vonts',
    glyphs: all,
  });
}

export function fontToArrayBuffer(glyphs: GlyphData[], info?: FontInfo): ArrayBuffer {
  return buildFont(glyphs, info).toArrayBuffer() as ArrayBuffer;
}

export function fontFileName(family = 'Vonts Sketch'): string {
  return `${family.trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'vonts'}.otf`;
}
