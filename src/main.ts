import './style.css';
import { type SketchDoc, emptyDoc, isDocEmpty, isSketchDoc, cloneDoc } from './sketch/model';
import { History } from './sketch/history';
import { ToolController, type Tool } from './sketch/tools';
import { SketchView } from './ui/sketchView';
import { GlyphGrid } from './ui/glyphGrid';
import { Inspector } from './ui/inspector';
import { LiveFont } from './ui/liveFont';
import { sketchThumb } from './ui/thumb';
import { PRESETS, QUILL, type Preset } from './sketch/presets';
import quillUrl from './assets/fonts/vonts-quill.otf?url';
import slabUrl from './assets/fonts/vonts-slab.otf?url';
import { IdleTimer } from './idle';
import { Engine } from './engine';
import type { GenerationResult } from './generator';
import { el } from './ui/svg';
import { temperatureLevel } from './style/temperature';

/** How long the pad has to be left alone before glyphs are generated. */
const IDLE_MS = 3000;

const $ = <T extends Element>(sel: string): T => {
  const node = document.querySelector<T>(sel);
  if (!node) throw new Error(`Missing ${sel}`);
  return node;
};

const padEl = $<SVGSVGElement>('#pad');
const gridEl = $<HTMLElement>('#grid');
const statusEl = $<HTMLElement>('#status');
const predictionEl = $<HTMLElement>('#prediction');
const traitsEl = $<HTMLElement>('#traits');
const idleBar = $<HTMLElement>('#idle-bar');
const weightEl = $<HTMLInputElement>('#weight');
const weightOut = $<HTMLOutputElement>('#weight-value');
const exportBtn = $<HTMLButtonElement>('#export');
const temperatureEl = $<HTMLInputElement>('#temperature');
const temperatureOut = $<HTMLOutputElement>('#temperature-value');
const rerollBtn = $<HTMLButtonElement>('#reroll');
const familyEl = $<HTMLInputElement>('#family');
const undoBtn = $<HTMLButtonElement>('#undo');
const redoBtn = $<HTMLButtonElement>('#redo');
const toolBtns = [...document.querySelectorAll<HTMLButtonElement>('[data-tool]')];

const history = new History(emptyDoc());
const engine = new Engine();
const inspector = new Inspector($<HTMLDialogElement>('#inspector'));
const grid = new GlyphGrid(gridEl, (ch) => inspector.open(ch));
const liveFont = new LiveFont($<HTMLElement>('#waterfall'));
const padHint = $<HTMLElement>('#pad-hint');
let latest: GenerationResult | null = null;
/** Sampling seed for temperature > 0; Reroll picks a new one. */
let seed = 1;
/** The drawing changed since the glyphs on screen were generated. */
let dirty = false;

const tools = new ToolController(emptyDoc(), 14, {
  onChange: () => view.requestRender(),
  onCommit: (doc) => {
    if (history.push(doc)) docChanged();
    else if (dirty && !isDocEmpty(doc)) idle.poke();
    syncButtons();
  },
});
const view = new SketchView(padEl, tools);
const idle = new IdleTimer(IDLE_MS, () => void run());

function docChanged(): void {
  dirty = true;
  padHint.classList.toggle('gone', !isDocEmpty(tools.doc));
  if (isDocEmpty(tools.doc)) {
    idle.hold();
    showEmpty();
  } else {
    idle.poke();
    setStatus('Keep drawing, or pause for three seconds…');
  }
}

