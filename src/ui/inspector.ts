import type { GlyphData } from '../glyphs/glyph';
import { contoursToSvgD } from '../geometry/svgPath';
import { FONT } from '../glyphs/style';
import { el, svgEl } from './svg';

const TOP = 900;
const BOTTOM = -300;

/** Modal close-up of one glyph: outline, construction centerlines and metrics. */
export class Inspector {
  private glyphs: GlyphData[] = [];
  private index = 0;
  private xHeight = 500;
  private readonly svg: SVGSVGElement;
  private readonly title: HTMLElement;
  private readonly facts: HTMLElement;

  constructor(private readonly dialog: HTMLDialogElement) {
    const card = el('div', { class: 'inspector-card' }, dialog);
    const head = el('header', { class: 'inspector-head' }, card);
    this.title = el('h3', { 'data-testid': 'inspector-title' }, head);
    const nav = el('div', { class: 'inspector-nav' }, head);
    const prev = el('button', { type: 'button', 'aria-label': 'Previous glyph', text: '←' }, nav);
    const next = el('button', { type: 'button', 'aria-label': 'Next glyph', text: '→' }, nav);
    const close = el('button', { type: 'button', 'aria-label': 'Close', text: '×', class: 'close' }, nav);
    this.svg = svgEl('svg', { class: 'inspector-glyph', role: 'img' }, card);
    this.facts = el('dl', { class: 'inspector-facts' }, card);
    prev.addEventListener('click', () => this.step(-1));
    next.addEventListener('click', () => this.step(1));
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.step(-1);
      if (e.key === 'ArrowRight') this.step(1);
    });
  }

  update(glyphs: GlyphData[], xHeight: number): void {
    this.glyphs = glyphs;
    this.xHeight = xHeight;
    if (this.dialog.open) this.render();
  }

  open(char: string): void {
    const i = this.glyphs.findIndex((g) => g.char === char);
    if (i < 0) return;
    this.index = i;
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
  }

  private step(d: number): void {
    if (!this.glyphs.length) return;
    this.index = (this.index + d + this.glyphs.length) % this.glyphs.length;
    this.render();
  }

  private render(): void {
    const g = this.glyphs[this.index];
    if (!g) return;
    const width = Math.max(1200, g.advance + 400);
    const x0 = (g.advance - width) / 2;
    this.svg.replaceChildren();
    this.svg.setAttribute('viewBox', `${x0} ${-TOP} ${width} ${TOP - BOTTOM}`);
    this.svg.setAttribute('aria-label', `Close-up of ${g.char}`);
    const lines: [string, number][] = [
      ['ascender', FONT.ascenderLine],
      ['cap', FONT.capHeight],
      ['x-height', this.xHeight],
      ['baseline', 0],
      ['descender', FONT.descenderLine],
    ];
    for (const [name, y] of lines) {
      svgEl('line', { x1: x0, x2: x0 + width, y1: -y, y2: -y, class: `metric metric-${name}` }, this.svg);
      const t = svgEl('text', { x: x0 + 20, y: -y - 14, class: 'metric-label' }, this.svg);
      t.textContent = name;
    }
    svgEl('rect', { x: 0, y: -TOP, width: g.advance, height: TOP - BOTTOM, class: 'advance' }, this.svg);
    svgEl('path', { d: contoursToSvgD(g.contours), transform: 'scale(1 -1)', class: 'outline' }, this.svg);
    const spine = g.strokes.map((s) => 'M' + s.map((p) => `${Math.round(p.x)} ${Math.round(-p.y)}`).join('L')).join('');
    svgEl('path', { d: spine, class: 'spine' }, this.svg);

    this.title.textContent = '';
    this.title.append(el('span', { class: 'big-char', text: g.char }), el('span', { text: g.fromSketch ? ' drawn by you' : ` U+${g.unicode.toString(16).toUpperCase().padStart(4, '0')}` }));
    const points = g.contours.reduce((s, c) => s + c.length, 0);
    const facts: [string, string][] = [
      ['advance', `${g.advance} u`],
      ['contours', String(g.contours.length)],
      ['points', String(points)],
      ['strokes', String(g.strokes.length)],
    ];
    this.facts.replaceChildren(...facts.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
  }
}
