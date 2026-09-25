import { type SketchDoc, pathToSvgD, PAD_SIZE } from '../sketch/model';
import { svgEl } from './svg';

/** Small read-only rendering of a sketch (used for presets and the masthead credit). */
export function sketchThumb(doc: SketchDoc, className = 'thumb'): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: `0 0 ${PAD_SIZE} ${PAD_SIZE}`, class: className, 'aria-hidden': 'true' });
  for (const p of doc.paths) svgEl('path', { d: pathToSvgD(p), class: 'thumb-stroke' }, svg);
  return svg;
}
