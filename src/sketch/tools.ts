import { type Vec, dist, mirror, sub, len, normalize, add, scale } from '../geometry/vec';
import {
  type SketchDoc,
  type Anchor,
  anchor,
  newId,
  moveAnchor,
  isSmooth,
  hitAnchor,
  pathToPolyline,
  cloneDoc,
} from './model';
import { distToSegment } from '../geometry/vec';

export type Tool = 'pen' | 'select';

export interface Modifiers {
  alt?: boolean;
  shift?: boolean;
}

export interface Selection {
  pathIndex: number;
  /** null = the whole path is selected. */
  anchorIndex: number | null;
}

type Drag =
  | { kind: 'shape'; pathIndex: number; anchorIndex: number; start: Vec }
  | { kind: 'anchor'; pathIndex: number; anchorIndex: number; last: Vec; moved: boolean; alt: boolean }
  | { kind: 'handle'; pathIndex: number; anchorIndex: number; which: 'hin' | 'hout'; smooth: boolean }
  | { kind: 'path'; pathIndex: number; last: Vec };

export interface ToolCallbacks {
  /** Anything visible changed (including transient hover). */
  onChange?: () => void;
  /** A gesture finished and the document may have been edited. */
  onCommit?: (doc: SketchDoc) => void;
}

const DRAG_THRESHOLD = 3;

/**
 * Minimal Illustrator-style path tools operating on a SketchDoc:
 *  - Pen: click = corner anchor, click-drag = smooth anchor, click first anchor = close,
 *    click last anchor = retract its out-handle, Enter/Esc = finish, click an open end = continue.
 *  - Select (direct selection): drag anchors, handles or whole paths; Alt-click an anchor toggles
 *    corner/smooth; Alt-drag a handle breaks symmetry; Delete removes anchor or path.
 */
export class ToolController {
  doc: SketchDoc;
  tool: Tool = 'pen';
  activePath: number | null = null;
  selection: Selection | null = null;
  hover: Vec | null = null;
  private drag: Drag | null = null;

  constructor(
    doc: SketchDoc,
    /** Pick radius in document units; the view updates it as the pad is resized. */
    public hitRadius = 14,
    private readonly cb: ToolCallbacks = {},
  ) {
    this.doc = doc;
  }

  setDoc(doc: SketchDoc): void {
    this.doc = cloneDoc(doc);
    this.activePath = null;
    this.selection = null;
    this.drag = null;
    this.changed();
  }

  setTool(tool: Tool): void {
    if (tool === this.tool) return;
    this.finishPath();
    this.tool = tool;
    this.selection = null;
    this.changed();
  }

  get isDragging(): boolean {
    return this.drag !== null;
  }

  pointerDown(p: Vec, mods: Modifiers = {}): void {
    if (this.tool === 'pen') this.penDown(p);
    else this.selectDown(p, mods);
    this.changed();
  }

  pointerMove(p: Vec, mods: Modifiers = {}): void {
    this.hover = p;
    const d = this.drag;
    if (d) {
      if (d.kind === 'shape') this.shapeAnchor(d, p, mods);
      else if (d.kind === 'anchor') {
        if (!d.moved && dist(p, d.last) < DRAG_THRESHOLD) return;
        const a = this.anchorAt(d.pathIndex, d.anchorIndex);
        moveAnchor(a, p.x - d.last.x, p.y - d.last.y);
        d.last = p;
        d.moved = true;
      } else if (d.kind === 'handle') this.moveHandle(d, p, mods);
      else if (d.kind === 'path') {
        for (const a of this.doc.paths[d.pathIndex].anchors) moveAnchor(a, p.x - d.last.x, p.y - d.last.y);
        d.last = p;
      }
    }
    this.changed();
  }

  pointerUp(_p?: Vec): void {
    const d = this.drag;
    this.drag = null;
    if (d?.kind === 'anchor' && d.alt && !d.moved) this.toggleSmooth(d.pathIndex, d.anchorIndex);
    this.commit();
  }

  pointerLeave(): void {
    this.hover = null;
    this.changed();
  }

