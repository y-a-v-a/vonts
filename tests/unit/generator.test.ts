import { describe, it, expect } from 'vitest';
import { parse } from 'opentype.js';
import { generate, padToFont, sketchGlyph, ANCHOR_THRESHOLD } from '../../src/generator';
import { fontToArrayBuffer, fontFileName, buildFont } from '../../src/export/otf';
import { CHARSET } from '../../src/glyphs/charset';
import { DEFAULT_STYLE } from '../../src/glyphs/style';
import { emptyDoc } from '../../src/sketch/model';
import { signedArea, simplifyClosed } from '../../src/geometry/vec';
import { circleDoc, squareDoc } from './fixtures';

const stub = (char: string, p: number) => ({ classify: () => [{ char, p }] });

describe('generate', () => {
  it('produces all 62 glyphs even for an empty sketch', () => {
    const r = generate(emptyDoc(), { weight: 70 });
    expect(r.glyphs.map((g) => g.char)).toEqual([...CHARSET]);
    expect(r.anchor).toBeNull();
    expect(r.predictions).toEqual([]);
  });

  it('different drawings give different typefaces', () => {
    const round = generate(circleDoc(), { weight: 70 });
    const square = generate(squareDoc(), { weight: 70 });
    expect(round.style.facets).toBe(0);
    expect(square.style.facets).toBe(4);
    const o1 = round.glyphs.find((g) => g.char === 'o')!;
    const o2 = square.glyphs.find((g) => g.char === 'o')!;
    expect(o1.contours[0].length).not.toBe(o2.contours[0].length);
  });

  it('is deterministic', () => {
    const a = generate(circleDoc(), { weight: 60 });
    const b = generate(circleDoc(), { weight: 60 });
    expect(b.glyphs).toEqual(a.glyphs);
  });

  it('weight slider thickens strokes', () => {
    const area = (w: number) =>
      generate(circleDoc(), { weight: w }).glyphs.find((g) => g.char === 'l')!.contours.reduce((s, c) => s + signedArea(c), 0);
    expect(area(120)).toBeGreaterThan(area(40) * 2);
  });

  it('a confident prediction puts the drawing itself into that slot', () => {
    const r = generate(circleDoc(), { weight: 70, classifier: stub('o', 0.9) });
    expect(r.anchor).toBe('o');
    const o = r.glyphs.find((g) => g.char === 'o')!;
    expect(o.fromSketch).toBe(true);
    expect(r.glyphs.filter((g) => g.fromSketch)).toHaveLength(1);
  });

  it('a weak prediction is reported but not anchored', () => {
    const r = generate(circleDoc(), { weight: 70, classifier: stub('o', ANCHOR_THRESHOLD - 0.1) });
    expect(r.predictions[0].char).toBe('o');
    expect(r.anchor).toBeNull();
  });

  it('anchoring adapts the family width to the drawing', () => {
    const narrow = circleDoc();
    for (const a of narrow.paths[0].anchors) {
      a.x = 500 + (a.x - 500) * 0.5;
      if (a.hin) a.hin.x = 500 + (a.hin.x - 500) * 0.5;
      if (a.hout) a.hout.x = 500 + (a.hout.x - 500) * 0.5;
    }
    const plain = generate(narrow, { weight: 70 });
    const anchored = generate(narrow, { weight: 70, classifier: stub('o', 0.9) });
    expect(anchored.style.widthFactor).toBeLessThan(plain.style.widthFactor);
  });

  it('sketchGlyph scales the drawing to the character height', () => {
    const drawing = padToFont([
      [
        { x: 100, y: 100 },
        { x: 100, y: 900 },
      ],
    ]);
    const g = sketchGlyph('l', drawing, { ...DEFAULT_STYLE })!;
    const ys = g.strokes.flat().map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(35);
    expect(Math.max(...ys)).toBeCloseTo(740 - 35);
  });
});

describe('OTF export', () => {
  const r = generate(circleDoc(), { weight: 70 });

  it('round-trips through an OpenType parser', () => {
    const buf = fontToArrayBuffer(r.glyphs, { familyName: 'Test Sketch' });
    const font = parse(buf);
    expect(font.numGlyphs).toBe(64); // .notdef + space + 62
    expect(JSON.stringify(font.names)).toContain('"fontFamily":{"en":"Test Sketch"}');
    expect(font.unitsPerEm).toBe(1000);
    for (const ch of CHARSET) {
      const g = font.charToGlyph(ch);
      expect(g.unicode, ch).toBe(ch.codePointAt(0));
      expect(g.path.commands.length, ch).toBeGreaterThan(3);
    }
    expect(font.charToGlyph('a').advanceWidth).toBe(r.glyphs[0].advance);
    expect(font.charToGlyph(' ').advanceWidth).toBeGreaterThan(100);
  });

  it('uses PostScript glyph names', () => {
    const font = buildFont(r.glyphs);
    expect(font.charToGlyph('0').name).toBe('zero');
    expect(font.charToGlyph('Q').name).toBe('Q');
  });

  it('makes safe file names', () => {
    expect(fontFileName('My Sketch!')).toBe('My-Sketch.otf');
    expect(fontFileName('   ')).toBe('vonts.otf');
  });

  it('simplifyClosed keeps the shape of a polygon', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const s = simplifyClosed(sq, 0.1);
    expect(s).toHaveLength(4);
    expect(signedArea(s)).toBe(100);
  });
});
