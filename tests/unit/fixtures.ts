import { anchor, type SketchDoc, type Anchor } from '../../src/sketch/model';

const K = 0.5523;

/** A circle drawn the Illustrator way: four smooth anchors. */
export function circleDoc(cx = 500, cy = 500, r = 200): SketchDoc {
  const k = r * K;
  const anchors: Anchor[] = [
    anchor(cx + r, cy, { x: cx + r, y: cy + k }, { x: cx + r, y: cy - k }),
    anchor(cx, cy - r, { x: cx + k, y: cy - r }, { x: cx - k, y: cy - r }),
    anchor(cx - r, cy, { x: cx - r, y: cy - k }, { x: cx - r, y: cy + k }),
    anchor(cx, cy + r, { x: cx - k, y: cy + r }, { x: cx + k, y: cy + r }),
  ];
  return { paths: [{ id: 'c', anchors, closed: true }] };
}

export function polyDoc(pts: [number, number][], closed = false): SketchDoc {
  return { paths: [{ id: 'p', anchors: pts.map(([x, y]) => anchor(x, y)), closed }] };
}

/** A square (4 corners) drawn with straight segments. */
export const squareDoc = (): SketchDoc =>
  polyDoc(
    [
      [300, 300],
      [700, 300],
      [700, 700],
      [300, 700],
    ],
    true,
  );
