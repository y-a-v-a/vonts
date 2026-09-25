/**
 * A tiny two-layer perceptron (input -> ReLU hidden -> softmax) with no dependencies.
 * Weights ship as int8 per-tensor-quantised base64 so the model is ~80 KB.
 */
export interface MLPShape {
  input: number;
  hidden: number;
  output: number;
}

export interface MLPWeights extends MLPShape {
  w1: Float32Array; // hidden x input
  b1: Float32Array;
  w2: Float32Array; // output x hidden
  b2: Float32Array;
}

export interface SerializedModel extends MLPShape {
  labels: string[];
  tensors: Record<'w1' | 'b1' | 'w2' | 'b2', { scale: number; data: string }>;
  meta?: Record<string, unknown>;
}

export function createMLP(shape: MLPShape, rand: () => number): MLPWeights {
  const init = (fanIn: number, n: number) => {
    const a = Math.sqrt(6 / fanIn);
    return Float32Array.from({ length: n }, () => (rand() * 2 - 1) * a);
  };
  return {
    ...shape,
    w1: init(shape.input, shape.hidden * shape.input),
    b1: new Float32Array(shape.hidden),
    w2: init(shape.hidden, shape.output * shape.hidden),
    b2: new Float32Array(shape.output),
  };
}

export function forward(
  m: MLPWeights,
  x: Float32Array,
  hidden: Float32Array = new Float32Array(m.hidden),
  out: Float32Array = new Float32Array(m.output),
): Float32Array {
  const { input, w1, b1, w2, b2 } = m;
  for (let j = 0; j < m.hidden; j++) {
    let s = b1[j];
    const row = j * input;
    for (let i = 0; i < input; i++) s += w1[row + i] * x[i];
    hidden[j] = s > 0 ? s : 0;
  }
  let max = -Infinity;
  for (let k = 0; k < m.output; k++) {
    let s = b2[k];
    const row = k * m.hidden;
    for (let j = 0; j < m.hidden; j++) s += w2[row + j] * hidden[j];
    out[k] = s;
    if (s > max) max = s;
  }
  let sum = 0;
  for (let k = 0; k < m.output; k++) sum += out[k] = Math.exp(out[k] - max);
  for (let k = 0; k < m.output; k++) out[k] /= sum;
  return out;
}

/** Adam optimiser state + one mini-batch training step. Returns the mean cross-entropy loss. */
export class Trainer {
  private readonly params: Float32Array[];
  private readonly grads: Float32Array[];
  private readonly m1: Float32Array[];
  private readonly m2: Float32Array[];
  private t = 0;
  private readonly hidden: Float32Array;
  private readonly probs: Float32Array;
  private readonly dHidden: Float32Array;

  constructor(
    private readonly model: MLPWeights,
    private readonly lr = 0.002,
    private readonly l2 = 1e-5,
  ) {
    this.params = [model.w1, model.b1, model.w2, model.b2];
    this.grads = this.params.map((p) => new Float32Array(p.length));
    this.m1 = this.params.map((p) => new Float32Array(p.length));
    this.m2 = this.params.map((p) => new Float32Array(p.length));
    this.hidden = new Float32Array(model.hidden);
    this.probs = new Float32Array(model.output);
    this.dHidden = new Float32Array(model.hidden);
  }

  step(xs: Float32Array[], ys: number[]): number {
    const m = this.model;
    const [gw1, gb1, gw2, gb2] = this.grads;
    for (const g of this.grads) g.fill(0);
    let loss = 0;
    for (let n = 0; n < xs.length; n++) {
      const x = xs[n];
      forward(m, x, this.hidden, this.probs);
      loss -= Math.log(Math.max(1e-9, this.probs[ys[n]]));
      this.dHidden.fill(0);
      for (let k = 0; k < m.output; k++) {
        const d = this.probs[k] - (k === ys[n] ? 1 : 0);
        gb2[k] += d;
        const row = k * m.hidden;
        for (let j = 0; j < m.hidden; j++) {
          gw2[row + j] += d * this.hidden[j];
          this.dHidden[j] += d * m.w2[row + j];
        }
      }
      for (let j = 0; j < m.hidden; j++) {
        if (this.hidden[j] <= 0) continue;
        const d = this.dHidden[j];
        gb1[j] += d;
        const row = j * m.input;
        for (let i = 0; i < m.input; i++) if (x[i] !== 0) gw1[row + i] += d * x[i];
      }
    }
    this.t++;
    const b1 = 0.9;
    const b2 = 0.999;
    const c1 = 1 - Math.pow(b1, this.t);
    const c2 = 1 - Math.pow(b2, this.t);
    const inv = 1 / xs.length;
    this.params.forEach((p, pi) => {
      const g = this.grads[pi];
      const mm = this.m1[pi];
      const vv = this.m2[pi];
      for (let i = 0; i < p.length; i++) {
        const gi = g[i] * inv + this.l2 * p[i];
        mm[i] = b1 * mm[i] + (1 - b1) * gi;
        vv[i] = b2 * vv[i] + (1 - b2) * gi * gi;
        p[i] -= (this.lr * (mm[i] / c1)) / (Math.sqrt(vv[i] / c2) + 1e-8);
      }
    });
    return loss / xs.length;
  }
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function quantize(t: Float32Array): { scale: number; data: string } {
  let max = 0;
  for (const v of t) max = Math.max(max, Math.abs(v));
  const scale = max / 127 || 1;
  const q = new Int8Array(t.length);
  for (let i = 0; i < t.length; i++) q[i] = Math.round(t[i] / scale);
  return { scale, data: toBase64(new Uint8Array(q.buffer)) };
}

function dequantize(q: { scale: number; data: string }): Float32Array {
  const bytes = fromBase64(q.data);
  const i8 = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Float32Array.from(i8, (v) => v * q.scale);
}

export function serialize(m: MLPWeights, labels: string[], meta?: Record<string, unknown>): SerializedModel {
  return {
    input: m.input,
    hidden: m.hidden,
    output: m.output,
    labels,
    tensors: { w1: quantize(m.w1), b1: quantize(m.b1), w2: quantize(m.w2), b2: quantize(m.b2) },
    meta,
  };
}

export function deserialize(s: SerializedModel): { model: MLPWeights; labels: string[] } {
  return {
    labels: s.labels,
    model: {
      input: s.input,
      hidden: s.hidden,
      output: s.output,
      w1: dequantize(s.tensors.w1),
      b1: dequantize(s.tensors.b1),
      w2: dequantize(s.tensors.w2),
      b2: dequantize(s.tensors.b2),
    },
  };
}
