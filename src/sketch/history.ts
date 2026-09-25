import { type SketchDoc, cloneDoc } from './model';

/** Snapshot-based undo/redo. Documents are small, so full copies are cheap and robust. */
export class History {
  private past: string[] = [];
  private future: string[] = [];
  private current: string;

  constructor(
    initial: SketchDoc,
    private readonly limit = 200,
  ) {
    this.current = JSON.stringify(initial);
  }

  /** Record a new state. Returns false when nothing changed. */
  push(doc: SketchDoc): boolean {
    const next = JSON.stringify(doc);
    if (next === this.current) return false;
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = next;
    this.future = [];
    return true;
  }

  undo(): SketchDoc | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    return JSON.parse(prev) as SketchDoc;
  }

  redo(): SketchDoc | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    return JSON.parse(next) as SketchDoc;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** The last committed document. */
  snapshot(): SketchDoc {
    return cloneDoc(JSON.parse(this.current) as SketchDoc);
  }
}
