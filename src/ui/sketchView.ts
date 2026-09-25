import type { Vec } from '../geometry/vec';
import { type SketchDoc, type SketchPath, pathToSvgD, PAD_SIZE } from '../sketch/model';
import type { ToolController } from '../sketch/tools';
import { PAD_GUIDES } from '../sketch/pad';
import { svgEl } from './svg';

const f = (n: number) => Math.round(n * 10) / 10;

/** Renders the sketch document and tool overlays into the pad SVG and forwards pointer input. */
export class SketchView {
  private readonly guides: SVGGElement;
  private readonly ink: SVGGElement;
  private readonly overlay: SVGGElement;
  private frame = 0;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly tools: ToolController,
  ) {
    svg.setAttribute('viewBox', `0 0 ${PAD_SIZE} ${PAD_SIZE}`);
    this.guides = svgEl('g', { class: 'guides' }, svg);
    this.ink = svgEl('g', { class: 'ink' }, svg);
    this.overlay = svgEl('g', { class: 'overlay' }, svg);
    this.drawGuides();
    this.bindPointer();
    new ResizeObserver(() => this.updateHitRadius()).observe(svg);
    this.updateHitRadius();
    this.render();
  }

  /** Coalesce renders to one per frame. */
  requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private updateHitRadius(): void {
    const px = this.svg.getBoundingClientRect().width || PAD_SIZE;
    this.tools.hitRadius = 9 * (PAD_SIZE / px);
  }

  private get unitsPerPx(): number {
    const px = this.svg.getBoundingClientRect().width || PAD_SIZE;
    return PAD_SIZE / px;
  }

  private toDoc(e: PointerEvent): Vec {
    const r = this.svg.getBoundingClientRect();
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      x: round(((e.clientX - r.left) / r.width) * PAD_SIZE),
      y: round(((e.clientY - r.top) / r.height) * PAD_SIZE),
    };
  }

  private bindPointer(): void {
    const svg = this.svg;
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      this.tools.pointerDown(this.toDoc(e), { alt: e.altKey, shift: e.shiftKey });
    });
    svg.addEventListener('pointermove', (e) => this.tools.pointerMove(this.toDoc(e), { alt: e.altKey, shift: e.shiftKey }));
    const up = (e: PointerEvent) => {
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      if (this.tools.isDragging || e.type === 'pointerup') this.tools.pointerUp(this.toDoc(e));
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('pointerleave', () => this.tools.pointerLeave());
    svg.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (this.tools.tool === 'pen') this.tools.key('Enter');
    });
  }

  private drawGuides(): void {
    const lines: [keyof typeof PAD_GUIDES, string][] = [
      ['ascender', 'ascender'],
      ['capHeight', 'cap height'],
      ['xHeight', 'x-height'],
      ['baseline', 'baseline'],
      ['descender', 'descender'],
    ];
    for (const [key, label] of lines) {
      const y = PAD_GUIDES[key];
      svgEl('line', { x1: 0, x2: PAD_SIZE, y1: y, y2: y, class: `guide guide-${key}` }, this.guides);
      const t = svgEl('text', { x: 12, y: y - 8, class: 'guide-label' }, this.guides);
      t.textContent = label;
    }
  }

  render(): void {
    const { doc, tool, activePath, selection, hover } = this.tools;
    this.ink.replaceChildren();
    this.overlay.replaceChildren();
    const u = this.unitsPerPx;

    doc.paths.forEach((path, i) => {
      svgEl('path', { d: pathToSvgD(path), class: 'stroke', 'data-path': i }, this.ink);
    });

    // Rubber band for the next pen segment.
    if (tool === 'pen' && activePath !== null && hover && !this.tools.isDragging) {
      const path = doc.paths[activePath];
      const last = path?.anchors[path.anchors.length - 1];
      if (last) {
        const c1 = last.hout ?? last;
        svgEl(
          'path',
          { d: `M${f(last.x)} ${f(last.y)} C${f(c1.x)} ${f(c1.y)} ${f(hover.x)} ${f(hover.y)} ${f(hover.x)} ${f(hover.y)}`, class: 'rubber' },
          this.overlay,
        );
        const first = path.anchors[0];
        if (path.anchors.length > 1 && Math.hypot(hover.x - first.x, hover.y - first.y) <= this.tools.hitRadius)
          svgEl('circle', { cx: first.x, cy: first.y, r: 9 * u, class: 'close-hint' }, this.overlay);
      }
    }

    const showPath = (path: SketchPath, pi: number, withHandles: boolean) => {
      path.anchors.forEach((a, ai) => {
        const selected = selection?.pathIndex === pi && selection.anchorIndex === ai;
        if (withHandles)
          for (const h of [a.hin, a.hout])
            if (h && Math.hypot(h.x - a.x, h.y - a.y) > 0.5) {
              svgEl('line', { x1: a.x, y1: a.y, x2: h.x, y2: h.y, class: 'handle-line' }, this.overlay);
              svgEl('circle', { cx: h.x, cy: h.y, r: 4 * u, class: 'handle' }, this.overlay);
            }
        const s = (selected ? 5 : 4) * u;
        svgEl(
          'rect',
          { x: a.x - s, y: a.y - s, width: 2 * s, height: 2 * s, class: selected ? 'anchor selected' : 'anchor' },
          this.overlay,
        );
      });
    };

    if (tool === 'pen' && activePath !== null && doc.paths[activePath]) showPath(doc.paths[activePath], activePath, true);
    if (tool === 'select') {
      doc.paths.forEach((p, i) => {
        const isSel = selection?.pathIndex === i;
        if (isSel) showPath(p, i, true);
        else
          p.anchors.forEach((a) =>
            svgEl('rect', { x: a.x - 3 * u, y: a.y - 3 * u, width: 6 * u, height: 6 * u, class: 'anchor faint' }, this.overlay),
          );
      });
      if (selection && selection.anchorIndex === null) {
        const inkPath = this.ink.querySelector(`[data-path="${selection.pathIndex}"]`);
        inkPath?.classList.add('selected');
      }
    }
    this.svg.dataset.tool = tool;
  }

  static docIsEmpty(doc: SketchDoc): boolean {
    return !doc.paths.some((p) => p.anchors.length > 1);
  }
}
