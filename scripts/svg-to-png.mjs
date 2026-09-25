// Dev helper: node scripts/svg-to-png.mjs in.svg out.png
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [, , input, output] = process.argv;
const svg = readFileSync(input, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.locator('svg').screenshot({ path: output });
await browser.close();
