import { describe, it, expect } from 'vitest';
import { extractFeatures, featuresToStyle, docSeed, EMPTY_FEATURES } from '../../src/style/features';
import { DEFAULT_STYLE } from '../../src/glyphs/style';
import { anchor, emptyDoc } from '../../src/sketch/model';
import { circleDoc, polyDoc, squareDoc } from './fixtures';

describe('extractFeatures', () => {
  it('empty drawing yields defaults', () => {
    const f = extractFeatures(emptyDoc());
    expect(f.empty).toBe(true);
    expect(featuresToStyle(f, 80)).toEqual({ ...DEFAULT_STYLE, weight: 80 });
  });

  it('a smooth circle is curvy, cornerless, monoline and round', () => {
    const f = extractFeatures(circleDoc());
    expect(f.curviness).toBeGreaterThan(0.95);
    expect(f.cornerRatio).toBe(0);
    expect(f.tension).toBeCloseTo(0.78, 1);
    expect(f.directionStrength).toBeLessThan(0.1);
    expect(f.aspect).toBeCloseTo(1, 1);
    const s = featuresToStyle(f, 70);
    expect(s.facets).toBe(0);
    expect(s.roundness).toBeCloseTo(2, 0);
    expect(s.contrast).toBe(0);
    expect(s.nibShape).toBe('round');
  });

  it('a square is polygonal with 90 degree corners -> 4 facets, square nib', () => {
    const f = extractFeatures(squareDoc());
    expect(f.curviness).toBe(0);
    expect(f.cornerRatio).toBe(1);
    expect(f.cornerAngle).toBeCloseTo(90);
    const s = featuresToStyle(f, 70);
    expect(s.facets).toBe(4);
    expect(s.nibShape).toBe('square');
  });

  it('long handles make squarish bowls, short handles pointy ones', () => {
    const squarish = circleDoc();
    for (const a of squarish.paths[0].anchors) {
      a.hin = { x: a.x + (a.hin!.x - a.x) * 1.6, y: a.y + (a.hin!.y - a.y) * 1.6 };
      a.hout = { x: a.x + (a.hout!.x - a.x) * 1.6, y: a.y + (a.hout!.y - a.y) * 1.6 };
    }
    const pointy = circleDoc();
    for (const a of pointy.paths[0].anchors) {
      a.hin = { x: a.x + (a.hin!.x - a.x) * 0.4, y: a.y + (a.hin!.y - a.y) * 0.4 };
      a.hout = { x: a.x + (a.hout!.x - a.x) * 0.4, y: a.y + (a.hout!.y - a.y) * 0.4 };
    }
    expect(featuresToStyle(extractFeatures(squarish), 70).roundness).toBeGreaterThan(3);
    expect(featuresToStyle(extractFeatures(pointy), 70).roundness).toBeLessThan(1.6);
  });

  it('detects rightward slant from leaning strokes (pad is y-down)', () => {
    const f = extractFeatures(
      polyDoc([
        [400, 800],
        [500, 200],
      ]),
    );
    expect(f.slant).toBeCloseTo(9.46, 1);
    expect(featuresToStyle(f, 70).slant).toBeCloseTo(9.46, 1);
    const left = extractFeatures(
      polyDoc([
        [500, 800],
        [400, 200],
      ]),
    );
    expect(left.slant).toBeLessThan(-9);
  });

  it('parallel diagonal strokes give contrast with the nib across them', () => {
    const doc = polyDoc([
      [200, 800],
      [800, 200],
    ]);
    doc.paths.push({ id: 'q', closed: false, anchors: [anchor(100, 700), anchor(700, 100)] });
    const f = extractFeatures(doc);
    expect(f.directionStrength).toBeGreaterThan(0.99);
    expect(f.direction).toBeCloseTo(45, 0);
    const s = featuresToStyle(f, 70);
    expect(s.contrast).toBeGreaterThan(0.7);
    expect(s.nibAngle).toBeCloseTo(-45, 0);
  });

  it('zig-zags read as wobble', () => {
    const pts: [number, number][] = Array.from({ length: 9 }, (_, i) => [100 + i * 90, i % 2 ? 400 : 600]);
    const f = extractFeatures(polyDoc(pts));
    expect(f.wobble).toBe(1);
    expect(featuresToStyle(f, 70).jitter).toBeGreaterThan(10);
    expect(extractFeatures(circleDoc()).wobble).toBe(0);
  });

  it('short kinked ends read as serifs, curled ends as hooks', () => {
    const serif = extractFeatures(
      polyDoc([
        [440, 200],
        [500, 200],
        [500, 800],
        [560, 800],
      ]),
    );
    expect(serif.terminal).toBe('serif');
    const hook = {
      paths: [
        {
          id: 'h',
          closed: false,
          anchors: [
            anchor(500, 200),
            anchor(500, 700, null, { x: 500, y: 800 }),
            anchor(600, 760, { x: 560, y: 820 }),
          ],
        },
        {
          id: 'h2',
          closed: false,
          anchors: [anchor(400, 750, null, { x: 380, y: 650 }), anchor(420, 200, { x: 420, y: 240 })],
        },
      ],
    };
    expect(extractFeatures(hook).terminal).toBe('hook');
    expect(extractFeatures(circleDoc()).terminal).toBe('plain');
  });

  it('top-heavy ink raises the waist', () => {
    const doc = polyDoc([
      [300, 200],
      [700, 200],
      [500, 800],
    ]);
    doc.paths.push({ id: 'b', closed: false, anchors: [anchor(300, 250), anchor(700, 250)] });
    const f = extractFeatures(doc);
    expect(f.balance).toBeGreaterThan(0.55);
    expect(featuresToStyle(f, 70).waist).toBeGreaterThan(0.5);
  });

  it('seed is stable per drawing', () => {
    expect(docSeed(circleDoc())).toBe(docSeed(circleDoc()));
    expect(docSeed(circleDoc())).not.toBe(docSeed(squareDoc()));
    expect(EMPTY_FEATURES.empty).toBe(true);
  });
});
