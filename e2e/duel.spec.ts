import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Online duel lobby, end to end against the real PeerJS cloud signalling server.
 *
 * The race test drives TWO browser contexts: page A hosts a room, page B joins with the code it
 * read out of the DOM, the host sends a real Deezer-backed pool, the guest readies up and the host
 * starts — both pages must land on `#/play`.
 */

const OUT = 'test-results/duel';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';
const MOBILE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;

// The public signalling server is occasionally slow; give the whole file a couple of retries.
test.describe.configure({ mode: 'serial', retries: 2 });

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    // Chip rows are deliberately swipeable, so anything clipped by a scroll container is fine.
    const inScroller = (el: HTMLElement): boolean => {
      let node: HTMLElement | null = el.parentElement;
      while (node && node !== document.body) {
        const ox = getComputedStyle(node).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
        node = node.parentElement;
      }
      return false;
    };
    return {
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      inner: window.innerWidth,
      widest: Array.from(document.querySelectorAll<HTMLElement>('main *'))
        .filter((el) => getComputedStyle(el).pointerEvents !== 'none')
        .filter((el) => !inScroller(el))
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 4)
        .map((el) => `${el.tagName}.${el.className}`.slice(0, 140)),
    };
  });
  expect(r.widest, 'elements past the right edge').toEqual([]);
  expect(r.doc, `documentElement.scrollWidth ${r.doc} > innerWidth ${r.inner}`).toBeLessThanOrEqual(r.inner);
  expect(r.body, `body.scrollWidth ${r.body} > innerWidth ${r.inner}`).toBeLessThanOrEqual(r.inner);
}

async function expectIconButtonsLabelled(page: Page): Promise<void> {
  const missing = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter((b) => b.textContent?.trim() === '' && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'))
      .map((b) => b.outerHTML.slice(0, 140)),
  );
  expect(missing, 'icon buttons without aria-label').toEqual([]);
}

/** Landing → identity → hosting, for one viewport. No opponent needed. */
for (const [name, vp] of Object.entries({ mobile: MOBILE, desktop: DESKTOP })) {
  test(`duel · lobby states · ${name}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => localStorage.clear());
    await page.setViewportSize(vp);
    await page.goto(`${BASE}/#/duel`);
    await settle(page);

    await expect(page.getByRole('heading', { name: 'Duel a friend' })).toBeVisible();
    await expect(page.getByTestId('duel-same-device')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How online duels work' })).toBeVisible();
    await page.screenshot({ path: `${OUT}/landing-${name}.png`, fullPage: true });
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);

    await page.getByTestId('duel-online').click();
    await expect(page.getByTestId('duel-name')).toBeVisible();
    // Identity gates both actions until there is a name to show the opponent.
    await expect(page.getByTestId('duel-create')).toBeDisabled();
    await page.getByTestId('duel-name').fill('Solo');
    await expect(page.getByTestId('duel-create')).toBeEnabled();
    await settle(page);
    await page.screenshot({ path: `${OUT}/identity-${name}.png`, fullPage: true });
    await expectNoHorizontalOverflow(page);

    await page.getByTestId('duel-create').click();
    await expect(page.getByTestId('room-code')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('duel-status').first()).toContainText('Waiting for opponent', { timeout: 45_000 });
    const code = (await page.getByTestId('room-code').getAttribute('data-code')) ?? '';
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    await expect(page.getByTestId('duel-send-config')).toBeDisabled();
    await settle(page);
    await page.screenshot({ path: `${OUT}/host-waiting-${name}.png`, fullPage: true });
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);

    // Leaving drops the room and returns to the two big choices.
    await page.getByTestId('duel-leave').click();
    await expect(page.getByTestId('duel-same-device')).toBeVisible();
  });
}

