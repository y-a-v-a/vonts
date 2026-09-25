import type { GlyphData } from '../glyphs/glyph';
import { contoursToSvgD } from '../geometry/svgPath';
import { svgEl } from './svg';

const LINE = 1100;
const MAX_WIDTH = 16000;

/** Sets arbitrary text with the generated glyphs (missing characters become spaces). */
export class Specimen {
  private glyphs = new Map<string, GlyphData>();

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly input: HTMLInputElement,
  ) {
    input.addEventListener('input', () => this.render());
  }

  update(glyphs: GlyphData[]): void {
    this.glyphs = new Map(glyphs.map((g) => [g.char, g]));
    this.render();
  }

  render(): void {
    this.svg.replaceChildren();
    if (!this.glyphs.size) {
      this.svg.setAttribute('viewBox', '0 0 1 1');
      return;
    }
    const avg = [...this.glyphs.values()].reduce((s, g) => s + g.advance, 0) / this.glyphs.size;
    const space = avg * 0.5;
    const words = this.input.value.split(/(\s+)/);
    let x = 0;
    let line = 0;
    let widest = 0;
    const measure = (w: string) => [...w].reduce((s, ch) => s + (this.glyphs.get(ch)?.advance ?? space), 0);
    for (const word of words) {
      if (!word) continue;
      if (/^\s+$/.test(word)) {
        x += space * word.length;
        continue;
      }
      if (x > 0 && x + measure(word) > MAX_WIDTH) {
        line++;
        x = 0;
      }
      for (const ch of word) {
        const g = this.glyphs.get(ch);
        if (g) svgEl('path', { d: contoursToSvgD(g.contours), transform: `translate(${x} ${line * LINE + 800}) scale(1 -1)` }, this.svg);
        x += g?.advance ?? space;
        widest = Math.max(widest, x);
      }
    }
    this.svg.setAttribute('viewBox', `0 0 ${Math.max(widest, 1000)} ${(line + 1) * LINE}`);
  }
}