  /** Returns true when the key was handled. */
  key(key: string): boolean {
    switch (key) {
      case 'Escape':
      case 'Enter':
        if (this.activePath !== null) {
          this.finishPath();
          this.commit();
        } else if (this.selection) {
          this.selection = null;
          this.changed();
        }
        return true;
      case 'Delete':
      case 'Backspace':
        return this.deleteSelection();
      case 'p':
      case 'P':
        this.setTool('pen');
        return true;
      case 'a':
      case 'A':
      case 'v':
      case 'V':
        this.setTool('select');
        return true;
      default:
        return false;
    }
  }

  /** Close out the in-progress pen path, dropping it if it is a lone anchor. */
  finishPath(): void {
    if (this.activePath === null) return;
    const path = this.doc.paths[this.activePath];
    if (path && path.anchors.length < 2) this.doc.paths.splice(this.activePath, 1);
    this.activePath = null;
  }

  clear(): void {
    this.doc = { paths: [] };
    this.activePath = null;
    this.selection = null;
    this.drag = null;
    this.commit();
  }

  // ---------------------------------------------------------------- pen

  private penDown(p: Vec): void {
    if (this.activePath !== null) {
      const path = this.doc.paths[this.activePath];
      const first = path.anchors[0];
      const last = path.anchors[path.anchors.length - 1];
      if (path.anchors.length >= 2 && dist(p, first) <= this.hitRadius) {
        path.closed = true;
        this.drag = { kind: 'shape', pathIndex: this.activePath, anchorIndex: 0, start: { x: first.x, y: first.y } };
        this.activePath = null;
        return;
      }
      if (dist(p, last) <= this.hitRadius) {
        last.hout = null;
        return;
      }
      path.anchors.push(anchor(p.x, p.y));
      this.drag = { kind: 'shape', pathIndex: this.activePath, anchorIndex: path.anchors.length - 1, start: p };
      return;
    }

    // Continue an existing open path when clicking one of its end anchors.
    const hit = hitAnchor(this.doc, p, this.hitRadius);
    if (hit) {
      const path = this.doc.paths[hit.pathIndex];
      const isEnd = hit.anchorIndex === 0 || hit.anchorIndex === path.anchors.length - 1;
      if (!path.closed && isEnd && path.anchors.length >= 1) {
        if (hit.anchorIndex === 0 && path.anchors.length > 1) {
          path.anchors.reverse();
          for (const a of path.anchors) [a.hin, a.hout] = [a.hout, a.hin];
        }
        this.activePath = hit.pathIndex;
        return;
      }
    }

    this.doc.paths.push({ id: newId(), anchors: [anchor(p.x, p.y)], closed: false });
    this.activePath = this.doc.paths.length - 1;
    this.drag = { kind: 'shape', pathIndex: this.activePath, anchorIndex: 0, start: p };
  }

  /** Dragging while placing an anchor pulls out symmetric handles (Alt: only the out-handle). */
  private shapeAnchor(d: Extract<Drag, { kind: 'shape' }>, p: Vec, mods: Modifiers): void {
    const a = this.anchorAt(d.pathIndex, d.anchorIndex);
    if (dist(p, a) < DRAG_THRESHOLD) {
      a.hin = a.hout = null;
      return;
    }
    const closingFirst = d.anchorIndex === 0 && this.doc.paths[d.pathIndex].closed;
    if (closingFirst) {
      // Closing drag shapes the incoming side; keep the out-handle unless it must mirror.
      a.hin = mirror(p, a);
      if (!mods.alt) a.hout = { x: p.x, y: p.y };
      return;
    }
    a.hout = { x: p.x, y: p.y };
    if (!mods.alt) a.hin = mirror(p, a);
  }

  // ------------------------------------------------------------- select