test('duel · two browsers race each other', async ({ browser }) => {
  test.setTimeout(240_000);
  const hostCtx = await browser.newContext({ viewport: DESKTOP });
  const guestCtx = await browser.newContext({ viewport: MOBILE });
  const a = await hostCtx.newPage();
  const b = await guestCtx.newPage();
  const errors: string[] = [];
  for (const [tag, p] of [['host', a], ['guest', b]] as const) {
    p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  }

  try {
    await a.addInitScript(() => localStorage.clear());
    await b.addInitScript(() => localStorage.clear());

    /* ---- host opens a room ---- */
    await a.goto(`${BASE}/#/duel`);
    await a.getByTestId('duel-online').click();
    await a.getByTestId('duel-name').fill('Ace');
    await a.getByTestId('duel-create').click();
    await expect(a.getByTestId('room-code')).toBeVisible({ timeout: 45_000 });
    await expect(a.getByTestId('duel-status').first()).toContainText('Waiting for opponent', { timeout: 45_000 });
    const code = (await a.getByTestId('room-code').getAttribute('data-code')) ?? '';
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    /* ---- guest joins through a share link ---- */
    await b.goto(`${BASE}/#/duel?join=${code}`);
    await expect(b.getByTestId('duel-code-input')).toHaveValue(code);
    await b.getByTestId('duel-name').fill('Bee');
    await b.getByTestId('duel-join').click();

    /* ---- both sides connected ---- */
    await expect(a.getByTestId('duel-status').first()).toContainText('Connected', { timeout: 60_000 });
    await expect(b.getByTestId('duel-status').first()).toContainText('Connected', { timeout: 60_000 });
    await expect(a.getByTestId('duel-opponent')).toContainText('Bee');
    await expect(b.getByTestId('duel-opponent')).toContainText('Ace');
    await settle(a);
    await settle(b);
    await a.screenshot({ path: `${OUT}/host-connected-desktop.png`, fullPage: true });
    await b.screenshot({ path: `${OUT}/guest-joined-mobile.png`, fullPage: true });
    await expectNoHorizontalOverflow(a);
    await expectNoHorizontalOverflow(b);
    await expectIconButtonsLabelled(a);
    await expectIconButtonsLabelled(b);

    /* ---- host picks a small pack + 5 rounds and sends the pool ---- */
    const popHits = a.getByRole('button', { name: /Pop Hits/ }).first();
    await expect(popHits).toHaveAttribute('aria-pressed', 'true');
    await a.getByRole('radiogroup', { name: 'Rounds' }).getByRole('radio', { name: '5', exact: true }).click();
    await expect(a.getByTestId('duel-summary')).toContainText('5 rounds');

    await a.getByTestId('duel-send-config').click();
    await expect(a.getByTestId('duel-await-ready')).toBeVisible({ timeout: 90_000 });
    await expect(a.getByTestId('duel-await-ready')).toContainText('Bee');

    /* ---- guest sees the setup and readies ---- */
    await expect(b.getByTestId('duel-summary')).toBeVisible({ timeout: 30_000 });
    await expect(b.getByTestId('duel-summary')).toContainText('Pop Hits');
    await expect(b.getByTestId('duel-summary')).toContainText('5 rounds');
    await b.getByTestId('duel-ready').click();
    await expect(b.getByTestId('duel-guest-ready')).toBeVisible();

    /* ---- host starts; both count down and hand off to /play ---- */
    await expect(a.getByTestId('duel-start')).toBeVisible({ timeout: 30_000 });
    await a.getByTestId('duel-start').click();

    await expect(a.getByTestId('duel-countdown')).toBeVisible({ timeout: 10_000 });
    await expect(b.getByTestId('duel-countdown')).toBeVisible({ timeout: 10_000 });
    await a.screenshot({ path: `${OUT}/countdown-desktop.png` });
    await b.screenshot({ path: `${OUT}/countdown-mobile.png` });

    await expect(a).toHaveURL(/#\/play/, { timeout: 20_000 });
    await expect(b).toHaveURL(/#\/play/, { timeout: 20_000 });
    expect(errors, 'uncaught page errors').toEqual([]);
  } finally {
    await hostCtx.close();
    await guestCtx.close();
  }
});
