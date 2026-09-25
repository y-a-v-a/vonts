import { type Polyline, bbox, distToSegment } from '../geometry/vec';

export const GRID = 20;
/** Pixels + log aspect ratio + 2 ink-balance features. */
export const INPUT_SIZE = GRID * GRID + 3;

/**
 * Turn polylines (any coordinate space, y-up) into a normalised feature vector:
 * a GRID x GRID anti-aliased raster of the ink, fitted to its bounding box with the
 * aspect ratio preserved, plus shape statistics the raster normalisation throws away.
 */
export function rasterize(polylines: Polyline[], out = new Float32Array(INPUT_SIZE)): Float32Array {
  out.fill(0);
  const box = bbox(polylines);
  if (!box) return out;
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const pad = 2;
  const span = Math.max(w, h, 1e-6);
  const s = (GRID - 2 * pad) / span;
  const ox = pad + (GRID - 2 * pad - w * s) / 2;
  const oy = pad + (GRID - 2 * pad - h * s) / 2;
  const segs: [number, number, number, number][] = [];
  for (const pl of polylines) {
    const pts = pl.map((p) => ({ x: (p.x - box.minX) * s + ox, y: GRID - ((p.y - box.minY) * s + oy) }));
    if (pts.length === 1) segs.push([pts[0].x, pts[0].y, pts[0].x, pts[0].y]);
    for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y]);
  }
  let mass = 0;
  let mx = 0;
  let my = 0;
  for (let gy = 0; gy < GRID; gy++)
    for (let gx = 0; gx < GRID; gx++) {
      const c = { x: gx + 0.5, y: gy + 0.5 };
      let d = Infinity;
      for (const [ax, ay, bx, by] of segs) {
        // Cheap reject before the exact distance.
        if (Math.min(ax, bx) - 2 > c.x || Math.max(ax, bx) + 2 < c.x || Math.min(ay, by) - 2 > c.y || Math.max(ay, by) + 2 < c.y)
          continue;
        d = Math.min(d, distToSegment(c, { x: ax, y: ay }, { x: bx, y: by }));
        if (d === 0) break;
      }
      const v = Math.max(0, Math.min(1, 1.4 - d));
      out[gy * GRID + gx] = v;
      mass += v;
      mx += v * gx;
      my += v * gy;
    }
  const n = GRID * GRID;
  out[n] = Math.max(-1.5, Math.min(1.5, Math.log((w + 1e-6) / (h + 1e-6))));
  out[n + 1] = mass > 0 ? mx / mass / GRID - 0.5 : 0;
  out[n + 2] = mass > 0 ? my / mass / GRID - 0.5 : 0;
  return out;
}