  private selectDown(p: Vec, mods: Modifiers): void {
    const handle = this.hitHandle(p);
    if (handle) {
      const a = this.anchorAt(handle.pathIndex, handle.anchorIndex);
      this.selection = { pathIndex: handle.pathIndex, anchorIndex: handle.anchorIndex };
      this.drag = { kind: 'handle', ...handle, smooth: isSmooth(a) };
      return;
    }
    const hit = hitAnchor(this.doc, p, this.hitRadius);
    if (hit) {
      this.selection = { ...hit };
      this.drag = { kind: 'anchor', ...hit, last: p, moved: false, alt: !!mods.alt };
      return;
    }
    const pathIndex = this.hitPath(p);
    if (pathIndex !== null) {
      this.selection = { pathIndex, anchorIndex: null };
      this.drag = { kind: 'path', pathIndex, last: p };
      return;
    }
    this.selection = null;
  }

  private moveHandle(d: Extract<Drag, { kind: 'handle' }>, p: Vec, mods: Modifiers): void {
    const a = this.anchorAt(d.pathIndex, d.anchorIndex);
    a[d.which] = { x: p.x, y: p.y };
    const other = d.which === 'hin' ? 'hout' : 'hin';
    const o = a[other];
    if (d.smooth && !mods.alt && o) {
      const keep = len(sub(o, a));
      const dir = normalize(sub(a, p));
      a[other] = add(a, scale(dir, keep));
    }
  }

  /** Visible handles belong to anchors of the selected path. */
  private hitHandle(p: Vec): { pathIndex: number; anchorIndex: number; which: 'hin' | 'hout' } | null {
    if (!this.selection) return null;
    const { pathIndex } = this.selection;
    const path = this.doc.paths[pathIndex];
    if (!path) return null;
    for (let ai = 0; ai < path.anchors.length; ai++) {
      const a = path.anchors[ai];
      for (const which of ['hout', 'hin'] as const) {
        const h = a[which];
        if (h && dist(h, a) > 1 && dist(h, p) <= this.hitRadius * 0.8) return { pathIndex, anchorIndex: ai, which };
      }
    }
    return null;
  }

  private hitPath(p: Vec): number | null {
    for (let i = this.doc.paths.length - 1; i >= 0; i--) {
      const path = this.doc.paths[i];
      const pl = pathToPolyline(path, 8);
      if (path.closed && pl.length > 1) pl.push(pl[0]);
      for (let k = 1; k < pl.length; k++) if (distToSegment(p, pl[k - 1], pl[k]) <= this.hitRadius * 0.7) return i;
    }
    return null;
  }

  toggleSmooth(pathIndex: number, anchorIndex: number): void {
    const path = this.doc.paths[pathIndex];
    const a = path.anchors[anchorIndex];
    if (a.hin || a.hout) {
      a.hin = a.hout = null;
      return;
    }
    const n = path.anchors.length;
    const prev = path.anchors[anchorIndex - 1] ?? (path.closed ? path.anchors[n - 1] : null);
    const next = path.anchors[anchorIndex + 1] ?? (path.closed ? path.anchors[0] : null);
    const from = prev ?? a;
    const to = next ?? a;
    let dir = normalize(sub(to, from));
    if (len(dir) === 0) dir = { x: 1, y: 0 };
    const reach = Math.max(20, Math.min(prev ? dist(prev, a) : Infinity, next ? dist(next, a) : Infinity) / 3);
    a.hout = add(a, scale(dir, reach));
    a.hin = add(a, scale(dir, -reach));
  }

  private deleteSelection(): boolean {
    const sel = this.selection;
    if (!sel) return false;
    const path = this.doc.paths[sel.pathIndex];
    if (!path) return false;
    if (sel.anchorIndex === null) {
      this.doc.paths.splice(sel.pathIndex, 1);
    } else {
      path.anchors.splice(sel.anchorIndex, 1);
      if (path.closed && path.anchors.length < 3) path.closed = false;
      if (path.anchors.length < 2) this.doc.paths.splice(sel.pathIndex, 1);
    }
    this.selection = null;
    this.activePath = null;
    this.commit();
    return true;
  }

  private anchorAt(pi: number, ai: number): Anchor {
    return this.doc.paths[pi].anchors[ai];
  }

  private changed(): void {
    this.cb.onChange?.();
  }

  private commit(): void {
    this.changed();
    this.cb.onCommit?.(this.doc);
  }
}
