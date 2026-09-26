import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'test-results/stats';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

const SECTIONS = ['rank', 'ears', 'form', 'packs', 'achievements', 'songs', 'data'] as const;

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // lazy route + entrance animations + number tickers
  await page.waitForTimeout(1200);
}

async function expectNoHorizontalOverflow(page: Page) {
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    inner: window.innerWidth,
    // Decorative blobs are `pointer-events-none` and clipped by an
    // `overflow-hidden` ancestor, so their unclipped rect is expected to poke
    // out. Everything else past the edge is a real bug.
    widest: Array.from(document.querySelectorAll<HTMLElement>('main *'))
      .filter((el) => getComputedStyle(el).pointerEvents !== 'none')
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 4)
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 140)),
  }));
  expect(r.widest, 'elements past the right edge').toEqual([]);
  expect(r.doc, `documentElement.scrollWidth ${r.doc} > innerWidth ${r.inner}`).toBeLessThanOrEqual(r.inner);
  expect(r.body, `body.scrollWidth ${r.body} > innerWidth ${r.inner}`).toBeLessThanOrEqual(r.inner);
}

async function expectIconButtonsLabelled(page: Page) {
  const missing = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter(
        (b) =>
          b.textContent?.trim() === '' && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'),
      )
      .map((b) => b.outerHTML.slice(0, 140)),
  );
  expect(missing, 'icon buttons without aria-label').toEqual([]);
}

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`stats · empty · ${name}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.setViewportSize(vp);
    await page.goto('/#/stats');
    await settle(page);

    await expect(page.getByRole('heading', { name: 'Your musical brain' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nothing recorded yet' })).toBeVisible();
    const play = page.getByRole('link', { name: 'Play now' });
    await expect(play).toBeVisible();
    await expect(play).toHaveAttribute('href', /#\/setup$/);

    // The achievement teaser still renders the full roster, all locked.
    await expect(page.getByRole('tab', { name: /^Unlocked/ })).toContainText('0');
    await expect(page.getByRole('tab', { name: /^All/ })).toContainText('53');

    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/empty-${name}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/empty-${name}-fold.png` });
  });

  test(`stats · demo · ${name}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.setViewportSize(vp);
    await page.goto('/#/stats?demo=1');
    await settle(page);

    // Rank hero
    await expect(page.getByText(/Level \d+ \/ 14/)).toBeVisible();
    await expect(page.getByText('Total score')).toBeVisible();

    // Your ears
    await expect(page.getByRole('heading', { name: 'How short can you go?' })).toBeVisible();
    await expect(page.getByText(/You're (deadly|dangerous|solid) at |Your best window is /)).toBeVisible();

    // Recent form
    await expect(page.getByText(/^Last \d+ games$/)).toBeVisible();
    await expect(page.locator('[aria-controls^="game-detail-"]')).toHaveCount(8);

    // Packs
    await expect(page.getByRole('heading', { name: 'Your strongest packs' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Most played' })).toBeVisible();

    // Achievements — some unlocked
    const unlockedTab = page.getByRole('tab', { name: /^Unlocked/ });
    await expect(unlockedTab).toBeVisible();
    await expect(unlockedTab).not.toContainText(/\b0\b/);

    // Track history
    await expect(page.getByRole('heading', { name: "Songs you've met" })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search your song history' })).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/demo-${name}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/demo-${name}-fold.png` });

    // Per-section shots — a full-page capture of this screen is far too tall
    // to review in one go.
    for (const id of SECTIONS) {
      const section = page.locator(`section[aria-labelledby="${id}-title"]`);
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await section.screenshot({ path: `${OUT}/section-${id}-${name}.png` });
    }
  });
}

test('stats · demo · interactions', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/stats?demo=1');
  await settle(page);

  // Expanding a game row reveals the stored record detail.
  const row = page.locator('[aria-controls^="game-detail-"]').first();
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Avg clip heard').first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/demo-game-expanded.png` });

  // Achievement filter tabs.
  await page.getByRole('tab', { name: /^Locked/ }).click();
  await expect(page.getByRole('tab', { name: /^Locked/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('???').first()).toBeVisible();
  await page.getByRole('tab', { name: /^Unlocked/ }).click();
  await expect(page.getByText('???')).toHaveCount(0);

  // History search narrows the list.
  const search = page.getByRole('searchbox', { name: 'Search your song history' });
  await search.fill('arijit');
  await expect(page.getByText('Tum Hi Ho')).toBeVisible();
  await expect(page.getByText('Blinding Lights')).toHaveCount(0);
  await search.fill('zzzzz');
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
  await search.fill('');

  // Export offers a JSON download.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^songooner-stats-\d{4}-\d{2}-\d{2}\.json$/);

  // Reset asks first, then empties the page.
  await page.getByRole('button', { name: 'Reset' }).click();
  const dialog = page.getByRole('dialog', { name: 'Erase every stat?' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(450); // let the panel finish springing in
  await page.screenshot({ path: `${OUT}/demo-reset-dialog.png` });
  await page.getByRole('button', { name: 'Erase everything' }).click();
  await expect(page.getByRole('heading', { name: 'Nothing recorded yet' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('stats · one h1, no duplicate ids, fits 320 px', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/#/stats?demo=1');
  await settle(page);
  await expect(page.getByText(/Level \d+ \/ 14/)).toBeVisible();
  expect(await page.locator('h1').count(), 'exactly one h1').toBe(1);
  const dupes = await page.evaluate(() => {
    const seen = new Map<string, number>();
    for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`);
  });
  expect(dupes, 'duplicate element ids').toEqual([]);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/demo-320.png`, fullPage: true });
});

test('stats · demo · reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/#/stats?demo=1');
  await settle(page);
  await expect(page.getByText(/Level \d+ \/ 14/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/demo-reduced-motion.png` });
});
