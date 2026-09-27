import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/** Screenshots land in `test-results/` by default; set SCOUT_SHOT_DIR to send them elsewhere. */
const OUT = process.env.SCOUT_SHOT_DIR ?? 'test-results/scout-stats';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

const NARROW = { width: 320, height: 640 } as const;
const WIDE = { width: 1920, height: 1080 } as const;

const EMPTY = '/#/scout/stats';
const DEMO = '/#/scout/stats?demo=1';

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // lazy route + the demo seed's dynamic import + entrance animations + number tickers
  await page.waitForTimeout(1200);
}

async function fresh(page: Page, theme = 'midnight') {
  await page.addInitScript((t) => {
    localStorage.clear();
    localStorage.setItem('sg:theme', t);
  }, theme);
}

async function expectNoHorizontalOverflow(page: Page) {
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    inner: window.innerWidth,
    // Decorative blobs are `pointer-events-none` and clipped by an `overflow-hidden` ancestor, so
    // their unclipped rect is expected to poke out; children of a horizontal scroller (the tab bar)
    // are clipped by design. Everything else past the edge is a real bug.
    widest: Array.from(document.querySelectorAll<HTMLElement>('main *'))
      .filter((el) => getComputedStyle(el).pointerEvents !== 'none')
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .filter((el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return false;
        }
        return true;
      })
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
      .filter((b) => b.textContent?.trim() === '' && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'))
      .map((b) => b.outerHTML.slice(0, 140)),
  );
  expect(missing, 'icon buttons without aria-label').toEqual([]);
}

/** One `<h1>` per route: the outline starts with the screen's own title. */
async function expectSingleH1(page: Page) {
  const h1s = await page.locator('h1').evaluateAll((els) => els.map((el) => el.textContent?.trim().slice(0, 60) ?? ''));
  expect(h1s, 'exactly one h1').toHaveLength(1);
}

/** The count badge inside one of the cabinet's filter tabs. */
async function tabCount(page: Page, name: RegExp): Promise<number> {
  const text = (await page.getByRole('tab', { name }).textContent()) ?? '';
  return Number(text.replace(/\D+/g, ''));
}

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`scout stats · empty · ${name}`, async ({ page }) => {
    await fresh(page);
    await page.setViewportSize(vp);
    await page.goto(EMPTY);
    await settle(page);

    await expect(page.getByRole('heading', { name: 'Your scouting record', level: 1 })).toBeVisible();

    // Rank hero starts at the bottom of the roster, with honest zeros.
    await expect(page.getByTestId('scout-rank-hero')).toContainText('Waterboy');
    await expect(page.getByTestId('scout-rank-hero')).toContainText('Level 1 / 14');

    // The verdict refuses to judge, and says so — rather than the section vanishing.
    const verdict = page.getByTestId('scout-verdict');
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText('No tape on you yet');
    await expect(verdict).toContainText(`0 of 20 rounds towards a verdict`);
    await expect(verdict.getByTestId('scout-verdict-copy')).toHaveCount(0);
    await expect(verdict.getByTestId('scout-verdict-drill')).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Nothing scouted yet' })).toBeVisible();

    // Both empty-state axes still draw their full roster of rows.
    // Every row of an axis is drawn from the first visit, zero rows included.
    expect(await page.getByTestId('scout-mode-chart').getByRole('listitem').count()).toBeGreaterThanOrEqual(7);
    await expect(page.getByTestId('scout-cut-groups').getByRole('listitem')).toHaveCount(9);

    // The league map is the invitation: all 32 franchises, none of them named.
    await expect(page.getByTestId('scout-map-cell')).toHaveCount(32);
    await expect(page.locator('[data-testid="scout-map-cell"][data-known="yes"]')).toHaveCount(0);

    // The cabinet shows the whole roster, locked.
    const roster = await tabCount(page, /^All/);
    expect(roster).toBeGreaterThanOrEqual(47);
    expect(await page.getByTestId('scout-achievement').count()).toBe(roster);
    expect(await tabCount(page, /^Unlocked/)).toBe(0);
    await expect(page.getByTestId('scout-best-call')).toContainText('Nothing named yet');
    await expect(page.getByTestId('scout-recent-form')).toContainText('No runs on the books yet');

    await expectSingleH1(page);
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/empty-${name}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/empty-${name}-fold.png` });
  });

  test(`scout stats · demo · ${name}`, async ({ page }) => {
    await fresh(page);
    await page.setViewportSize(vp);
    await page.goto(DEMO);
    await settle(page);

    await expect(page.getByRole('heading', { name: 'Your scouting record', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nothing scouted yet' })).toHaveCount(0);

    // Rank hero: a real rank, real totals.
    const hero = page.getByTestId('scout-rank-hero');
    await expect(hero).toContainText(/Level \d+ \/ 14/);
    await expect(hero).toContainText('points scouted');
    await expect(hero).toContainText('Accuracy');

    // The verdict names a strength and a weakness, in the pure layer's own words.
    const verdict = page.getByTestId('scout-verdict');
    await expect(verdict).toContainText(/Elite on|strongest room|deep cuts/);
    await expect(verdict).toContainText(/cannot name|blind spot|get away from you/);
    await expect(verdict.getByTestId('scout-verdict-coverage')).toContainText(/\d+ of 32 franchises/);
    await expect(verdict.getByTestId('scout-verdict-copy')).toBeVisible();

    // The blind spot comes with its own rematch: a pack that drills exactly that room.
    const drill = verdict.getByTestId('scout-verdict-drill');
    await expect(drill).toContainText('Drill defensive backs');
    await expect(drill).toHaveAttribute('href', /#\/scout\/setup\?packs=pos-db$/);

    // Every axis of "your eye" is on the page once there is history.
    for (const id of [
      'scout-cut-groups',
      'scout-cut-tiers',
      'scout-cut-conference',
      'scout-cut-divisions',
      'scout-mode-chart',
      'scout-cut-formats',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    // The sharpest and the weakest row are called out by name.
    await expect(page.getByTestId('scout-cut-groups')).toContainText('Sharpest');
    await expect(page.getByTestId('scout-cut-groups')).toContainText('Blind spot');

    // League map: 32 cells, some named, some never faced.
    await expect(page.getByTestId('scout-map-cell')).toHaveCount(32);
    const known = await page.locator('[data-testid="scout-map-cell"][data-known="yes"]').count();
    expect(known).toBeGreaterThan(10);
    expect(known).toBeLessThan(32);

    await expect(page.getByTestId('scout-best-call')).toContainText('Nick Bosa');
    await expect(page.getByTestId('scout-nemeses')).toContainText('Riq Woolen');
    await expect(page.getByTestId('scout-sparkline')).toBeVisible();
    await expect(page.getByTestId('scout-recent-runs').getByRole('listitem').first()).toBeVisible();

    const unlocked = await tabCount(page, /^Unlocked/);
    expect(unlocked).toBeGreaterThan(10);
    expect(unlocked).toBeLessThan(await tabCount(page, /^All/));

    await expectSingleH1(page);
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/demo-${name}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/demo-${name}-fold.png` });
  });
}

