/// <reference lib="webworker" />
import { generate } from './generator';
import { GlyphClassifier } from './classifier/classifier';
import type { SerializedModel } from './classifier/mlp';
import weights from './classifier/weights.json';
import type { EngineRequest, EngineResponse } from './engine';

const classifier = new GlyphClassifier(weights as unknown as SerializedModel);

self.onmessage = (e: MessageEvent<EngineRequest>) => {
  const { id, doc, weight } = e.data;
  let msg: EngineResponse;
  try {
    msg = { id, result: generate(doc, { weight, classifier }) };
  } catch (err) {
    msg = { id, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
};
