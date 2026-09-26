import { describe, it, expect } from 'vitest';
import { applyTemperature, glyphStyle, temperatureLevel, FLIP_FROM, DRIFT_FROM } from '../../src/style/temperature';
import { DEFAULT_STYLE, type StyleParams } from '../../src/glyphs/style';
import { generate } from '../../src/generator';
import { PRESETS, QUILL } from '../../src/sketch/presets';
import { circleDoc } from './fixtures';

const base = (o: Partial<StyleParams> = {}): StyleParams => ({ ...DEFAULT_STYLE, ...o });
const seeds = Array.from({ length: 40 }, (_, i) => i + 1);

describe('temperature levels', () => {
  it('names the levels', () => {
    expect(temperatureLevel(0)).toBe('exact');
    expect(temperatureLevel(0.2)).toBe('nudge');
    expect(temperatureLevel(0.5)).toBe('flip');
    expect(temperatureLevel(0.9)).toBe('drift');
  });

  it('t = 0 is the exact inferred style', () => {
    const s = base({ slant: 8, contrast: 0.4 });
    expect(applyTemperature(s, 0, 7)).toEqual(s);
    expect(glyphStyle(s, 'a', 0, 7)).toBe(s);
    const a = generate(circleDoc(), { weight: 70 });
    const b = generate(circleDoc(), { weight: 70, temperature: 0, seed: 99 });
    expect(b.glyphs).toEqual(a.glyphs);
  });

  it('is deterministic per seed and differs between seeds', () => {
    const s = base({ slant: 8 });
    expect(applyTemperature(s, 0.8, 5)).toEqual(applyTemperature(s, 0.8, 5));
    expect(applyTemperature(s, 0.8, 5)).not.toEqual(applyTemperature(s, 0.8, 6));
    const g1 = generate(QUILL.doc, { weight: 90, temperature: 0.9, seed: 3 });
    const g2 = generate(QUILL.doc, { weight: 90, temperature: 0.9, seed: 3 });
    expect(g2.glyphs).toEqual(g1.glyphs);
  });

  it('level 1 exaggerates what the sketch implied and never flips categories', () => {
    const s = base({ slant: 10, contrast: 0.3, terminal: 'hook', nibShape: 'square' });
    const t = FLIP_FROM - 0.05;
    const out = seeds.map((sd) => applyTemperature(s, t, sd));
    const meanSlant = out.reduce((a, o) => a + o.slant, 0) / out.length;
    expect(meanSlant).toBeGreaterThan(12);
    for (const o of out) {
      expect(o.terminal).toBe('hook');
      expect(o.nibShape).toBe('square');
      expect(o.facets).toBe(0);
      expect(o.arch).toBe(DEFAULT_STYLE.arch);
    }
  });

  it('level 2 flips categories and varies proportions for some seeds', () => {
    const out = seeds.map((sd) => applyTemperature(base(), 1, sd));
    expect(out.some((o) => o.terminal !== 'plain')).toBe(true);
    expect(out.some((o) => o.nibShape === 'square')).toBe(true);
    expect(out.some((o) => o.facets > 0)).toBe(true);
    expect(new Set(out.map((o) => o.arch.toFixed(3))).size).toBeGreaterThan(30);
  });

  it('keeps every parameter in a safe range at full temperature', () => {
    for (const sd of seeds) {
      const o = applyTemperature(base({ slant: 18, widthFactor: 1.35, jitter: 16, contrast: 0.75 }), 1, sd);
      expect(o.widthFactor).toBeGreaterThanOrEqual(0.68);
      expect(o.widthFactor).toBeLessThanOrEqual(1.5);
      expect(Math.abs(o.slant)).toBeLessThanOrEqual(22);
      expect(o.contrast).toBeLessThanOrEqual(0.85);
      expect(o.jitter).toBeGreaterThanOrEqual(0);
      expect(o.nibAngle).toBeGreaterThanOrEqual(-90);
      expect(o.nibAngle).toBeLessThanOrEqual(90);
    }
  });

  it('level 3 gives each glyph its own drift, only above the drift threshold', () => {
    const fam = base();
    const below = glyphStyle(fam, 'a', DRIFT_FROM - 0.01, 1);
    expect(below).toBe(fam);
    const a = glyphStyle(fam, 'a', 1, 1);
    const b = glyphStyle(fam, 'b', 1, 1);
    expect(a).not.toEqual(b);
    expect(a.tilt).not.toBe(0);
    expect(glyphStyle(fam, 'a', 1, 1)).toEqual(a);
  });

  it('generates valid outlines for every preset at every level', () => {
    for (const p of PRESETS)
      for (const t of [0.3, 0.6, 1])
        for (const seed of [1, 2]) {
          const r = generate(p.doc, { weight: p.weight, temperature: t, seed });
          expect(r.temperature).toBe(t);
          expect(r.seed).toBe(seed);
          for (const g of r.glyphs) {
            expect(g.contours.length, `${p.id} t=${t} ${g.char}`).toBeGreaterThan(0);
            expect(g.advance).toBeGreaterThan(0);
          }
        }
  });
});
