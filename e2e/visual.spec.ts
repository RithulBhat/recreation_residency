import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'test-results/visual';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

const THEMES = ['midnight', 'vinyl', 'y2k', 'daylight'] as const;

/** Highlight Scout's home hero. Its `<h1>` is the route's outline, so it is asserted by name. */
const SCOUT_H1 = 'Name the player from a shadow.';

/**
 * A real `/scout/c/:code` payload, encoded the way `@/scout/challenge` encodes one: compact keys
 * inside `g` (`m` mode, `p` packs, `r` rounds), the seed in `s`, the sender in `b`, their score in
 * `c` — then base64url. Built here rather than imported so the e2e suite stays free of app imports;
 * if that encoding ever changes the challenge screen renders "broken link" and the assertions below
 * fail loudly instead of quietly testing an empty state.
 */
const SCOUT_CHALLENGE_CODE = Buffer.from(
  JSON.stringify({
    v: 1,
    s: 'e2e-visual-challenge',
    g: { m: 'silhouette', p: ['superstars'], r: 5 },
    b: 'Maya',
    c: 6420,
  }),
).toString('base64url');

/**
 * Every Highlight Scout route, so the narrow / single-h1 / duplicate-id sweeps below cover the
 * whole game and not just its front door. `/scout/results` bounces to the lobby without a finished
 * run and `/scout/play` renders its "no session" card — both are still one h1 and no overflow.
 */
const SCOUT_ROUTES = [
  '/scout',
  '/scout/setup',
  '/scout/play',
  '/scout/results',
  '/scout/daily',
  '/scout/stats',
  `/scout/c/${SCOUT_CHALLENGE_CODE}`,
  '/scout/c/not-a-real-code',
] as const;

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

/** One `<h1>` per route: the page outline should start with the screen's own title. */
async function expectSingleH1(page: Page) {
  const h1s = await page.locator('h1').evaluateAll((els) => els.map((el) => el.textContent?.trim().slice(0, 60) ?? ''));
  expect(h1s, 'exactly one h1').toHaveLength(1);
}

