import type { SketchDoc } from './sketch/model';
import type { GenerationResult } from './generator';

export interface EngineRequest {
  id: number;
  doc: SketchDoc;
  weight: number;
  temperature: number;
  seed: number;
}

export type EngineResponse = { id: number; result: GenerationResult } | { id: number; error: string };

/**
 * Runs generation in a Web Worker so drawing never stutters; falls back to the main
 * thread where workers are unavailable. Only the latest request's result is delivered.
 */
export class Engine {
  private worker: Worker | null = null;
  private seq = 0;
  private waiting = new Map<number, { resolve: (r: GenerationResult | null) => void; reject: (e: Error) => void }>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<EngineResponse>) => this.settle(e.data);
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  /** Resolves with null when a newer request superseded this one. */
  generate(doc: SketchDoc, weight: number, temperature = 0, seed = 1): Promise<GenerationResult | null> {
    const id = ++this.seq;
    for (const [pid, w] of this.waiting) if (pid < id) w.resolve(null);
    for (const pid of [...this.waiting.keys()]) if (pid < id) this.waiting.delete(pid);
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      if (this.worker) this.worker.postMessage({ id, doc, weight, temperature, seed } satisfies EngineRequest);
      else void this.inline({ id, doc, weight, temperature, seed });
    });
  }

  private async inline({ id, doc, weight, temperature, seed }: EngineRequest): Promise<void> {
    try {
      const [{ generate }, { loadClassifier }] = await Promise.all([import('./generator'), import('./classifier/classifier')]);
      const classifier = await loadClassifier();
      this.settle({ id, result: generate(doc, { weight, classifier, temperature, seed }) });
    } catch (err) {
      this.settle({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private settle(msg: EngineResponse): void {
    const w = this.waiting.get(msg.id);
    if (!w) return;
    this.waiting.delete(msg.id);
    if ('error' in msg) w.reject(new Error(msg.error));
    else w.resolve(msg.id === this.seq ? msg.result : null);
  }
}
