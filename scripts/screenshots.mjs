/**
 * Captures the README screenshots into screenshots/.
 *   npm run screenshots   (builds, serves dist/ on :4175, drives Chromium)
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4175;
const URL_ = `http://localhost:${PORT}/`;
const OUT = new URL('../screenshots/', import.meta.url).pathname;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(URL_)).ok) break;
  } catch {}
  await sleep(200);
}

const browser = await chromium.launch();

async function open({ width = 1280, height = 900, dark = false, scale = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(URL_);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function preset(page, id, n) {
  await page.evaluate((id) => window.vonts.loadPreset(id), id);
  await page.waitForFunction((n) => Number(document.body.dataset.generated ?? 0) >= n, n);
  await page.evaluate(() => document.fonts.ready);
}

async function setText(page, texts) {
  await page.evaluate((texts) => {
    for (const [sel, t] of Object.entries(texts)) document.querySelector(sel).textContent = t;
  }, texts);
}

const shot = (page, name, opts = {}) => page.screenshot({ path: `${OUT}${name}.png`, ...opts });

// 1. Hero: the quill sketch and its alphabet.
{
  const page = await open({ height: 1500 });
  await preset(page, 'quill', 1);
  await shot(page, '01-hero-quill');
  await page.close();
}

// 2. Drawing in progress: pen handles and the rubber band.
{
  const page = await open({ height: 1100 });
  const pad = page.getByTestId('pad');
  await pad.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const box = await pad.boundingBox();
  const P = (x, y) => [box.x + (x / 1000) * box.width, box.y + (y / 1000) * box.height];
  const drag = async (a, b) => {
    await page.mouse.move(...P(...a));
    await page.mouse.down();
    await page.mouse.move(...P((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
    await page.mouse.move(...P(...b));
    await page.mouse.up();
  };
  await page.mouse.click(...P(260, 330));
  await drag([330, 690], [420, 790]);
  await drag([560, 360], [620, 250]);
  await drag([700, 690], [760, 760]);
  await page.mouse.move(...P(820, 330));
  await page.locator('.studio').screenshot({ path: `${OUT}02-pen-tool.png` });
  await page.close();
}

// 3. A square becomes a whole block alphabet.
{
  const page = await open({ height: 1100 });
  await preset(page, 'block', 1);
  await setText(page, { '.w1': 'Blockparty', '.w2': 'SQUARE PEGS 42 round holes 0', '.w4': 'BLOCK', '.w5': 'One square, four corners, sixty-two letters.' });
  await page.locator('.glyphs').screenshot({ path: `${OUT}03-block-alphabet.png` });
  await page.locator('.waterfall').screenshot({ path: `${OUT}04-block-specimen.png` });
  await page.close();
}

// 4. A zig-zag reads as wobble (and as a "w").
{
  const page = await open({ height: 1000 });
  await preset(page, 'zigzag', 1);
  await setText(page, { '.w1': 'Wobbly', '.w2': 'Nervous zigzag energy 77', '.w4': 'ZAP', '.w5': 'Alternating corners become hand-drawn jitter.' });
  await page.locator('.waterfall').screenshot({ path: `${OUT}05-zigzag-specimen.png` });
  await page.close();
}

// 5. Inspector close-up of a calligraphic g.
{
  const page = await open({ height: 900 });
  await preset(page, 'ribbon', 1);
  await page.locator('.cell[data-char="g"]').click();
  await page.waitForTimeout(150);
  await shot(page, '06-inspector');
  await page.close();
}

// 6. Dark mode slab.
{
  const page = await open({ height: 1250, dark: true });
  await preset(page, 'slab', 1);
  await setText(page, { '.w1': 'Slabtastic', '.w2': 'Heavy metal type foundry 1999', '.w4': 'LOUD', '.w5': 'Short kinked stroke ends turned into serifs.' });
  await page.locator('.glyphs').scrollIntoViewIfNeeded();
  await page.locator('main').screenshot({ path: `${OUT}07-dark-slab.png`, clip: undefined });
  await page.close();
}

// 7. Phone.
{
  const page = await open({ width: 390, height: 1500, scale: 2 });
  await preset(page, 'hex', 1);
  await shot(page, '08-mobile-hex');
  await page.close();
}

// 8. Gallery: every preset setting the same word.
{
  const page = await open({ width: 1340, height: 900 });
  const tiles = [];
  let n = 0;
  for (const id of ['loop', 'quill', 'block', 'slab', 'zigzag', 'hex', 'wide-a', 'ribbon']) {
    await preset(page, id, ++n);
    await setText(page, { '.w1': 'Vonts' });
    const buf = await page.locator('.w1').screenshot({ omitBackground: true });
    const thumb = await page.locator(`[data-preset="${id}"] svg`).evaluate((s) => s.outerHTML);
    tiles.push({ id, img: buf.toString('base64'), thumb });
  }
  const html = `<!doctype html><html><body style="margin:0;background:#f3efe6;background-image:radial-gradient(#d9d2c3 1.2px,transparent 1.3px);background-size:22px 22px;font-family:system-ui">
  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;padding:26px;width:1320px;box-sizing:border-box">
  ${tiles
    .map(
      (t, i) => `<div style="background:#fffdf8;border:2px solid #171512;border-radius:14px;box-shadow:5px 5px 0 #171512;padding:10px 14px;display:flex;align-items:center;gap:12px;transform:rotate(${i % 2 ? 0.6 : -0.6}deg)">
      <div style="width:64px;height:64px;flex:none;background:#f3efe6;border-radius:10px;color:#171512">${t.thumb.replace('<svg', '<svg style="width:64px;height:64px;fill:none;stroke:#171512;stroke-width:34;stroke-linecap:round;stroke-linejoin:round"')}</div>
      <img src="data:image/png;base64,${t.img}" style="height:92px;max-width:430px;min-width:0;object-fit:contain;object-position:left"/>
      <span style="margin-left:auto;font:12px ui-monospace,monospace;color:#6f6a60">${t.id}</span></div>`,
    )
    .join('')}
  </div></body></html>`;
  await page.setContent(html);
  await page.locator('div').first().screenshot({ path: `${OUT}00-gallery.png` });
  await page.close();
}

// 9. Temperature ladder: one sketch, rising temperature.
{
  const page = await open({ width: 1340, height: 900 });
  await preset(page, 'loop', 1);
  const rows = [];
  let n = 1;
  // Seed 3 happens to show every level clearly: exaggeration, then serifs, then facets and drift.
  for (const [t, seed] of [[0, 3], [0.25, 3], [0.5, 3], [0.75, 3], [1, 3]]) {
    await page.evaluate(([t, seed]) => window.vonts.setTemperature(t, seed), [t, seed]);
    await page.waitForFunction((n) => Number(document.body.dataset.generated ?? 0) >= n, ++n);
    await page.evaluate(() => document.fonts.ready);
    await setText(page, { '.w1': 'Surprising 42' });
    await page.locator('.w1').evaluate((el) => Object.assign(el.style, { whiteSpace: 'nowrap', fontSize: '92px', width: 'max-content' }));
    const img = (await page.locator('.w1').screenshot({ omitBackground: true })).toString('base64');
    const label = await page.getByTestId('temperature-value').textContent();
    rows.push({ t, label, img });
  }
  const html = `<!doctype html><html><body style="margin:0;background:#f3efe6;background-image:radial-gradient(#d9d2c3 1.2px,transparent 1.3px);background-size:22px 22px;font-family:system-ui">
  <div style="padding:26px;width:1320px;box-sizing:border-box;display:grid;gap:14px">
  ${rows
    .map(
      (r, i) => `<div style="display:flex;align-items:center;gap:18px;background:#fffdf8;border:2px solid #171512;border-radius:14px;box-shadow:5px 5px 0 #171512;padding:8px 16px">
      <div style="flex:none;width:150px"><div style="height:10px;border-radius:5px;background:#e3ddd0;overflow:hidden"><div style="height:100%;width:${r.t * 100}%;background:repeating-linear-gradient(-45deg,#ff5a36 0 8px,#ffd23f 8px 16px)"></div></div>
      <div style="font:600 14px ui-monospace,monospace;margin-top:6px;color:#171512">${r.label}</div></div>
      <img src="data:image/png;base64,${r.img}" style="height:96px;max-width:1080px;object-fit:contain;object-position:left"/></div>`,
    )
    .join('')}
  </div></body></html>`;
  await page.setContent(html);
  await page.locator('div').first().screenshot({ path: `${OUT}09-temperature.png` });
  await page.close();
}

await browser.close();
server.kill();
console.log('screenshots written to', OUT);
