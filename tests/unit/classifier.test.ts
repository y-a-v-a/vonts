import { describe, it, expect } from 'vitest';
import weights from '../../src/classifier/weights.json';
import { GlyphClassifier } from '../../src/classifier/classifier';
import type { SerializedModel } from '../../src/classifier/mlp';
import { createMLP, serialize, deserialize, forward } from '../../src/classifier/mlp';
import { rasterize, INPUT_SIZE, GRID } from '../../src/classifier/raster';
import { synthGlyph } from '../../src/classifier/synth';
import { rng } from '../../src/glyphs/build';
import { CHARSET } from '../../src/glyphs/charset';
import type { Polyline } from '../../src/geometry/vec';

const clf = new GlyphClassifier(weights as unknown as SerializedModel);
const top = (pls: Polyline[], k = 3) => clf.classify(pls, k).map((p) => p.char);
const poly = (...pts: [number, number][]): Polyline => pts.map(([x, y]) => ({ x, y }));

describe('raster', () => {
  it('fits ink to the grid and keeps aspect info', () => {
    const x = rasterize([poly([0, 0], [0, 100])]);
    expect(x).toHaveLength(INPUT_SIZE);
    const ink = Array.from(x.slice(0, GRID * GRID)).filter((v) => v > 0.5).length;
    expect(ink).toBeGreaterThan(10);
    expect(x[GRID * GRID]).toBeLessThan(-1); // tall & thin
  });

  it('is translation and scale invariant', () => {
    const a = rasterize([poly([0, 0], [50, 100], [100, 0])]);
    const b = rasterize([poly([1000, 1000], [1100, 1200], [1200, 1000])]);
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 5));
  });

  it('empty input is all zeros', () => {
    expect(rasterize([]).every((v) => v === 0)).toBe(true);
  });
});

describe('mlp', () => {
  it('quantised round-trip preserves predictions', () => {
    const m = createMLP({ input: 8, hidden: 6, output: 3 }, rng(1));
    const x = Float32Array.from([1, 0, 0.5, 0, 0, 1, 0.2, 0]);
    const p1 = forward(m, x);
    const p2 = forward(deserialize(serialize(m, ['a', 'b', 'c'])).model, x);
    expect(p1.reduce((s, v) => s + v, 0)).toBeCloseTo(1);
    p1.forEach((v, i) => expect(p2[i]).toBeCloseTo(v, 1));
  });
});

describe('bundled classifier', () => {
  it('has one label per generated character', () => {
    expect(clf.labels).toEqual([...CHARSET]);
  });

  it('recognises held-out synthetic glyphs (case-insensitive top-3)', () => {
    let hits = 0;
    let total = 0;
    for (const ch of CHARSET)
      for (let i = 0; i < 4; i++) {
        const preds = top(synthGlyph(ch, 555_000 + i * 31 + ch.charCodeAt(0)));
        total++;
        if (preds.some((p) => p.toLowerCase() === ch.toLowerCase())) hits++;
      }
    expect(hits / total).toBeGreaterThan(0.9);
  });

  it('recognises simple hand-drawn shapes', () => {
    expect(top([poly([0, 700], [0, 0], [400, 0])])).toContain('L');
    expect(top([poly([0, 700], [500, 700]), poly([250, 700], [250, 0])])).toContain('T');
    expect(top([poly([0, 0], [400, 500]), poly([0, 500], [400, 0])])).toEqual(expect.arrayContaining(['x']));
    const ring = Array.from({ length: 41 }, (_, i) => ({ x: 200 * Math.cos((i / 40) * Math.PI * 2), y: 250 * Math.sin((i / 40) * Math.PI * 2) }));
    expect(top([ring]).some((c) => 'oO0'.includes(c))).toBe(true);
  });

  it('returns nothing for an empty drawing', () => {
    expect(clf.classify([])).toEqual([]);
  });
});
