#!/usr/bin/env node
/**
 * Render Price Guess and look at it.
 *
 * Tests said this game worked long before it was worth looking at, and the first screenshot
 * showed a reveal reading "2999900% out" — true, passing, and useless to a player. Rendering the
 * real screens and checking the images is the only way that class of thing surfaces.
 *
 * Also asserts the two things a screenshot cannot show: no page errors, and no horizontal
 * overflow at 320px.
 *
 *   npx vite --port 5487 --strictPort &   # a port of your own; 5173 may be another session's
 *   node scripts/shoot-price.mjs
 */

import { chromium } from '@playwright/test';
const b = await chromium.launch();
const out = 'docs/overnight/screenshots';
const errors = [];
for (const [name, w, h] of [['mobile', 375, 812], ['desktop', 1440, 900]]) {
  const page = await b.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });

  await page.goto('http://localhost:5487/#/price/setup', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/price-setup-${name}.png`, fullPage: true });

  // play through one round
  const start = page.getByRole('button', { name: /start guessing/i });
  if (await start.count()) {
    await start.click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/price-play-${name}.png`, fullPage: true });

    for (const d of ['3','9','9']) {
      await page.getByRole('button', { name: `Add ${d}`, exact: true }).click();
    }
    await page.waitForTimeout(300);
    const lock = page.getByRole('button', { name: /lock it in/i });
    if (await lock.count()) { await lock.click(); await page.waitForTimeout(1400); }
    await page.screenshot({ path: `${out}/price-reveal-${name}.png`, fullPage: true });
  }

  // horizontal overflow check at 320
  if (name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.waitForTimeout(400);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (over) errors.push('320px: horizontal overflow');
  }
  await page.close();
}
await b.close();
console.log(errors.length ? 'ISSUES:\n' + errors.join('\n') : 'no page errors, no 320px overflow');
