import { CHARSET } from '../glyphs/charset';
import type { GlyphData } from '../glyphs/glyph';
import { contoursToSvgD } from '../geometry/svgPath';
import { el, svgEl } from './svg';

/** Visible vertical window for glyph cells, in font units (y-up). */
const TOP = 960;
const BOTTOM = -340;

export class GlyphGrid {
  private readonly cells = new Map<string, { fig: HTMLElement; svg: SVGSVGElement; path: SVGPathElement }>();

  constructor(root: HTMLElement) {
    for (const ch of CHARSET) {
      const fig = el('figure', { class: 'cell empty', 'data-char': ch, 'data-testid': 'glyph-cell', role: 'img', 'aria-label': `Glyph ${ch}` }, root);
      const svg = svgEl('svg', { viewBox: `0 ${-TOP} 1000 ${TOP - BOTTOM}`, 'aria-hidden': 'true' }, fig);
      svgEl('line', { x1: -2000, x2: 3000, y1: 0, y2: 0, class: 'baseline' }, svg);
      const path = svgEl('path', { transform: 'scale(1 -1)', class: 'glyph' }, svg);
      el('figcaption', { text: ch }, fig);
      this.cells.set(ch, { fig, svg, path });
    }
  }

  clear(): void {
    for (const { fig, path } of this.cells.values()) {
      path.removeAttribute('d');
      fig.classList.add('empty');
      fig.classList.remove('from-sketch');
    }
  }

  update(glyphs: GlyphData[]): void {
    for (const g of glyphs) {
      const cell = this.cells.get(g.char);
      if (!cell) continue;
      const width = Math.max(1000, g.advance + 100);
      cell.svg.setAttribute('viewBox', `${(g.advance - width) / 2} ${-TOP} ${width} ${TOP - BOTTOM}`);
      cell.path.setAttribute('d', contoursToSvgD(g.contours));
      cell.fig.classList.remove('empty');
      cell.fig.classList.toggle('from-sketch', !!g.fromSketch);
      cell.fig.title = g.fromSketch ? `${g.char}: your drawing` : g.char;
    }
  }
}
