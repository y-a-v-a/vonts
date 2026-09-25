import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'opentype.js';
import { PRESETS, QUILL, SLAB } from '../../src/sketch/presets';
import { isSketchDoc } from '../../src/sketch/model';
import { generate } from '../../src/generator';

describe('presets', () => {
  it('are valid, uniquely named sketches', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) expect(isSketchDoc(p.doc), p.id).toBe(true);
    expect(PRESETS).toContain(QUILL);
    expect(PRESETS).toContain(SLAB);
  });

  it('each produce a distinct style', () => {
    const styles = PRESETS.map((p) => JSON.stringify({ ...generate(p.doc, { weight: p.weight }).style, seed: 0 }));
    expect(new Set(styles).size).toBe(PRESETS.length);
  });
});

describe('house fonts', () => {
  it.each(['vonts-quill.otf', 'vonts-slab.otf'])('%s is a complete generated font', (file) => {
    const buf = readFileSync(new URL(`../../src/assets/fonts/${file}`, import.meta.url));
    const font = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(font.numGlyphs).toBe(64);
    for (const ch of 'vonts') expect(font.charToGlyph(ch).path.commands.length).toBeGreaterThan(3);
  });
});
