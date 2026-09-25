import type { Page } from '@playwright/test';

/** Pointer helpers that address the pad in its own 0..1000 coordinate space. */
export async function padTools(page: Page) {
  await page.getByTestId('pad').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const box = (await page.getByTestId('pad').boundingBox())!;
  const at = (x: number, y: number): [number, number] => [box.x + (x / 1000) * box.width, box.y + (y / 1000) * box.height];
  return {
    at,
    async click(x: number, y: number, modifiers: ('Alt' | 'Shift')[] = []) {
      for (const m of modifiers) await page.keyboard.down(m);
      await page.mouse.click(...at(x, y));
      for (const m of modifiers) await page.keyboard.up(m);
    },
    async drag(from: [number, number], to: [number, number]) {
      const [a, b] = at(...from);
      const [c, d] = at(...to);
      await page.mouse.move(a, b);
      await page.mouse.down();
      for (let i = 1; i <= 4; i++) await page.mouse.move(a + ((c - a) * i) / 4, b + ((d - b) * i) / 4);
      await page.mouse.up();
    },
  };
}

/** Draws an "n": a stem, then an arch that ends on the baseline. */
export async function drawN(page: Page) {
  const pad = await padTools(page);
  await pad.click(380, 260);
  await pad.click(380, 760);
  await page.keyboard.press('Enter');
  await pad.click(380, 400);
  await pad.drag([500, 260], [560, 260]);
  await pad.click(620, 400);
  await pad.click(620, 760);
  await page.keyboard.press('Enter');
}

export const generatedCount = (page: Page) => page.evaluate(() => Number(document.body.dataset.generated ?? 0));