/** Gradients/masks referenced by id resolve to the wrong instance when ids collide. */
async function expectNoDuplicateIds(page: Page) {
  const dupes = await page.evaluate(() => {
    const seen = new Map<string, number>();
    for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`);
  });
  expect(dupes, 'duplicate element ids').toEqual([]);
}

/**
 * Coarse-pointer hit areas: the visual box or the `touch-hit-44` ::before slop must reach 44 px.
 * Hidden elements (display:none, zero-size) are skipped.
 */
async function expectTouchTargets(page: Page, selector: string) {
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  expect(coarse, 'test context must emulate a coarse pointer').toBe(true);
  const small = await page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const before = getComputedStyle(el, '::before');
      const slop = before.content !== 'none' && before.position === 'absolute';
      const w = Math.max(r.width, slop ? parseFloat(before.width) || 0 : 0);
      const h = Math.max(r.height, slop ? parseFloat(before.height) || 0 : 0);
      if (w < 44 || h < 44) {
        const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? '';
        out.push(`${Math.round(w)}×${Math.round(h)} ${el.tagName.toLowerCase()} "${label}"`);
      }
    }
    return out;
  }, selector);
  expect(small, `touch targets under 44px for ${selector}`).toEqual([]);
}

const NARROW = { width: 320, height: 640 } as const;
const NARROW_ROUTES = [
  '/',
  '/songooner',
  '/songooner/setup',
  '/songooner/packs',
  '/songooner/daily',
  '/songooner/stats',
  '/songooner/duel',
  ...SCOUT_ROUTES,
  '/price',
  '/price/setup',
  '/price/daily',
  '/price/party',
  '/hilo',
  '/hilo/setup',
  '/hilo/daily',
  '/hilo/party',
] as const;
const H1_ROUTES = [
  '/',
  '/songooner',
  '/songooner/packs',
  '/songooner/setup',
  '/songooner/daily',
  '/songooner/stats',
  '/songooner/c/invalid',
  ...SCOUT_ROUTES,
  '/price',
  '/price/setup',
  '/price/daily',
  '/price/party',
  '/hilo',
  '/hilo/setup',
  '/hilo/daily',
  '/hilo/party',
] as const;
const DUPLICATE_ID_ROUTES = [
  '/',
  '/songooner',
  '/songooner/stats',
  '/songooner/stats?demo=1',
  ...SCOUT_ROUTES,
  '/scout/stats?demo=1',
  '/price',
  '/price/setup',
  '/price/daily',
  '/price/party',
  '/hilo',
  '/hilo/setup',
  '/hilo/daily',
  '/hilo/party',
] as const;

/** Short, stable names — a challenge route carries a ~100-char code nobody wants in a filename. */
const slug = (route: string) =>
  route
    .replace(SCOUT_CHALLENGE_CODE, 'code')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '') || 'home';

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`home · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/songooner');
    await settle(page);
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/home-${name}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/home-${name}-fold.png`, fullPage: false });
  });

  test(`scout home · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/scout');
    await settle(page);
    await expect(page.getByRole('heading', { name: SCOUT_H1, level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/scout-home-${name}.png`, fullPage: false });
  });

  test(`residency hub · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/');
    await settle(page);
    await expect(page.getByRole('heading', { name: "Rithul's Recreation Residency", level: 1 })).toBeVisible();
    // Both games are on the hub and each card carries its pitch.
    const games = page.getByTestId('residency-games');
    await expect(games.getByRole('link')).toHaveCount(2);
    await expect(games.getByRole('heading', { level: 2 })).toHaveText(['Songooner', 'Highlight Scout']);
    await expect(page.getByText('Name the track from 0.1 seconds')).toBeVisible();
    await expect(page.getByText('Name the NFL player from a silhouette')).toBeVisible();
    await expect(page.getByText('New', { exact: true })).toBeVisible();
    // No game nav belongs to the hub.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Primary mobile' })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/residency-${name}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/residency-${name}-fold.png`, fullPage: false });
  });

  test(`residency hub · each card opens its game · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/');
    await settle(page);
    const games = page.getByTestId('residency-games');
    await games.getByRole('link', { name: /^Songooner/ }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/songooner');
    await expect(page.getByRole('heading', { level: 1, name: /Name the track from/ })).toBeVisible();
    // The brand reads "Residency / Songooner" and the residency half goes back to the hub.
    const header = page.locator('header');
    await expect(header.getByRole('link', { name: 'Songooner home' })).toBeVisible();
    await header.getByRole('link', { name: "Rithul's Recreation Residency" }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/');

    // The card's accessible name starts with its "New" badge, so match anywhere in it.
    await games.getByRole('link', { name: /Highlight Scout/ }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/scout');
    await expect(page.getByRole('heading', { name: SCOUT_H1, level: 1 })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Highlight Scout home' })).toBeVisible();
  });

  for (const theme of THEMES) {
    test(`home fold · ${theme} · ${name}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('sg:theme', t), theme);
      await page.setViewportSize(vp);
      await page.goto('/#/songooner');
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
  await page.goto('/#/songooner');
  await settle(page);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/home-reduced-motion.png`, fullPage: false });

  // The hero badge's pulsing dot is pure CSS (animate-ping) — it must be off, not merely shortened.
  const ping = page.locator('.animate-ping').first();
  await expect(ping).toBeAttached();
  expect(await ping.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  // …and so must every other decorative keyframe utility on the page.
  const stillMoving = await page.evaluate(() => {
    const classes = ['animate-ping', 'animate-shimmer', 'animate-pulse-soft', 'animate-float', 'animate-rise', 'animate-fade-in'];
    return Array.from(document.querySelectorAll<HTMLElement>(classes.map((c) => `.${c}`).join(',')))
      .filter((el) => getComputedStyle(el).animationName !== 'none')
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 80));
  });
  expect(stillMoving, 'decorative animations running under prefers-reduced-motion').toEqual([]);
});

for (const route of NARROW_ROUTES) {
  test(`320 px · ${slug(route)}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.setViewportSize(NARROW);
    await page.goto(`/#${route}`);
    await settle(page);
    const body = await page.evaluate(() => document.body.scrollWidth);
    expect(body, `body.scrollWidth on ${route}`).toBeLessThanOrEqual(320);
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/narrow-${slug(route)}.png`, fullPage: false });
    await page.screenshot({ path: `${OUT}/narrow-${slug(route)}-full.png`, fullPage: true });
  });
}

test('320 px · header folds volume + theme into one popover', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await page.goto('/#/');
  await settle(page);
  await expect(page.getByRole('button', { name: 'Volume', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Theme', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sound & theme' }).click();
  await expect(page.getByRole('slider', { name: 'Volume' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio')).toHaveCount(4);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/narrow-header-popover.png`, fullPage: false });
  await page.getByRole('radio', { name: 'Vinyl' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'vinyl');

  // From 360 px up the two dedicated buttons are back.
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.getByRole('button', { name: 'Volume', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Theme', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

for (const route of H1_ROUTES) {
  test(`exactly one h1 · ${slug(route)}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto(`/#${route}`);
    await settle(page);
    await expectSingleH1(page);
  });
}

for (const route of DUPLICATE_ID_ROUTES) {
  test(`no duplicate ids · ${slug(route)}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto(`/#${route}`);
    await settle(page);
    // Not a vacuous pass: every route paints at least one gradient def (the header brand mark),
    // and the Songooner pages repeat it in the footer logo and the hero record.
    expect(await page.locator('svg linearGradient').count()).toBeGreaterThanOrEqual(1);
    await expectNoDuplicateIds(page);
  });
}

test.describe('touch targets · coarse pointer', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('chips, tabs, segmented controls, pack play buttons, header + footer links', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.setViewportSize(VIEWPORTS.mobile);

    await page.goto('/#/songooner/packs');
    await settle(page);
    await expectTouchTargets(page, '[role="tab"], [aria-label="Tags"] button, [aria-label="Sort packs"] [role="radio"], button[aria-label^="Play "], header button');

    await page.goto('/#/songooner/setup');
    await settle(page);
    await expectTouchTargets(page, '[aria-label="Presets"] button, [aria-label="Clip mode"] [role="radio"], [aria-label="Categories"] button, header button');

    await page.goto('/#/songooner');
    await settle(page);
    await expectTouchTargets(page, 'footer nav a, header a, header button, [aria-label="Highlights"] ~ * button');

    // tablet width: the primary nav links are visible and must have 44 px hit areas too
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(300);
    await expectTouchTargets(page, 'nav[aria-label="Primary"] a, footer nav a, header button');
  });
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
