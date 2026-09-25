/**
 * Generates the app's own house fonts with the app's own pipeline:
 *   src/assets/fonts/vonts-quill.otf  (masthead)  from the QUILL sketch
 *   src/assets/fonts/vonts-slab.otf   (headings)  from the SLAB sketch
 *
 *   npm run build:fonts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { generate } from '../src/generator';
import { GlyphClassifier } from '../src/classifier/classifier';
import type { SerializedModel } from '../src/classifier/mlp';
import weights from '../src/classifier/weights.json';
import { fontToArrayBuffer } from '../src/export/otf';
import { QUILL, SLAB } from '../src/sketch/presets';

const classifier = new GlyphClassifier(weights as unknown as SerializedModel);
mkdirSync(new URL('../src/assets/fonts/', import.meta.url), { recursive: true });

for (const [preset, family, file] of [
  [QUILL, 'Vonts Quill', 'vonts-quill.otf'],
  [SLAB, 'Vonts Slab', 'vonts-slab.otf'],
] as const) {
  const result = generate(preset.doc, { weight: preset.weight, classifier });
  const buf = Buffer.from(fontToArrayBuffer(result.glyphs, { familyName: family }));
  writeFileSync(new URL(`../src/assets/fonts/${file}`, import.meta.url), buf);
  console.log(`${file}: ${buf.length} bytes, anchor ${result.anchor ?? 'none'}`);
}
