import { describe, it, expect, vi } from 'vitest';
import { ToolController } from '../../src/sketch/tools';
import { emptyDoc, isSmooth, segments } from '../../src/sketch/model';

const click = (t: ToolController, x: number, y: number, mods = {}) => {
  t.pointerDown({ x, y }, mods);
  t.pointerUp({ x, y });
};
const drag = (t: ToolController, from: [number, number], to: [number, number], mods = {}) => {
  t.pointerDown({ x: from[0], y: from[1] }, mods);
  t.pointerMove({ x: (from[0] + to[0]) / 2, y: (from[1] + to[1]) / 2 }, mods);
  t.pointerMove({ x: to[0], y: to[1] }, mods);
  t.pointerUp({ x: to[0], y: to[1] });
};

describe('pen tool', () => {
  it('clicks create corner anchors joined by straight segments', () => {
    const t = new ToolController(emptyDoc());
    click(t, 100, 100);
    click(t, 300, 100);
    click(t, 300, 300);
    t.key('Enter');
    expect(t.doc.paths).toHaveLength(1);
    const path = t.doc.paths[0];
    expect(path.anchors).toHaveLength(3);
    expect(path.closed).toBe(false);
    expect(segments(path).every((s) => s.straight)).toBe(true);
    expect(t.activePath).toBeNull();
  });

  it('click-drag pulls out symmetric handles (smooth anchor)', () => {
    const t = new ToolController(emptyDoc());
    click(t, 100, 500);
    drag(t, [500, 200], [600, 200]);
    const a = t.doc.paths[0].anchors[1];
    expect(a.hout).toEqual({ x: 600, y: 200 });
    expect(a.hin).toEqual({ x: 400, y: 200 });
    expect(isSmooth(a)).toBe(true);
    expect(segments(t.doc.paths[0])[0].straight).toBe(false);
  });

  it('alt-drag creates a cusp (only the out-handle moves)', () => {
    const t = new ToolController(emptyDoc());
    click(t, 100, 500);
    drag(t, [500, 200], [600, 200], { alt: true });
    const a = t.doc.paths[0].anchors[1];
    expect(a.hout).toEqual({ x: 600, y: 200 });
    expect(a.hin).toBeNull();
  });

  it('clicking the first anchor closes the path', () => {
    const t = new ToolController(emptyDoc());
    click(t, 100, 100);
    click(t, 300, 100);
    click(t, 200, 300);
    click(t, 102, 98);
    expect(t.doc.paths[0].closed).toBe(true);
    expect(t.doc.paths[0].anchors).toHaveLength(3);
    expect(t.activePath).toBeNull();
  });

  it('clicking the last anchor retracts its out-handle', () => {
    const t = new ToolController(emptyDoc());
    click(t, 100, 100);
    drag(t, [300, 100], [350, 100]);
    click(t, 300, 100);
    const a = t.doc.paths[0].anchors[1];
    expect(a.hout).toBeNull();
    expect(a.hin).not.toBeNull();
  });

  it('a lone anchor is discarded when the path is finished', () => {
    const t = new ToolController(emptyDoc());
    click(t, 100, 100);
    t.key('Escape');
    expect(t.doc.paths).toHaveLength(0);
  });

  it('clicking an open end resumes that path, reversing if needed', () => {
    const t = new ToolController(emptyDoc());
    click(t, 100, 100);
    click(t, 300, 100);
    t.key('Enter');
    click(t, 100, 100); // first anchor of existing path
    click(t, 100, 300);
    t.key('Enter');
    expect(t.doc.paths).toHaveLength(1);
    expect(t.doc.paths[0].anchors.map((a) => [a.x, a.y])).toEqual([
      [300, 100],
      [100, 100],
      [100, 300],
    ]);
  });

  it('commits after each gesture', () => {
    const onCommit = vi.fn();
    const t = new ToolController(emptyDoc(), 14, { onCommit });
    click(t, 10, 10);
    click(t, 50, 50);
    expect(onCommit).toHaveBeenCalledTimes(2);
  });
});

describe('select tool', () => {
  const setup = () => {
    const t = new ToolController(emptyDoc());
    click(t, 100, 100);
    drag(t, [300, 300], [400, 300]);
    click(t, 500, 100);
    t.key('Enter');
    t.setTool('select');
    return t;
  };

  it('drags an anchor together with its handles', () => {
    const t = setup();
    drag(t, [300, 300], [320, 350]);
    const a = t.doc.paths[0].anchors[1];
    expect([a.x, a.y]).toEqual([320, 350]);
    expect(a.hout).toEqual({ x: 420, y: 350 });
    expect(a.hin).toEqual({ x: 220, y: 350 });
  });

  it('dragging a smooth handle mirrors the opposite one, alt breaks it', () => {
    const t = setup();
    click(t, 300, 300); // select anchor so its handles are visible
    drag(t, [400, 300], [300, 200]);
    let a = t.doc.paths[0].anchors[1];
    expect(a.hout).toEqual({ x: 300, y: 200 });
    expect(a.hin!.x).toBeCloseTo(300);
    expect(a.hin!.y).toBeCloseTo(400);
    drag(t, [300, 200], [380, 220], { alt: true });
    a = t.doc.paths[0].anchors[1];
    expect(a.hout).toEqual({ x: 380, y: 220 });
    expect(a.hin!.y).toBeCloseTo(400);
  });

  it('alt-click toggles an anchor between smooth and corner', () => {
    const t = setup();
    click(t, 300, 300, { alt: true });
    expect(t.doc.paths[0].anchors[1].hin).toBeNull();
    click(t, 300, 300, { alt: true });
    expect(isSmooth(t.doc.paths[0].anchors[1])).toBe(true);
  });

  it('delete removes the selected anchor, then the path when too short', () => {
    const t = setup();
    click(t, 300, 300);
    t.key('Delete');
    expect(t.doc.paths[0].anchors).toHaveLength(2);
    click(t, 100, 100);
    t.key('Backspace');
    expect(t.doc.paths).toHaveLength(0);
  });

  it('clicking a segment selects and drags the whole path', () => {
    const t = new ToolController(emptyDoc());
    click(t, 100, 100);
    click(t, 300, 100);
    t.key('Enter');
    t.setTool('select');
    drag(t, [200, 100], [200, 150]);
    expect(t.selection).toEqual({ pathIndex: 0, anchorIndex: null });
    expect(t.doc.paths[0].anchors.map((a) => a.y)).toEqual([150, 150]);
  });
});
