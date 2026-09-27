import { test, expect, type Page } from '@playwright/test';
import { GAME_LABEL } from '../src/routes';
import { mkdirSync } from 'node:fs';

/**
 * The residency hub — the front door at `/`.
 *
 * `visual.spec.ts` already guards the shell's side of this route (no game nav, the brand's way
 * home, the 320 px header fold). This file owns the hub itself: both worlds render, each one leads
 * into its game, the page survives all four themes and three widths, and the real-number strip says
 * what the data files actually contain.
 */

const OUT = 'test-results/residency';
mkdirSync(OUT, { recursive: true });

const THEMES = ['midnight', 'vinyl', 'y2k', 'daylight'] as const;
const WIDTHS = {
  narrow: { width: 320, height: 640 },
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}

async function openHub(page: Page) {
  await page.goto('/#/');
  await settle(page);
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

const songooner = (page: Page) => page.getByTestId('hub-card-songooner');
const scout = (page: Page) => page.getByTestId('hub-card-highlight-scout');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('every world renders, with its own art and its own pitch', async ({ page }) => {
  await page.setViewportSize(WIDTHS.desktop);
  await openHub(page);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Rithul's Recreation Residency");
  // Derived, never a literal. This asserted 2 and broke the moment a third game shipped — the
  // hub was correct and the test was stale, which is the same shape as the hub's own "7 clue
  // modes" card and the engine's "the subject always wins" assertion. A count typed by hand is a
  // claim that stops being true without anything failing at the time it stops being true.
  await expect(page.getByTestId('residency-games').locator('> li')).toHaveCount(
    Object.keys(GAME_LABEL).length,
  );

  await expect(songooner(page).getByRole('heading', { level: 2 })).toHaveText('Songooner');
  await expect(songooner(page).getByText('Name the track from 0.1 seconds')).toBeVisible();
  // Songooner's identity: the record and the waveform, both the shipped components.
  await expect(songooner(page).locator('.vinyl-disc')).toBeVisible();
  await expect(songooner(page).locator('canvas')).toBeVisible();

  await expect(scout(page).getByRole('heading', { level: 2 })).toHaveText('Highlight Scout');
  await expect(scout(page).getByText('Name the NFL player from a silhouette')).toBeVisible();
  await expect(scout(page).getByText('New', { exact: true })).toBeVisible();
  // …and Scout's is its own world, not a recolour: a chalkboard field and a real ESPN silhouette.
  await expect(scout(page).locator('.hub-stage-scout')).toBeVisible();
  await expect(songooner(page).locator('.hub-stage-scout')).toHaveCount(0);
});

test('the Highlight Scout silhouette is a real headshot, blacked out', async ({ page }) => {
  await page.setViewportSize(WIDTHS.desktop);
  await openHub(page);

  const img = scout(page).locator('img.hub-silhouette');
  await expect(img).toHaveAttribute('src', /a\.espncdn\.com\/i\/headshots\/nfl\/players\/full\/\d+\.png$/);
  // It must actually decode — a broken image would leave an empty frame on the front door.
  await expect
    .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 })
    .toBeGreaterThan(0);
  // …and it must be blacked out and rim lit, not a plain photo.
  const filter = await img.evaluate((el) => getComputedStyle(el).filter);
  expect(filter).toContain('brightness(0)');
  expect(filter).toContain('drop-shadow');
  // The art is decoration: the card's own link owns the clicks.
  await expect(scout(page).locator('.hub-stage-scout')).toHaveAttribute('aria-hidden', 'true');
});

