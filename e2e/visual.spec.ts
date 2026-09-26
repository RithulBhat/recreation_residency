import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'test-results/visual';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

const THEMES = ['midnight', 'vinyl', 'y2k', 'daylight'] as const;

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // let entrance animations + lazy routes finish
  await page.waitForTimeout(900);
}

async function expectNoHorizontalOverflow(page: Page) {
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(r.doc, `documentElement.scrollWidth ${r.doc} > innerWidth ${r.inner}`).toBeLessThanOrEqual(r.inner);
  expect(r.body, `body.scrollWidth ${r.body} > innerWidth ${r.inner}`).toBeLessThanOrEqual(r.inner);
}

async function expectIconButtonsLabelled(page: Page) {
  const missing = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter((b) => b.textContent?.trim() === '' && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'))
      .map((b) => b.outerHTML.slice(0, 120)),
  );
  expect(missing, 'icon buttons without aria-label').toEqual([]);
}

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`home · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/');
    await settle(page);
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/home-${name}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/home-${name}-fold.png`, fullPage: false });
  });

  test(`placeholder · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/setup');
    await settle(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/placeholder-${name}.png`, fullPage: false });
  });

  for (const theme of THEMES) {
    test(`home fold · ${theme} · ${name}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('sg:theme', t), theme);
      await page.setViewportSize(vp);
      await page.goto('/#/');
      await settle(page);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: `${OUT}/home-${theme}-${name}-fold.png`, fullPage: false });
    });

    test(`gallery · ${theme} · ${name}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('sg:theme', t), theme);
      await page.setViewportSize(vp);
      await page.goto('/#/gallery');
      await settle(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectNoHorizontalOverflow(page);
      await expectIconButtonsLabelled(page);
      await page.screenshot({ path: `${OUT}/gallery-${theme}-${name}.png`, fullPage: true });
      const sections =
        theme === 'midnight'
          ? ['themes', 'typography', 'buttons', 'chips', 'inputs', 'sliders', 'controls', 'overlays', 'feedback', 'data', 'vinyl', 'visualizer', 'albumart', 'packs', 'modes', 'sections']
          : ['buttons', 'chips', 'sliders', 'vinyl', 'packs'];
      for (const id of sections) {
        const el = page.locator(`[data-gallery="${id}"]`);
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        await el.screenshot({ path: `${OUT}/section-${id}-${theme}-${name}.png` });
      }
    });
  }
}

test('gallery · overlays open · mobile', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/#/gallery');
  await settle(page);
  await page.getByRole('button', { name: 'Open sheet' }).click();
  await page.waitForTimeout(500);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/gallery-sheet-mobile.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Open dialog' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/gallery-dialog-mobile.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/gallery-theme-popover-mobile.png` });
});

test('reduced motion renders', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/#/');
  await settle(page);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/home-reduced-motion.png`, fullPage: false });
});

test('gallery · keyboard interactions', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/gallery');
  await settle(page);

  // Slider: arrow keys step by the variable step (0.05 below 1s)
  const slider = page.getByRole('slider', { name: 'Clip length' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '0.4');
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '10');
  await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveAttribute('aria-valuenow', '9.5');

  // Combobox: type, arrow, enter → onSelect fires (toast)
  const combo = page.getByRole('combobox', { name: 'Guess' });
  await combo.fill('the');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Guessed' })).toBeVisible();

  // Dialog: opens, traps focus, Escape closes
  await page.getByRole('button', { name: 'Open dialog' }).click();
  const dialog = page.getByRole('dialog', { name: 'Give up on this one?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Segmented control: arrow keys move selection
  const escalating = page.getByRole('radio', { name: 'Escalating' }).first();
  await page.getByRole('radio', { name: 'Fixed' }).first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(escalating).toHaveAttribute('aria-checked', 'true');
});
