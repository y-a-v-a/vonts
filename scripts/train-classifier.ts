/**
 * Trains the in-browser glyph classifier on synthetic data rendered from the
 * skeleton alphabet in random styles, then writes int8-quantised weights to
 * src/classifier/weights.json.
 *
 *   npm run train:model            # defaults
 *   npm run train:model -- --per-class=500 --epochs=30 --hidden=128
 */
import { writeFileSync } from 'node:fs';
import { CHARSET } from '../src/glyphs/charset';
import { rng } from '../src/glyphs/build';
import { synthGlyph } from '../src/classifier/synth';
import { rasterize, INPUT_SIZE } from '../src/classifier/raster';
import { createMLP, forward, serialize, Trainer, deserialize } from '../src/classifier/mlp';

const arg = (name: string, def: number) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : def;
};
const PER_CLASS = arg('per-class', 400);
const EPOCHS = arg('epochs', 24);
const HIDDEN = arg('hidden', 128);
const BATCH = 32;
const labels = [...CHARSET];

function dataset(perClass: number, seedBase: number) {
  const xs: Float32Array[] = [];
  const ys: number[] = [];
  labels.forEach((ch, y) => {
    for (let i = 0; i < perClass; i++) {
      xs.push(rasterize(synthGlyph(ch, seedBase + y * 100003 + i * 7919)));
      ys.push(y);
    }
  });
  return { xs, ys };
}

console.time('data');
const train = dataset(PER_CLASS, 1);
const test = dataset(40, 987654321);
console.timeEnd('data');

const rand = rng(12345);
const model = createMLP({ input: INPUT_SIZE, hidden: HIDDEN, output: labels.length }, rand);

const evaluate = (m = model) => {
  let ok = 0;
  let top3 = 0;
  test.xs.forEach((x, i) => {
    const p = forward(m, x);
    const ranked = Array.from(p.keys()).sort((a, b) => p[b] - p[a]);
    if (ranked[0] === test.ys[i]) ok++;
    if (ranked.slice(0, 3).includes(test.ys[i])) top3++;
  });
  return { top1: ok / test.xs.length, top3: top3 / test.xs.length };
};

const order = train.xs.map((_, i) => i);
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  const lr = 0.002 * Math.pow(0.5, epoch / 8);
  const trainer = new Trainer(model, lr);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let loss = 0;
  let batches = 0;
  for (let b = 0; b < order.length; b += BATCH) {
    const idx = order.slice(b, b + BATCH);
    loss += trainer.step(
      idx.map((i) => train.xs[i]),
      idx.map((i) => train.ys[i]),
    );
    batches++;
  }
  const { top1, top3 } = evaluate();
  console.log(`epoch ${epoch + 1}/${EPOCHS} loss ${(loss / batches).toFixed(3)} test top1 ${(top1 * 100).toFixed(1)}% top3 ${(top3 * 100).toFixed(1)}%`);
}

const final = evaluate();
const serialized = serialize(model, labels, {
  trainedOn: `${PER_CLASS} synthetic samples per class`,
  epochs: EPOCHS,
  testTop1: Number(final.top1.toFixed(3)),
  testTop3: Number(final.top3.toFixed(3)),
});
const q = evaluate(deserialize(serialized).model);
console.log(`quantised: top1 ${(q.top1 * 100).toFixed(1)}% top3 ${(q.top3 * 100).toFixed(1)}%`);
writeFileSync(new URL('../src/classifier/weights.json', import.meta.url), JSON.stringify(serialized));
console.log('wrote src/classifier/weights.json');