for (const [game, testid, hash, cta] of [
  ['Songooner', 'hub-card-songooner', '#/songooner', 'Play Songooner now'],
  ['Highlight Scout', 'hub-card-highlight-scout', '#/scout', 'Play Highlight Scout now'],
] as const) {
  test(`${game}: the card opens the game, and Play now jumps the queue`, async ({ page }) => {
    await page.setViewportSize(WIDTHS.mobile);
    await openHub(page);

    // Anywhere on the card is the game's home — the title's link stretches over it.
    await page.getByTestId(testid).getByRole('heading', { level: 2 }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(hash);

    await page.goBack();
    await settle(page);
    await page.getByTestId(testid).getByRole('button', { name: cta }).click();
    // The lobby honours `autostart=1`, so this lands on the game's setup screen and may run straight
    // on into a round — either is "in the game", and neither is the hub.
    await expect
      .poll(() => page.evaluate(() => location.hash))
      .toMatch(new RegExp(`^${hash}/(setup|play)`));
  });
}

test('the card art never steals a click from the card', async ({ page }) => {
  await page.setViewportSize(WIDTHS.desktop);
  await openHub(page);
  // A click in the middle of Songooner's record still opens Songooner.
  await songooner(page).locator('.vinyl-disc').first().click({ force: true });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/songooner');
});

test('the strip quotes the real dataset', async ({ page }) => {
  await page.setViewportSize(WIDTHS.desktop);
  await openHub(page);
  const strip = page.getByTestId('hub-inside');
  for (const n of ['220', '2,507', '1,700', '510']) {
    await expect(strip.getByText(n, { exact: true })).toBeVisible();
  }
  await expect(strip.getByText('all 32 teams')).toBeVisible();
});

test('a returning player is greeted; a new one is not', async ({ page }) => {
  await page.setViewportSize(WIDTHS.desktop);
  await openHub(page);
  await expect(page.getByTestId('hub-welcome-back')).toHaveCount(0);

  await page.addInitScript(() => {
    localStorage.setItem(
      'sg:stats',
      JSON.stringify({
        version: 1,
        state: {
          totals: { games: 12, xp: 7000 },
          records: [{ id: 'x', mode: 'blitz', score: 4820, finishedAt: Date.now() - 3 * 3_600_000, rounds: 9, correct: 7 }],
        },
      }),
    );
  });
  // `goto` to the same hash is a same-document navigation, so the new init script only lands on a
  // real reload.
  await page.reload();
  await settle(page);
  const line = page.getByTestId('hub-welcome-back');
  await expect(line).toBeVisible();
  // 6800 XP is "Beat Detective" in src/stats/rank.ts.
  await expect(line).toContainText('Welcome back, Beat Detective');
  await expect(line).toContainText('Blitz');
  await expect(line).toContainText('4,820');
  await expect(line).toContainText('3h ago');
  await line.getByRole('link').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/songooner/stats');
});

test('the footer credits both data sources', async ({ page }) => {
  await page.setViewportSize(WIDTHS.desktop);
  await openHub(page);
  const footer = page.locator('footer');
  await expect(footer).toContainText('Deezer');
  await expect(footer).toContainText('ESPN');
  await expect(footer).toContainText('Rithul');
  await expect(footer.getByRole('link', { name: 'Songooner' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Highlight Scout' })).toBeVisible();
});

for (const [wname, vp] of Object.entries(WIDTHS)) {
  test(`no horizontal overflow · ${wname}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await openHub(page);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });
}

for (const theme of THEMES) {
  test(`all four themes · ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('sg:theme', t), theme);
    for (const [wname, vp] of [
      ['mobile', WIDTHS.mobile],
      ['desktop', WIDTHS.desktop],
    ] as const) {
      await page.setViewportSize(vp);
      await openHub(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expectNoHorizontalOverflow(page);

      // Nothing may vanish into the background in any theme.
      for (const el of [
        page.getByRole('heading', { level: 1 }),
        songooner(page).getByRole('heading', { level: 2 }),
        scout(page).getByRole('heading', { level: 2 }),
        songooner(page).getByRole('button', { name: 'Play Songooner now' }),
        scout(page).getByRole('button', { name: 'Play Highlight Scout now' }),
      ]) {
        await expect(el).toBeVisible();
      }
      await page.screenshot({ path: `${OUT}/hub-${theme}-${wname}.png`, fullPage: true });
    }
  });
}

test.describe('coarse pointer', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('every control on the hub clears 44 px', async ({ page }) => {
    await page.setViewportSize(WIDTHS.mobile);
    await openHub(page);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('main a, main button')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const before = getComputedStyle(el, '::before');
        const slop = before.content !== 'none' && before.position === 'absolute';
        const w = Math.max(r.width, slop ? parseFloat(before.width) || 0 : 0);
        const h = Math.max(r.height, slop ? parseFloat(before.height) || 0 : 0);
        if (w < 44 || h < 44) {
          out.push(`${Math.round(w)}x${Math.round(h)} ${el.tagName.toLowerCase()} "${el.textContent?.trim().slice(0, 24) ?? ''}"`);
        }
      }
      return out;
    });
    expect(small, 'hub controls under 44 px').toEqual([]);
  });
});

test('reduced motion stills every moving part', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(WIDTHS.mobile);
  await openHub(page);
  const running = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('main *'))
      .filter((el) => {
        const cs = getComputedStyle(el);
        return cs.animationName !== 'none' && cs.animationIterationCount !== '1';
      })
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 60)),
  );
  expect(running, 'animations still looping under prefers-reduced-motion').toEqual([]);
  await page.screenshot({ path: `${OUT}/hub-reduced-motion.png`, fullPage: false });
});
