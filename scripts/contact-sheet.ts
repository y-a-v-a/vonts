/**
 * Dev helper: renders the 62 glyphs for a few styles to an SVG contact sheet.
 *   npx tsx scripts/contact-sheet.ts out.svg '{"slant":10,"contrast":0.5}'
 */
import { writeFileSync } from 'node:fs';
import { CHARSET } from '../src/glyphs/charset';
import { DEFAULT_STYLE, type StyleParams } from '../src/glyphs/style';
import { makeGlyph } from '../src/glyphs/glyph';
import { contoursToSvgD } from '../src/render/outline';

const out = process.argv[2] ?? 'contact-sheet.svg';
const variants: Partial<StyleParams>[] = process.argv.slice(3).map((s) => JSON.parse(s));
if (!variants.length) variants.push({});

const cols = 16;
const cell = 1000;
const rows = Math.ceil(CHARSET.length / cols);
let body = '';
variants.forEach((variant, vi) => {
  const style = { ...DEFAULT_STYLE, ...variant };
  const t0 = performance.now();
  CHARSET.forEach((ch, i) => {
    const g = makeGlyph(ch, style);
    const x = (i % cols) * cell + (cell - g.advance) / 2;
    const y = (vi * rows + Math.floor(i / cols)) * cell + 800;
    body += `<path transform="translate(${x} ${y}) scale(1 -1)" d="${contoursToSvgD(g.contours)}"/>`;
  });
  console.log(JSON.stringify(variant), `${(performance.now() - t0).toFixed(0)}ms`);
});
const h = rows * cell * variants.length;
writeFileSync(
  out,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * cell} ${h}" width="${cols * 60}" height="${(h / 1000) * 60}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000" fill-rule="nonzero">${body}</g></svg>`,
);
