import type { Polyline } from '../geometry/vec';
import { deserialize, forward, type MLPWeights, type SerializedModel } from './mlp';
import { rasterize } from './raster';

export interface Prediction {
  char: string;
  p: number;
}

export class GlyphClassifier {
  private readonly model: MLPWeights;
  readonly labels: string[];

  constructor(serialized: SerializedModel) {
    const { model, labels } = deserialize(serialized);
    this.model = model;
    this.labels = labels;
  }

  /** Top-k predictions for the drawing, most likely first. */
  classify(polylines: Polyline[], k = 3): Prediction[] {
    if (!polylines.some((p) => p.length > 1)) return [];
    const probs = forward(this.model, rasterize(polylines));
    return Array.from(probs, (p, i) => ({ char: this.labels[i], p }))
      .sort((a, b) => b.p - a.p)
      .slice(0, k);
  }
}

let shared: Promise<GlyphClassifier> | null = null;

/** Lazily loads the bundled weights (kept in their own chunk). */
export function loadClassifier(): Promise<GlyphClassifier> {
  shared ??= import('./weights.json').then((m) => new GlyphClassifier((m.default ?? m) as unknown as SerializedModel));
  return shared;
}