test('scout stats · 320 px · nothing escapes the viewport', async ({ page }) => {
  await fresh(page);
  await page.setViewportSize(NARROW);
  for (const route of [EMPTY, DEMO]) {
    await page.goto(route);
    await settle(page);
    await expectNoHorizontalOverflow(page);
    await expectSingleH1(page);
  }
  await page.screenshot({ path: `${OUT}/demo-320.png`, fullPage: true });
});

test('scout stats · 1920 px · the report card holds its shape', async ({ page }) => {
  await fresh(page);
  await page.setViewportSize(WIDE);
  await page.goto(DEMO);
  await settle(page);
  await expect(page.getByTestId('scout-league-map')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/demo-1920.png`, fullPage: true });
});

test('the badge cabinet filters between unlocked and locked', async ({ page }) => {
  await fresh(page);
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(DEMO);
  await settle(page);

  const total = await page.getByTestId('scout-achievement').count();
  expect(total).toBeGreaterThanOrEqual(47);

  await page.getByRole('tab', { name: /^Locked/ }).click();
  await expect(page.locator('[data-testid="scout-achievement"][data-unlocked="yes"]')).toHaveCount(0);
  const locked = await page.getByTestId('scout-achievement').count();

  await page.getByRole('tab', { name: /^Unlocked/ }).click();
  await expect(page.locator('[data-testid="scout-achievement"][data-unlocked="no"]')).toHaveCount(0);
  const unlocked = await page.getByTestId('scout-achievement').count();

  expect(locked + unlocked).toBe(total);
});

test('reset wipes the record behind a confirm, and the demo does not come back', async ({ page }) => {
  await fresh(page);
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(DEMO);
  await settle(page);
  await expect(page.getByTestId('scout-rank-hero')).toContainText(/Level (?!1 \/)\d+ \/ 14/);

  await page.getByTestId('scout-reset').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Erase your scouting record?');

  // Backing out changes nothing.
  await dialog.getByRole('button', { name: 'Keep it' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nothing scouted yet' })).toHaveCount(0);

  await page.getByTestId('scout-reset').click();
  await page.getByTestId('scout-reset-confirm').click();

  await expect(page.getByRole('heading', { name: 'Nothing scouted yet' })).toBeVisible();
  await expect(page.getByTestId('scout-rank-hero')).toContainText('Level 1 / 14');
  await expect(page.locator('[data-testid="scout-map-cell"][data-known="yes"]')).toHaveCount(0);

  // The `?demo=1` seed is dropped from the URL, so a reload cannot resurrect it.
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/scout/stats');
  await page.reload();
  await settle(page);
  await expect(page.getByRole('heading', { name: 'Nothing scouted yet' })).toBeVisible();
  expect(await tabCount(page, /^Unlocked/)).toBe(0);
});

test('scout stats · daylight', async ({ page }) => {
  await fresh(page, 'daylight');
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(DEMO);
  await settle(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'daylight');
  await expect(page.getByTestId('scout-verdict')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/demo-desktop-daylight.png`, fullPage: true });
});
