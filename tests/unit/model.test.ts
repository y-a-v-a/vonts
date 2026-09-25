import { describe, it, expect } from 'vitest';
import { anchor, pathToPolyline, pathToSvgD, isSketchDoc, isSmooth, type SketchPath } from '../../src/sketch/model';
import { History } from '../../src/sketch/history';
import { simplify, densify, signedArea, polylineLength } from '../../src/geometry/vec';

const path = (anchors: SketchPath['anchors'], closed = false): SketchPath => ({ id: 'x', anchors, closed });

describe('sketch model', () => {
  it('serialises lines and curves to SVG path data', () => {
    const p = path([anchor(0, 0), anchor(10, 0, null, { x: 15, y: 5 }), anchor(20, 20, { x: 20, y: 10 })], true);
    expect(pathToSvgD(p)).toBe('M0 0 L10 0 C15 5 20 10 20 20 L0 0 Z');
  });

  it('flattens curves into polylines that end on the anchors', () => {
    const p = path([anchor(0, 0, null, { x: 0, y: 55 }), anchor(100, 100, { x: 45, y: 100 })]);
    const pl = pathToPolyline(p);
    expect(pl.length).toBeGreaterThan(5);
    expect(pl[0]).toEqual({ x: 0, y: 0 });
    expect(pl[pl.length - 1]).toEqual({ x: 100, y: 100 });
    // A quarter-circle-ish arc is longer than its chord.
    expect(polylineLength(pl)).toBeGreaterThan(Math.hypot(100, 100) * 1.05);
  });

  it('detects smooth anchors', () => {
    expect(isSmooth(anchor(0, 0, { x: -5, y: 0 }, { x: 10, y: 0 }))).toBe(true);
    expect(isSmooth(anchor(0, 0, { x: -5, y: 5 }, { x: 10, y: 0 }))).toBe(false);
    expect(isSmooth(anchor(0, 0))).toBe(false);
  });

  it('validates untrusted documents', () => {
    expect(isSketchDoc({ paths: [path([anchor(1, 2)])] })).toBe(true);
    expect(isSketchDoc({ paths: [{ anchors: [{ x: 'a', y: 0 }], closed: false }] })).toBe(false);
    expect(isSketchDoc(null)).toBe(false);
  });
});

describe('history', () => {
  it('undoes and redoes snapshots, ignoring no-op pushes', () => {
    const h = new History({ paths: [] });
    const d1 = { paths: [path([anchor(0, 0), anchor(1, 1)])] };
    expect(h.push(d1)).toBe(true);
    expect(h.push(d1)).toBe(false);
    expect(h.undo()).toEqual({ paths: [] });
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toEqual(d1);
    expect(h.redo()).toBeNull();
  });
});

describe('polyline helpers', () => {
  it('simplify keeps corners and drops collinear points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 0.01 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(simplify(pts, 0.5)).toEqual([pts[0], pts[2], pts[3]]);
  });

  it('densify bounds the step size', () => {
    const out = densify([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10);
    expect(out).toHaveLength(11);
  });

  it('signedArea is positive for counter-clockwise polygons (y-up)', () => {
    expect(signedArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBe(1);
  });
});
