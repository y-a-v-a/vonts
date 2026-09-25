import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type * as OpenType from 'opentype.js';
import { padTools, drawN, generatedCount } from './helpers';

// Node resolves opentype.js to its UMD build here, which only works through require().
const { parse } = createRequire(import.meta.url)('opentype.js') as typeof OpenType;

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  (page as unknown as { errors: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([]);
});

test('starts with an empty pad and 62 empty glyph cells', async ({ page }) => {
  await expect(page.getByTestId('glyph-cell')).toHaveCount(62);
  await expect(page.locator('.cell.empty')).toHaveCount(62);
  await expect(page.getByTestId('export')).toBeDisabled();
  const chars = await page.getByTestId('glyph-cell').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.char).join(''));
  expect(chars).toBe('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
});

test('pen tool draws lines and curves as SVG paths', async ({ page }) => {
  const pad = await padTools(page);
  await pad.click(200, 700);
  await pad.drag([500, 300], [650, 300]);
  await pad.click(800, 700);
  await page.keyboard.press('Enter');
  const d = await page.locator('#pad .stroke').getAttribute('d');
  expect(d).toMatch(/^M200 700 C/);
  const sketch = await page.evaluate(() => window.vonts.sketch);
  expect(sketch.paths).toHaveLength(1);
  expect(sketch.paths[0].anchors).toHaveLength(3);
  expect(sketch.paths[0].anchors[1].hout).toEqual({ x: 650, y: 300 });
});

test('glyphs are generated automatically after three idle seconds', async ({ page }) => {
  await drawN(page);
  await expect(page.getByTestId('status')).toContainText('pause');
  await page.waitForTimeout(2000);
  expect(await generatedCount(page)).toBe(0);
  await expect.poll(() => generatedCount(page), { timeout: 5000 }).toBe(1);
  await expect(page.locator('.cell.empty')).toHaveCount(0);
  const ds = await page.locator('.cell .glyph').evaluateAll((els) => els.map((e) => e.getAttribute('d') ?? ''));
  expect(ds.every((d) => d.startsWith('M') && d.length > 20)).toBe(true);
  await expect(page.getByTestId('status')).toContainText('Generated 62 glyphs');
  await expect(page.getByTestId('traits').locator('li')).toHaveCount(9);
  await expect(page.getByTestId('export')).toBeEnabled();
  await expect(page.getByTestId('specimen').locator('path').first()).toBeAttached();
});

test('drawing again restarts the idle countdown', async ({ page }) => {
  const pad = await padTools(page);
  await pad.click(300, 300);
  await pad.click(300, 700);
  await page.waitForTimeout(2000);
  await pad.click(600, 700); // still drawing: resets the timer
  await page.waitForTimeout(2000);
  expect(await generatedCount(page)).toBe(0);
  await expect.poll(() => generatedCount(page), { timeout: 4000 }).toBe(1);
});

test('the drawing is recognised and placed into its slot', async ({ page }) => {
  await drawN(page);
  await page.getByRole('button', { name: 'Generate now' }).click();
  await expect.poll(() => generatedCount(page)).toBe(1);
  const result = await page.evaluate(() => {
    const r = window.vonts.result!;
    return { predictions: r.predictions, anchor: r.anchor };
  });
  expect(result.predictions.length).toBe(3);
  expect(result.predictions.map((p) => p.char)).toContain('n');
  if (result.anchor) await expect(page.locator(`.cell.from-sketch[data-char="${result.anchor}"]`)).toHaveCount(1);
  await expect(page.getByTestId('prediction')).not.toBeEmpty();
});

test('exports a valid OpenType font', async ({ page }) => {
  await drawN(page);
  await page.getByRole('button', { name: 'Generate now' }).click();
  await expect.poll(() => generatedCount(page)).toBe(1);
  await page.getByLabel('Font name').fill('My Test Face');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  expect(download.suggestedFilename()).toBe('My-Test-Face.otf');
  const bytes = readFileSync((await download.path())!);
  const font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  expect(font.numGlyphs).toBe(64);
  expect(JSON.stringify(font.names)).toContain('My Test Face');
  for (const ch of ['a', 'Q', '7']) expect(font.charToGlyph(ch).path.commands.length).toBeGreaterThan(3);
});

test('weight slider regenerates with thicker strokes', async ({ page }) => {
  await drawN(page);
  await page.getByRole('button', { name: 'Generate now' }).click();
  await expect.poll(() => generatedCount(page)).toBe(1);
  const before = await page.locator('.cell[data-char="l"] .glyph').getAttribute('d');
  await page.locator('#weight').fill('140');
  await expect.poll(() => generatedCount(page)).toBe(2);
  const after = await page.locator('.cell[data-char="l"] .glyph').getAttribute('d');
  expect(after).not.toBe(before);
  await expect(page.locator('#weight-value')).toHaveText('140');
});

test('undo, redo and clear', async ({ page }) => {
  const pad = await padTools(page);
  await pad.click(300, 300);
  await pad.click(700, 300);
  await pad.click(700, 700);
  await page.keyboard.press('Enter');
  const count = () => page.evaluate(() => window.vonts.sketch.paths[0]?.anchors.length ?? 0);
  expect(await count()).toBe(3);
  await page.keyboard.press('Control+z');
  expect(await count()).toBe(2);
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(await count()).toBe(3);
  await page.getByRole('button', { name: 'Generate now' }).click();
  await expect.poll(() => generatedCount(page)).toBe(1);
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('#pad .stroke')).toHaveCount(0);
  await expect(page.locator('.cell.empty')).toHaveCount(62);
  await expect(page.getByTestId('export')).toBeDisabled();
});

test('select tool moves anchors and deletes them', async ({ page }) => {
  const pad = await padTools(page);
  await pad.click(300, 300);
  await pad.click(700, 300);
  await pad.click(700, 700);
  await page.keyboard.press('Enter');
  await page.keyboard.press('a');
  await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
  await pad.drag([700, 700], [600, 800]);
  const a = await page.evaluate(() => window.vonts.sketch.paths[0].anchors[2]);
  expect(Math.round(a.x)).toBe(600);
  expect(Math.round(a.y)).toBe(800);
  await pad.click(600, 800);
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => window.vonts.sketch.paths[0].anchors.length)).toBe(2);
});

test('a square sketch yields faceted, chisel-pen glyphs', async ({ page }) => {
  await page.evaluate(() =>
    window.vonts.loadSketch({
      paths: [
        {
          id: 'sq',
          closed: true,
          anchors: [
            { x: 300, y: 300, hin: null, hout: null },
            { x: 700, y: 300, hin: null, hout: null },
            { x: 700, y: 700, hin: null, hout: null },
            { x: 300, y: 700, hin: null, hout: null },
          ],
        },
      ],
    }),
  );
  await page.evaluate(() => window.vonts.generateNow());
  await expect.poll(() => generatedCount(page)).toBe(1);
  await expect(page.locator('[data-trait="bowls"] b')).toHaveText('4-sided');
  await expect(page.locator('[data-trait="pen"] b')).toHaveText('chisel');
});
