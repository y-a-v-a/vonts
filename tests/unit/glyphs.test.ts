import { describe, it, expect } from 'vitest';
import { CHARSET } from '../../src/glyphs/charset';
import { SKELETONS, ASCENDERS, DESCENDERS } from '../../src/glyphs/skeletons';
import { DEFAULT_STYLE, FONT, type StyleParams } from '../../src/glyphs/style';
import { buildSkeleton, styledStrokes, addJitter, applySlant } from '../../src/glyphs/build';
import { makeGlyph } from '../../src/glyphs/glyph';
import { strokesToOutline, nibPolygon } from '../../src/render/outline';
import { bbox, signedArea, densify } from '../../src/geometry/vec';
import { superellipsePoint } from '../../src/glyphs/pen';

const style = (o: Partial<StyleParams> = {}): StyleParams => ({ ...DEFAULT_STYLE, ...o });

describe('charset & skeletons', () => {
  it('covers exactly a-z A-Z 0-9', () => {
    expect(CHARSET).toHaveLength(62);
    expect(new Set(CHARSET).size).toBe(62);
    expect(Object.keys(SKELETONS).sort()).toEqual([...CHARSET].sort());
  });

  it.each([...CHARSET])('%s has strokes within its metric band', (ch) => {
    const s = style();
    const sk = buildSkeleton(ch, s);
    expect(sk.strokes.length).toBeGreaterThan(0);
    expect(sk.width).toBeGreaterThan(0);
    const b = bbox(sk.strokes)!;
    const h = s.weight / 2;
    const tol = 2;
    expect(b.minX).toBeGreaterThanOrEqual(h - tol);
    expect(b.maxX).toBeLessThanOrEqual(sk.width - h + tol);
    const top = /[A-Z0-9]/.test(ch) ? FONT.capHeight : ASCENDERS.has(ch) ? FONT.ascenderLine : s.xHeight;
    // i and j dots sit above the x-height.
    const allowance = ch === 'i' || ch === 'j' ? 200 : 0;
    expect(b.maxY).toBeLessThanOrEqual(top - h + tol + allowance);
    const bottom = DESCENDERS.has(ch) ? FONT.descenderLine : ch === 'Q' ? -60 : 0;
    expect(b.minY).toBeGreaterThanOrEqual(bottom + h - tol - (ch === 'Q' ? h : 0));
  });

  it('x-height and width factor reshape lowercase', () => {
    const tall = bbox(buildSkeleton('o', style({ xHeight: 560 })).strokes)!;
    const short = bbox(buildSkeleton('o', style({ xHeight: 440 })).strokes)!;
    expect(tall.maxY).toBeGreaterThan(short.maxY);
    expect(buildSkeleton('n', style({ widthFactor: 1.3 })).width).toBeGreaterThan(buildSkeleton('n', style()).width);
  });

  it('facets turn bowls into polygons', () => {
    const faceted = buildSkeleton('o', style({ facets: 6 })).strokes[0];
    expect(faceted).toHaveLength(7); // 6 sides + closing point
    expect(buildSkeleton('o', style()).strokes[0].length).toBeGreaterThan(50);
  });

  it('superellipse exponent controls squareness', () => {
    const corner = (n: number) => superellipsePoint(0, 0, 1, 1, Math.PI / 4, n);
    expect(corner(2).x).toBeCloseTo(Math.SQRT1_2);
    expect(corner(8).x).toBeGreaterThan(0.9);
    expect(corner(1).x).toBeCloseTo(0.5);
  });
});

describe('decoration', () => {
  it('serifs and hooks add strokes to stems', () => {
    const plain = styledStrokes('n', style()).strokes.length;
    expect(styledStrokes('n', style({ terminal: 'serif' })).strokes.length).toBeGreaterThan(plain);
    expect(styledStrokes('n', style({ terminal: 'hook' })).strokes.length).toBeGreaterThan(plain);
  });

  it('slant shears x proportionally to y', () => {
    const [s] = applySlant([[{ x: 0, y: 0 }, { x: 0, y: 100 }]], 45);
    expect(s[1].x).toBeCloseTo(100);
    expect(s[0].x).toBe(0);
  });

  it('jitter is deterministic and bounded', () => {
    const line = [[{ x: 0, y: 0 }, { x: 300, y: 0 }]];
    const a = addJitter(line, 10, 42);
    expect(addJitter(line, 10, 42)).toEqual(a);
    expect(addJitter(line, 10, 43)).not.toEqual(a);
    for (const p of a[0]) expect(Math.abs(p.y)).toBeLessThanOrEqual(10.001);
  });
});

describe('outlines', () => {
  it('round monoline stroke area matches the capsule formula', () => {
    const [c] = strokesToOutline([densify([{ x: 0, y: 0 }, { x: 500, y: 0 }], 20)], style());
    const expected = 500 * 70 + Math.PI * 35 * 35;
    expect(Math.abs(signedArea(c) - expected) / expected).toBeLessThan(0.01);
  });

  it('elliptical nib gives thick/thin contrast by direction', () => {
    const nib = style({ contrast: 0.7, nibAngle: 0 });
    const horiz = strokesToOutline([[{ x: 0, y: 0 }, { x: 400, y: 0 }]], nib);
    const vert = strokesToOutline([[{ x: 0, y: 0 }, { x: 0, y: 400 }]], nib);
    const hb = bbox(horiz)!;
    const vb = bbox(vert)!;
    // Nib is wide along x: vertical strokes are thick, horizontal strokes thin.
    expect(vb.maxX - vb.minX).toBeCloseTo(70, 0);
    expect(hb.maxY - hb.minY).toBeCloseTo(21, 0);
  });

  it('square nib polygon has four corners', () => {
    expect(nibPolygon({ ...style(), nibShape: 'square' })).toHaveLength(4);
  });

  it.each([
    ['plain', {}],
    ['calligraphic', { contrast: 0.6, nibAngle: 35, slant: 10 }],
    ['chisel', { nibShape: 'square' as const, contrast: 0.5, facets: 6, terminal: 'serif' as const }],
  ])('%s: every glyph yields CCW outer contours and CW counters', (_, o) => {
    for (const ch of CHARSET) {
      const g = makeGlyph(ch, style(o));
      expect(g.contours.length, ch).toBeGreaterThan(0);
      expect(g.advance).toBeGreaterThan(0);
      const areas = g.contours.map(signedArea);
      expect(areas.reduce((s, a) => s + a, 0), ch).toBeGreaterThan(0);
      expect(Math.max(...areas), ch).toBeGreaterThan(0);
    }
    // Bowls have counters (holes wound the other way).
    expect(makeGlyph('o', style(o)).contours.map(signedArea).some((a) => a < 0)).toBe(true);
  });
});