function showEmpty(): void {
  latest = null;
  dirty = false;
  grid.clear();
  liveFont.clear();
  traitsEl.replaceChildren();
  predictionEl.textContent = '';
  exportBtn.disabled = true;
  setStatus('Draw something with the pen: a letter, a mark, a squiggle.');
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function familyName(): string {
  return familyEl.value.trim() || 'Vonts Sketch';
}

function weight(): number {
  return Number(weightEl.value);
}

function temperature(): number {
  return Number(temperatureEl.value) / 100;
}

function syncTemperature(): void {
  const t = temperature();
  temperatureOut.textContent = t > 0 ? `${t.toFixed(2)} ${temperatureLevel(t)}` : 'exact';
  rerollBtn.disabled = t === 0;
}

async function run(): Promise<void> {
  const doc = cloneDoc(tools.doc);
  if (isDocEmpty(doc)) return showEmpty();
  gridEl.classList.add('busy');
  setStatus('Generating…');
  try {
    const result = await engine.generate(doc, weight(), temperature(), seed);
    if (!result) return; // superseded by a newer request
    latest = result;
    dirty = false;
    grid.update(result.glyphs);
    inspector.update(result.glyphs, result.style.xHeight);
    showResult(result);
    exportBtn.disabled = false;
    setStatus(`Generated ${result.glyphs.length} glyphs in ${Math.round(result.ms)} ms.`);
    await liveFont.install(result.glyphs, familyName());
    if (latest !== result) {
      if (!latest) liveFont.clear();
      return;
    }
    document.body.dataset.generated = String(Number(document.body.dataset.generated ?? 0) + 1);
  } catch (err) {
    setStatus(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    gridEl.classList.remove('busy');
  }
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

function showResult(r: GenerationResult): void {
  const [best, ...others] = r.predictions;
  const rest = others.filter((p) => p.p >= 0.01);
  predictionEl.replaceChildren();
  if (best && r.anchor)
    predictionEl.append(
      'Looks like ',
      el('span', { class: 'char', text: best.char }),
      ` (${pct(best.p)}): your drawing fills that slot, the rest follow its lead.` +
        (rest.length ? ` Also: ${rest.map((p) => `${p.char} ${pct(p.p)}`).join(', ')}.` : ''),
    );
  else if (best)
    predictionEl.textContent = `Not sure which character this is (${r.predictions.map((p) => `${p.char} ${pct(p.p)}`).join(' · ')}), so it's treated as a pure style sample.`;

  const s = r.style;
  const bowls = s.facets ? `${s.facets}-sided` : s.roundness < 1.7 ? 'pointed' : s.roundness > 2.8 ? 'squarish' : 'round';
  const traits: [string, string][] = [
    ['bowls', s.facets ? bowls : `${bowls} (n=${s.roundness.toFixed(1)})`],
    ['pen', s.nibShape === 'square' ? 'chisel' : 'round'],
    ['contrast', s.contrast > 0.02 ? `${pct(s.contrast)} at ${Math.round(s.nibAngle)}°` : 'none'],
    ['slant', `${Math.round(s.slant)}°`],
    ['terminals', s.terminal],
    ['wobble', s.jitter > 0.5 ? s.jitter.toFixed(0) : 'none'],
    ['width', `×${s.widthFactor.toFixed(2)}`],
    ['x-height', String(s.xHeight)],
    ['waist', pct(s.waist)],
  ];
  if (r.temperature > 0) traits.push(['temperature', `${temperatureLevel(r.temperature)} ${r.temperature.toFixed(2)} · #${r.seed}`]);
  traitsEl.replaceChildren(
    ...traits.map(([k, v]) => {
      const li = el('li', { 'data-trait': k });
      li.append(`${k} `, el('b', { text: v }));
      return li;
    }),
  );
}

function syncButtons(): void {
  undoBtn.disabled = !history.canUndo;
  redoBtn.disabled = !history.canRedo;
  for (const b of toolBtns) b.setAttribute('aria-pressed', String(b.dataset.tool === tools.tool));
}

function loadDoc(doc: SketchDoc): void {
  tools.setDoc(doc);
  docChanged();
  syncButtons();
}

function undo(): void {
  tools.finishPath();
  const doc = history.undo();
  if (doc) loadDoc(doc);
}

function redo(): void {
  const doc = history.redo();
  if (doc) loadDoc(doc);
}

// ------------------------------------------------------------------ wiring

padEl.addEventListener('pointerdown', () => idle.hold(), { capture: true });

for (const b of toolBtns)
  b.addEventListener('click', () => {
    tools.setTool(b.dataset.tool as Tool);
    syncButtons();
  });
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
$<HTMLButtonElement>('#clear').addEventListener('click', () => tools.clear());
$<HTMLButtonElement>('#generate').addEventListener('click', () => idle.flush());

let temperatureTimer: ReturnType<typeof setTimeout> | undefined;
temperatureEl.addEventListener('input', () => {
  syncTemperature();
  if (isDocEmpty(tools.doc)) return;
  clearTimeout(temperatureTimer);
  temperatureTimer = setTimeout(() => void run(), 120);
});
rerollBtn.addEventListener('click', () => {
  seed = (Math.random() * 0xffffffff) >>> 0 || 1;
  if (!isDocEmpty(tools.doc)) void run();
});

let weightTimer: ReturnType<typeof setTimeout> | undefined;
weightEl.addEventListener('input', () => {
  weightOut.textContent = weightEl.value;
  if (isDocEmpty(tools.doc)) return;
  clearTimeout(weightTimer);
  weightTimer = setTimeout(() => void run(), 120);
});

exportBtn.addEventListener('click', async () => {
  if (!latest) return;
  const { fontToArrayBuffer, fontFileName } = await import('./export/otf');
  const family = familyName();
  const blob = new Blob([fontToArrayBuffer(latest.glyphs, { familyName: family })], { type: 'font/otf' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: fontFileName(family) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  if (document.querySelector('dialog[open]')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }
  if (mod || e.altKey) return;
  if (tools.key(e.key)) {
    e.preventDefault();
    syncButtons();
  }
});

// Countdown bar: fills up while the idle timer runs.
(function tick() {
  idleBar.style.width = idle.pending ? `${(1 - idle.progress()) * 100}%` : '0';
  requestAnimationFrame(tick);
})();

function loadPreset(p: Preset): void {
  weightEl.value = String(p.weight);
  weightOut.textContent = String(p.weight);
  history.push(p.doc);
  loadDoc(cloneDoc(p.doc));
  idle.flush();
}

const presetsEl = $<HTMLElement>('#presets');
for (const p of PRESETS) {
  const b = el('button', { type: 'button', class: 'preset', 'data-preset': p.id, title: `Load the “${p.name}” sketch` }, presetsEl);
  b.append(sketchThumb(p.doc), p.name);
  b.addEventListener('click', () => loadPreset(p));
}

$<HTMLElement>('#credit-thumb').append(sketchThumb(QUILL.doc));
$<HTMLAnchorElement>('#quill-download').href = quillUrl;
$<HTMLAnchorElement>('#slab-download').href = slabUrl;

syncButtons();
syncTemperature();

/** Small scripting hook (used by the e2e tests, handy in the console). */
declare global {
  interface Window {
    vonts: {
      loadSketch(doc: unknown): void;
      readonly sketch: SketchDoc;
      readonly result: GenerationResult | null;
      generateNow(): void;
      loadPreset(id: string): void;
      setTemperature(t: number, seed?: number): void;
    };
  }
}
window.vonts = {
  loadSketch(doc: unknown) {
    if (!isSketchDoc(doc)) throw new Error('Not a sketch document');
    history.push(doc);
    loadDoc(cloneDoc(doc));
  },
  get sketch() {
    return cloneDoc(tools.doc);
  },
  get result() {
    return latest;
  },
  generateNow: () => idle.flush(),
  setTemperature(t: number, s?: number) {
    temperatureEl.value = String(Math.round(Math.max(0, Math.min(1, t)) * 100));
    if (s !== undefined) seed = s >>> 0;
    syncTemperature();
    if (!isDocEmpty(tools.doc)) idle.flush();
  },
  loadPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) throw new Error(`Unknown preset ${id}`);
    loadPreset(p);
  },
};
